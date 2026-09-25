import { useEffect, useState } from "react";
import type {
    AiModelDto,
    AiProviderDto,
} from "../../../../src/features/ai/types.ts";
import { api, json } from "../../lib/api.ts";
import { Button } from "../ui/button.tsx";

interface Candidate {
    dataUrl: string;
    style: "minimal" | "geometric" | "gradient";
}

export function LogoCandidatePicker({ siteName, onSelect, onError }: {
    siteName: string;
    onSelect: (asset: { id: string; url: string }) => void;
    onError: (message: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [models, setModels] = useState<AiModelDto[]>([]);
    const [providers, setProviders] = useState<AiProviderDto[]>([]);
    const [selectedId, setSelectedId] = useState("");
    const [style, setStyle] = useState<Candidate["style"]>("minimal");
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        let active = true;
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
        });
        return () => {
            active = false;
        };
    }, [open]);

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
            !window.confirm(
                `将向 ${provider.name} (${provider.baseUrl}) 发送网站名称「${name}」，使用模型 ${model.modelId}、${style} 风格生成 3 个原创图标候选。Provider 可能产生费用。确认生成？`,
            )
        ) return;
        setBusy(true);
        setCandidates([]);
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

    async function choose(candidate: Candidate) {
        setBusy(true);
        try {
            const blob = await (await fetch(candidate.dataUrl)).blob();
            const form = new FormData();
            form.append("icon", blob, "generated-icon.png");
            const asset = await api<{ id: string; url: string }>(
                "/api/webapp-icons/upload",
                { method: "POST", body: form },
            );
            onSelect(asset);
            setCandidates([]);
            setOpen(false);
        } catch (error) {
            onError(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    }

    if (!open) {
        return (
            <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(true)}
            >
                AI 生成候选
            </Button>
        );
    }
    return (
        <div className="logo-picker">
            <p className="muted">
                仅生成原创图标概念，不代表网站官方 Logo。需选择支持
                /images/generations 的模型。
            </p>
            <div className="logo-controls">
                <label>
                    模型<select
                        value={selectedId}
                        onChange={(event) => setSelectedId(event.target.value)}
                        disabled={busy}
                    >
                        {models.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.displayName} ·{" "}
                                {providers.find((provider) =>
                                    provider.id === item.providerId
                                )?.name ?? "未知 Provider"} · {item.modelId}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    风格<select
                        value={style}
                        onChange={(event) =>
                            setStyle(event.target.value as Candidate["style"])}
                        disabled={busy}
                    >
                        <option value="minimal">极简</option>
                        <option value="geometric">几何</option>
                        <option value="gradient">柔和渐变</option>
                    </select>
                </label>
                <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !selectedId}
                    onClick={() => void generate()}
                >
                    {busy ? "处理中…" : "生成 3 个候选"}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                        setCandidates([]);
                        setOpen(false);
                    }}
                >
                    取消
                </Button>
            </div>
            {!models.length && (
                <p className="muted">
                    没有可用模型。请先在设置中配置支持图像生成的 Provider。
                </p>
            )}
            {candidates.length > 0 && (
                <div className="logo-candidates" aria-label="AI 图标候选">
                    {candidates.map((candidate, index) => (
                        <Button
                            type="button"
                            variant="outline"
                            className="logo-choice"
                            key={index}
                            disabled={busy}
                            onClick={() => void choose(candidate)}
                            aria-label={`选用第 ${index + 1} 个 AI 图标候选`}
                        >
                            <img src={candidate.dataUrl} alt="" />
                            <span>选用候选 {index + 1}</span>
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
}
