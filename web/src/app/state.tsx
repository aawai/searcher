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
    normalizeAccent,
    normalizeStylePreset,
    type PreferencesDto,
    type StylePreset,
    type UserDto,
} from "@shared/contracts.ts";
import type { EngineId } from "@shared/engines.ts";
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
    blur: number;
    grayscale: number;
    mask: number;
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
    blur: 0,
    grayscale: 0,
    mask: .75,
    webAppHomeLimit: 12,
    webAppIconSize: "default",
    showAppLabels: true,
};

type State = {
    user: UserDto | null;
    ready: boolean;
    syncFailed: boolean;
    connectionError: boolean;
    retryConnection: () => Promise<void>;
    appearance: Appearance;
    setAppearance: (next: Partial<Appearance>) => void;
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

    // 登录后只读取当前用户的设备缓存，再由云端覆盖共享偏好。
    useEffect(() => {
        if (!user) return;
        const userId = user.id;
        let alive = true;
        setAppearanceOwner(null);
        setValue(initial);
        const active = () => alive && userRef.current?.id === userId;
        async function loadAppearance() {
            const saved = await getLocal<Appearance>("appearance:" + userId)
                .catch(() => undefined);
            if (!active()) return;
            setAppearanceOwner(userId);
            setValue({
                ...initial,
                ...saved,
                style: normalizeStylePreset(saved?.style ?? initial.style),
                accent: normalizeAccent(saved?.accent ?? initial.accent),
            });
            const prefs = await api<PreferencesDto>("/api/preferences");
            if (!active()) return;
            setSyncFailed(false);
            setValue((prev) => ({
                ...prev,
                engine: prefs.defaultEngine,
                theme: prefs.theme,
                style: normalizeStylePreset(prefs.style),
                accent: normalizeAccent(prefs.accent),
                shape: prefs.searchShape,
                searchOpacity: prefs.searchOpacity ?? 1,
                target: prefs.searchTarget === "new" ? "new_tab" : "current",
                wallpaper: prefs.backgroundImage ?? "",
                blur: prefs.wallpaperBlur,
                grayscale: prefs.wallpaperGrayscale,
                mask: prefs.wallpaperMask,
                webAppHomeLimit: prefs.webAppHomeLimit,
                webAppIconSize: prefs.webAppIconSize,
                showAppLabels: prefs.showAppLabels,
            }));
        }
        void loadAppearance().catch((err) => {
            if (active() && !(err instanceof ApiError && err.code === 401)) {
                setSyncFailed(true);
            }
        });
        return () => {
            alive = false;
        };
    }, [user?.id]);

    useEffect(() => {
        if (!user || appearanceOwner !== user.id) return;
        void setLocal("appearance:" + user.id, appearance).catch(() => {});
    }, [user?.id, appearanceOwner, appearance]);

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
        document.documentElement.dataset.style = appearance.style;
        document.documentElement.dataset.accent = appearance.accent;
        document.documentElement.dataset.shape = appearance.shape;
        document.documentElement.style.setProperty(
            "--search-opacity",
            String(appearance.searchOpacity ?? 1),
        );
    }, [
        appearance.style,
        appearance.accent,
        appearance.shape,
        appearance.searchOpacity,
    ]);

    const setAppearance = (next: Partial<Appearance>) => {
        setValue((current) => ({ ...current, ...next }));
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
            if (next.blur !== undefined) updates.wallpaperBlur = next.blur;
            if (next.grayscale !== undefined) {
                updates.wallpaperGrayscale = next.grayscale;
            }
            if (next.wallpaper !== undefined) {
                updates.backgroundImage = next.wallpaper || null;
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
            if (Object.keys(updates).length) {
                void api("/api/preferences", json("PATCH", updates)).catch(
                    (err) => {
                        if (!(err instanceof ApiError && err.code === 401)) {
                            setSyncFailed(true);
                        }
                    },
                );
            }
        }
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
