import { type SubmitEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import type { UserDto } from "@shared/contracts.ts";
import { Badge } from "../components/ui/badge.tsx";
import { Button, buttonVariants } from "../components/ui/button.tsx";
import {
    Dialog,
    DialogBackdrop,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogPopup,
    DialogPortal,
    DialogTitle,
} from "../components/ui/dialog.tsx";
import { Input } from "../components/ui/input.tsx";
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
    EmptyState,
    SettingsGroup,
    SettingsRow,
    StatusBanner,
} from "../components/searcher/semantic.tsx";
import { api, json } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";
import { errorMessage, useAppState } from "./state.tsx";
import { authPath, routes } from "./routes.ts";
import { SettingsShell } from "./SettingsShell.tsx";
import "./account.css";

interface SessionDevice {
    id: string;
    isCurrent: boolean;
    userAgent: string | null;
    ip: string | null;
    createdAt: number;
    lastActiveAt: number | null;
    expiresAt: number;
}

function describeDevice(userAgent: string | null): string {
    if (!userAgent) return "未知设备";

    let os = "未知系统";
    if (/Windows NT 10/i.test(userAgent)) os = "Windows 10/11";
    else if (/Windows/i.test(userAgent)) os = "Windows";
    else if (/Macintosh|Mac OS X/i.test(userAgent)) os = "macOS";
    else if (/Android/i.test(userAgent)) os = "Android";
    else if (/iPhone/i.test(userAgent)) os = "iPhone";
    else if (/iPad/i.test(userAgent)) os = "iPad";
    else if (/Linux/i.test(userAgent)) os = "Linux";

    let browser = "浏览器";
    if (/Edg\//i.test(userAgent)) browser = "Microsoft Edge";
    else if (/Chrome\//i.test(userAgent)) browser = "Chrome";
    else if (/Safari\//i.test(userAgent) && !/Chrome/i.test(userAgent)) {
        browser = "Safari";
    } else if (/Firefox\//i.test(userAgent)) browser = "Firefox";

    return `${browser} (${os})`;
}

function formatTime(timestamp: number | null | undefined): string {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function SessionConfirmDialog(
    { open, pending, title, description, pendingLabel, onCancel, onConfirm }: {
        open: boolean;
        pending: boolean;
        title: string;
        description: string;
        pendingLabel: string;
        onCancel: () => void;
        onConfirm: () => void | Promise<void>;
    },
) {
    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                if (!next && !pending) onCancel();
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>
                        取消
                    </AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        disabled={pending}
                        onClick={onConfirm}
                    >
                        {pending ? pendingLabel : "确认退出"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export function AccountPage() {
    const { user, login, logout } = useAppState();
    const navigate = useNavigate();
    const location = useLocation();

    // Profile state
    const [displayName, setDisplayName] = useState(user?.displayName ?? "");
    const [email, setEmail] = useState(user?.email ?? "");
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileSuccess, setProfileSuccess] = useState("");
    const [profileError, setProfileError] = useState("");

    // Password change state
    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordSuccess, setPasswordSuccess] = useState("");
    const [passwordError, setPasswordError] = useState("");

    // Devices state
    const [devices, setDevices] = useState<SessionDevice[]>([]);
    const [devicesLoading, setDevicesLoading] = useState(false);
    const [devicesError, setDevicesError] = useState("");
    const [devicesActionMsg, setDevicesActionMsg] = useState("");

    // Session confirmation state: signing out any device is confirmed first.
    const [revokeDeviceId, setRevokeDeviceId] = useState<string | null>(null);
    const [revokeDevicePending, setRevokeDevicePending] = useState(false);

    const [logoutCurrentOpen, setLogoutCurrentOpen] = useState(false);
    const [logoutCurrentPending, setLogoutCurrentPending] = useState(false);

    const [revokeOthersOpen, setRevokeOthersOpen] = useState(false);
    const [revokeOthersPending, setRevokeOthersPending] = useState(false);

    // Sync profile state when user updates
    useEffect(() => {
        if (user) {
            setDisplayName(user.displayName);
            setEmail(user.email ?? "");
        }
    }, [user]);

    // Load devices
    const loadDevices = async () => {
        if (!user) return;
        setDevicesLoading(true);
        setDevicesError("");
        try {
            const res = await api<{ devices: SessionDevice[] }>(
                "/api/auth/devices",
            );
            setDevices(res.devices);
        } catch (err) {
            setDevicesError(errorMessage(err));
        } finally {
            setDevicesLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            void loadDevices();
        }
    }, [user]);

    // Save profile
    const handleSaveProfile = async (e: SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        setProfileError("");
        setProfileSuccess("");
        setProfileSaving(true);
        try {
            const res = await api<{ user: UserDto }>(
                "/api/account",
                json("PATCH", {
                    displayName: displayName.trim(),
                    email: email.trim() || undefined,
                }),
            );
            login(res.user);
            setProfileSuccess("个人资料更新成功");
        } catch (err) {
            setProfileError(errorMessage(err));
        } finally {
            setProfileSaving(false);
        }
    };

    // Change password
    const handleChangePassword = async (e: SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        setPasswordError("");
        setPasswordSuccess("");

        if (newPassword.length < 12) {
            setPasswordError("新密码长度不能少于 12 个字符");
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError("两次输入的新密码不一致");
            return;
        }

        setPasswordSaving(true);
        try {
            await api(
                "/api/account/password",
                json("PUT", {
                    currentPassword,
                    newPassword,
                }),
            );
            setPasswordSuccess(
                "密码修改成功！所有设备上的会话均已安全注销，请使用新密码重新登录。",
            );
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            // Logout after short delay
            setTimeout(() => {
                void logout().then(() =>
                    navigate(routes.login, { viewTransition: true })
                );
            }, 2500);
        } catch (err) {
            setPasswordError(errorMessage(err));
        } finally {
            setPasswordSaving(false);
        }
    };

    const resetPasswordForm = () => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPasswordSuccess("");
        setPasswordError("");
    };

    const handlePasswordDialogOpenChange = (open: boolean) => {
        if (!open && passwordSaving) return;
        if (!open) resetPasswordForm();
        setPasswordDialogOpen(open);
    };

    // Every device row asks for confirmation; the current device also ends
    // this browser's session.
    const handleRevokeDevice = (device: SessionDevice) => {
        if (device.isCurrent) setLogoutCurrentOpen(true);
        else setRevokeDeviceId(device.id);
    };

    const handleConfirmRevokeDevice = async () => {
        if (!revokeDeviceId) return;
        setRevokeDevicePending(true);
        setDevicesError("");
        setDevicesActionMsg("");
        try {
            await api(`/api/auth/devices/${revokeDeviceId}`, {
                method: "DELETE",
            });
            setDevicesActionMsg("已退出该设备");
            setRevokeDeviceId(null);
            await loadDevices();
        } catch (err) {
            setDevicesError(errorMessage(err));
            setRevokeDeviceId(null);
        } finally {
            setRevokeDevicePending(false);
        }
    };

    // Confirm logout of current device
    const handleConfirmLogoutCurrent = async () => {
        setLogoutCurrentPending(true);
        try {
            await logout();
            setLogoutCurrentOpen(false);
            navigate(routes.login, { viewTransition: true });
        } catch (err) {
            setDevicesError(errorMessage(err));
            setLogoutCurrentOpen(false);
        } finally {
            setLogoutCurrentPending(false);
        }
    };

    // Confirm revoking all other devices
    const handleConfirmRevokeOthers = async () => {
        setRevokeOthersPending(true);
        setDevicesLoading(true);
        setDevicesError("");
        setDevicesActionMsg("");
        try {
            await api("/api/auth/devices/revoke-others", { method: "POST" });
            setDevicesActionMsg("已退出所有其他设备");
            setRevokeOthersOpen(false);
            await loadDevices();
        } catch (err) {
            setDevicesError(errorMessage(err));
            setRevokeOthersOpen(false);
        } finally {
            setRevokeOthersPending(false);
            setDevicesLoading(false);
        }
    };

    if (!user) {
        return (
            <SettingsShell current="account">
                <EmptyState
                    title="未登录"
                    action={
                        <Link
                            to={authPath("login", location)}
                            viewTransition
                            className={buttonVariants({
                                variant: "default",
                            })}
                        >
                            前往登录
                        </Link>
                    }
                />
            </SettingsShell>
        );
    }

    const isForcedReset = user.mustChangePassword;
    const roleLabel = user.role === "admin" ? "系统管理员" : "标准用户";
    const hasOtherDevices = devices.some((device) => !device.isCurrent);
    const profileUnchanged = displayName === user.displayName &&
        email === (user.email ?? "");

    return (
        <>
            <SettingsShell
                current="account"
                actions={user.role === "admin"
                    ? (
                        <Link
                            to={routes.admin()}
                            viewTransition
                            className={buttonVariants({
                                variant: "outline",
                                size: "sm",
                            })}
                        >
                            管理后台
                        </Link>
                    )
                    : undefined}
            >
                {isForcedReset && (
                    <StatusBanner
                        tone="warning"
                        className="account-forced-banner"
                    >
                        管理员已重置密码，请先设置新密码。
                    </StatusBanner>
                )}

                <div className="account-identity">
                    <span className="account-avatar" aria-hidden="true">
                        {(user.displayName || user.username).slice(0, 1)
                            .toUpperCase()}
                    </span>
                    <div className="account-identity-text">
                        <p className="account-identity-name">
                            {user.displayName}
                        </p>
                        <p className="account-identity-meta">
                            @{user.username} · {roleLabel}
                        </p>
                    </div>
                </div>

                <form className="account-profile" onSubmit={handleSaveProfile}>
                    <SettingsGroup
                        title="个人资料"
                        actions={
                            <Button
                                type="submit"
                                size="sm"
                                disabled={profileSaving || profileUnchanged}
                            >
                                {profileSaving ? "保存中…" : "保存资料"}
                            </Button>
                        }
                    >
                        <SettingsRow title="用户名">
                            <span>{user.username}</span>
                        </SettingsRow>
                        <SettingsRow title="显示名称">
                            <Input
                                className="account-input"
                                aria-label="显示名称"
                                type="text"
                                required
                                maxLength={40}
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                            />
                        </SettingsRow>
                        <SettingsRow title="邮箱">
                            <Input
                                className="account-input"
                                aria-label="邮箱"
                                type="email"
                                autoComplete="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </SettingsRow>
                    </SettingsGroup>
                    {profileSuccess && (
                        <StatusBanner tone="success">
                            {profileSuccess}
                        </StatusBanner>
                    )}
                    {profileError && (
                        <StatusBanner tone="error">{profileError}</StatusBanner>
                    )}
                </form>

                <SettingsGroup title="安全">
                    <SettingsRow title="密码">
                        <Button
                            type="button"
                            size="sm"
                            variant={isForcedReset ? "default" : "outline"}
                            onClick={() => setPasswordDialogOpen(true)}
                        >
                            {isForcedReset ? "重置密码" : "修改密码"}
                        </Button>
                    </SettingsRow>
                </SettingsGroup>

                <SettingsGroup
                    title="登录设备"
                    actions={
                        <>
                            {hasOtherDevices && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="account-danger"
                                    disabled={devicesLoading ||
                                        revokeDevicePending ||
                                        revokeOthersPending ||
                                        logoutCurrentPending}
                                    onClick={() => setRevokeOthersOpen(true)}
                                >
                                    退出其他所有设备
                                </Button>
                            )}
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-label="刷新设备列表"
                                title="刷新设备列表"
                                disabled={devicesLoading}
                                onClick={() => void loadDevices()}
                            >
                                <RefreshCw
                                    size="1em"
                                    className={cn(
                                        "icon-md",
                                        devicesLoading && "animate-spin",
                                    )}
                                />
                                <span>
                                    {devicesLoading ? "刷新中…" : "刷新"}
                                </span>
                            </Button>
                        </>
                    }
                >
                    {devicesLoading && devices.length === 0
                        ? (
                            <p className="account-device-empty">
                                正在加载登录设备…
                            </p>
                        )
                        : devices.length === 0
                        ? (
                            <p className="account-device-empty">
                                暂无活跃设备记录
                            </p>
                        )
                        : (
                            <div className="account-device-list">
                                {devices.map((device) => (
                                    <SettingsRow
                                        key={device.id}
                                        className="account-device-item"
                                        title={describeDevice(
                                            device.userAgent,
                                        )}
                                        description={
                                            <span className="account-device-meta">
                                                {device.isCurrent && (
                                                    <Badge variant="secondary">
                                                        当前设备
                                                    </Badge>
                                                )}
                                                <span>
                                                    {device.ip || "未知 IP"}
                                                </span>
                                                <span>
                                                    登录于 {formatTime(
                                                        device.createdAt,
                                                    )}
                                                </span>
                                                {device.lastActiveAt && (
                                                    <span>
                                                        最近活动 {formatTime(
                                                            device
                                                                .lastActiveAt,
                                                        )}
                                                    </span>
                                                )}
                                            </span>
                                        }
                                    >
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="account-danger"
                                            disabled={devicesLoading ||
                                                revokeDevicePending ||
                                                logoutCurrentPending ||
                                                revokeOthersPending}
                                            onClick={() =>
                                                handleRevokeDevice(device)}
                                        >
                                            退出
                                        </Button>
                                    </SettingsRow>
                                ))}
                            </div>
                        )}
                </SettingsGroup>

                {devicesActionMsg && (
                    <StatusBanner tone="success" className="account-status">
                        {devicesActionMsg}
                    </StatusBanner>
                )}
                {devicesError && (
                    <StatusBanner tone="error" className="account-status">
                        {devicesError}
                    </StatusBanner>
                )}
            </SettingsShell>

            <Dialog
                open={passwordDialogOpen}
                onOpenChange={handlePasswordDialogOpenChange}
            >
                <DialogPortal>
                    <DialogBackdrop />
                    <DialogPopup className="account-password-dialog">
                        <form
                            className="account-password-form"
                            onSubmit={handleChangePassword}
                        >
                            <DialogHeader>
                                <DialogTitle>
                                    {isForcedReset ? "重置密码" : "修改密码"}
                                </DialogTitle>
                                <DialogDescription>
                                    修改后，所有设备都将退出登录。
                                </DialogDescription>
                            </DialogHeader>

                            <div className="account-field">
                                <label
                                    className="account-field-label"
                                    htmlFor="account-current-password"
                                >
                                    当前密码
                                </label>
                                <Input
                                    id="account-current-password"
                                    type="password"
                                    required
                                    autoComplete="current-password"
                                    value={currentPassword}
                                    onChange={(e) =>
                                        setCurrentPassword(e.target.value)}
                                />
                            </div>

                            <div className="account-field">
                                <label
                                    className="account-field-label"
                                    htmlFor="account-new-password"
                                >
                                    新密码
                                </label>
                                <Input
                                    id="account-new-password"
                                    type="password"
                                    required
                                    minLength={12}
                                    maxLength={128}
                                    autoComplete="new-password"
                                    aria-describedby="account-new-password-hint"
                                    value={newPassword}
                                    onChange={(e) =>
                                        setNewPassword(e.target.value)}
                                />
                                <p
                                    id="account-new-password-hint"
                                    className="account-field-hint"
                                >
                                    至少 12 个字符
                                </p>
                            </div>

                            <div className="account-field">
                                <label
                                    className="account-field-label"
                                    htmlFor="account-confirm-password"
                                >
                                    确认新密码
                                </label>
                                <Input
                                    id="account-confirm-password"
                                    type="password"
                                    required
                                    minLength={12}
                                    maxLength={128}
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={(e) =>
                                        setConfirmPassword(e.target.value)}
                                />
                            </div>

                            {passwordSuccess && (
                                <StatusBanner tone="success">
                                    {passwordSuccess}
                                </StatusBanner>
                            )}
                            {passwordError && (
                                <StatusBanner tone="error">
                                    {passwordError}
                                </StatusBanner>
                            )}

                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={passwordSaving}
                                    onClick={() =>
                                        handlePasswordDialogOpenChange(false)}
                                >
                                    取消
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={passwordSaving ||
                                        !currentPassword ||
                                        !newPassword ||
                                        !confirmPassword}
                                >
                                    {passwordSaving
                                        ? "正在更新…"
                                        : isForcedReset
                                        ? "确认重置密码"
                                        : "更新密码"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogPopup>
                </DialogPortal>
            </Dialog>

            <SessionConfirmDialog
                open={revokeDeviceId !== null}
                pending={revokeDevicePending}
                title="退出该设备"
                description="确定要退出该设备吗？该设备需要重新登录。"
                pendingLabel="处理中…"
                onCancel={() => setRevokeDeviceId(null)}
                onConfirm={handleConfirmRevokeDevice}
            />
            <SessionConfirmDialog
                open={logoutCurrentOpen}
                pending={logoutCurrentPending}
                title="退出当前设备"
                description="确定要退出当前设备吗？退出后需要重新登录。"
                pendingLabel="退出中…"
                onCancel={() => setLogoutCurrentOpen(false)}
                onConfirm={handleConfirmLogoutCurrent}
            />
            <SessionConfirmDialog
                open={revokeOthersOpen}
                pending={revokeOthersPending}
                title="退出其他所有设备"
                description="确定要退出除当前设备外的所有其他设备吗？"
                pendingLabel="处理中…"
                onCancel={() => setRevokeOthersOpen(false)}
                onConfirm={handleConfirmRevokeOthers}
            />
        </>
    );
}
