import { nextAppSortOrder } from "../../features/app-library/library-order.ts";
import {
    type ChangeEvent,
    type FormEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { api, json } from "../../lib/api.ts";
import { errorMessage } from "../../app/state.tsx";
import type { Appearance } from "../../app/state.tsx";
import type {
    ExtendedWebApp,
    WebAppGroup,
} from "../../features/app-library/library-types.ts";
import { useLogoSession } from "./useLogoSession.ts";

export interface AppSessionOptions {
    sessionKey: string;
    editingApp: ExtendedWebApp | null;
    defaultGroupId: string;
    /** A new app starts pinned to home from every create entry. */
    defaultHomeFixed: boolean;
    groups: WebAppGroup[];
    appearance: Appearance;
    existingApps: ExtendedWebApp[];
    expandIcon?: boolean;
    onSaved: (app: ExtendedWebApp, isEdit: boolean) => void;
    onClose: () => void;
}

interface IconOperation {
    revision: number;
    version: number;
    controller: AbortController;
}

export function useAppSession(options: AppSessionOptions) {
    const { sessionKey, groups, appearance, existingApps, expandIcon = false } =
        options;
    const entry = useRef({
        key: sessionKey,
        revision: 0,
        app: options.editingApp,
        group: options.defaultGroupId,
    });
    if (entry.current.key !== sessionKey) {
        entry.current = {
            key: sessionKey,
            revision: entry.current.revision + 1,
            app: options.editingApp,
            group: options.defaultGroupId,
        };
    }
    const editingApp = entry.current.app;
    const defaultGroupId = entry.current.group;
    const latest = useRef(options);
    latest.current = options;
    const alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);
    function isCurrent(revision: number) {
        return alive.current && entry.current.revision === revision &&
            Boolean(latest.current.sessionKey);
    }
    const controllers = useMemo(() => new Set<AbortController>(), [sessionKey]);
    const request = useCallback(async <T>(
        path: string,
        init: RequestInit = {},
        controller = new AbortController(),
    ): Promise<T> => {
        controllers.add(controller);
        try {
            return await api<T>(path, { ...init, signal: controller.signal });
        } finally {
            controllers.delete(controller);
        }
    }, [controllers]);
    useEffect(() => () => {
        for (const controller of controllers) controller.abort();
        controllers.clear();
    }, [controllers]);
    // Form fields
    const [iconExpanded, setIconExpanded] = useState(false);
    const [iconError, setIconError] = useState("");
    const [urlValidationError, setUrlValidationError] = useState("");
    const [appUrl, setAppUrl] = useState("");
    const [appName, setAppName] = useState("");
    const [appGroupId, setAppGroupId] = useState("");
    const [appHomeFixed, setAppHomeFixed] = useState(false);
    const [appOpenMode, setAppOpenMode] = useState<
        "global" | "current" | "new_tab"
    >("global");

    // Icon fields
    const [iconTab, setIconTabState] = useState<
        "auto" | "upload" | "url" | "ai"
    >(
        "auto",
    );
    const [appIconAssetId, setAppIconAssetId] = useState<string | null>(null);
    const [appIconSource, setAppIconSource] = useState<
        "website" | "upload" | "url" | "ai" | "default"
    >("website");
    const [iconPreviewUrl, setIconPreviewUrl] = useState<string | null>(null);
    const [iconImageUrl, setIconImageUrlState] = useState("");
    const [imageLoadError, setImageLoadError] = useState(false);

    // Operation / UI states
    const [urlFetchStatus, setUrlFetchStatus] = useState<
        "idle" | "loading" | "success" | "error"
    >("idle");
    const [urlFetchMessage, setUrlFetchMessage] = useState("");
    const [formError, setFormError] = useState("");
    const [, setIsSubmitting] = useState(false);
    const [isUploadingIcon, setIsUploadingIcon] = useState(false);
    const [isFetchingUrlIcon, setIsFetchingUrlIcon] = useState(false);

    const [confirmDialog, setConfirmDialog] = useState<
        | {
            type: "duplicate";
            parsedHref: string;
        }
        | {
            type: "icon_update";
            parsedHref: string;
        }
        | null
    >(null);
    const lastConfirmTypeRef = useRef<"duplicate" | "icon_update">("duplicate");
    if (confirmDialog) {
        lastConfirmTypeRef.current = confirmDialog.type;
    }
    const activeConfirmType = confirmDialog?.type ?? lastConfirmTypeRef.current;
    const submitTriggerRef = useRef<HTMLElement | null>(null);
    const lastFetchedUrlRef = useRef("");
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );

    const latestFields = useRef({ appUrl, appName, iconTab });
    latestFields.current = { appUrl, appName, iconTab };
    const urlRevision = useRef(0);
    const iconRevision = useRef(0);
    const urlPending = useRef<
        { url: string; revision: number; controller: AbortController } | null
    >(null);
    const uploadPending = useRef<IconOperation | null>(null);
    const imagePending = useRef<IconOperation | null>(null);
    const savePending = useRef<number | null>(null);

    function setIconTab(tab: typeof iconTab) {
        if (tab !== iconTab) {
            iconRevision.current++;
            uploadPending.current?.controller.abort();
            imagePending.current?.controller.abort();
            uploadPending.current = null;
            imagePending.current = null;
            setIsUploadingIcon(false);
            setIsFetchingUrlIcon(false);
        }
        setIconTabState(tab);
    }
    function isCurrentIcon(operation: IconOperation) {
        return isCurrent(operation.revision) &&
            iconRevision.current === operation.version;
    }
    function setIconImageUrl(value: string) {
        if (value !== iconImageUrl) {
            iconRevision.current++;
            imagePending.current?.controller.abort();
            imagePending.current = null;
            setIsFetchingUrlIcon(false);
        }
        setIconImageUrlState(value);
    }

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

    // Only a domain session transition initializes the draft.
    const [initializedKey, setInitializedKey] = useState<string | null>(null);
    if (initializedKey !== sessionKey) {
        setInitializedKey(sessionKey);
        iconRevision.current++;
        urlPending.current = null;
        uploadPending.current = null;
        imagePending.current = null;
        savePending.current = null;

        setFormError("");
        setUrlValidationError("");
        setIconError("");
        setIconExpanded(expandIcon);
        setIsSubmitting(false);
        setIsUploadingIcon(false);
        setIsFetchingUrlIcon(false);
        setConfirmDialog(null);
        setImageLoadError(false);

        if (editingApp) {
            setAppUrl(editingApp.url);
            setAppName(editingApp.name);
            setAppGroupId(editingApp.groupId || "");
            setAppHomeFixed(Boolean(editingApp.isHomeFixed));
            setAppOpenMode(editingApp.openMode ?? "global");
            setAppIconAssetId(editingApp.iconAssetId || null);
            setAppIconSource(editingApp.iconSource || "website");
            setIconPreviewUrl(
                editingApp.iconUrl ||
                    (editingApp.iconAssetId
                        ? `/api/webapp-icons/${editingApp.iconAssetId}`
                        : null),
            );
            setIconImageUrlState("");
            lastFetchedUrlRef.current = editingApp.url;
            setUrlFetchStatus("idle");
            setUrlFetchMessage("");
            setIconTabState(
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
            setAppHomeFixed(options.defaultHomeFixed);
            setAppOpenMode("global");
            setAppIconAssetId(null);
            setAppIconSource("website");
            setIconPreviewUrl(null);
            setIconImageUrlState("");
            lastFetchedUrlRef.current = "";
            setUrlFetchStatus("idle");
            setUrlFetchMessage("");
            setIconTabState("auto");
        }
    }

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            clearTimeout(debounceTimerRef.current);
        };
    }, [sessionKey]);
    const isDirty = useMemo(() => {
        if (editingApp) {
            return (
                appUrl !== editingApp.url ||
                appName !== editingApp.name ||
                appGroupId !== (editingApp.groupId || "") ||
                appOpenMode !== (editingApp.openMode ?? "global") ||
                appIconAssetId !== (editingApp.iconAssetId || null) ||
                appIconSource !== (editingApp.iconSource || "website") ||
                Boolean(iconImageUrl)
            );
        }
        return (
            Boolean(appUrl.trim()) ||
            Boolean(appName.trim()) ||
            appGroupId !== defaultGroupId ||
            appHomeFixed !== options.defaultHomeFixed ||
            appOpenMode !== "global" ||
            appIconAssetId !== null ||
            Boolean(iconImageUrl)
        );
    }, [
        editingApp,
        appUrl,
        appName,
        appGroupId,
        appOpenMode,
        appIconAssetId,
        appIconSource,
        iconImageUrl,
        defaultGroupId,
        appHomeFixed,
        options.defaultHomeFixed,
    ]);

    // Perform URL detection
    async function doDetectUrl(targetUrl: string) {
        const operationKey = entry.current.revision;
        if (
            urlPending.current?.url === targetUrl &&
            urlPending.current.revision === operationKey
        ) return;
        urlPending.current?.controller.abort();
        const pending = {
            url: targetUrl,
            revision: operationKey,
            controller: new AbortController(),
        };
        urlPending.current = pending;
        const iconVersion = iconRevision.current;
        const requestRevision = ++urlRevision.current;
        setUrlFetchStatus("loading");
        setUrlFetchMessage("正在获取网站信息…");
        lastFetchedUrlRef.current = targetUrl;
        try {
            const found = await request<
                { id: string; url: string; siteName: string | null }
            >(
                "/api/webapp-icons/fetch",
                json("POST", { url: targetUrl }),
                pending.controller,
            );
            if (
                !isCurrent(operationKey) ||
                urlRevision.current !== requestRevision ||
                normalizeUrl(latestFields.current.appUrl) !== targetUrl
            ) return;
            if (
                latestFields.current.iconTab === "auto" &&
                iconRevision.current === iconVersion
            ) {
                setAppIconAssetId(found.id);
                setAppIconSource("website");
                setIconPreviewUrl(found.url);
                setImageLoadError(false);
            }
            if (!latestFields.current.appName.trim() && found.siteName) {
                setAppName(found.siteName);
            }
            setUrlFetchStatus("success");
            setUrlFetchMessage(
                found.siteName
                    ? "已获取应用名称和网站图标"
                    : "已获取网站图标，名称可手动填写",
            );
        } catch (cause) {
            if (
                !isCurrent(operationKey) ||
                urlRevision.current !== requestRevision ||
                normalizeUrl(latestFields.current.appUrl) !== targetUrl
            ) return;
            console.error("Application metadata detection failed", cause);
            setUrlFetchStatus("error");
            setUrlFetchMessage(
                editingApp
                    ? "未能自动获取应用名称和图标，已保留原名称和图标，可继续保存。"
                    : "未能自动获取应用名称和图标，可手动填写名称后继续添加。",
            );
        } finally {
            if (urlPending.current === pending) urlPending.current = null;
        }
    }

    // Handle URL input changes with debounce
    function handleUrlChange(val: string) {
        setAppUrl(val);
        setFormError("");
        setUrlValidationError("");
        const normalized = normalizeUrl(val);
        if (normalized && normalized === normalizeUrl(appUrl)) return;
        if (urlPending.current) {
            urlPending.current.controller.abort();
            if (lastFetchedUrlRef.current === urlPending.current.url) {
                lastFetchedUrlRef.current = "";
            }
            urlPending.current = null;
        }
        urlRevision.current++;
        setUrlFetchStatus("idle");
        setUrlFetchMessage("");

        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = undefined;

        if (normalized && normalized !== lastFetchedUrlRef.current) {
            const scheduledRevision = entry.current.revision;
            debounceTimerRef.current = setTimeout(() => {
                if (isCurrent(scheduledRevision)) void doDetectUrl(normalized);
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
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = undefined;
        const normalized = normalizeUrl(appUrl);
        if (normalized) {
            void doDetectUrl(normalized);
        } else {
            setUrlValidationError("请先输入有效的网址");
        }
    }

    // Handle image file upload
    async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
        if (uploadPending.current) return;
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setIconError("图片文件大小不能超过 5MB");
            return;
        }
        const operation: IconOperation = {
            revision: entry.current.revision,
            version: ++iconRevision.current,
            controller: new AbortController(),
        };
        uploadPending.current = operation;
        setIsUploadingIcon(true);
        setIconError("");
        const fd = new FormData();
        fd.append("icon", file);
        try {
            const asset = await request<{ id: string; url: string }>(
                "/api/webapp-icons/upload",
                {
                    method: "POST",
                    body: fd,
                },
                operation.controller,
            );
            if (!isCurrentIcon(operation)) return;
            setAppIconAssetId(asset.id);
            setAppIconSource("upload");
            setIconPreviewUrl(asset.url);
            setImageLoadError(false);
        } catch (err) {
            if (!isCurrentIcon(operation)) return;
            setIconError(
                "上传图标出错: " +
                    (err instanceof Error ? err.message : String(err)),
            );
        } finally {
            if (uploadPending.current === operation) {
                uploadPending.current = null;
                if (isCurrent(operation.revision)) {
                    setIsUploadingIcon(false);
                    e.target.value = "";
                }
            }
        }
    }

    // Handle network image URL
    async function handleUseImageUrl() {
        if (imagePending.current) return;
        const raw = iconImageUrl.trim();
        if (!raw) return;
        const operation: IconOperation = {
            revision: entry.current.revision,
            version: ++iconRevision.current,
            controller: new AbortController(),
        };
        imagePending.current = operation;
        setIsFetchingUrlIcon(true);
        setIconError("");
        try {
            const res = await request<{ id: string; url: string }>(
                "/api/webapp-icons/url",
                json("POST", { imageUrl: raw }),
                operation.controller,
            );
            if (!isCurrentIcon(operation)) return;
            setAppIconAssetId(res.id);
            setAppIconSource("url");
            setIconPreviewUrl(res.url);
            setImageLoadError(false);
        } catch (err) {
            if (!isCurrentIcon(operation)) return;
            setIconError("获取图片失败: " + errorMessage(err));
        } finally {
            if (imagePending.current === operation) {
                imagePending.current = null;
                if (isCurrent(operation.revision)) setIsFetchingUrlIcon(false);
            }
        }
    }

    // Form save
    async function executeSave(opts?: {
        overrideIconAssetId?: string | null;
        overrideIconSource?: "website" | "upload" | "url" | "ai" | "default";
        overrideIconPreviewUrl?: string | null;
    }) {
        const operationKey = entry.current.revision;
        // Persist the current draft immediately; missing icons are filled after
        // creation by the workspace queue, not by awaiting remote metadata here.
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = undefined;
        urlRevision.current++;
        urlPending.current?.controller.abort();
        urlPending.current = null;
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

        const nextIconAssetId = opts && "overrideIconAssetId" in opts
            ? opts.overrideIconAssetId
            : appIconAssetId;
        const nextIconSource = opts && "overrideIconSource" in opts
            ? opts.overrideIconSource!
            : appIconSource;
        const nextIconPreviewUrl = opts && "overrideIconPreviewUrl" in opts
            ? opts.overrideIconPreviewUrl
            : iconPreviewUrl;

        if (editingApp) {
            const updated = await request<ExtendedWebApp>(
                `/api/webapps/${editingApp.id}`,
                json("PATCH", {
                    name,
                    url: parsed.href,
                    groupId,
                    iconAssetId: nextIconAssetId,
                    iconSource: nextIconSource,
                    openMode: appOpenMode,
                }),
            );
            if (!isCurrent(operationKey)) return;
            latest.current.onSaved(
                {
                    ...editingApp,
                    ...updated,
                    iconUrl: nextIconPreviewUrl || updated.iconUrl,
                },
                true,
            );
        } else {
            const created = await request<ExtendedWebApp>(
                "/api/webapps",
                json("POST", {
                    name,
                    url: parsed.href,
                    groupId,
                    iconAssetId: nextIconAssetId,
                    iconSource: nextIconSource,
                    openMode: appOpenMode,
                    isHomeFixed: appHomeFixed,
                    sortOrder: nextAppSortOrder(
                        existingApps,
                        groups,
                        groupId || null,
                    ),
                }),
            );
            if (!isCurrent(operationKey)) return;
            latest.current.onSaved(
                {
                    ...created,
                    iconUrl: nextIconPreviewUrl || created.iconUrl,
                },
                false,
            );
        }
    }

    function handleCancelConfirm() {
        if (savePending.current !== null) return;
        setConfirmDialog(null);
        requestAnimationFrame(() => {
            submitTriggerRef.current?.focus();
        });
    }

    async function handleConfirmDuplicate() {
        const operationKey = entry.current.revision;
        if (
            !confirmDialog || confirmDialog.type !== "duplicate" ||
            savePending.current !== null
        ) {
            return;
        }
        savePending.current = operationKey;
        setIsSubmitting(true);
        setFormError("");
        try {
            await executeSave();
            if (isCurrent(operationKey)) setConfirmDialog(null);
        } catch (err) {
            if (!isCurrent(operationKey)) return;
            setFormError(`保存失败：${errorMessage(err)}`);
            setConfirmDialog(null);
        } finally {
            if (isCurrent(operationKey)) {
                savePending.current = null;
                setIsSubmitting(false);
            }
        }
    }

    async function handleConfirmIconUpdate() {
        const operationKey = entry.current.revision;
        if (
            !confirmDialog || confirmDialog.type !== "icon_update" ||
            savePending.current !== null
        ) {
            return;
        }
        savePending.current = operationKey;
        setIsSubmitting(true);
        setFormError("");
        try {
            const found = await request<{ id: string; url: string }>(
                "/api/webapp-icons/fetch",
                json("POST", { url: confirmDialog.parsedHref }),
            );
            if (!isCurrent(operationKey)) return;
            await executeSave({
                overrideIconAssetId: found.id,
                overrideIconSource: "website",
                overrideIconPreviewUrl: found.url,
            });
            if (isCurrent(operationKey)) setConfirmDialog(null);
        } catch (err) {
            if (!isCurrent(operationKey)) return;
            setFormError(`保存失败：${errorMessage(err)}`);
            setConfirmDialog(null);
        } finally {
            if (isCurrent(operationKey)) {
                savePending.current = null;
                setIsSubmitting(false);
            }
        }
    }

    async function handleSubmit(e: FormEvent) {
        const operationKey = entry.current.revision;
        e.preventDefault();
        if (savePending.current !== null) return;
        setFormError("");

        let normalizedUrl = appUrl.trim();
        if (!/^https?:\/\//i.test(normalizedUrl)) {
            normalizedUrl = "https://" + normalizedUrl;
        }
        let parsed: URL;
        try {
            parsed = new URL(normalizedUrl);
            if (!["http:", "https:"].includes(parsed.protocol)) {
                throw new Error("只支持 HTTP 或 HTTPS 地址");
            }
        } catch (err) {
            if (!isCurrent(operationKey)) return;
            setUrlValidationError(`网址无效：${errorMessage(err)}`);
            return;
        }

        submitTriggerRef.current = (document.activeElement as HTMLElement) ??
            null;

        if (
            !editingApp &&
            existingApps.some((app) => app.url === parsed.href)
        ) {
            setConfirmDialog({
                type: "duplicate",
                parsedHref: parsed.href,
            });
            return;
        }

        if (
            editingApp &&
            editingApp.url !== parsed.href &&
            editingApp.iconAssetId === appIconAssetId
        ) {
            setConfirmDialog({
                type: "icon_update",
                parsedHref: parsed.href,
            });
            return;
        }

        savePending.current = operationKey;
        setIsSubmitting(true);
        try {
            await executeSave();
        } catch (err) {
            if (!isCurrent(operationKey)) return;
            setFormError(`保存失败：${errorMessage(err)}`);
        } finally {
            if (isCurrent(operationKey)) {
                savePending.current = null;
                setIsSubmitting(false);
            }
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

    useEffect(() => {
        if (iconError) setIconExpanded(true);
    }, [iconError]);
    const logo = useLogoSession({
        sessionKey: sessionKey ? `${sessionKey}:${entry.current.revision}` : "",
        enabled: iconTab === "ai",
        get iconEpoch() {
            return iconRevision.current;
        },
        request,
        siteName: appName.trim() || siteDomain || "",
        siteDomain,
        onSelect: (asset) => {
            setAppIconAssetId(asset.id);
            setAppIconSource("ai");
            setIconPreviewUrl(asset.url);
            setImageLoadError(false);
        },
        onError: setIconError,
        onClose: () => latest.current.onClose(),
    });
    const onClose = options.onClose;
    const draftDirty = isDirty || logo.hasDraft || Boolean(iconImageUrl);
    return {
        editingApp,
        groups,
        appearance,
        appUrl,
        appName,
        appGroupId,
        appHomeFixed,
        appOpenMode,
        iconTab,
        appIconSource,
        iconPreviewUrl,
        iconImageUrl,
        imageLoadError,
        urlFetchStatus,
        urlFetchMessage,
        urlValidationError,
        formError,
        get isSubmitting() {
            return savePending.current !== null;
        },
        isUploadingIcon,
        isFetchingUrlIcon,
        confirmDialog,
        hasDialog: Boolean(confirmDialog || logo.confirmOpen),
        dismissDialog: () => {
            if (logo.confirmOpen) {
                if (!logo.busy) logo.setConfirmOpen(false);
            } else {
                handleCancelConfirm();
            }
        },
        activeConfirmType,
        siteDomain,
        previewName,
        previewDomain,
        previewInitial,
        iconExpanded,
        iconError,
        logo,
        setIconExpanded,
        setAppName,
        setAppGroupId,
        setAppHomeFixed,
        setAppOpenMode,
        setIconTab,
        setAppIconAssetId,
        setAppIconSource,
        setIconPreviewUrl,
        setImageLoadError,
        setIconImageUrl,
        setConfirmDialog,
        handleUrlChange,
        handleUrlBlur,
        handleRetryFetch,
        handleFileUpload,
        handleUseImageUrl,
        handleSubmit,
        handleCancelConfirm,
        handleConfirmDuplicate,
        handleConfirmIconUpdate,
        onClose,
        isDirty: draftDirty,
    };
}

export type AppSession = ReturnType<typeof useAppSession>;
