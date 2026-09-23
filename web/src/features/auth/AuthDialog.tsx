import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext.tsx";
import { ApiError, apiFetch } from "../../lib/api.ts";
import type { UserDto } from "@shared/contracts.ts";
import { X } from "lucide-react";

interface AuthDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AuthDialog: React.FC<AuthDialogProps> = ({ isOpen, onClose }) => {
    const { login } = useAuth();
    const [mode, setMode] = useState<"login" | "register">("login");
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const dialogRef = useRef<HTMLDialogElement | null>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (isOpen) {
            if (!dialog.open) {
                dialog.showModal();
            }
            setError(null);
            setPassword("");
        } else {
            if (dialog.open) {
                dialog.close();
            }
        }
    }, [isOpen]);

    const handleClose = () => {
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            if (mode === "login") {
                const res = await apiFetch<{ user: UserDto }>(
                    "/api/auth/login",
                    {
                        method: "POST",
                        body: JSON.stringify({
                            username: username.trim().toLowerCase(),
                            password,
                        }),
                    },
                );
                login(res.user);
                handleClose();
            } else {
                const res = await apiFetch<{ user: UserDto }>(
                    "/api/auth/register",
                    {
                        method: "POST",
                        body: JSON.stringify({
                            username: username.trim().toLowerCase(),
                            displayName: displayName.trim(),
                            password,
                        }),
                    },
                );
                login(res.user);
                handleClose();
            }
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.message);
            } else {
                setError("操作失败，请稍后重试");
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <dialog
            ref={dialogRef}
            className="modal-dialog"
            onCancel={(e) => {
                e.preventDefault();
                handleClose();
            }}
            style={{ width: "100%", maxWidth: 400 }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 20,
                }}
            >
                <h3 style={{ fontSize: 20, fontWeight: 600 }}>
                    {mode === "login" ? "登录 Searcher" : "注册新账户"}
                </h3>
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

            {error && (
                <div
                    style={{
                        padding: "10px 14px",
                        borderRadius: "var(--radius-md)",
                        backgroundColor: "var(--danger-surface)",
                        color: "var(--danger)",
                        fontSize: 14,
                        marginBottom: 16,
                    }}
                >
                    {error}
                </div>
            )}

            <form
                onSubmit={handleSubmit}
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
                <div>
                    <label
                        style={{
                            display: "block",
                            fontSize: 14,
                            fontWeight: 500,
                            marginBottom: 6,
                        }}
                    >
                        用户名
                    </label>
                    <input
                        type="text"
                        className="input"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="3–32 位字母、数字或下划线"
                        pattern="[a-zA-Z0-9_]{3,32}"
                        title="用户名需为 3–32 位的字母、数字或下划线"
                        required
                    />
                </div>

                {mode === "register" && (
                    <div>
                        <label
                            style={{
                                display: "block",
                                fontSize: 14,
                                fontWeight: 500,
                                marginBottom: 6,
                            }}
                        >
                            显示名称
                        </label>
                        <input
                            type="text"
                            className="input"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="1–40 个字符"
                            maxLength={40}
                            required
                        />
                    </div>
                )}

                <div>
                    <label
                        style={{
                            display: "block",
                            fontSize: 14,
                            fontWeight: 500,
                            marginBottom: 6,
                        }}
                    >
                        密码
                    </label>
                    <input
                        type="password"
                        className="input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="12–128 位密码"
                        minLength={12}
                        maxLength={128}
                        required
                    />
                </div>

                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting}
                    style={{ marginTop: 8 }}
                >
                    {submitting
                        ? "提交中..."
                        : mode === "login"
                        ? "登录"
                        : "注册"}
                </button>

                <div
                    style={{ textAlign: "center", marginTop: 8, fontSize: 14 }}
                >
                    {mode === "login"
                        ? (
                            <span>
                                还没有账户？{" "}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode("register");
                                        setError(null);
                                    }}
                                    style={{
                                        color: "var(--accent)",
                                        textDecoration: "underline",
                                        fontWeight: 500,
                                    }}
                                >
                                    去注册
                                </button>
                            </span>
                        )
                        : (
                            <span>
                                已有账户？{" "}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode("login");
                                        setError(null);
                                    }}
                                    style={{
                                        color: "var(--accent)",
                                        textDecoration: "underline",
                                        fontWeight: 500,
                                    }}
                                >
                                    去登录
                                </button>
                            </span>
                        )}
                </div>
            </form>
        </dialog>
    );
};
