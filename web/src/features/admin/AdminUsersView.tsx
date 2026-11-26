import { type FormEvent, useEffect, useRef, useState } from "react";
import {
    Eye,
    Lock,
    MoreHorizontal,
    RefreshCw,
    Shield,
    Trash2,
    UserCheck,
    UserPlus,
    UserX,
} from "lucide-react";
import type { AdminUserDto } from "@shared/contracts.ts";
import { AdminPanelHeader } from "../../app/AdminShell.tsx";
import { errorMessage, useAppState } from "../../app/state.tsx";
import { api, json } from "../../lib/api.ts";
import { UserAvatar } from "../../components/searcher/UserAvatar.tsx";
import {
    EmptyState,
    LoadingState,
    ManagementTable,
    Pagination,
    SearchField,
    StatusBanner,
    WorkspaceToolbar,
} from "../../components/searcher/semantic.tsx";
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../../components/ui/table.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import {
    RadioGroup,
    RadioGroupItem,
} from "../../components/ui/radio-group.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
    CreateUserDialog,
    DeleteUserDialog,
    DisableUserAlertDialog,
    ResetPasswordDialog,
    UserDetailDialog,
} from "./AdminUserDialogs.tsx";
import "./admin-users-audit.css";

const USERS_PAGE_SIZE = 20;

type UserFilter = "all" | "admin" | "disabled";

interface UserListResponse {
    items: AdminUserDto[];
    page: number;
    total: number;
}

function formatCompactTime(timestamp: number): string {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function formatFullTime(timestamp: number): string {
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

function UserRolePill({ isAdmin }: { isAdmin: boolean }) {
    if (isAdmin) {
        return (
            <span className="admin-pill" data-tone="accent">
                <Shield
                    size="1em"
                    className="admin-pill-icon"
                    aria-hidden="true"
                />
                管理员
            </span>
        );
    }
    return (
        <span className="admin-pill" data-tone="neutral">
            普通用户
        </span>
    );
}

function UserStatusPills({ user }: { user: AdminUserDto }) {
    if (user.disabled) {
        return (
            <span className="admin-status-group">
                <span className="admin-pill" data-tone="danger">
                    <span className="admin-pill-dot" aria-hidden="true" />
                    已禁用
                </span>
            </span>
        );
    }
    return (
        <span className="admin-status-group">
            <span className="admin-pill" data-tone="success">
                <span className="admin-pill-dot" aria-hidden="true" />
                正常
            </span>
            {user.mustChangePassword && (
                <span className="admin-pill" data-tone="warning">
                    待改密
                </span>
            )}
        </span>
    );
}

interface UserRowActionsProps {
    user: AdminUserDto;
    isSelf: boolean;
    toggling: boolean;
    onInspect: (user: AdminUserDto, trigger: HTMLElement | null) => void;
    onResetPassword: (user: AdminUserDto, trigger: HTMLElement | null) => void;
    onToggleDisable: (user: AdminUserDto, trigger: HTMLElement | null) => void;
    onDelete: (user: AdminUserDto, trigger: HTMLElement | null) => void;
}

function UserRowActions({
    user,
    isSelf,
    toggling,
    onInspect,
    onResetPassword,
    onToggleDisable,
    onDelete,
}: UserRowActionsProps) {
    const menuTriggerRef = useRef<HTMLButtonElement>(null);
    const isAdmin = user.role === "admin";

    if (isSelf) {
        return (
            <div className="admin-ua-row-actions">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(event) =>
                        onResetPassword(user, event.currentTarget)}
                >
                    重置密码
                </Button>
            </div>
        );
    }

    if (isAdmin) {
        return (
            <div className="admin-ua-row-actions">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(event) => onInspect(user, event.currentTarget)}
                >
                    查看详情
                </Button>
                <span
                    className="admin-protected-tag"
                    title="管理员账户受安全策略保护，不能在后台直接重置、禁用或删除"
                >
                    <Lock
                        size="1em"
                        className="icon-sm"
                        aria-hidden="true"
                    />
                    <span>受保护</span>
                </span>
            </div>
        );
    }

    return (
        <div className="admin-ua-row-actions">
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(event) => onResetPassword(user, event.currentTarget)}
            >
                重置密码
            </Button>
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            ref={menuTriggerRef}
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`用户 @${user.username} 的更多操作`}
                            title="更多操作"
                        />
                    }
                >
                    <MoreHorizontal size="1em" />
                </DropdownMenuTrigger>
                <DropdownMenuContent sideOffset={4}>
                    <DropdownMenuItem
                        onClick={() => onInspect(user, menuTriggerRef.current)}
                    >
                        <Eye
                            size="1em"
                            className="icon-sm"
                            aria-hidden="true"
                        />
                        <span>查看详情</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={toggling}
                        onClick={() =>
                            onToggleDisable(user, menuTriggerRef.current)}
                    >
                        {user.disabled
                            ? (
                                <UserCheck
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                            )
                            : (
                                <UserX
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                            )}
                        <span>{user.disabled ? "启用用户" : "禁用用户…"}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDelete(user, menuTriggerRef.current)}
                    >
                        <Trash2
                            size="1em"
                            className="icon-sm"
                            aria-hidden="true"
                        />
                        <span>删除用户</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

export function AdminUsersView() {
    const { user: currentUser } = useAppState();

    const [users, setUsers] = useState<AdminUserDto[]>([]);
    const [userTotal, setUserTotal] = useState(0);
    const [userPage, setUserPage] = useState(1);
    const [userSearch, setUserSearch] = useState("");
    const [submittedSearch, setSubmittedSearch] = useState("");
    const [userFilter, setUserFilter] = useState<UserFilter>("all");
    const [usersLoading, setUsersLoading] = useState(false);
    const [usersInitialized, setUsersInitialized] = useState(false);
    const [userError, setUserError] = useState("");
    const [userSuccess, setUserSuccess] = useState("");

    const modalTriggerRef = useRef<HTMLElement | null>(null);
    const createTriggerRef = useRef<HTMLButtonElement>(null);

    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [inspectModalUser, setInspectModalUser] = useState<
        AdminUserDto | null
    >(null);
    const [resetModalUser, setResetModalUser] = useState<AdminUserDto | null>(
        null,
    );
    const [deleteModalUser, setDeleteModalUser] = useState<AdminUserDto | null>(
        null,
    );
    const [disableModalUser, setDisableModalUser] = useState<
        AdminUserDto | null
    >(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    async function loadUsers(
        page = userPage,
        q = submittedSearch,
        filter = userFilter,
    ) {
        if (currentUser?.role !== "admin") return;
        setUsersLoading(true);
        setUserError("");
        try {
            const qs = new URLSearchParams({
                page: String(page),
                filter,
            });
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

    useEffect(() => {
        if (currentUser?.role === "admin") {
            void loadUsers(userPage, submittedSearch, userFilter);
        }
    }, [currentUser, userPage, submittedSearch, userFilter]);

    function handleSearchSubmit(event: FormEvent) {
        event.preventDefault();
        setUserPage(1);
        setSubmittedSearch(userSearch);
    }

    function clearSearch() {
        setUserSearch("");
        setUserPage(1);
        setSubmittedSearch("");
    }

    function resetFilters() {
        setUserSearch("");
        setSubmittedSearch("");
        setUserFilter("all");
        setUserPage(1);
    }

    function openCreateModal(trigger: HTMLElement) {
        modalTriggerRef.current = trigger;
        setCreateModalOpen(true);
    }

    function openInspectModal(
        target: AdminUserDto,
        trigger: HTMLElement | null,
    ) {
        modalTriggerRef.current = trigger;
        setInspectModalUser(target);
    }

    function openResetModal(
        target: AdminUserDto,
        trigger: HTMLElement | null,
    ) {
        modalTriggerRef.current = trigger;
        setResetModalUser(target);
    }

    function openDeleteModal(
        target: AdminUserDto,
        trigger: HTMLElement | null,
    ) {
        modalTriggerRef.current = trigger;
        setDeleteModalUser(target);
    }

    async function setUserDisabled(
        targetUser: AdminUserDto,
        disabled: boolean,
    ) {
        setTogglingId(targetUser.id);
        setUserError("");
        setUserSuccess("");
        try {
            await api(
                `/api/admin/users/${targetUser.id}`,
                json("PATCH", { disabled }),
            );
            setUserSuccess(
                `已${disabled ? "禁用" : "启用"}用户 @${targetUser.username}`,
            );
            await loadUsers();
        } catch (err) {
            setUserError(errorMessage(err));
        } finally {
            setTogglingId(null);
        }
    }

    /** Enabling is harmless and immediate; disabling signs the user out everywhere, so it is confirmed first. */
    function requestToggleDisable(
        targetUser: AdminUserDto,
        trigger: HTMLElement | null,
    ) {
        if (targetUser.disabled) {
            void setUserDisabled(targetUser, false);
            return;
        }
        modalTriggerRef.current = trigger;
        setDisableModalUser(targetUser);
    }

    async function confirmDisable(targetUser: AdminUserDto) {
        await setUserDisabled(targetUser, true);
        setDisableModalUser(null);
    }

    const totalPages = Math.max(1, Math.ceil(userTotal / USERS_PAGE_SIZE));
    const hasFilters = Boolean(submittedSearch || userFilter !== "all");

    return (
        <div className="semantic-section">
            <AdminPanelHeader
                title="用户"
                description="管理账户访问权限、凭据重置与状态"
                meta={usersInitialized ? `共 ${userTotal} 位` : undefined}
                actions={
                    <>
                        <Button
                            type="button"
                            variant="outline"
                            title="刷新用户列表"
                            disabled={usersLoading}
                            onClick={() =>
                                void loadUsers(
                                    userPage,
                                    submittedSearch,
                                    userFilter,
                                )}
                        >
                            <RefreshCw
                                size="1em"
                                className={usersLoading
                                    ? "admin-spin"
                                    : undefined}
                                aria-hidden="true"
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
                            <UserPlus
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                            <span>添加用户</span>
                        </Button>
                    </>
                }
            />

            {userError && (
                <StatusBanner tone="error" density="compact">
                    {userError}
                </StatusBanner>
            )}
            {userSuccess && (
                <StatusBanner tone="success" density="compact">
                    {userSuccess}
                </StatusBanner>
            )}

            <WorkspaceToolbar className="admin-ua-toolbar">
                <form
                    role="search"
                    className="admin-ua-search-field"
                    onSubmit={handleSearchSubmit}
                >
                    <SearchField
                        name="userSearch"
                        aria-label="搜索用户"
                        placeholder="按用户名、显示名称或邮箱搜索"
                        value={userSearch}
                        onValueChange={(next) => {
                            if (next === "" && submittedSearch) {
                                clearSearch();
                                return;
                            }
                            setUserSearch(next);
                        }}
                    />
                </form>
                <RadioGroup
                    variant="segmented"
                    aria-label="筛选用户"
                    value={userFilter}
                    onValueChange={(value) => {
                        if (
                            value === "all" || value === "admin" ||
                            value === "disabled"
                        ) {
                            setUserFilter(value);
                            setUserPage(1);
                        }
                    }}
                >
                    <RadioGroupItem value="all">全部</RadioGroupItem>
                    <RadioGroupItem value="admin">管理员</RadioGroupItem>
                    <RadioGroupItem value="disabled">已禁用</RadioGroupItem>
                </RadioGroup>
            </WorkspaceToolbar>

            {!usersInitialized && usersLoading
                ? (
                    <div className="admin-surface admin-ua-state-card">
                        <LoadingState>正在加载用户…</LoadingState>
                    </div>
                )
                : userError && users.length === 0
                ? (
                    <div className="admin-surface admin-ua-state-card">
                        <EmptyState
                            illustration="auth-or-error"
                            title="无法加载用户列表"
                            action={
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                        void loadUsers(
                                            userPage,
                                            submittedSearch,
                                            userFilter,
                                        )}
                                >
                                    重试
                                </Button>
                            }
                        />
                    </div>
                )
                : users.length === 0
                ? (
                    <div className="admin-surface admin-ua-state-card">
                        <EmptyState
                            illustration="no-results"
                            title={submittedSearch
                                ? `没有匹配「${submittedSearch}」的用户`
                                : userFilter !== "all"
                                ? "当前筛选条件下暂无用户"
                                : "暂无用户"}
                            action={hasFilters
                                ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={submittedSearch
                                            ? clearSearch
                                            : resetFilters}
                                    >
                                        {submittedSearch
                                            ? "清除搜索"
                                            : "查看全部用户"}
                                    </Button>
                                )
                                : undefined}
                        />
                    </div>
                )
                : (
                    <>
                        <div className="admin-ua-desktop admin-surface admin-ua-table-surface">
                            <ManagementTable
                                caption="用户列表"
                                className="admin-ua-table admin-ua-users-table"
                            >
                                <TableHeader>
                                    <TableRow>
                                        <TableHead scope="col">用户</TableHead>
                                        <TableHead
                                            scope="col"
                                            className="admin-ua-hide-narrow"
                                        >
                                            角色
                                        </TableHead>
                                        <TableHead scope="col">状态</TableHead>
                                        <TableHead
                                            scope="col"
                                            className="admin-ua-user-date-col"
                                        >
                                            创建时间
                                        </TableHead>
                                        <TableHead
                                            scope="col"
                                            className="admin-ua-cell-actions"
                                        >
                                            <span className="sr-only">
                                                操作
                                            </span>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.map((u) => {
                                        const isSelf = u.id === currentUser?.id;
                                        const isAdmin = u.role === "admin";
                                        const fullTime = formatFullTime(
                                            u.createdAt,
                                        );
                                        return (
                                            <TableRow key={u.id}>
                                                <TableCell>
                                                    <div className="admin-user-cell">
                                                        <button
                                                            type="button"
                                                            className="admin-user-identity-btn"
                                                            onClick={(event) =>
                                                                openInspectModal(
                                                                    u,
                                                                    event
                                                                        .currentTarget,
                                                                )}
                                                            aria-label={`查看用户 ${
                                                                u.displayName ||
                                                                u.username
                                                            } 详情`}
                                                        >
                                                            <span
                                                                className="admin-user-avatar"
                                                                aria-hidden="true"
                                                            >
                                                                <UserAvatar
                                                                    user={u}
                                                                />
                                                            </span>
                                                            <span className="admin-user-text">
                                                                <span className="admin-user-name-line">
                                                                    <span className="admin-user-name">
                                                                        {u
                                                                            .displayName ||
                                                                            u
                                                                                .username}
                                                                    </span>
                                                                    {isSelf && (
                                                                        <span
                                                                            className="admin-pill"
                                                                            data-tone="accent"
                                                                        >
                                                                            当前登录
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                <span className="admin-user-handle">
                                                                    @{u.username}
                                                                    {u.email
                                                                        ? ` · ${u.email}`
                                                                        : ""}
                                                                </span>
                                                                <span className="admin-user-handle admin-ua-user-date-inline admin-tabular">
                                                                    创建于{" "}
                                                                    {formatCompactTime(
                                                                        u
                                                                            .createdAt,
                                                                    )}
                                                                </span>
                                                            </span>
                                                        </button>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="admin-ua-hide-narrow admin-ua-nowrap">
                                                    <UserRolePill
                                                        isAdmin={isAdmin}
                                                    />
                                                </TableCell>
                                                <TableCell className="admin-ua-nowrap">
                                                    <UserStatusPills user={u} />
                                                </TableCell>
                                                <TableCell
                                                    className="admin-ua-user-date-col admin-ua-muted admin-tabular admin-ua-nowrap"
                                                    title={fullTime}
                                                >
                                                    {formatCompactTime(
                                                        u.createdAt,
                                                    )}
                                                </TableCell>
                                                <TableCell className="admin-ua-cell-actions">
                                                    <UserRowActions
                                                        user={u}
                                                        isSelf={isSelf}
                                                        toggling={togglingId ===
                                                            u.id}
                                                        onInspect={openInspectModal}
                                                        onResetPassword={openResetModal}
                                                        onToggleDisable={requestToggleDisable}
                                                        onDelete={openDeleteModal}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </ManagementTable>
                        </div>

                        <div
                            className="admin-ua-mobile-list admin-surface"
                            role="list"
                            aria-label="用户列表"
                        >
                            {users.map((u) => {
                                const isSelf = u.id === currentUser?.id;
                                const isAdmin = u.role === "admin";
                                return (
                                    <article
                                        role="listitem"
                                        className="admin-ua-user-card"
                                        key={u.id}
                                    >
                                        <div className="admin-ua-user-card-head">
                                            <button
                                                type="button"
                                                className="admin-user-identity-btn admin-ua-user-card-identity"
                                                onClick={(event) =>
                                                    openInspectModal(
                                                        u,
                                                        event.currentTarget,
                                                    )}
                                                aria-label={`查看用户 ${
                                                    u.displayName || u.username
                                                } 详情`}
                                            >
                                                <span
                                                    className="admin-user-avatar"
                                                    aria-hidden="true"
                                                >
                                                    <UserAvatar user={u} />
                                                </span>
                                                <span className="admin-user-text">
                                                    <span className="admin-user-name-line">
                                                        <span className="admin-user-name">
                                                            {u.displayName ||
                                                                u.username}
                                                        </span>
                                                        {isSelf && (
                                                            <span
                                                                className="admin-pill"
                                                                data-tone="accent"
                                                            >
                                                                当前登录
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className="admin-user-handle">
                                                        @{u.username}
                                                        {u.email
                                                            ? ` · ${u.email}`
                                                            : ""}
                                                    </span>
                                                </span>
                                            </button>
                                        </div>
                                        <div className="admin-ua-user-card-meta">
                                            <div className="admin-status-group">
                                                <UserRolePill
                                                    isAdmin={isAdmin}
                                                />
                                                <UserStatusPills user={u} />
                                            </div>
                                            <time
                                                className="admin-ua-muted admin-tabular admin-ua-card-time"
                                                title={formatFullTime(
                                                    u.createdAt,
                                                )}
                                            >
                                                {formatCompactTime(u.createdAt)}
                                            </time>
                                        </div>
                                        <div className="admin-ua-user-card-actions">
                                            <UserRowActions
                                                user={u}
                                                isSelf={isSelf}
                                                toggling={togglingId === u.id}
                                                onInspect={openInspectModal}
                                                onResetPassword={openResetModal}
                                                onToggleDisable={requestToggleDisable}
                                                onDelete={openDeleteModal}
                                            />
                                        </div>
                                    </article>
                                );
                            })}
                        </div>

                        {totalPages > 1 && (
                            <Pagination
                                label="用户列表分页"
                                total={`共 ${userTotal} 位`}
                                page={userPage}
                                pageCount={totalPages}
                                busy={usersLoading}
                                onPageChange={setUserPage}
                            />
                        )}
                    </>
                )}

            <CreateUserDialog
                open={createModalOpen}
                onOpenChange={setCreateModalOpen}
                finalFocus={modalTriggerRef}
                onCreated={async (username) => {
                    setUserSuccess(`用户 @${username} 创建成功`);
                    await loadUsers(1, submittedSearch, userFilter);
                }}
            />

            <UserDetailDialog
                user={inspectModalUser}
                isSelf={Boolean(
                    inspectModalUser &&
                        inspectModalUser.id === currentUser?.id,
                )}
                toggling={Boolean(
                    inspectModalUser && togglingId === inspectModalUser.id,
                )}
                onClose={() => setInspectModalUser(null)}
                finalFocus={modalTriggerRef}
                onResetPassword={(target) => {
                    setInspectModalUser(null);
                    setResetModalUser(target);
                }}
                onToggleDisable={(target) => {
                    setInspectModalUser(null);
                    if (target.disabled) {
                        void setUserDisabled(target, false);
                    } else {
                        setDisableModalUser(target);
                    }
                }}
                onDelete={(target) => {
                    setInspectModalUser(null);
                    setDeleteModalUser(target);
                }}
            />

            <ResetPasswordDialog
                user={resetModalUser}
                currentUserId={currentUser?.id}
                onClose={() => setResetModalUser(null)}
                finalFocus={modalTriggerRef}
                onResetSuccess={async (username) => {
                    setUserSuccess(
                        `已重置 @${username} 的密码，已强制下次登录修改密码，并撤销其全部会话。`,
                    );
                    await loadUsers();
                }}
            />

            <DeleteUserDialog
                user={deleteModalUser}
                onClose={() => setDeleteModalUser(null)}
                finalFocus={modalTriggerRef}
                onDeleteSuccess={async (username) => {
                    setUserSuccess(
                        `已删除用户 @${username}，其会话已立即终止。`,
                    );
                    modalTriggerRef.current = createTriggerRef.current;
                    setDeleteModalUser(null);
                    await loadUsers();
                }}
            />

            <DisableUserAlertDialog
                user={disableModalUser}
                busy={Boolean(togglingId)}
                onClose={() => setDisableModalUser(null)}
                onConfirm={confirmDisable}
                finalFocus={modalTriggerRef}
            />
        </div>
    );
}
