import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Check, Loader2, Sparkles } from "lucide-react";
import type {
    AiModelDto,
    AiProviderDto,
} from "../../../../src/features/ai/types.ts";
import { api, json } from "../../lib/api.ts";
import { Button } from "../ui/button.tsx";
import { routes } from "../../app/routes.ts";

interface Candidate {
    dataUrl: string;
    style: "minimal" | "geometric" | "gradient";
}

export function LogoCandidatePicker({
    siteName,
    onSelect,
    onError,
    onClose,
}: {
    siteName: string;
    onSelect: (asset: { id: string; url: string }) => void;
    onError: (message: string) => void;
    onClose?: () => void;
}) {
    const [loadingModels, setLoadingModels] = useState(true);
    const [models, setModels] = useState<AiModelDto[]>([]);
    const [providers, setProviders] = useState<AiProviderDto[]>([]);
    const [selectedId, setSelectedId] = useState("");
    const [style, setStyle] = useState<Candidate["style"]>("minimal");
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

    async function generate() {
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
        if (
            !globalThis.confirm(
                `将向 ${provider.name} (${provider.baseUrl}) 发送网站名称「${name}」，使用模型 ${model.modelId}、${style} 风格生成 3 个原创图标候选。Provider 可能产生费用。确认生成？`,
            )
        ) return;
        setBusy(true);
        setCandidates([]);
        setSelectedCandidateIndex(null);
        try {
            const result = await api<{ images: Candidate[] }>(
                "/api/ai/logo-candidates",
                json("POST", {
                    providerId: model.providerId,
                    modelId: model.modelId,
                    siteName: name,
                    style,
                }),
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
                基于网站名称生成 3 个原创极简概念图标（非官方品牌标志）。
            </p>
            <div className="app-ai-controls">
                <div className="app-ai-field">
                    <label htmlFor="ai-model-select">模型</label>
                    <select
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
                    </select>
                </div>
                <div className="app-ai-field">
                    <label htmlFor="ai-style-select">风格</label>
                    <select
                        id="ai-style-select"
                        value={style}
                        onChange={(event) =>
                            setStyle(event.target.value as Candidate["style"])}
                        disabled={busy}
                    >
                        <option value="minimal">极简</option>
                        <option value="geometric">几何</option>
                        <option value="gradient">柔和渐变</option>
                    </select>
                </div>
            </div>
            <div className="app-ai-action-row">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || !selectedId || !siteName.trim()}
                    onClick={() => void generate()}
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
        </div>
    );
}
