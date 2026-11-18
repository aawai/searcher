import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { adminTab, routes } from "./routes.ts";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import {
    EmptyState,
    LoadingState,
    ManagementTable,
    Pagination,
    StatusBanner,
    WorkspaceToolbar,
} from "../components/searcher/semantic.tsx";
import { AdminPanelHeader, AdminShell } from "./AdminShell.tsx";
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../components/ui/table.tsx";
import { NotFoundPage } from "./NotFoundPage.tsx";
import {
    Check,
    ChevronDown,
    Copy,
    Eye,
    EyeOff,
    MoreHorizontal,
    RefreshCw,
} from "lucide-react";
import { AdminOverview } from "./AdminOverview.tsx";
import { AdminSystemSettings } from "./AdminSystemSettings.tsx";
import { AdminBackupRestore } from "./AdminBackupRestore.tsx";
import type {
    AdminUserDto,
    AuditAction,
    AuditLogDto,
} from "@shared/contracts.ts";
import { AUTH_CREDENTIAL_RULES } from "@shared/contracts.ts";
import {
    AUDIT_ACTION_GROUPS,
    describeAuditAction,
    describeAuditMetadata,
    describeAuditTarget,
    parseAuditActionFilter,
} from "./admin-audit.ts";
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
    AlertDialogAction,
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
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "../components/ui/popover.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import {
    NativeSelect,
    NativeSelectOptGroup,
    NativeSelectOption,
} from "../components/ui/native-select.tsx";
import { api, json } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";
import { errorMessage, useAppState } from "./state.tsx";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group.tsx";
import "./admin.css";

const USERS_PAGE_SIZE = 20;
const AUDIT_PAGE_SIZE = 25;
const passwordRules = AUTH_CREDENTIAL_RULES.password;
const passwordRule =
    `密码长度须为 ${passwordRules.minLength}–${passwordRules.maxLength} 个字符`;

interface UserListResponse {
    items: AdminUserDto[];
    page: number;
    total: number;
}

interface AuditLogResponse {
    items: AuditLogDto[];
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

function formatAuditActor(log: AuditLogDto): string {
    if (log.actorUsername) return `@${log.actorUsername}`;
    if (log.actorUserId) return "已删除用户";
    return "系统";
}

/** Long ids show a prefix; the full id opens in a popover with copy support. */
function AuditTargetId({ id }: { id: string }) {
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState(false);
    if (id.length <= 10) {
        return <span className="admin-audit-id">{id}</span>;
    }
    const prefix = `${id.slice(0, 10)}…`;
    async function handleCopy() {
        setCopyError(false);
        try {
            if (!navigator.clipboard) throw new Error("剪贴板不可用");
            await navigator.clipboard.writeText(id);
            setCopied(true);
            globalThis.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
            setCopyError(true);
        }
    }
    return (
        <Popover>
            <PopoverTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="admin-audit-id admin-audit-id-trigger"
                        aria-label={`${prefix} 查看完整 ID`}
                    />
                }
            >
                {prefix}
                <ChevronDown
                    size="1em"
                    className="icon-sm"
                    aria-hidden="true"
                />
            </PopoverTrigger>
            <PopoverContent
                side="bottom"
                align="start"
                className="admin-audit-id-popover"
                aria-label="完整对象 ID"
            >
                <div className="admin-audit-popover-row">
                    <span className="admin-audit-id admin-audit-full-id">
                        {id}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={copied ? "已复制对象 ID" : "复制对象 ID"}
                        onClick={() => void handleCopy()}
                    >
                        {copied
                            ? (
                                <Check
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                            )
                            : (
                                <Copy
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                            )}
                        <span>{copied ? "已复制" : "复制"}</span>
                    </Button>
                </div>
                {copyError && (
                    <p role="alert">复制失败，请手动选择并复制 ID。</p>
                )}
            </PopoverContent>
        </Popover>
    );
}

function AuditDetails(
    { details, className }: {
        details: { label: string; value: string }[];
        className?: string;
    },
) {
    return (
        <ul className={cn("admin-audit-details", className)}>
            {details.map(({ label, value }) => (
                <li key={label}>
                    <strong>{label}</strong> {value}
                </li>
            ))}
        </ul>
    );
}

function AuditLogRow({ log }: { log: AuditLogDto }) {
    const action = describeAuditAction(log.action);
    const target = describeAuditTarget(
        log.targetType,
        log.targetId,
        log.metadata,
    );
    const details = describeAuditMetadata(log.metadata);
    const time = formatTime(log.createdAt);
    return (
        <TableRow>
            <TableCell className="admin-audit-date-column admin-nowrap admin-muted">
                {time}
            </TableCell>
            <TableCell className="admin-audit-actor">
                {formatAuditActor(log)}
            </TableCell>
            <TableCell className="admin-audit-action">
                <span className={action.danger ? "admin-danger" : undefined}>
                    {action.label}
                </span>
                {action.rawKey && (
                    <code className="admin-audit-id">{action.rawKey}</code>
                )}
                <time className="admin-audit-time admin-audit-tablet-time">
                    {time}
                </time>
            </TableCell>
            <TableCell className="admin-audit-target-cell">
                <span className="admin-audit-target">{target.label}</span>
                {target.id && <AuditTargetId id={target.id} />}
            </TableCell>
            <TableCell>
                {details.length > 0
                    ? <AuditDetails details={details} />
                    : <span className="admin-muted">—</span>}
            </TableCell>
        </TableRow>
    );
}

function AuditEventItem({ log }: { log: AuditLogDto }) {
    const action = describeAuditAction(log.action);
    const target = describeAuditTarget(
        log.targetType,
        log.targetId,
        log.metadata,
    );
    const details = describeAuditMetadata(log.metadata);
    const time = formatTime(log.createdAt);
    return (
        <article role="listitem" className="admin-audit-event">
            <div className="admin-audit-event-head">
                <div className="admin-audit-action">
                    <span
                        className={action.danger ? "admin-danger" : undefined}
                    >
                        {action.label}
                    </span>
                    {action.rawKey && (
                        <code className="admin-audit-id">{action.rawKey}</code>
                    )}
                </div>
                <time className="admin-audit-time">{time}</time>
            </div>
            <div className="admin-audit-event-target">
                <span className="admin-audit-actor">
                    {formatAuditActor(log)}
                </span>
                <span className="admin-muted" aria-hidden="true">→</span>
                <span className="admin-audit-target">{target.label}</span>
                {target.id && <AuditTargetId id={target.id} />}
            </div>
            {details.length > 0 && <AuditDetails details={details} />}
        </article>
    );
}
export function AdminPage() {
    const { user: currentUser } = useAppState();
    const location = useLocation();
    const activeTab = adminTab(location.pathname);

    const [users, setUsers] = useState<AdminUserDto[]>([]);
    const [userTotal, setUserTotal] = useState(0);
    const [userPage, setUserPage] = useState(1);
    const [userSearch, setUserSearch] = useState("");
    const [submittedSearch, setSubmittedSearch] = useState("");
    const [userFilter, setUserFilter] = useState<"all" | "admin" | "disabled">(
        "all",
    );
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
    const mobileActionRefs = useRef<Record<string, HTMLElement | null>>({});
    const createTriggerRef = useRef<HTMLButtonElement>(null);

    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [newUsername, setNewUsername] = useState("");
    const [newDisplayName, setNewDisplayName] = useState("");
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [showCreatePassword, setShowCreatePassword] = useState(false);
    const [createBusy, setCreateBusy] = useState(false);
    const [createError, setCreateError] = useState("");
    const [createPasswordError, setCreatePasswordError] = useState("");
    const createPasswordRef = useRef<HTMLInputElement>(null);

    const [resetModalUser, setResetModalUser] = useState<AdminUserDto | null>(
        null,
    );
    const [resetNewPassword, setResetNewPassword] = useState("");
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [resetBusy, setResetBusy] = useState(false);
    const [resetError, setResetError] = useState("");

    const [deleteModalUser, setDeleteModalUser] = useState<AdminUserDto | null>(
        null,
    );
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteError, setDeleteError] = useState("");

    const [disableModalUser, setDisableModalUser] = useState<
        AdminUserDto | null
    >(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const [auditLogs, setAuditLogs] = useState<AuditLogDto[]>([]);
    const [auditTotal, setAuditTotal] = useState(0);
    const [auditPage, setAuditPage] = useState(1);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditInitialized, setAuditInitialized] = useState(false);
    const [auditError, setAuditError] = useState("");
    const [auditActionFilter, setAuditActionFilter] = useState<
        AuditAction | ""
    >("");
    const [auditSearch, setAuditSearch] = useState("");
    const [submittedAuditSearch, setSubmittedAuditSearch] = useState("");

    async function loadUsers(page = userPage, q = submittedSearch) {
        if (currentUser?.role !== "admin") return;
        setUsersLoading(true);
        setUserError("");
        try {
            const qs = new URLSearchParams({ page: String(page) });
            qs.set("filter", userFilter);
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

    async function loadAuditLogs(
        page = auditPage,
        action = auditActionFilter,
        q = submittedAuditSearch,
    ) {
        if (currentUser?.role !== "admin") return;
        setAuditLoading(true);
        setAuditError("");
        try {
            const qs = new URLSearchParams({
                page: String(page),
                limit: String(AUDIT_PAGE_SIZE),
            });
            if (action) qs.set("action", action);
            if (q.trim()) qs.set("q", q.trim());
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
        if (currentUser?.role === "admin" && activeTab === "users") {
            void loadUsers(userPage, submittedSearch);
        }
    }, [currentUser, activeTab, userPage, submittedSearch, userFilter]);

    useEffect(() => {
        if (currentUser?.role === "admin" && activeTab === "audit") {
            void loadAuditLogs(
                auditPage,
                auditActionFilter,
                submittedAuditSearch,
            );
        }
    }, [
        currentUser,
        activeTab,
        auditPage,
        auditActionFilter,
        submittedAuditSearch,
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

    function handleAuditSearchSubmit(e: FormEvent) {
        e.preventDefault();
        setAuditPage(1);
        setSubmittedAuditSearch(auditSearch);
    }

    function clearAuditSearch() {
        setAuditSearch("");
        setAuditPage(1);
        setSubmittedAuditSearch("");
    }

    function openCreateModal(trigger: HTMLElement) {
        modalTriggerRef.current = trigger;
        setCreateError("");
        setCreatePasswordError("");
        setShowCreatePassword(false);
        setCreateModalOpen(true);
    }

    async function handleCreateUser(e: FormEvent) {
        e.preventDefault();
        setCreateError("");
        setCreatePasswordError("");
        if (
            newPassword.length < passwordRules.minLength ||
            newPassword.length > passwordRules.maxLength
        ) {
            setCreatePasswordError(passwordRule);
            createPasswordRef.current?.focus();
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

    async function confirmDisable() {
        if (!disableModalUser) return;
        await setUserDisabled(disableModalUser, true);
        setDisableModalUser(null);
    }

    async function handleResetPasswordSubmit(e: FormEvent) {
        e.preventDefault();
        if (!resetModalUser) return;
        setResetError("");
        if (
            resetNewPassword.length < passwordRules.minLength ||
            resetNewPassword.length > passwordRules.maxLength
        ) {
            setResetError(passwordRule);
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
        if (deleteConfirmText !== deleteModalUser.username) {
            setDeleteError(
                `输入用户名 ${deleteModalUser.username}（不含 @）以确认删除`,
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
        setShowResetPassword(false);
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

    const totalPages = Math.max(1, Math.ceil(userTotal / USERS_PAGE_SIZE));
    const auditTotalPages = Math.max(
        1,
        Math.ceil(auditTotal / AUDIT_PAGE_SIZE),
    );
    const resetUsername = resetModalUser?.username ?? "";
    const deleteUsername = deleteModalUser?.username ?? "";

    return (
        <AdminShell activeTab={activeTab}>
            {activeTab === "overview" && <AdminOverview />}

            {activeTab === "users" && (
                <div className="semantic-section">
                    <AdminPanelHeader
                        title="用户"
                        meta={usersInitialized
                            ? `共 ${userTotal} 位`
                            : undefined}
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
                                        )}
                                >
                                    <RefreshCw
                                        size="1em"
                                        className={usersLoading
                                            ? "animate-spin"
                                            : undefined}
                                    />
                                    <span>
                                        {usersLoading ? "刷新中…" : "刷新"}
                                    </span>
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

                    <WorkspaceToolbar>
                        <form
                            role="search"
                            className="admin-toolbar-field"
                            onSubmit={handleSearchSubmit}
                        >
                            <Input
                                name="userSearch"
                                type="search"
                                variant="search"
                                aria-label="搜索用户"
                                placeholder="按用户名、显示名称或邮箱搜索"
                                value={userSearch}
                                onChange={(e) => {
                                    // The field's own clear button is the one way to drop the search.
                                    if (
                                        e.target.value === "" && submittedSearch
                                    ) {
                                        clearSearch();
                                        return;
                                    }
                                    setUserSearch(e.target.value);
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
                            <RadioGroupItem value="admin">
                                管理员
                            </RadioGroupItem>
                            <RadioGroupItem value="disabled">
                                已禁用
                            </RadioGroupItem>
                        </RadioGroup>
                    </WorkspaceToolbar>

                    {!usersInitialized && usersLoading
                        ? <LoadingState>正在加载用户…</LoadingState>
                        : userError && users.length === 0
                        ? (
                            <EmptyState
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
                                <div className="admin-desktop-view admin-users-table">
                                    <ManagementTable caption="用户列表">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead scope="col">
                                                    用户
                                                </TableHead>
                                                <TableHead
                                                    scope="col"
                                                    className="admin-hide-narrow"
                                                >
                                                    角色
                                                </TableHead>
                                                <TableHead scope="col">
                                                    状态
                                                </TableHead>
                                                <TableHead
                                                    scope="col"
                                                    className="admin-user-date-column"
                                                >
                                                    创建时间
                                                </TableHead>
                                                <TableHead
                                                    scope="col"
                                                    className="admin-cell-actions"
                                                >
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
                                                const isAdmin =
                                                    u.role === "admin";
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
                                                            <span className="admin-user-handle admin-user-date-inline">
                                                                创建时间：{formatTime(
                                                                    u.createdAt,
                                                                )}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="admin-hide-narrow admin-nowrap">
                                                            {isAdmin
                                                                ? "管理员"
                                                                : "普通用户"}
                                                        </TableCell>
                                                        <TableCell className="admin-nowrap">
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
                                                        <TableCell className="admin-user-date-column admin-muted">
                                                            {formatTime(
                                                                u.createdAt,
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="admin-cell-actions">
                                                            <div className="admin-row-actions">
                                                                {isSelf
                                                                    ? (
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="sm"
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
                                                                    )
                                                                    : (
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
                                                                                                requestToggleDisable(
                                                                                                    u,
                                                                                                    actionTriggerRefs
                                                                                                        .current[
                                                                                                            u.id
                                                                                                        ] ??
                                                                                                        null,
                                                                                                )}
                                                                                        >
                                                                                            {u.disabled
                                                                                                ? "启用用户"
                                                                                                : "禁用用户…"}
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
                                                                    )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </ManagementTable>
                                </div>
                                <div
                                    className="admin-mobile-list"
                                    role="list"
                                    aria-label="用户列表"
                                >
                                    {users.map((u) => (
                                        <div
                                            role="listitem"
                                            className="admin-user-row"
                                            key={u.id}
                                        >
                                            <div className="admin-user-row-head">
                                                <div>
                                                    <span className="admin-user-name">
                                                        {u.displayName ||
                                                            u.username}
                                                    </span>
                                                    <span>
                                                        {u.role === "admin"
                                                            ? "管理员"
                                                            : "普通用户"}
                                                    </span>
                                                    {u.disabled && (
                                                        <span className="admin-danger">
                                                            · 已禁用
                                                        </span>
                                                    )}
                                                </div>
                                                {u.id === currentUser?.id
                                                    ? (
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={(event) =>
                                                                openResetModal(
                                                                    u,
                                                                    event
                                                                        .currentTarget,
                                                                )}
                                                        >
                                                            重置密码
                                                        </Button>
                                                    )
                                                    : (
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger
                                                                render={
                                                                    <Button
                                                                        ref={(
                                                                            node,
                                                                        ) => {
                                                                            mobileActionRefs
                                                                                .current[
                                                                                    u.id
                                                                                ] = node;
                                                                        }}
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        aria-label={`用户 @${u.username} 的更多操作`}
                                                                    />
                                                                }
                                                            >
                                                                <MoreHorizontal size="1em" />
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent>
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        openResetModal(
                                                                            u,
                                                                            mobileActionRefs
                                                                                .current[
                                                                                    u.id
                                                                                ] ??
                                                                                null,
                                                                        )}
                                                                >
                                                                    重置密码
                                                                </DropdownMenuItem>
                                                                {u.role !==
                                                                        "admin" &&
                                                                    (
                                                                        <DropdownMenuItem
                                                                            disabled={togglingId ===
                                                                                u.id}
                                                                            onClick={() =>
                                                                                requestToggleDisable(
                                                                                    u,
                                                                                    mobileActionRefs
                                                                                        .current[
                                                                                            u.id
                                                                                        ] ??
                                                                                        null,
                                                                                )}
                                                                        >
                                                                            {u.disabled
                                                                                ? "启用用户"
                                                                                : "禁用用户…"}
                                                                        </DropdownMenuItem>
                                                                    )}
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    variant="destructive"
                                                                    onClick={() =>
                                                                        openDeleteModal(
                                                                            u,
                                                                            mobileActionRefs
                                                                                .current[
                                                                                    u.id
                                                                                ] ??
                                                                                null,
                                                                        )}
                                                                >
                                                                    删除用户
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    )}
                                            </div>
                                            <span className="admin-user-handle">
                                                @{u.username}
                                                {u.email ? ` · ${u.email}` : ""}
                                                {u.id === currentUser?.id
                                                    ? " · 当前登录"
                                                    : ""} ·{" "}
                                                {formatTime(u.createdAt)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <Pagination
                                    label="用户列表分页"
                                    total={`共 ${userTotal} 位`}
                                    page={userPage}
                                    pageCount={totalPages}
                                    busy={usersLoading}
                                    onPageChange={setUserPage}
                                />
                            </>
                        )}
                </div>
            )}

            {activeTab === "settings" && <AdminSystemSettings />}

            {activeTab === "audit" && (
                <div className="semantic-section">
                    <AdminPanelHeader
                        title="审计"
                        meta={auditInitialized
                            ? `共 ${auditTotal} 条`
                            : undefined}
                        actions={
                            <Button
                                type="button"
                                variant="outline"
                                title="刷新审计日志"
                                disabled={auditLoading}
                                onClick={() =>
                                    void loadAuditLogs(
                                        auditPage,
                                        auditActionFilter,
                                        submittedAuditSearch,
                                    )}
                            >
                                <RefreshCw
                                    size="1em"
                                    className={auditLoading
                                        ? "animate-spin"
                                        : undefined}
                                />
                                <span>
                                    {auditLoading ? "刷新中…" : "刷新"}
                                </span>
                            </Button>
                        }
                    />
                    {auditError && (
                        <StatusBanner tone="error" density="compact">
                            {auditError}
                        </StatusBanner>
                    )}
                    <WorkspaceToolbar>
                        <form
                            role="search"
                            className="admin-toolbar-field"
                            onSubmit={handleAuditSearchSubmit}
                        >
                            <Input
                                name="auditSearch"
                                type="search"
                                variant="search"
                                aria-label="搜索审计日志"
                                placeholder="按操作者、对象 ID 或明细搜索"
                                value={auditSearch}
                                onChange={(e) => {
                                    if (
                                        e.target.value === "" &&
                                        submittedAuditSearch
                                    ) {
                                        clearAuditSearch();
                                        return;
                                    }
                                    setAuditSearch(e.target.value);
                                }}
                            />
                        </form>
                        <NativeSelect
                            className="admin-toolbar-field"
                            aria-label="按操作筛选审计日志"
                            value={auditActionFilter}
                            onChange={(e) => {
                                setAuditActionFilter(
                                    parseAuditActionFilter(e.target.value),
                                );
                                setAuditPage(1);
                            }}
                        >
                            <NativeSelectOption value="">
                                全部操作
                            </NativeSelectOption>
                            {AUDIT_ACTION_GROUPS.map(({ group, actions }) => (
                                <NativeSelectOptGroup key={group} label={group}>
                                    {actions.map(({ value, label }) => (
                                        <NativeSelectOption
                                            key={value}
                                            value={value}
                                        >
                                            {label}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelectOptGroup>
                            ))}
                        </NativeSelect>
                    </WorkspaceToolbar>

                    {!auditInitialized && auditLoading
                        ? <LoadingState>正在加载审计日志…</LoadingState>
                        : auditError && auditLogs.length === 0
                        ? (
                            <EmptyState
                                title="无法加载审计日志"
                                action={
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            void loadAuditLogs(
                                                auditPage,
                                                auditActionFilter,
                                                submittedAuditSearch,
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
                                title={auditActionFilter || submittedAuditSearch
                                    ? "没有匹配的审计记录"
                                    : "暂无审计记录"}
                                action={auditActionFilter ||
                                        submittedAuditSearch
                                    ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => {
                                                setAuditActionFilter("");
                                                setAuditSearch("");
                                                setSubmittedAuditSearch("");
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
                                <div className="admin-desktop-view">
                                    <ManagementTable caption="审计日志">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead
                                                    scope="col"
                                                    className="admin-audit-date-column"
                                                >
                                                    时间
                                                </TableHead>
                                                <TableHead scope="col">
                                                    操作者
                                                </TableHead>
                                                <TableHead scope="col">
                                                    操作
                                                </TableHead>
                                                <TableHead scope="col">
                                                    对象
                                                </TableHead>
                                                <TableHead scope="col">
                                                    明细
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {auditLogs.map((log) => (
                                                <AuditLogRow
                                                    key={log.id}
                                                    log={log}
                                                />
                                            ))}
                                        </TableBody>
                                    </ManagementTable>
                                </div>
                                <div
                                    className="admin-mobile-list"
                                    role="list"
                                    aria-label="审计日志列表"
                                >
                                    {auditLogs.map((log) => (
                                        <AuditEventItem
                                            key={log.id}
                                            log={log}
                                        />
                                    ))}
                                </div>
                                <Pagination
                                    label="审计日志分页"
                                    total={`共 ${auditTotal} 条`}
                                    page={auditPage}
                                    pageCount={auditTotalPages}
                                    busy={auditLoading}
                                    onPageChange={setAuditPage}
                                />
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
                                name="username"
                                type="text"
                                required
                                autoFocus
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                pattern="^[a-zA-Z0-9_]{3,32}$"
                                placeholder="设置用户名"
                                aria-describedby="create-username-hint"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                            />
                            <p
                                id="create-username-hint"
                                className="admin-field-hint"
                            >
                                3–32 位字母、数字或下划线
                            </p>
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
                                name="displayName"
                                type="text"
                                required
                                maxLength={40}
                                autoComplete="off"
                                placeholder="设置显示名称"
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
                                name="email"
                                type="email"
                                autoComplete="off"
                                spellCheck={false}
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
                                初始密码
                            </label>
                            <div className="flex items-center gap-2">
                                <Input
                                    ref={createPasswordRef}
                                    id="create-password"
                                    name="password"
                                    className="min-w-0 flex-1"
                                    placeholder={`至少 ${passwordRules.minLength} 个字符`}
                                    type={showCreatePassword
                                        ? "text"
                                        : "password"}
                                    required
                                    minLength={passwordRules.minLength}
                                    maxLength={passwordRules.maxLength}
                                    autoComplete="new-password"
                                    aria-describedby="create-password-hint"
                                    aria-invalid={Boolean(
                                        createPasswordError,
                                    ) || undefined}
                                    value={newPassword}
                                    onChange={(e) => {
                                        setNewPassword(e.target.value);
                                        if (createPasswordError) {
                                            setCreatePasswordError("");
                                        }
                                    }}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    aria-pressed={showCreatePassword}
                                    aria-label={showCreatePassword
                                        ? "隐藏密码"
                                        : "显示密码"}
                                    onClick={() =>
                                        setShowCreatePassword((prev) => !prev)}
                                >
                                    {showCreatePassword
                                        ? (
                                            <EyeOff
                                                size="1em"
                                                className="icon-md"
                                                aria-hidden="true"
                                            />
                                        )
                                        : (
                                            <Eye
                                                size="1em"
                                                className="icon-md"
                                                aria-hidden="true"
                                            />
                                        )}
                                </Button>
                            </div>
                            <p
                                id="create-password-hint"
                                role={createPasswordError ? "alert" : undefined}
                                className={createPasswordError
                                    ? "admin-field-message"
                                    : "admin-field-hint"}
                            >
                                {createPasswordError ||
                                    `${passwordRule}，用户首次登录时使用`}
                            </p>
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
                        <div className="admin-field">
                            <label
                                className="admin-field-label"
                                htmlFor="reset-password-input"
                            >
                                新密码（{passwordRules.minLength}–{passwordRules
                                    .maxLength} 个字符）
                            </label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="reset-password-input"
                                    name="password"
                                    className="min-w-0 flex-1"
                                    type={showResetPassword
                                        ? "text"
                                        : "password"}
                                    required
                                    autoFocus
                                    minLength={passwordRules.minLength}
                                    maxLength={passwordRules.maxLength}
                                    autoComplete="new-password"
                                    placeholder="输入该用户的临时新密码"
                                    aria-invalid={Boolean(resetError) ||
                                        undefined}
                                    aria-describedby={resetError
                                        ? "reset-password-error"
                                        : undefined}
                                    value={resetNewPassword}
                                    onChange={(e) =>
                                        setResetNewPassword(e.target.value)}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    aria-pressed={showResetPassword}
                                    aria-label={showResetPassword
                                        ? "隐藏密码"
                                        : "显示密码"}
                                    onClick={() =>
                                        setShowResetPassword((prev) => !prev)}
                                >
                                    {showResetPassword
                                        ? (
                                            <EyeOff
                                                size="1em"
                                                className="icon-md"
                                                aria-hidden="true"
                                            />
                                        )
                                        : (
                                            <Eye
                                                size="1em"
                                                className="icon-md"
                                                aria-hidden="true"
                                            />
                                        )}
                                </Button>
                            </div>
                            {resetError && (
                                <p
                                    id="reset-password-error"
                                    role="alert"
                                    className="admin-field-message"
                                >
                                    {resetError}
                                </p>
                            )}
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
                            后，其会话将被立即终止，笔记、应用和偏好将无法访问。此操作不可撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <form className="admin-form" onSubmit={handleDeleteSubmit}>
                        <div className="admin-field">
                            <label
                                className="admin-field-label"
                                htmlFor="delete-confirm-input"
                            >
                                输入用户名 {deleteUsername}（不含 @）以确认
                            </label>
                            <Input
                                id="delete-confirm-input"
                                name="confirmUsername"
                                type="text"
                                required
                                autoFocus
                                autoComplete="off"
                                placeholder="输入用户名"
                                aria-invalid={Boolean(deleteError) || undefined}
                                aria-describedby={deleteError
                                    ? "delete-confirm-error"
                                    : undefined}
                                value={deleteConfirmText}
                                onChange={(e) =>
                                    setDeleteConfirmText(e.target.value)}
                            />
                            {deleteError && (
                                <p
                                    id="delete-confirm-error"
                                    role="alert"
                                    className="admin-field-message"
                                >
                                    {deleteError}
                                </p>
                            )}
                        </div>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={deleteBusy}>
                                取消
                            </AlertDialogCancel>
                            <AlertDialogAction
                                type="submit"
                                disabled={deleteBusy ||
                                    deleteConfirmText !== deleteUsername}
                            >
                                {deleteBusy ? "正在删除…" : "删除用户"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </form>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={Boolean(disableModalUser)}
                onOpenChange={(open) => {
                    if (!togglingId && !open) setDisableModalUser(null);
                }}
            >
                <AlertDialogContent finalFocus={modalTriggerRef}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            禁用 @{disableModalUser?.username}？
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            该用户的所有登录设备会立即退出，之后可以随时重新启用。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={Boolean(togglingId)}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            type="button"
                            disabled={Boolean(togglingId)}
                            onClick={() => void confirmDisable()}
                        >
                            {togglingId ? "正在禁用…" : "禁用"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AdminShell>
    );
}
