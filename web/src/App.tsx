import { lazy, Suspense, useEffect, useState } from "react";
import {
    createBrowserRouter,
    Link,
    Route,
    RouterProvider,
    Routes,
    useLocation,
    useNavigate,
} from "react-router-dom";
import {
    LogIn,
    Monitor,
    Moon,
    Settings,
    Shield,
    Sparkles,
    Sun,
    UserRound,
} from "lucide-react";
import { AppState, useAppState } from "./app/state.tsx";
import { WallpaperSurface } from "./components/wallpaper/WallpaperSurface.tsx";
import { parseWallpaperSource } from "@shared/wallpaper.ts";
import {
    DEFAULT_WALLPAPER_PRESENTATION,
    wallpaperPresentation,
} from "@shared/wallpaper-presentation.ts";
import { SearchHome } from "./app/SearchHome.tsx";
import { authPath, routes } from "./app/routes.ts";
import {
    RouteErrorBoundary,
    RouteLoadingFallback,
} from "./app/RouteErrorBoundary.tsx";
import { Button } from "./components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./components/ui/dropdown-menu.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from "./components/ui/dialog.tsx";

const DesignLab = lazy(() =>
    import("./design-lab/DesignLab.tsx").then((m) => ({ default: m.DesignLab }))
);
const MarkdownEditorSpike = lazy(() =>
    import("./spikes/markdown-editor/MarkdownEditorSpike.tsx")
);
const EditablePaginationSpike = lazy(() =>
    import("./spikes/editable-pagination/EditablePaginationSpike.tsx")
);
const AuthPage = lazy(() =>
    import("./app/AuthPage.tsx").then((m) => ({ default: m.AuthPage }))
);
const SettingsPage = lazy(() =>
    import("./app/SettingsPage.tsx").then((m) => ({ default: m.SettingsPage }))
);
const AskPage = lazy(() =>
    import("./app/AskPage.tsx").then((m) => ({ default: m.AskPage }))
);
const AccountPage = lazy(() =>
    import("./app/AccountPage.tsx").then((m) => ({ default: m.AccountPage }))
);
const AdminPage = lazy(() =>
    import("./app/AdminPage.tsx").then((m) => ({ default: m.AdminPage }))
);
const TrashPage = lazy(() =>
    import("./app/TrashPage.tsx").then((m) => ({ default: m.TrashPage }))
);
const NotFoundPage = lazy(() =>
    import("./app/NotFoundPage.tsx").then((m) => ({ default: m.NotFoundPage }))
);

const LazyWallpaperMotionInspector = lazy(() =>
    import("./dev/WallpaperMotionInspector.tsx").then((m) => ({
        default: m.WallpaperMotionInspector,
    }))
);

function isMotionInspectorRequested(): boolean {
    if (typeof globalThis.location === "undefined") return false;
    try {
        const search = globalThis.location.search;
        const params = new URLSearchParams(search);
        if (params.has("motion_inspector")) return true;
        return (
            globalThis.localStorage?.getItem("searcher:motion_inspector") ===
                "true"
        );
    } catch {
        return false;
    }
}

function DiagnosticWallpaperMotionInspector() {
    const location = useLocation();
    const [enabled, setEnabled] = useState(isMotionInspectorRequested);

    useEffect(() => {
        setEnabled(isMotionInspectorRequested());
    }, [location.search]);

    if (!enabled) return null;

    return (
        <Suspense fallback={null}>
            <LazyWallpaperMotionInspector />
        </Suspense>
    );
}
function Layout() {
    const navigate = useNavigate();
    const location = useLocation();
    const isHomePage = location.pathname === routes.home;
    const isAskPage = location.pathname === routes.ask;
    const isSettingsPage = location.pathname === routes.settings() ||
        location.pathname.startsWith(`${routes.settings()}/`);
    const {
        user,
        authSession,
        ready,
        appearance,
        setAppearance,
        logout,
        syncFailed,
        connectionError,
        retryConnection,
    } = useAppState();
    const [error, setError] = useState("");
    const [logoutSession, setLogoutSession] = useState<
        typeof authSession | null
    >(null);
    const [logoutBusy, setLogoutBusy] = useState(false);
    useEffect(() => {
        setLogoutSession(null);
        setLogoutBusy(false);
        setError("");
    }, [authSession]);

    async function requestLogout(force = false) {
        const session = authSession;
        if (logoutBusy || !session.isCurrent()) return;
        if (force && logoutSession !== session) return;
        setError("");
        setLogoutBusy(true);
        try {
            const done = await logout({ force });
            if (session.isCurrent()) setLogoutSession(done ? null : session);
        } catch (error) {
            if (session.isCurrent()) setError(String(error));
        } finally {
            if (session.isCurrent()) setLogoutBusy(false);
        }
    }
    const imageSource = appearance.wallpaper.startsWith("data:image/") ||
        ["uploaded", "remote"].includes(
            parseWallpaperSource(appearance.wallpaper)?.type ?? "",
        );
    const presentation = appearance.wallpaper
        ? wallpaperPresentation(
            appearance.wallpaper,
            appearance.wallpaperPresentations,
        )
        : {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: appearance.canvasMotion,
            motionLevel: appearance.canvasMotionLevel,
        };

    return (
        <div
            className="app-shell"
            data-wallpaper-image={isHomePage && imageSource
                ? "true"
                : undefined}
            style={{
                "--search-opacity": appearance.searchOpacity ?? 1,
            } as React.CSSProperties}
        >
            {isHomePage && (
                <WallpaperSurface
                    source={appearance.wallpaper}
                    presentation={presentation}
                    testId="home-wallpaper-surface"
                />
            )}
            <header className="topbar">
                <Link
                    className={`wordmark-small ${
                        isHomePage && appearance.style === "widgets" &&
                            appearance.showTitle !== false
                            ? "opacity-0 pointer-events-none select-none transition-opacity"
                            : "opacity-100 transition-opacity"
                    }`}
                    to={routes.home}
                    aria-label="Searcher 首页"
                >
                    s.
                </Link>
                <nav className="top-actions" aria-label="账户与设置">
                    <Link
                        to={routes.ask}
                        className={isAskPage
                            ? "topbar-link topbar-link--active"
                            : "topbar-link"}
                        aria-label="AI 问答"
                        title="AI 问答"
                    >
                        <Sparkles size={19} />
                    </Link>
                    <button
                        type="button"
                        onClick={() => {
                            // B-005: System → Light → Dark → System
                            const next = appearance.theme === "system"
                                ? "light"
                                : appearance.theme === "light"
                                ? "dark"
                                : "system";
                            setAppearance({ theme: next });
                        }}
                        aria-label={`当前主题：${appearance.theme}，点击切换模式`}
                        title={`当前主题：${appearance.theme} (System → Light → Dark)`}
                    >
                        {appearance.theme === "dark"
                            ? <Sun size={20} />
                            : appearance.theme === "light"
                            ? <Moon size={20} />
                            : <Monitor size={20} />}
                    </button>
                    <Link
                        to={routes.settings()}
                        className={isSettingsPage
                            ? "topbar-link topbar-link--active"
                            : "topbar-link"}
                        aria-label="设置"
                        title="设置"
                    >
                        <Settings size={20} />
                    </Link>
                    {/* Y-002: 仅在同步异常时展示全局警示 Badge */}
                    {syncFailed && (
                        <Link
                            to={routes.settings("data")}
                            className="sync-failed-badge text-[var(--danger)]"
                            role="alert"
                            aria-label="偏好设置同步失败，点击查看"
                            title="部分设置未能同步到云端，点击前往设置检查"
                        >
                            !
                        </Link>
                    )}
                    {user
                        ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    className="user-avatar-trigger"
                                    aria-label={`用户菜单：${user.displayName}`}
                                    title={user.displayName}
                                >
                                    <span className="user-avatar-badge">
                                        {(user.displayName || user.username)
                                            .slice(0, 1).toUpperCase()}
                                    </span>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent sideOffset={8}>
                                    <div className="px-3 pt-2 pb-1.5 border-b border-[var(--border)] mb-1">
                                        <div className="font-semibold text-sm">
                                            {user.displayName}
                                        </div>
                                        <div className="muted text-xs">
                                            @{user.username}
                                        </div>
                                    </div>
                                    <DropdownMenuItem
                                        onClick={() => navigate(routes.account)}
                                    >
                                        <UserRound
                                            size={15}
                                            className="mr-2"
                                        />
                                        <span>账户与安全</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() =>
                                            navigate(routes.settings())}
                                    >
                                        <Settings
                                            size={15}
                                            className="mr-2"
                                        />
                                        <span>偏好设置</span>
                                    </DropdownMenuItem>
                                    {user.role === "admin" && (
                                        <DropdownMenuItem
                                            onClick={() =>
                                                navigate(routes.admin())}
                                        >
                                            <Shield
                                                size={15}
                                                className="mr-2"
                                            />
                                            <span>管理后台</span>
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        className="note-dropdown-item--delete"
                                        aria-label="退出登录"
                                        disabled={logoutBusy}
                                        onClick={() => void requestLogout()}
                                    >
                                        <LogIn
                                            size={15}
                                            className="mr-2 rotate-180"
                                        />
                                        <span>退出登录</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )
                        : (location.pathname !== routes.login &&
                            location.pathname !== routes.register) && (
                            <Link
                                to={authPath("login", location)}
                                className="user-link"
                                aria-label="登录"
                            >
                                <LogIn size={19} />
                                <span>登录</span>
                            </Link>
                        )}
                </nav>
            </header>
            {connectionError && (
                <aside
                    className="connection-banner"
                    role="status"
                    aria-live="polite"
                >
                    <span>服务暂不可用，部分功能可能受限</span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void retryConnection()}
                    >
                        重试
                    </Button>
                </aside>
            )}
            {error && <p role="alert" className="error">{error}</p>}
            <Dialog
                open={logoutSession?.isCurrent() ?? false}
                onOpenChange={(open) => {
                    if (!open && !logoutBusy) setLogoutSession(null);
                }}
            >
                <DialogContent aria-label="退出登录确认">
                    <DialogTitle>有未同步的便签草稿</DialogTitle>
                    <DialogDescription>
                        检测到此设备有尚未同步到服务端的便签草稿。现在退出登录，草稿仍保留在此浏览器中，重新登录后可继续同步；若直接退出，未同步内容不会自动消失，但请确认已知晓。
                    </DialogDescription>
                    <DialogFooter>
                        <Button
                            type="button"
                            disabled={logoutBusy}
                            onClick={() => setLogoutSession(null)}
                        >
                            先去同步
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={logoutBusy}
                            onClick={() => void requestLogout(true)}
                        >
                            仍要退出
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {!ready
                ? <p className="page muted">正在加载…</p>
                : (
                    <RouteErrorBoundary locationKey={location.pathname}>
                        <Suspense fallback={<RouteLoadingFallback />}>
                            <Routes>
                                <Route
                                    path={routes.home}
                                    element={<SearchHome />}
                                />
                                <Route
                                    path={routes.designLab}
                                    element={<DesignLab />}
                                />
                                <Route
                                    path={routes.login}
                                    element={<AuthPage kind="login" />}
                                />
                                <Route
                                    path={routes.register}
                                    element={<AuthPage kind="register" />}
                                />
                                <Route
                                    path={`${routes.settings()}/*`}
                                    element={<SettingsPage />}
                                />
                                <Route
                                    path={routes.ask}
                                    element={<AskPage />}
                                />
                                <Route
                                    path={routes.account}
                                    element={<AccountPage />}
                                />
                                <Route
                                    path={`${routes.admin()}/*`}
                                    element={<AdminPage />}
                                />
                                <Route
                                    path={routes.trash}
                                    element={<TrashPage />}
                                />
                                <Route path="*" element={<NotFoundPage />} />
                                <Route
                                    path="/design-lab/markdown-editor"
                                    element={<MarkdownEditorSpike />}
                                />
                                <Route
                                    path="/design-lab/editable-pagination"
                                    element={<EditablePaginationSpike />}
                                />
                            </Routes>
                        </Suspense>
                    </RouteErrorBoundary>
                )}
            <DiagnosticWallpaperMotionInspector />
        </div>
    );
}
export function App() {
    const [router] = useState(() =>
        createBrowserRouter([
            {
                path: "*",
                element: (
                    <AppState>
                        <Layout />
                    </AppState>
                ),
            },
        ])
    );
    return <RouterProvider router={router} />;
}
