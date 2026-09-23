import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.tsx";
import { ApiError, apiFetch } from "../../lib/api.ts";
import type { AdminUserDto } from "@shared/contracts.ts";
import {
    ArrowLeft,
    KeyRound,
    Plus,
    Search,
    UserCheck,
    UserX,
    X,
} from "lucide-react";

export const AdminUsersPage: React.FC = () => {
    const { user } = useAuth();
    const [users, setUsers] = useState<AdminUserDto[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [query, setQuery] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Create user dialog
    const [newUsername, setNewUsername] = useState("");
    const [newDisplayName, setNewDisplayName] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [createError, setCreateError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    // Reset password dialog
    const [resetTargetUser, setResetTargetUser] = useState<AdminUserDto | null>(
        null,
    );
    const [resetPassword, setResetPassword] = useState("");
    const [resetError, setResetError] = useState<string | null>(null);
    const [resetting, setResetting] = useState(false);

    const createDialogRef = useRef<HTMLDialogElement | null>(null);
    const resetDialogRef = useRef<HTMLDialogElement | null>(null);

    const fetchUsers = useCallback(async () => {
        if (!user || user.role !== "admin") return;
        setLoading(true);
        setError(null);
        try {
            const qParam = encodeURIComponent(query);
            const res = await apiFetch<
                { items: AdminUserDto[]; total: number; page: number }
            >(
                `/api/admin/users?page=${page}&q=${qParam}`,
            );
            if (res?.items) {
                setUsers(res.items);
                setTotal(res.total);
            }
        } catch (err) {
            setError(
                err instanceof ApiError ? err.message : "获取用户列表失败",
            );
        } finally {
            setLoading(false);
        }
    }, [user, page, query]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        setQuery(searchInput.trim());
    };

    const handleToggleDisabled = async (targetUser: AdminUserDto) => {
        if (targetUser.id === user?.id) {
            alert("不能禁用当前登录的自身账户");
            return;
        }
        if (targetUser.role === "admin") {
            alert("不能通过此界面禁用管理员账户");
            return;
        }

        const actionText = targetUser.disabled ? "启用" : "禁用";
        if (!confirm(`确定要${actionText}用户 "${targetUser.username}" 吗？`)) {
            return;
        }

        try {
            await apiFetch(`/api/admin/users/${targetUser.id}`, {
                method: "PATCH",
                body: JSON.stringify({ disabled: !targetUser.disabled }),
            });
            setUsers((prev) =>
                prev.map((
                    u,
                ) => (u.id === targetUser.id
                    ? { ...u, disabled: !u.disabled }
                    : u)
                )
            );
        } catch (err) {
            alert(err instanceof ApiError ? err.message : `${actionText}失败`);
        }
    };

    const openCreateDialog = () => {
        setCreateError(null);
        setNewUsername("");
        setNewDisplayName("");
        setNewPassword("");
        createDialogRef.current?.showModal();
    };

    const closeCreateDialog = () => {
        createDialogRef.current?.close();
    };

    const openResetDialog = (u: AdminUserDto) => {
        setResetTargetUser(u);
        setResetPassword("");
        setResetError(null);
        resetDialogRef.current?.showModal();
    };

    const closeResetDialog = () => {
        setResetTargetUser(null);
        resetDialogRef.current?.close();
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateError(null);
        setCreating(true);
        try {
            await apiFetch("/api/admin/users", {
                method: "POST",
                body: JSON.stringify({
                    username: newUsername.trim().toLowerCase(),
                    displayName: newDisplayName.trim(),
                    password: newPassword,
                }),
            });
            closeCreateDialog();
            fetchUsers();
        } catch (err) {
            setCreateError(
                err instanceof ApiError ? err.message : "创建用户失败",
            );
        } finally {
            setCreating(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetTargetUser) return;
        setResetError(null);
        setResetting(true);
        try {
            await apiFetch(`/api/admin/users/${resetTargetUser.id}/password`, {
                method: "PUT",
                body: JSON.stringify({ password: resetPassword }),
            });
            alert(
                `已重置用户 "${resetTargetUser.username}" 的密码，该用户所有已登录设备均已被强制下线`,
            );
            closeResetDialog();
        } catch (err) {
            setResetError(
                err instanceof ApiError ? err.message : "重置密码失败",
            );
        } finally {
            setResetting(false);
        }
    };

    if (!user || user.role !== "admin") {
        return (
            <div style={{ padding: 48, textAlign: "center" }}>
                <h2 style={{ marginBottom: 16 }}>无权访问</h2>
                <p style={{ color: "var(--muted)", marginBottom: 24 }}>
                    仅管理员账户可进入用户管理后台
                </p>
                <Link to="/" className="btn btn-primary">
                    返回主页
                </Link>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 16px" }}>
            {/* Header bar */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 24,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Link
                        to="/"
                        className="btn btn-ghost"
                        aria-label="返回首页"
                        style={{ padding: "0 8px" }}
                    >
                        <ArrowLeft size={18} />
                    </Link>
                    <h2 style={{ fontSize: 22, fontWeight: 600 }}>
                        用户管理后台
                    </h2>
                </div>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={openCreateDialog}
                >
                    <Plus size={16} />
                    <span>新建普通用户</span>
                </button>
            </div>

            {/* Filter bar */}
            <form
                onSubmit={handleSearch}
                style={{
                    display: "flex",
                    gap: 8,
                    marginBottom: 20,
                    maxWidth: 420,
                }}
            >
                <div style={{ position: "relative", flex: 1 }}>
                    <input
                        type="text"
                        className="input"
                        value={searchInput}
                        onChange={(e) =>
                            setSearchInput(e.target.value)}
                        placeholder="搜索用户名或显示名称..."
                        maxLength={64}
                    />
                </div>
                <button type="submit" className="btn btn-secondary">
                    <Search size={16} />
                    <span>搜索</span>
                </button>
            </form>

            {error && (
                <div
                    style={{
                        padding: 16,
                        backgroundColor: "var(--danger-surface)",
                        color: "var(--danger)",
                        borderRadius: "var(--radius-md)",
                        marginBottom: 16,
                    }}
                >
                    {error}
                </div>
            )}

            {/* Users table / responsive cards */}
            <div
                style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                    overflow: "hidden",
                }}
            >
                {loading && users.length === 0
                    ? (
                        <div
                            style={{
                                padding: 48,
                                textAlign: "center",
                                color: "var(--muted)",
                            }}
                        >
                            正在加载用户数据...
                        </div>
                    )
                    : users.length === 0
                    ? (
                        <div
                            style={{
                                padding: 48,
                                textAlign: "center",
                                color: "var(--muted)",
                            }}
                        >
                            没有匹配的用户
                        </div>
                    )
                    : (
                        <>
                            {/* Desktop Table View */}
                            <div className="admin-table-container">
                                <table
                                    style={{
                                        width: "100%",
                                        borderCollapse: "collapse",
                                        textAlign: "left",
                                        fontSize: 14,
                                    }}
                                >
                                    <thead>
                                        <tr
                                            style={{
                                                borderBottom:
                                                    "1px solid var(--border)",
                                                backgroundColor:
                                                    "rgba(0,0,0,0.02)",
                                            }}
                                        >
                                            <th
                                                style={{
                                                    padding: "12px 16px",
                                                    fontWeight: 600,
                                                }}
                                            >
                                                用户名
                                            </th>
                                            <th
                                                style={{
                                                    padding: "12px 16px",
                                                    fontWeight: 600,
                                                }}
                                            >
                                                显示名称
                                            </th>
                                            <th
                                                style={{
                                                    padding: "12px 16px",
                                                    fontWeight: 600,
                                                }}
                                            >
                                                角色
                                            </th>
                                            <th
                                                style={{
                                                    padding: "12px 16px",
                                                    fontWeight: 600,
                                                }}
                                            >
                                                状态
                                            </th>
                                            <th
                                                style={{
                                                    padding: "12px 16px",
                                                    fontWeight: 600,
                                                }}
                                            >
                                                注册时间
                                            </th>
                                            <th
                                                style={{
                                                    padding: "12px 16px",
                                                    fontWeight: 600,
                                                    textAlign: "right",
                                                }}
                                            >
                                                操作
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map((u) => {
                                            const isSelf = u.id === user.id;
                                            const isAdmin = u.role === "admin";
                                            return (
                                                <tr
                                                    key={u.id}
                                                    style={{
                                                        borderBottom:
                                                            "1px solid var(--border)",
                                                    }}
                                                >
                                                    <td
                                                        style={{
                                                            padding:
                                                                "12px 16px",
                                                            fontWeight: 500,
                                                        }}
                                                    >
                                                        {u.username}
                                                        {isSelf && (
                                                            <span
                                                                style={{
                                                                    marginLeft:
                                                                        6,
                                                                    fontSize:
                                                                        11,
                                                                    backgroundColor:
                                                                        "var(--accent)",
                                                                    color:
                                                                        "#fff",
                                                                    padding:
                                                                        "2px 6px",
                                                                    borderRadius:
                                                                        "var(--radius-sm)",
                                                                }}
                                                            >
                                                                你自己
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding:
                                                                "12px 16px",
                                                        }}
                                                    >
                                                        {u.displayName}
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding:
                                                                "12px 16px",
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                fontSize: 12,
                                                                padding:
                                                                    "2px 6px",
                                                                borderRadius:
                                                                    "var(--radius-sm)",
                                                                backgroundColor:
                                                                    isAdmin
                                                                        ? "rgba(36, 93, 189, 0.12)"
                                                                        : "var(--border)",
                                                                color: isAdmin
                                                                    ? "var(--accent)"
                                                                    : "var(--muted)",
                                                                fontWeight:
                                                                    isAdmin
                                                                        ? 600
                                                                        : 400,
                                                            }}
                                                        >
                                                            {isAdmin
                                                                ? "管理员"
                                                                : "普通用户"}
                                                        </span>
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding:
                                                                "12px 16px",
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                color:
                                                                    u.disabled
                                                                        ? "var(--danger)"
                                                                        : "var(--success)",
                                                                display:
                                                                    "inline-flex",
                                                                alignItems:
                                                                    "center",
                                                                gap: 4,
                                                                fontSize: 13,
                                                            }}
                                                        >
                                                            {u.disabled
                                                                ? (
                                                                    <UserX
                                                                        size={14}
                                                                    />
                                                                )
                                                                : (
                                                                    <UserCheck
                                                                        size={14}
                                                                    />
                                                                )}
                                                            {u.disabled
                                                                ? "已禁用"
                                                                : "正常"}
                                                        </span>
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding:
                                                                "12px 16px",
                                                            color:
                                                                "var(--muted)",
                                                        }}
                                                    >
                                                        {new Date(u.createdAt)
                                                            .toLocaleDateString(
                                                                "zh-CN",
                                                            )}
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding:
                                                                "12px 16px",
                                                            textAlign: "right",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display:
                                                                    "inline-flex",
                                                                gap: 6,
                                                            }}
                                                        >
                                                            {!isAdmin && (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-ghost"
                                                                        onClick={() =>
                                                                            handleToggleDisabled(
                                                                                u,
                                                                            )}
                                                                        style={{
                                                                            fontSize:
                                                                                13,
                                                                            height:
                                                                                32,
                                                                            minHeight:
                                                                                32,
                                                                            padding:
                                                                                "0 8px",
                                                                            color:
                                                                                u.disabled
                                                                                    ? "var(--success)"
                                                                                    : "var(--danger)",
                                                                        }}
                                                                    >
                                                                        {u.disabled
                                                                            ? "启用"
                                                                            : "禁用"}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-ghost"
                                                                        onClick={() =>
                                                                            openResetDialog(
                                                                                u,
                                                                            )}
                                                                        style={{
                                                                            fontSize:
                                                                                13,
                                                                            height:
                                                                                32,
                                                                            minHeight:
                                                                                32,
                                                                            padding:
                                                                                "0 8px",
                                                                        }}
                                                                    >
                                                                        <KeyRound
                                                                            size={14}
                                                                        />
                                                                        <span>
                                                                            重置密码
                                                                        </span>
                                                                    </button>
                                                                </>
                                                            )}
                                                            {isAdmin &&
                                                                !isSelf && (
                                                                <span
                                                                    style={{
                                                                        fontSize:
                                                                            12,
                                                                        color:
                                                                            "var(--muted)",
                                                                    }}
                                                                >
                                                                    不可操作其他管理员
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Card List View */}
                            <div className="admin-cards-container">
                                {users.map((u) => {
                                    const isSelf = u.id === user.id;
                                    const isAdmin = u.role === "admin";
                                    return (
                                        <div
                                            key={u.id}
                                            style={{
                                                padding: 16,
                                                borderBottom:
                                                    "1px solid var(--border)",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 8,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent:
                                                        "space-between",
                                                    alignItems: "center",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        fontWeight: 600,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 6,
                                                    }}
                                                >
                                                    <span>{u.username}</span>
                                                    {isSelf && (
                                                        <span
                                                            style={{
                                                                fontSize: 11,
                                                                backgroundColor:
                                                                    "var(--accent)",
                                                                color: "#fff",
                                                                padding:
                                                                    "2px 6px",
                                                                borderRadius:
                                                                    "var(--radius-sm)",
                                                            }}
                                                        >
                                                            你自己
                                                        </span>
                                                    )}
                                                </div>
                                                <span
                                                    style={{
                                                        color: u.disabled
                                                            ? "var(--danger)"
                                                            : "var(--success)",
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: 4,
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    {u.disabled
                                                        ? <UserX size={14} />
                                                        : (
                                                            <UserCheck
                                                                size={14}
                                                            />
                                                        )}
                                                    {u.disabled
                                                        ? "已禁用"
                                                        : "正常"}
                                                </span>
                                            </div>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent:
                                                        "space-between",
                                                    fontSize: 13,
                                                    color: "var(--muted)",
                                                }}
                                            >
                                                <span>
                                                    显示名：{u.displayName}
                                                </span>
                                                <span>
                                                    {isAdmin
                                                        ? "管理员"
                                                        : "普通用户"} ·{" "}
                                                    {new Date(u.createdAt)
                                                        .toLocaleDateString(
                                                            "zh-CN",
                                                        )}
                                                </span>
                                            </div>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "flex-end",
                                                    gap: 8,
                                                    marginTop: 4,
                                                }}
                                            >
                                                {!isAdmin && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary"
                                                            onClick={() =>
                                                                handleToggleDisabled(
                                                                    u,
                                                                )}
                                                            style={{
                                                                fontSize: 13,
                                                                height: 32,
                                                                minHeight: 32,
                                                                padding:
                                                                    "0 10px",
                                                                color:
                                                                    u.disabled
                                                                        ? "var(--success)"
                                                                        : "var(--danger)",
                                                            }}
                                                        >
                                                            {u.disabled
                                                                ? "启用"
                                                                : "禁用"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary"
                                                            onClick={() =>
                                                                openResetDialog(
                                                                    u,
                                                                )}
                                                            style={{
                                                                fontSize: 13,
                                                                height: 32,
                                                                minHeight: 32,
                                                                padding:
                                                                    "0 10px",
                                                            }}
                                                        >
                                                            <KeyRound
                                                                size={14}
                                                            />
                                                            <span>
                                                                重置密码
                                                            </span>
                                                        </button>
                                                    </>
                                                )}
                                                {isAdmin && !isSelf && (
                                                    <span
                                                        style={{
                                                            fontSize: 12,
                                                            color:
                                                                "var(--muted)",
                                                            paddingTop: 6,
                                                        }}
                                                    >
                                                        不可操作其他管理员
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                {/* Pagination */}
                {total > 50 && (
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "12px 16px",
                            borderTop: "1px solid var(--border)",
                        }}
                    >
                        <span style={{ fontSize: 13, color: "var(--muted)" }}>
                            共 {total} 名用户
                        </span>
                        <div style={{ display: "flex", gap: 8 }}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={page <= 1}
                                onClick={() => setPage((p) => p - 1)}
                                style={{
                                    height: 32,
                                    minHeight: 32,
                                    fontSize: 13,
                                    padding: "0 10px",
                                }}
                            >
                                上一页
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={page * 50 >= total}
                                onClick={() => setPage((p) => p + 1)}
                                style={{
                                    height: 32,
                                    minHeight: 32,
                                    fontSize: 13,
                                    padding: "0 10px",
                                }}
                            >
                                下一页
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create User Dialog */}
            <dialog
                ref={createDialogRef}
                className="modal-dialog"
                onCancel={(e) => {
                    e.preventDefault();
                    closeCreateDialog();
                }}
                style={{ width: "100%", maxWidth: 400 }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 16,
                    }}
                >
                    <h3 style={{ fontSize: 18, fontWeight: 600 }}>
                        新建普通用户
                    </h3>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={closeCreateDialog}
                        style={{
                            width: 32,
                            height: 32,
                            minHeight: 32,
                            padding: 0,
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {createError && (
                    <div
                        style={{
                            padding: "8px 12px",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: "var(--danger-surface)",
                            color: "var(--danger)",
                            fontSize: 13,
                            marginBottom: 12,
                        }}
                    >
                        {createError}
                    </div>
                )}

                <form
                    onSubmit={handleCreateUser}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                    }}
                >
                    <div>
                        <label
                            style={{
                                display: "block",
                                fontSize: 13,
                                fontWeight: 500,
                                marginBottom: 4,
                            }}
                        >
                            用户名
                        </label>
                        <input
                            type="text"
                            className="input"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            placeholder="3–32 位字母、数字或下划线"
                            pattern="[a-zA-Z0-9_]{3,32}"
                            title="用户名需为 3–32 位的字母、数字或下划线"
                            required
                        />
                    </div>

                    <div>
                        <label
                            style={{
                                display: "block",
                                fontSize: 13,
                                fontWeight: 500,
                                marginBottom: 4,
                            }}
                        >
                            显示名称
                        </label>
                        <input
                            type="text"
                            className="input"
                            value={newDisplayName}
                            onChange={(e) => setNewDisplayName(e.target.value)}
                            placeholder="1–40 个字符"
                            maxLength={40}
                            required
                        />
                    </div>

                    <div>
                        <label
                            style={{
                                display: "block",
                                fontSize: 13,
                                fontWeight: 500,
                                marginBottom: 4,
                            }}
                        >
                            初始密码
                        </label>
                        <input
                            type="password"
                            className="input"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="12–128 位密码"
                            minLength={12}
                            maxLength={128}
                            required
                        />
                    </div>

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: 8,
                            marginTop: 8,
                        }}
                    >
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={closeCreateDialog}
                            disabled={creating}
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={creating}
                        >
                            {creating ? "创建中..." : "创建用户"}
                        </button>
                    </div>
                </form>
            </dialog>

            {/* Reset Password Dialog */}
            <dialog
                ref={resetDialogRef}
                className="modal-dialog"
                onCancel={(e) => {
                    e.preventDefault();
                    closeResetDialog();
                }}
                style={{ width: "100%", maxWidth: 400 }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 16,
                    }}
                >
                    <h3 style={{ fontSize: 18, fontWeight: 600 }}>
                        重置密码: {resetTargetUser?.username}
                    </h3>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={closeResetDialog}
                        style={{
                            width: 32,
                            height: 32,
                            minHeight: 32,
                            padding: 0,
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {resetError && (
                    <div
                        style={{
                            padding: "8px 12px",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: "var(--danger-surface)",
                            color: "var(--danger)",
                            fontSize: 13,
                            marginBottom: 12,
                        }}
                    >
                        {resetError}
                    </div>
                )}

                <form
                    onSubmit={handleResetPassword}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                    }}
                >
                    <div>
                        <label
                            style={{
                                display: "block",
                                fontSize: 13,
                                fontWeight: 500,
                                marginBottom: 4,
                            }}
                        >
                            新密码
                        </label>
                        <input
                            type="password"
                            className="input"
                            value={resetPassword}
                            onChange={(e) => setResetPassword(e.target.value)}
                            placeholder="12–128 位新密码"
                            minLength={12}
                            maxLength={128}
                            required
                        />
                    </div>

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: 8,
                            marginTop: 8,
                        }}
                    >
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={closeResetDialog}
                            disabled={resetting}
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={resetting}
                        >
                            {resetting ? "重置中..." : "确认重置"}
                        </button>
                    </div>
                </form>
            </dialog>
        </div>
    );
};
