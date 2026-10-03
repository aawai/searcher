import { PageShell } from "../components/searcher/PageShell.tsx";
import { EmptyState, StatusBanner } from "../components/searcher/semantic.tsx";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
    ArrowRight,
    Globe,
    Key,
    Laptop,
    LogOut,
    RefreshCw,
    Shield,
    Smartphone,
} from "lucide-react";
import type { UserDto } from "@shared/contracts.ts";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "../components/ui/card.tsx";
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
import { api, json } from "../lib/api.ts";
import { errorMessage, useAppState } from "./state.tsx";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { authPath, routes } from "./routes.ts";
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

function parseUserAgent(ua: string | null): {
    name: string;
    type: "desktop" | "mobile" | "tablet" | "unknown";
} {
    if (!ua) return { name: "未知设备", type: "unknown" };
    let os = "未知系统";
    if (/Windows NT 10/i.test(ua)) os = "Windows 10/11";
    else if (/Windows/i.test(ua)) os = "Windows";
    else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
    else if (/Android/i.test(ua)) os = "Android";
    else if (/iPhone/i.test(ua)) os = "iPhone";
    else if (/iPad/i.test(ua)) os = "iPad";
    else if (/Linux/i.test(ua)) os = "Linux";

    let browser = "浏览器";
    if (/Edg\//i.test(ua)) browser = "Microsoft Edge";
    else if (/Chrome\//i.test(ua)) browser = "Chrome";
    else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
    else if (/Firefox\//i.test(ua)) browser = "Firefox";

    const isMobile = /Android|iPhone|iPod|Mobile/i.test(ua);
    const isTablet = /iPad|Tablet/i.test(ua);

    return {
        name: `${browser} (${os})`,
        type: isTablet ? "tablet" : isMobile ? "mobile" : "desktop",
    };
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
    });
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
    const [revokingId, setRevokingId] = useState<string | null>(null);

    // Logout confirmation state
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
    const handleSaveProfile = async (e: FormEvent) => {
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
    const handleChangePassword = async (e: FormEvent) => {
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
                void logout().then(() => navigate(routes.login));
            }, 2500);
        } catch (err) {
            setPasswordError(errorMessage(err));
        } finally {
            setPasswordSaving(false);
        }
    };

    // Revoke single device
    const handleRevokeDevice = async (device: SessionDevice) => {
        if (device.isCurrent) {
            setLogoutCurrentOpen(true);
            return;
        }

        setRevokingId(device.id);
        setDevicesError("");
        setDevicesActionMsg("");
        try {
            await api(`/api/auth/devices/${device.id}`, { method: "DELETE" });
            setDevicesActionMsg("已成功撤销该设备会话");
            await loadDevices();
        } catch (err) {
            setDevicesError(errorMessage(err));
        } finally {
            setRevokingId(null);
        }
    };

    // Confirm logout of current device
    const handleConfirmLogoutCurrent = async () => {
        setLogoutCurrentPending(true);
        try {
            await logout();
            setLogoutCurrentOpen(false);
            navigate(routes.login);
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
            <PageShell archetype="utility" className="account-page">
                <PageHeader
                    title="账户与安全"
                    items={[{ label: "首页", to: routes.home }, {
                        label: "账户与安全",
                    }]}
                />
                <EmptyState
                    title="未登录"
                    description="请先登录以访问账户设置、安全配置及设备管理。"
                    action={
                        <Link
                            to={authPath("login", location)}
                            className="button button--primary"
                        >
                            前往登录
                        </Link>
                    }
                />
            </PageShell>
        );
    }

    const hasOtherDevices = devices.some((d) => !d.isCurrent);

    return (
        <PageShell archetype="utility" className="account-page">
            <PageHeader
                title="账户与安全"
                description="管理您的个人资料、密码凭据与已登录设备"
                items={[{ label: "首页", to: routes.home }, {
                    label: "账户与安全",
                }]}
                actions={user.role === "admin"
                    ? (
                        <Link
                            to={routes.admin()}
                            className="button button--subtle"
                        >
                            <Shield size={18} />
                            <span>管理后台</span>
                            <ArrowRight size={16} />
                        </Link>
                    )
                    : undefined}
            />

            {/* Forced Password Reset Banner */}
            {user.mustChangePassword && (
                <StatusBanner tone="warning" className="account-reset-banner">
                    <div className="account-reset-banner-body">
                        <h2 className="account-reset-banner-title">
                            必须重置密码
                        </h2>
                        <p className="account-reset-banner-text">
                            管理员已重置了您的账户密码。为了账户安全，您必须在此设置新密码后方可正常使用。
                            修改密码后，所有设备将立即注销，您需要使用新密码重新登录。
                        </p>
                    </div>
                </StatusBanner>
            )}

            <div className="account-grid">
                {/* 1. Profile Card */}
                <Card className="account-card">
                    <CardHeader className="account-card-header">
                        <div className="account-profile-header">
                            <div
                                className="account-profile-avatar"
                                aria-hidden="true"
                            >
                                {(user.displayName || user.username).slice(0, 1)
                                    .toUpperCase()}
                            </div>
                            <div className="account-profile-info">
                                <div className="account-profile-name-row">
                                    <h2 className="account-profile-name">
                                        {user.displayName}
                                    </h2>
                                    <Badge
                                        variant={user.role === "admin"
                                            ? "default"
                                            : "secondary"}
                                    >
                                        {user.role === "admin"
                                            ? "系统管理员"
                                            : "标准用户"}
                                    </Badge>
                                </div>
                                <p className="account-profile-username muted">
                                    @{user.username}
                                </p>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="account-card-content">
                        <form onSubmit={handleSaveProfile}>
                            <div className="account-form-grid">
                                <label className="field account-field">
                                    <span>
                                        用户名{" "}
                                        <span className="muted account-field-hint">
                                            (不可修改)
                                        </span>
                                    </span>
                                    <Input
                                        type="text"
                                        value={user.username}
                                        disabled
                                        className="account-input-disabled"
                                    />
                                </label>
                                <label className="field account-field">
                                    <span>显示名称</span>
                                    <Input
                                        type="text"
                                        required
                                        maxLength={40}
                                        value={displayName}
                                        onChange={(e) =>
                                            setDisplayName(e.target.value)}
                                        placeholder="输入显示名称"
                                    />
                                </label>
                            </div>
                            <label className="field account-field account-field--full">
                                <span>
                                    邮箱地址{" "}
                                    <span className="muted account-field-hint">
                                        (可选，用于找回与识别)
                                    </span>
                                </span>
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@example.com"
                                />
                            </label>
                            {profileSuccess && (
                                <StatusBanner
                                    tone="success"
                                    className="account-status-banner"
                                >
                                    {profileSuccess}
                                </StatusBanner>
                            )}
                            {profileError && (
                                <StatusBanner
                                    tone="error"
                                    className="account-status-banner"
                                >
                                    {profileError}
                                </StatusBanner>
                            )}
                            <div className="account-form-actions">
                                <Button
                                    variant="default"
                                    type="submit"
                                    disabled={profileSaving ||
                                        (displayName === user.displayName &&
                                            email === (user.email ?? ""))}
                                >
                                    {profileSaving ? "保存中…" : "保存资料"}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* 2. Password Security Card */}
                <Card
                    className="account-card"
                    data-urgent={user.mustChangePassword ? "" : undefined}
                >
                    <CardHeader className="account-card-header">
                        <div className="account-card-title-row">
                            <Key size={20} className="account-card-icon" />
                            <CardTitle className="account-card-title">
                                {user.mustChangePassword
                                    ? "重置密码 (必须修改)"
                                    : "修改密码"}
                            </CardTitle>
                        </div>
                        <p className="account-card-desc muted">
                            修改密码需要提供当前密码。修改成功后，将在所有已登录设备（包括当前设备）退出登录。
                        </p>
                    </CardHeader>
                    <CardContent className="account-card-content">
                        <form onSubmit={handleChangePassword}>
                            <label className="field account-field--spaced">
                                <span>当前密码</span>
                                <Input
                                    type="password"
                                    required
                                    autoComplete="current-password"
                                    value={currentPassword}
                                    onChange={(e) =>
                                        setCurrentPassword(e.target.value)}
                                    placeholder="输入当前使用的密码"
                                />
                            </label>
                            <div className="account-form-grid">
                                <label className="field account-field">
                                    <span>新密码 (至少 12 个字符)</span>
                                    <Input
                                        type="password"
                                        required
                                        minLength={12}
                                        maxLength={128}
                                        autoComplete="new-password"
                                        value={newPassword}
                                        onChange={(e) =>
                                            setNewPassword(e.target.value)}
                                        placeholder="输入新密码 (12-128 位)"
                                    />
                                </label>
                                <label className="field account-field">
                                    <span>确认新密码</span>
                                    <Input
                                        type="password"
                                        required
                                        minLength={12}
                                        maxLength={128}
                                        autoComplete="new-password"
                                        value={confirmPassword}
                                        onChange={(e) =>
                                            setConfirmPassword(e.target.value)}
                                        placeholder="再次输入新密码"
                                    />
                                </label>
                            </div>
                            {passwordSuccess && (
                                <StatusBanner
                                    tone="success"
                                    className="account-status-banner"
                                >
                                    {passwordSuccess}
                                </StatusBanner>
                            )}
                            {passwordError && (
                                <StatusBanner
                                    tone="error"
                                    className="account-status-banner"
                                >
                                    {passwordError}
                                </StatusBanner>
                            )}
                            <div className="account-form-actions">
                                <Button
                                    variant="default"
                                    type="submit"
                                    disabled={passwordSaving ||
                                        !currentPassword ||
                                        !newPassword || !confirmPassword}
                                >
                                    {passwordSaving
                                        ? "正在更新…"
                                        : user.mustChangePassword
                                        ? "确认重置密码"
                                        : "更新密码"}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* 3. Devices Management Card */}
                <Card className="account-card">
                    <CardHeader className="account-card-header">
                        <div className="account-card-header-between">
                            <div className="account-card-title-row">
                                <Laptop
                                    size={20}
                                    className="account-card-icon"
                                />
                                <CardTitle className="account-card-title">
                                    设备会话管理
                                </CardTitle>
                            </div>
                            <p className="account-devices-count muted">
                                当前账号共在 {devices.length} 个设备上保持登录
                            </p>
                            <div className="account-devices-actions">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    type="button"
                                    onClick={() => void loadDevices()}
                                    disabled={devicesLoading}
                                    title="刷新设备列表"
                                    aria-label="刷新设备列表"
                                >
                                    <RefreshCw
                                        size={15}
                                        className={devicesLoading
                                            ? "animate-spin"
                                            : ""}
                                    />
                                    <span>刷新</span>
                                </Button>
                                {hasOtherDevices && (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        type="button"
                                        onClick={() =>
                                            setRevokeOthersOpen(true)}
                                        disabled={devicesLoading ||
                                            revokeOthersPending ||
                                            logoutCurrentPending}
                                    >
                                        <LogOut size={15} />
                                        <span>退出其他所有设备</span>
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="account-card-content">
                        {devicesActionMsg && (
                            <StatusBanner
                                tone="success"
                                className="account-status-banner--section"
                            >
                                {devicesActionMsg}
                            </StatusBanner>
                        )}
                        {devicesError && (
                            <StatusBanner
                                tone="error"
                                className="account-status-banner--section"
                            >
                                {devicesError}
                            </StatusBanner>
                        )}

                        {devicesLoading && devices.length === 0
                            ? (
                                <p className="account-empty-notice muted">
                                    正在加载登录设备…
                                </p>
                            )
                            : devices.length === 0
                            ? (
                                <p className="account-empty-notice muted">
                                    暂无活跃设备记录
                                </p>
                            )
                            : (
                                <div className="account-device-list">
                                    {devices.map((device) => {
                                        const parsed = parseUserAgent(
                                            device.userAgent,
                                        );
                                        const isRevoking =
                                            revokingId === device.id;
                                        return (
                                            <div
                                                key={device.id}
                                                className="account-device-item"
                                                data-current={device.isCurrent
                                                    ? "true"
                                                    : undefined}
                                            >
                                                <div className="account-device-main">
                                                    <div
                                                        className="account-device-icon"
                                                        aria-hidden="true"
                                                    >
                                                        {parsed.type ===
                                                                "mobile"
                                                            ? (
                                                                <Smartphone
                                                                    size={20}
                                                                />
                                                            )
                                                            : parsed.type ===
                                                                    "tablet"
                                                            ? (
                                                                <Laptop
                                                                    size={20}
                                                                />
                                                            )
                                                            : parsed.type ===
                                                                    "desktop"
                                                            ? (
                                                                <Laptop
                                                                    size={20}
                                                                />
                                                            )
                                                            : (
                                                                <Globe
                                                                    size={20}
                                                                />
                                                            )}
                                                    </div>
                                                    <div className="account-device-info">
                                                        <div className="account-device-name-row">
                                                            <span className="account-device-name">
                                                                {parsed.name}
                                                            </span>
                                                            {device
                                                                .isCurrent && (
                                                                <Badge variant="default">
                                                                    当前设备
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="account-device-meta muted">
                                                            <span>
                                                                IP:{" "}
                                                                {device.ip ||
                                                                    "本地 / 未知"}
                                                            </span>
                                                            <span>
                                                                登录时间:{" "}
                                                                {formatTime(
                                                                    device
                                                                        .createdAt,
                                                                )}
                                                            </span>
                                                            {device
                                                                .lastActiveAt &&
                                                                (
                                                                    <span>
                                                                        最后活动:
                                                                        {" "}
                                                                        {formatTime(
                                                                            device
                                                                                .lastActiveAt,
                                                                        )}
                                                                    </span>
                                                                )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="account-device-action">
                                                    <Button
                                                        variant={device
                                                                .isCurrent
                                                            ? "outline"
                                                            : "destructive"}
                                                        size="sm"
                                                        type="button"
                                                        disabled={isRevoking ||
                                                            devicesLoading ||
                                                            logoutCurrentPending ||
                                                            revokeOthersPending}
                                                        onClick={() =>
                                                            void handleRevokeDevice(
                                                                device,
                                                            )}
                                                    >
                                                        {isRevoking
                                                            ? "处理中…"
                                                            : device.isCurrent
                                                            ? "退出此设备"
                                                            : "撤销会话"}
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                    </CardContent>
                </Card>
            </div>

            {/* Confirm Logout Current Device Dialog */}
            <AlertDialog
                open={logoutCurrentOpen}
                onOpenChange={(open) => {
                    if (!open && !logoutCurrentPending) {
                        setLogoutCurrentOpen(false);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>退出当前设备</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要退出当前设备吗？退出后您需要重新登录以继续使用
                            Searcher。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={logoutCurrentPending}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={logoutCurrentPending}
                            onClick={handleConfirmLogoutCurrent}
                        >
                            {logoutCurrentPending ? "退出中…" : "确认退出"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Confirm Revoke Other Devices Dialog */}
            <AlertDialog
                open={revokeOthersOpen}
                onOpenChange={(open) => {
                    if (!open && !revokeOthersPending) {
                        setRevokeOthersOpen(false);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>退出其他所有设备</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要退出除当前设备外的所有其他设备吗？其他设备上的会话将立即失效，需要重新登录。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={revokeOthersPending}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={revokeOthersPending}
                            onClick={handleConfirmRevokeOthers}
                        >
                            {revokeOthersPending ? "处理中…" : "确认退出"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </PageShell>
    );
}
