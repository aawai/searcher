import { type FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
    Activity,
    AlertTriangle,
    Bot,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    FileText,
    HardDrive,
    KeyRound,
    RefreshCw,
    Search,
    Shield,
    Sliders,
    Trash2,
    UserCheck,
    UserPlus,
    Users,
    UserX,
    X,
} from "lucide-react";
import { AdminOverview } from "./AdminOverview.tsx";
import { AdminSystemSettings } from "./AdminSystemSettings.tsx";
import { AdminBackupRestore } from "./AdminBackupRestore.tsx";
import type { AdminUserDto } from "@shared/contracts.ts";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog.tsx";
import { Button } from "../components/ui/button.tsx";
import { api, json } from "../lib/api.ts";
import { errorMessage, useAppState } from "./state.tsx";

interface AuditLogItem {
    id: string;
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown> | null;
    createdAt: number;
}

interface UserListResponse {
    items: AdminUserDto[];
    page: number;
    total: number;
}

interface AuditLogResponse {
    items: AuditLogItem[];
    page: number;
    limit: number;
    total: number;
}

function formatTime(timestamp: number | null | undefined): string {
    if (!timestamp) return "—";
    const date = new Date(timestamp);
    return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function actionLabel(
    action: string,
): { label: string; tone: "info" | "warning" | "danger" | "success" } {
    switch (action) {
        case "admin.user.create":
            return { label: "创建用户", tone: "success" };
        case "admin.user.disable":
            return { label: "禁用用户", tone: "warning" };
        case "admin.user.enable":
            return { label: "启用用户", tone: "info" };
        case "admin.user.reset_password":
            return { label: "重置密码", tone: "warning" };
        case "admin.user.delete":
            return { label: "删除用户", tone: "danger" };
        default:
            return { label: action, tone: "info" };
    }
}

export function AdminPage() {
    const { user: currentUser } = useAppState();
    const location = useLocation();
    const navigate = useNavigate();

    // 根据当前 URL 路径解析 activeTab
    const pathTab = location.pathname.replace(/^\/admin\/?/, "").split("/")[0];
    const activeTab =
        (pathTab === "users" || pathTab === "settings" || pathTab === "audit" ||
                pathTab === "backup")
            ? pathTab
            : "overview";

    const setActiveTab = (
        tab: "overview" | "users" | "settings" | "audit" | "backup",
    ) => {
        const targetPath = tab === "overview" ? "/admin" : `/admin/${tab}`;
        navigate(targetPath);
    };
    // User management state
    const [users, setUsers] = useState<AdminUserDto[]>([]);
    const [userTotal, setUserTotal] = useState(0);
    const [userPage, setUserPage] = useState(1);
    const [userSearch, setUserSearch] = useState("");
    const [submittedSearch, setSubmittedSearch] = useState("");
    const [usersLoading, setUsersLoading] = useState(false);
    const [userError, setUserError] = useState("");
    const [userSuccess, setUserSuccess] = useState("");

    // Create user modal state
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [newUsername, setNewUsername] = useState("");
    const [newDisplayName, setNewDisplayName] = useState("");
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [createBusy, setCreateBusy] = useState(false);
    const [createError, setCreateError] = useState("");

    // Reset password modal state
    const [resetModalUser, setResetModalUser] = useState<AdminUserDto | null>(
        null,
    );
    const [resetNewPassword, setResetNewPassword] = useState("");
    const [resetBusy, setResetBusy] = useState(false);
    const [resetError, setResetError] = useState("");

    // Delete confirmation modal state (two-stage delete)
    const [deleteModalUser, setDeleteModalUser] = useState<AdminUserDto | null>(
        null,
    );
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteError, setDeleteError] = useState("");

    // Toggle status state
    const [togglingId, setTogglingId] = useState<string | null>(null);

    // Audit logs state
    const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
    const [auditTotal, setAuditTotal] = useState(0);
    const [auditPage, setAuditPage] = useState(1);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditError, setAuditError] = useState("");
    const [auditActionFilter, setAuditActionFilter] = useState("");

    // Load users
    const loadUsers = async (page = userPage, q = submittedSearch) => {
        if (currentUser?.role !== "admin") return;
        setUsersLoading(true);
        setUserError("");
        try {
            const queryParams = new URLSearchParams();
            queryParams.set("page", String(page));
            if (q.trim()) queryParams.set("q", q.trim());

            const res = await api<UserListResponse>(
                `/api/admin/users?${queryParams.toString()}`,
            );
            setUsers(res.items);
            setUserTotal(res.total);
            setUserPage(res.page);
        } catch (err) {
            setUserError(errorMessage(err));
        } finally {
            setUsersLoading(false);
        }
    };

    // Load audit logs
    const loadAuditLogs = async (
        page = auditPage,
        action = auditActionFilter,
    ) => {
        if (currentUser?.role !== "admin") return;
        setAuditLoading(true);
        setAuditError("");
        try {
            const queryParams = new URLSearchParams();
            queryParams.set("page", String(page));
            queryParams.set("limit", "25");
            if (action) queryParams.set("action", action);

            const res = await api<AuditLogResponse>(
                `/api/admin/audit-logs?${queryParams.toString()}`,
            );
            setAuditLogs(res.items);
            setAuditTotal(res.total);
            setAuditPage(res.page);
        } catch (err) {
            setAuditError(errorMessage(err));
        } finally {
            setAuditLoading(false);
        }
    };

    useEffect(() => {
        if (currentUser?.role === "admin") {
            void loadUsers(userPage, submittedSearch);
            if (activeTab === "audit") {
                void loadAuditLogs(auditPage, auditActionFilter);
            }
        }
    }, [
        currentUser,
        activeTab,
        userPage,
        submittedSearch,
        auditPage,
        auditActionFilter,
    ]);

    // Handle user search submit
    const handleSearchSubmit = (e: FormEvent) => {
        e.preventDefault();
        setUserPage(1);
        setSubmittedSearch(userSearch);
    };

    // Handle user creation
    const handleCreateUser = async (e: FormEvent) => {
        e.preventDefault();
        setCreateError("");
        if (newPassword.length < 12) {
            setCreateError("密码长度不能小于 12 个字符");
            return;
        }

        setCreateBusy(true);
        try {
            await api(
                "/api/admin/users",
                json("POST", {
                    username: newUsername.trim().toLowerCase(),
                    displayName: newDisplayName.trim(),
                    email: newEmail.trim() || undefined,
                    password: newPassword,
                }),
            );
            setUserSuccess(`用户 @${newUsername} 创建成功`);
            setCreateModalOpen(false);
            setNewUsername("");
            setNewDisplayName("");
            setNewEmail("");
            setNewPassword("");
            await loadUsers(1, submittedSearch);
        } catch (err) {
            setCreateError(errorMessage(err));
        } finally {
            setCreateBusy(false);
        }
    };

    // Handle user enable/disable
    const handleToggleDisable = async (targetUser: AdminUserDto) => {
        if (targetUser.id === currentUser?.id) {
            setUserError("不能修改当前登录管理员的状态");
            return;
        }
        if (targetUser.role === "admin") {
            setUserError("不能禁用管理员账户");
            return;
        }

        setTogglingId(targetUser.id);
        setUserError("");
        setUserSuccess("");
        const nextDisabled = !targetUser.disabled;
        try {
            await api(
                `/api/admin/users/${targetUser.id}`,
                json("PATCH", { disabled: nextDisabled }),
            );
            setUserSuccess(
                `已${
                    nextDisabled ? "禁用" : "启用"
                }用户 @${targetUser.username}`,
            );
            await loadUsers();
        } catch (err) {
            setUserError(errorMessage(err));
        } finally {
            setTogglingId(null);
        }
    };

    // Handle reset password submit
    const handleResetPasswordSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!resetModalUser) return;
        setResetError("");

        if (resetNewPassword.length < 12) {
            setResetError("新密码长度不能少于 12 位");
            return;
        }

        setResetBusy(true);
        try {
            await api(
                `/api/admin/users/${resetModalUser.id}/password`,
                json("PUT", { password: resetNewPassword }),
            );
            setUserSuccess(
                `已重置 @${resetModalUser.username} 的密码，已强制下次登录修改密码，并撤销其全部会话。`,
            );
            setResetModalUser(null);
            setResetNewPassword("");
            await loadUsers();
        } catch (err) {
            setResetError(errorMessage(err));
        } finally {
            setResetBusy(false);
        }
    };

    // Handle soft delete submit (two-stage delete)
    const handleDeleteSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!deleteModalUser) return;
        setDeleteError("");

        if (
            deleteConfirmText !== deleteModalUser.username &&
            deleteConfirmText !== "CONFIRM"
        ) {
            setDeleteError(
                `请输入完整的用户名 @${deleteModalUser.username} 或 CONFIRM 以确认`,
            );
            return;
        }

        setDeleteBusy(true);
        try {
            await api(
                `/api/admin/users/${deleteModalUser.id}?confirm=true`,
                { method: "DELETE" },
            );
            setUserSuccess(
                `已删除用户 @${deleteModalUser.username}，其会话已立即终止。`,
            );
            setDeleteModalUser(null);
            setDeleteConfirmText("");
            await loadUsers();
        } catch (err) {
            setDeleteError(errorMessage(err));
        } finally {
            setDeleteBusy(false);
        }
    };

    // Non-admin permission check
    if (!currentUser || currentUser.role !== "admin") {
        return (
            <main className="page" style={{ maxWidth: 540 }}>
                <div
                    style={{
                        padding: "40px 24px",
                        textAlign: "center",
                        background: "var(--surface)",
                        borderRadius: "var(--radius)",
                        border: "1px solid var(--border)",
                        boxShadow: "var(--shadow)",
                    }}
                >
                    <Shield
                        size={44}
                        style={{
                            color: "var(--danger)",
                            margin: "0 auto 16px",
                        }}
                    />
                    <h1 style={{ fontSize: "24px", marginBottom: "12px" }}>
                        无权访问
                    </h1>
                    <p className="muted" style={{ marginBottom: "24px" }}>
                        管理后台仅对系统管理员开放。当前账户未获得管理员授权。
                    </p>
                    <Link to="/" className="button button--subtle">
                        返回首页
                    </Link>
                </div>
            </main>
        );
    }

    const totalPages = Math.max(1, Math.ceil(userTotal / 50));
    const auditTotalPages = Math.max(1, Math.ceil(auditTotal / 25));

    return (
        <main className="page" style={{ maxWidth: 1100 }}>
            {/* Header */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "16px",
                    marginBottom: "24px",
                }}
            >
                <div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                        }}
                    >
                        <Shield size={24} style={{ color: "var(--accent)" }} />
                        <h1
                            style={{
                                margin: 0,
                                fontSize: "clamp(24px, 3.2vw, 34px)",
                            }}
                        >
                            系统管理后台
                        </h1>
                    </div>
                    <p className="muted" style={{ margin: "6px 0 0" }}>
                        用户账户维护、权限控制及系统审计日志
                    </p>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                    <Link to="/account" className="button button--subtle">
                        个人安全设置
                    </Link>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div
                style={{
                    display: "flex",
                    gap: "8px",
                    borderBottom: "1px solid var(--border)",
                    marginBottom: "24px",
                    paddingBottom: "8px",
                }}
            >
                <button
                    type="button"
                    onClick={() => setActiveTab("overview")}
                    className="button"
                    style={{
                        background: activeTab === "overview"
                            ? "var(--surface)"
                            : "transparent",
                        borderColor: activeTab === "overview"
                            ? "var(--accent)"
                            : "transparent",
                        color: activeTab === "overview"
                            ? "var(--accent)"
                            : "var(--foreground)",
                        fontWeight: activeTab === "overview" ? 700 : 500,
                    }}
                >
                    <Activity size={18} />
                    <span>系统概览</span>
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("users")}
                    className="button"
                    style={{
                        background: activeTab === "users"
                            ? "var(--surface)"
                            : "transparent",
                        borderColor: activeTab === "users"
                            ? "var(--accent)"
                            : "transparent",
                        color: activeTab === "users"
                            ? "var(--accent)"
                            : "var(--foreground)",
                        fontWeight: activeTab === "users" ? 700 : 500,
                    }}
                >
                    <Users size={18} />
                    <span>用户管理 ({userTotal})</span>
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("settings")}
                    className="button"
                    style={{
                        background: activeTab === "settings"
                            ? "var(--surface)"
                            : "transparent",
                        borderColor: activeTab === "settings"
                            ? "var(--accent)"
                            : "transparent",
                        color: activeTab === "settings"
                            ? "var(--accent)"
                            : "var(--foreground)",
                        fontWeight: activeTab === "settings" ? 700 : 500,
                    }}
                >
                    <Sliders size={18} />
                    <span>系统设置</span>
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("audit")}
                    className="button"
                    style={{
                        background: activeTab === "audit"
                            ? "var(--surface)"
                            : "transparent",
                        borderColor: activeTab === "audit"
                            ? "var(--accent)"
                            : "transparent",
                        color: activeTab === "audit"
                            ? "var(--accent)"
                            : "var(--foreground)",
                        fontWeight: activeTab === "audit" ? 700 : 500,
                    }}
                >
                    <FileText size={18} />
                    <span>审计日志</span>
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("backup")}
                    className="button"
                    style={{
                        background: activeTab === "backup"
                            ? "var(--surface)"
                            : "transparent",
                        borderColor: activeTab === "backup"
                            ? "var(--accent)"
                            : "transparent",
                        color: activeTab === "backup"
                            ? "var(--accent)"
                            : "var(--foreground)",
                        fontWeight: activeTab === "backup" ? 700 : 500,
                    }}
                >
                    <HardDrive size={18} />
                    <span>备份与恢复</span>
                </button>
                <Link
                    to="/settings"
                    className="button button--subtle"
                    style={{
                        marginLeft: "auto",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                    }}
                >
                    <Bot size={16} />
                    <span>AI Providers</span>
                </Link>
            </div>

            {/* Notifications */}
            {userSuccess && (
                <div
                    role="status"
                    style={{
                        padding: "12px 18px",
                        borderRadius: "10px",
                        background:
                            "color-mix(in srgb, var(--success) 12%, var(--surface))",
                        border: "1px solid var(--success)",
                        color: "var(--foreground)",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        marginBottom: "20px",
                        fontSize: "14px",
                    }}
                >
                    <CheckCircle2
                        size={18}
                        style={{ color: "var(--success)", flexShrink: 0 }}
                    />
                    <span>{userSuccess}</span>
                    <button
                        type="button"
                        onClick={() => setUserSuccess("")}
                        style={{
                            marginLeft: "auto",
                            border: "none",
                            background: "none",
                            color: "var(--muted)",
                            cursor: "pointer",
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>
            )}
            {userError && (
                <div
                    role="alert"
                    style={{
                        padding: "12px 18px",
                        borderRadius: "10px",
                        background:
                            "color-mix(in srgb, var(--danger) 12%, var(--surface))",
                        border: "1px solid var(--danger)",
                        color: "var(--danger)",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        marginBottom: "20px",
                        fontSize: "14px",
                    }}
                >
                    <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                    <span>{userError}</span>
                    <button
                        type="button"
                        onClick={() => setUserError("")}
                        style={{
                            marginLeft: "auto",
                            border: "none",
                            background: "none",
                            color: "inherit",
                            cursor: "pointer",
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* ===================== Tab 0: Overview ===================== */}
            {activeTab === "overview" && (
                <AdminOverview onNavigateTab={(t) => setActiveTab(t)} />
            )}

            {/* ===================== Tab 1: Users ===================== */}
            {activeTab === "users" && (
                <section
                    style={{
                        background: "var(--surface)",
                        borderRadius: "var(--radius)",
                        border: "1px solid var(--border)",
                        boxShadow: "var(--shadow)",
                        padding: "clamp(18px, 3vw, 28px)",
                    }}
                >
                    {/* Toolbar */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "12px",
                            marginBottom: "20px",
                        }}
                    >
                        <form
                            onSubmit={handleSearchSubmit}
                            style={{
                                display: "flex",
                                gap: "8px",
                                flex: "1 1 280px",
                                maxWidth: "460px",
                            }}
                        >
                            <div
                                style={{ position: "relative", width: "100%" }}
                            >
                                <Search
                                    size={18}
                                    style={{
                                        position: "absolute",
                                        left: "12px",
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        color: "var(--muted)",
                                    }}
                                />
                                <input
                                    type="text"
                                    value={userSearch}
                                    onChange={(e) =>
                                        setUserSearch(e.target.value)}
                                    placeholder="按用户名、显示名称或邮箱搜索…"
                                    style={{
                                        width: "100%",
                                        minHeight: "42px",
                                        padding: "8px 12px 8px 38px",
                                        borderRadius: "9px",
                                        border: "1px solid var(--border)",
                                        background: "var(--surface-soft)",
                                        color: "var(--foreground)",
                                    }}
                                />
                            </div>
                            <Button
                                variant="outline"
                                type="submit"
                                style={{ minHeight: "42px", padding: "0 14px" }}
                            >
                                搜索
                            </Button>
                            {submittedSearch && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setUserSearch("");
                                        setSubmittedSearch("");
                                    }}
                                    className="button button--subtle"
                                    style={{
                                        minHeight: "42px",
                                        padding: "0 12px",
                                    }}
                                    title="清空搜索"
                                >
                                    清除
                                </button>
                            )}
                        </form>

                        <div style={{ display: "flex", gap: "8px" }}>
                            <button
                                type="button"
                                onClick={() => void loadUsers()}
                                disabled={usersLoading}
                                className="button button--subtle"
                                style={{ minHeight: "42px", padding: "0 14px" }}
                                title="刷新用户列表"
                            >
                                <RefreshCw
                                    size={16}
                                    className={usersLoading ? "spin" : ""}
                                />
                                <span>刷新</span>
                            </button>
                            <Button
                                variant="default"
                                type="button"
                                onClick={() => setCreateModalOpen(true)}
                                style={{ minHeight: "42px", padding: "0 16px" }}
                            >
                                <UserPlus size={18} />
                                <span>添加新用户</span>
                            </Button>
                        </div>
                    </div>

                    {/* Table */}
                    {usersLoading && users.length === 0
                        ? (
                            <p
                                className="muted"
                                style={{
                                    padding: "48px 0",
                                    textAlign: "center",
                                }}
                            >
                                正在载入用户数据…
                            </p>
                        )
                        : users.length === 0
                        ? (
                            <div
                                style={{
                                    padding: "48px 0",
                                    textAlign: "center",
                                }}
                            >
                                <p
                                    className="muted"
                                    style={{ margin: "0 0 16px" }}
                                >
                                    未找到符合条件的用户
                                </p>
                                {submittedSearch && (
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setUserSearch("");
                                            setSubmittedSearch("");
                                        }}
                                    >
                                        清空搜索重试
                                    </Button>
                                )}
                            </div>
                        )
                        : (
                            <div style={{ overflowX: "auto" }}>
                                <table
                                    style={{
                                        width: "100%",
                                        borderCollapse: "collapse",
                                        textAlign: "left",
                                        fontSize: "14px",
                                    }}
                                >
                                    <thead>
                                        <tr
                                            style={{
                                                borderBottom:
                                                    "1px solid var(--border)",
                                                color: "var(--muted)",
                                            }}
                                        >
                                            <th
                                                style={{
                                                    padding: "12px 14px",
                                                    fontWeight: 650,
                                                }}
                                            >
                                                用户
                                            </th>
                                            <th
                                                style={{
                                                    padding: "12px 14px",
                                                    fontWeight: 650,
                                                }}
                                            >
                                                角色
                                            </th>
                                            <th
                                                style={{
                                                    padding: "12px 14px",
                                                    fontWeight: 650,
                                                }}
                                            >
                                                状态
                                            </th>
                                            <th
                                                style={{
                                                    padding: "12px 14px",
                                                    fontWeight: 650,
                                                }}
                                            >
                                                创建时间
                                            </th>
                                            <th
                                                style={{
                                                    padding: "12px 14px",
                                                    fontWeight: 650,
                                                    textAlign: "right",
                                                }}
                                            >
                                                操作
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map((u) => {
                                            const isSelf =
                                                u.id === currentUser.id;
                                            const isAdmin = u.role === "admin";
                                            const isToggling =
                                                togglingId === u.id;

                                            return (
                                                <tr
                                                    key={u.id}
                                                    style={{
                                                        borderBottom:
                                                            "1px solid var(--border)",
                                                    }}
                                                >
                                                    {/* User Info */}
                                                    <td
                                                        style={{
                                                            padding: "14px",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                alignItems:
                                                                    "center",
                                                                gap: "10px",
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    width:
                                                                        "36px",
                                                                    height:
                                                                        "36px",
                                                                    borderRadius:
                                                                        "10px",
                                                                    background:
                                                                        isAdmin
                                                                            ? "var(--accent)"
                                                                            : "var(--surface-soft)",
                                                                    color:
                                                                        isAdmin
                                                                            ? "var(--accent-foreground)"
                                                                            : "var(--foreground)",
                                                                    border:
                                                                        "1px solid var(--border)",
                                                                    display:
                                                                        "grid",
                                                                    placeItems:
                                                                        "center",
                                                                    fontWeight:
                                                                        700,
                                                                    fontSize:
                                                                        "14px",
                                                                    flexShrink:
                                                                        0,
                                                                }}
                                                            >
                                                                {(u.displayName ||
                                                                    u.username)
                                                                    .slice(
                                                                        0,
                                                                        1,
                                                                    )
                                                                    .toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <div
                                                                    style={{
                                                                        display:
                                                                            "flex",
                                                                        alignItems:
                                                                            "center",
                                                                        gap: "6px",
                                                                    }}
                                                                >
                                                                    <span
                                                                        style={{
                                                                            fontWeight:
                                                                                650,
                                                                        }}
                                                                    >
                                                                        {u.displayName}
                                                                    </span>
                                                                    {isSelf &&
                                                                        (
                                                                            <span
                                                                                style={{
                                                                                    fontSize:
                                                                                        "10px",
                                                                                    padding:
                                                                                        "1px 5px",
                                                                                    borderRadius:
                                                                                        "4px",
                                                                                    background:
                                                                                        "var(--accent)",
                                                                                    color:
                                                                                        "var(--accent-foreground)",
                                                                                    fontWeight:
                                                                                        700,
                                                                                }}
                                                                            >
                                                                                当前登录
                                                                            </span>
                                                                        )}
                                                                </div>
                                                                <div
                                                                    className="muted"
                                                                    style={{
                                                                        fontSize:
                                                                            "12px",
                                                                    }}
                                                                >
                                                                    @{u.username}
                                                                    {" "}
                                                                    {u.email
                                                                        ? `· ${u.email}`
                                                                        : ""}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Role */}
                                                    <td
                                                        style={{
                                                            padding: "14px",
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                fontSize:
                                                                    "12px",
                                                                padding:
                                                                    "2px 8px",
                                                                borderRadius:
                                                                    "6px",
                                                                fontWeight: 650,
                                                                background:
                                                                    isAdmin
                                                                        ? "var(--accent-subtle)"
                                                                        : "var(--surface-soft)",
                                                                color: isAdmin
                                                                    ? "var(--accent)"
                                                                    : "var(--muted)",
                                                                border:
                                                                    "1px solid var(--border)",
                                                            }}
                                                        >
                                                            {isAdmin
                                                                ? "管理员"
                                                                : "标准用户"}
                                                        </span>
                                                    </td>

                                                    {/* Status */}
                                                    <td
                                                        style={{
                                                            padding: "14px",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                alignItems:
                                                                    "center",
                                                                gap: "6px",
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    display:
                                                                        "inline-block",
                                                                    width:
                                                                        "8px",
                                                                    height:
                                                                        "8px",
                                                                    borderRadius:
                                                                        "50%",
                                                                    background:
                                                                        u.disabled
                                                                            ? "var(--danger)"
                                                                            : "var(--success)",
                                                                }}
                                                            />
                                                            <span
                                                                style={{
                                                                    color:
                                                                        u.disabled
                                                                            ? "var(--danger)"
                                                                            : "var(--foreground)",
                                                                }}
                                                            >
                                                                {u.disabled
                                                                    ? "已禁用"
                                                                    : "正常"}
                                                            </span>
                                                            {u.mustChangePassword &&
                                                                (
                                                                    <span
                                                                        style={{
                                                                            fontSize:
                                                                                "11px",
                                                                            padding:
                                                                                "1px 6px",
                                                                            borderRadius:
                                                                                "4px",
                                                                            background:
                                                                                "color-mix(in srgb, var(--danger) 10%, var(--surface))",
                                                                            color:
                                                                                "var(--danger)",
                                                                            border:
                                                                                "1px solid var(--danger)",
                                                                        }}
                                                                    >
                                                                        待重置密码
                                                                    </span>
                                                                )}
                                                        </div>
                                                    </td>

                                                    {/* Created At */}
                                                    <td
                                                        style={{
                                                            padding: "14px",
                                                            color:
                                                                "var(--muted)",
                                                            fontSize: "13px",
                                                        }}
                                                    >
                                                        {formatTime(
                                                            u.createdAt,
                                                        )}
                                                    </td>

                                                    {/* Actions */}
                                                    <td
                                                        style={{
                                                            padding: "14px",
                                                            textAlign: "right",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display:
                                                                    "inline-flex",
                                                                gap: "6px",
                                                                flexWrap:
                                                                    "wrap",
                                                                justifyContent:
                                                                    "flex-end",
                                                            }}
                                                        >
                                                            {/* Toggle disable */}
                                                            {!isAdmin &&
                                                                !isSelf && (
                                                                <Button
                                                                    variant={u
                                                                            .disabled
                                                                        ? "outline"
                                                                        : "destructive"}
                                                                    type="button"
                                                                    disabled={isToggling}
                                                                    onClick={() =>
                                                                        void handleToggleDisable(
                                                                            u,
                                                                        )}
                                                                    style={{
                                                                        minHeight:
                                                                            "32px",
                                                                        padding:
                                                                            "4px 10px",
                                                                        fontSize:
                                                                            "12px",
                                                                    }}
                                                                    title={u
                                                                            .disabled
                                                                        ? "启用该用户"
                                                                        : "禁用该用户"}
                                                                >
                                                                    {u.disabled
                                                                        ? (
                                                                            <UserCheck
                                                                                size={14}
                                                                            />
                                                                        )
                                                                        : (
                                                                            <UserX
                                                                                size={14}
                                                                            />
                                                                        )}
                                                                    <span>
                                                                        {u.disabled
                                                                            ? "启用"
                                                                            : "禁用"}
                                                                    </span>
                                                                </Button>
                                                            )}

                                                            {/* Reset Password */}
                                                            {!isAdmin && (
                                                                <Button
                                                                    variant="outline"
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setResetModalUser(
                                                                            u,
                                                                        );
                                                                        setResetNewPassword(
                                                                            "",
                                                                        );
                                                                        setResetError(
                                                                            "",
                                                                        );
                                                                    }}
                                                                    style={{
                                                                        minHeight:
                                                                            "32px",
                                                                        padding:
                                                                            "4px 10px",
                                                                        fontSize:
                                                                            "12px",
                                                                    }}
                                                                    title="重置用户密码"
                                                                >
                                                                    <KeyRound
                                                                        size={14}
                                                                    />
                                                                    <span>
                                                                        重置密码
                                                                    </span>
                                                                </Button>
                                                            )}

                                                            {/* Soft Delete */}
                                                            {!isAdmin &&
                                                                !isSelf && (
                                                                <Button
                                                                    variant="destructive"
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setDeleteModalUser(
                                                                            u,
                                                                        );
                                                                        setDeleteConfirmText(
                                                                            "",
                                                                        );
                                                                        setDeleteError(
                                                                            "",
                                                                        );
                                                                    }}
                                                                    style={{
                                                                        minHeight:
                                                                            "32px",
                                                                        padding:
                                                                            "4px 10px",
                                                                        fontSize:
                                                                            "12px",
                                                                    }}
                                                                    title="删除用户"
                                                                >
                                                                    <Trash2
                                                                        size={14}
                                                                    />
                                                                    <span>
                                                                        删除
                                                                    </span>
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                marginTop: "20px",
                                paddingTop: "16px",
                                borderTop: "1px solid var(--border)",
                                fontSize: "14px",
                            }}
                        >
                            <span className="muted">
                                第 {userPage} / {totalPages} 页 · 共 {userTotal}
                                {" "}
                                条记录
                            </span>
                            <div style={{ display: "flex", gap: "8px" }}>
                                <Button
                                    variant="outline"
                                    disabled={userPage <= 1 || usersLoading}
                                    onClick={() =>
                                        setUserPage((p) => Math.max(1, p - 1))}
                                    style={{
                                        minHeight: "36px",
                                        padding: "0 12px",
                                    }}
                                >
                                    <ChevronLeft size={16} />
                                    <span>上一页</span>
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={userPage >= totalPages ||
                                        usersLoading}
                                    onClick={() =>
                                        setUserPage((p) =>
                                            Math.min(totalPages, p + 1)
                                        )}
                                    style={{
                                        minHeight: "36px",
                                        padding: "0 12px",
                                    }}
                                >
                                    <span>下一页</span>
                                    <ChevronRight size={16} />
                                </Button>
                            </div>
                        </div>
                    )}
                </section>
            )}

            {/* ===================== Tab 2: Audit Logs ===================== */}
            {activeTab === "audit" && (
                <section
                    style={{
                        background: "var(--surface)",
                        borderRadius: "var(--radius)",
                        border: "1px solid var(--border)",
                        boxShadow: "var(--shadow)",
                        padding: "clamp(18px, 3vw, 28px)",
                    }}
                >
                    {/* Audit Filter Toolbar */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "12px",
                            marginBottom: "20px",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                flexWrap: "wrap",
                            }}
                        >
                            <span
                                className="muted"
                                style={{ fontSize: "14px" }}
                            >
                                动作筛选:
                            </span>
                            <select
                                value={auditActionFilter}
                                onChange={(e) => {
                                    setAuditActionFilter(e.target.value);
                                    setAuditPage(1);
                                }}
                                style={{
                                    minHeight: "40px",
                                    padding: "6px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid var(--border)",
                                    background: "var(--surface-soft)",
                                    color: "var(--foreground)",
                                    fontSize: "14px",
                                }}
                            >
                                <option value="">全部管理员操作</option>
                                <option value="admin.user.create">
                                    创建用户
                                </option>
                                <option value="admin.user.disable">
                                    禁用用户
                                </option>
                                <option value="admin.user.enable">
                                    启用用户
                                </option>
                                <option value="admin.user.reset_password">
                                    重置密码
                                </option>
                                <option value="admin.user.delete">
                                    删除用户
                                </option>
                            </select>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => void loadAuditLogs()}
                            disabled={auditLoading}
                            style={{ height: "40px", padding: "0 14px" }}
                            title="刷新审计日志"
                        >
                            <RefreshCw
                                size={16}
                                className={auditLoading ? "spin" : ""}
                            />
                            <span>刷新</span>
                        </Button>
                    </div>

                    {auditError && (
                        <p
                            role="alert"
                            className="error"
                            style={{ marginBottom: "16px" }}
                        >
                            {auditError}
                        </p>
                    )}

                    {auditLoading && auditLogs.length === 0
                        ? (
                            <p
                                className="muted"
                                style={{
                                    padding: "48px 0",
                                    textAlign: "center",
                                }}
                            >
                                正在加载审计日志…
                            </p>
                        )
                        : auditLogs.length === 0
                        ? (
                            <p
                                className="muted"
                                style={{
                                    padding: "48px 0",
                                    textAlign: "center",
                                }}
                            >
                                暂无审计日志记录
                            </p>
                        )
                        : (
                            <div style={{ overflowX: "auto" }}>
                                <table
                                    style={{
                                        width: "100%",
                                        borderCollapse: "collapse",
                                        textAlign: "left",
                                        fontSize: "14px",
                                    }}
                                >
                                    <thead>
                                        <tr
                                            style={{
                                                borderBottom:
                                                    "1px solid var(--border)",
                                                color: "var(--muted)",
                                            }}
                                        >
                                            <th
                                                style={{
                                                    padding: "12px 14px",
                                                    fontWeight: 650,
                                                }}
                                            >
                                                时间
                                            </th>
                                            <th
                                                style={{
                                                    padding: "12px 14px",
                                                    fontWeight: 650,
                                                }}
                                            >
                                                操作类型
                                            </th>
                                            <th
                                                style={{
                                                    padding: "12px 14px",
                                                    fontWeight: 650,
                                                }}
                                            >
                                                目标类型 / ID
                                            </th>
                                            <th
                                                style={{
                                                    padding: "12px 14px",
                                                    fontWeight: 650,
                                                }}
                                            >
                                                操作明细
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {auditLogs.map((log) => {
                                            const { label, tone } = actionLabel(
                                                log.action,
                                            );
                                            const color = tone === "danger"
                                                ? "var(--danger)"
                                                : tone === "warning"
                                                ? "var(--accent)"
                                                : tone === "success"
                                                ? "var(--success)"
                                                : "var(--foreground)";

                                            return (
                                                <tr
                                                    key={log.id}
                                                    style={{
                                                        borderBottom:
                                                            "1px solid var(--border)",
                                                    }}
                                                >
                                                    <td
                                                        style={{
                                                            padding: "14px",
                                                            color:
                                                                "var(--muted)",
                                                            whiteSpace:
                                                                "nowrap",
                                                            fontSize: "13px",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                alignItems:
                                                                    "center",
                                                                gap: "6px",
                                                            }}
                                                        >
                                                            <Clock size={14} />
                                                            <span>
                                                                {formatTime(
                                                                    log.createdAt,
                                                                )}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: "14px",
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                fontSize:
                                                                    "12px",
                                                                padding:
                                                                    "2px 8px",
                                                                borderRadius:
                                                                    "6px",
                                                                fontWeight: 650,
                                                                border:
                                                                    "1px solid var(--border)",
                                                                background:
                                                                    "var(--surface-soft)",
                                                                color,
                                                            }}
                                                        >
                                                            {label}
                                                        </span>
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: "14px",
                                                            fontSize: "13px",
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                fontWeight: 600,
                                                            }}
                                                        >
                                                            {log.targetType}
                                                        </span>
                                                        <span
                                                            className="muted"
                                                            style={{
                                                                marginLeft:
                                                                    "6px",
                                                                fontFamily:
                                                                    "monospace",
                                                                fontSize:
                                                                    "12px",
                                                            }}
                                                        >
                                                            {log.targetId.slice(
                                                                0,
                                                                10,
                                                            )}…
                                                        </span>
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: "14px",
                                                            fontSize: "13px",
                                                        }}
                                                    >
                                                        {log.metadata
                                                            ? (
                                                                <div
                                                                    style={{
                                                                        display:
                                                                            "flex",
                                                                        gap: "8px",
                                                                        flexWrap:
                                                                            "wrap",
                                                                    }}
                                                                >
                                                                    {Object
                                                                        .entries(
                                                                            log.metadata,
                                                                        ).map((
                                                                            [
                                                                                k,
                                                                                v,
                                                                            ],
                                                                        ) => (
                                                                            <span
                                                                                key={k}
                                                                                style={{
                                                                                    padding:
                                                                                        "1px 6px",
                                                                                    borderRadius:
                                                                                        "4px",
                                                                                    background:
                                                                                        "var(--surface-soft)",
                                                                                    border:
                                                                                        "1px solid var(--border)",
                                                                                    fontSize:
                                                                                        "12px",
                                                                                }}
                                                                            >
                                                                                <strong
                                                                                    style={{
                                                                                        fontWeight:
                                                                                            600,
                                                                                    }}
                                                                                >
                                                                                    {k}:
                                                                                </strong>
                                                                                {" "}
                                                                                {String(
                                                                                    v,
                                                                                )}
                                                                            </span>
                                                                        ))}
                                                                </div>
                                                            )
                                                            : (
                                                                <span className="muted">
                                                                    —
                                                                </span>
                                                            )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                    {/* Audit Pagination */}
                    {auditTotalPages > 1 && (
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                marginTop: "20px",
                                paddingTop: "16px",
                                borderTop: "1px solid var(--border)",
                                fontSize: "14px",
                            }}
                        >
                            <span className="muted">
                                第 {auditPage} / {auditTotalPages} 页 · 共{" "}
                                {auditTotal} 条记录
                            </span>
                            <div style={{ display: "flex", gap: "8px" }}>
                                <Button
                                    variant="outline"
                                    disabled={auditPage <= 1 || auditLoading}
                                    onClick={() =>
                                        setAuditPage((p) => Math.max(1, p - 1))}
                                    style={{
                                        minHeight: "36px",
                                        padding: "0 12px",
                                    }}
                                >
                                    <ChevronLeft size={16} />
                                    <span>上一页</span>
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={auditPage >= auditTotalPages ||
                                        auditLoading}
                                    onClick={() =>
                                        setAuditPage((p) =>
                                            Math.min(auditTotalPages, p + 1)
                                        )}
                                    style={{
                                        minHeight: "36px",
                                        padding: "0 12px",
                                    }}
                                >
                                    <span>下一页</span>
                                    <ChevronRight size={16} />
                                </Button>
                            </div>
                        </div>
                    )}
                </section>
            )}
            {/* ===================== Tab 3: System Settings ===================== */}
            {activeTab === "settings" && <AdminSystemSettings />}

            {/* ===================== Tab 5: Backup / Restore ===================== */}
            {activeTab === "backup" && <AdminBackupRestore />}

            {/* ===================== Modals ===================== */}

            {/* 1. Create User Modal */}
            <Dialog
                open={createModalOpen}
                onOpenChange={(open) => {
                    if (!createBusy) setCreateModalOpen(open);
                }}
            >
                <DialogContent style={{ maxWidth: "520px" }}>
                    <DialogHeader>
                        <DialogTitle
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                            }}
                        >
                            <UserPlus
                                size={20}
                                style={{ color: "var(--accent)" }}
                            />
                            <span>创建新用户</span>
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            输入用户名、显示名称、邮箱及初始密码以创建新用户。
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleCreateUser}>
                        <label
                            className="field"
                            style={{ margin: "0 0 14px" }}
                        >
                            <span>
                                用户名{" "}
                                <span style={{ color: "var(--danger)" }}>
                                    *
                                </span>{" "}
                                (3–32 位字母、数字、下划线)
                            </span>
                            <input
                                type="text"
                                required
                                pattern="^[a-zA-Z0-9_]{3,32}$"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                placeholder="例如: alice"
                            />
                        </label>

                        <label
                            className="field"
                            style={{ margin: "0 0 14px" }}
                        >
                            <span>
                                显示名称{" "}
                                <span style={{ color: "var(--danger)" }}>
                                    *
                                </span>
                            </span>
                            <input
                                type="text"
                                required
                                maxLength={40}
                                value={newDisplayName}
                                onChange={(e) =>
                                    setNewDisplayName(e.target.value)}
                                placeholder="例如: 爱丽丝"
                            />
                        </label>

                        <label
                            className="field"
                            style={{ margin: "0 0 14px" }}
                        >
                            <span>邮箱 (可选)</span>
                            <input
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder="alice@example.com"
                            />
                        </label>

                        <label
                            className="field"
                            style={{ margin: "0 0 18px" }}
                        >
                            <span>
                                初始密码{" "}
                                <span style={{ color: "var(--danger)" }}>
                                    *
                                </span>{" "}
                                (至少 12 位)
                            </span>
                            <input
                                type="password"
                                required
                                minLength={12}
                                maxLength={128}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="设置初始安全密码"
                            />
                        </label>

                        {createError && (
                            <p
                                role="alert"
                                className="error"
                                style={{
                                    margin: "0 0 16px",
                                    fontSize: "14px",
                                }}
                            >
                                {createError}
                            </p>
                        )}

                        <DialogFooter
                            style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: "10px",
                            }}
                        >
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() => setCreateModalOpen(false)}
                                disabled={createBusy}
                            >
                                取消
                            </Button>
                            <Button
                                variant="default"
                                type="submit"
                                disabled={createBusy || !newUsername ||
                                    !newDisplayName || !newPassword}
                            >
                                {createBusy ? "正在创建…" : "确认创建"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* 2. Reset Password Modal */}
            <Dialog
                open={Boolean(resetModalUser)}
                onOpenChange={(open) => {
                    if (!resetBusy && !open) setResetModalUser(null);
                }}
            >
                <DialogContent style={{ maxWidth: "480px" }}>
                    <DialogHeader>
                        <DialogTitle
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                            }}
                        >
                            <KeyRound
                                size={20}
                                style={{ color: "var(--accent)" }}
                            />
                            <span>
                                重置密码: @{resetModalUser?.username}
                            </span>
                        </DialogTitle>
                        <DialogDescription
                            className="muted"
                            style={{
                                margin: "0 0 16px",
                                fontSize: "14px",
                                lineHeight: "1.6",
                            }}
                        >
                            重置密码将<strong>
                                立即注销该用户的所有设备会话
                            </strong>，并强制该用户在下次登录时必须修改密码。
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleResetPasswordSubmit}>
                        <label
                            className="field"
                            style={{ margin: "0 0 18px" }}
                        >
                            <span>输入新密码 (至少 12 位)</span>
                            <input
                                type="password"
                                required
                                minLength={12}
                                maxLength={128}
                                value={resetNewPassword}
                                onChange={(e) =>
                                    setResetNewPassword(e.target.value)}
                                placeholder="输入该用户的临时新密码"
                                autoFocus
                            />
                        </label>

                        {resetError && (
                            <p
                                role="alert"
                                className="error"
                                style={{
                                    margin: "0 0 16px",
                                    fontSize: "14px",
                                }}
                            >
                                {resetError}
                            </p>
                        )}

                        <DialogFooter
                            style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: "10px",
                            }}
                        >
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() => setResetModalUser(null)}
                                disabled={resetBusy}
                            >
                                取消
                            </Button>
                            <Button
                                variant="default"
                                type="submit"
                                disabled={resetBusy || !resetNewPassword}
                            >
                                {resetBusy ? "正在重置…" : "确认重置"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* 3. Soft Delete Confirmation Modal (Two-Stage Delete) */}
            <Dialog
                open={Boolean(deleteModalUser)}
                onOpenChange={(open) => {
                    if (!deleteBusy && !open) setDeleteModalUser(null);
                }}
            >
                <DialogContent
                    style={{
                        maxWidth: "480px",
                        border: "2px solid var(--danger)",
                    }}
                >
                    <DialogHeader>
                        <DialogTitle
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                                marginBottom: "4px",
                                color: "var(--danger)",
                            }}
                        >
                            <div
                                style={{
                                    width: "40px",
                                    height: "40px",
                                    borderRadius: "10px",
                                    background:
                                        "color-mix(in srgb, var(--danger) 15%, var(--surface))",
                                    color: "var(--danger)",
                                    display: "grid",
                                    placeItems: "center",
                                    flexShrink: 0,
                                }}
                            >
                                <Trash2 size={22} />
                            </div>
                            <div>
                                <div>确认删除用户</div>
                                <div
                                    className="muted"
                                    style={{
                                        margin: "2px 0 0",
                                        fontSize: "13px",
                                        fontWeight: 400,
                                    }}
                                >
                                    此操作需要二次确认
                                </div>
                            </div>
                        </DialogTitle>
                        <DialogDescription
                            style={{
                                margin: "0 0 16px",
                                fontSize: "14px",
                                lineHeight: "1.6",
                            }}
                        >
                            确定要删除用户{" "}
                            <strong>@{deleteModalUser?.username}</strong>{" "}
                            ({deleteModalUser?.displayName}) 吗？
                            删除后该用户将被软删除，其所有登录会话将被彻底撤销。
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleDeleteSubmit}>
                        <label
                            className="field"
                            style={{ margin: "0 0 18px" }}
                        >
                            <span>
                                请输入完整的用户名{" "}
                                <strong>@{deleteModalUser?.username}</strong>
                                {" "}
                                确认:
                            </span>
                            <input
                                type="text"
                                required
                                value={deleteConfirmText}
                                onChange={(e) =>
                                    setDeleteConfirmText(e.target.value)}
                                placeholder={deleteModalUser?.username}
                                autoFocus
                            />
                        </label>

                        {deleteError && (
                            <p
                                role="alert"
                                className="error"
                                style={{
                                    margin: "0 0 16px",
                                    fontSize: "14px",
                                }}
                            >
                                {deleteError}
                            </p>
                        )}

                        <DialogFooter
                            style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: "10px",
                            }}
                        >
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() => setDeleteModalUser(null)}
                                disabled={deleteBusy}
                            >
                                取消
                            </Button>
                            <Button
                                variant="destructive"
                                type="submit"
                                disabled={deleteBusy ||
                                    !deleteModalUser ||
                                    (deleteConfirmText !==
                                            deleteModalUser.username &&
                                        deleteConfirmText !== "CONFIRM")}
                            >
                                {deleteBusy ? "正在删除…" : "确认删除用户"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </main>
    );
}
