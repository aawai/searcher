import { useEffect, useMemo, useRef, useState } from "react";
import type {
    AiModelDto,
    AiProviderDto,
    ImageProtocol,
    LogoStyle,
} from "../../../../src/features/ai/types.ts";
import {
    buildIconPrompt,
    BUILTIN_ICON_STYLES,
    DEFAULT_ICON_STYLE_ID,
    ICON_CANDIDATE_COUNT_DEFAULT,
    type IconGenerationPreferences,
    resolveIconStyle,
} from "../../../../src/shared/icon-prompts.ts";
import type { PreferencesDto } from "../../../../src/shared/contracts.ts";
import { type api, json } from "../../lib/api.ts";

interface Candidate {
    dataUrl: string;
    style: LogoStyle;
}

export interface StyleOption {
    id: string;
    label: string;
    prompt: string;
    isCustom: boolean;
}

export interface ReferenceIconInfo {
    assetId: string;
    previewUrl: string;
}

interface ConfirmedRequestSnapshot {
    providerId: string;
    providerName: string;
    baseUrl: string;
    modelId: string;
    imageProtocol: ImageProtocol;
    modelDisplayName: string;
    style: LogoStyle;
    styleLabel: string;
    count: 1 | 2 | 3;
    siteName: string;
    siteDomain?: string;
    description?: string;
    referenceIcon?: ReferenceIconInfo | null;
    finalPrompt: string;
    isPromptCustomized: boolean;
    customPrompt?: string;
}

export interface LogoSessionOptions {
    sessionKey: string;
    enabled: boolean;
    readonly iconEpoch: number;
    request: typeof api;
    siteName: string;
    siteDomain?: string;
    currentIconAssetId?: string | null;
    currentIconPreviewUrl?: string | null;
    currentIconSource?: "website" | "upload" | "url" | "ai" | "default";
    onSelect: (asset: { id: string; url: string }) => void;
    onError: (message: string) => void;
    onClose: () => void;
}

export function useLogoSession(options: LogoSessionOptions) {
    const {
        sessionKey,
        enabled,
        siteName,
        siteDomain,
        currentIconAssetId,
        currentIconPreviewUrl,
        currentIconSource,
        onError,
        onClose,
        request,
    } = options;
    const latest = useRef(options);
    latest.current = options;
    const alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);
    function isCurrent(key: string) {
        return alive.current && Boolean(key) &&
            latest.current.sessionKey === key;
    }

    const [loadingModels, setLoadingModels] = useState(true);
    const [models, setModels] = useState<AiModelDto[]>([]);
    const [providers, setProviders] = useState<AiProviderDto[]>([]);
    const [iconPrefs, setIconPrefs] = useState<IconGenerationPreferences>({});
    const [selectedId, setSelectedId] = useState("");
    const [style, setStyle] = useState<LogoStyle>(DEFAULT_ICON_STYLE_ID);
    const [count, setCount] = useState<1 | 2 | 3>(ICON_CANDIDATE_COUNT_DEFAULT);
    const [imageProtocol, setImageProtocol] = useState<ImageProtocol>("openai");
    const [description, setDescription] = useState("");
    const [referenceIcon, setReferenceIcon] = useState<
        ReferenceIconInfo | null
    >(null);
    const [useReferenceIcon, setUseReferenceIcon] = useState(true);
    const [customPrompt, setCustomPrompt] = useState<string | null>(null);
    const [promptExpanded, setPromptExpanded] = useState(false);

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmSnapshot, setConfirmSnapshot] = useState<
        ConfirmedRequestSnapshot | null
    >(null);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<
        number | null
    >(null);
    const [busy, setBusy] = useState(false);
    const loadedKey = useRef("");
    const busyRun = useRef<
        { key: string; version: number; iconEpoch: number } | null
    >(null);
    const operationVersion = useRef(0);
    const initialModelId = useRef("");
    const initialStyle = useRef<string>(DEFAULT_ICON_STYLE_ID);
    const initialCount = useRef<1 | 2 | 3>(ICON_CANDIDATE_COUNT_DEFAULT);
    const initialProtocol = useRef<ImageProtocol>("openai");

    const [initializedKey, setInitializedKey] = useState<string | null>(null);
    if (initializedKey !== sessionKey) {
        setInitializedKey(sessionKey);
        busyRun.current = null;
        operationVersion.current++;
        initialModelId.current = "";
        initialStyle.current = DEFAULT_ICON_STYLE_ID;
        initialCount.current = ICON_CANDIDATE_COUNT_DEFAULT;
        initialProtocol.current = "openai";
        setModels([]);
        setProviders([]);
        setIconPrefs({});
        setLoadingModels(true);
        setSelectedId("");
        setStyle(DEFAULT_ICON_STYLE_ID);
        setCount(ICON_CANDIDATE_COUNT_DEFAULT);
        setImageProtocol("openai");
        setDescription("");
        setReferenceIcon(
            currentIconAssetId && currentIconPreviewUrl
                ? {
                    assetId: currentIconAssetId,
                    previewUrl: currentIconPreviewUrl,
                }
                : null,
        );
        setUseReferenceIcon(true);
        setCustomPrompt(null);
        setPromptExpanded(false);
        setConfirmOpen(false);
        setConfirmSnapshot(null);
        setCandidates([]);
        setSelectedCandidateIndex(null);
        setBusy(false);
    }

    // Keep reference icon synced with non-AI icon updates (e.g. website fetch or upload),
    // while preserving the original reference icon when the user applies an AI result.
    useEffect(() => {
        if (!currentIconAssetId || !currentIconPreviewUrl) {
            if (currentIconSource === "default") {
                setReferenceIcon(null);
            }
            return;
        }
        if (currentIconSource !== "ai") {
            setReferenceIcon({
                assetId: currentIconAssetId,
                previewUrl: currentIconPreviewUrl,
            });
        } else if (!referenceIcon) {
            setReferenceIcon({
                assetId: currentIconAssetId,
                previewUrl: currentIconPreviewUrl,
            });
        }
    }, [currentIconAssetId, currentIconPreviewUrl, currentIconSource]);

    useEffect(() => {
        if (!enabled || !sessionKey || loadedKey.current === sessionKey) return;
        loadedKey.current = sessionKey;
        setLoadingModels(true);
        void Promise.all([
            request<AiModelDto[]>("/api/ai/models"),
            request<AiProviderDto[]>("/api/ai/providers"),
            request<PreferencesDto>("/api/preferences").catch(() => null),
        ]).then(([items, availableProviders, prefs]) => {
            if (!isCurrent(sessionKey)) return;
            setProviders(availableProviders);
            const available = items.filter((item) =>
                item.enabled && item.visibleToUsers &&
                item.providerEnabled !== false
            );
            setModels(available);
            initialModelId.current = available[0]?.id || "";
            setSelectedId((current) => current || available[0]?.id || "");

            const ig = prefs?.aiGenerationDefaults?.iconGeneration ?? {};
            setIconPrefs(ig);
            const resolvedDefault = resolveIconStyle(
                ig.defaultStyle,
                ig.customStyles,
            );
            const nextStyle = resolvedDefault?.id ?? DEFAULT_ICON_STYLE_ID;
            const nextCount = ig.defaultCount ?? ICON_CANDIDATE_COUNT_DEFAULT;
            const nextProtocol = ig.defaultProtocol ?? "openai";
            initialStyle.current = nextStyle;
            initialCount.current = nextCount;
            initialProtocol.current = nextProtocol;
            setStyle(nextStyle);
            setCount(nextCount);
            setImageProtocol(nextProtocol);
        }).catch((error) => {
            if (isCurrent(sessionKey) && latest.current.enabled) {
                latest.current.onError(String(error));
            }
        }).finally(() => {
            if (isCurrent(sessionKey)) setLoadingModels(false);
        });
    }, [sessionKey, enabled, request]);

    const styleOptions: StyleOption[] = useMemo(() => [
        ...BUILTIN_ICON_STYLES.map((item) => ({
            id: item.id,
            label: item.label,
            prompt: item.prompt,
            isCustom: false,
        })),
        ...(iconPrefs.customStyles ?? []).map((item) => ({
            id: item.id,
            label: `${item.name}（自定义）`,
            prompt: item.prompt,
            isCustom: true,
        })),
    ], [iconPrefs.customStyles]);

    const resolvedStyle = useMemo(
        () =>
            resolveIconStyle(style, iconPrefs.customStyles) ??
                resolveIconStyle(DEFAULT_ICON_STYLE_ID)!,
        [style, iconPrefs.customStyles],
    );

    const effectiveReference = useReferenceIcon && referenceIcon
        ? referenceIcon
        : null;

    const autoPrompt = useMemo(() => {
        const name = siteName.trim().slice(0, 100) || "App";
        const domain = siteDomain?.trim().slice(0, 253) || undefined;
        const desc = description.trim().slice(0, 300) || undefined;
        const hasRef = Boolean(effectiveReference);
        return buildIconPrompt({
            siteName: name,
            siteDomain: domain,
            description: desc,
            stylePrompt: resolvedStyle.prompt,
            hasReference: hasRef,
            template: hasRef
                ? iconPrefs.referenceTemplate
                : iconPrefs.textTemplate,
            candidateIndex: 1,
            candidateCount: count,
        });
    }, [
        siteName,
        siteDomain,
        description,
        resolvedStyle.prompt,
        effectiveReference,
        iconPrefs.referenceTemplate,
        iconPrefs.textTemplate,
        count,
    ]);

    const isPromptCustomized = customPrompt !== null;
    const effectivePrompt = customPrompt !== null ? customPrompt : autoPrompt;

    function promptGenerateConfirm() {
        const model = models.find((item) => item.id === selectedId);
        if (!model) return;
        const name = siteName.trim().slice(0, 100);
        if (!name) {
            onError("请先填写应用名称或网址");
            return;
        }
        if (isPromptCustomized && !customPrompt.trim()) {
            onError("自定义提示词不能为空");
            return;
        }
        const provider = providers.find((item) => item.id === model.providerId);
        if (!provider) {
            onError("所选模型的服务商不可用，请选择其他模型");
            return;
        }

        const trimmedDomain = siteDomain?.trim().slice(0, 253);
        const finalDomain = trimmedDomain ? trimmedDomain : undefined;

        const trimmedDesc = description.trim().slice(0, 300);
        const finalDesc = trimmedDesc ? trimmedDesc : undefined;

        const snapshot: ConfirmedRequestSnapshot = {
            providerId: model.providerId,
            providerName: provider.name,
            baseUrl: provider.baseUrl,
            modelId: model.modelId,
            imageProtocol,
            modelDisplayName: model.displayName || model.modelId,
            style: resolvedStyle.id,
            styleLabel: resolvedStyle.label,
            count,
            siteName: name,
            siteDomain: finalDomain,
            description: finalDesc,
            referenceIcon: effectiveReference,
            finalPrompt: effectivePrompt.trim(),
            isPromptCustomized,
            customPrompt: isPromptCustomized ? customPrompt.trim() : undefined,
        };

        setConfirmSnapshot(snapshot);
        setConfirmOpen(true);
    }

    async function executeGenerate(snapshot: ConfirmedRequestSnapshot) {
        const key = sessionKey;
        if (busyRun.current || !isCurrent(key)) return;
        const operation = {
            key,
            version: ++operationVersion.current,
            iconEpoch: latest.current.iconEpoch,
        };
        busyRun.current = operation;
        setBusy(true);
        setCandidates([]);
        setSelectedCandidateIndex(null);
        try {
            const body: {
                providerId: string;
                modelId: string;
                imageProtocol: ImageProtocol;
                siteName: string;
                style: LogoStyle;
                count: number;
                siteDomain?: string;
                description?: string;
                referenceIconAssetId?: string;
                customPrompt?: string;
            } = {
                providerId: snapshot.providerId,
                modelId: snapshot.modelId,
                imageProtocol: snapshot.imageProtocol,
                siteName: snapshot.siteName,
                style: snapshot.style,
                count: snapshot.count,
            };
            if (snapshot.siteDomain) {
                body.siteDomain = snapshot.siteDomain;
            }
            if (snapshot.description) {
                body.description = snapshot.description;
            }
            if (snapshot.referenceIcon?.assetId) {
                body.referenceIconAssetId = snapshot.referenceIcon.assetId;
            }
            if (snapshot.customPrompt) {
                body.customPrompt = snapshot.customPrompt;
            }

            const result = await request<{ images: Candidate[] }>(
                "/api/ai/logo-candidates",
                json("POST", body),
            );
            if (!isCurrent(key) || busyRun.current !== operation) return;
            setCandidates(result.images);
        } catch (error) {
            if (
                !isCurrent(key) || busyRun.current !== operation ||
                latest.current.iconEpoch !== operation.iconEpoch ||
                !latest.current.enabled
            ) return;
            onError(error instanceof Error ? error.message : String(error));
        } finally {
            if (busyRun.current === operation) {
                busyRun.current = null;
                if (isCurrent(key)) setBusy(false);
            }
        }
    }

    async function choose(candidate: Candidate, index: number) {
        const key = sessionKey;
        if (busyRun.current || !isCurrent(key)) return;
        const operation = {
            key,
            version: ++operationVersion.current,
            iconEpoch: latest.current.iconEpoch,
        };
        busyRun.current = operation;
        setBusy(true);
        setSelectedCandidateIndex(index);
        try {
            const blob = await (await fetch(candidate.dataUrl)).blob();
            if (
                !isCurrent(key) || busyRun.current !== operation ||
                latest.current.iconEpoch !== operation.iconEpoch ||
                !latest.current.enabled
            ) return;
            const form = new FormData();
            form.append("icon", blob, "generated-icon.webp");
            form.append("fullBleed", "1");
            const asset = await request<{ id: string; url: string }>(
                "/api/webapp-icons/upload",
                { method: "POST", body: form },
            );
            if (
                !isCurrent(key) || busyRun.current !== operation ||
                latest.current.iconEpoch !== operation.iconEpoch ||
                !latest.current.enabled
            ) return;
            latest.current.onSelect(asset);
        } catch (error) {
            if (
                !isCurrent(key) || busyRun.current !== operation ||
                latest.current.iconEpoch !== operation.iconEpoch
            ) return;
            onError(error instanceof Error ? error.message : String(error));
            setSelectedCandidateIndex(null);
        } finally {
            if (busyRun.current === operation) {
                busyRun.current = null;
                if (isCurrent(key)) setBusy(false);
            }
        }
    }

    return {
        loadingModels,
        models,
        providers,
        selectedId,
        style,
        styleOptions,
        count,
        imageProtocol,
        description,
        referenceIcon,
        useReferenceIcon,
        effectiveReference,
        effectivePrompt,
        isPromptCustomized,
        promptExpanded,
        confirmOpen,
        confirmSnapshot,
        candidates,
        selectedCandidateIndex,
        busy,
        hasDraft: Boolean(description.trim()) ||
            isPromptCustomized ||
            selectedId !== initialModelId.current ||
            style !== initialStyle.current ||
            count !== initialCount.current ||
            imageProtocol !== initialProtocol.current ||
            candidates.length > 0 ||
            busy,
        setSelectedId,
        setStyle,
        setCount,
        setImageProtocol,
        setDescription,
        setUseReferenceIcon,
        setCustomPrompt,
        setPromptExpanded,
        setConfirmOpen,
        setConfirmSnapshot,
        setCandidates,
        setSelectedCandidateIndex,
        promptGenerateConfirm,
        executeGenerate,
        choose,
        siteName,
        onClose,
    };
}

export type LogoSession = ReturnType<typeof useLogoSession>;
