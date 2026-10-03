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
    type AccentId,
    AMBIENT_MOTION_MODES,
    type AmbientMotionMode,
    DEFAULT_AMBIENT_MOTION_MODE,
    DEFAULT_AMBIENT_MOTION_STRENGTH,
    DEFAULT_WALLPAPER_GLOW_STRENGTH,
    DEFAULT_WALLPAPER_MASK,
    normalizeAccent,
    normalizeStylePreset,
    type PreferencesDto,
    type StylePreset,
    type UserDto,
} from "@shared/contracts.ts";
import type { EngineId } from "@shared/engines.ts";
import {
    normalizeWallpaperCompositions,
    parseWallpaperSource,
    type WallpaperComposition,
} from "@shared/wallpaper.ts";
import { api, ApiError, json } from "../lib/api.ts";
import {
    deleteLocal,
    getLocal,
    listLocalKeys,
    setLocal,
} from "../lib/local.ts";

export type Appearance = {
    theme: "system" | "light" | "dark";
    style: StylePreset;
    accent: AccentId;
    shape: "rounded" | "pill";
    searchOpacity: number;
    showTitle?: boolean;
    engine: EngineId;
    target: "current" | "new_tab";
    wallpaper: string;
    wallpaperCompositions: Record<string, WallpaperComposition>;
    blur: number;
    grayscale: number;
    mask: number;
    wallpaperGlowStrength: number;
    ambientMotionMode: AmbientMotionMode;
    ambientMotionStrength: number;
    webAppHomeLimit: 8 | 12 | 16 | "all";
    webAppIconSize: "compact" | "default" | "large";
    showAppLabels: boolean;
};

const initial: Appearance = {
    theme: "system",
    style: "zen",
    accent: "blue",
    shape: "rounded",
    searchOpacity: 1,
    showTitle: true,
    engine: "bing",
    target: "current",
    wallpaper: "",
    wallpaperCompositions: {},
    blur: 0,
    grayscale: 0,
    mask: DEFAULT_WALLPAPER_MASK,
    wallpaperGlowStrength: DEFAULT_WALLPAPER_GLOW_STRENGTH,
    ambientMotionMode: DEFAULT_AMBIENT_MOTION_MODE,
    ambientMotionStrength: DEFAULT_AMBIENT_MOTION_STRENGTH,
    webAppHomeLimit: 12,
    webAppIconSize: "default",
    showAppLabels: true,
};

/** 旧设备缓存和旧 API 响应缺少字段时，仍生成有效的背景参数。 */
export function normalizeAppearance(raw: unknown): Appearance {
    const saved = raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : {};
    const result = { ...initial };
    result.style = normalizeStylePreset(saved.style);
    result.accent = normalizeAccent(saved.accent);
    if (
        saved.theme === "system" || saved.theme === "light" ||
        saved.theme === "dark"
    ) result.theme = saved.theme;
    if (saved.shape === "rounded" || saved.shape === "pill") {
        result.shape = saved.shape;
    }
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
    result.wallpaperCompositions = normalizeWallpaperCompositions(
        saved.wallpaperCompositions,
    );
    for (const key of Object.keys(result.wallpaperCompositions)) {
        if (key.startsWith("data:") && key !== result.wallpaper) {
            delete result.wallpaperCompositions[key];
        }
    }
    if (typeof saved.showTitle === "boolean") {
        result.showTitle = saved.showTitle;
    }
    if (typeof saved.showAppLabels === "boolean") {
        result.showAppLabels = saved.showAppLabels;
    }
    if (
        saved.webAppHomeLimit === 8 || saved.webAppHomeLimit === 12 ||
        saved.webAppHomeLimit === 16 || saved.webAppHomeLimit === "all"
    ) result.webAppHomeLimit = saved.webAppHomeLimit;
    if (
        saved.webAppIconSize === "compact" ||
        saved.webAppIconSize === "default" || saved.webAppIconSize === "large"
    ) result.webAppIconSize = saved.webAppIconSize;
    for (
        const [key, min, max] of [
            ["searchOpacity", 0.1, 1],
            ["blur", 0, 24],
            ["grayscale", 0, 1],
            ["mask", 0, 0.8],
            ["wallpaperGlowStrength", 0, 0.3],
            ["ambientMotionStrength", 0, 1],
        ] as const
    ) {
        const value = saved[key];
        if (
            typeof value === "number" && Number.isFinite(value) &&
            value >= min && value <= max
        ) result[key] = value;
    }
    if (AMBIENT_MOTION_MODES.some((mode) => mode === saved.ambientMotionMode)) {
        result.ambientMotionMode = saved.ambientMotionMode as AmbientMotionMode;
    }
    return result;
}
type State = {
    user: UserDto | null;
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
    const [connectionError, setConnectionError] = useState(false);
    const userRef = useRef<UserDto | null>(null);
    const sync = useRef({
        owner: null as string | null,
        tail: Promise.resolve(),
        pending: {} as Record<string, unknown>,
        reconciled: {} as Record<string, unknown>,
    });
    const appearanceRevision = useRef(0);
    userRef.current = user;
    useEffect(() => {
        // 旧缓存未关联用户，不能作为匿名或账号偏好继续使用。
        try {
            localStorage.removeItem("visitor_appearance");
        } catch {
            // 浏览器可能禁用 localStorage。
        }
        void deleteLocal("visitor_appearance").catch(() => {});
    }, []);

    const checkAuth = useCallback(async () => {
        try {
            const { user } = await api<{ user: UserDto }>("/api/auth/me", {
                signal: AbortSignal.timeout(5000),
            });
            const next = handleAuthCheckResult(
                { user: userRef.current, connectionError: false },
                { type: "success", user },
            );
            setUser(next.user);
            setConnectionError(next.connectionError);
        } catch (error) {
            const next = handleAuthCheckResult(
                { user: userRef.current, connectionError: true },
                { type: "error", error },
            );
            setUser(next.user);
            setConnectionError(next.connectionError);
        } finally {
            setReady(true);
        }
    }, []);

    useEffect(() => {
        void checkAuth();
    }, [checkAuth]);

    // 设备缓存按 owner 隔离；账号共享偏好始终以云端为准。
    useEffect(() => {
        if (!ready) return;
        const userId = user?.id ?? null;
        const key = userId ? "appearance:" + userId : "appearance:anonymous";
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
        async function loadAppearance() {
            const saved = await getLocal<unknown>(key)
                .catch(() => undefined);
            if (!active()) return;
            if (appearanceRevision.current === revision) {
                setValue(normalizeAppearance(saved));
            }
            setAppearanceOwner(key);
            if (!userId) return;
            const prefs = await api<PreferencesDto>("/api/preferences");
            if (!active()) return;
            if (appearanceRevision.current !== revision) return;
            setSyncFailed(false);
            setValue((prev) =>
                normalizeAppearance({
                    ...prev,
                    engine: prefs.defaultEngine,
                    theme: prefs.theme,
                    style: normalizeStylePreset(prefs.style),
                    accent: normalizeAccent(prefs.accent),
                    shape: prefs.searchShape,
                    searchOpacity: prefs.searchOpacity ?? 1,
                    target: prefs.searchTarget === "new"
                        ? "new_tab"
                        : "current",
                    wallpaper: prefs.backgroundImage ?? "",
                    wallpaperCompositions: prefs.wallpaperCompositions,
                    blur: prefs.wallpaperBlur,
                    grayscale: prefs.wallpaperGrayscale,
                    mask: prefs.wallpaperMask,
                    wallpaperGlowStrength: prefs.wallpaperGlowStrength,
                    ambientMotionMode: prefs.ambientMotionMode,
                    ambientMotionStrength: prefs.ambientMotionStrength,
                    webAppHomeLimit: prefs.webAppHomeLimit,
                    webAppIconSize: prefs.webAppIconSize,
                    showAppLabels: prefs.showAppLabels,
                })
            );
        }
        void loadAppearance().catch((err) => {
            if (active() && !(err instanceof ApiError && err.code === 401)) {
                setSyncFailed(true);
            }
        });
        return () => {
            alive = false;
        };
    }, [ready, user?.id]);

    useEffect(() => {
        const key = user ? "appearance:" + user.id : "appearance:anonymous";
        if (!ready || appearanceOwner !== key) return;
        void setLocal(key, appearance).catch(() => {});
    }, [ready, user?.id, appearanceOwner, appearance]);

    useEffect(() => {
        const expired = () => {
            if (userRef.current) setValue(initial);
            setAppearanceOwner(null);
            setUser(null);
            setSyncFailed(false);
            setConnectionError(false);
        };
        globalThis.addEventListener("searcher:auth-expired", expired);
        return () =>
            globalThis.removeEventListener("searcher:auth-expired", expired);
    }, []);

    useEffect(() => {
        const media = matchMedia("(prefers-color-scheme: dark)");
        const apply = () => {
            const theme = appearance.theme === "system"
                ? (media.matches ? "dark" : "light")
                : appearance.theme;
            document.documentElement.dataset.theme = theme;
        };
        apply();
        media.addEventListener("change", apply);
        return () => media.removeEventListener("change", apply);
    }, [appearance.theme]);

    useEffect(() => {
        document.documentElement.dataset.accent = appearance.accent;
        document.documentElement.dataset.shape = appearance.shape;
        document.documentElement.style.setProperty(
            "--search-opacity",
            String(appearance.searchOpacity ?? 1),
        );
    }, [
        appearance.accent,
        appearance.shape,
        appearance.searchOpacity,
    ]);

    const setAppearance = (
        next: Partial<Appearance>,
        options?: { sync?: boolean },
    ): Promise<void> => {
        appearanceRevision.current++;
        setValue((current) => normalizeAppearance({ ...current, ...next }));
        if (user) {
            const updates: Record<string, unknown> = {};
            if (next.theme !== undefined) updates.theme = next.theme;
            if (next.style !== undefined) updates.style = next.style;
            if (next.accent !== undefined) updates.accent = next.accent;
            if (next.shape !== undefined) updates.searchShape = next.shape;
            if (next.searchOpacity !== undefined) {
                updates.searchOpacity = next.searchOpacity;
            }
            if (next.engine !== undefined) updates.defaultEngine = next.engine;
            if (next.target !== undefined) {
                updates.searchTarget = next.target === "new_tab"
                    ? "new"
                    : "same";
            }
            if (next.mask !== undefined) updates.wallpaperMask = next.mask;
            if (next.wallpaperGlowStrength !== undefined) {
                updates.wallpaperGlowStrength = next.wallpaperGlowStrength;
            }
            if (next.ambientMotionMode !== undefined) {
                updates.ambientMotionMode = next.ambientMotionMode;
            }
            if (next.ambientMotionStrength !== undefined) {
                updates.ambientMotionStrength = next.ambientMotionStrength;
            }
            if (next.blur !== undefined) updates.wallpaperBlur = next.blur;
            if (next.grayscale !== undefined) {
                updates.wallpaperGrayscale = next.grayscale;
            }
            if (next.wallpaper !== undefined) {
                updates.backgroundImage = next.wallpaper || null;
            }
            if (next.wallpaperCompositions !== undefined) {
                updates.wallpaperCompositions = next.wallpaperCompositions;
            }
            if (next.webAppHomeLimit !== undefined) {
                updates.webAppHomeLimit = next.webAppHomeLimit;
            }
            if (next.webAppIconSize !== undefined) {
                updates.webAppIconSize = next.webAppIconSize;
            }
            if (next.showAppLabels !== undefined) {
                updates.showAppLabels = next.showAppLabels;
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
            const result = queue.tail.then(async () => {
                if (sync.current !== queue || userRef.current?.id !== owner) {
                    return;
                }
                const patch = queue.pending;
                queue.pending = {};
                if (Object.keys(patch).length === 0) return;
                try {
                    await api("/api/preferences", json("PATCH", patch));
                    if (
                        sync.current === queue && userRef.current?.id === owner
                    ) {
                        setSyncFailed(false);
                    }
                } catch (error) {
                    if (
                        sync.current === queue && userRef.current?.id === owner
                    ) {
                        queue.pending = { ...patch, ...queue.pending };
                        for (const key of Object.keys(queue.reconciled)) {
                            delete queue.pending[key];
                        }
                        if (
                            !(error instanceof ApiError && error.code === 401)
                        ) setSyncFailed(true);
                    }
                    throw error;
                }
            });
            // Existing controls intentionally fire-and-forget; callers may still await the original promise.
            queue.tail = result.catch(() => {});
            return result;
        }
        return Promise.resolve();
    };

    const logout = async (options?: { force?: boolean }) => {
        if (!options?.force && user) {
            try {
                const keys = await listLocalKeys("draft:" + user.id + ":");
                if (keys.length > 0) return false;
            } catch {
                // IndexedDB 不可用时降级放行
            }
        }
        await api("/api/auth/logout", { method: "POST" });
        setUser(null);
        setAppearanceOwner(null);
        setValue(initial);
        return true;
    };

    return (
        <Context.Provider
            value={{
                user,
                ready,
                syncFailed,
                connectionError,
                retryConnection: checkAuth,
                appearance,
                setAppearance,
                settleAppearanceSync: () => sync.current.tail,
                login: setUser,
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
