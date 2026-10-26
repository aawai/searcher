import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
    createBrowserRouter,
    Link,
    Outlet,
    RouterProvider,
    useLocation,
    useNavigate,
} from "react-router-dom";
import {
    AlertTriangle,
    LogIn,
    LogOut,
    Moon,
    Settings,
    Shield,
    Sparkles,
    Sun,
    SunMoon,
    Trash2,
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
import { askConversationId, authPath, routes } from "./app/routes.ts";
import { DockProvider } from "./features/dock/DockProvider.tsx";
import { WorkspaceDock } from "./features/dock/WorkspaceDock.tsx";
import type { AppOutletContext } from "./app/outlet-context.ts";
import { useAiModels } from "./features/omnibox/useAiModels.ts";
import {
    RouteErrorBoundary,
    RouteLoadingFallback,
} from "./app/RouteErrorBoundary.tsx";
import { Button } from "./components/ui/button.tsx";
import { LoadingState } from "./components/searcher/semantic.tsx";
import { useOnline } from "./app/online.ts";
import { useServiceWorkerUpdate } from "./pwa/service-worker.ts";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
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
const OmniboxLab = lazy(() =>
    import("./design-lab/OmniboxLab.tsx").then((m) => ({
        default: m.OmniboxLab,
    }))
);
const MotionLab = lazy(() => import("./design-lab/MotionLab.tsx"));
const AccentLab = lazy(() => import("./design-lab/AccentLab.tsx"));
const HomeGridLab = lazy(() => import("./design-lab/HomeGridLab.tsx"));
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
const SharePage = lazy(() =>
    import("./features/share/SharePage.tsx").then((m) => ({
        default: m.SharePage,
    }))
);
const NotFoundPage = lazy(() =>
    import("./app/NotFoundPage.tsx").then((m) => ({ default: m.NotFoundPage }))
);

function Layout() {
    const navigate = useNavigate();
    const location = useLocation();
    const isHomePage = location.pathname === routes.home;
    const isAskPage = location.pathname === routes.ask ||
        askConversationId(location.pathname) !== null;
    // The account page shares the settings shell, so it keeps the icon active.
    const isSettingsPage = location.pathname === routes.settings() ||
        location.pathname.startsWith(`${routes.settings()}/`) ||
        location.pathname === routes.account;
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
    const online = useOnline();
    const serviceWorker = useServiceWorkerUpdate();
    // Coming back online re-checks the session the offline start could not.
    const wasOnline = useRef(online);
    useEffect(() => {
        if (online && !wasOnline.current && connectionError) {
            void retryConnection();
        }
        wasOnline.current = online;
    }, [online, connectionError, retryConnection]);
    // Re-read when the user moves between sections, e.g. after configuring a model.
    const aiModels = useAiModels(
        Boolean(user) && location.pathname !== routes.login &&
            location.pathname !== routes.register,
        location.pathname.split("/")[1],
    );
    const outletContext: AppOutletContext = { aiModels };
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
        : DEFAULT_WALLPAPER_PRESENTATION;
    const themeNames = {
        system: "跟随系统",
        light: "浅色",
        dark: "深色",
    };
    const nextTheme = appearance.theme === "system"
        ? "light"
        : appearance.theme === "light"
        ? "dark"
        : "system";
    const themeLabel = `切换主题，当前：${
        themeNames[appearance.theme]
    }，下一个：${themeNames[nextTheme]}`;

    return (
        <div
            className="app-shell"
            data-home={isHomePage ? "true" : undefined}
            data-wallpaper-image={isHomePage && imageSource
                ? "true"
                : undefined}
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
                    className="wordmark-small"
                    to={routes.home}
                    viewTransition
                    aria-label="Searcher 首页"
                >
                    s.
                </Link>
                <nav className="top-actions" aria-label="账户与设置">
                    {
                        /* Home keeps only the theme and identity; AI and settings
                        are reached from the search box commands and the user menu. */
                    }
                    {!isHomePage && aiModels.length > 0 && (
                        <Link
                            to={routes.ask}
                            viewTransition
                            className={isAskPage
                                ? "topbar-link topbar-link--active"
                                : "topbar-link"}
                            aria-label="AI 问答"
                            title="AI 问答"
                        >
                            <Sparkles size="1em" className="icon-lg" />
                        </Link>
                    )}
                    <button
                        type="button"
                        onClick={() => void setAppearance({ theme: nextTheme })}
                        aria-label={themeLabel}
                        title={themeLabel}
                    >
                        {appearance.theme === "dark"
                            ? <Sun size="1em" className="icon-lg" />
                            : appearance.theme === "light"
                            ? <Moon size="1em" className="icon-lg" />
                            : <SunMoon size="1em" className="icon-lg" />}
                    </button>
                    {!isHomePage && (
                        <Link
                            to={routes.settings()}
                            viewTransition
                            className={isSettingsPage
                                ? "topbar-link topbar-link--active"
                                : "topbar-link"}
                            aria-label="设置"
                            title="设置"
                        >
                            <Settings size="1em" className="icon-lg" />
                        </Link>
                    )}
                    <span className="sync-status" role="status">
                        {syncFailed && (
                            <Link
                                to={routes.settings("data")}
                                viewTransition
                                className="sync-failed-badge"
                                aria-label="偏好设置同步失败"
                            >
                                <AlertTriangle
                                    size="1em"
                                    className="icon-md"
                                    aria-hidden="true"
                                />
                                <span>同步失败</span>
                            </Link>
                        )}
                    </span>
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
                                            .slice(0, 1)}
                                    </span>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent sideOffset={8}>
                                    <div className="user-menu-identity">
                                        <span>{user.displayName}</span>
                                        <span>@{user.username}</span>
                                    </div>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() =>
                                            navigate(routes.account, {
                                                viewTransition: true,
                                            })}
                                    >
                                        <UserRound
                                            size="1em"
                                            className="icon-md"
                                        />
                                        <span>账户与安全</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() =>
                                            navigate(routes.settings(), {
                                                viewTransition: true,
                                            })}
                                    >
                                        <Settings
                                            size="1em"
                                            className="icon-md"
                                        />
                                        <span>设置</span>
                                    </DropdownMenuItem>
                                    {user.role === "admin" && (
                                        <DropdownMenuItem
                                            onClick={() =>
                                                navigate(routes.admin(), {
                                                    viewTransition: true,
                                                })}
                                        >
                                            <Shield
                                                size="1em"
                                                className="icon-md"
                                            />
                                            <span>管理后台</span>
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        onClick={() =>
                                            navigate(routes.trash, {
                                                viewTransition: true,
                                            })}
                                    >
                                        <Trash2
                                            size="1em"
                                            className="icon-md"
                                        />
                                        <span>回收站</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        variant="destructive"
                                        aria-label="退出登录"
                                        disabled={logoutBusy}
                                        onClick={() => void requestLogout()}
                                    >
                                        <LogOut
                                            size="1em"
                                            className="icon-md"
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
                                viewTransition
                                className="user-link"
                                aria-label="登录"
                            >
                                <LogIn size="1em" className="icon-lg" />
                                <span>登录</span>
                            </Link>
                        )}
                </nav>
            </header>
            {(!online || connectionError || syncFailed) && (
                <aside
                    className="connection-banner"
                    role="status"
                    aria-live="polite"
                >
                    <span>
                        {!online
                            ? "当前离线"
                            : connectionError
                            ? "网络或服务暂不可用"
                            : "偏好设置同步失败"}
                    </span>
                    {online && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void retryConnection()}
                        >
                            重试
                        </Button>
                    )}
                </aside>
            )}
            {serviceWorker.updateReady && (
                <aside
                    className="connection-banner"
                    role="status"
                    aria-live="polite"
                >
                    <span>新版本已就绪</span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={serviceWorker.reload}
                    >
                        刷新
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
                    <DialogTitle>有未同步的笔记草稿</DialogTitle>
                    <DialogDescription>
                        退出后草稿仍保留在此浏览器，重新登录可继续同步。
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
                ? <LoadingState className="page">正在加载…</LoadingState>
                : (
                    <>
                        <RouteErrorBoundary locationKey={location.pathname}>
                            <Suspense fallback={<RouteLoadingFallback />}>
                                <Outlet context={outletContext} />
                            </Suspense>
                        </RouteErrorBoundary>
                        <WorkspaceDock aiAvailable={aiModels.length > 0} />
                    </>
                )}
        </div>
    );
}
export function App() {
    const [router] = useState(() =>
        createBrowserRouter([
            {
                path: routes.home,
                element: (
                    <AppState>
                        <DockProvider>
                            <Layout />
                        </DockProvider>
                    </AppState>
                ),
                // Page links need the data router's navigation options, including
                // viewTransition; descendant <Routes> would discard them.
                children: [
                    { index: true, element: <SearchHome /> },
                    { path: routes.designLab, element: <DesignLab /> },
                    { path: "/design-lab/motion", element: <MotionLab /> },
                    { path: "/design-lab/accent", element: <AccentLab /> },
                    {
                        path: "/design-lab/home-grid",
                        element: <HomeGridLab />,
                    },
                    { path: routes.login, element: <AuthPage kind="login" /> },
                    {
                        path: routes.register,
                        element: <AuthPage kind="register" />,
                    },
                    {
                        path: `${routes.settings()}/*`,
                        element: <SettingsPage />,
                    },
                    // One route for /ask and /ask/:id keeps the page mounted when
                    // a started conversation gets its own URL.
                    { path: `${routes.ask}/:id?`, element: <AskPage /> },
                    { path: routes.account, element: <AccountPage /> },
                    { path: `${routes.admin()}/*`, element: <AdminPage /> },
                    { path: routes.trash, element: <TrashPage /> },
                    { path: routes.share, element: <SharePage /> },
                    {
                        path: "/design-lab/omnibox",
                        element: <OmniboxLab />,
                    },
                    {
                        path: "/design-lab/markdown-editor",
                        element: <MarkdownEditorSpike />,
                    },
                    {
                        path: "/design-lab/editable-pagination",
                        element: <EditablePaginationSpike />,
                    },
                    { path: "*", element: <NotFoundPage /> },
                ],
            },
        ])
    );
    return <RouterProvider router={router} />;
}
