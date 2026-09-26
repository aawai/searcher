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
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog.tsx";
import { Switch } from "../ui/switch.tsx";
import { LogoCandidatePicker } from "./LogoCandidatePicker.tsx";
import type { ExtendedWebApp, WebAppGroup } from "../../app/SearchHome.tsx";

export interface AppFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingApp: ExtendedWebApp | null;
    groups: WebAppGroup[];
    appearance: Appearance;
    existingApps: ExtendedWebApp[];
    defaultGroupId?: string;
    onSaved: (app: ExtendedWebApp, isEdit: boolean) => void;
}

export function AppFormDialog({
    open,
    onOpenChange,
    editingApp,
    groups,
    appearance,
    existingApps,
    defaultGroupId = "",
    onSaved,
}: AppFormDialogProps) {
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
            onOpenChange(false);
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="app-dialog-panel">
                <div className="app-dialog-header">
                    <DialogTitle>
                        {editingApp ? "编辑 APP" : "添加 APP"}
                    </DialogTitle>
                </div>

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
                        {/* 1. 基础信息 */}
                        <section className="app-dialog-section">
                            <h3 className="app-dialog-section-title">
                                基础信息
                            </h3>

                            <div className="field" style={{ margin: 0 }}>
                                <label htmlFor="app-url-input">
                                    网址 (URL) *
                                </label>
                                <input
                                    id="app-url-input"
                                    required
                                    type="text"
                                    placeholder="https://example.com"
                                    value={appUrl}
                                    onChange={(e) =>
                                        handleUrlChange(e.target.value)}
                                    onBlur={handleUrlBlur}
                                    autoFocus={!editingApp}
                                    style={{ width: "100%", margin: 0 }}
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
                                            style={{
                                                height: "26px",
                                                padding: "0 8px",
                                                fontSize: "12px",
                                            }}
                                        >
                                            重新获取
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div
                                className="field"
                                style={{ margin: "10px 0 0" }}
                            >
                                <label htmlFor="app-name-input">网站名称</label>
                                <input
                                    id="app-name-input"
                                    placeholder="默认使用域名"
                                    value={appName}
                                    onChange={(e) => setAppName(e.target.value)}
                                    style={{ width: "100%", margin: 0 }}
                                />
                            </div>

                            <div
                                className="field"
                                style={{ margin: "10px 0 0" }}
                            >
                                <label htmlFor="app-group-select">文件夹</label>
                                <select
                                    id="app-group-select"
                                    value={appGroupId}
                                    onChange={(e) =>
                                        setAppGroupId(e.target.value)}
                                    style={{ width: "100%", margin: 0 }}
                                >
                                    <option value="">未放入文件夹</option>
                                    {groups.map((g) => (
                                        <option key={g.id} value={g.id}>
                                            {g.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </section>

                        {/* 2. 打开设置 */}
                        <section className="app-dialog-section">
                            <h3 className="app-dialog-section-title">
                                打开设置
                            </h3>

                            <div className="field" style={{ margin: 0 }}>
                                <label>打开方式</label>
                                <div
                                    className="app-dialog-segmented"
                                    role="radiogroup"
                                    aria-label="打开方式"
                                >
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={appOpenMode === "global"}
                                        className="app-dialog-segmented-btn"
                                        data-state={appOpenMode === "global"
                                            ? "active"
                                            : "inactive"}
                                        onClick={() => setAppOpenMode("global")}
                                    >
                                        跟随全局
                                    </button>
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={appOpenMode === "new_tab"}
                                        className="app-dialog-segmented-btn"
                                        data-state={appOpenMode === "new_tab"
                                            ? "active"
                                            : "inactive"}
                                        onClick={() =>
                                            setAppOpenMode("new_tab")}
                                    >
                                        新标签页
                                    </button>
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={appOpenMode === "current"}
                                        className="app-dialog-segmented-btn"
                                        data-state={appOpenMode === "current"
                                            ? "active"
                                            : "inactive"}
                                        onClick={() =>
                                            setAppOpenMode("current")}
                                    >
                                        当前标签页
                                    </button>
                                </div>
                                {appOpenMode === "global" && (
                                    <p
                                        className="app-dialog-helper-text"
                                        style={{ marginTop: "6px" }}
                                    >
                                        当前全局设置：{appearance.target ===
                                                "new_tab"
                                            ? "新标签页打开"
                                            : "当前标签页打开"}
                                    </p>
                                )}
                            </div>

                            {/* 固定在搜索首页 */}
                            <div
                                className="app-dialog-pin-row"
                                style={{ marginTop: "12px" }}
                            >
                                <div className="app-dialog-pin-info">
                                    <label
                                        htmlFor="app-pin-switch"
                                        className="app-dialog-pin-title"
                                    >
                                        固定在搜索首页
                                    </label>
                                    <span className="app-dialog-pin-desc">
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
                        </section>

                        {/* 3. 图标设置 */}
                        <section className="app-dialog-section">
                            <h3 className="app-dialog-section-title">图标</h3>

                            {/* 图标来源模式切换 */}
                            <div
                                className="app-dialog-segmented"
                                role="tablist"
                                aria-label="图标来源选项卡"
                            >
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={iconTab === "auto"}
                                    className="app-dialog-segmented-btn"
                                    data-state={iconTab === "auto"
                                        ? "active"
                                        : "inactive"}
                                    onClick={() => setIconTab("auto")}
                                >
                                    自动获取
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={iconTab === "upload"}
                                    className="app-dialog-segmented-btn"
                                    data-state={iconTab === "upload"
                                        ? "active"
                                        : "inactive"}
                                    onClick={() => setIconTab("upload")}
                                >
                                    上传图片
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={iconTab === "url"}
                                    className="app-dialog-segmented-btn"
                                    data-state={iconTab === "url"
                                        ? "active"
                                        : "inactive"}
                                    onClick={() => setIconTab("url")}
                                >
                                    网络图片
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={iconTab === "ai"}
                                    className="app-dialog-segmented-btn"
                                    data-state={iconTab === "ai"
                                        ? "active"
                                        : "inactive"}
                                    onClick={() => setIconTab("ai")}
                                >
                                    AI 生成
                                </button>
                            </div>

                            {/* 来源子面板 */}
                            <div className="app-dialog-icon-subpanel-wrap">
                                {iconTab === "auto" && (
                                    <div className="app-dialog-icon-subpanel">
                                        <p className="app-dialog-helper-text">
                                            根据填写的网址自动获取高清 Favicon
                                            或网站图标。
                                        </p>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={urlFetchStatus ===
                                                    "loading" || !appUrl.trim()}
                                            onClick={() =>
                                                void handleRetryFetch()}
                                            style={{ alignSelf: "flex-start" }}
                                        >
                                            {urlFetchStatus === "loading"
                                                ? (
                                                    <>
                                                        <Loader2
                                                            size={13}
                                                            className="spin"
                                                        />
                                                        <span>
                                                            正在抓取图标…
                                                        </span>
                                                    </>
                                                )
                                                : (
                                                    <>
                                                        <RefreshCw size={13} />
                                                        <span>
                                                            重新获取网站图标
                                                        </span>
                                                    </>
                                                )}
                                        </Button>
                                    </div>
                                )}

                                {iconTab === "upload" && (
                                    <div className="app-dialog-icon-subpanel">
                                        <label className="app-upload-dropzone">
                                            <Upload
                                                size={20}
                                                className="app-upload-icon"
                                            />
                                            <span className="app-upload-text">
                                                {isUploadingIcon
                                                    ? "正在上传…"
                                                    : "点击选择本地图片上传"}
                                            </span>
                                            <span className="app-upload-hint">
                                                支持 PNG / JPEG / WebP / AVIF /
                                                SVG / ICO，文件小于 5MB
                                            </span>
                                            <input
                                                type="file"
                                                accept="image/png,image/jpeg,image/webp,image/avif,image/svg+xml,image/x-icon"
                                                style={{ display: "none" }}
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
                                            <input
                                                type="url"
                                                placeholder="https://example.com/icon.png"
                                                value={iconImageUrl}
                                                onChange={(e) =>
                                                    setIconImageUrl(
                                                        e.target.value,
                                                    )}
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={!iconImageUrl
                                                    .trim() ||
                                                    isFetchingUrlIcon}
                                                onClick={() =>
                                                    void handleUseImageUrl()}
                                                style={{
                                                    flexShrink: 0,
                                                    height: "40px",
                                                }}
                                            >
                                                {isFetchingUrlIcon
                                                    ? "获取中…"
                                                    : "使用图片"}
                                            </Button>
                                        </div>
                                        <p className="app-dialog-helper-text">
                                            支持公开可直接访问的 PNG、JPG、SVG
                                            或 WebP 图片链接。
                                        </p>
                                    </div>
                                )}

                                {iconTab === "ai" && (
                                    <LogoCandidatePicker
                                        siteName={appName.trim() ||
                                            appUrl.trim()}
                                        onSelect={(asset) => {
                                            setAppIconAssetId(asset.id);
                                            setAppIconSource("ai");
                                            setIconPreviewUrl(asset.url);
                                            setImageLoadError(false);
                                        }}
                                        onError={(err) => setFormError(err)}
                                        onClose={() => onOpenChange(false)}
                                    />
                                )}
                            </div>

                            {/* 实时图标 / APP 预览 */}
                            <div className="app-dialog-preview-wrapper">
                                <span className="app-dialog-preview-label">
                                    当前图标预览
                                </span>
                                <div className="app-dialog-preview-card">
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
                                    <div className="app-dialog-preview-text">
                                        <span
                                            className="app-dialog-preview-name"
                                            title={previewName}
                                        >
                                            {previewName}
                                        </span>
                                        <span
                                            className="app-dialog-preview-domain"
                                            title={previewDomain}
                                        >
                                            {previewDomain}
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
                                            重置图标
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                    {/* 底部固定操作栏 (Sticky footer) */}
                    <div className="app-dialog-footer">
                        <Button
                            variant="outline"
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => onOpenChange(false)}
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
                                : "添加 APP"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
