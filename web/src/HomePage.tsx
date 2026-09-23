import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext.tsx";
import { useTheme } from "./contexts/ThemeContext.tsx";
import { SearchBox } from "./features/search/SearchBox.tsx";
import { BookmarkList } from "./features/bookmarks/BookmarkList.tsx";
import { NoteList } from "./features/notes/NoteList.tsx";
import { AuthDialog } from "./features/auth/AuthDialog.tsx";
import { AccountDialog } from "./features/account/AccountDialog.tsx";
import {
    Laptop,
    LogOut,
    Moon,
    Shield,
    Sun,
    TreePine,
    User,
} from "lucide-react";

export const HomePage: React.FC = () => {
    const { user, logout } = useAuth();
    const { theme, setTheme } = useTheme();

    const [authDialogOpen, setAuthDialogOpen] = useState(false);
    const [accountDialogOpen, setAccountDialogOpen] = useState(false);
    const [unsavedDraftCount, setUnsavedDraftCount] = useState(0);

    const searchInputRef = useRef<HTMLInputElement | null>(null);
    // Global hotkey: '/' to focus search input if not in input/dialog
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const target = e.target as HTMLElement | null;
                const isInput = target &&
                    (target.tagName === "INPUT" ||
                        target.tagName === "TEXTAREA" ||
                        target.isContentEditable);
                if (!isInput && !authDialogOpen && !accountDialogOpen) {
                    e.preventDefault();
                    searchInputRef.current?.focus();
                }
            }
        };
        globalThis.addEventListener("keydown", handleKeyDown);
        return () => globalThis.removeEventListener("keydown", handleKeyDown);
    }, [authDialogOpen, accountDialogOpen]);

    const cycleTheme = () => {
        const themes = ["system", "light", "dark", "forest"] as const;
        const currentIndex = themes.indexOf(theme);
        const nextTheme = themes[(currentIndex + 1) % themes.length];
        setTheme(nextTheme);
    };
    const handleLogout = async () => {
        if (unsavedDraftCount > 0) {
            const confirmed = confirm(
                `您有 ${unsavedDraftCount} 条便签尚未保存，退出登录将丢失未保存内容。确定要退出吗？`,
            );
            if (!confirmed) {
                return;
            }
        }
        try {
            await logout();
        } catch (err) {
            alert(err instanceof Error ? err.message : "退出登录失败，请重试");
        }
    };

    const getThemeIcon = () => {
        switch (theme) {
            case "light":
                return <Sun size={18} />;
            case "dark":
                return <Moon size={18} />;
            case "forest":
                return <TreePine size={18} />;
            default:
                return <Laptop size={18} />;
        }
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
            }}
        >
            {/* Top Navbar */}
            <header
                style={{
                    width: "100%",
                    maxWidth: 1120,
                    margin: "0 auto",
                    padding: "16px 24px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h1
                        style={{
                            fontSize: 24,
                            fontWeight: 600,
                            letterSpacing: -0.5,
                            color: "var(--accent)",
                        }}
                    >
                        Searcher
                    </h1>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Quick theme toggle */}
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={cycleTheme}
                        aria-label={`切换外观主题 (当前: ${theme})`}
                        title={`切换外观主题 (当前: ${theme})`}
                        style={{ width: 44, height: 44, padding: 0 }}
                    >
                        {getThemeIcon()}
                    </button>

                    {user
                        ? (
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                }}
                            >
                                {user.role === "admin" && (
                                    <Link
                                        to="/admin/users"
                                        className="btn btn-ghost"
                                        aria-label="进入管理员后台"
                                        title="用户管理后台"
                                        style={{
                                            width: 44,
                                            height: 44,
                                            padding: 0,
                                        }}
                                    >
                                        <Shield size={18} />
                                    </Link>
                                )}

                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setAccountDialogOpen(true)}
                                    style={{
                                        fontSize: 14,
                                        gap: 6,
                                        padding: "0 12px",
                                        height: 40,
                                        minHeight: 40,
                                    }}
                                >
                                    <User size={16} />
                                    <span>
                                        {user.displayName || user.username}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={handleLogout}
                                    aria-label="退出登录"
                                    title={unsavedDraftCount > 0
                                        ? `退出登录 (${unsavedDraftCount}条便签未保存)`
                                        : "退出登录"}
                                    style={{
                                        width: 44,
                                        height: 44,
                                        padding: 0,
                                    }}
                                >
                                    <LogOut size={18} />
                                </button>
                            </div>
                        )
                        : (
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => setAuthDialogOpen(true)}
                                style={{
                                    fontSize: 14,
                                    height: 40,
                                    minHeight: 40,
                                    padding: "0 16px",
                                }}
                            >
                                登录 / 注册
                            </button>
                        )}
                </div>
            </header>

            {/* Main Workbench Area */}
            <main className="home-main">
                {/* Central Search Zone */}
                <section style={{ width: "100%", padding: "16px 0 8px" }}>
                    <SearchBox searchInputRef={searchInputRef} />
                </section>

                {/* Workbench: Bookmarks (flexible) & Notes (320px) */}
                <section className="workbench-grid">
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <BookmarkList />
                    </div>
                    <div className="workbench-notes">
                        <NoteList onDraftCountChange={setUnsavedDraftCount} />
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer
                style={{
                    width: "100%",
                    padding: "24px 16px",
                    textAlign: "center",
                    fontSize: 13,
                    color: "var(--muted)",
                    borderTop: "1px solid var(--border)",
                }}
            >
                <span>Searcher · 安静的个人搜索工作台</span>
            </footer>

            {/* Auth & Account Dialogs */}
            <AuthDialog
                isOpen={authDialogOpen}
                onClose={() => setAuthDialogOpen(false)}
            />
            <AccountDialog
                isOpen={accountDialogOpen}
                onClose={() => setAccountDialogOpen(false)}
            />
        </div>
    );
};
