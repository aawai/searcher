import { useState } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { LogIn, Monitor, Moon, Settings, Sun, UserRound } from "lucide-react";
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from "./components/ui/dialog.tsx";
function Layout() {
    const { user, ready, appearance, setAppearance, logout, syncFailed } =
        useAppState();
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
            style={{
                "--wallpaper-image": wallpaperCss,
                "--wallpaper-blur": appearance.blur + "px",
                "--wallpaper-grayscale": appearance.grayscale,
                "--wallpaper-mask": appearance.mask,
                "--search-opacity": appearance.searchOpacity ?? 1,
            } as React.CSSProperties}
        >
            <div className="wallpaper" aria-hidden="true" />
            <header className="topbar">
                <Link
                    className="wordmark-small"
                    to="/"
                    aria-label="Searcher 首页"
                >
                    s.
                </Link>
                <nav className="top-actions" aria-label="账户与设置">
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
                    {/* Y-002: 仅在同步异常时展示全局警示 Badge */}
                    {syncFailed && (
                        <Link
                            to="/settings/data"
                            className="sync-failed-badge"
                            role="alert"
                            aria-label="偏好设置同步失败，点击查看"
                            title="部分设置未能同步到云端，点击前往设置检查"
                            style={{ color: "var(--danger)" }}
                        >
                            !
                        </Link>
                    )}
                    <Link to="/settings" aria-label="设置">
                        <Settings size={20} />
                    </Link>
                    {user
                        ? (
                            <>
                                <Link to="/account" className="user-link">
                                    <UserRound size={19} />
                                    <span>{user.displayName}</span>
                                </Link>
                                <button
                                    type="button"
                                    onClick={() =>
                                        void logout().then((done) => {
                                            if (!done) setConfirmLogout(true);
                                        }).catch((e) => setError(String(e)))}
                                    title="退出登录"
                                    aria-label="退出登录"
                                >
                                    <LogIn
                                        size={20}
                                        style={{ transform: "rotate(180deg)" }}
                                    />
                                </button>
                            </>
                        )
                        : (
                            <Link to="/login" className="user-link">
                                <LogIn size={19} />
                                <span>登录</span>
                            </Link>
                        )}
                </nav>
            </header>
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
