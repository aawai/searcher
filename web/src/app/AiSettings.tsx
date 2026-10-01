import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Eye, EyeOff, Plus, RotateCcw, Settings2 } from "lucide-react";
import type {
    AiModelDto,
    AiProviderDto,
} from "../../../src/features/ai/types.ts";
import {
    CANONICAL_REASONING_EFFORTS,
    type DiscoveryMode,
    parseModelMetadata,
    type ReasoningEffort,
    type ReasoningOverride,
    resolveEffectiveCapability,
} from "../../../src/features/ai/model-capabilities.ts";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { Switch } from "../components/ui/switch.tsx";
import { Checkbox } from "../components/ui/checkbox.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog.tsx";
import {
    NativeSelect,
    NativeSelectOption,
} from "../components/ui/native-select.tsx";
import { api, json } from "../lib/api.ts";
import { errorMessage, useAppState } from "./state.tsx";
import { authPath } from "./routes.ts";
import "./settings.css";

function getCapabilitySourceLabel(source: string | undefined): string {
    switch (source) {
        case "manual":
            return "手动配置";
        case "provider":
            return "Provider 自动发现";
        case "preset":
            return "内置预设";
        case "inferred":
            return "名称推断";
        default:
            return "未知";
    }
}

function getReasoningEffortLabel(effort: ReasoningEffort): string {
    switch (effort) {
        case "none":
            return "无 / 关闭 (none)";
        case "minimal":
            return "最低 (minimal)";
        case "low":
            return "快速 (low)";
        case "medium":
            return "标准 (medium)";
        case "high":
            return "深入 (high)";
        case "xhigh":
            return "极深 (xhigh)";
        case "max":
            return "最大 (max)";
        case "auto":
            return "自动 (auto)";
        default:
            return effort;
    }
}

export function AiSettings() {
    const { user } = useAppState();
    const location = useLocation();
    const [providers, setProviders] = useState<AiProviderDto[]>([]);
    const [models, setModels] = useState<AiModelDto[]>([]);
    const [name, setName] = useState("");
    const [baseUrl, setBaseUrl] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [showApiKey, setShowApiKey] = useState(false);
    const [scope, setScope] = useState<"user" | "system">("user");
    const [editing, setEditing] = useState<string | null>(null);
    const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>("auto");
    const [configuringModel, setConfiguringModel] = useState<AiModelDto | null>(
        null,
    );
    const [manualReasoningEnabled, setManualReasoningEnabled] = useState(false);
    const [selectedLevels, setSelectedLevels] = useState<ReasoningEffort[]>([
        "low",
        "medium",
        "high",
    ]);
    const [defaultLevel, setDefaultLevel] = useState<ReasoningEffort>("medium");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    async function load() {
        const [p, m] = await Promise.all([
            api<AiProviderDto[]>("/api/ai/providers"),
            api<AiModelDto[]>("/api/ai/models"),
        ]);
        setProviders(p);
        setModels(m);
    }
    useEffect(() => {
        if (!user) return;
        void load().catch((e) => setError(errorMessage(e)));
    }, [user?.id]);
    if (!user) {
        return (
            <p>
                <Link to={authPath("login", location)}>
                    登录后配置 Provider
                </Link>
            </p>
        );
    }
    function openAdd() {
        setEditing(null);
        setName("");
        setBaseUrl("");
        setApiKey("");
        setDiscoveryMode("auto");
        setShowApiKey(false);
        setError("");
        setIsModalOpen(true);
    }

    function openEdit(provider: AiProviderDto) {
        setEditing(provider.id);
        setName(provider.name);
        setBaseUrl(provider.baseUrl);
        setApiKey("");
        setDiscoveryMode(
            (provider as { discoveryMode?: DiscoveryMode }).discoveryMode ??
                "auto",
        );
        setShowApiKey(false);
        setError("");
        setIsModalOpen(true);
    }

    function openModelConfig(model: AiModelDto) {
        const metadata = parseModelMetadata(model.metadataJson);
        const override = metadata.capabilities?.overrides?.reasoning;
        const cap = resolveEffectiveCapability(
            model.metadataJson,
            model.modelId,
        );
        setConfiguringModel(model);
        if (override) {
            setManualReasoningEnabled(override.enabled);
            setSelectedLevels(
                Array.isArray(override.levels) && override.levels.length > 0
                    ? override.levels
                    : (cap.levels.length > 0
                        ? cap.levels
                        : ["low", "medium", "high"]),
            );
            setDefaultLevel(
                override.defaultLevel ?? (cap.defaultLevel || "medium"),
            );
        } else {
            const isSupported = cap.status === "supported";
            setManualReasoningEnabled(isSupported);
            setSelectedLevels(
                cap.levels.length > 0 ? cap.levels : ["low", "medium", "high"],
            );
            setDefaultLevel(
                cap.defaultLevel ||
                    (cap.levels.length > 0 ? cap.levels[0] : "medium"),
            );
        }
    }
    function toggleLevel(level: ReasoningEffort) {
        setSelectedLevels((prev) => {
            let updated: ReasoningEffort[];
            if (prev.includes(level)) {
                updated = prev.filter((l) => l !== level);
            } else {
                updated = [...prev, level];
            }
            if (!updated.includes(defaultLevel) && updated.length > 0) {
                setDefaultLevel(updated[0]);
            }
            return updated;
        });
    }

    async function saveModelConfig() {
        if (!configuringModel) return;
        const override: ReasoningOverride = {
            enabled: manualReasoningEnabled,
            levels: manualReasoningEnabled ? selectedLevels : [],
            defaultLevel: manualReasoningEnabled ? defaultLevel : undefined,
        };
        await changeModel(configuringModel.id, {
            reasoningOverride: override,
        });
        setConfiguringModel(null);
        setStatus("模型推理配置已保存");
    }

    async function revertModelConfig() {
        if (!configuringModel) return;
        await changeModel(configuringModel.id, {
            reasoningOverride: null,
        });
        setConfiguringModel(null);
        setStatus("已恢复该模型的自动发现能力");
    }

    async function save(event: React.FormEvent) {
        event.preventDefault();
        setError("");
        setStatus("");
        setWorking(true);
        try {
            await api(
                editing
                    ? "/api/ai/providers/" + encodeURIComponent(editing)
                    : "/api/ai/providers",
                json(
                    editing ? "PUT" : "POST",
                    editing
                        ? {
                            name,
                            baseUrl,
                            ...(apiKey ? { apiKey } : {}),
                            discoveryMode,
                        }
                        : { name, baseUrl, apiKey, scope, discoveryMode },
                ),
            );
            await load();
            setEditing(null);
            setName("");
            setBaseUrl("");
            setApiKey("");
            setShowApiKey(false);
            setIsModalOpen(false);
            setStatus("Provider 和模型已同步");
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setWorking(false);
        }
    }
    async function changeModel(id: string, patch: Record<string, unknown>) {
        setError("");
        try {
            await api(
                "/api/ai/models/" + encodeURIComponent(id),
                json("PATCH", patch),
            );
            await load();
        } catch (e) {
            setError(errorMessage(e));
        }
    }
    async function refresh(id: string) {
        setWorking(true);
        setError("");
        try {
            await api(
                "/api/ai/providers/" + encodeURIComponent(id) + "/refresh",
                { method: "POST" },
            );
            await load();
            setStatus("模型列表已刷新");
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setWorking(false);
        }
    }
    async function remove(id: string) {
        if (!globalThis.confirm("删除 Provider 及其模型？")) return;
        try {
            await api("/api/ai/providers/" + encodeURIComponent(id), {
                method: "DELETE",
            });
            await load();
        } catch (e) {
            setError(errorMessage(e));
        }
    }
    return (
        <div className="ai-settings">
            <div className="ai-settings-header">
                <div>
                    <h4>
                        已配置的 Provider
                    </h4>
                    <p className="muted">
                        配置 OpenAI 兼容 API Endpoint，Key 在服务端加密保存
                    </p>
                </div>
                <Button variant="default" onClick={openAdd}>
                    <Plus size={16} />
                    <span>添加 Provider</span>
                </Button>
            </div>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent
                    aria-label={editing ? "编辑 Provider" : "添加 Provider"}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {editing ? "编辑 Provider" : "添加 Provider"}
                        </DialogTitle>
                        <DialogDescription>
                            填写 OpenAI 兼容 API 信息。保存前会自动请求 /models
                            进行连接验证。
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        onSubmit={save}
                        className="ai-provider-form"
                    >
                        <label className="field">
                            名称
                            <input
                                required
                                maxLength={100}
                                value={name}
                                placeholder="例如：OpenAI、DeepSeek、Ollama"
                                onChange={(e) => setName(e.target.value)}
                            />
                        </label>
                        <label className="field">
                            Base URL
                            <input
                                required
                                type="url"
                                placeholder="https://api.openai.com/v1"
                                value={baseUrl}
                                onChange={(e) => setBaseUrl(e.target.value)}
                            />
                        </label>
                        <label className="field">
                            发现模式 (Discovery Mode)
                            <NativeSelect
                                value={discoveryMode}
                                onChange={(e) =>
                                    setDiscoveryMode(
                                        e.target.value as DiscoveryMode,
                                    )}
                            >
                                <NativeSelectOption value="auto">
                                    自动检测 (Auto)
                                </NativeSelectOption>
                                <NativeSelectOption value="openai-compatible">
                                    标准 OpenAI 兼容 (OpenAI-compatible)
                                </NativeSelectOption>
                                <NativeSelectOption value="cliproxyapi">
                                    CLIProxyAPIHome 扩展目录
                                </NativeSelectOption>
                            </NativeSelect>
                            <p className="muted">
                                自动：优先标准模型列表；CLIProxyAPIHome：尝试
                                /user/models 发现推理等级与扩展字段。
                            </p>
                        </label>
                        <div className="field">
                            <label htmlFor="ai-api-key">API Key</label>
                            <div className="ai-api-key-row">
                                <input
                                    id="ai-api-key"
                                    required={!editing}
                                    type={showApiKey ? "text" : "password"}
                                    autoComplete="off"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder={editing
                                        ? "留空保持现有 Key"
                                        : "输入 API Key"}
                                    className="ai-api-key-input"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setShowApiKey(!showApiKey)}
                                    aria-label={showApiKey
                                        ? "隐藏 API Key"
                                        : "显示 API Key"}
                                    title={showApiKey ? "隐藏" : "显示"}
                                >
                                    {showApiKey
                                        ? <EyeOff size={16} />
                                        : <Eye size={16} />}
                                </Button>
                            </div>
                            <p className="muted ai-api-key-help">
                                Key
                                仅存储在服务端，并经过安全密钥加密，不会向前端明文暴露。
                            </p>
                        </div>
                        {!editing && user.role === "admin" && (
                            <label className="field">
                                范围
                                <select
                                    value={scope}
                                    onChange={(e) =>
                                        setScope(
                                            e.target.value as "user" | "system",
                                        )}
                                >
                                    <option value="user">仅自己可用</option>
                                    <option value="system">
                                        系统共享（所有用户）
                                    </option>
                                </select>
                            </label>
                        )}
                        {error && (
                            <p
                                role="alert"
                                className="error ai-form-error"
                            >
                                {error}
                            </p>
                        )}
                        <div className="ai-form-actions">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsModalOpen(false)}
                            >
                                取消
                            </Button>
                            <Button
                                type="submit"
                                variant="default"
                                disabled={working}
                            >
                                {working
                                    ? "正在验证模型…"
                                    : editing
                                    ? "保存并验证"
                                    : "验证并添加"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {!providers.length && (
                <div className="ai-empty-state">
                    <p className="ai-empty-state-title">
                        尚未添加 AI Provider
                    </p>
                    <p className="muted ai-empty-state-desc">
                        添加 Provider 并验证模型后，即可在主页直接切换使用 AI
                        问答。
                    </p>
                    <Button variant="outline" onClick={openAdd}>
                        <Plus size={16} />
                        <span>添加第一个 Provider</span>
                    </Button>
                </div>
            )}
            {providers.map((provider) => (
                <section className="provider-card" key={provider.id}>
                    <div className="provider-head">
                        <div>
                            <h4>
                                {provider.name}{" "}
                                <small>
                                    {provider.scope === "system"
                                        ? "系统"
                                        : "个人"}
                                </small>
                            </h4>
                            <p className="muted">
                                {provider.baseUrl} · Key {provider.apiKeyMasked}
                            </p>
                        </div>
                        {(provider.ownerUserId === user.id ||
                            user.role === "admin") && (
                            <div className="form-actions">
                                <Button
                                    type="button"
                                    disabled={working}
                                    onClick={() => openEdit(provider)}
                                >
                                    编辑
                                </Button>
                                <Button
                                    type="button"
                                    disabled={working}
                                    onClick={() => void refresh(provider.id)}
                                >
                                    刷新模型
                                </Button>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={() => void remove(provider.id)}
                                >
                                    删除
                                </Button>
                            </div>
                        )}
                    </div>
                    <div className="provider-models">
                        {models.filter((model) =>
                            model.providerId === provider.id
                        ).map((model) => {
                            const cap = resolveEffectiveCapability(
                                model.metadataJson,
                                model.modelId,
                            );
                            return (
                                <div key={model.id} className="model-row">
                                    <div className="model-row-main">
                                        <span>
                                            <strong>{model.displayName}</strong>
                                            {" "}
                                            <small className="muted">
                                                {model.modelId}
                                            </small>
                                        </span>
                                        <div className="model-badges">
                                            {model.supportsText && (
                                                <Badge variant="secondary">
                                                    文本
                                                </Badge>
                                            )}
                                            {model.supportsVision && (
                                                <Badge variant="secondary">
                                                    视觉
                                                </Badge>
                                            )}
                                            {model.supportsTools && (
                                                <Badge variant="secondary">
                                                    工具
                                                </Badge>
                                            )}
                                            {model.supportsStreaming && (
                                                <Badge variant="secondary">
                                                    流式
                                                </Badge>
                                            )}
                                            {cap.status === "supported"
                                                ? (
                                                    <Badge
                                                        variant="default"
                                                        title={`来源: ${
                                                            getCapabilitySourceLabel(
                                                                cap.source,
                                                            )
                                                        }，默认强度: ${
                                                            cap.defaultLevel ??
                                                                "无"
                                                        }`}
                                                    >
                                                        推理:{" "}
                                                        {cap.levels.length > 0
                                                            ? cap.levels.join(
                                                                "/",
                                                            )
                                                            : "支持"}
                                                        {cap.source ===
                                                                "manual" && (
                                                            <span className="model-manual-tag">
                                                                [手动]
                                                            </span>
                                                        )}
                                                    </Badge>
                                                )
                                                : cap.status === "unsupported"
                                                ? (
                                                    <Badge
                                                        variant="outline"
                                                        title="该模型不支持推理或已手动关闭"
                                                    >
                                                        无推理
                                                    </Badge>
                                                )
                                                : (
                                                    <Badge
                                                        variant="outline"
                                                        title="Provider 未声明推理支持状态"
                                                    >
                                                        推理未知
                                                    </Badge>
                                                )}
                                        </div>
                                    </div>
                                    {(provider.ownerUserId === user.id ||
                                        user.role === "admin") && (
                                        <div className="form-actions">
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    checked={model.enabled}
                                                    onChange={(e) =>
                                                        void changeModel(
                                                            model.id,
                                                            {
                                                                enabled:
                                                                    e.target
                                                                        .checked,
                                                            },
                                                        )}
                                                />{" "}
                                                启用
                                            </label>
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    checked={model
                                                        .visibleToUsers}
                                                    onChange={(e) =>
                                                        void changeModel(
                                                            model.id,
                                                            {
                                                                visibleToUsers:
                                                                    e.target
                                                                        .checked,
                                                            },
                                                        )}
                                                />{" "}
                                                可见
                                            </label>
                                            <label>
                                                <input
                                                    type="radio"
                                                    name={"default-" +
                                                        provider.id}
                                                    checked={model.isDefault}
                                                    onChange={() =>
                                                        void changeModel(
                                                            model.id,
                                                            {
                                                                isDefault: true,
                                                            },
                                                        )}
                                                />{" "}
                                                默认
                                            </label>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    openModelConfig(model)}
                                                title="手动配置该模型的推理能力与强度"
                                            >
                                                <Settings2 size={14} />
                                                <span>配置推理</span>
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            ))}
            <Dialog
                open={!!configuringModel}
                onOpenChange={(open) => !open && setConfiguringModel(null)}
            >
                <DialogContent aria-label="配置模型推理能力">
                    <DialogHeader>
                        <DialogTitle>配置模型推理能力</DialogTitle>
                        <DialogDescription>
                            手动配置 {configuringModel?.displayName} (
                            {configuringModel?.modelId}
                            )
                            的推理强度。手动配置优先级最高，不会被模型刷新覆盖。
                        </DialogDescription>
                    </DialogHeader>
                    {configuringModel && (
                        <div className="model-config-dialog-body">
                            <div className="model-capabilities-summary">
                                <div>
                                    <strong>基础能力：</strong>文本 ✓ · 视觉
                                    {" "}
                                    {configuringModel.supportsVision
                                        ? "✓"
                                        : "✗"} · 工具{" "}
                                    {configuringModel.supportsTools ? "✓" : "✗"}
                                    {" "}
                                    · 流式{" "}
                                    {configuringModel.supportsStreaming
                                        ? "✓"
                                        : "✗"}
                                </div>
                                <div>
                                    <strong>能力来源：</strong>
                                    {getCapabilitySourceLabel(
                                        resolveEffectiveCapability(
                                            configuringModel.metadataJson,
                                            configuringModel.modelId,
                                        ).source,
                                    )}
                                </div>
                                <div>
                                    <strong>配置状态：</strong>
                                    {parseModelMetadata(
                                            configuringModel.metadataJson,
                                        ).capabilities?.overrides?.reasoning
                                        ? (
                                            <Badge variant="default">
                                                已手动覆盖
                                            </Badge>
                                        )
                                        : (
                                            <Badge variant="outline">
                                                自动发现 / 预设 (未覆盖)
                                            </Badge>
                                        )}
                                </div>
                            </div>

                            <div className="reasoning-toggle-row">
                                <Switch
                                    id="manual-reasoning-toggle"
                                    checked={manualReasoningEnabled}
                                    aria-label="开启该模型的推理能力"
                                    onCheckedChange={setManualReasoningEnabled}
                                />
                                <label
                                    htmlFor="manual-reasoning-toggle"
                                    className="reasoning-toggle-label"
                                >
                                    开启该模型的推理能力 (Reasoning Effort)
                                </label>
                            </div>

                            {manualReasoningEnabled && (
                                <>
                                    <div className="field">
                                        <label>支持的推理强度（可多选）</label>
                                        <div className="reasoning-levels-grid">
                                            {CANONICAL_REASONING_EFFORTS.map(
                                                (effort) => (
                                                    <label
                                                        key={effort}
                                                        className="reasoning-level-item"
                                                    >
                                                        <Checkbox
                                                            aria-label={getReasoningEffortLabel(
                                                                effort,
                                                            )}
                                                            checked={selectedLevels
                                                                .includes(
                                                                    effort,
                                                                )}
                                                            onCheckedChange={() =>
                                                                toggleLevel(
                                                                    effort,
                                                                )}
                                                        />

                                                        <span>
                                                            {getReasoningEffortLabel(
                                                                effort,
                                                            )}
                                                        </span>
                                                    </label>
                                                ),
                                            )}
                                        </div>
                                    </div>

                                    <label className="field">
                                        默认推理强度
                                        <NativeSelect
                                            value={defaultLevel}
                                            onChange={(e) =>
                                                setDefaultLevel(
                                                    e.target
                                                        .value as ReasoningEffort,
                                                )}
                                            disabled={selectedLevels.length ===
                                                0}
                                        >
                                            {selectedLevels.map((lvl) => (
                                                <NativeSelectOption
                                                    key={lvl}
                                                    value={lvl}
                                                >
                                                    {getReasoningEffortLabel(
                                                        lvl,
                                                    )}
                                                </NativeSelectOption>
                                            ))}
                                        </NativeSelect>
                                    </label>
                                </>
                            )}

                            <div className="model-config-actions">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={revertModelConfig}
                                    title="清除手动配置，恢复为 Provider 自动发现或预设"
                                >
                                    <RotateCcw size={14} />
                                    <span>恢复自动发现</span>
                                </Button>
                                <div className="model-config-action-group">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            setConfiguringModel(null)}
                                    >
                                        取消
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="default"
                                        onClick={saveModelConfig}
                                        disabled={manualReasoningEnabled &&
                                            selectedLevels.length === 0}
                                    >
                                        保存配置
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            {status && <p role="status">{status}</p>}
            {error && <p role="alert" className="error">{error}</p>}
        </div>
    );
}
