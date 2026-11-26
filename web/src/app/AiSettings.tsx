import { useEffect, useRef, useState } from "react";
import type { PageHost } from "./page-host.tsx";
import {
    MoreHorizontal,
    Pencil,
    Plus,
    RefreshCw,
    RotateCcw,
    Trash2,
} from "lucide-react";
import type {
    AiModelDto,
    AiProviderDto,
} from "../../../src/features/ai/types.ts";
import {
    CANONICAL_REASONING_EFFORTS,
    type DiscoveryMode,
    parseModelMetadata,
    type ReasoningCapability,
    type ReasoningEffort,
    type ReasoningOverride,
    resolveEffectiveCapability,
} from "../../../src/features/ai/model-capabilities.ts";
import { Button, buttonVariants } from "../components/ui/button.tsx";
import { Switch } from "../components/ui/switch.tsx";
import { Checkbox } from "../components/ui/checkbox.tsx";
import { Input } from "../components/ui/input.tsx";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog.tsx";
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../components/ui/select.tsx";
import { api, json } from "../lib/api.ts";
import { errorMessage, useAppState } from "./state.tsx";
import { authPath } from "./routes.ts";
import "./settings.css";
import {
    FormField,
    FormFields,
    SecretInput,
    SettingsGroup,
    SettingsRow,
    StatusBanner,
} from "../components/searcher/semantic.tsx";

const DISCOVERY_MODE_ITEMS: Record<DiscoveryMode, string> = {
    auto: "自动",
    "openai-compatible": "OpenAI 兼容",
    cliproxyapi: "CLIProxyAPIHome",
};

function getCapabilitySourceLabel(source: string | undefined): string {
    switch (source) {
        case "manual":
            return "手动配置";
        case "provider":
            return "服务商自动发现";
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

function describeReasoning(
    cap: ReasoningCapability,
): { label: string; title: string } {
    if (cap.status === "supported") {
        const levels = cap.levels.length > 0 ? cap.levels.join("/") : "支持";
        return {
            label: `推理 ${levels}${cap.source === "manual" ? "（手动）" : ""}`,
            title: `来源：${getCapabilitySourceLabel(cap.source)}，默认强度：${
                cap.defaultLevel ?? "无"
            }`,
        };
    }
    if (cap.status === "unsupported") {
        return { label: "无推理", title: "该模型不支持推理或已手动关闭" };
    }
    return { label: "推理未知", title: "服务商未声明推理支持状态" };
}

export function AiSettings({ host }: { host: PageHost }) {
    const { user } = useAppState();
    const { location, Link } = host;
    const [providers, setProviders] = useState<AiProviderDto[]>([]);
    const [models, setModels] = useState<AiModelDto[]>([]);
    const [name, setName] = useState("");
    const [baseUrl, setBaseUrl] = useState("");
    const [apiKey, setApiKey] = useState("");
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
    const [deleteTarget, setDeleteTarget] = useState<AiProviderDto | null>(
        null,
    );
    const [isDeleting, setIsDeleting] = useState(false);
    const deleteTriggerRef = useRef<HTMLElement | null>(null);
    const lastDeleteTargetRef = useRef<AiProviderDto | null>(null);
    if (deleteTarget) {
        lastDeleteTargetRef.current = deleteTarget;
    }
    const activeDeleteTarget = deleteTarget ?? lastDeleteTargetRef.current;
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
    useEffect(() => {
        if (!status) return;
        const timer = setTimeout(() => setStatus(""), 4000);
        return () => clearTimeout(timer);
    }, [status]);
    if (!user) {
        return (
            <SettingsGroup>
                <SettingsRow title="管理 AI 服务商">
                    <Button
                        variant="outline"
                        render={<Link to={authPath("login", location)} />}
                    >
                        登录
                    </Button>
                </SettingsRow>
            </SettingsGroup>
        );
    }
    function openAdd() {
        setEditing(null);
        setName("");
        setBaseUrl("");
        setApiKey("");
        setDiscoveryMode("auto");
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
            setIsModalOpen(false);
            setStatus("服务商和模型已同步");
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
    function openDelete(provider: AiProviderDto) {
        deleteTriggerRef.current =
            document.getElementById("provider-menu-" + provider.id) ??
                (document.activeElement as HTMLElement | null);
        setDeleteTarget(provider);
    }
    function handleCloseDelete() {
        if (isDeleting) return;
        setDeleteTarget(null);
        requestAnimationFrame(() => {
            deleteTriggerRef.current?.focus();
        });
    }
    async function handleConfirmDelete() {
        if (!deleteTarget || isDeleting) return;
        setIsDeleting(true);
        setWorking(true);
        setError("");
        try {
            await api(
                "/api/ai/providers/" + encodeURIComponent(deleteTarget.id),
                {
                    method: "DELETE",
                },
            );
            setDeleteTarget(null);
            await load();
            setStatus("服务商已删除");
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setIsDeleting(false);
            setWorking(false);
        }
    }
    const configuringSource = configuringModel
        ? getCapabilitySourceLabel(
            resolveEffectiveCapability(
                configuringModel.metadataJson,
                configuringModel.modelId,
            ).source,
        )
        : "";
    return (
        <>
            {providers.map((provider) => {
                const manageable = provider.ownerUserId === user.id ||
                    user.role === "admin";
                const providerModels = models.filter((model) =>
                    model.providerId === provider.id
                );
                return (
                    <SettingsGroup
                        key={provider.id}
                        title={provider.name}
                        footer={
                            <span className="ai-provider-meta">
                                {`${
                                    provider.scope === "system"
                                        ? "系统共享"
                                        : "个人"
                                } · ${provider.baseUrl} · Key ${provider.apiKeyMasked}`}
                            </span>
                        }
                        actions={manageable
                            ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger
                                        id={"provider-menu-" + provider.id}
                                        className={buttonVariants({
                                            variant: "ghost",
                                            size: "icon",
                                        })}
                                        aria-label={`服务商操作：${provider.name}`}
                                        disabled={working}
                                    >
                                        <MoreHorizontal
                                            size="1em"
                                            className="icon-md"
                                        />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem
                                            onClick={() => openEdit(provider)}
                                        >
                                            <Pencil
                                                size="1em"
                                                className="icon-sm"
                                                aria-hidden="true"
                                            />
                                            <span>编辑</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            disabled={working}
                                            onClick={() =>
                                                void refresh(provider.id)}
                                        >
                                            <RefreshCw
                                                size="1em"
                                                className="icon-sm"
                                                aria-hidden="true"
                                            />
                                            <span>刷新模型</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            variant="destructive"
                                            disabled={working || isDeleting}
                                            onClick={() => openDelete(provider)}
                                        >
                                            <Trash2
                                                size="1em"
                                                className="icon-sm"
                                                aria-hidden="true"
                                            />
                                            <span>删除</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )
                            : undefined}
                    >
                        {providerModels.length === 0 && (
                            <SettingsRow title="暂无模型">
                                {manageable && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={working}
                                        onClick={() =>
                                            void refresh(provider.id)}
                                    >
                                        刷新
                                    </Button>
                                )}
                            </SettingsRow>
                        )}
                        <RadioGroup
                            variant="rows"
                            aria-label="默认模型"
                            value={providerModels.find((model) =>
                                model.isDefault
                            )?.id ?? null}
                            onValueChange={(modelId) =>
                                void changeModel(String(modelId), {
                                    isDefault: true,
                                })}
                        >
                            {providerModels.map((model) => {
                                const reasoning = describeReasoning(
                                    resolveEffectiveCapability(
                                        model.metadataJson,
                                        model.modelId,
                                    ),
                                );
                                const summary = [
                                    model.displayName !== model.modelId
                                        ? model.modelId
                                        : null,
                                    model.supportsText ? "文本" : null,
                                    model.supportsVision ? "视觉" : null,
                                    model.supportsTools ? "工具" : null,
                                    model.supportsStreaming ? "流式" : null,
                                ].filter(Boolean).join(" · ");
                                return (
                                    <SettingsRow
                                        key={model.id}
                                        className={manageable
                                            ? "settings-row--vertical"
                                            : undefined}
                                        title={model.displayName}
                                        description={
                                            <span className="ai-model-meta">
                                                {summary}
                                                {summary && " · "}
                                                <span title={reasoning.title}>
                                                    {reasoning.label}
                                                </span>
                                            </span>
                                        }
                                    >
                                        {manageable && (
                                            <div className="ai-model-controls">
                                                <label className="ai-model-toggle">
                                                    <Switch
                                                        aria-label={`启用 ${model.displayName}`}
                                                        checked={model.enabled}
                                                        onCheckedChange={(
                                                            checked,
                                                        ) => void changeModel(
                                                            model.id,
                                                            {
                                                                enabled:
                                                                    checked,
                                                            },
                                                        )}
                                                    />
                                                    启用
                                                </label>
                                                <label className="ai-model-toggle">
                                                    <Switch
                                                        aria-label={`可见 ${model.displayName}`}
                                                        checked={model
                                                            .visibleToUsers}
                                                        onCheckedChange={(
                                                            checked,
                                                        ) => void changeModel(
                                                            model.id,
                                                            {
                                                                visibleToUsers:
                                                                    checked,
                                                            },
                                                        )}
                                                    />
                                                    可见
                                                </label>
                                                <RadioGroupItem
                                                    value={model.id}
                                                    className="ai-model-toggle"
                                                    aria-label={`设为默认 ${model.displayName}`}
                                                >
                                                    默认
                                                </RadioGroupItem>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="ai-model-reasoning-btn"
                                                    onClick={() =>
                                                        openModelConfig(model)}
                                                >
                                                    推理设置
                                                </Button>
                                            </div>
                                        )}
                                    </SettingsRow>
                                );
                            })}
                        </RadioGroup>
                    </SettingsGroup>
                );
            })}
            <SettingsGroup
                footer={providers.length === 0
                    ? "尚未添加 AI 服务商，请添加服务商并启用模型。"
                    : undefined}
            >
                <Button
                    type="button"
                    variant="ghost"
                    className="settings-add-row"
                    onClick={openAdd}
                >
                    <Plus size="1em" className="icon-md" />
                    <span>添加 AI 服务商</span>
                </Button>
            </SettingsGroup>
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent
                    aria-label={editing ? "编辑 AI 服务商" : "添加 AI 服务商"}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {editing ? "编辑 AI 服务商" : "添加 AI 服务商"}
                        </DialogTitle>
                        <DialogDescription>
                            OpenAI 兼容 API，保存时自动验证连接。
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={save} className="ai-provider-form">
                        <FormFields>
                            <FormField label="名称" labelFor="ai-provider-name">
                                <Input
                                    id="ai-provider-name"
                                    required
                                    maxLength={100}
                                    value={name}
                                    placeholder="例如：OpenAI、DeepSeek、Ollama"
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </FormField>
                            <FormField
                                label="Base URL"
                                labelFor="ai-provider-base-url"
                            >
                                <Input
                                    id="ai-provider-base-url"
                                    required
                                    type="url"
                                    placeholder="https://api.openai.com/v1"
                                    value={baseUrl}
                                    onChange={(e) => setBaseUrl(e.target.value)}
                                />
                            </FormField>
                            <FormField
                                label="发现模式"
                                labelFor="ai-discovery-mode"
                            >
                                <Select
                                    items={DISCOVERY_MODE_ITEMS}
                                    value={discoveryMode}
                                    onValueChange={(next) => {
                                        if (next !== null) {
                                            setDiscoveryMode(
                                                next as DiscoveryMode,
                                            );
                                        }
                                    }}
                                >
                                    <SelectTrigger
                                        id="ai-discovery-mode"
                                        aria-label="发现模式"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="auto">
                                            自动
                                        </SelectItem>
                                        <SelectItem value="openai-compatible">
                                            OpenAI 兼容
                                        </SelectItem>
                                        <SelectItem value="cliproxyapi">
                                            CLIProxyAPIHome
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormField>
                            <FormField
                                label="API Key"
                                labelFor="ai-api-key"
                                hint="加密保存在服务端。"
                                messageId="ai-api-key-hint"
                            >
                                <SecretInput
                                    key={`${editing ?? "new"}-${isModalOpen}`}
                                    id="ai-api-key"
                                    required={!editing}
                                    autoComplete="off"
                                    aria-describedby="ai-api-key-hint"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder={editing
                                        ? "留空保持现有 Key"
                                        : "输入 API Key"}
                                    showLabel="显示 API Key"
                                    hideLabel="隐藏 API Key"
                                />
                            </FormField>
                            {!editing && user.role === "admin" && (
                                <FormField label="范围">
                                    <RadioGroup
                                        variant="segmented"
                                        aria-label="范围"
                                        value={scope}
                                        onValueChange={(next) =>
                                            setScope(
                                                next as "user" | "system",
                                            )}
                                    >
                                        <RadioGroupItem value="user">
                                            仅自己
                                        </RadioGroupItem>
                                        <RadioGroupItem value="system">
                                            所有用户
                                        </RadioGroupItem>
                                    </RadioGroup>
                                </FormField>
                            )}
                        </FormFields>
                        {error && (
                            <StatusBanner tone="error">{error}</StatusBanner>
                        )}
                        <DialogFooter>
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
                                    ? "正在验证…"
                                    : editing
                                    ? "保存并验证"
                                    : "验证并添加"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            <Dialog
                open={!!configuringModel}
                onOpenChange={(open) => !open && setConfiguringModel(null)}
            >
                <DialogContent aria-label="推理设置">
                    <DialogHeader>
                        <DialogTitle>推理设置</DialogTitle>
                        <DialogDescription>
                            {configuringModel
                                ? `${configuringModel.displayName} · 来源：${configuringSource}`
                                : ""}
                        </DialogDescription>
                    </DialogHeader>
                    {configuringModel && (
                        <div className="model-config-dialog-body">
                            <div className="reasoning-toggle-row">
                                <Checkbox
                                    id="manual-reasoning-toggle"
                                    checked={manualReasoningEnabled}
                                    aria-label="开启该模型的推理能力"
                                    onCheckedChange={setManualReasoningEnabled}
                                />
                                <label
                                    htmlFor="manual-reasoning-toggle"
                                    className="reasoning-toggle-label"
                                >
                                    开启推理
                                </label>
                            </div>
                            {manualReasoningEnabled && (
                                <FormFields>
                                    <FormField
                                        label="支持的强度"
                                        role="group"
                                        aria-label="支持的强度"
                                    >
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
                                    </FormField>
                                    <FormField
                                        label="默认强度"
                                        labelFor="ai-reasoning-default-level"
                                    >
                                        <Select
                                            items={Object.fromEntries(
                                                selectedLevels.map((lvl) => [
                                                    lvl,
                                                    getReasoningEffortLabel(
                                                        lvl,
                                                    ),
                                                ]),
                                            )}
                                            value={defaultLevel}
                                            disabled={selectedLevels.length ===
                                                0}
                                            onValueChange={(next) => {
                                                if (next !== null) {
                                                    setDefaultLevel(
                                                        next as ReasoningEffort,
                                                    );
                                                }
                                            }}
                                        >
                                            <SelectTrigger
                                                id="ai-reasoning-default-level"
                                                aria-label="默认强度"
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {selectedLevels.map((lvl) => (
                                                    <SelectItem
                                                        key={lvl}
                                                        value={lvl}
                                                    >
                                                        {getReasoningEffortLabel(
                                                            lvl,
                                                        )}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </FormField>
                                </FormFields>
                            )}
                            <div className="model-config-actions">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={revertModelConfig}
                                >
                                    <RotateCcw size="1em" className="icon-sm" />
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
                                        保存
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            <AlertDialog
                open={deleteTarget !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        handleCloseDelete();
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除服务商？</AlertDialogTitle>
                        <AlertDialogDescription>
                            {activeDeleteTarget
                                ? `“${activeDeleteTarget.name}” 及其模型将被永久删除。`
                                : "该服务商及其模型将被永久删除。"}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            disabled={isDeleting}
                            onClick={handleCloseDelete}
                        >
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={isDeleting}
                            onClick={handleConfirmDelete}
                        >
                            {isDeleting ? "正在删除…" : "删除"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <StatusBanner
                tone="success"
                presentation="floating"
                open={status !== ""}
            >
                {status}
            </StatusBanner>
            <StatusBanner
                open={Boolean(error) && !isModalOpen}
                tone="error"
                className="ai-error"
            >
                {error}
            </StatusBanner>
        </>
    );
}
