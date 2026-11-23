import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
    createBrowserRouter,
    Link,
    Navigate,
    Outlet,
    RouterProvider,
    useLocation,
    useNavigate,
} from "react-router-dom";
import {
    AlertTriangle,
    LogIn,
    LogOut,
    Settings,
    Shield,
    Sparkles,
    Trash2,
    UserRound,
} from "lucide-react";
import { AppState, useAppState } from "./app/state.tsx";
import { UserAvatar } from "./components/searcher/UserAvatar.tsx";
import { WallpaperSurface } from "./components/wallpaper/WallpaperSurface.tsx";
import { parseWallpaperSource } from "@shared/wallpaper.ts";
import {
    DEFAULT_WALLPAPER_PRESENTATION,
    wallpaperPresentation,
} from "@shared/wallpaper-presentation.ts";
import { SearchHome } from "./app/SearchHome.tsx";
import {
    type AdminTab,
    adminTab,
    askConversationId,
    authPath,
    routes,
    type SettingsTab,
    settingsTab,
} from "./app/routes.ts";
import { DockProvider } from "./features/dock/DockProvider.tsx";
import { WorkspaceDock } from "./features/dock/WorkspaceDock.tsx";
import {
    DesktopCoordinator,
    DesktopStage,
} from "./features/windowing/DesktopCoordinator.tsx";
import { useWindowManager } from "./features/windowing/window-context.tsx";
import { windowForLocation } from "./features/windowing/window-state.ts";
import {
    NavigationGuardProvider,
    useDestructiveAction,
} from "./app/navigation-guards.tsx";
import { hasUnsyncedDocumentDrafts } from "./features/documents/local-drafts.ts";
import type { AppOutletContext } from "./app/outlet-context.ts";
import { useAiModels } from "./features/omnibox/useAiModels.ts";
import {
    RouteErrorBoundary,
    RouteLoadingFallback,
} from "./app/RouteErrorBoundary.tsx";
import { Button } from "./components/ui/button.tsx";
import { LoadingState, StatusBanner } from "./components/searcher/semantic.tsx";
import {
    AppearancePicker,
    ThemeToggle,
} from "./components/searcher/AppearancePicker.tsx";
import { Separator } from "./components/ui/separator.tsx";
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "./components/ui/alert-dialog.tsx";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "./components/ui/tooltip.tsx";

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
const PaletteLab = lazy(() => import("./design-lab/PaletteLab.tsx"));
const WindowLab = lazy(() => import("./design-lab/WindowLab.tsx"));
const IllustrationLab = lazy(() => import("./design-lab/IllustrationLab.tsx"));
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

function routeDocumentTitle(pathname: string): string | null {
    if (pathname === routes.login || pathname === routes.register) return null;
    if (pathname === routes.home) return "Searcher";
    const sTab = settingsTab(pathname);
    if (sTab) {
        const labels: Record<SettingsTab, string> = {
            search: "搜索设置",
            appearance: "外观设置",
            ai: "AI 设置",
            data: "数据与同步",
            shortcuts: "快捷键",
        };
        return `${labels[sTab]} · Searcher`;
    }
    if (pathname.startsWith(`${routes.settings()}/`)) {
        return "页面不存在 · Searcher";
    }
    if (pathname === routes.account) return "账户与安全 · Searcher";
    if (pathname === routes.ask || askConversationId(pathname) !== null) {
        return "AI 问答 · Searcher";
    }
    const aTab = adminTab(pathname);
    if (aTab) {
        const labels: Record<AdminTab, string> = {
            overview: "管理后台",
            users: "用户管理 · 管理后台",
            settings: "系统设置 · 管理后台",
            audit: "审计日志 · 管理后台",
            backup: "备份与恢复 · 管理后台",
        };
        return `${labels[aTab]} · Searcher`;
    }
    if (pathname.startsWith(`${routes.admin()}/`)) {
        return "页面不存在 · Searcher";
    }
    if (pathname === routes.trash) return "回收站 · Searcher";
    if (pathname === routes.share) return "保存分享 · Searcher";
    if (pathname.startsWith(routes.designLab)) return "Design Lab · Searcher";
    return "页面不存在 · Searcher";
}

/** The top bar's AI entry activates the single AI window instead of starting a new page. */
function AiTopbarLink({ pathname }: { pathname: string }) {
    const windowManager = useWindowManager();
    const active = windowManager
        ? windowManager.activeId === "ai"
        : pathname === routes.ask;
    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <Link
                        to={routes.ask}
                        viewTransition
                        className={active
                            ? "topbar-link topbar-link--active"
                            : "topbar-link"}
                        aria-label="AI 问答"
                        onClick={(event) => {
                            if (!windowManager) return;
                            event.preventDefault();
                            windowManager.open("ai");
                        }}
                    />
                }
            >
                <span className="topbar-icon-chip" aria-hidden="true">
                    <Sparkles size="1em" className="icon-sm" />
                </span>
            </TooltipTrigger>
            <TooltipContent>AI 问答</TooltipContent>
        </Tooltip>
    );
}

function Layout() {
    const navigate = useNavigate();
    const location = useLocation();
    const isHomePage = location.pathname === routes.home;
    const isAuthPage = location.pathname === routes.login ||
        location.pathname === routes.register;
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
    const hasVisibleDesktop = isHomePage ||
        Boolean(user && windowForLocation(location) !== null);
    const showWallpaper = hasVisibleDesktop || isAuthPage;
    // Signed-in desktops reach AI and settings through the dock and the user
    // menu; the top bar keeps only theme and identity whichever window is open.
    const desktopTopbar = Boolean(user) && hasVisibleDesktop;
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
    // Authentication pages hide the retained desktop without clearing its models.
    const modelSection = useRef(location.pathname.split("/")[1]);
    if (!isAuthPage) modelSection.current = location.pathname.split("/")[1];
    const aiModels = useAiModels(Boolean(user), modelSection.current);
    const outletContext: AppOutletContext = { aiModels };
    const requestDestructiveAction = useDestructiveAction();
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

    useEffect(() => {
        const title = routeDocumentTitle(location.pathname);
        if (title !== null) {
            document.title = title;
        }
    }, [location.pathname]);

    async function requestLogout(force = false) {
        const session = authSession;
        if (logoutBusy || !session.isCurrent()) return;
        if (force && logoutSession !== session) return;
        setError("");
        setLogoutBusy(true);
        if (!force && session.userId) {
            try {
                const hasDrafts = await hasUnsyncedDocumentDrafts(
                    session.userId,
                    session.isCurrent,
                );
                if (!session.isCurrent()) return;
                if (hasDrafts) {
                    setLogoutSession(session);
                    setLogoutBusy(false);
                    return;
                }
            } catch {
                if (session.isCurrent()) {
                    setError(
                        "未能检查本地笔记草稿，尚未退出登录；请重试退出。",
                    );
                    setLogoutBusy(false);
                }
                return;
            }
        }
        setLogoutSession(null);
        setLogoutBusy(false);
        requestDestructiveAction(() => {
            if (!session.isCurrent()) return;
            setLogoutBusy(true);
            void logout({ force: true }).catch((error) => {
                if (session.isCurrent()) setError(String(error));
            }).finally(() => {
                if (session.isCurrent()) setLogoutBusy(false);
            });
        });
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
    return (
        <DesktopCoordinator aiModels={aiModels}>
            <div
                className="app-shell"
                data-home={hasVisibleDesktop ? "true" : undefined}
                data-wallpaper-image={hasVisibleDesktop && imageSource
                    ? "true"
                    : undefined}
            >
                {showWallpaper && (
                    <WallpaperSurface
                        source={appearance.wallpaper}
                        botanicalScene={appearance.botanicalScene}
                        presentation={presentation}
                        derived={!hasVisibleDesktop && isAuthPage}
                        testId={hasVisibleDesktop
                            ? "home-wallpaper-surface"
                            : "auth-wallpaper-surface"}
                    />
                )}
                <a href="#main-content" className="skip-link">
                    跳到主要内容
                </a>
                <header className="topbar">
                    <Link
                        className="wordmark-small"
                        to={routes.home}
                        viewTransition
                        aria-label="Searcher 首页"
                    >
                        s<span className="wordmark-dot">.</span>
                    </Link>
                    <nav className="top-actions" aria-label="账户与设置">
                        {!desktopTopbar && !isAuthPage && aiModels.length > 0 &&
                            <AiTopbarLink pathname={location.pathname} />}
                        <ThemeToggle
                            value={appearance.theme}
                            onValueChange={(theme) =>
                                void setAppearance({ theme })}
                        />
                        <AppearancePicker
                            theme={appearance.theme}
                            accent={appearance.accent}
                            botanicalScene={appearance.botanicalScene}
                            wallpaper={appearance.wallpaper}
                            wallpaperPresentations={appearance
                                .wallpaperPresentations}
                            canLoadWallpaperHistory={Boolean(user)}
                            historyOwnerKey={user?.id ?? null}
                            onThemeChange={(theme) =>
                                void setAppearance({ theme })}
                            onAccentChange={(accent) =>
                                void setAppearance({ accent })}
                            onBotanicalSceneChange={(botanicalScene) =>
                                void setAppearance({ botanicalScene })}
                            onWallpaperChange={(patch) =>
                                void setAppearance(patch)}
                        />
                        {!desktopTopbar && (
                            <Tooltip>
                                <TooltipTrigger
                                    render={
                                        <Link
                                            to={routes.settings()}
                                            viewTransition
                                            className={isSettingsPage
                                                ? "topbar-link topbar-link--active"
                                                : "topbar-link"}
                                            aria-label="设置"
                                        />
                                    }
                                >
                                    <span
                                        className="topbar-icon-chip"
                                        aria-hidden="true"
                                    >
                                        <Settings
                                            size="1em"
                                            className="icon-sm"
                                        />
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>设置</TooltipContent>
                            </Tooltip>
                        )}
                        {(user || !isAuthPage) && (
                            <Separator
                                orientation="vertical"
                                className="top-actions-separator"
                            />
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
                                    >
                                        <span className="user-avatar-badge">
                                            <UserAvatar user={user} />
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
                                                className="icon-sm"
                                                aria-hidden="true"
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
                                                className="icon-sm"
                                                aria-hidden="true"
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
                                                    className="icon-sm"
                                                    aria-hidden="true"
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
                                                className="icon-sm"
                                                aria-hidden="true"
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
                                                className="icon-sm"
                                                aria-hidden="true"
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
                                    <LogIn
                                        size="1em"
                                        className="icon-lg"
                                        aria-hidden="true"
                                    />
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
                {error && <StatusBanner tone="error">{error}</StatusBanner>}
                <AlertDialog
                    open={logoutSession?.isCurrent() ?? false}
                    onOpenChange={(open) => {
                        if (!open && !logoutBusy) setLogoutSession(null);
                    }}
                >
                    <AlertDialogContent aria-label="退出登录确认">
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                有未同步的笔记草稿
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                退出后草稿仍保留在此浏览器，重新登录可继续同步。
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel
                                disabled={logoutBusy}
                                onClick={() => setLogoutSession(null)}
                            >
                                先去同步
                            </AlertDialogCancel>
                            <AlertDialogAction
                                type="button"
                                variant="destructive"
                                disabled={logoutBusy}
                                onClick={() => void requestLogout(true)}
                            >
                                仍要退出
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                {!ready
                    ? (
                        <LoadingState className="page" announce>
                            正在加载…
                        </LoadingState>
                    )
                    : (
                        <>
                            <DesktopStage />
                            <RouteErrorBoundary locationKey={location.pathname}>
                                <Suspense fallback={<RouteLoadingFallback />}>
                                    <Outlet context={outletContext} />
                                </Suspense>
                            </RouteErrorBoundary>
                            <WorkspaceDock aiAvailable={aiModels.length > 0} />
                        </>
                    )}
            </div>
        </DesktopCoordinator>
    );
}

function HomeRoute() {
    const { user } = useAppState();
    return user ? null : <SearchHome />;
}

function AskRoute() {
    const { user } = useAppState();
    return user ? null : <AskPage />;
}

function SettingsRoute() {
    const { user } = useAppState();
    const { pathname } = useLocation();
    return user && settingsTab(pathname) !== null ? null : <SettingsPage />;
}

function AccountRoute() {
    const { user } = useAppState();
    return user ? null : <AccountPage />;
}

function TrashRoute() {
    const { user } = useAppState();
    return user ? null : <TrashPage />;
}
export function App() {
    const [router] = useState(() =>
        createBrowserRouter([
            {
                path: routes.home,
                element: (
                    <AppState>
                        <TooltipProvider>
                            <DockProvider>
                                <NavigationGuardProvider>
                                    <Layout />
                                </NavigationGuardProvider>
                            </DockProvider>
                        </TooltipProvider>
                    </AppState>
                ),
                // Page links need the data router's navigation options, including
                // viewTransition; descendant <Routes> would discard them.
                children: [
                    { index: true, element: <HomeRoute /> },
                    { path: routes.designLab, element: <DesignLab /> },
                    { path: "/design-lab/motion", element: <MotionLab /> },
                    { path: "/design-lab/windows", element: <WindowLab /> },
                    { path: "/design-lab/accent", element: <AccentLab /> },
                    { path: "/design-lab/palette", element: <PaletteLab /> },
                    {
                        path: "/design-lab/illustrations",
                        element: <IllustrationLab />,
                    },
                    { path: routes.login, element: <AuthPage kind="login" /> },
                    {
                        path: routes.register,
                        element: <AuthPage kind="register" />,
                    },
                    {
                        path: `${routes.settings()}/*`,
                        element: <SettingsRoute />,
                    },
                    // Signed-in users see /ask and /ask/:id as the AI window; the
                    // route only renders the guest sign-in prompt.
                    { path: `${routes.ask}/:id?`, element: <AskRoute /> },
                    { path: routes.account, element: <AccountRoute /> },
                    {
                        path: `${routes.admin()}/overview`,
                        element: <Navigate to={routes.admin()} replace />,
                    },
                    { path: `${routes.admin()}/*`, element: <AdminPage /> },
                    { path: routes.trash, element: <TrashRoute /> },
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
