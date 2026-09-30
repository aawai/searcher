import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { type AdminTab, adminTab, routes } from "./routes.ts";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import {
    ActionGroup,
    EmptyState,
    LocalNavigation,
    ManagementTable,
    StatusBanner,
    WorkspaceToolbar,
} from "../components/searcher/semantic.tsx";
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../components/ui/table.tsx";
import { NotFoundPage } from "./NotFoundPage.tsx";
import {
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Clock,
    KeyRound,
    RefreshCw,
    Search,
    Trash2,
    UserCheck,
    UserPlus,
    UserX,
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
import { Input } from "../components/ui/input.tsx";
import { Badge } from "../components/ui/badge.tsx";
import {
    NativeSelect,
    NativeSelectOption,
} from "../components/ui/native-select.tsx";
import { api, json } from "../lib/api.ts";
import { errorMessage, useAppState } from "./state.tsx";
import "./admin.css";

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
        second: "2-digit",
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

const adminTabLabels: Record<AdminTab, string> = {
    overview: "概览",
    users: "用户管理",
    settings: "系统设置",
    audit: "审计日志",
    backup: "备份与恢复",
};

export function AdminPage() {
    const { user: currentUser } = useAppState();
    const location = useLocation();
    const navigate = useNavigate();

    const activeTab = adminTab(location.pathname);

    const setActiveTab = (tab: AdminTab) => {
        navigate(routes.admin(tab), { replace: true });
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
    const modalTriggerRef = useRef<HTMLButtonElement>(null);
    const createTriggerRef = useRef<HTMLButtonElement>(null);
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
        if (currentUser?.role === "admin" && activeTab) {
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

    if (!activeTab) {
        return (
            <NotFoundPage parent={{ label: "管理后台", to: routes.admin() }} />
        );
    }

    // Non-admin permission check
    if (!currentUser || currentUser.role !== "admin") {
        return (
            <PageShell
                archetype="management"
                className="admin-unauthorized-shell"
            >
                <PageHeader
                    items={[
                        { label: "首页", to: routes.home },
                        { label: "管理后台", to: routes.admin() },
                        { label: adminTabLabels[activeTab] },
                    ]}
                />
                <EmptyState
                    title="无权访问"
                    description="管理后台仅限具有管理员角色的账户访问。若您是管理员，请使用正确的管理员账户登录。"
                    action={currentUser
                        ? (
                            <Button
                                variant="default"
                                render={<Link to={routes.home} />}
                            >
                                返回主页
                            </Button>
                        )
                        : (
                            <Button
                                variant="default"
                                render={<Link to={routes.login} />}
                            >
                                前往登录
                            </Button>
                        )}
                />
            </PageShell>
        );
    }

    const totalPages = Math.max(1, Math.ceil(userTotal / 50));
    const auditTotalPages = Math.max(1, Math.ceil(auditTotal / 25));

    return (
        <PageShell archetype="management">
            <PageHeader
                items={[
                    { label: "首页", to: routes.home },
                    { label: "管理后台", to: routes.admin() },
                    { label: adminTabLabels[activeTab] },
                ]}
                title="系统管理后台"
                description="用户账户维护、权限控制及系统审计日志"
                actions={
                    <Button
                        variant="outline"
                        size="sm"
                        render={<Link to={routes.account} />}
                    >
                        个人安全设置
                    </Button>
                }
                navigation={
                    <LocalNavigation
                        label="管理后台主导航"
                        items={[
                            { label: "系统概览", to: routes.admin("overview") },
                            {
                                label: `用户管理 (${userTotal})`,
                                to: routes.admin("users"),
                            },
                            {
                                label: "系统设置",
                                to: routes.admin("settings"),
                            },
                            {
                                label: "审计日志",
                                to: routes.admin("audit"),
                            },
                            {
                                label: "备份与恢复",
                                to: routes.admin("backup"),
                            },
                        ]}
                    />
                }
            />

            {userError && (
                <StatusBanner tone="error">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>{userError}</span>
                    </div>
                </StatusBanner>
            )}

            {userSuccess && (
                <StatusBanner tone="success">
                    <div className="flex items-center gap-2">
                        <span>{userSuccess}</span>
                    </div>
                </StatusBanner>
            )}

            {/* ===================== Tab 0: Overview ===================== */}
            {activeTab === "overview" && (
                <AdminOverview onNavigateTab={(t) => setActiveTab(t)} />
            )}

            {/* ===================== Tab 1: Users ===================== */}
            {activeTab === "users" && (
                <div className="semantic-section">
                    {/* Toolbar */}
                    <WorkspaceToolbar className="admin-toolbar">
                        <form
                            onSubmit={handleSearchSubmit}
                            className="admin-search-form"
                        >
                            <div className="admin-search-input-wrapper">
                                <Search
                                    size={16}
                                    className="admin-search-icon"
                                    aria-hidden="true"
                                />
                                <Input
                                    type="text"
                                    value={userSearch}
                                    onChange={(e) =>
                                        setUserSearch(e.target.value)}
                                    placeholder="按用户名、显示名称或邮箱搜索…"
                                    className="admin-search-input"
                                />
                            </div>
                            <Button variant="outline" type="submit">
                                搜索
                            </Button>
                            {submittedSearch && (
                                <Button
                                    variant="ghost"
                                    type="button"
                                    onClick={() => {
                                        setUserSearch("");
                                        setSubmittedSearch("");
                                    }}
                                    title="清空搜索"
                                >
                                    清除
                                </Button>
                            )}
                        </form>

                        <ActionGroup>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void loadUsers()}
                                disabled={usersLoading}
                                title="刷新用户列表"
                            >
                                <RefreshCw
                                    size={15}
                                    className={usersLoading
                                        ? "animate-spin"
                                        : ""}
                                />
                                <span>刷新</span>
                            </Button>
                            <Button
                                ref={createTriggerRef}
                                variant="default"
                                type="button"
                                onClick={(event) => {
                                    modalTriggerRef.current =
                                        event.currentTarget;
                                    setCreateModalOpen(true);
                                }}
                            >
                                <UserPlus size={16} />
                                <span>添加新用户</span>
                            </Button>
                        </ActionGroup>
                    </WorkspaceToolbar>

                    {/* Table */}
                    {usersLoading && users.length === 0
                        ? (
                            <div className="text-muted text-center py-12">
                                正在载入用户数据…
                            </div>
                        )
                        : users.length === 0
                        ? (
                            <EmptyState
                                title="未找到符合条件的用户"
                                description={submittedSearch
                                    ? `未找到与「${submittedSearch}」匹配的用户`
                                    : "暂无用户数据"}
                                action={submittedSearch
                                    ? (
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setUserSearch("");
                                                setSubmittedSearch("");
                                            }}
                                        >
                                            清空搜索重试
                                        </Button>
                                    )
                                    : undefined}
                            />
                        )
                        : (
                            <>
                                <ManagementTable
                                    caption={userTotal > 0
                                        ? `共 ${userTotal} 位用户`
                                        : undefined}
                                >
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>用户</TableHead>
                                            <TableHead>角色</TableHead>
                                            <TableHead>状态</TableHead>
                                            <TableHead>创建时间</TableHead>
                                            <TableHead className="text-right">
                                                操作
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {users.map((u) => {
                                            const isSelf =
                                                u.id === currentUser.id;
                                            const isAdmin = u.role === "admin";
                                            const isToggling =
                                                togglingId === u.id;
                                            const initial = (
                                                u.displayName || u.username
                                            ).slice(0, 1).toUpperCase();

                                            return (
                                                <TableRow key={u.id}>
                                                    <TableCell>
                                                        <div className="admin-user-cell">
                                                            <div
                                                                className={`admin-user-avatar ${
                                                                    isAdmin
                                                                        ? "admin-user-avatar--admin"
                                                                        : ""
                                                                }`}
                                                            >
                                                                {initial}
                                                            </div>
                                                            <div className="admin-user-names">
                                                                <div className="admin-user-display">
                                                                    <span>
                                                                        {u.displayName ||
                                                                            u.username}
                                                                    </span>
                                                                    {isSelf && (
                                                                        <Badge variant="secondary">
                                                                            当前登录
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                <div className="admin-user-meta">
                                                                    @{u.username}
                                                                    {u.email &&
                                                                        (
                                                                            <span>
                                                                                {" "}·
                                                                                {" "}
                                                                                {u.email}
                                                                            </span>
                                                                        )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant={isAdmin
                                                                ? "default"
                                                                : "outline"}
                                                        >
                                                            {isAdmin
                                                                ? "系统管理员"
                                                                : "普通用户"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant={u.disabled
                                                                ? "destructive"
                                                                : "secondary"}
                                                        >
                                                            {u.disabled
                                                                ? "已禁用"
                                                                : "正常"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-muted text-sm whitespace-nowrap">
                                                        {formatTime(
                                                            u.createdAt,
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <ActionGroup className="justify-end">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={(
                                                                    event,
                                                                ) => {
                                                                    modalTriggerRef
                                                                        .current =
                                                                            event
                                                                                .currentTarget;
                                                                    setResetModalUser(
                                                                        u,
                                                                    );
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
                                                            {!isSelf &&
                                                                !isAdmin && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    disabled={isToggling}
                                                                    onClick={() =>
                                                                        void handleToggleDisable(
                                                                            u,
                                                                        )}
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
                                                            {!isSelf && (
                                                                <Button
                                                                    variant="destructive"
                                                                    size="sm"
                                                                    onClick={(
                                                                        event,
                                                                    ) => {
                                                                        modalTriggerRef
                                                                            .current =
                                                                                event
                                                                                    .currentTarget;
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
                                                                >
                                                                    <Trash2
                                                                        size={14}
                                                                    />
                                                                    <span>
                                                                        删除
                                                                    </span>
                                                                </Button>
                                                            )}
                                                        </ActionGroup>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </ManagementTable>

                                <div className="admin-pagination">
                                    <div className="admin-pagination-info">
                                        共 {userTotal} 位用户 · 第 {userPage} /
                                        {" "}
                                        {totalPages} 页
                                    </div>
                                    <ActionGroup>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={userPage <= 1 ||
                                                usersLoading}
                                            onClick={() =>
                                                void loadUsers(userPage - 1)}
                                        >
                                            <ChevronLeft size={16} />
                                            <span>上一页</span>
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={userPage >= totalPages ||
                                                usersLoading}
                                            onClick={() =>
                                                void loadUsers(userPage + 1)}
                                        >
                                            <span>下一页</span>
                                            <ChevronRight size={16} />
                                        </Button>
                                    </ActionGroup>
                                </div>
                            </>
                        )}
                </div>
            )}

            {/* ===================== Tab 2: Audit Logs ===================== */}
            {activeTab === "audit" && (
                <div className="semantic-section">
                    <WorkspaceToolbar className="admin-toolbar">
                        <div className="admin-filter-group">
                            <span className="admin-filter-label">
                                动作筛选:
                            </span>
                            <div className="admin-select-wrapper">
                                <NativeSelect
                                    size="sm"
                                    value={auditActionFilter}
                                    onChange={(e) => {
                                        setAuditActionFilter(e.target.value);
                                        setAuditPage(1);
                                    }}
                                >
                                    <NativeSelectOption value="">
                                        全部管理员操作
                                    </NativeSelectOption>
                                    <NativeSelectOption value="admin.user.create">
                                        创建用户
                                    </NativeSelectOption>
                                    <NativeSelectOption value="admin.user.disable">
                                        禁用用户
                                    </NativeSelectOption>
                                    <NativeSelectOption value="admin.user.enable">
                                        启用用户
                                    </NativeSelectOption>
                                    <NativeSelectOption value="admin.user.reset_password">
                                        重置密码
                                    </NativeSelectOption>
                                    <NativeSelectOption value="admin.user.delete">
                                        删除用户
                                    </NativeSelectOption>
                                </NativeSelect>
                            </div>
                            {auditActionFilter && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    type="button"
                                    onClick={() => {
                                        setAuditActionFilter("");
                                        setAuditPage(1);
                                    }}
                                >
                                    清除筛选
                                </Button>
                            )}
                        </div>

                        <ActionGroup>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void loadAuditLogs()}
                                disabled={auditLoading}
                                title="刷新审计日志"
                            >
                                <RefreshCw
                                    size={14}
                                    className={auditLoading
                                        ? "animate-spin"
                                        : ""}
                                />
                                <span>刷新</span>
                            </Button>
                        </ActionGroup>
                    </WorkspaceToolbar>

                    {auditError && (
                        <StatusBanner tone="error">
                            <div className="flex items-center gap-2">
                                <AlertCircle size={16} className="shrink-0" />
                                <span>{auditError}</span>
                            </div>
                        </StatusBanner>
                    )}

                    {auditLoading && auditLogs.length === 0
                        ? (
                            <div className="text-muted text-center py-12">
                                正在载入审计日志…
                            </div>
                        )
                        : auditLogs.length === 0
                        ? (
                            <EmptyState
                                title="暂无符合条件的审计记录"
                                description={auditActionFilter
                                    ? "未找到该操作类型的审计日志"
                                    : "系统中尚无审计事件记录"}
                            />
                        )
                        : (
                            <>
                                <ManagementTable
                                    caption={auditTotal > 0
                                        ? `共 ${auditTotal} 条审计记录`
                                        : undefined}
                                >
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>时间</TableHead>
                                            <TableHead>操作类型</TableHead>
                                            <TableHead>目标类型 / ID</TableHead>
                                            <TableHead>操作明细</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {auditLogs.map((log) => {
                                            const { label, tone } = actionLabel(
                                                log.action,
                                            );
                                            const badgeVariant =
                                                tone === "danger"
                                                    ? "destructive"
                                                    : tone === "warning"
                                                    ? "secondary"
                                                    : tone === "success"
                                                    ? "default"
                                                    : "outline";

                                            return (
                                                <TableRow key={log.id}>
                                                    <TableCell className="text-muted text-sm whitespace-nowrap">
                                                        <div className="flex items-center gap-1.5">
                                                            <Clock size={14} />
                                                            <span>
                                                                {formatTime(
                                                                    log.createdAt,
                                                                )}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        <Badge
                                                            variant={badgeVariant}
                                                        >
                                                            {label}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        <span className="font-semibold">
                                                            {log.targetType}
                                                        </span>
                                                        {log.targetId && (
                                                            <span className="text-muted font-mono text-xs ml-1.5">
                                                                {log.targetId
                                                                    .slice(
                                                                        0,
                                                                        10,
                                                                    )}…
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {log.metadata
                                                            ? (
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {Object
                                                                        .entries(
                                                                            log.metadata,
                                                                        ).map(
                                                                            (
                                                                                [
                                                                                    k,
                                                                                    v,
                                                                                ],
                                                                            ) => (
                                                                                <Badge
                                                                                    key={k}
                                                                                    variant="outline"
                                                                                    className="font-normal text-xs"
                                                                                >
                                                                                    <strong className="font-semibold">
                                                                                        {k}:
                                                                                    </strong>
                                                                                    {" "}
                                                                                    {String(
                                                                                        v,
                                                                                    )}
                                                                                </Badge>
                                                                            ),
                                                                        )}
                                                                </div>
                                                            )
                                                            : (
                                                                <span className="text-muted">
                                                                    无
                                                                </span>
                                                            )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </ManagementTable>

                                <div className="admin-pagination">
                                    <div className="admin-pagination-info">
                                        共 {auditTotal} 条审计日志 · 第{" "}
                                        {auditPage} / {auditTotalPages} 页
                                    </div>
                                    <ActionGroup>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={auditPage <= 1 ||
                                                auditLoading}
                                            onClick={() =>
                                                void loadAuditLogs(
                                                    auditPage - 1,
                                                )}
                                        >
                                            <ChevronLeft size={16} />
                                            <span>上一页</span>
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={auditPage >=
                                                    auditTotalPages ||
                                                auditLoading}
                                            onClick={() =>
                                                void loadAuditLogs(
                                                    auditPage + 1,
                                                )}
                                        >
                                            <span>下一页</span>
                                            <ChevronRight size={16} />
                                        </Button>
                                    </ActionGroup>
                                </div>
                            </>
                        )}
                </div>
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
                <DialogContent
                    className="max-w-md"
                    finalFocus={modalTriggerRef}
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UserPlus size={20} className="text-accent" />
                            <span>创建新用户</span>
                        </DialogTitle>
                        <DialogDescription>
                            输入用户名、显示名称、邮箱及初始密码以创建新用户。
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        onSubmit={handleCreateUser}
                        className="admin-modal-form"
                    >
                        <div className="admin-modal-field">
                            <label
                                htmlFor="create-username"
                                className="admin-modal-label"
                            >
                                用户名{" "}
                                <span className="text-destructive">*</span>{" "}
                                (3–32 位字母、数字、下划线)
                            </label>
                            <Input
                                id="create-username"
                                type="text"
                                required
                                pattern="^[a-zA-Z0-9_]{3,32}$"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                placeholder="例如: alice"
                                autoFocus
                            />
                        </div>

                        <div className="admin-modal-field">
                            <label
                                htmlFor="create-display-name"
                                className="admin-modal-label"
                            >
                                显示名称{" "}
                                <span className="text-destructive">*</span>
                            </label>
                            <Input
                                id="create-display-name"
                                type="text"
                                required
                                maxLength={40}
                                value={newDisplayName}
                                onChange={(e) =>
                                    setNewDisplayName(e.target.value)}
                                placeholder="例如: 爱丽丝"
                            />
                        </div>

                        <div className="admin-modal-field">
                            <label
                                htmlFor="create-email"
                                className="admin-modal-label"
                            >
                                电子邮箱 (可选)
                            </label>
                            <Input
                                id="create-email"
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder="alice@example.com"
                            />
                        </div>

                        <div className="admin-modal-field">
                            <label
                                htmlFor="create-password"
                                className="admin-modal-label"
                            >
                                初始密码{" "}
                                <span className="text-destructive">*</span>{" "}
                                (至少 12 位)
                            </label>
                            <Input
                                id="create-password"
                                type="password"
                                required
                                minLength={12}
                                maxLength={128}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="设置初始安全密码"
                            />
                        </div>

                        {createError && (
                            <StatusBanner tone="error">
                                <div className="flex items-center gap-2">
                                    <AlertCircle
                                        size={16}
                                        className="shrink-0"
                                    />
                                    <span>{createError}</span>
                                </div>
                            </StatusBanner>
                        )}

                        <DialogFooter>
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
                                disabled={createBusy ||
                                    !newUsername ||
                                    !newDisplayName ||
                                    !newPassword}
                            >
                                <UserPlus size={16} />
                                <span>
                                    {createBusy ? "正在创建…" : "确认创建"}
                                </span>
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
                <DialogContent
                    className="max-w-md"
                    finalFocus={modalTriggerRef}
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <KeyRound size={20} className="text-accent" />
                            <span>
                                重置密码: @{resetModalUser?.username}
                            </span>
                        </DialogTitle>
                        <DialogDescription>
                            重置密码将<strong>
                                立即注销该用户的所有设备会话
                            </strong>，并强制该用户在下次登录时必须修改密码。
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        onSubmit={handleResetPasswordSubmit}
                        className="admin-modal-form"
                    >
                        <div className="admin-modal-field">
                            <label
                                htmlFor="reset-new-password"
                                className="admin-modal-label"
                            >
                                输入新密码 (至少 12 位)
                            </label>
                            <Input
                                id="reset-new-password"
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
                        </div>

                        {resetError && (
                            <StatusBanner tone="error">
                                <div className="flex items-center gap-2">
                                    <AlertCircle
                                        size={16}
                                        className="shrink-0"
                                    />
                                    <span>{resetError}</span>
                                </div>
                            </StatusBanner>
                        )}

                        <DialogFooter>
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
                                <KeyRound size={16} />
                                <span>
                                    {resetBusy ? "正在重置…" : "确认重置"}
                                </span>
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
                    className="max-w-md"
                    finalFocus={createTriggerRef}
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <Trash2 size={20} />
                            <span>确认删除用户</span>
                        </DialogTitle>
                        <DialogDescription>
                            确定要删除用户{" "}
                            <strong>@{deleteModalUser?.username}</strong>{" "}
                            ({deleteModalUser?.displayName}) 吗？
                            删除后该用户将被软删除，其所有登录会话将被彻底撤销。
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        onSubmit={handleDeleteSubmit}
                        className="admin-modal-form"
                    >
                        <div className="admin-modal-delete-warning">
                            <AlertCircle
                                size={18}
                                className="text-destructive shrink-0 mt-0.5"
                            />
                            <div>
                                删除用户后，该用户的会话将被立即强制终止，其创建的便签、应用及偏好将不可再被访问。此操作不可撤销。
                            </div>
                        </div>

                        <div className="admin-modal-field">
                            <label
                                htmlFor="delete-confirm-input"
                                className="admin-modal-label"
                            >
                                请输入完整的用户名{" "}
                                <strong>@{deleteModalUser?.username}</strong>
                                {" "}
                                确认:
                            </label>
                            <Input
                                id="delete-confirm-input"
                                type="text"
                                required
                                value={deleteConfirmText}
                                onChange={(e) =>
                                    setDeleteConfirmText(e.target.value)}
                                placeholder={deleteModalUser?.username}
                                autoFocus
                            />
                        </div>

                        {deleteError && (
                            <StatusBanner tone="error">
                                <div className="flex items-center gap-2">
                                    <AlertCircle
                                        size={16}
                                        className="shrink-0"
                                    />
                                    <span>{deleteError}</span>
                                </div>
                            </StatusBanner>
                        )}

                        <DialogFooter>
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
                                <Trash2 size={16} />
                                <span>
                                    {deleteBusy ? "正在删除…" : "确认删除用户"}
                                </span>
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </PageShell>
    );
}
