import {
    type FormEvent,
    type RefObject,
    useEffect,
    useRef,
    useState,
} from "react";
import { Link } from "react-router-dom";
import {
    ArrowUpRight,
    Check,
    Copy,
    KeyRound,
    Lock,
    Shield,
    Trash2,
    UserCheck,
    UserX,
} from "lucide-react";
import type { AdminUserDto } from "@shared/contracts.ts";
import { AUTH_CREDENTIAL_RULES } from "@shared/contracts.ts";
import { routes } from "../../app/routes.ts";
import { errorMessage } from "../../app/state.tsx";
import { api, json } from "../../lib/api.ts";
import { UserAvatar } from "../../components/searcher/UserAvatar.tsx";
import {
    FormField,
    FormFields,
    SecretInput,
    StatusBanner,
} from "../../components/searcher/semantic.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog.tsx";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../../components/ui/alert-dialog.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";

const passwordRules = AUTH_CREDENTIAL_RULES.password;
const passwordRule =
    `密码长度须为 ${passwordRules.minLength}–${passwordRules.maxLength} 个字符`;

function formatFullTimestamp(timestamp: number): string {
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

export interface CreateUserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    finalFocus: RefObject<HTMLElement | null>;
    onCreated: (username: string) => Promise<void> | void;
}

export function CreateUserDialog({
    open,
    onOpenChange,
    finalFocus,
    onCreated,
}: CreateUserDialogProps) {
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const passwordRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setError("");
            setPasswordError("");
        }
    }, [open]);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setError("");
        setPasswordError("");
        if (
            password.length < passwordRules.minLength ||
            password.length > passwordRules.maxLength
        ) {
            setPasswordError(passwordRule);
            passwordRef.current?.focus();
            return;
        }
        const normalizedUsername = username.trim().toLowerCase();
        setBusy(true);
        try {
            await api(
                "/api/admin/users",
                json("POST", {
                    username: normalizedUsername,
                    displayName: displayName.trim(),
                    email: email.trim() || undefined,
                    password,
                }),
            );
            setUsername("");
            setDisplayName("");
            setEmail("");
            setPassword("");
            onOpenChange(false);
            await onCreated(normalizedUsername);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!busy) onOpenChange(nextOpen);
            }}
        >
            <DialogContent finalFocus={finalFocus}>
                <DialogHeader>
                    <DialogTitle>创建新用户</DialogTitle>
                    <DialogDescription>
                        新建的普通用户将继承当前系统默认偏好。
                    </DialogDescription>
                </DialogHeader>
                <form className="admin-form" onSubmit={handleSubmit}>
                    {error && (
                        <StatusBanner tone="error" density="compact">
                            {error}
                        </StatusBanner>
                    )}
                    <FormFields>
                        <FormField
                            label="用户名"
                            labelFor="create-username"
                            hint="3–32 位字母、数字或下划线"
                            messageId="create-username-hint"
                        >
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
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </FormField>
                        <FormField
                            label="显示名称"
                            labelFor="create-display-name"
                        >
                            <Input
                                id="create-display-name"
                                name="displayName"
                                type="text"
                                required
                                maxLength={40}
                                autoComplete="off"
                                placeholder="设置显示名称"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                            />
                        </FormField>
                        <FormField
                            label="邮箱（可选）"
                            labelFor="create-email"
                        >
                            <Input
                                id="create-email"
                                name="email"
                                type="email"
                                autoComplete="off"
                                spellCheck={false}
                                placeholder="alice@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </FormField>
                        <FormField
                            label="初始密码"
                            labelFor="create-password"
                            hint={`${passwordRule}，用户首次登录时使用`}
                            error={passwordError || undefined}
                            messageId="create-password-hint"
                            invalid={Boolean(passwordError)}
                        >
                            <SecretInput
                                key={open ? "create-open" : "create-closed"}
                                ref={passwordRef}
                                id="create-password"
                                name="password"
                                placeholder={`至少 ${passwordRules.minLength} 个字符`}
                                required
                                minLength={passwordRules.minLength}
                                maxLength={passwordRules.maxLength}
                                autoComplete="new-password"
                                aria-describedby="create-password-hint"
                                aria-invalid={Boolean(passwordError) ||
                                    undefined}
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    if (passwordError) setPasswordError("");
                                }}
                            />
                        </FormField>
                    </FormFields>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => onOpenChange(false)}
                        >
                            取消
                        </Button>
                        <Button
                            type="submit"
                            variant="default"
                            disabled={busy || !username.trim() ||
                                !displayName.trim() || !password}
                        >
                            {busy ? "正在创建…" : "创建"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export interface ResetPasswordDialogProps {
    user: AdminUserDto | null;
    currentUserId: string | undefined;
    onClose: () => void;
    finalFocus: RefObject<HTMLElement | null>;
    onResetSuccess: (username: string) => Promise<void> | void;
}

export function ResetPasswordDialog({
    user,
    currentUserId,
    onClose,
    finalFocus,
    onResetSuccess,
}: ResetPasswordDialogProps) {
    const [newPassword, setNewPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const lastUserRef = useRef<AdminUserDto | null>(null);
    if (user) {
        lastUserRef.current = user;
    }
    const activeUser = user ?? lastUserRef.current;

    useEffect(() => {
        if (user) {
            setNewPassword("");
            setError("");
        }
    }, [user]);

    const isAdminAccount = activeUser?.role === "admin";
    const isSelf = Boolean(
        activeUser && currentUserId && activeUser.id === currentUserId,
    );

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        if (!user || user.role === "admin") return;
        setError("");
        if (
            newPassword.length < passwordRules.minLength ||
            newPassword.length > passwordRules.maxLength
        ) {
            setError(passwordRule);
            return;
        }
        setBusy(true);
        try {
            await api(
                `/api/admin/users/${user.id}/password`,
                json("PUT", { password: newPassword }),
            );
            setNewPassword("");
            onClose();
            await onResetSuccess(user.username);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog
            open={Boolean(user)}
            onOpenChange={(open) => {
                if (!busy && !open) onClose();
            }}
        >
            <DialogContent finalFocus={finalFocus}>
                {isAdminAccount
                    ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>
                                    重置密码：@{activeUser?.username ?? ""}
                                </DialogTitle>
                                <DialogDescription>
                                    {isSelf
                                        ? "管理员密码受安全策略保护，不能在管理后台直接重置。"
                                        : "其他管理员账户密码受安全策略保护，不能通过管理后台重置。"}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="admin-protected-notice">
                                <Lock
                                    size="1em"
                                    className="icon-md admin-protected-notice-icon"
                                    aria-hidden="true"
                                />
                                <div className="admin-protected-notice-body">
                                    {isSelf
                                        ? (
                                            <p>
                                                请前往「账户与安全」验证当前密码后修改登录凭据。修改完成后，其他设备上的旧会话将自动失效。
                                            </p>
                                        )
                                        : (
                                            <>
                                                <p>
                                                    如需应急重置该管理员密码，请在服务器终端运行以下命令：
                                                </p>
                                                <code className="admin-cli-snippet">
                                                    deno task admin:reset --
                                                    {" "}
                                                    {activeUser?.username ?? ""}
                                                </code>
                                            </>
                                        )}
                                </div>
                            </div>
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={onClose}
                                >
                                    关闭
                                </Button>
                                {isSelf && (
                                    <Button
                                        variant="default"
                                        render={<Link to={routes.account} />}
                                    >
                                        <span>前往账户与安全</span>
                                        <ArrowUpRight
                                            size="1em"
                                            className="icon-sm"
                                            aria-hidden="true"
                                        />
                                    </Button>
                                )}
                            </DialogFooter>
                        </>
                    )
                    : (
                        <>
                            <DialogHeader>
                                <DialogTitle>
                                    重置密码：@{activeUser?.username ?? ""}
                                </DialogTitle>
                                <DialogDescription>
                                    将注销该用户的全部会话，并要求其下次登录时修改密码。
                                </DialogDescription>
                            </DialogHeader>
                            <form
                                className="admin-form"
                                onSubmit={handleSubmit}
                            >
                                <FormField
                                    label={`新密码（${passwordRules.minLength}–${passwordRules.maxLength} 个字符）`}
                                    labelFor="reset-password-input"
                                    error={error || undefined}
                                    messageId="reset-password-error"
                                    invalid={Boolean(error)}
                                >
                                    <SecretInput
                                        key={user?.id ?? "reset-closed"}
                                        id="reset-password-input"
                                        name="password"
                                        required
                                        autoFocus
                                        minLength={passwordRules.minLength}
                                        maxLength={passwordRules.maxLength}
                                        autoComplete="new-password"
                                        placeholder="输入该用户的临时新密码"
                                        aria-invalid={Boolean(error) ||
                                            undefined}
                                        aria-describedby={error
                                            ? "reset-password-error"
                                            : undefined}
                                        value={newPassword}
                                        onChange={(e) => {
                                            setNewPassword(e.target.value);
                                            if (error) setError("");
                                        }}
                                    />
                                </FormField>
                                <DialogFooter>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={busy}
                                        onClick={onClose}
                                    >
                                        取消
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="default"
                                        disabled={busy || !newPassword}
                                    >
                                        {busy ? "正在重置…" : "重置密码"}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </>
                    )}
            </DialogContent>
        </Dialog>
    );
}

export interface DeleteUserDialogProps {
    user: AdminUserDto | null;
    onClose: () => void;
    finalFocus: RefObject<HTMLElement | null>;
    onDeleteSuccess: (username: string) => Promise<void> | void;
}

export function DeleteUserDialog({
    user,
    onClose,
    finalFocus,
    onDeleteSuccess,
}: DeleteUserDialogProps) {
    const [confirmText, setConfirmText] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const lastUserRef = useRef<AdminUserDto | null>(null);
    if (user) {
        lastUserRef.current = user;
    }
    const activeUser = user ?? lastUserRef.current;
    const username = activeUser?.username ?? "";

    useEffect(() => {
        if (user) {
            setConfirmText("");
            setError("");
        }
    }, [user]);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        if (!user) return;
        setError("");
        if (confirmText !== user.username) {
            setError(`输入用户名 ${user.username}（不含 @）以确认删除`);
            return;
        }
        setBusy(true);
        try {
            await api(`/api/admin/users/${user.id}?confirm=true`, {
                method: "DELETE",
            });
            setConfirmText("");
            await onDeleteSuccess(user.username);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog
            open={Boolean(user)}
            onOpenChange={(open) => {
                if (!busy && !open) onClose();
            }}
        >
            <DialogContent finalFocus={finalFocus}>
                <DialogHeader>
                    <DialogTitle>删除用户</DialogTitle>
                    <DialogDescription>
                        删除 @{username}{" "}
                        后，其会话将被立即终止，笔记、应用和偏好将无法访问。此操作不可撤销。
                    </DialogDescription>
                </DialogHeader>
                <form className="admin-form" onSubmit={handleSubmit}>
                    <FormField
                        label={`输入用户名 ${username}（不含 @）以确认`}
                        labelFor="delete-confirm-input"
                        error={error || undefined}
                        messageId="delete-confirm-error"
                        invalid={Boolean(error)}
                    >
                        <Input
                            id="delete-confirm-input"
                            name="confirmUsername"
                            type="text"
                            required
                            autoFocus
                            autoComplete="off"
                            placeholder="输入用户名"
                            aria-invalid={Boolean(error) || undefined}
                            aria-describedby={error
                                ? "delete-confirm-error"
                                : undefined}
                            value={confirmText}
                            onChange={(e) => {
                                setConfirmText(e.target.value);
                                if (error) setError("");
                            }}
                        />
                    </FormField>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={onClose}
                        >
                            取消
                        </Button>
                        <Button
                            type="submit"
                            variant="destructive"
                            disabled={busy || confirmText !== username}
                        >
                            {busy ? "正在删除…" : "删除用户"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export interface DisableUserAlertDialogProps {
    user: AdminUserDto | null;
    busy: boolean;
    onClose: () => void;
    onConfirm: (user: AdminUserDto) => Promise<void>;
    finalFocus: RefObject<HTMLElement | null>;
}

export function DisableUserAlertDialog({
    user,
    busy,
    onClose,
    onConfirm,
    finalFocus,
}: DisableUserAlertDialogProps) {
    const lastUserRef = useRef<AdminUserDto | null>(null);
    if (user) {
        lastUserRef.current = user;
    }
    const activeUser = user ?? lastUserRef.current;

    return (
        <AlertDialog
            open={Boolean(user)}
            onOpenChange={(open) => {
                if (!busy && !open) onClose();
            }}
        >
            <AlertDialogContent finalFocus={finalFocus}>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        禁用 @{activeUser?.username ?? ""}？
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        该用户的所有登录设备会立即退出，之后可以随时重新启用。
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
                    <AlertDialogAction
                        type="button"
                        disabled={busy}
                        onClick={() => {
                            if (user) void onConfirm(user);
                        }}
                    >
                        {busy ? "正在禁用…" : "禁用"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export interface UserDetailDialogProps {
    user: AdminUserDto | null;
    isSelf: boolean;
    toggling: boolean;
    onClose: () => void;
    finalFocus: RefObject<HTMLElement | null>;
    onResetPassword: (user: AdminUserDto) => void;
    onToggleDisable: (user: AdminUserDto) => void;
    onDelete: (user: AdminUserDto) => void;
}

export function UserDetailDialog({
    user,
    isSelf,
    toggling,
    onClose,
    finalFocus,
    onResetPassword,
    onToggleDisable,
    onDelete,
}: UserDetailDialogProps) {
    const [copiedId, setCopiedId] = useState(false);
    const [copyError, setCopyError] = useState(false);
    const lastUserRef = useRef<AdminUserDto | null>(null);
    if (user) {
        lastUserRef.current = user;
    }
    const activeUser = user ?? lastUserRef.current;

    useEffect(() => {
        setCopiedId(false);
        setCopyError(false);
    }, [user?.id]);

    async function handleCopyId() {
        if (!activeUser) return;
        setCopyError(false);
        try {
            if (!navigator.clipboard) throw new Error("剪贴板不可用");
            await navigator.clipboard.writeText(activeUser.id);
            setCopiedId(true);
            globalThis.setTimeout(() => setCopiedId(false), 1500);
        } catch {
            setCopiedId(false);
            setCopyError(true);
        }
    }

    const isAdmin = activeUser?.role === "admin";

    return (
        <Dialog
            open={Boolean(user)}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent size="md" finalFocus={finalFocus}>
                <DialogHeader>
                    <DialogTitle>用户详情</DialogTitle>
                </DialogHeader>
                {activeUser && (
                    <div className="admin-inspector-body">
                        <div className="admin-inspector-hero">
                            <span
                                className="admin-user-avatar admin-user-avatar--lg"
                                aria-hidden="true"
                            >
                                <UserAvatar user={activeUser} />
                            </span>
                            <div className="admin-inspector-identity">
                                <div className="admin-inspector-name-row">
                                    <span className="admin-inspector-name">
                                        {activeUser.displayName ||
                                            activeUser.username}
                                    </span>
                                    {isSelf && (
                                        <span
                                            className="admin-pill"
                                            data-tone="accent"
                                        >
                                            当前登录
                                        </span>
                                    )}
                                </div>
                                <span className="admin-inspector-handle">
                                    @{activeUser.username}
                                </span>
                                <div className="admin-status-group">
                                    {isAdmin
                                        ? (
                                            <span
                                                className="admin-pill"
                                                data-tone="accent"
                                            >
                                                <Shield
                                                    size="1em"
                                                    className="admin-pill-icon"
                                                    aria-hidden="true"
                                                />
                                                管理员
                                            </span>
                                        )
                                        : (
                                            <span
                                                className="admin-pill"
                                                data-tone="neutral"
                                            >
                                                普通用户
                                            </span>
                                        )}
                                    {activeUser.disabled
                                        ? (
                                            <span
                                                className="admin-pill"
                                                data-tone="danger"
                                            >
                                                <span
                                                    className="admin-pill-dot"
                                                    aria-hidden="true"
                                                />
                                                已禁用
                                            </span>
                                        )
                                        : (
                                            <span
                                                className="admin-pill"
                                                data-tone="success"
                                            >
                                                <span
                                                    className="admin-pill-dot"
                                                    aria-hidden="true"
                                                />
                                                正常
                                            </span>
                                        )}
                                    {!activeUser.disabled &&
                                        activeUser.mustChangePassword && (
                                        <span
                                            className="admin-pill"
                                            data-tone="warning"
                                        >
                                            待改密
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <dl className="admin-inspector-list">
                            <div className="admin-inspector-row">
                                <dt>用户 ID</dt>
                                <dd className="admin-inspector-copy-cell">
                                    <code className="admin-mono-value">
                                        {activeUser.id}
                                    </code>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        aria-label={copiedId
                                            ? "已复制用户 ID"
                                            : "复制用户 ID"}
                                        onClick={() => void handleCopyId()}
                                    >
                                        {copiedId
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
                                        <span>
                                            {copiedId ? "已复制" : "复制"}
                                        </span>
                                    </Button>
                                </dd>
                            </div>
                            {copyError && (
                                <p
                                    role="alert"
                                    className="admin-inline-alert"
                                >
                                    复制失败，请手动选择并复制用户 ID。
                                </p>
                            )}
                            <div className="admin-inspector-row">
                                <dt>邮箱</dt>
                                <dd>
                                    {activeUser.email
                                        ? activeUser.email
                                        : (
                                            <span className="admin-ua-muted">
                                                未设置
                                            </span>
                                        )}
                                </dd>
                            </div>
                            <div className="admin-inspector-row">
                                <dt>创建时间</dt>
                                <dd className="admin-tabular">
                                    {formatFullTimestamp(activeUser.createdAt)}
                                </dd>
                            </div>
                            <div className="admin-inspector-row">
                                <dt>密码状态</dt>
                                <dd>
                                    {activeUser.mustChangePassword
                                        ? (
                                            <span
                                                className="admin-pill"
                                                data-tone="warning"
                                            >
                                                需下次登录修改密码
                                            </span>
                                        )
                                        : "正常"}
                                </dd>
                            </div>
                        </dl>

                        {isAdmin && (
                            <div className="admin-protected-notice">
                                <Lock
                                    size="1em"
                                    className="icon-md admin-protected-notice-icon"
                                    aria-hidden="true"
                                />
                                <div className="admin-protected-notice-body">
                                    {isSelf
                                        ? (
                                            <p>
                                                当前登录管理员账户受保护。修改密码或个人资料请前往「账户与安全」。
                                            </p>
                                        )
                                        : (
                                            <>
                                                <p>
                                                    其他管理员账户不能在后台禁用、删除或重置密码。如需重置密码，请通过服务端
                                                    CLI 执行：
                                                </p>
                                                <code className="admin-cli-snippet">
                                                    deno task admin:reset --
                                                    {" "}
                                                    {activeUser.username}
                                                </code>
                                            </>
                                        )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter className="admin-inspector-footer">
                    {activeUser && !isAdmin && (
                        <div className="admin-inspector-actions">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => onResetPassword(activeUser)}
                            >
                                <KeyRound
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                                <span>重置密码</span>
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={toggling}
                                onClick={() => onToggleDisable(activeUser)}
                            >
                                {activeUser.disabled
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
                                <span>
                                    {activeUser.disabled
                                        ? "启用用户"
                                        : "禁用用户…"}
                                </span>
                            </Button>
                            <Button
                                type="button"
                                variant="ghost-danger"
                                size="sm"
                                onClick={() => onDelete(activeUser)}
                            >
                                <Trash2
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                                <span>删除用户</span>
                            </Button>
                        </div>
                    )}
                    <div className="admin-inspector-close-group">
                        {isSelf && (
                            <Button
                                variant="default"
                                size="sm"
                                render={<Link to={routes.account} />}
                            >
                                <span>前往账户与安全</span>
                                <ArrowUpRight
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onClose}
                        >
                            关闭
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
