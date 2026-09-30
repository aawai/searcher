import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Check, Loader2, Sparkles } from "lucide-react";
import {
    type AiModelDto,
    type AiProviderDto,
    type ImageProtocol,
    LOGO_STYLES,
    type LogoStyle,
} from "../../../../src/features/ai/types.ts";
import { api, json } from "../../lib/api.ts";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../ui/alert-dialog.tsx";
import { Button } from "../ui/button.tsx";
import { routes } from "../../app/routes.ts";
import { Input } from "../ui/input.tsx";
import { NativeSelect } from "../ui/native-select.tsx";

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

export function LogoCandidatePicker({
    siteName,
    siteDomain,
    onSelect,
    onError,
    onClose,
}: {
    siteName: string;
    siteDomain?: string;
    onSelect: (asset: { id: string; url: string }) => void;
    onError: (message: string) => void;
    onClose?: () => void;
}) {
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

    useEffect(() => {
        let active = true;
        setLoadingModels(true);
        void Promise.all([
            api<AiModelDto[]>("/api/ai/models"),
            api<AiProviderDto[]>("/api/ai/providers"),
        ]).then(([items, availableProviders]) => {
            if (!active) return;
            setProviders(availableProviders);
            const available = items.filter((item) =>
                item.enabled && item.visibleToUsers
            );
            setModels(available);
            setSelectedId((current) => current || available[0]?.id || "");
        }).catch((error) => {
            if (active) onError(String(error));
        }).finally(() => {
            if (active) setLoadingModels(false);
        });
        return () => {
            active = false;
        };
    }, []);

    function promptGenerateConfirm() {
        const model = models.find((item) => item.id === selectedId);
        if (!model) return;
        const name = siteName.trim().slice(0, 100);
        if (!name) {
            onError("请先填写网站名称或网址");
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

            const result = await api<{ images: Candidate[] }>(
                "/api/ai/logo-candidates",
                json("POST", body),
            );
            setCandidates(result.images);
        } catch (error) {
            onError(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    }

    async function choose(candidate: Candidate, index: number) {
        setBusy(true);
        setSelectedCandidateIndex(index);
        try {
            const blob = await (await fetch(candidate.dataUrl)).blob();
            const form = new FormData();
            form.append("icon", blob, "generated-icon.png");
            const asset = await api<{ id: string; url: string }>(
                "/api/webapp-icons/upload",
                { method: "POST", body: form },
            );
            onSelect(asset);
        } catch (error) {
            onError(error instanceof Error ? error.message : String(error));
            setSelectedCandidateIndex(null);
        } finally {
            setBusy(false);
        }
    }

    if (loadingModels) {
        return (
            <div
                className="app-dialog-icon-subpanel"
                style={{
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "100px",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        color: "var(--muted)",
                        fontSize: "13px",
                    }}
                >
                    <Loader2 size={16} className="spin" />
                    <span>正在检查可用 AI 模型…</span>
                </div>
            </div>
        );
    }

    if (!models.length) {
        return (
            <div className="app-ai-unavailable-card">
                <div className="app-ai-unavailable-icon">
                    <AlertCircle size={20} />
                </div>
                <div className="app-ai-unavailable-body">
                    <strong className="app-ai-unavailable-title">
                        需先配置图片生成模型
                    </strong>
                    <p className="app-ai-unavailable-desc">
                        当前未配置支持图像生成的 AI 模型，需在设置中添加并启用。
                    </p>
                </div>
                <Link
                    to={routes.settings("ai")}
                    className="button button--subtle"
                    style={{
                        flexShrink: 0,
                        fontSize: "12px",
                        padding: "6px 12px",
                        textDecoration: "none",
                    }}
                    onClick={onClose}
                >
                    前往设置
                </Link>
            </div>
        );
    }

    return (
        <div className="app-dialog-icon-subpanel">
            <p className="app-dialog-helper-text">
                根据网站名称、域名和可选用途生成 3
                个原创应用图标候选（非官方品牌标志）。
            </p>
            <div className="app-ai-controls">
                <div className="app-ai-field">
                    <label htmlFor="ai-model-select">模型</label>
                    <NativeSelect
                        id="ai-model-select"
                        value={selectedId}
                        onChange={(event) => setSelectedId(event.target.value)}
                        disabled={busy}
                    >
                        {models.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.displayName} ·{" "}
                                {providers.find((provider) =>
                                    provider.id === item.providerId
                                )?.name ?? "未知"} · {item.modelId}
                            </option>
                        ))}
                    </NativeSelect>
                </div>
                <div className="app-ai-field">
                    <label htmlFor="ai-style-select">风格</label>
                    <NativeSelect
                        id="ai-style-select"
                        value={style}
                        onChange={(event) =>
                            setStyle(event.target.value as LogoStyle)}
                        disabled={busy}
                    >
                        {LOGO_STYLES.map((styleKey) => (
                            <option key={styleKey} value={styleKey}>
                                {LOGO_STYLE_LABELS[styleKey]}
                            </option>
                        ))}
                    </NativeSelect>
                </div>
                <div className="app-ai-field">
                    <label htmlFor="ai-image-protocol">图片生成协议</label>
                    <NativeSelect
                        id="ai-image-protocol"
                        value={imageProtocol}
                        disabled={busy}
                        onChange={(event) => {
                            const value = event.target.value;
                            if (
                                value === "openai" || value === "gemini"
                            ) setImageProtocol(value);
                        }}
                    >
                        <option value="openai">OpenAI Images</option>
                        <option value="gemini">Gemini 原生</option>
                    </NativeSelect>
                    <p className="app-ai-dialog-helper-text">
                        仅用于本次图片生成，不修改文本模型配置。请选择服务商支持的协议。
                    </p>
                </div>
                <div className="app-ai-field app-ai-field--full">
                    <div className="app-ai-field-header">
                        <label htmlFor="ai-description-input">
                            图标语义/用途（可选）
                        </label>
                        {description.length > 0 && (
                            <span className="app-ai-char-counter">
                                {description.length}/300
                            </span>
                        )}
                    </div>
                    <Input
                        id="ai-description-input"
                        type="text"
                        placeholder="例如：个人探索与常用网站启动器"
                        maxLength={300}
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        disabled={busy}
                    />
                    <p className="app-dialog-helper-text app-ai-field-helper">
                        可补充图标视觉隐喻或功能倾向，将随请求发送至
                        Provider（最多 300 字）。
                    </p>
                </div>
            </div>
            <div className="app-ai-action-row">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || !selectedId || !siteName.trim()}
                    onClick={promptGenerateConfirm}
                >
                    {busy
                        ? (
                            <>
                                <Loader2 size={13} className="spin" />
                                <span>处理中…</span>
                            </>
                        )
                        : (
                            <>
                                <Sparkles size={13} />
                                <span>生成 3 个候选</span>
                            </>
                        )}
                </Button>
                {candidates.length > 0 && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                            setCandidates([]);
                            setSelectedCandidateIndex(null);
                        }}
                    >
                        清除生成结果
                    </Button>
                )}
            </div>
            {candidates.length > 0 && (
                <div className="app-ai-candidates-wrapper">
                    <span className="app-ai-candidates-label">
                        生成结果（点击选用作为图标）：
                    </span>
                    <div
                        className="app-ai-candidates-grid"
                        role="radiogroup"
                        aria-label="AI 图标候选"
                    >
                        {candidates.map((candidate, index) => {
                            const isSelected = selectedCandidateIndex === index;
                            return (
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    className={`app-ai-candidate-card${
                                        isSelected ? " is-selected" : ""
                                    }`}
                                    key={index}
                                    disabled={busy}
                                    onClick={() =>
                                        void choose(candidate, index)}
                                    aria-label={`选用第 ${
                                        index + 1
                                    } 个 AI 图标候选`}
                                >
                                    <div className="app-ai-candidate-img-box">
                                        <img src={candidate.dataUrl} alt="" />
                                    </div>
                                    <div className="app-ai-candidate-footer">
                                        <span className="app-ai-candidate-radio-dot">
                                            {isSelected && <Check size={10} />}
                                        </span>
                                        <span>图标 {index + 1}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
            <AlertDialog
                open={confirmOpen}
                onOpenChange={(open) => {
                    setConfirmOpen(open);
                    if (!open) {
                        setConfirmSnapshot(null);
                    }
                }}
            >
                <AlertDialogContent className="max-w-md max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto]">
                    {confirmSnapshot && (
                        <>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    确认生成 AI 图标
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    即将向 AI
                                    服务商发起生成请求，请确认以下配置与上下文信息。
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="app-ai-confirm-body min-h-0 overflow-y-auto">
                                <div className="app-ai-confirm-item">
                                    <span className="app-ai-confirm-label">
                                        服务商
                                    </span>
                                    <span className="app-ai-confirm-value font-medium">
                                        {confirmSnapshot.providerName}{" "}
                                        ({confirmSnapshot.baseUrl})
                                    </span>
                                </div>
                                <div className="app-ai-confirm-item">
                                    <span className="app-ai-confirm-label">
                                        模型
                                    </span>
                                    <span className="app-ai-confirm-value">
                                        {confirmSnapshot.modelDisplayName}{" "}
                                        ({confirmSnapshot.modelId})
                                    </span>
                                </div>
                                <div className="app-ai-confirm-item">
                                    <span className="app-ai-confirm-label">
                                        图片协议
                                    </span>
                                    <span className="app-ai-confirm-value">
                                        {confirmSnapshot.imageProtocol ===
                                                "gemini"
                                            ? "Gemini 原生"
                                            : "OpenAI Images"}
                                    </span>
                                </div>
                                <div className="app-ai-confirm-item">
                                    <span className="app-ai-confirm-label">
                                        风格
                                    </span>
                                    <span className="app-ai-confirm-value">
                                        {confirmSnapshot.styleLabel}
                                    </span>
                                </div>
                                <div className="app-ai-confirm-item">
                                    <span className="app-ai-confirm-label">
                                        网站名称
                                    </span>
                                    <span className="app-ai-confirm-value font-medium">
                                        {confirmSnapshot.siteName}
                                    </span>
                                </div>
                                {confirmSnapshot.siteDomain && (
                                    <div className="app-ai-confirm-item">
                                        <span className="app-ai-confirm-label">
                                            网站域名
                                        </span>
                                        <span className="app-ai-confirm-value">
                                            {confirmSnapshot.siteDomain}
                                        </span>
                                    </div>
                                )}
                                {confirmSnapshot.description && (
                                    <div className="app-ai-confirm-item">
                                        <span className="app-ai-confirm-label">
                                            用途描述
                                        </span>
                                        <span className="app-ai-confirm-value">
                                            {confirmSnapshot.description}
                                        </span>
                                    </div>
                                )}
                                <div className="app-ai-confirm-hint">
                                    本次请求将生成 3
                                    个原创应用图标候选（非官方品牌标志）。Provider
                                    可能产生费用。
                                </div>
                            </div>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={busy}>
                                    取消
                                </AlertDialogCancel>
                                <AlertDialogAction
                                    variant="default"
                                    disabled={busy}
                                    onClick={() => {
                                        const snapshot = confirmSnapshot;
                                        setConfirmOpen(false);
                                        setConfirmSnapshot(null);
                                        if (snapshot) {
                                            void executeGenerate(snapshot);
                                        }
                                    }}
                                >
                                    确认生成
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </>
                    )}
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
