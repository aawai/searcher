import {
    type ChangeEvent,
    type KeyboardEvent,
    type ReactNode,
    type SubmitEvent,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    ChevronDown,
    Crop,
    ExternalLink,
    RefreshCw,
    Trash2,
    Upload,
} from "lucide-react";
import { AUTH_CREDENTIAL_RULES, type UserDto } from "@shared/contracts.ts";
import {
    AVATAR_ALLOWED_MIME_TYPES,
    AVATAR_UPLOAD_MAX_BYTES,
    AVATAR_UPLOAD_MAX_MIB,
    type AvatarCrop,
    type AvatarMetaDto,
} from "@shared/avatar.ts";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
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
    FormField,
    FormFields,
    LoadingState,
    SecretInput,
    SettingsGroup,
    SettingsRow,
    StatusBanner,
} from "../components/searcher/semantic.tsx";
import { api, json } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";
import { errorMessage, useAppState } from "./state.tsx";
import { authPath, routes } from "./routes.ts";
import { SettingsShell } from "./SettingsShell.tsx";
import { AvatarCropDialog } from "../components/searcher/AvatarCropDialog.tsx";
import { UserAvatar } from "../components/searcher/UserAvatar.tsx";
import "./account.css";
import { type PageHost, usePagePresenter } from "./page-host.tsx";

const passwordRules = AUTH_CREDENTIAL_RULES.password;
const passwordRule =
    `密码长度须为 ${passwordRules.minLength}–${passwordRules.maxLength} 个字符`;
const DIALOG_TABBABLE_SELECTOR =
    'a[href], area[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function handleDialogTabWrap(event: KeyboardEvent<HTMLElement>) {
    if (
        event.key !== "Tab" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
    ) {
        return;
    }
    const candidates = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>(
            DIALOG_TABBABLE_SELECTOR,
        ),
    ).filter((el) =>
        el.tabIndex >= 0 &&
        !el.matches(":disabled") &&
        !el.hasAttribute("data-disabled") &&
        !el.hasAttribute("inert") &&
        !el.hasAttribute("data-base-ui-focus-guard") &&
        !el.hasAttribute("data-floating-ui-focus-guard") &&
        el.getAttribute("aria-hidden") !== "true" &&
        !el.closest('[aria-hidden="true"], [inert]') &&
        el.getAttribute("aria-disabled") !== "true" &&
        el.getClientRects().length > 0
    );
    if (candidates.length === 0) return;
    const first = candidates[0];
    const last = candidates[candidates.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
        if (
            active === first ||
            active === event.currentTarget ||
            !event.currentTarget.contains(active)
        ) {
            event.preventDefault();
            last.focus();
        }
    } else if (active === last || !event.currentTarget.contains(active)) {
        event.preventDefault();
        first.focus();
    }
}

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
    if (!timestamp) return "-";
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

export function useAccountHeaderActions(host: PageHost): ReactNode {
    const { user } = useAppState();
    const { Link } = host;
    if (user?.role !== "admin") return undefined;
    return (
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
    );
}

export function AccountPage() {
    return <AccountContent host={usePagePresenter()} />;
}

export function AccountPanel({ host }: { host: PageHost }) {
    return <AccountContent host={host} embeddedInShell />;
}

export function AccountContent(
    { host, embeddedInShell = false }: {
        host: PageHost;
        embeddedInShell?: boolean;
    },
) {
    const { user, authSession, updateProfile, logout } = useAppState();
    const headerActions = useAccountHeaderActions(host);
    const { navigate, location, Link } = host;
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const isCurrent = () => mounted.current && authSession.isCurrent();

    // Profile state
    const [displayName, setDisplayName] = useState(user?.displayName ?? "");
    const [email, setEmail] = useState(user?.email ?? "");
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileSuccess, setProfileSuccess] = useState("");
    const [profileError, setProfileError] = useState("");

    // Avatar state
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const [avatarMeta, setAvatarMeta] = useState<AvatarMetaDto | null>(null);
    const [avatarActionError, setAvatarActionError] = useState("");
    const [avatarActionSuccess, setAvatarActionSuccess] = useState("");
    const [cropDialogOpen, setCropDialogOpen] = useState(false);
    const [cropMode, setCropMode] = useState<"upload" | "recrop">("upload");
    const [cropFile, setCropFile] = useState<File | null>(null);
    const [cropPreviewUrl, setCropPreviewUrl] = useState<string | null>(null);
    const [avatarSaving, setAvatarSaving] = useState(false);
    const [avatarDialogError, setAvatarDialogError] = useState("");
    const [removeAvatarOpen, setRemoveAvatarOpen] = useState(false);
    const [removeAvatarPending, setRemoveAvatarPending] = useState(false);

    // Password change state
    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordSuccess, setPasswordSuccess] = useState("");
    const [passwordError, setPasswordError] = useState("");
    // Client checks belong to one field and show in its row; server errors
    // stay in the dialog's banner.
    const [passwordFieldError, setPasswordFieldError] = useState<
        { field: "new" | "confirm"; message: string } | null
    >(null);
    const passwordTriggerRef = useRef<HTMLButtonElement>(null);
    const newPasswordRef = useRef<HTMLInputElement>(null);
    const confirmPasswordRef = useRef<HTMLInputElement>(null);

    // Devices state
    const [devices, setDevices] = useState<SessionDevice[]>([]);
    // Signed-in users fetch on mount; start in the loading state so the first
    // frame does not flash the empty-list copy.
    const [devicesLoading, setDevicesLoading] = useState(Boolean(user));
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
            if (!isCurrent()) return;
            setDevices(res.devices);
        } catch (err) {
            if (isCurrent()) setDevicesError(errorMessage(err));
        } finally {
            if (isCurrent()) setDevicesLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            void loadDevices();
        }
    }, [authSession, user?.id]);

    // Load avatar metadata (for recrop & original image access)
    useEffect(() => {
        if (!user) {
            setAvatarMeta(null);
            return;
        }
        let cancelled = false;
        void api<{ avatar: AvatarMetaDto | null }>("/api/account/avatar")
            .then((res) => {
                if (!cancelled && isCurrent()) {
                    setAvatarMeta(res.avatar);
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [authSession, user?.id]);

    useEffect(() => {
        return () => {
            if (cropPreviewUrl && cropPreviewUrl.startsWith("blob:")) {
                URL.revokeObjectURL(cropPreviewUrl);
            }
        };
    }, [cropPreviewUrl]);

    const closeCropDialog = () => {
        if (avatarSaving) return;
        setCropDialogOpen(false);
        setCropFile(null);
        setAvatarDialogError("");
        setCropPreviewUrl((prev) => {
            if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
            return null;
        });
    };

    const handleAvatarFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setAvatarActionError("");
        setAvatarActionSuccess("");
        if (
            !(AVATAR_ALLOWED_MIME_TYPES as readonly string[]).includes(
                file.type,
            )
        ) {
            setAvatarActionError(
                "仅支持 PNG、JPEG、WebP 或 AVIF 格式图片",
            );
            return;
        }
        if (file.size < 1 || file.size > AVATAR_UPLOAD_MAX_BYTES) {
            setAvatarActionError(
                `头像图片大小不能超过 ${AVATAR_UPLOAD_MAX_MIB} MiB`,
            );
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        setCropMode("upload");
        setCropFile(file);
        setCropPreviewUrl(objectUrl);
        setAvatarDialogError("");
        setCropDialogOpen(true);
    };

    const handleOpenRecrop = () => {
        if (!avatarMeta) return;
        setAvatarActionError("");
        setAvatarActionSuccess("");
        setCropMode("recrop");
        setCropFile(null);
        setCropPreviewUrl(avatarMeta.originalUrl);
        setAvatarDialogError("");
        setCropDialogOpen(true);
    };

    const handleConfirmAvatarCrop = async (crop: AvatarCrop) => {
        if (!user) return;
        setAvatarSaving(true);
        setAvatarDialogError("");
        try {
            let res: { avatar: AvatarMetaDto; avatarUrl: string };
            if (cropMode === "upload") {
                if (!cropFile) return;
                const form = new FormData();
                form.append("avatar", cropFile);
                form.append("cropX", String(crop.x));
                form.append("cropY", String(crop.y));
                form.append("cropSize", String(crop.size));
                res = await api<{ avatar: AvatarMetaDto; avatarUrl: string }>(
                    "/api/account/avatar",
                    { method: "POST", body: form },
                );
            } else {
                res = await api<{ avatar: AvatarMetaDto; avatarUrl: string }>(
                    "/api/account/avatar/crop",
                    json("PATCH", crop),
                );
            }
            if (!isCurrent()) return;
            setAvatarMeta(res.avatar);
            updateProfile({ ...user, avatarUrl: res.avatarUrl });
            setAvatarActionSuccess(
                cropMode === "recrop" ? "头像裁剪已更新" : "头像已更新",
            );
            setCropDialogOpen(false);
            setCropFile(null);
            setCropPreviewUrl((prev) => {
                if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
                return null;
            });
        } catch (err) {
            if (isCurrent()) setAvatarDialogError(errorMessage(err));
        } finally {
            if (isCurrent()) setAvatarSaving(false);
        }
    };

    const handleConfirmRemoveAvatar = async () => {
        if (!user) return;
        setRemoveAvatarPending(true);
        setAvatarActionError("");
        setAvatarActionSuccess("");
        try {
            await api<{ avatarUrl: null }>("/api/account/avatar", {
                method: "DELETE",
            });
            if (!isCurrent()) return;
            setAvatarMeta(null);
            updateProfile({ ...user, avatarUrl: null });
            setRemoveAvatarOpen(false);
            setAvatarActionSuccess("头像已移除");
        } catch (err) {
            if (isCurrent()) {
                setAvatarActionError(errorMessage(err));
                setRemoveAvatarOpen(false);
            }
        } finally {
            if (isCurrent()) setRemoveAvatarPending(false);
        }
    };

    // Save profile
    const handleSaveProfile = async (e: SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        setProfileError("");
        setProfileSuccess("");
        setProfileSaving(true);
        try {
            const trimmedEmail = email.trim();
            const res = await api<{ user: UserDto }>(
                "/api/account",
                json("PATCH", {
                    displayName: displayName.trim(),
                    email: trimmedEmail === "" ? null : trimmedEmail,
                }),
            );
            if (!isCurrent()) return;
            updateProfile(res.user);
            setProfileSuccess("个人资料更新成功");
        } catch (err) {
            if (isCurrent()) setProfileError(errorMessage(err));
        } finally {
            if (isCurrent()) setProfileSaving(false);
        }
    };

    // Change password
    const handleChangePassword = async (e: SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        setPasswordError("");
        setPasswordFieldError(null);
        setPasswordSuccess("");

        if (
            newPassword.length < passwordRules.minLength ||
            newPassword.length > passwordRules.maxLength
        ) {
            setPasswordFieldError({
                field: "new",
                message: passwordRule,
            });
            newPasswordRef.current?.focus();
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordFieldError({
                field: "confirm",
                message: "两次输入的新密码不一致",
            });
            confirmPasswordRef.current?.focus();
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
            if (!isCurrent()) return;
            setPasswordSuccess(
                "密码修改成功，所有设备均已退出登录，请使用新密码重新登录。",
            );
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            // Logout after short delay
            setTimeout(() => {
                if (!isCurrent()) return;
                void logout().then(() =>
                    navigate(routes.login, { viewTransition: true })
                );
            }, 2500);
        } catch (err) {
            if (isCurrent()) setPasswordError(errorMessage(err));
        } finally {
            if (isCurrent()) setPasswordSaving(false);
        }
    };

    const resetPasswordForm = () => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPasswordSuccess("");
        setPasswordError("");
        setPasswordFieldError(null);
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
            if (!isCurrent()) return;
            setDevicesActionMsg("已退出该设备");
            setRevokeDeviceId(null);
            await loadDevices();
        } catch (err) {
            if (!isCurrent()) return;
            setDevicesError(errorMessage(err));
            setRevokeDeviceId(null);
        } finally {
            if (isCurrent()) setRevokeDevicePending(false);
        }
    };

    // Confirm logout of current device
    const handleConfirmLogoutCurrent = async () => {
        setLogoutCurrentPending(true);
        try {
            const loggedOut = await logout();
            if (!mounted.current || !loggedOut || authSession.isCurrent()) {
                return;
            }
            setLogoutCurrentOpen(false);
            navigate(routes.login, { viewTransition: true });
        } catch (err) {
            if (!isCurrent()) return;
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
            if (!isCurrent()) return;
            setDevicesActionMsg("已退出所有其他设备");
            setRevokeOthersOpen(false);
            await loadDevices();
        } catch (err) {
            if (!isCurrent()) return;
            setDevicesError(errorMessage(err));
            setRevokeOthersOpen(false);
        } finally {
            if (isCurrent()) {
                setRevokeOthersPending(false);
                setDevicesLoading(false);
            }
        }
    };

    if (!user) {
        const emptyContent = (
            <EmptyState
                illustration="auth-required"
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
        );
        return embeddedInShell
            ? emptyContent
            : (
                <SettingsShell current="account" host={host}>
                    {emptyContent}
                </SettingsShell>
            );
    }

    const isForcedReset = user.mustChangePassword;
    const roleLabel = user.role === "admin" ? "管理员" : "普通用户";
    const hasOtherDevices = devices.some((device) => !device.isCurrent);
    const profileUnchanged = displayName === user.displayName &&
        email === (user.email ?? "");

    const accountBody = (
        <>
            {isForcedReset && (
                <StatusBanner
                    tone="warning"
                    className="account-forced-banner"
                >
                    管理员已重置密码，请先设置新密码。
                </StatusBanner>
            )}

            <div className="account-identity">
                <div className="account-identity-main">
                    <span className="account-avatar" aria-hidden="true">
                        <UserAvatar user={user} />
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
                <div className="account-identity-actions">
                    <input
                        ref={avatarInputRef}
                        type="file"
                        accept={AVATAR_ALLOWED_MIME_TYPES.join(",")}
                        className="sr-only"
                        aria-hidden="true"
                        tabIndex={-1}
                        onChange={handleAvatarFileChange}
                    />
                    {user.avatarUrl || avatarMeta
                        ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    className={buttonVariants({
                                        variant: "outline",
                                        size: "sm",
                                    })}
                                >
                                    <span>编辑头像</span>
                                    <ChevronDown
                                        size="1em"
                                        className="icon-sm"
                                        aria-hidden="true"
                                    />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent sideOffset={6}>
                                    <DropdownMenuItem
                                        onClick={() =>
                                            avatarInputRef.current?.click()}
                                    >
                                        <Upload
                                            size="1em"
                                            className="icon-sm"
                                            aria-hidden="true"
                                        />
                                        <span>更换头像</span>
                                    </DropdownMenuItem>
                                    {avatarMeta && (
                                        <>
                                            <DropdownMenuItem
                                                onClick={handleOpenRecrop}
                                            >
                                                <Crop
                                                    size="1em"
                                                    className="icon-sm"
                                                    aria-hidden="true"
                                                />
                                                <span>调整裁剪</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                render={
                                                    <a
                                                        href={avatarMeta
                                                            .originalUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    />
                                                }
                                            >
                                                <ExternalLink
                                                    size="1em"
                                                    className="icon-sm"
                                                    aria-hidden="true"
                                                />
                                                <span>查看原图</span>
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onClick={() =>
                                            setRemoveAvatarOpen(true)}
                                    >
                                        <Trash2
                                            size="1em"
                                            className="icon-sm"
                                            aria-hidden="true"
                                        />
                                        <span>移除头像</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )
                        : (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => avatarInputRef.current?.click()}
                            >
                                上传头像
                            </Button>
                        )}
                </div>
            </div>

            {avatarActionSuccess && (
                <StatusBanner
                    tone="success"
                    className="account-forced-banner"
                >
                    {avatarActionSuccess}
                </StatusBanner>
            )}
            {avatarActionError && (
                <StatusBanner
                    tone="error"
                    className="account-forced-banner"
                >
                    {avatarActionError}
                </StatusBanner>
            )}

            <form className="account-profile" onSubmit={handleSaveProfile}>
                <SettingsGroup title="个人资料">
                    <SettingsRow title="用户名">
                        <span>{user.username}</span>
                    </SettingsRow>
                    <SettingsRow
                        title="显示名称"
                        labelFor="account-display-name"
                        className="settings-row--vertical"
                    >
                        <Input
                            id="account-display-name"
                            name="displayName"
                            placeholder="输入显示名称"
                            type="text"
                            autoComplete="name"
                            required
                            maxLength={40}
                            value={displayName}
                            onChange={(e) => {
                                setDisplayName(e.target.value);
                                if (profileSuccess) setProfileSuccess("");
                                if (profileError) setProfileError("");
                            }}
                        />
                    </SettingsRow>
                    <SettingsRow
                        title="邮箱"
                        labelFor="account-email"
                        className="settings-row--vertical"
                    >
                        <Input
                            id="account-email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            spellCheck={false}
                            placeholder="name@example.com"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                if (profileSuccess) setProfileSuccess("");
                                if (profileError) setProfileError("");
                            }}
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
                <div className="account-profile-actions">
                    <Button
                        type="submit"
                        variant="default"
                        size="sm"
                        disabled={profileSaving || profileUnchanged}
                    >
                        {profileSaving ? "保存中…" : "保存资料"}
                    </Button>
                </div>
            </form>

            <SettingsGroup title="安全">
                <SettingsRow title="密码">
                    <Button
                        ref={passwordTriggerRef}
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
                                variant="ghost-danger"
                                size="sm"
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
                                    "icon-sm account-refresh-icon",
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
                        <LoadingState
                            density="compact"
                            className="account-device-empty"
                        >
                            正在加载登录设备…
                        </LoadingState>
                    )
                    : devices.length === 0
                    ? (
                        <EmptyState
                            density="inline"
                            headingLevel={3}
                            title="暂无活跃设备记录"
                            className="account-device-empty"
                        />
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
                                                <span className="account-device-current">
                                                    当前设备
                                                </span>
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
                                        variant="ghost-danger"
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
        </>
    );

    return (
        <>
            {embeddedInShell ? accountBody : (
                <SettingsShell
                    host={host}
                    current="account"
                    actions={headerActions}
                >
                    {accountBody}
                </SettingsShell>
            )}

            <Dialog
                open={host.active && passwordDialogOpen}
                onOpenChange={handlePasswordDialogOpenChange}
            >
                <DialogPortal>
                    <DialogBackdrop />
                    <DialogPopup
                        className="account-password-dialog"
                        finalFocus={passwordTriggerRef}
                        onKeyDown={handleDialogTabWrap}
                    >
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

                            <FormFields>
                                <FormField
                                    label="当前密码"
                                    labelFor="account-current-password"
                                >
                                    <SecretInput
                                        key={passwordDialogOpen
                                            ? "current-open"
                                            : "current-closed"}
                                        id="account-current-password"
                                        name="currentPassword"
                                        placeholder="用于确认是你本人"
                                        required
                                        autoComplete="current-password"
                                        value={currentPassword}
                                        onChange={(e) =>
                                            setCurrentPassword(e.target.value)}
                                    />
                                </FormField>
                                <FormField
                                    label="新密码"
                                    labelFor="account-new-password"
                                    hint={passwordRule}
                                    error={passwordFieldError?.field === "new"
                                        ? passwordFieldError.message
                                        : undefined}
                                    messageId="account-new-password-hint"
                                    invalid={passwordFieldError?.field ===
                                        "new"}
                                >
                                    <SecretInput
                                        key={passwordDialogOpen
                                            ? "new-open"
                                            : "new-closed"}
                                        ref={newPasswordRef}
                                        id="account-new-password"
                                        name="newPassword"
                                        placeholder={`至少 ${passwordRules.minLength} 个字符`}
                                        required
                                        minLength={passwordRules.minLength}
                                        maxLength={passwordRules.maxLength}
                                        autoComplete="new-password"
                                        aria-describedby="account-new-password-hint"
                                        aria-invalid={passwordFieldError
                                                    ?.field === "new" ||
                                            undefined}
                                        value={newPassword}
                                        onChange={(e) =>
                                            setNewPassword(e.target.value)}
                                    />
                                </FormField>
                                <FormField
                                    label="确认新密码"
                                    labelFor="account-confirm-password"
                                    error={passwordFieldError?.field ===
                                            "confirm"
                                        ? passwordFieldError.message
                                        : undefined}
                                    messageId="account-confirm-password-error"
                                    invalid={passwordFieldError?.field ===
                                        "confirm"}
                                >
                                    <SecretInput
                                        key={passwordDialogOpen
                                            ? "confirm-open"
                                            : "confirm-closed"}
                                        ref={confirmPasswordRef}
                                        id="account-confirm-password"
                                        name="confirmPassword"
                                        placeholder="再次输入新密码"
                                        required
                                        minLength={passwordRules.minLength}
                                        maxLength={passwordRules.maxLength}
                                        autoComplete="new-password"
                                        aria-describedby={passwordFieldError
                                                ?.field === "confirm"
                                            ? "account-confirm-password-error"
                                            : undefined}
                                        aria-invalid={passwordFieldError
                                                    ?.field === "confirm" ||
                                            undefined}
                                        value={confirmPassword}
                                        onChange={(e) =>
                                            setConfirmPassword(e.target.value)}
                                    />
                                </FormField>
                            </FormFields>

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
                                    variant="default"
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
                open={host.active && revokeDeviceId !== null}
                pending={revokeDevicePending}
                title="退出该设备"
                description="确定要退出该设备吗？该设备需要重新登录。"
                pendingLabel="处理中…"
                onCancel={() => setRevokeDeviceId(null)}
                onConfirm={handleConfirmRevokeDevice}
            />
            <SessionConfirmDialog
                open={host.active && logoutCurrentOpen}
                pending={logoutCurrentPending}
                title="退出当前设备"
                description="确定要退出当前设备吗？退出后需要重新登录。"
                pendingLabel="退出中…"
                onCancel={() => setLogoutCurrentOpen(false)}
                onConfirm={handleConfirmLogoutCurrent}
            />
            <SessionConfirmDialog
                open={host.active && revokeOthersOpen}
                pending={revokeOthersPending}
                title="退出其他所有设备"
                description="确定要退出除当前设备外的所有其他设备吗？"
                pendingLabel="处理中…"
                onCancel={() => setRevokeOthersOpen(false)}
                onConfirm={handleConfirmRevokeOthers}
            />

            <AvatarCropDialog
                open={host.active && cropDialogOpen}
                mode={cropMode}
                imageUrl={cropPreviewUrl}
                initialCrop={cropMode === "recrop" ? avatarMeta?.crop : null}
                saving={avatarSaving}
                error={avatarDialogError}
                onOpenChange={(next) => {
                    if (!next) closeCropDialog();
                }}
                onConfirm={handleConfirmAvatarCrop}
            />

            <AlertDialog
                open={host.active && removeAvatarOpen}
                onOpenChange={(next) => {
                    if (!next && !removeAvatarPending) {
                        setRemoveAvatarOpen(false);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>移除头像</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要移除当前头像吗？保留的原始头像图片也会一并删除。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={removeAvatarPending}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={removeAvatarPending}
                            onClick={handleConfirmRemoveAvatar}
                        >
                            {removeAvatarPending ? "移除中…" : "确认移除"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
