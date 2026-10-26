import {
    type AccentPreference,
    DEFAULT_ACCENT,
    DEFAULT_GLASS_INTENSITY,
    type GlassIntensity,
    normalizeAccent,
    normalizeGlassIntensity,
    type PreferencesDto,
    type UserDto,
} from "@shared/contracts.ts";
import type { EngineId } from "@shared/engines.ts";
import {
    normalizeWallpaperPresentations,
    type WallpaperPresentation,
    wallpaperPresentation,
} from "@shared/wallpaper-presentation.ts";
import {
    parseWallpaperSource,
    type WallpaperComposition,
} from "@shared/wallpaper.ts";
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
    cleanupLegacyNoteDrafts,
    hasUnsyncedDocumentDrafts,
} from "../features/documents/local-drafts.ts";
import {
    createDocumentEventSubscriptions,
    type DocumentEventSubscriptions,
} from "../features/documents/document-event-subscriptions.ts";
import {
    applyWallpaperAccent,
    useWallpaperAccent,
} from "../components/wallpaper/wallpaper-accent-source.ts";
import { api, ApiError, json } from "../lib/api.ts";
import { deleteLocal, getLocal, setLocal } from "../lib/local.ts";
import { syncThemeColor } from "../pwa/theme-color.ts";
import {
    appearanceStorageKey,
    type AppearanceSyncQueue,
    queueAppearanceSync,
} from "./appearance-sync.ts";

export type Appearance = {
    theme: "system" | "light" | "dark";
    /** 跟随壁纸取色（`wallpaper`）或手选的预设覆盖。 */
    accent: AccentPreference;
    shape: "rounded" | "pill";
    glassIntensity: GlassIntensity;
    engine: EngineId;
    target: "current" | "new_tab";
    wallpaper: string;
    wallpaperPresentations: Record<string, WallpaperPresentation>;
    showAppLabels: boolean;
    /** 登录用户的跨设备偏好：首页是否显示应用库。 */
    showHomeApps: boolean;
    /** 登录用户的跨设备偏好：首页应用网格是否绘制底板。 */
    showHomeAppPlate: boolean;
    /** 首页“静”状态：搜索框上方的日期、时间与登录用户的“继续”行。 */
    showHomeDate: boolean;
    showHomeTime: boolean;
    showHomeContinue: boolean;
};

const initial: Appearance = {
    theme: "system",
    accent: DEFAULT_ACCENT,
    shape: "rounded",
    glassIntensity: DEFAULT_GLASS_INTENSITY,
    engine: "bing",
    target: "current",
    wallpaper: "",
    wallpaperPresentations: {},
    showAppLabels: true,
    showHomeApps: true,
    showHomeAppPlate: true,
    showHomeDate: true,
    showHomeTime: false,
    showHomeContinue: true,
};

/** 旧设备缓存和旧 API 响应缺少字段时，仍生成有效的背景参数。 */
export function normalizeAppearance(raw: unknown): Appearance {
    const saved = raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : {};
    const result = { ...initial };
    result.accent = normalizeAccent(saved.accent);
    if (
        saved.theme === "system" || saved.theme === "light" ||
        saved.theme === "dark"
    ) result.theme = saved.theme;
    if (saved.shape === "rounded" || saved.shape === "pill") {
        result.shape = saved.shape;
    }
    result.glassIntensity = normalizeGlassIntensity(saved.glassIntensity);
    if (
        saved.engine === "bing" || saved.engine === "google" ||
        saved.engine === "baidu" || saved.engine === "duckduckgo"
    ) result.engine = saved.engine;
    if (saved.target === "current" || saved.target === "new_tab") {
        result.target = saved.target;
    }
    const source = typeof saved.wallpaper === "string" ? saved.wallpaper : "";
    if (source.startsWith("data:")) {
        const comma = source.indexOf(",");
        const encodedLength = source.length - comma - 1;
        const padding = source.endsWith("==")
            ? 2
            : source.endsWith("=")
            ? 1
            : 0;
        if (
            /^data:image\/(png|jpeg|webp|avif);base64,/.test(source) &&
            encodedLength % 4 === 0 &&
            encodedLength / 4 * 3 - padding <= 5 * 1024 * 1024
        ) {
            result.wallpaper = source;
        }
    } else {
        result.wallpaper = parseWallpaperSource(source)?.value ?? "";
    }
    result.wallpaperPresentations = normalizeWallpaperPresentations(
        saved.wallpaperPresentations,
        {
            currentSource: result.wallpaper,
            legacy: saved,
            legacyCompositions: saved.wallpaperCompositions as
                | Record<string, WallpaperComposition>
                | undefined,
        },
    );
    if (typeof saved.showAppLabels === "boolean") {
        result.showAppLabels = saved.showAppLabels;
    }
    for (
        const key of [
            "showHomeApps",
            "showHomeAppPlate",
            "showHomeDate",
            "showHomeTime",
            "showHomeContinue",
        ] as const
    ) {
        const value = saved[key];
        if (typeof value === "boolean") result[key] = value;
    }
    return result;
}
type AuthSession = {
    userId: string | null;
    isCurrent: () => boolean;
    documentEvents: DocumentEventSubscriptions;
};

type State = {
    user: UserDto | null;
    authSession: AuthSession;
    ready: boolean;
    syncFailed: boolean;
    connectionError: boolean;
    retryConnection: () => Promise<void>;
    appearance: Appearance;
    setAppearance: (
        next: Partial<Appearance>,
        options?: { sync?: boolean },
    ) => Promise<void>;
    settleAppearanceSync: () => Promise<void>;
    login: (user: UserDto) => void;
    /** 登出：有未同步草稿时返回 false 并由调用方弹确认（V-003）。 */
    logout: (options?: { force?: boolean }) => Promise<boolean>;
};
const Context = createContext<State | null>(null);

export function useAppState() {
    const state = useContext(Context);
    if (!state) throw new Error("AppState required");
    return state;
}

export function AppState({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserDto | null>(null);
    const [ready, setReady] = useState(false);
    const [appearance, setValue] = useState<Appearance>(initial);
    const [appearanceOwner, setAppearanceOwner] = useState<string | null>(null);
    const [syncFailed, setSyncFailed] = useState(false);
    const [authConnectionError, setAuthConnectionError] = useState(false);
    const userRef = useRef<UserDto | null>(null);
    const sessionRef = useRef<AuthSession | null>(null);
    if (sessionRef.current === null) {
        const session: AuthSession = {
            userId: null,
            isCurrent: () => sessionRef.current === session,
            documentEvents: createDocumentEventSubscriptions(),
        };
        sessionRef.current = session;
    }
    // Object identity is the auth epoch, renewed even when the same account logs in again.
    const updateUser = useCallback((next: UserDto | null, renew = false) => {
        if (userRef.current?.id !== next?.id) {
            setAppearanceOwner(null);
            setValue(initial);
        }
        if (renew || userRef.current?.id !== next?.id) {
            sessionRef.current!.documentEvents.dispose();
            const session: AuthSession = {
                userId: next?.id ?? null,
                isCurrent: () => sessionRef.current === session,
                documentEvents: createDocumentEventSubscriptions(),
            };
            sessionRef.current = session;
        }
        userRef.current = next;
        setUser(next);
    }, []);
    useEffect(() => {
        void cleanupLegacyNoteDrafts().catch(() => undefined);
        return () => sessionRef.current!.documentEvents.dispose();
    }, []);
    const sync = useRef<AppearanceSyncQueue>({
        owner: null,
        tail: Promise.resolve(),
        pending: {},
        reconciled: {},
    });
    const appearanceRevision = useRef(0);
    useEffect(() => {
        // 旧缓存未关联用户，不能作为匿名或账号偏好继续使用。
        try {
            localStorage.removeItem("visitor_appearance");
        } catch {
            // 浏览器可能禁用 localStorage。
        }
        void deleteLocal("visitor_appearance").catch(() => {});
    }, []);
    const retryAppearanceLoad = useRef<() => Promise<void>>(() =>
        Promise.resolve()
    );
    const sendPendingAppearance = useCallback((
        queue: AppearanceSyncQueue,
        owner: string,
    ) => queueAppearanceSync(
        queue,
        owner,
        () => sync.current === queue && userRef.current?.id === owner,
        (patch) => api("/api/preferences", json("PATCH", patch)),
        () => {
            setSyncFailed(false);
        },
        (error) => {
            if (!(error instanceof ApiError && error.code === 401)) {
                setSyncFailed(true);
            }
        },
    ), []);

    const checkAuth = useCallback(async () => {
        const session = sessionRef.current!;
        try {
            const { user } = await api<{ user: UserDto }>("/api/auth/me", {
                signal: AbortSignal.timeout(5000),
            });
            if (sessionRef.current !== session) return;
            const next = handleAuthCheckResult(
                { user: userRef.current, connectionError: false },
                { type: "success", user },
            );
            updateUser(next.user);
            setAuthConnectionError(next.connectionError);
        } catch (error) {
            if (sessionRef.current !== session) return;
            const next = handleAuthCheckResult(
                { user: userRef.current, connectionError: true },
                { type: "error", error },
            );
            updateUser(next.user);
            setAuthConnectionError(next.connectionError);
        } finally {
            setReady(true);
        }
    }, [updateUser]);

    const retryFailedAppearanceSync = useCallback(async () => {
        const queue = sync.current;
        const owner = queue.owner;
        if (!owner || userRef.current?.id !== owner) return;
        await sendPendingAppearance(queue, owner).catch(() => {});
        if (sync.current !== queue || userRef.current?.id !== owner) return;
        try {
            await retryAppearanceLoad.current();
        } catch (error) {
            if (
                sync.current === queue && userRef.current?.id === owner &&
                !(error instanceof ApiError && error.code === 401)
            ) {
                setSyncFailed(true);
            }
        }
    }, [sendPendingAppearance]);
    const retryConnection = useCallback(async () => {
        await checkAuth();
        await retryFailedAppearanceSync();
    }, [checkAuth, retryFailedAppearanceSync]);

    useEffect(() => {
        void checkAuth();
    }, [checkAuth]);

    // 设备缓存按 owner 隔离；账号共享偏好始终以云端为准。
    useEffect(() => {
        if (!ready) return;
        const userId = user?.id ?? null;
        const key = appearanceStorageKey(userId);
        let alive = true;
        setAppearanceOwner(null);
        setValue(initial);
        const active = () => alive && (userRef.current?.id ?? null) === userId;
        const revision = appearanceRevision.current;
        sync.current = {
            owner: userId,
            tail: Promise.resolve(),
            pending: {},
            reconciled: {},
        };
        setSyncFailed(false);
        async function loadCloudAppearance() {
            if (!userId) return;
            const prefs = await api<PreferencesDto>("/api/preferences");
            if (!active()) return;
            if (Object.keys(sync.current.pending).length === 0) {
                setSyncFailed(false);
            }
            if (appearanceRevision.current !== revision) return;
            setValue((prev) =>
                normalizeAppearance({
                    ...prev,
                    engine: prefs.defaultEngine,
                    theme: prefs.theme,
                    accent: normalizeAccent(prefs.accent),
                    shape: prefs.searchShape,
                    glassIntensity: prefs.glassIntensity,
                    target: prefs.searchTarget === "new"
                        ? "new_tab"
                        : "current",
                    wallpaper: prefs.backgroundImage ?? "",
                    wallpaperPresentations: prefs.wallpaperPresentations,
                    showAppLabels: prefs.showAppLabels,
                    showHomeApps: prefs.showHomeApps,
                    showHomeAppPlate: prefs.showHomeAppPlate,
                    showHomeDate: prefs.showHomeDate,
                    showHomeTime: prefs.showHomeTime,
                    showHomeContinue: prefs.showHomeContinue,
                })
            );
        }
        retryAppearanceLoad.current = loadCloudAppearance;
        async function loadAppearance() {
            const saved = await getLocal<unknown>(key)
                .catch(() => undefined);
            if (!active()) return;
            if (appearanceRevision.current === revision) {
                setValue(normalizeAppearance(saved));
            }
            setAppearanceOwner(key);
            await loadCloudAppearance();
        }
        void loadAppearance().catch((err) => {
            if (active() && !(err instanceof ApiError && err.code === 401)) {
                setSyncFailed(true);
            }
        });
        return () => {
            alive = false;
            if (retryAppearanceLoad.current === loadCloudAppearance) {
                retryAppearanceLoad.current = () => Promise.resolve();
            }
        };
    }, [ready, user?.id]);

    useEffect(() => {
        const key = appearanceStorageKey(user?.id ?? null);
        if (!ready || appearanceOwner !== key) return;
        void setLocal(key, appearance).catch(() => {});
    }, [ready, user?.id, appearanceOwner, appearance]);

    useEffect(() => {
        const expired = () => {
            if (userRef.current) setValue(initial);
            setAppearanceOwner(null);
            updateUser(null);
            setSyncFailed(false);
            setAuthConnectionError(false);
        };
        globalThis.addEventListener("searcher:auth-expired", expired);
        return () =>
            globalThis.removeEventListener("searcher:auth-expired", expired);
    }, [updateUser]);

    useEffect(() => {
        const media = matchMedia("(prefers-color-scheme: dark)");
        const apply = () => {
            const theme = appearance.theme === "system"
                ? (media.matches ? "dark" : "light")
                : appearance.theme;
            const root = document.documentElement;
            root.dataset.theme = theme;
            syncThemeColor(root);
        };
        apply();
        media.addEventListener("change", apply);
        return () => media.removeEventListener("change", apply);
    }, [appearance.theme]);

    // Derived even under a manual accent so "跟随壁纸" previews the wallpaper colour.
    const wallpaperAccent = useWallpaperAccent(
        appearance.wallpaper,
        wallpaperPresentation(
            appearance.wallpaper,
            appearance.wallpaperPresentations,
        ).composition,
    );
    useEffect(() => {
        const root = document.documentElement;
        root.dataset.accent = appearance.accent;
        root.dataset.shape = appearance.shape;
        root.dataset.glass = appearance.glassIntensity;
    }, [appearance.accent, appearance.shape, appearance.glassIntensity]);
    useEffect(() => {
        applyWallpaperAccent(document.documentElement, wallpaperAccent);
    }, [wallpaperAccent]);

    const setAppearance = (
        next: Partial<Appearance>,
        options?: { sync?: boolean },
    ): Promise<void> => {
        appearanceRevision.current++;
        setValue((current) => normalizeAppearance({ ...current, ...next }));
        if (user) {
            const updates: Record<string, unknown> = {};
            if (next.theme !== undefined) updates.theme = next.theme;
            if (next.accent !== undefined) updates.accent = next.accent;
            if (next.shape !== undefined) updates.searchShape = next.shape;
            if (next.glassIntensity !== undefined) {
                updates.glassIntensity = next.glassIntensity;
            }
            if (next.engine !== undefined) updates.defaultEngine = next.engine;
            if (next.target !== undefined) {
                updates.searchTarget = next.target === "new_tab"
                    ? "new"
                    : "same";
            }
            if (next.wallpaper !== undefined) {
                updates.backgroundImage = next.wallpaper || null;
            }
            if (next.wallpaperPresentations !== undefined) {
                updates.wallpaperPresentations = next.wallpaperPresentations;
            }
            if (next.showAppLabels !== undefined) {
                updates.showAppLabels = next.showAppLabels;
            }
            for (
                const key of [
                    "showHomeApps",
                    "showHomeAppPlate",
                    "showHomeDate",
                    "showHomeTime",
                    "showHomeContinue",
                ] as const
            ) {
                if (next[key] !== undefined) updates[key] = next[key];
            }
            if (Object.keys(updates).length === 0) return Promise.resolve();
            const owner = user.id;
            const queue = sync.current;
            if (queue.owner !== owner) return Promise.resolve();
            if (options?.sync === false) {
                Object.assign(queue.reconciled, updates);
                for (const key of Object.keys(updates)) {
                    delete queue.pending[key];
                }
                if (Object.keys(queue.pending).length === 0) {
                    setSyncFailed(false);
                }
                return Promise.resolve();
            }
            for (const key of Object.keys(updates)) {
                delete queue.reconciled[key];
            }
            Object.assign(queue.pending, updates);
            return sendPendingAppearance(queue, owner);
        }
        return Promise.resolve();
    };

    const logout = async (options?: { force?: boolean }) => {
        const session = sessionRef.current!;
        if (!session.userId) return true;
        if (!options?.force) {
            try {
                const hasDrafts = await hasUnsyncedDocumentDrafts(
                    session.userId,
                    session.isCurrent,
                );
                if (!session.isCurrent()) return true;
                if (hasDrafts) return false;
            } catch {
                if (!session.isCurrent()) return true;
                throw new Error(
                    "未能检查本地笔记草稿，尚未退出登录；请重试退出。",
                );
            }
        }
        if (!session.isCurrent()) return true;
        await api("/api/auth/logout", { method: "POST" });
        if (!session.isCurrent()) return true;
        updateUser(null);
        setAppearanceOwner(null);
        setValue(initial);
        return true;
    };

    return (
        <Context.Provider
            value={{
                user,
                authSession: sessionRef.current!,
                ready,
                syncFailed,
                connectionError: authConnectionError,
                retryConnection,
                appearance,
                setAppearance,
                settleAppearanceSync: () => sync.current.tail,
                login: (user) => updateUser(user, true),
                logout,
            }}
        >
            {children}
        </Context.Provider>
    );
}

export function errorMessage(error: unknown) {
    return error instanceof ApiError
        ? error.message
        : "连接失败，请检查网络后重试";
}

export function handleAuthCheckResult(
    previous: { user: UserDto | null; connectionError: boolean },
    outcome:
        | { type: "success"; user: UserDto }
        | { type: "error"; error: unknown },
): { user: UserDto | null; connectionError: boolean } {
    if (outcome.type === "success") {
        return { user: outcome.user, connectionError: false };
    }
    const error = outcome.error;
    if (error instanceof ApiError && error.code === 401) {
        return { user: null, connectionError: false };
    }
    // Network failure, 5xx, timeout: flag connectionError, do NOT wipe user if already logged in
    return { user: previous.user, connectionError: true };
}
