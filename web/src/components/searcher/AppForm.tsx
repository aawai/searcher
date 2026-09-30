import {
    type ChangeEvent,
    type FormEvent,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Check, Loader2, RefreshCw, Upload } from "lucide-react";
import { api, json } from "../../lib/api.ts";
import type { Appearance } from "../../app/state.tsx";
import { errorMessage } from "../../app/state.tsx";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { NativeSelect, NativeSelectOption } from "../ui/native-select.tsx";
import { Switch } from "../ui/switch.tsx";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs.tsx";
import { LogoCandidatePicker } from "./LogoCandidatePicker.tsx";
import type { ExtendedWebApp, WebAppGroup } from "../../app/SearchHome.tsx";

export interface AppFormProps {
    onClose: () => void;
    editingApp: ExtendedWebApp | null;
    groups: WebAppGroup[];
    appearance: Appearance;
    existingApps: ExtendedWebApp[];
    defaultGroupId?: string;
    onSaved: (app: ExtendedWebApp, isEdit: boolean) => void;
    onDirtyChange?: (isDirty: boolean) => void;
}

export function AppForm({
    onClose,
    editingApp,
    groups,
    appearance,
    existingApps,
    defaultGroupId = "",
    onSaved,
    onDirtyChange,
}: AppFormProps) {
    // Form fields
    const [appUrl, setAppUrl] = useState("");
    const [appName, setAppName] = useState("");
    const [appGroupId, setAppGroupId] = useState("");
    const [appOpenMode, setAppOpenMode] = useState<
        "global" | "current" | "new_tab"
    >("global");
    const [appIsPinned, setAppIsPinned] = useState(false);

    // Icon fields
    const [iconTab, setIconTab] = useState<"auto" | "upload" | "url" | "ai">(
        "auto",
    );
    const [appIconAssetId, setAppIconAssetId] = useState<string | null>(null);
    const [appIconSource, setAppIconSource] = useState<
        "website" | "upload" | "url" | "ai" | "default"
    >("website");
    const [iconPreviewUrl, setIconPreviewUrl] = useState<string | null>(null);
    const [iconImageUrl, setIconImageUrl] = useState("");
    const [imageLoadError, setImageLoadError] = useState(false);

    // Operation / UI states
    const [urlFetchStatus, setUrlFetchStatus] = useState<
        "idle" | "loading" | "success" | "error"
    >("idle");
    const [urlFetchMessage, setUrlFetchMessage] = useState("");
    const [formError, setFormError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploadingIcon, setIsUploadingIcon] = useState(false);
    const [isFetchingUrlIcon, setIsFetchingUrlIcon] = useState(false);

    const lastFetchedUrlRef = useRef("");
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );

    // Normalize URL helper
    function normalizeUrl(input: string): string | null {
        const raw = input.trim();
        if (!raw) return null;
        const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        try {
            const parsed = new URL(candidate);
            if (!["http:", "https:"].includes(parsed.protocol)) return null;
            if (!parsed.hostname || !parsed.hostname.includes(".")) return null;
            return parsed.href;
        } catch {
            return null;
        }
    }

    const siteDomain = useMemo(() => {
        const normalized = normalizeUrl(appUrl);
        if (!normalized) return undefined;
        try {
            const parsed = new URL(normalized);
            return parsed.hostname || undefined;
        } catch {
            return undefined;
        }
    }, [appUrl]);

    // Initialize or reset form when dialog opens or editingApp changes
    useEffect(() => {
        if (!open) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = undefined;
            return;
        }

        setFormError("");
        setImageLoadError(false);

        if (editingApp) {
            setAppUrl(editingApp.url);
            setAppName(editingApp.name);
            setAppGroupId(editingApp.groupId || "");
            setAppOpenMode(editingApp.openMode ?? "global");
            setAppIsPinned(Boolean(editingApp.isPinned));
            setAppIconAssetId(editingApp.iconAssetId || null);
            setAppIconSource(editingApp.iconSource || "website");
            setIconPreviewUrl(
                editingApp.iconUrl ||
                    (editingApp.iconAssetId
                        ? `/api/webapp-icons/${editingApp.iconAssetId}`
                        : null),
            );
            setIconImageUrl("");
            lastFetchedUrlRef.current = editingApp.url;
            setUrlFetchStatus("idle");
            setUrlFetchMessage("");
            setIconTab(
                editingApp.iconSource === "upload"
                    ? "upload"
                    : editingApp.iconSource === "url"
                    ? "url"
                    : editingApp.iconSource === "ai"
                    ? "ai"
                    : "auto",
            );
        } else {
            setAppUrl("");
            setAppName("");
            setAppGroupId(defaultGroupId);
            setAppOpenMode("global");
            setAppIsPinned(false);
            setAppIconAssetId(null);
            setAppIconSource("website");
            setIconPreviewUrl(null);
            setIconImageUrl("");
            lastFetchedUrlRef.current = "";
            setUrlFetchStatus("idle");
            setUrlFetchMessage("");
            setIconTab("auto");
        }
    }, [open, editingApp, defaultGroupId]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            clearTimeout(debounceTimerRef.current);
        };
    }, []);
    const isDirty = useMemo(() => {
        if (editingApp) {
            return (
                appUrl !== editingApp.url ||
                appName !== editingApp.name ||
                appGroupId !== (editingApp.groupId || "") ||
                appOpenMode !== (editingApp.openMode ?? "global") ||
                appIsPinned !== Boolean(editingApp.isPinned) ||
                appIconAssetId !== (editingApp.iconAssetId || null) ||
                appIconSource !== (editingApp.iconSource || "website") ||
                Boolean(iconImageUrl)
            );
        }
        return (
            Boolean(appUrl.trim()) ||
            Boolean(appName.trim()) ||
            appGroupId !== defaultGroupId ||
            appOpenMode !== "global" ||
            appIsPinned !== false ||
            appIconAssetId !== null ||
            Boolean(iconImageUrl)
        );
    }, [
        editingApp,
        appUrl,
        appName,
        appGroupId,
        appOpenMode,
        appIsPinned,
        appIconAssetId,
        appIconSource,
        iconImageUrl,
        defaultGroupId,
    ]);

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    // Perform URL detection
    async function doDetectUrl(targetUrl: string) {
        setUrlFetchStatus("loading");
        setUrlFetchMessage("正在获取网站信息…");
        setFormError("");
        try {
            const found = await api<
                { id: string; url: string; siteName: string | null }
            >(
                "/api/webapp-icons/fetch",
                json("POST", { url: targetUrl }),
            );
            lastFetchedUrlRef.current = targetUrl;
            setAppIconAssetId(found.id);
            setAppIconSource("website");
            setIconPreviewUrl(found.url);
            setImageLoadError(false);
            if (!appName.trim() && found.siteName) {
                setAppName(found.siteName);
            }
            setUrlFetchStatus("success");
            setUrlFetchMessage("已获取网站名称和图标");
        } catch (err) {
            setUrlFetchStatus("error");
            setUrlFetchMessage(
                err instanceof Error ? err.message : "获取网站信息失败",
            );
        }
    }

    // Handle URL input changes with debounce
    function handleUrlChange(val: string) {
        setAppUrl(val);
        setFormError("");
        if (urlFetchStatus === "success") {
            setUrlFetchStatus("idle");
            setUrlFetchMessage("");
        }

        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = undefined;

        const normalized = normalizeUrl(val);
        if (normalized && normalized !== lastFetchedUrlRef.current) {
            debounceTimerRef.current = setTimeout(() => {
                void doDetectUrl(normalized);
            }, 750);
        }
    }

    // Handle blur on URL input
    function handleUrlBlur() {
        const normalized = normalizeUrl(appUrl);
        if (
            normalized &&
            normalized !== lastFetchedUrlRef.current &&
            urlFetchStatus !== "loading"
        ) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = undefined;
            void doDetectUrl(normalized);
        }
    }

    // Manual retry fetch
    function handleRetryFetch() {
        const normalized = normalizeUrl(appUrl);
        if (normalized) {
            void doDetectUrl(normalized);
        } else {
            setFormError("请先输入有效的网址");
        }
    }

    // Handle image file upload
    async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setFormError("图片文件大小不能超过 5MB");
            return;
        }
        setIsUploadingIcon(true);
        setFormError("");
        const fd = new FormData();
        fd.append("icon", file);
        try {
            const res = await fetch("/api/webapp-icons/upload", {
                method: "POST",
                body: fd,
            });
            const data = await res.json();
            if (data.status && data.data) {
                setAppIconAssetId(data.data.id);
                setAppIconSource("upload");
                setIconPreviewUrl(data.data.url);
                setImageLoadError(false);
            } else {
                setFormError(data.message || "上传图标失败");
            }
        } catch (err) {
            setFormError(
                "上传图标出错: " +
                    (err instanceof Error ? err.message : String(err)),
            );
        } finally {
            setIsUploadingIcon(false);
            e.target.value = "";
        }
    }

    // Handle network image URL
    async function handleUseImageUrl() {
        const raw = iconImageUrl.trim();
        if (!raw) return;
        setIsFetchingUrlIcon(true);
        setFormError("");
        try {
            const res = await api<{ id: string; url: string }>(
                "/api/webapp-icons/url",
                json("POST", { imageUrl: raw }),
            );
            setAppIconAssetId(res.id);
            setAppIconSource("url");
            setIconPreviewUrl(res.url);
            setImageLoadError(false);
        } catch (err) {
            setFormError("获取图片失败: " + errorMessage(err));
        } finally {
            setIsFetchingUrlIcon(false);
        }
    }

    // Form save
    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setFormError("");
        setIsSubmitting(true);
        try {
            let normalizedUrl = appUrl.trim();
            if (!/^https?:\/\//i.test(normalizedUrl)) {
                normalizedUrl = "https://" + normalizedUrl;
            }
            const parsed = new URL(normalizedUrl);
            if (!["http:", "https:"].includes(parsed.protocol)) {
                throw new Error("只支持 HTTP 或 HTTPS 地址");
            }

            const name = appName.trim() || parsed.hostname;
            const groupId = appGroupId ? appGroupId : null;

            if (
                !editingApp &&
                existingApps.some((app) => app.url === parsed.href) &&
                !globalThis.confirm("该网站已存在，仍要继续添加吗？")
            ) {
                setIsSubmitting(false);
                return;
            }

            let nextIconAssetId = appIconAssetId;
            let nextIconSource = appIconSource;
            let nextIconPreviewUrl = iconPreviewUrl;

            if (
                editingApp &&
                editingApp.url !== parsed.href &&
                editingApp.iconAssetId === appIconAssetId &&
                globalThis.confirm("网址已改变，是否重新获取网站图标？")
            ) {
                const found = await api<{ id: string; url: string }>(
                    "/api/webapp-icons/fetch",
                    json("POST", { url: parsed.href }),
                );
                nextIconAssetId = found.id;
                nextIconSource = "website";
                nextIconPreviewUrl = found.url;
            }

            if (editingApp) {
                const updated = await api<ExtendedWebApp>(
                    `/api/webapps/${editingApp.id}`,
                    json("PATCH", {
                        name,
                        url: parsed.href,
                        groupId,
                        iconAssetId: nextIconAssetId,
                        iconSource: nextIconSource,
                        openMode: appOpenMode,
                        isPinned: appIsPinned,
                    }),
                );
                onSaved(
                    {
                        ...editingApp,
                        ...updated,
                        iconUrl: nextIconPreviewUrl || updated.iconUrl,
                    },
                    true,
                );
            } else {
                const created = await api<ExtendedWebApp>(
                    "/api/webapps",
                    json("POST", {
                        name,
                        url: parsed.href,
                        groupId,
                        iconAssetId: nextIconAssetId,
                        iconSource: nextIconSource,
                        openMode: appOpenMode,
                        isPinned: appIsPinned,
                        sortOrder: existingApps.length,
                    }),
                );
                onSaved(
                    {
                        ...created,
                        iconUrl: nextIconPreviewUrl || created.iconUrl,
                    },
                    false,
                );
            }
            onDirtyChange?.(false);
            onClose();
        } catch (err) {
            setFormError(`保存失败：${errorMessage(err)}`);
        } finally {
            setIsSubmitting(false);
        }
    }

    // Calculated preview values
    const displayDomain = useMemo(() => {
        try {
            const raw = appUrl.trim();
            if (!raw) return "";
            const candidate = /^https?:\/\//i.test(raw)
                ? raw
                : `https://${raw}`;
            return new URL(candidate).hostname;
        } catch {
            return "";
        }
    }, [appUrl]);

    const previewName = appName.trim() || displayDomain || "未命名应用";
    const previewDomain = displayDomain || "example.com";
    const previewInitial = (previewName.slice(0, 1) || "W").toUpperCase();

    const formJsx = (
        <form onSubmit={handleSubmit} className="app-dialog-form">
            <div className="app-dialog-body">
                {formError && (
                    <p
                        role="alert"
                        className="error"
                        style={{ margin: 0 }}
                    >
                        {formError}
                    </p>
                )}

                {/* 1. 基础信息 (首要) */}
                <section className="app-dialog-section">
                    <h3 className="app-dialog-section-title">基础信息</h3>

                    {/* 网址输入与状态 */}
                    <div className="app-dialog-field">
                        <label
                            htmlFor="app-url-input"
                            className="app-dialog-field-label"
                        >
                            <span>
                                网址 (URL){" "}
                                <span className="text-red-500">*</span>
                            </span>
                        </label>
                        <Input
                            id="app-url-input"
                            required
                            type="text"
                            placeholder="https://example.com"
                            value={appUrl}
                            onChange={(e) => handleUrlChange(e.target.value)}
                            onBlur={handleUrlBlur}
                            autoFocus={!editingApp}
                            className="w-full"
                        />
                        {/* URL 状态反馈 */}
                        {urlFetchStatus === "loading" && (
                            <div className="app-dialog-url-status loading">
                                <Loader2 size={13} className="spin" />
                                <span>{urlFetchMessage}</span>
                            </div>
                        )}
                        {urlFetchStatus === "success" && (
                            <div className="app-dialog-url-status success">
                                <Check size={13} />
                                <span>{urlFetchMessage}</span>
                            </div>
                        )}
                        {urlFetchStatus === "error" && (
                            <div className="app-dialog-url-status error">
                                <span>获取失败：{urlFetchMessage}</span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRetryFetch}
                                    className="h-6 px-2 text-xs"
                                >
                                    重新获取
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* 网站名称与文件夹：桌面双列，移动端单列 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="app-dialog-field">
                            <label
                                htmlFor="app-name-input"
                                className="app-dialog-field-label"
                            >
                                网站名称
                            </label>
                            <Input
                                id="app-name-input"
                                placeholder="默认使用域名"
                                value={appName}
                                onChange={(e) => setAppName(e.target.value)}
                                className="w-full"
                            />
                        </div>

                        <div className="app-dialog-field">
                            <label
                                htmlFor="app-group-select"
                                className="app-dialog-field-label"
                            >
                                文件夹
                            </label>
                            <NativeSelect
                                id="app-group-select"
                                value={appGroupId}
                                onChange={(e) => setAppGroupId(e.target.value)}
                                className="w-full"
                            >
                                <NativeSelectOption value="">
                                    未放入文件夹
                                </NativeSelectOption>
                                {groups.map((g) => (
                                    <NativeSelectOption key={g.id} value={g.id}>
                                        {g.name}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </div>
                    </div>
                </section>

                {/* 2. 打开设置 (清晰紧凑) */}
                <section className="app-dialog-section">
                    <h3 className="app-dialog-section-title">打开设置</h3>
                    <div className="app-dialog-options-card">
                        {/* 固定在搜索首页 */}
                        <div className="app-dialog-option-row">
                            <div className="flex flex-col gap-0.5">
                                <label
                                    htmlFor="app-pin-switch"
                                    className="app-dialog-option-title cursor-pointer"
                                >
                                    固定在搜索首页
                                </label>
                                <span className="app-dialog-option-desc">
                                    在搜索框下方快速显示
                                </span>
                            </div>
                            <Switch
                                id="app-pin-switch"
                                checked={appIsPinned}
                                onCheckedChange={setAppIsPinned}
                                aria-label="固定在搜索首页"
                            />
                        </div>

                        <div className="app-dialog-option-divider" />

                        {/* 打开方式 */}
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <span className="app-dialog-option-title">
                                    打开方式
                                </span>
                                {appOpenMode === "global" && (
                                    <span className="app-dialog-option-desc">
                                        当前全局：{appearance.target ===
                                                "new_tab"
                                            ? "新标签页"
                                            : "当前标签页"}
                                    </span>
                                )}
                            </div>
                            <Tabs
                                value={appOpenMode}
                                onValueChange={(val) =>
                                    setAppOpenMode(
                                        val as "global" | "current" | "new_tab",
                                    )}
                                className="w-full"
                            >
                                <TabsList className="w-full grid grid-cols-3 h-8">
                                    <TabsTrigger
                                        value="global"
                                        className="text-xs"
                                    >
                                        跟随全局
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="new_tab"
                                        className="text-xs"
                                    >
                                        新标签页
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="current"
                                        className="text-xs"
                                    >
                                        当前标签页
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                    </div>
                </section>

                {/* 3. 图标设置 (实时预览 + 4种来源选项卡) */}
                <section className="app-dialog-section">
                    <h3 className="app-dialog-section-title">图标</h3>

                    <div className="app-dialog-icon-card">
                        {/* 实时图标预览栏 */}
                        <div className="app-dialog-preview-bar">
                            <div className="app-dialog-preview-icon">
                                {iconPreviewUrl && !imageLoadError
                                    ? (
                                        <img
                                            src={iconPreviewUrl}
                                            alt="Preview"
                                            onError={() =>
                                                setImageLoadError(true)}
                                        />
                                    )
                                    : (
                                        <span className="app-dialog-preview-fallback">
                                            {previewInitial}
                                        </span>
                                    )}
                            </div>
                            <div className="app-dialog-preview-meta">
                                <div className="flex items-center gap-1.5">
                                    <span className="app-dialog-preview-meta-title">
                                        当前图标
                                    </span>
                                    <span className="app-dialog-source-badge">
                                        {appIconSource === "website"
                                            ? "自动获取"
                                            : appIconSource === "upload"
                                            ? "本地上传"
                                            : appIconSource === "url"
                                            ? "网络图片"
                                            : appIconSource === "ai"
                                            ? "AI 生成"
                                            : "首字母"}
                                    </span>
                                </div>
                                <span
                                    className="app-dialog-preview-meta-desc"
                                    title={previewName || previewDomain}
                                >
                                    {iconPreviewUrl
                                        ? (previewName || previewDomain)
                                        : "未设置自定义图标，使用首字母占位"}
                                </span>
                            </div>
                            {iconPreviewUrl && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="app-dialog-preview-reset-btn"
                                    onClick={() => {
                                        setAppIconAssetId(null);
                                        setAppIconSource("default");
                                        setIconPreviewUrl(null);
                                        setImageLoadError(false);
                                    }}
                                >
                                    重置
                                </Button>
                            )}
                        </div>

                        {/* 图标来源模式切换 */}
                        <Tabs
                            value={iconTab}
                            onValueChange={(val) => setIconTab(
                                val as "auto" | "upload" | "url" | "ai",
                            )}
                            className="w-full"
                        >
                            <TabsList className="w-full grid grid-cols-4 h-8">
                                <TabsTrigger value="auto" className="text-xs">
                                    自动获取
                                </TabsTrigger>
                                <TabsTrigger value="upload" className="text-xs">
                                    上传图片
                                </TabsTrigger>
                                <TabsTrigger value="url" className="text-xs">
                                    网络图片
                                </TabsTrigger>
                                <TabsTrigger value="ai" className="text-xs">
                                    AI 生成
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>

                        {/* 来源子面板 */}
                        <div className="app-dialog-icon-subpanel-wrap">
                            {iconTab === "auto" && (
                                <div className="app-dialog-icon-subpanel app-dialog-icon-subpanel--auto">
                                    <span className="app-dialog-helper-text">
                                        根据填写的网址自动获取高清 Favicon
                                        或网站图标。
                                    </span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={urlFetchStatus ===
                                                "loading" || !appUrl.trim()}
                                        onClick={() => void handleRetryFetch()}
                                        className="h-7 text-xs gap-1.5 flex-shrink-0"
                                    >
                                        {urlFetchStatus === "loading"
                                            ? (
                                                <Loader2
                                                    size={12}
                                                    className="spin"
                                                />
                                            )
                                            : <RefreshCw size={12} />}
                                        <span>
                                            {urlFetchStatus === "loading"
                                                ? "正在抓取…"
                                                : "重新抓取网站图标"}
                                        </span>
                                    </Button>
                                </div>
                            )}

                            {iconTab === "upload" && (
                                <div className="app-dialog-icon-subpanel">
                                    <label className="app-upload-dropzone">
                                        <Upload
                                            size={18}
                                            className="app-upload-icon"
                                        />
                                        <span className="app-upload-text">
                                            {isUploadingIcon
                                                ? "正在上传…"
                                                : "点击或拖拽上传本地图片"}
                                        </span>
                                        <span className="app-upload-hint">
                                            支持
                                            PNG、JPEG、WebP、AVIF、SVG、ICO，文件小于
                                            5MB
                                        </span>
                                        <input
                                            type="file"
                                            accept="image/png, image/jpeg, image/webp, image/avif, image/svg+xml, image/x-icon"
                                            hidden
                                            disabled={isUploadingIcon}
                                            onChange={(e) =>
                                                void handleFileUpload(e)}
                                        />
                                    </label>
                                </div>
                            )}

                            {iconTab === "url" && (
                                <div className="app-dialog-icon-subpanel">
                                    <div className="app-input-with-button">
                                        <Input
                                            type="url"
                                            placeholder="https://example.com/icon.png"
                                            value={iconImageUrl}
                                            onChange={(e) =>
                                                setIconImageUrl(e.target.value)}
                                            className="h-8 text-xs"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={!iconImageUrl.trim() ||
                                                isFetchingUrlIcon}
                                            onClick={() =>
                                                void handleUseImageUrl()}
                                            className="h-8 text-xs flex-shrink-0"
                                        >
                                            {isFetchingUrlIcon
                                                ? "提取中…"
                                                : "使用图片"}
                                        </Button>
                                    </div>
                                    <p className="app-dialog-helper-text">
                                        支持公开可直接访问的 PNG、JPG、SVG 或
                                        WebP 图片链接。
                                    </p>
                                </div>
                            )}

                            {iconTab === "ai" && (
                                <LogoCandidatePicker
                                    siteName={appName.trim() || siteDomain ||
                                        ""}
                                    siteDomain={siteDomain}
                                    onSelect={(asset) => {
                                        setAppIconAssetId(asset.id);
                                        setAppIconSource("ai");
                                        setIconPreviewUrl(asset.url);
                                        setImageLoadError(false);
                                    }}
                                    onError={(err) => setFormError(err)}
                                    onClose={onClose}
                                />
                            )}
                        </div>
                    </div>
                </section>
            </div>

            {/* 底部固定操作栏 */}
            <div className="app-dialog-footer">
                <Button
                    variant="outline"
                    type="button"
                    disabled={isSubmitting}
                    onClick={onClose}
                >
                    取消
                </Button>
                <Button
                    variant="default"
                    type="submit"
                    disabled={isSubmitting || !appUrl.trim()}
                >
                    {isSubmitting
                        ? "保存中…"
                        : editingApp
                        ? "保存更新"
                        : "添加网站"}
                </Button>
            </div>
        </form>
    );

    return <div className="app-panel-form-container">{formJsx}</div>;
}
