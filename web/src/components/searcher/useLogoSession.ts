import { useEffect, useRef, useState } from "react";
import type {
    AiModelDto,
    AiProviderDto,
    ImageProtocol,
    LogoStyle,
} from "../../../../src/features/ai/types.ts";
import { type api, json } from "../../lib/api.ts";
interface Candidate {
    dataUrl: string;
    style: LogoStyle;
}

export const LOGO_STYLE_LABELS: Record<LogoStyle, string> = {
    minimal: "极简",
    geometric: "几何",
    glyph: "符号",
    monoline: "线性",
    duotone: "双色",
    gradient: "柔和渐变",
    soft3d: "柔和3D",
    mascot: "图形角色",
};

interface ConfirmedRequestSnapshot {
    providerId: string;
    providerName: string;
    baseUrl: string;
    modelId: string;
    imageProtocol: ImageProtocol;
    modelDisplayName: string;
    style: LogoStyle;
    styleLabel: string;
    siteName: string;
    siteDomain?: string;
    description?: string;
}

export interface LogoSessionOptions {
    sessionKey: string;
    enabled: boolean;
    readonly iconEpoch: number;
    request: typeof api;
    siteName: string;
    siteDomain?: string;
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
    const [selectedId, setSelectedId] = useState("");
    const [style, setStyle] = useState<LogoStyle>("minimal");
    const [imageProtocol, setImageProtocol] = useState<ImageProtocol>("openai");
    const [description, setDescription] = useState("");
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

    const [initializedKey, setInitializedKey] = useState<string | null>(null);
    if (initializedKey !== sessionKey) {
        setInitializedKey(sessionKey);
        busyRun.current = null;
        operationVersion.current++;
        initialModelId.current = "";
        setModels([]);
        setProviders([]);
        setLoadingModels(true);
        setSelectedId("");
        setStyle("minimal");
        setImageProtocol("openai");
        setDescription("");
        setConfirmOpen(false);
        setConfirmSnapshot(null);
        setCandidates([]);
        setSelectedCandidateIndex(null);
        setBusy(false);
    }

    useEffect(() => {
        if (!enabled || !sessionKey || loadedKey.current === sessionKey) return;
        loadedKey.current = sessionKey;
        setLoadingModels(true);
        void Promise.all([
            request<AiModelDto[]>("/api/ai/models"),
            request<AiProviderDto[]>("/api/ai/providers"),
        ]).then(([items, availableProviders]) => {
            if (!isCurrent(sessionKey)) return;
            setProviders(availableProviders);
            const available = items.filter((item) =>
                item.enabled && item.visibleToUsers
            );
            setModels(available);
            initialModelId.current = available[0]?.id || "";
            setSelectedId((current) => current || available[0]?.id || "");
        }).catch((error) => {
            if (isCurrent(sessionKey) && latest.current.enabled) {
                latest.current.onError(String(error));
            }
        }).finally(() => {
            if (isCurrent(sessionKey)) setLoadingModels(false);
        });
    }, [sessionKey, enabled, request]);

    function promptGenerateConfirm() {
        const model = models.find((item) => item.id === selectedId);
        if (!model) return;
        const name = siteName.trim().slice(0, 100);
        if (!name) {
            onError("请先填写应用名称或网址");
            return;
        }
        const provider = providers.find((item) => item.id === model.providerId);
        if (!provider) {
            onError("所选模型的 Provider 不可用");
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
            style,
            styleLabel: LOGO_STYLE_LABELS[style] ?? style,
            siteName: name,
            siteDomain: finalDomain,
            description: finalDesc,
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
                siteDomain?: string;
                description?: string;
            } = {
                providerId: snapshot.providerId,
                modelId: snapshot.modelId,
                imageProtocol: snapshot.imageProtocol,
                siteName: snapshot.siteName,
                style: snapshot.style,
            };
            if (snapshot.siteDomain) {
                body.siteDomain = snapshot.siteDomain;
            }
            if (snapshot.description) {
                body.description = snapshot.description;
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
            form.append("icon", blob, "generated-icon.png");
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
        imageProtocol,
        description,
        confirmOpen,
        confirmSnapshot,
        candidates,
        selectedCandidateIndex,
        busy,
        hasDraft: Boolean(description.trim()) ||
            selectedId !== initialModelId.current ||
            style !== "minimal" || imageProtocol !== "openai" ||
            candidates.length > 0 || busy,
        setSelectedId,
        setStyle,
        setImageProtocol,
        setDescription,
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
