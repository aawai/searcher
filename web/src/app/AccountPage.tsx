import { PageShell } from "../components/searcher/PageShell.tsx";
import { EmptyState } from "../components/searcher/semantic.tsx";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    Globe,
    Key,
    Laptop,
    LogOut,
    RefreshCw,
    Shield,
    Smartphone,
} from "lucide-react";
import type { UserDto } from "@shared/contracts.ts";
import { Button } from "../components/ui/button.tsx";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "../components/ui/card.tsx";
import { Input } from "../components/ui/input.tsx";
import { api, json } from "../lib/api.ts";
import { errorMessage, useAppState } from "./state.tsx";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { authPath, routes } from "./routes.ts";

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
        hour12: false,
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
                    email: email.trim() || "",
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
            if (confirm("确定要退出当前设备吗？")) {
                await logout();
                navigate(routes.login);
            }
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

    // Revoke all other devices
    const handleRevokeOthers = async () => {
        if (!confirm("确定要退出除当前设备外的所有其他设备吗？")) return;
        setDevicesLoading(true);
        setDevicesError("");
        setDevicesActionMsg("");
        try {
            await api("/api/auth/devices/revoke-others", { method: "POST" });
            setDevicesActionMsg("已退出所有其他设备");
            await loadDevices();
        } catch (err) {
            setDevicesError(errorMessage(err));
        } finally {
            setDevicesLoading(false);
        }
    };

    if (!user) {
        return (
            <PageShell archetype="utility" className="page account-page">
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
        <PageShell archetype="utility" className="page account-page">
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
                <div
                    role="alert"
                    style={{
                        padding: "18px 22px",
                        marginBottom: "28px",
                        background:
                            "color-mix(in srgb, var(--danger) 12%, var(--surface))",
                        border: "2px solid var(--danger)",
                        borderRadius: "var(--radius)",
                        display: "flex",
                        gap: "16px",
                        alignItems: "flex-start",
                    }}
                >
                    <AlertTriangle
                        size={26}
                        style={{
                            color: "var(--danger)",
                            flexShrink: 0,
                            marginTop: "2px",
                        }}
                    />
                    <div>
                        <h2
                            style={{
                                margin: "0 0 6px",
                                fontSize: "17px",
                                color: "var(--danger)",
                                fontWeight: 700,
                            }}
                        >
                            必须重置密码
                        </h2>
                        <p
                            style={{
                                margin: 0,
                                fontSize: "14px",
                                lineHeight: "1.6",
                            }}
                        >
                            管理员已重置了您的账户密码。为了账户安全，您必须在此设置新密码后方可正常使用。
                            修改密码后，所有设备将立即注销，您需要使用新密码重新登录。
                        </p>
                    </div>
                </div>
            )}

            <div style={{ display: "grid", gap: "24px" }}>
                {/* 1. Profile Card */}
                <Card className="p-4 md:p-6 bg-[var(--surface-solid)] border-[var(--border)] shadow-none">
                    <CardHeader className="p-0 pb-5">
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "16px",
                                marginBottom: "20px",
                            }}
                        >
                            <div
                                style={{
                                    width: "56px",
                                    height: "56px",
                                    borderRadius: "16px",
                                    background: "var(--accent)",
                                    color: "var(--accent-foreground)",
                                    display: "grid",
                                    placeItems: "center",
                                    fontSize: "24px",
                                    fontWeight: 700,
                                    flexShrink: 0,
                                }}
                            >
                                {(user.displayName || user.username).slice(0, 1)
                                    .toUpperCase()}
                            </div>
                            <div>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "10px",
                                    }}
                                >
                                    <h2
                                        style={{
                                            margin: 0,
                                            fontSize: "20px",
                                            fontWeight: 700,
                                        }}
                                    >
                                        {user.displayName}
                                    </h2>
                                    <span
                                        style={{
                                            fontSize: "12px",
                                            fontWeight: 600,
                                            padding: "2px 8px",
                                            borderRadius: "12px",
                                            background: user.role === "admin"
                                                ? "var(--accent)"
                                                : "var(--surface-soft)",
                                            color: user.role === "admin"
                                                ? "var(--accent-foreground)"
                                                : "var(--muted)",
                                            border: "1px solid var(--border)",
                                        }}
                                    >
                                        {user.role === "admin"
                                            ? "系统管理员"
                                            : "标准用户"}
                                    </span>
                                </div>
                                <p
                                    className="muted"
                                    style={{
                                        margin: "4px 0 0",
                                        fontSize: "14px",
                                    }}
                                >
                                    @{user.username}
                                </p>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <form onSubmit={handleSaveProfile}>
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                        "repeat(auto-fit, minmax(240px, 1fr))",
                                    gap: "16px",
                                }}
                            >
                                <label className="field" style={{ margin: 0 }}>
                                    <span>
                                        用户名{" "}
                                        <span
                                            className="muted"
                                            style={{ fontWeight: "normal" }}
                                        >
                                            (不可修改)
                                        </span>
                                    </span>
                                    <Input
                                        type="text"
                                        value={user.username}
                                        disabled
                                        style={{
                                            cursor: "not-allowed",
                                            color: "var(--muted)",
                                            background: "var(--surface-solid)",
                                        }}
                                    />
                                </label>
                                <label className="field" style={{ margin: 0 }}>
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

                            <label
                                className="field"
                                style={{ marginTop: "16px" }}
                            >
                                <span>
                                    邮箱地址{" "}
                                    <span
                                        className="muted"
                                        style={{ fontWeight: "normal" }}
                                    >
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
                                <p
                                    role="status"
                                    style={{
                                        color: "var(--success)",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        margin: "14px 0 0",
                                        fontSize: "14px",
                                    }}
                                >
                                    <CheckCircle2 size={16} />
                                    {profileSuccess}
                                </p>
                            )}
                            {profileError && (
                                <p
                                    role="alert"
                                    className="error"
                                    style={{
                                        margin: "14px 0 0",
                                        fontSize: "14px",
                                    }}
                                >
                                    {profileError}
                                </p>
                            )}

                            <div
                                style={{
                                    marginTop: "20px",
                                    display: "flex",
                                    justifyContent: "flex-end",
                                }}
                            >
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
                    className={`p-4 md:p-6 bg-[var(--surface-solid)] shadow-none ${
                        user.mustChangePassword
                            ? "border-2 border-[var(--accent)]"
                            : "border border-[var(--border)]"
                    }`}
                >
                    <CardHeader className="p-0 pb-4">
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                marginBottom: "4px",
                            }}
                        >
                            <Key size={20} style={{ color: "var(--accent)" }} />
                            <CardTitle className="m-0 text-[19px] font-bold">
                                {user.mustChangePassword
                                    ? "重置密码 (必须修改)"
                                    : "修改密码"}
                            </CardTitle>
                        </div>
                        <p className="muted m-0 text-sm">
                            修改密码需要提供当前密码。修改成功后，将在所有已登录设备（包括当前设备）退出登录。
                        </p>
                    </CardHeader>
                    <CardContent className="p-0">
                        <form onSubmit={handleChangePassword}>
                            <label
                                className="field"
                                style={{ margin: "0 0 16px" }}
                            >
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
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                        "repeat(auto-fit, minmax(240px, 1fr))",
                                    gap: "16px",
                                }}
                            >
                                <label className="field" style={{ margin: 0 }}>
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
                                        placeholder="输入新密码 (12–128 位)"
                                    />
                                </label>
                                <label className="field" style={{ margin: 0 }}>
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
                                <p
                                    role="status"
                                    style={{
                                        color: "var(--success)",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        margin: "14px 0 0",
                                        fontSize: "14px",
                                    }}
                                >
                                    <CheckCircle2 size={16} />
                                    {passwordSuccess}
                                </p>
                            )}
                            {passwordError && (
                                <p
                                    role="alert"
                                    className="error"
                                    style={{
                                        margin: "14px 0 0",
                                        fontSize: "14px",
                                    }}
                                >
                                    {passwordError}
                                </p>
                            )}

                            <div
                                style={{
                                    marginTop: "20px",
                                    display: "flex",
                                    justifyContent: "flex-end",
                                }}
                            >
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
                <Card className="p-4 md:p-6 bg-[var(--surface-solid)] border-[var(--border)] shadow-none">
                    <CardHeader className="p-0 pb-4">
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                flexWrap: "wrap",
                                gap: "12px",
                                marginBottom: "16px",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                }}
                            >
                                <Laptop
                                    size={20}
                                    style={{ color: "var(--accent)" }}
                                />
                                <div>
                                    <CardTitle className="m-0 text-[19px] font-bold">
                                        设备会话管理
                                    </CardTitle>
                                    <p
                                        className="muted"
                                        style={{
                                            margin: "2px 0 0",
                                            fontSize: "13px",
                                        }}
                                    >
                                        当前账号共在 {devices.length}{" "}
                                        个设备上保持登录
                                    </p>
                                </div>
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => void loadDevices()}
                                    disabled={devicesLoading}
                                    className="button button--subtle"
                                    style={{
                                        minHeight: "38px",
                                        padding: "6px 12px",
                                        fontSize: "13px",
                                    }}
                                    title="刷新设备列表"
                                    aria-label="刷新设备列表"
                                >
                                    <RefreshCw
                                        size={15}
                                        className={devicesLoading ? "spin" : ""}
                                    />
                                    <span>刷新</span>
                                </button>
                                {hasOtherDevices && (
                                    <Button
                                        variant="destructive"
                                        type="button"
                                        onClick={() =>
                                            void handleRevokeOthers()}
                                        disabled={devicesLoading}
                                        style={{
                                            minHeight: "38px",
                                            padding: "6px 12px",
                                            fontSize: "13px",
                                        }}
                                    >
                                        <LogOut size={15} />
                                        <span>退出其他所有设备</span>
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {devicesActionMsg && (
                            <p
                                role="status"
                                style={{
                                    color: "var(--success)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    margin: "0 0 16px",
                                    fontSize: "14px",
                                }}
                            >
                                <CheckCircle2 size={16} />
                                {devicesActionMsg}
                            </p>
                        )}
                        {devicesError && (
                            <p
                                role="alert"
                                className="error"
                                style={{ margin: "0 0 16px", fontSize: "14px" }}
                            >
                                {devicesError}
                            </p>
                        )}

                        {devicesLoading && devices.length === 0
                            ? (
                                <p
                                    className="muted"
                                    style={{
                                        padding: "24px 0",
                                        textAlign: "center",
                                    }}
                                >
                                    正在加载登录设备…
                                </p>
                            )
                            : devices.length === 0
                            ? (
                                <p
                                    className="muted"
                                    style={{
                                        padding: "24px 0",
                                        textAlign: "center",
                                    }}
                                >
                                    暂无活跃设备会话记录
                                </p>
                            )
                            : (
                                <div style={{ display: "grid", gap: "12px" }}>
                                    {devices.map((device) => {
                                        const parsed = parseUserAgent(
                                            device.userAgent,
                                        );
                                        const isRevoking =
                                            revokingId === device.id;
                                        return (
                                            <div
                                                key={device.id}
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent:
                                                        "space-between",
                                                    flexWrap: "wrap",
                                                    gap: "12px",
                                                    padding: "16px 18px",
                                                    borderRadius: "12px",
                                                    border: device.isCurrent
                                                        ? "1px solid var(--accent-border)"
                                                        : "1px solid var(--border)",
                                                    background: device.isCurrent
                                                        ? "var(--accent-soft)"
                                                        : "var(--surface-solid)",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "14px",
                                                        minWidth: "220px",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            width: "42px",
                                                            height: "42px",
                                                            borderRadius:
                                                                "10px",
                                                            background:
                                                                "var(--surface-solid)",
                                                            border:
                                                                "1px solid var(--border)",
                                                            display: "grid",
                                                            placeItems:
                                                                "center",
                                                            color:
                                                                device.isCurrent
                                                                    ? "var(--accent)"
                                                                    : "var(--muted)",
                                                            flexShrink: 0,
                                                        }}
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
                                                    <div>
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                alignItems:
                                                                    "center",
                                                                gap: "8px",
                                                                flexWrap:
                                                                    "wrap",
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    fontWeight:
                                                                        650,
                                                                    fontSize:
                                                                        "15px",
                                                                }}
                                                            >
                                                                {parsed.name}
                                                            </span>
                                                            {device.isCurrent &&
                                                                (
                                                                    <span
                                                                        style={{
                                                                            fontSize:
                                                                                "11px",
                                                                            fontWeight:
                                                                                700,
                                                                            padding:
                                                                                "1px 7px",
                                                                            borderRadius:
                                                                                "999px",
                                                                            background:
                                                                                "var(--accent)",
                                                                            color:
                                                                                "var(--accent-foreground)",
                                                                        }}
                                                                    >
                                                                        当前设备
                                                                    </span>
                                                                )}
                                                        </div>
                                                        <div
                                                            className="muted"
                                                            style={{
                                                                fontSize:
                                                                    "12px",
                                                                marginTop:
                                                                    "3px",
                                                                display: "flex",
                                                                gap: "12px",
                                                                flexWrap:
                                                                    "wrap",
                                                            }}
                                                        >
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

                                                <div>
                                                    <Button
                                                        variant={device
                                                                .isCurrent
                                                            ? "outline"
                                                            : "destructive"}
                                                        type="button"
                                                        disabled={isRevoking ||
                                                            devicesLoading}
                                                        onClick={() =>
                                                            void handleRevokeDevice(
                                                                device,
                                                            )}
                                                        style={{
                                                            minHeight: "36px",
                                                            padding: "6px 14px",
                                                            fontSize: "13px",
                                                        }}
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
        </PageShell>
    );
}
