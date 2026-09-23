import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext.tsx";
import { useTheme } from "../../contexts/ThemeContext.tsx";
import { ApiError, apiFetch } from "../../lib/api.ts";
import type { ThemeId, UserDto } from "@shared/contracts.ts";
import { Laptop, Moon, Sun, TreePine, X } from "lucide-react";

interface AccountDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AccountDialog: React.FC<AccountDialogProps> = (
    { isOpen, onClose },
) => {
    const { user, login, logout } = useAuth();
    const { theme, setTheme } = useTheme();

    const [displayName, setDisplayName] = useState(user?.displayName || "");
    const [profileMsg, setProfileMsg] = useState<
        { text: string; error?: boolean } | null
    >(null);
    const [profileSubmitting, setProfileSubmitting] = useState(false);

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [pwdMsg, setPwdMsg] = useState<
        { text: string; error?: boolean } | null
    >(null);
    const [pwdSubmitting, setPwdSubmitting] = useState(false);

    const dialogRef = useRef<HTMLDialogElement | null>(null);

    useEffect(() => {
        if (user) {
            setDisplayName(user.displayName || "");
        }
    }, [user]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (isOpen) {
            if (!dialog.open) {
                dialog.showModal();
            }
            setProfileMsg(null);
            setPwdMsg(null);
            setCurrentPassword("");
            setNewPassword("");
        } else {
            if (dialog.open) {
                dialog.close();
            }
        }
    }, [isOpen]);

    const handleClose = () => {
        onClose();
    };

    if (!user) return null;

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setProfileMsg(null);
        setProfileSubmitting(true);
        try {
            const res = await apiFetch<{ user: UserDto }>("/api/account", {
                method: "PATCH",
                body: JSON.stringify({ displayName: displayName.trim() }),
            });
            if (res?.user) {
                login(res.user);
            }
            setProfileMsg({ text: "显示名称已更新" });
        } catch (err) {
            setProfileMsg({
                text: err instanceof ApiError ? err.message : "更新失败",
                error: true,
            });
        } finally {
            setProfileSubmitting(false);
        }
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPwdMsg(null);
        setPwdSubmitting(true);
        try {
            await apiFetch("/api/account/password", {
                method: "PUT",
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            alert("密码修改成功，所有设备需重新登录");
            handleClose();
            await logout();
        } catch (err) {
            setPwdMsg({
                text: err instanceof ApiError ? err.message : "修改密码失败",
                error: true,
            });
        } finally {
            setPwdSubmitting(false);
        }
    };

    const themeOptions: Array<
        { id: ThemeId; label: string; icon: React.ReactNode }
    > = [
        { id: "system", label: "跟随系统", icon: <Laptop size={16} /> },
        { id: "light", label: "浅色", icon: <Sun size={16} /> },
        { id: "dark", label: "深色", icon: <Moon size={16} /> },
        { id: "forest", label: "森林", icon: <TreePine size={16} /> },
    ];

    return (
        <dialog
            ref={dialogRef}
            className="modal-dialog"
            onCancel={(e) => {
                e.preventDefault();
                handleClose();
            }}
            style={{
                width: "100%",
                maxWidth: 460,
                maxHeight: "90vh",
                overflowY: "auto",
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 20,
                }}
            >
                <h3 style={{ fontSize: 20, fontWeight: 600 }}>账户设置</h3>
                <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleClose}
                    aria-label="关闭"
                    style={{ width: 32, height: 32, minHeight: 32, padding: 0 }}
                >
                    <X size={18} />
                </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {/* Theme Settings */}
                <div>
                    <h4
                        style={{
                            fontSize: 15,
                            fontWeight: 600,
                            marginBottom: 10,
                        }}
                    >
                        外观主题
                    </h4>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, 1fr)",
                            gap: 8,
                        }}
                    >
                        {themeOptions.map((opt) => (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={async () => {
                                    try {
                                        await setTheme(opt.id);
                                    } catch {
                                        alert("保存主题偏好失败");
                                    }
                                }}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "10px 12px",
                                    borderRadius: "var(--radius-md)",
                                    border: `1px solid ${
                                        theme === opt.id
                                            ? "var(--accent)"
                                            : "var(--border)"
                                    }`,
                                    backgroundColor: theme === opt.id
                                        ? "rgba(36, 93, 189, 0.08)"
                                        : "var(--surface)",
                                    color: "var(--text)",
                                    fontWeight: theme === opt.id ? 600 : 400,
                                    cursor: "pointer",
                                }}
                            >
                                {opt.icon}
                                <span>{opt.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <hr
                    style={{
                        border: "none",
                        borderTop: "1px solid var(--border)",
                    }}
                />

                {/* Profile settings */}
                <form
                    onSubmit={handleUpdateProfile}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                    }}
                >
                    <h4 style={{ fontSize: 15, fontWeight: 600 }}>个人资料</h4>
                    {profileMsg && (
                        <div
                            style={{
                                fontSize: 13,
                                color: profileMsg.error
                                    ? "var(--danger)"
                                    : "var(--success)",
                            }}
                        >
                            {profileMsg.text}
                        </div>
                    )}
                    <div>
                        <label
                            style={{
                                display: "block",
                                fontSize: 13,
                                color: "var(--muted)",
                                marginBottom: 4,
                            }}
                        >
                            用户名（不可更改）
                        </label>
                        <input
                            type="text"
                            className="input"
                            value={user.username}
                            disabled
                            style={{ opacity: 0.7 }}
                        />
                    </div>
                    <div>
                        <label
                            style={{
                                display: "block",
                                fontSize: 13,
                                color: "var(--muted)",
                                marginBottom: 4,
                            }}
                        >
                            显示名称
                        </label>
                        <input
                            type="text"
                            className="input"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            maxLength={40}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="btn btn-secondary"
                        disabled={profileSubmitting}
                        style={{ alignSelf: "flex-end" }}
                    >
                        {profileSubmitting ? "更新中..." : "保存资料"}
                    </button>
                </form>

                <hr
                    style={{
                        border: "none",
                        borderTop: "1px solid var(--border)",
                    }}
                />

                {/* Password update */}
                <form
                    onSubmit={handleUpdatePassword}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                    }}
                >
                    <h4 style={{ fontSize: 15, fontWeight: 600 }}>修改密码</h4>
                    {pwdMsg && (
                        <div
                            style={{
                                fontSize: 13,
                                color: pwdMsg.error
                                    ? "var(--danger)"
                                    : "var(--success)",
                            }}
                        >
                            {pwdMsg.text}
                        </div>
                    )}
                    <div>
                        <label
                            style={{
                                display: "block",
                                fontSize: 13,
                                color: "var(--muted)",
                                marginBottom: 4,
                            }}
                        >
                            当前密码
                        </label>
                        <input
                            type="password"
                            className="input"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label
                            style={{
                                display: "block",
                                fontSize: 13,
                                color: "var(--muted)",
                                marginBottom: 4,
                            }}
                        >
                            新密码（12–128 位）
                        </label>
                        <input
                            type="password"
                            className="input"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            minLength={12}
                            maxLength={128}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="btn btn-secondary"
                        disabled={pwdSubmitting}
                        style={{ alignSelf: "flex-end" }}
                    >
                        {pwdSubmitting ? "修改中..." : "确认修改密码"}
                    </button>
                </form>
            </div>
        </dialog>
    );
};
