import { useState } from "react";
import {
    BrowserRouter,
    Link,
    Route,
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
import { SearchHome } from "./app/SearchHome.tsx";
import { DesignLab } from "./design-lab/DesignLab.tsx";
import { AuthPage } from "./app/AuthPage.tsx";
import { SettingsPage } from "./app/SettingsPage.tsx";
import { AskPage } from "./app/AskPage.tsx";
import { AccountPage } from "./app/AccountPage.tsx";
import { AdminPage } from "./app/AdminPage.tsx";
import { TrashPage } from "./app/TrashPage.tsx";
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
function Layout() {
    const navigate = useNavigate();
    const location = useLocation();
    const isHomePage = location.pathname === "/";
    const isAskPage = location.pathname.startsWith("/ask");
    const isSettingsPage = location.pathname.startsWith("/settings");
    const {
        user,
        ready,
        appearance,
        setAppearance,
        logout,
        syncFailed,
        connectionError,
        retryConnection,
    } = useAppState();
    const [error, setError] = useState("");
    // V-003：检测到未同步草稿时弹确认 Dialog，确认后 force 登出
    const [confirmLogout, setConfirmLogout] = useState(false);
    const wallpaperCss = (() => {
        const wp = (appearance.wallpaper || "").trim();
        if (!wp) return "none";
        if (
            wp.startsWith("linear-gradient(") ||
            wp.startsWith("radial-gradient(")
        ) {
            return wp;
        }
        if (
            wp.startsWith("/api/wallpaper/") ||
            /^https?:\/\//.test(wp) ||
            wp.startsWith("data:image/") ||
            wp.startsWith("blob:")
        ) {
            return `url(${JSON.stringify(wp)})`;
        }
        return "none";
    })();
    return (
        <div
            className="app-shell"
            data-wallpaper-image={wallpaperCss.startsWith("url(")
                ? "true"
                : undefined}
            style={{
                "--wallpaper-image": wallpaperCss,
                "--wallpaper-blur": appearance.blur + "px",
                "--wallpaper-grayscale": appearance.grayscale,
                "--wallpaper-mask": appearance.mask,
                "--search-opacity": appearance.searchOpacity ?? 1,
            } as React.CSSProperties}
        >
            {isHomePage && <div className="wallpaper" aria-hidden="true" />}
            <header className="topbar">
                <Link
                    className={`wordmark-small ${
                        isHomePage && appearance.showTitle !== false
                            ? "opacity-0 pointer-events-none select-none transition-opacity"
                            : "opacity-100 transition-opacity"
                    }`}
                    to="/"
                    aria-label="Searcher 首页"
                >
                    s.
                </Link>
                <nav className="top-actions" aria-label="账户与设置">
                    <Link
                        to="/ask"
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
                        to="/settings"
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
                            to="/settings/data"
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
                                        onClick={() => navigate("/account")}
                                    >
                                        <UserRound
                                            size={15}
                                            className="mr-2"
                                        />
                                        <span>账户与安全</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => navigate("/settings")}
                                    >
                                        <Settings
                                            size={15}
                                            className="mr-2"
                                        />
                                        <span>偏好设置</span>
                                    </DropdownMenuItem>
                                    {user.role === "admin" && (
                                        <DropdownMenuItem
                                            onClick={() => navigate("/admin")}
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
                                        onClick={() =>
                                            void logout().then((done) => {
                                                if (!done) {
                                                    setConfirmLogout(true);
                                                }
                                            }).catch((e) =>
                                                setError(String(e))
                                            )}
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
                        : (location.pathname !== "/login" &&
                            location.pathname !== "/register") && (
                            <Link
                                to="/login"
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
            <Dialog open={confirmLogout} onOpenChange={setConfirmLogout}>
                <DialogContent aria-label="退出登录确认">
                    <DialogTitle>有未同步的便签草稿</DialogTitle>
                    <DialogDescription>
                        检测到此设备有尚未同步到服务端的便签草稿。现在退出登录，草稿仍保留在此浏览器中，重新登录后可继续同步；若直接退出，未同步内容不会自动消失，但请确认已知晓。
                    </DialogDescription>
                    <DialogFooter>
                        <Button
                            type="button"
                            onClick={() => setConfirmLogout(false)}
                        >
                            先去同步
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() =>
                                void logout({ force: true }).then(() =>
                                    setConfirmLogout(false)
                                ).catch((e) => setError(String(e)))}
                        >
                            仍要退出
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {!ready ? <p className="page muted">正在加载…</p> : (
                <Routes>
                    <Route path="/" element={<SearchHome />} />
                    <Route path="/design-lab" element={<DesignLab />} />
                    <Route path="/login" element={<AuthPage kind="login" />} />
                    <Route
                        path="/register"
                        element={<AuthPage kind="register" />}
                    />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/settings/:tab" element={<SettingsPage />} />
                    <Route path="/ask" element={<AskPage />} />
                    <Route path="/account" element={<AccountPage />} />
                    <Route path="/admin/*" element={<AdminPage />} />
                    <Route path="/trash" element={<TrashPage />} />
                    <Route
                        path="*"
                        element={
                            <div className="page">
                                <h1>页面不存在</h1>
                                <Link to="/">返回首页</Link>
                            </div>
                        }
                    />
                </Routes>
            )}
        </div>
    );
}
export function App() {
    return (
        <BrowserRouter>
            <AppState>
                <Layout />
            </AppState>
        </BrowserRouter>
    );
}
