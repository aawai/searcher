import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    DEFAULT_DOCK_LAYOUT,
    DEFAULT_DOCK_PREFERENCES,
    DOCK_SYSTEM_IDS,
    type DockBallSide,
    type DockEdge,
    type DockLayout,
    type DockMode,
    type DockPreferences,
    type DockSystemId,
    isValidDockSystemId,
    normalizeDockLayout,
    normalizeDockPreferences,
} from "@shared/dock.ts";
import type { PreferencesDto } from "@shared/contracts.ts";
import { useAppState } from "../../app/state.tsx";
import type { ExtendedWebApp } from "../app-library/library-types.ts";
import { api, json } from "../../lib/api.ts";
import { getLocal, setLocal } from "../../lib/local.ts";

export type {
    DockBallSide,
    DockEdge,
    DockLayout,
    DockMode,
    DockPreferences,
    DockSystemId,
    ExtendedWebApp,
};
export { DOCK_SYSTEM_IDS };

export interface DockContextValue {
    preferences: DockPreferences;
    apps: ExtendedWebApp[];
    ready: boolean;
    error: string;
    layout: DockLayout;
    setLayout: (patch: Partial<DockLayout>) => void;
    setSystemOrder: (ids: DockSystemId[]) => Promise<void>;
    setSystemVisible: (id: DockSystemId, visible: boolean) => Promise<void>;
    setAppOrder: (ids: string[]) => Promise<void>;
    setPinned: (id: string, pinned: boolean) => Promise<void>;
    refreshApps: () => Promise<void>;
    suppressed: boolean;
    setSuppressed: (value: boolean) => void;
}

const DockContext = createContext<DockContextValue | null>(null);

export function useDock(): DockContextValue {
    const ctx = useContext(DockContext);
    if (!ctx) {
        throw new Error("useDock must be used within a DockProvider");
    }
    return ctx;
}

export interface DockSessionProps {
    userId: string | null;
    children: ReactNode;
}

export function DockProviderSession({ userId, children }: DockSessionProps) {
    const ownerRef = useRef<string | null>(userId);
    ownerRef.current = userId;
    const sessionRef = useRef(0);
    const isActive = (s: number) =>
        sessionRef.current === s && ownerRef.current === userId;

    const [preferences, setPreferences] = useState<DockPreferences>({
        ...DEFAULT_DOCK_PREFERENCES,
    });
    const [apps, setApps] = useState<ExtendedWebApp[]>([]);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState("");
    const [layout, setLayoutState] = useState<DockLayout>({
        ...DEFAULT_DOCK_LAYOUT,
    });
    const [suppressed, setSuppressed] = useState(false);

    const layoutLoadedRef = useRef(false);
    const layoutRevisionRef = useRef(0);
    const layoutQueueRef = useRef<Promise<void>>(Promise.resolve());

    const confirmedPreferencesRef = useRef<DockPreferences>({
        ...DEFAULT_DOCK_PREFERENCES,
    });
    const latestPreferencesRef = useRef<DockPreferences>(preferences);

    const mutationRevisionRef = useRef(0);
    const pendingMutationsRef = useRef(0);
    const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
    const refreshEpochRef = useRef(0);

    const layoutKey = `dock_layout:${userId ?? "guest"}`;

    // 1. Initial layout load per session with revision guard against early setLayout
    useEffect(() => {
        const currentSession = ++sessionRef.current;
        const active = () =>
            sessionRef.current === currentSession &&
            ownerRef.current === userId;
        setPreferences({ ...DEFAULT_DOCK_PREFERENCES });
        setApps([]);
        setReady(!userId);
        setError("");
        setLayoutState({ ...DEFAULT_DOCK_LAYOUT });
        setSuppressed(false);
        layoutLoadedRef.current = false;
        confirmedPreferencesRef.current = { ...DEFAULT_DOCK_PREFERENCES };
        latestPreferencesRef.current = { ...DEFAULT_DOCK_PREFERENCES };
        mutationRevisionRef.current = 0;
        pendingMutationsRef.current = 0;
        syncQueueRef.current = Promise.resolve();
        refreshEpochRef.current = 0;
        const initialRevision = ++layoutRevisionRef.current;
        getLocal<DockLayout>(layoutKey)
            .then((saved) => {
                if (!active()) return;
                if (layoutRevisionRef.current === initialRevision && saved) {
                    setLayoutState(normalizeDockLayout(saved));
                }
                layoutLoadedRef.current = true;
            })
            .catch((err) => {
                if (!active()) return;
                layoutLoadedRef.current = true;
                setError(
                    err instanceof Error ? err.message : "加载本地布局失败",
                );
            });
        return () => {
            sessionRef.current++;
        };
    }, [userId, layoutKey]);
    // 2. Persist layout changes via sequential queue
    useEffect(() => {
        if (!layoutLoadedRef.current) return;
        const currentLayout = layout;
        const currentSession = sessionRef.current;
        layoutQueueRef.current = layoutQueueRef.current.then(async () => {
            if (!isActive(currentSession)) return;
            try {
                await setLocal(layoutKey, currentLayout);
            } catch (err) {
                if (isActive(currentSession)) {
                    setError(
                        err instanceof Error ? err.message : "保存本地布局失败",
                    );
                }
            }
        });
    }, [layout, layoutKey]);

    // 3. Refresh apps and preferences with revision and pending mutation barrier
    const refreshApps = useCallback(async (): Promise<void> => {
        if (!userId) {
            setReady(true);
            return;
        }

        const currentSession = sessionRef.current;
        const epoch = ++refreshEpochRef.current;
        const startRevision = mutationRevisionRef.current;

        if (!isActive(currentSession)) return;
        try {
            const [prefs, webappsList] = await Promise.all([
                api<PreferencesDto>("/api/preferences"),
                api<ExtendedWebApp[]>("/api/webapps"),
            ]);
            if (
                !isActive(currentSession) || refreshEpochRef.current !== epoch
            ) {
                return;
            }

            // Only apply server dock preferences if no mutations occurred while or before GET was in flight
            if (
                mutationRevisionRef.current === startRevision &&
                pendingMutationsRef.current === 0 &&
                prefs?.dock
            ) {
                const normalized = normalizeDockPreferences(prefs.dock);
                confirmedPreferencesRef.current = normalized;
                latestPreferencesRef.current = normalized;
                setPreferences(normalized);
            }
            if (Array.isArray(webappsList)) {
                setApps(webappsList);
            }
            setError("");
        } catch (err) {
            if (
                !isActive(currentSession) || refreshEpochRef.current !== epoch
            ) {
                return;
            }
            try {
                const cached = await getLocal<{ apps: ExtendedWebApp[] }>(
                    `webapps:${userId}`,
                );
                if (
                    !isActive(currentSession) ||
                    refreshEpochRef.current !== epoch
                ) {
                    return;
                }
                if (cached?.apps) {
                    setApps(cached.apps);
                }
            } catch {
                // Ignore cache fallback read errors
            }
            setError(err instanceof Error ? err.message : "加载应用失败");
        } finally {
            if (isActive(currentSession) && refreshEpochRef.current === epoch) {
                setReady(true);
            }
        }
    }, [userId]);

    // 4. Initial load of preferences and webapps
    useEffect(() => {
        void refreshApps();
    }, [refreshApps]);

    // 5. Window focus triggers refresh
    useEffect(() => {
        const onFocus = () => {
            if (userId && ownerRef.current === userId) {
                void refreshApps();
            }
        };
        globalThis.addEventListener("focus", onFocus);
        return () => {
            globalThis.removeEventListener("focus", onFocus);
        };
    }, [userId, refreshApps]);

    // 6. Sequential preferences mutations with barrier, synchronous ref chaining and rollback
    const mutatePreferences = useCallback(
        async (
            updater: (prev: DockPreferences) => DockPreferences,
        ): Promise<void> => {
            if (!userId) {
                const next = updater(latestPreferencesRef.current);
                latestPreferencesRef.current = next;
                setPreferences(next);
                return;
            }

            const revision = ++mutationRevisionRef.current;
            pendingMutationsRef.current++;
            const prev = latestPreferencesRef.current;
            const next = updater(prev);
            // Synchronously update latestPreferencesRef so consecutive synchronous calls chain accurately
            latestPreferencesRef.current = next;
            setPreferences(next);
            setError("");

            const currentSession = sessionRef.current;
            const task = async () => {
                if (!isActive(currentSession)) return;
                try {
                    const res = await api<PreferencesDto>(
                        "/api/preferences",
                        json("PATCH", {
                            dock: next,
                        }),
                    );
                    if (!isActive(currentSession)) return;
                    if (res?.dock) {
                        const normalized = normalizeDockPreferences(res.dock);
                        confirmedPreferencesRef.current = normalized;
                        if (mutationRevisionRef.current === revision) {
                            latestPreferencesRef.current = normalized;
                            setPreferences(normalized);
                        }
                    }
                } catch (err) {
                    if (!isActive(currentSession)) return;
                    const message = err instanceof Error
                        ? err.message
                        : "保存任务栏偏好失败";
                    setError(message);
                    if (mutationRevisionRef.current === revision) {
                        latestPreferencesRef.current =
                            confirmedPreferencesRef.current;
                        setPreferences(confirmedPreferencesRef.current);
                    }
                } finally {
                    if (isActive(currentSession)) {
                        pendingMutationsRef.current--;
                    }
                }
            };

            syncQueueRef.current = syncQueueRef.current.then(task, task);
            await syncQueueRef.current;
        },
        [userId],
    );

    const setPinned = useCallback(
        async (id: string, pinned: boolean): Promise<void> => {
            try {
                await mutatePreferences((prev) => {
                    const appIds = pinned
                        ? prev.appIds.includes(id)
                            ? prev.appIds
                            : [...prev.appIds, id]
                        : prev.appIds.filter((item) => item !== id);
                    return {
                        ...prev,
                        appIds,
                    };
                });
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "更新固定应用失败",
                );
            }
        },
        [mutatePreferences],
    );

    const setSystemOrder = useCallback(
        async (ids: DockSystemId[]): Promise<void> => {
            if (
                !Array.isArray(ids) ||
                ids.length !== DOCK_SYSTEM_IDS.length ||
                new Set(ids).size !== DOCK_SYSTEM_IDS.length ||
                !ids.every((id) => isValidDockSystemId(id))
            ) {
                setError("系统入口顺序无效");
                return;
            }
            try {
                await mutatePreferences((prev) => ({
                    ...prev,
                    systemOrder: [...ids],
                }));
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "更新入口顺序失败",
                );
            }
        },
        [mutatePreferences],
    );

    const setSystemVisible = useCallback(
        async (id: DockSystemId, visible: boolean): Promise<void> => {
            if (!isValidDockSystemId(id)) {
                setError("系统入口无效");
                return;
            }
            try {
                await mutatePreferences((prev) => {
                    const hiddenSystemIds = visible
                        ? prev.hiddenSystemIds.filter((item) => item !== id)
                        : prev.hiddenSystemIds.includes(id)
                        ? prev.hiddenSystemIds
                        : [...prev.hiddenSystemIds, id];
                    return {
                        ...prev,
                        hiddenSystemIds,
                    };
                });
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "更新系统入口显示状态失败",
                );
            }
        },
        [mutatePreferences],
    );

    const setAppOrder = useCallback(
        async (ids: string[]): Promise<void> => {
            if (!Array.isArray(ids)) {
                setError("应用顺序无效");
                return;
            }
            const seen = new Set<string>();
            const validIds: string[] = [];
            for (const id of ids) {
                if (typeof id === "string" && id.trim() && !seen.has(id)) {
                    seen.add(id);
                    validIds.push(id);
                }
            }
            try {
                await mutatePreferences((prev) => ({
                    ...prev,
                    appIds: validIds,
                }));
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "更新应用顺序失败",
                );
            }
        },
        [mutatePreferences],
    );

    const setLayout = useCallback((patch: Partial<DockLayout>) => {
        layoutRevisionRef.current++;
        layoutLoadedRef.current = true;
        setLayoutState((prev) => normalizeDockLayout({ ...prev, ...patch }));
    }, []);

    const value: DockContextValue = {
        preferences,
        apps,
        ready,
        error,
        layout,
        setLayout,
        setSystemOrder,
        setSystemVisible,
        setAppOrder,
        setPinned,
        refreshApps,
        suppressed,
        setSuppressed,
    };

    return <DockContext.Provider value={value}>{children}
    </DockContext.Provider>;
}

export interface DockProviderProps {
    children: ReactNode;
}

export function DockProvider({ children }: DockProviderProps) {
    const { user } = useAppState();
    return (
        <DockProviderSession userId={user?.id ?? null}>
            {children}
        </DockProviderSession>
    );
}
