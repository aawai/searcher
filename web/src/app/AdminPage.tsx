import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { type AdminTab, adminTab, routes } from "./routes.ts";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import {
    ActionGroup,
    EmptyState,
    LoadingState,
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
import { AlertCircle, MoreHorizontal, RefreshCw } from "lucide-react";
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
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../components/ui/alert-dialog.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
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

function formatTime(timestamp: number): string {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
}

function actionLabel(action: string): { label: string; danger: boolean } {
    switch (action) {
        case "admin.user.create":
            return { label: "创建用户", danger: false };
        case "admin.user.disable":
            return { label: "禁用用户", danger: false };
        case "admin.user.enable":
            return { label: "启用用户", danger: false };
        case "admin.user.reset_password":
            return { label: "重置密码", danger: false };
        case "admin.user.delete":
            return { label: "删除用户", danger: true };
        default:
            return { label: action, danger: false };
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

    function setActiveTab(tab: AdminTab) {
        navigate(routes.admin(tab), { replace: true });
    }

    const [users, setUsers] = useState<AdminUserDto[]>([]);
    const [userTotal, setUserTotal] = useState(0);
    const [userPage, setUserPage] = useState(1);
    const [userSearch, setUserSearch] = useState("");
    const [submittedSearch, setSubmittedSearch] = useState("");
    const [usersLoading, setUsersLoading] = useState(false);
    const [usersInitialized, setUsersInitialized] = useState(false);
    const [userError, setUserError] = useState("");
    const [userSuccess, setUserSuccess] = useState("");

    // 对话框关闭后焦点回到触发它的元素
    const modalTriggerRef = useRef<HTMLButtonElement | HTMLElement | null>(
        null,
    );
    const actionTriggerRefs = useRef<Record<string, HTMLElement | null>>(
        {},
    );
    const createTriggerRef = useRef<HTMLButtonElement>(null);

    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [newUsername, setNewUsername] = useState("");
    const [newDisplayName, setNewDisplayName] = useState("");
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [createBusy, setCreateBusy] = useState(false);
    const [createError, setCreateError] = useState("");

    const [resetModalUser, setResetModalUser] = useState<AdminUserDto | null>(
        null,
    );
    const [resetNewPassword, setResetNewPassword] = useState("");
    const [resetBusy, setResetBusy] = useState(false);
    const [resetError, setResetError] = useState("");

    const [deleteModalUser, setDeleteModalUser] = useState<AdminUserDto | null>(
        null,
    );
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteError, setDeleteError] = useState("");

    const [togglingId, setTogglingId] = useState<string | null>(null);

    const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
    const [auditTotal, setAuditTotal] = useState(0);
    const [auditPage, setAuditPage] = useState(1);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditInitialized, setAuditInitialized] = useState(false);
    const [auditError, setAuditError] = useState("");
    const [auditActionFilter, setAuditActionFilter] = useState("");

    async function loadUsers(page = userPage, q = submittedSearch) {
        if (currentUser?.role !== "admin") return;
        setUsersLoading(true);
        setUserError("");
        try {
            const qs = new URLSearchParams({ page: String(page) });
            if (q.trim()) qs.set("q", q);
            const res = await api<UserListResponse>(`/api/admin/users?${qs}`);
            setUsers(res.items);
            setUserTotal(res.total);
            setUserPage(res.page);
        } catch (err) {
            setUserError(errorMessage(err));
        } finally {
            setUsersLoading(false);
            setUsersInitialized(true);
        }
    }

    async function loadAuditLogs(page = auditPage, action = auditActionFilter) {
        if (currentUser?.role !== "admin") return;
        setAuditLoading(true);
        setAuditError("");
        try {
            const qs = new URLSearchParams({ page: String(page), limit: "25" });
            if (action) qs.set("action", action);
            const res = await api<AuditLogResponse>(
                `/api/admin/audit-logs?${qs}`,
            );
            setAuditLogs(res.items);
            setAuditTotal(res.total);
            setAuditPage(res.page);
        } catch (err) {
            setAuditError(errorMessage(err));
        } finally {
            setAuditLoading(false);
            setAuditInitialized(true);
        }
    }

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

    useEffect(() => {
        if (activeTab !== "users") {
            setUserError("");
            setUserSuccess("");
        }
    }, [activeTab]);

    function handleSearchSubmit(e: FormEvent) {
        e.preventDefault();
        setUserPage(1);
        setSubmittedSearch(userSearch);
    }

    function clearSearch() {
        setUserSearch("");
        setUserPage(1);
        setSubmittedSearch("");
    }

    function openCreateModal(trigger: HTMLElement) {
        modalTriggerRef.current = trigger;
        setCreateError("");
        setCreateModalOpen(true);
    }

    async function handleCreateUser(e: FormEvent) {
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
    }

    async function handleToggleDisable(targetUser: AdminUserDto) {
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
    }

    async function handleResetPasswordSubmit(e: FormEvent) {
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
    }

    async function handleDeleteSubmit(e: FormEvent) {
        e.preventDefault();
        if (!deleteModalUser) return;
        setDeleteError("");
        if (
            deleteConfirmText !== deleteModalUser.username &&
            deleteConfirmText !== "CONFIRM"
        ) {
            setDeleteError(
                `输入 @${deleteModalUser.username} 或 CONFIRM 以确认删除`,
            );
            return;
        }
        setDeleteBusy(true);
        try {
            await api(`/api/admin/users/${deleteModalUser.id}?confirm=true`, {
                method: "DELETE",
            });
            setUserSuccess(
                `已删除用户 @${deleteModalUser.username}，其会话已立即终止。`,
            );
            // 触发行已消失，焦点回到页面上稳定的「添加用户」按钮
            modalTriggerRef.current = createTriggerRef.current;
            setDeleteModalUser(null);
            setDeleteConfirmText("");
            await loadUsers();
        } catch (err) {
            setDeleteError(errorMessage(err));
        } finally {
            setDeleteBusy(false);
        }
    }

    function openResetModal(target: AdminUserDto, trigger: HTMLElement | null) {
        modalTriggerRef.current = trigger;
        setResetNewPassword("");
        setResetError("");
        setResetModalUser(target);
    }

    function openDeleteModal(
        target: AdminUserDto,
        trigger: HTMLElement | null,
    ) {
        modalTriggerRef.current = trigger;
        setDeleteConfirmText("");
        setDeleteError("");
        setDeleteModalUser(target);
    }

    if (!activeTab) {
        return (
            <NotFoundPage parent={{ label: "管理后台", to: routes.admin() }} />
        );
    }

    if (currentUser?.role !== "admin") {
        return (
            <PageShell archetype="management">
                <PageHeader title="管理后台" />
                <EmptyState
                    headingLevel={3}
                    title="无权访问"
                    description="管理后台仅限管理员访问。"
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
    const resetUsername = resetModalUser?.username ?? "";
    const deleteUsername = deleteModalUser?.username ?? "";

    return (
        <PageShell archetype="management">
            <PageHeader
                title="管理后台"
                navigation={
                    <LocalNavigation
                        compact
                        label="管理后台主导航"
                        items={[
                            {
                                label: adminTabLabels.overview,
                                to: routes.admin("overview"),
                            },
                            {
                                label: adminTabLabels.users,
                                to: routes.admin("users"),
                            },
                            {
                                label: adminTabLabels.settings,
                                to: routes.admin("settings"),
                            },
                            {
                                label: adminTabLabels.audit,
                                to: routes.admin("audit"),
                            },
                            {
                                label: adminTabLabels.backup,
                                to: routes.admin("backup"),
                            },
                        ]}
                    />
                }
            />

            {activeTab === "overview" && (
                <AdminOverview onNavigateTab={(t) => setActiveTab(t)} />
            )}

            {activeTab === "users" && (
                <div className="semantic-section">
                    {userError && (
                        <StatusBanner tone="error" density="compact">
                            <span className="admin-banner-message">
                                <AlertCircle size="1em" />
                                <span>{userError}</span>
                            </span>
                        </StatusBanner>
                    )}
                    {userSuccess && (
                        <StatusBanner tone="success" density="compact">
                            {userSuccess}
                        </StatusBanner>
                    )}

                    <WorkspaceToolbar>
                        <form
                            className="admin-search-form"
                            onSubmit={handleSearchSubmit}
                        >
                            <Input
                                type="search"
                                className="admin-search-input"
                                aria-label="搜索用户"
                                placeholder="按用户名、显示名称或邮箱搜索"
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                            />
                            {submittedSearch && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearSearch}
                                >
                                    清除
                                </Button>
                            )}
                        </form>
                        <ActionGroup>
                            <Button
                                type="button"
                                variant="outline"
                                title="刷新用户列表"
                                disabled={usersLoading}
                                onClick={() =>
                                    void loadUsers(userPage, submittedSearch)}
                            >
                                <RefreshCw
                                    size="1em"
                                    className={usersLoading
                                        ? "animate-spin"
                                        : undefined}
                                />
                                <span>{usersLoading ? "刷新中…" : "刷新"}</span>
                            </Button>
                            <Button
                                ref={createTriggerRef}
                                type="button"
                                variant="default"
                                onClick={(event) =>
                                    openCreateModal(event.currentTarget)}
                            >
                                添加用户
                            </Button>
                        </ActionGroup>
                    </WorkspaceToolbar>

                    {!usersInitialized && usersLoading
                        ? <LoadingState>正在加载用户…</LoadingState>
                        : userError && users.length === 0
                        ? (
                            <EmptyState
                                headingLevel={3}
                                title="无法加载用户列表"
                                action={
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            void loadUsers(
                                                userPage,
                                                submittedSearch,
                                            )}
                                    >
                                        重试
                                    </Button>
                                }
                            />
                        )
                        : users.length === 0
                        ? (
                            <EmptyState
                                headingLevel={3}
                                title={submittedSearch
                                    ? `没有匹配「${submittedSearch}」的用户`
                                    : "暂无用户"}
                                action={submittedSearch
                                    ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={clearSearch}
                                        >
                                            清除搜索
                                        </Button>
                                    )
                                    : undefined}
                            />
                        )
                        : (
                            <>
                                <ManagementTable>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>用户</TableHead>
                                            <TableHead className="admin-hide-narrow">
                                                角色
                                            </TableHead>
                                            <TableHead>状态</TableHead>
                                            <TableHead className="admin-hide-narrow">
                                                创建时间
                                            </TableHead>
                                            <TableHead className="admin-cell-actions">
                                                <span className="sr-only">
                                                    操作
                                                </span>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {users.map((u) => {
                                            const isSelf =
                                                u.id === currentUser?.id;
                                            const isAdmin = u.role === "admin";
                                            return (
                                                <TableRow key={u.id}>
                                                    <TableCell>
                                                        <span className="admin-user-name">
                                                            {u.displayName ||
                                                                u.username}
                                                        </span>
                                                        <span className="admin-user-handle">
                                                            @{u.username}
                                                            {u.email
                                                                ? ` · ${u.email}`
                                                                : ""}
                                                            {isSelf
                                                                ? " · 当前登录"
                                                                : ""}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="admin-hide-narrow">
                                                        {isAdmin
                                                            ? "系统管理员"
                                                            : "普通用户"}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span
                                                            className={u
                                                                    .disabled
                                                                ? "admin-danger"
                                                                : undefined}
                                                        >
                                                            {u.disabled
                                                                ? "已禁用"
                                                                : "正常"}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="admin-hide-narrow admin-nowrap admin-muted">
                                                        {formatTime(
                                                            u.createdAt,
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="admin-cell-actions">
                                                        <div className="admin-row-actions">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                className="admin-row-reset"
                                                                onClick={(
                                                                    event,
                                                                ) => openResetModal(
                                                                    u,
                                                                    event
                                                                        .currentTarget,
                                                                )}
                                                            >
                                                                重置密码
                                                            </Button>
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger
                                                                    render={
                                                                        <Button
                                                                            ref={(
                                                                                node,
                                                                            ) => {
                                                                                actionTriggerRefs
                                                                                    .current[
                                                                                        u.id
                                                                                    ] = node;
                                                                            }}
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            aria-label={`用户 @${u.username} 的更多操作`}
                                                                            title="更多操作"
                                                                        />
                                                                    }
                                                                >
                                                                    <MoreHorizontal size="1em" />
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent
                                                                    sideOffset={4}
                                                                >
                                                                    <DropdownMenuItem
                                                                        onClick={() =>
                                                                            openResetModal(
                                                                                u,
                                                                                actionTriggerRefs
                                                                                    .current[
                                                                                        u.id
                                                                                    ] ??
                                                                                    null,
                                                                            )}
                                                                    >
                                                                        重置密码
                                                                    </DropdownMenuItem>
                                                                    {!isSelf &&
                                                                        !isAdmin &&
                                                                        (
                                                                            <DropdownMenuItem
                                                                                disabled={togglingId ===
                                                                                    u.id}
                                                                                onClick={() =>
                                                                                    void handleToggleDisable(
                                                                                        u,
                                                                                    )}
                                                                            >
                                                                                {u.disabled
                                                                                    ? "启用用户"
                                                                                    : "禁用用户"}
                                                                            </DropdownMenuItem>
                                                                        )}
                                                                    {!isSelf &&
                                                                        (
                                                                            <DropdownMenuSeparator />
                                                                        )}
                                                                    {!isSelf &&
                                                                        (
                                                                            <DropdownMenuItem
                                                                                variant="destructive"
                                                                                onClick={() =>
                                                                                    openDeleteModal(
                                                                                        u,
                                                                                        actionTriggerRefs
                                                                                            .current[
                                                                                                u.id
                                                                                            ] ??
                                                                                            null,
                                                                                    )}
                                                                            >
                                                                                删除用户
                                                                            </DropdownMenuItem>
                                                                        )}
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </ManagementTable>
                                <div className="admin-pagination">
                                    <span>
                                        共 {userTotal} 位 · 第 {userPage} /{" "}
                                        {totalPages} 页
                                    </span>
                                    <ActionGroup>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={userPage <= 1 ||
                                                usersLoading}
                                            onClick={() =>
                                                void loadUsers(
                                                    userPage - 1,
                                                    submittedSearch,
                                                )}
                                        >
                                            上一页
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={userPage >= totalPages ||
                                                usersLoading}
                                            onClick={() =>
                                                void loadUsers(
                                                    userPage + 1,
                                                    submittedSearch,
                                                )}
                                        >
                                            下一页
                                        </Button>
                                    </ActionGroup>
                                </div>
                            </>
                        )}
                </div>
            )}

            {activeTab === "settings" && <AdminSystemSettings />}

            {activeTab === "audit" && (
                <div className="semantic-section">
                    {auditError && (
                        <StatusBanner tone="error" density="compact">
                            <span className="admin-banner-message">
                                <AlertCircle size="1em" />
                                <span>{auditError}</span>
                            </span>
                        </StatusBanner>
                    )}
                    <WorkspaceToolbar>
                        <ActionGroup>
                            <NativeSelect
                                size="sm"
                                aria-label="审计操作筛选"
                                value={auditActionFilter}
                                onChange={(e) => {
                                    setAuditActionFilter(e.target.value);
                                    setAuditPage(1);
                                }}
                            >
                                <NativeSelectOption value="">
                                    全部操作
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
                            {auditActionFilter && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setAuditActionFilter("");
                                        setAuditPage(1);
                                    }}
                                >
                                    清除筛选
                                </Button>
                            )}
                        </ActionGroup>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            title="刷新审计日志"
                            disabled={auditLoading}
                            onClick={() =>
                                void loadAuditLogs(
                                    auditPage,
                                    auditActionFilter,
                                )}
                        >
                            <RefreshCw
                                size="1em"
                                className={auditLoading
                                    ? "animate-spin"
                                    : undefined}
                            />
                            <span>刷新</span>
                        </Button>
                    </WorkspaceToolbar>

                    {!auditInitialized && auditLoading
                        ? <LoadingState>正在加载审计日志…</LoadingState>
                        : auditError && auditLogs.length === 0
                        ? (
                            <EmptyState
                                headingLevel={3}
                                title="无法加载审计日志"
                                action={
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            void loadAuditLogs(
                                                auditPage,
                                                auditActionFilter,
                                            )}
                                    >
                                        重试
                                    </Button>
                                }
                            />
                        )
                        : auditLogs.length === 0
                        ? (
                            <EmptyState
                                headingLevel={3}
                                title="暂无审计记录"
                                action={auditActionFilter
                                    ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => {
                                                setAuditActionFilter("");
                                                setAuditPage(1);
                                            }}
                                        >
                                            清除筛选
                                        </Button>
                                    )
                                    : undefined}
                            />
                        )
                        : (
                            <>
                                <ManagementTable>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>时间</TableHead>
                                            <TableHead>操作</TableHead>
                                            <TableHead>对象</TableHead>
                                            <TableHead>明细</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {auditLogs.map((log) => {
                                            const { label, danger } =
                                                actionLabel(log.action);
                                            const entries = log.metadata
                                                ? Object.entries(log.metadata)
                                                : [];
                                            return (
                                                <TableRow key={log.id}>
                                                    <TableCell className="admin-nowrap admin-muted">
                                                        {formatTime(
                                                            log.createdAt,
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span
                                                            className={danger
                                                                ? "admin-danger"
                                                                : undefined}
                                                        >
                                                            {label}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        {log.targetType}
                                                        <span
                                                            className="admin-audit-target-id"
                                                            title={log.targetId}
                                                        >
                                                            {log.targetId
                                                                    .length > 10
                                                                ? `${
                                                                    log.targetId
                                                                        .slice(
                                                                            0,
                                                                            10,
                                                                        )
                                                                }…`
                                                                : log.targetId}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        {entries.length > 0
                                                            ? (
                                                                <ul className="admin-audit-details">
                                                                    {entries
                                                                        .map((
                                                                            [
                                                                                k,
                                                                                v,
                                                                            ],
                                                                        ) => (
                                                                            <li
                                                                                key={k}
                                                                            >
                                                                                <strong>
                                                                                    {k}
                                                                                </strong>
                                                                                {" "}
                                                                                {String(
                                                                                    v,
                                                                                )}
                                                                            </li>
                                                                        ))}
                                                                </ul>
                                                            )
                                                            : (
                                                                <span className="admin-muted">
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
                                    <span>
                                        共 {auditTotal} 条 · 第 {auditPage} /
                                        {" "}
                                        {auditTotalPages} 页
                                    </span>
                                    <ActionGroup>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={auditPage <= 1 ||
                                                auditLoading}
                                            onClick={() =>
                                                setAuditPage(auditPage - 1)}
                                        >
                                            上一页
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={auditPage >=
                                                    auditTotalPages ||
                                                auditLoading}
                                            onClick={() =>
                                                setAuditPage(auditPage + 1)}
                                        >
                                            下一页
                                        </Button>
                                    </ActionGroup>
                                </div>
                            </>
                        )}
                </div>
            )}

            {activeTab === "backup" && <AdminBackupRestore />}

            <Dialog
                open={createModalOpen}
                onOpenChange={(open) => {
                    if (!createBusy) setCreateModalOpen(open);
                }}
            >
                <DialogContent finalFocus={modalTriggerRef}>
                    <DialogHeader>
                        <DialogTitle>创建新用户</DialogTitle>
                    </DialogHeader>
                    <form className="admin-form" onSubmit={handleCreateUser}>
                        {createError && (
                            <StatusBanner tone="error" density="compact">
                                {createError}
                            </StatusBanner>
                        )}
                        <div className="admin-field">
                            <label
                                className="admin-field-label"
                                htmlFor="create-username"
                            >
                                用户名
                            </label>
                            <Input
                                id="create-username"
                                type="text"
                                required
                                autoFocus
                                autoComplete="off"
                                pattern="^[a-zA-Z0-9_]{3,32}$"
                                placeholder="例如: alice"
                                aria-describedby="create-username-hint"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                            />
                            <span
                                id="create-username-hint"
                                className="admin-field-hint"
                            >
                                3–32 位字母、数字或下划线
                            </span>
                        </div>
                        <div className="admin-field">
                            <label
                                className="admin-field-label"
                                htmlFor="create-display-name"
                            >
                                显示名称
                            </label>
                            <Input
                                id="create-display-name"
                                type="text"
                                required
                                maxLength={40}
                                autoComplete="off"
                                placeholder="例如: 爱丽丝"
                                value={newDisplayName}
                                onChange={(e) =>
                                    setNewDisplayName(e.target.value)}
                            />
                        </div>
                        <div className="admin-field">
                            <label
                                className="admin-field-label"
                                htmlFor="create-email"
                            >
                                邮箱（可选）
                            </label>
                            <Input
                                id="create-email"
                                type="email"
                                autoComplete="off"
                                placeholder="alice@example.com"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                            />
                        </div>
                        <div className="admin-field">
                            <label
                                className="admin-field-label"
                                htmlFor="create-password"
                            >
                                初始密码（至少 12 位）
                            </label>
                            <Input
                                id="create-password"
                                type="password"
                                required
                                minLength={12}
                                maxLength={128}
                                autoComplete="new-password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={createBusy}
                                onClick={() => setCreateModalOpen(false)}
                            >
                                取消
                            </Button>
                            <Button
                                type="submit"
                                variant="default"
                                disabled={createBusy || !newUsername ||
                                    !newDisplayName || !newPassword}
                            >
                                {createBusy ? "正在创建…" : "创建"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog
                open={Boolean(resetModalUser)}
                onOpenChange={(open) => {
                    if (!resetBusy && !open) setResetModalUser(null);
                }}
            >
                <DialogContent finalFocus={modalTriggerRef}>
                    <DialogHeader>
                        <DialogTitle>重置密码：@{resetUsername}</DialogTitle>
                        <DialogDescription>
                            将注销该用户的全部会话，并要求其下次登录时修改密码。
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="admin-form"
                        onSubmit={handleResetPasswordSubmit}
                    >
                        {resetError && (
                            <StatusBanner tone="error" density="compact">
                                {resetError}
                            </StatusBanner>
                        )}
                        <div className="admin-field">
                            <label
                                className="admin-field-label"
                                htmlFor="reset-password-input"
                            >
                                新密码（至少 12 位）
                            </label>
                            <Input
                                id="reset-password-input"
                                type="password"
                                required
                                autoFocus
                                minLength={12}
                                maxLength={128}
                                autoComplete="new-password"
                                placeholder="输入该用户的临时新密码"
                                value={resetNewPassword}
                                onChange={(e) =>
                                    setResetNewPassword(e.target.value)}
                            />
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={resetBusy}
                                onClick={() => setResetModalUser(null)}
                            >
                                取消
                            </Button>
                            <Button
                                type="submit"
                                variant="default"
                                disabled={resetBusy || !resetNewPassword}
                            >
                                {resetBusy ? "正在重置…" : "重置密码"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={Boolean(deleteModalUser)}
                onOpenChange={(open) => {
                    if (!deleteBusy && !open) setDeleteModalUser(null);
                }}
            >
                <AlertDialogContent finalFocus={modalTriggerRef}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除用户</AlertDialogTitle>
                        <AlertDialogDescription>
                            删除 @{deleteUsername}{" "}
                            后，其会话将被立即终止，便签、应用和偏好将无法访问。此操作不可撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <form className="admin-form" onSubmit={handleDeleteSubmit}>
                        {deleteError && (
                            <StatusBanner tone="error" density="compact">
                                {deleteError}
                            </StatusBanner>
                        )}
                        <div className="admin-field">
                            <label
                                className="admin-field-label"
                                htmlFor="delete-confirm-input"
                            >
                                输入 @{deleteUsername} 确认
                            </label>
                            <Input
                                id="delete-confirm-input"
                                type="text"
                                required
                                autoFocus
                                autoComplete="off"
                                placeholder={deleteUsername}
                                value={deleteConfirmText}
                                onChange={(e) =>
                                    setDeleteConfirmText(e.target.value)}
                            />
                        </div>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={deleteBusy}>
                                取消
                            </AlertDialogCancel>
                            <Button
                                type="submit"
                                variant="destructive"
                                disabled={deleteBusy || !deleteModalUser ||
                                    (deleteConfirmText !== deleteUsername &&
                                        deleteConfirmText !== "CONFIRM")}
                            >
                                {deleteBusy ? "正在删除…" : "删除用户"}
                            </Button>
                        </AlertDialogFooter>
                    </form>
                </AlertDialogContent>
            </AlertDialog>
        </PageShell>
    );
}
