import { useEffect, useRef, useState } from "react";
import type { PageHost } from "./page-host.tsx";
import {
    ChevronDown,
    ChevronRight,
    MoreHorizontal,
    Pencil,
    Plus,
    Power,
    PowerOff,
    RefreshCw,
    RotateCcw,
    SlidersHorizontal,
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
import { Badge } from "../components/ui/badge.tsx";
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
import { sortProviderModels } from "./ai-settings-models.ts";
import { authPath } from "./routes.ts";
import "./settings.css";
import "./ai-settings.css";
import {
    FormField,
    FormFields,
    SearchField,
    SecretInput,
    SettingsCard,
    SettingsGroup,
    SettingsRow,
    StatusBanner,
} from "../components/searcher/semantic.tsx";

const DISCOVERY_MODE_ITEMS: Record<DiscoveryMode, string> = {
    auto: "自动",
    "openai-compatible": "OpenAI 兼容",
    cliproxyapi: "CLIProxyAPIHome",
};

const MODEL_FILTER_THRESHOLD = 5;

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

function isModelUsable(model: AiModelDto): boolean {
    return model.enabled && model.visibleToUsers;
}

type ChangeModelResult =
    | { ok: true }
    | { ok: false; message: string };

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
    const [providerEnabled, setProviderEnabled] = useState(true);
    const [providerEnabledTouched, setProviderEnabledTouched] = useState(false);
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
    const [defaultLevel, setDefaultLevel] = useState<ReasoningEffort | null>(
        "medium",
    );
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [working, setWorking] = useState(false);
    const [pendingModelIds, setPendingModelIds] = useState<Set<string>>(
        () => new Set(),
    );
    const [batchProviderId, setBatchProviderId] = useState<string | null>(null);
    const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(
        () => new Set(),
    );
    const [modelFilters, setModelFilters] = useState<Record<string, string>>(
        {},
    );
    const [error, setError] = useState("");
    const [providerFormError, setProviderFormError] = useState("");
    const [modelConfigError, setModelConfigError] = useState("");
    const [status, setStatus] = useState("");
    const [deleteTarget, setDeleteTarget] = useState<AiProviderDto | null>(
        null,
    );
    const [isDeleting, setIsDeleting] = useState(false);
    const deleteTriggerRef = useRef<HTMLElement | null>(null);
    const lastDeleteTargetRef = useRef<AiProviderDto | null>(null);
    const addButtonRef = useRef<HTMLButtonElement | null>(null);
    const headerHeadingRef = useRef<HTMLHeadingElement | null>(null);
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
        setScope("user");
        setProviderEnabled(true);
        setProviderEnabledTouched(false);
        setDiscoveryMode("auto");
        setProviderFormError("");
        setIsModalOpen(true);
    }

    function openEdit(provider: AiProviderDto) {
        setEditing(provider.id);
        setName(provider.name);
        setBaseUrl(provider.baseUrl);
        setApiKey("");
        setProviderEnabled(provider.enabled);
        setProviderEnabledTouched(false);
        setDiscoveryMode(provider.discoveryMode ?? "auto");
        setProviderFormError("");
        setIsModalOpen(true);
    }

    function closeProviderModal() {
        if (working) return;
        setIsModalOpen(false);
        setProviderFormError("");
    }

    function openModelConfig(model: AiModelDto) {
        const metadata = parseModelMetadata(model.metadataJson);
        const override = metadata.capabilities?.overrides?.reasoning;
        const cap = resolveEffectiveCapability(
            model.metadataJson,
            model.modelId,
        );
        setConfiguringModel(model);
        setModelConfigError("");
        if (override) {
            setManualReasoningEnabled(override.enabled);
            const nextLevels: ReasoningEffort[] =
                Array.isArray(override.levels) && override.levels.length > 0
                    ? override.levels
                    : (cap.levels.length > 0
                        ? cap.levels
                        : ["low", "medium", "high"]);
            setSelectedLevels(nextLevels);
            const nextDefault = override.defaultLevel ?? cap.defaultLevel ??
                nextLevels[0] ?? null;
            setDefaultLevel(
                nextDefault && nextLevels.includes(nextDefault)
                    ? nextDefault
                    : nextLevels[0] ?? null,
            );
        } else {
            const isSupported = cap.status === "supported";
            const nextLevels: ReasoningEffort[] = cap.levels.length > 0
                ? cap.levels
                : ["low", "medium", "high"];
            setManualReasoningEnabled(isSupported);
            setSelectedLevels(nextLevels);
            const nextDefault = cap.defaultLevel ?? nextLevels[0] ?? null;
            setDefaultLevel(
                nextDefault && nextLevels.includes(nextDefault)
                    ? nextDefault
                    : nextLevels[0] ?? null,
            );
        }
    }

    function closeModelConfig() {
        if (working) return;
        setConfiguringModel(null);
        setModelConfigError("");
    }

    function toggleLevel(level: ReasoningEffort) {
        setSelectedLevels((prev) => {
            const updated = prev.includes(level)
                ? prev.filter((l) => l !== level)
                : [...prev, level];
            if (updated.length === 0) {
                setDefaultLevel(null);
            } else if (!defaultLevel || !updated.includes(defaultLevel)) {
                setDefaultLevel(updated[0]);
            }
            return updated;
        });
    }

    async function changeModel(
        id: string,
        patch: Record<string, unknown>,
        options?: { showPageError?: boolean; reload?: boolean },
    ): Promise<ChangeModelResult> {
        const showPageError = options?.showPageError ?? true;
        const reload = options?.reload ?? true;
        if (showPageError) setError("");
        setPendingModelIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
        try {
            await api(
                "/api/ai/models/" + encodeURIComponent(id),
                json("PATCH", patch),
            );
            if (reload) await load();
            return { ok: true };
        } catch (e) {
            const message = errorMessage(e);
            if (showPageError) setError(message);
            return { ok: false, message };
        } finally {
            setPendingModelIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    }

    async function saveModelConfig() {
        if (!configuringModel || working) return;
        const effectiveDefault = manualReasoningEnabled && defaultLevel &&
                selectedLevels.includes(defaultLevel)
            ? defaultLevel
            : manualReasoningEnabled
            ? selectedLevels[0]
            : undefined;
        const override: ReasoningOverride = {
            enabled: manualReasoningEnabled,
            levels: manualReasoningEnabled ? selectedLevels : [],
            defaultLevel: effectiveDefault,
        };
        setWorking(true);
        setModelConfigError("");
        setStatus("");
        try {
            const result = await changeModel(
                configuringModel.id,
                { reasoningOverride: override },
                { showPageError: false },
            );
            if (!result.ok) {
                setModelConfigError(result.message);
                return;
            }
            setConfiguringModel(null);
            setModelConfigError("");
            setStatus("模型推理配置已保存");
        } finally {
            setWorking(false);
        }
    }

    async function revertModelConfig() {
        if (!configuringModel || working) return;
        setWorking(true);
        setModelConfigError("");
        setStatus("");
        try {
            const result = await changeModel(
                configuringModel.id,
                { reasoningOverride: null },
                { showPageError: false },
            );
            if (!result.ok) {
                setModelConfigError(result.message);
                return;
            }
            setConfiguringModel(null);
            setModelConfigError("");
            setStatus("已恢复该模型的自动发现能力");
        } finally {
            setWorking(false);
        }
    }

    async function save(event: React.FormEvent) {
        event.preventDefault();
        if (working) return;
        setProviderFormError("");
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
                            ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
                            discoveryMode,
                            enabled: providerEnabled,
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
            setProviderFormError("");
            setStatus(editing ? "服务商配置已保存" : "服务商和模型已同步");
        } catch (e) {
            setProviderFormError(errorMessage(e));
        } finally {
            setWorking(false);
        }
    }

    async function toggleProviderEnabled(provider: AiProviderDto) {
        if (working) return;
        const nextEnabled = !provider.enabled;
        setWorking(true);
        setError("");
        setStatus("");
        try {
            await api(
                "/api/ai/providers/" + encodeURIComponent(provider.id),
                json("PUT", { enabled: nextEnabled }),
            );
            await load();
            setStatus(
                nextEnabled
                    ? `已启用服务商“${provider.name}”`
                    : `已禁用服务商“${provider.name}”`,
            );
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setWorking(false);
        }
    }

    async function handleToggleModelEnabled(
        provider: AiProviderDto,
        model: AiModelDto,
        checked: boolean,
    ) {
        const wasDefault = model.isDefault;
        const patch: Record<string, unknown> = provider.scope === "user"
            ? { enabled: checked, visibleToUsers: checked }
            : { enabled: checked };
        const result = await changeModel(model.id, patch);
        if (result.ok && !checked && wasDefault) {
            setStatus("已停用原默认模型，本服务商默认标记已清除");
        }
    }

    async function handleToggleModelVisible(
        model: AiModelDto,
        checked: boolean,
    ) {
        const wasDefault = model.isDefault;
        const result = await changeModel(model.id, {
            visibleToUsers: checked,
        });
        if (result.ok && !checked && wasDefault) {
            setStatus("已取消该模型的用户可见状态，本服务商默认标记已清除");
        }
    }

    async function batchToggleModels(
        provider: AiProviderDto,
        targetModels: AiModelDto[],
        enable: boolean,
    ) {
        if (working || batchProviderId) return;
        const candidates = targetModels.filter((m) => {
            if (provider.scope === "user") {
                const currentlyOn = m.enabled && m.visibleToUsers;
                return enable ? !currentlyOn : currentlyOn;
            }
            return enable ? !m.enabled : m.enabled;
        });
        if (candidates.length === 0) return;

        setBatchProviderId(provider.id);
        setError("");
        setStatus("");
        let changed = 0;
        let firstError = "";
        try {
            for (const model of candidates) {
                const patch: Record<string, unknown> = provider.scope === "user"
                    ? { enabled: enable, visibleToUsers: enable }
                    : { enabled: enable };
                const result = await changeModel(model.id, patch, {
                    showPageError: false,
                    reload: false,
                });
                if (result.ok) {
                    changed++;
                } else if (!firstError) {
                    firstError = result.message;
                }
            }
            await load();
            if (firstError) {
                setError(firstError);
            } else if (changed > 0) {
                setStatus(
                    enable
                        ? `已启用 ${changed} 个模型`
                        : `已停用 ${changed} 个模型`,
                );
            }
        } finally {
            setBatchProviderId(null);
        }
    }

    async function refresh(id: string) {
        if (working) return;
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

    function toggleProviderCollapse(id: string) {
        setCollapsedProviders((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
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
                { method: "DELETE" },
            );
            setDeleteTarget(null);
            await load();
            setStatus("服务商已删除");
            requestAnimationFrame(() => {
                (addButtonRef.current ?? headerHeadingRef.current)?.focus();
            });
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setIsDeleting(false);
            setWorking(false);
        }
    }

    const editingProvider = editing
        ? providers.find((p) => p.id === editing) ?? null
        : null;
    const configuringSource = configuringModel
        ? getCapabilitySourceLabel(
            resolveEffectiveCapability(
                configuringModel.metadataJson,
                configuringModel.modelId,
            ).source,
        )
        : "";
    const totalUsableModels = models.filter((model) => {
        const provider = providers.find((p) => p.id === model.providerId);
        return Boolean(provider?.enabled) && isModelUsable(model);
    }).length;

    return (
        <div className="ai-settings-root">
            <header className="ai-settings-header">
                <div className="ai-settings-header-main">
                    <h2
                        ref={headerHeadingRef}
                        tabIndex={-1}
                        className="ai-settings-heading"
                    >
                        服务商与模型
                    </h2>
                    {providers.length > 0 && (
                        <span className="ai-settings-summary">
                            {`${providers.length} 个服务商 · ${totalUsableModels} 个可用模型`}
                        </span>
                    )}
                </div>
                <Button
                    ref={addButtonRef}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={working}
                    onClick={openAdd}
                >
                    <Plus size="1em" className="icon-sm" aria-hidden="true" />
                    <span>添加 AI 服务商</span>
                </Button>
            </header>

            <StatusBanner
                open={Boolean(error) && !isModalOpen && !configuringModel}
                tone="error"
                className="ai-top-error"
            >
                {error}
            </StatusBanner>

            {providers.length === 0 && (
                <SettingsGroup footer="添加 OpenAI 兼容服务商并启用模型后即可在首页或对话页发起 AI 问答。">
                    <SettingsRow title="尚未添加 AI 服务商">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={working}
                            onClick={openAdd}
                        >
                            <Plus
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                            <span>添加服务商</span>
                        </Button>
                    </SettingsRow>
                </SettingsGroup>
            )}

            {providers.map((provider) => {
                const manageable = provider.ownerUserId === user.id ||
                    user.role === "admin";
                const providerModels = sortProviderModels(
                    models.filter((model) => model.providerId === provider.id),
                    provider.scope,
                );
                const usableCount = providerModels.filter(isModelUsable).length;
                const collapsed = collapsedProviders.has(provider.id);
                const filterText = (modelFilters[provider.id] ?? "").trim();
                const showToolbar = providerModels.length >
                    MODEL_FILTER_THRESHOLD;
                const filteredModels = filterText
                    ? providerModels.filter((model) => {
                        const q = filterText.toLowerCase();
                        return model.displayName.toLowerCase().includes(q) ||
                            model.modelId.toLowerCase().includes(q);
                    })
                    : providerModels;
                const isBatchBusy = batchProviderId === provider.id;
                const panelId = `ai-provider-panel-${provider.id}`;
                const activeDefaultId = providerModels.find((model) =>
                    model.isDefault && isModelUsable(model)
                )?.id ?? null;

                const renderModelRow = (model: AiModelDto) => {
                    const reasoning = describeReasoning(
                        resolveEffectiveCapability(
                            model.metadataJson,
                            model.modelId,
                        ),
                    );
                    const modelPending = pendingModelIds.has(model.id) ||
                        isBatchBusy;
                    const usable = isModelUsable(model);
                    const effectiveEnabled = provider.scope === "user"
                        ? model.enabled && model.visibleToUsers
                        : model.enabled;
                    const summary = [
                        model.supportsText ? "文本" : null,
                        model.supportsVision ? "视觉" : null,
                        model.supportsTools ? "工具" : null,
                        model.supportsStreaming ? "流式" : null,
                    ].filter(Boolean).join(" · ");

                    return (
                        <div
                            key={model.id}
                            className="ai-model-row"
                            data-pending={modelPending || undefined}
                            data-inactive={!usable || !provider.enabled ||
                                undefined}
                        >
                            <div className="ai-model-head">
                                <div className="ai-model-identity">
                                    <div className="ai-model-title-line">
                                        <span className="ai-model-name">
                                            {model.displayName}
                                        </span>
                                        {model.displayName !== model.modelId &&
                                            (
                                                <span className="ai-model-subid">
                                                    {model.modelId}
                                                </span>
                                            )}
                                        {!manageable && model.isDefault && (
                                            <Badge variant="secondary">
                                                默认
                                            </Badge>
                                        )}
                                        {manageable &&
                                            provider.scope === "system" &&
                                            model.enabled &&
                                            !model.visibleToUsers && (
                                            <Badge variant="secondary">
                                                未对用户开放
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="ai-model-meta">
                                        {summary}
                                        {summary && " · "}
                                        <span title={reasoning.title}>
                                            {reasoning.label}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {manageable && (
                                <div className="ai-model-controls">
                                    <label
                                        className="ai-model-toggle"
                                        data-disabled={modelPending ||
                                            undefined}
                                    >
                                        <Switch
                                            aria-label={`启用 ${model.displayName}`}
                                            checked={effectiveEnabled}
                                            disabled={modelPending || working}
                                            onCheckedChange={(checked) =>
                                                void handleToggleModelEnabled(
                                                    provider,
                                                    model,
                                                    checked,
                                                )}
                                        />
                                        <span>启用</span>
                                    </label>
                                    {provider.scope === "system" && (
                                        <label
                                            className="ai-model-toggle"
                                            data-disabled={modelPending ||
                                                undefined}
                                        >
                                            <Switch
                                                aria-label={`对用户可见 ${model.displayName}`}
                                                checked={model.visibleToUsers}
                                                disabled={modelPending ||
                                                    working}
                                                onCheckedChange={(checked) =>
                                                    void handleToggleModelVisible(
                                                        model,
                                                        checked,
                                                    )}
                                            />
                                            <span>对用户可见</span>
                                        </label>
                                    )}
                                    <RadioGroupItem
                                        value={model.id}
                                        disabled={!usable || modelPending ||
                                            working}
                                        className="ai-model-default-radio"
                                        aria-label={`设为本服务商默认 ${model.displayName}`}
                                    >
                                        默认（本服务商）
                                    </RadioGroupItem>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="ai-model-reasoning-btn"
                                        disabled={modelPending || working}
                                        onClick={() =>
                                            openModelConfig(model)}
                                    >
                                        <SlidersHorizontal
                                            size="1em"
                                            className="icon-sm"
                                            aria-hidden="true"
                                        />
                                        <span>推理设置</span>
                                    </Button>
                                </div>
                            )}
                        </div>
                    );
                };

                return (
                    <section
                        key={provider.id}
                        className="ai-provider-section"
                        data-disabled={!provider.enabled || undefined}
                    >
                        <header className="ai-provider-header">
                            <button
                                type="button"
                                className="ai-provider-collapse-btn"
                                aria-expanded={!collapsed}
                                aria-controls={panelId}
                                onClick={() =>
                                    toggleProviderCollapse(provider.id)}
                            >
                                {collapsed
                                    ? (
                                        <ChevronRight
                                            size="1em"
                                            className="icon-sm ai-provider-chevron"
                                            aria-hidden="true"
                                        />
                                    )
                                    : (
                                        <ChevronDown
                                            size="1em"
                                            className="icon-sm ai-provider-chevron"
                                            aria-hidden="true"
                                        />
                                    )}
                                <h3 className="ai-provider-title">
                                    {provider.name}
                                </h3>
                                <span className="ai-provider-badges">
                                    <Badge variant="secondary">
                                        {provider.scope === "system"
                                            ? "系统共享"
                                            : "个人"}
                                    </Badge>
                                    {!provider.enabled && (
                                        <Badge variant="destructive">
                                            已禁用
                                        </Badge>
                                    )}
                                </span>
                                <span className="ai-provider-count">
                                    {`${usableCount} / ${providerModels.length} 可用`}
                                </span>
                            </button>

                            {manageable && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger
                                        id={"provider-menu-" + provider.id}
                                        className={buttonVariants({
                                            variant: "ghost",
                                            size: "icon",
                                            className: "ai-provider-menu-btn",
                                        })}
                                        aria-label={`服务商操作：${provider.name}`}
                                        disabled={working || isBatchBusy}
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
                                                void toggleProviderEnabled(
                                                    provider,
                                                )}
                                        >
                                            {provider.enabled
                                                ? (
                                                    <PowerOff
                                                        size="1em"
                                                        className="icon-sm"
                                                        aria-hidden="true"
                                                    />
                                                )
                                                : (
                                                    <Power
                                                        size="1em"
                                                        className="icon-sm"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                            <span>
                                                {provider.enabled
                                                    ? "禁用服务商"
                                                    : "启用服务商"}
                                            </span>
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
                            )}
                        </header>

                        {!collapsed && (
                            <SettingsCard
                                id={panelId}
                                className="ai-provider-card"
                            >
                                {!provider.enabled && (
                                    <div className="ai-provider-disabled-banner">
                                        <span>
                                            该服务商已禁用，旗下模型暂不可用于对话。
                                        </span>
                                        {manageable && (
                                            <div className="ai-provider-disabled-banner-actions">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={working}
                                                    onClick={() =>
                                                        openEdit(provider)}
                                                >
                                                    编辑并配置
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="default"
                                                    size="sm"
                                                    disabled={working}
                                                    onClick={() =>
                                                        void toggleProviderEnabled(
                                                            provider,
                                                        )}
                                                >
                                                    立即启用
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {showToolbar && (
                                    <div className="ai-model-toolbar">
                                        <SearchField
                                            wrapperClassName="ai-model-search"
                                            value={modelFilters[provider.id] ??
                                                ""}
                                            onValueChange={(value) =>
                                                setModelFilters((prev) => ({
                                                    ...prev,
                                                    [provider.id]: value,
                                                }))}
                                            placeholder="筛选模型名称或 ID…"
                                            aria-label={`筛选 ${provider.name} 的模型`}
                                            clearLabel={`清除 ${provider.name} 的筛选`}
                                        />
                                        {manageable && (
                                            <div className="ai-model-batch-actions">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={working ||
                                                        isBatchBusy ||
                                                        filteredModels
                                                                .length ===
                                                            0}
                                                    onClick={() =>
                                                        void batchToggleModels(
                                                            provider,
                                                            filteredModels,
                                                            true,
                                                        )}
                                                >
                                                    全部启用
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={working ||
                                                        isBatchBusy ||
                                                        filteredModels
                                                                .length ===
                                                            0}
                                                    onClick={() =>
                                                        void batchToggleModels(
                                                            provider,
                                                            filteredModels,
                                                            false,
                                                        )}
                                                >
                                                    全部停用
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {providerModels.length === 0
                                    ? (
                                        <SettingsRow title="暂无模型">
                                            {manageable && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={working}
                                                    onClick={() =>
                                                        void refresh(
                                                            provider.id,
                                                        )}
                                                >
                                                    刷新
                                                </Button>
                                            )}
                                        </SettingsRow>
                                    )
                                    : filteredModels.length === 0
                                    ? (
                                        <div className="ai-empty-row">
                                            <span>没有匹配的模型</span>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    setModelFilters((prev) => ({
                                                        ...prev,
                                                        [provider.id]: "",
                                                    }))}
                                            >
                                                清除筛选
                                            </Button>
                                        </div>
                                    )
                                    : manageable
                                    ? (
                                        <RadioGroup
                                            variant="rows"
                                            aria-label={`${provider.name} 默认模型（本服务商）`}
                                            value={activeDefaultId}
                                            onValueChange={(modelId) =>
                                                void changeModel(
                                                    String(modelId),
                                                    { isDefault: true },
                                                )}
                                        >
                                            {filteredModels.map(renderModelRow)}
                                        </RadioGroup>
                                    )
                                    : (
                                        <div>
                                            {filteredModels.map(renderModelRow)}
                                        </div>
                                    )}
                            </SettingsCard>
                        )}

                        <p className="settings-group-footer">
                            <span className="ai-provider-meta">
                                {`${provider.baseUrl} · Key ${provider.apiKeyMasked}`}
                            </span>
                        </p>
                    </section>
                );
            })}

            <Dialog
                open={host.active && isModalOpen}
                onOpenChange={(open) => {
                    if (!open) closeProviderModal();
                }}
            >
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
                                    disabled={working}
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
                                    disabled={working}
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
                                    disabled={working}
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
                                hint={editing && editingProvider &&
                                        !editingProvider.enabled
                                    ? "加密保存在服务端；填写有效 API Key 后将自动勾选启用。"
                                    : "加密保存在服务端。"}
                                messageId="ai-api-key-hint"
                            >
                                <SecretInput
                                    key={`${editing ?? "new"}-${isModalOpen}`}
                                    id="ai-api-key"
                                    required={!editing}
                                    disabled={working}
                                    autoComplete="off"
                                    aria-describedby="ai-api-key-hint"
                                    value={apiKey}
                                    onChange={(e) => {
                                        const nextVal = e.target.value;
                                        setApiKey(nextVal);
                                        if (
                                            editing &&
                                            editingProvider &&
                                            !editingProvider.enabled &&
                                            !providerEnabledTouched &&
                                            nextVal.trim().length > 0
                                        ) {
                                            setProviderEnabled(true);
                                        }
                                    }}
                                    placeholder={editing
                                        ? "留空保持现有 Key"
                                        : "输入 API Key"}
                                    showLabel="显示 API Key"
                                    hideLabel="隐藏 API Key"
                                />
                            </FormField>
                            {editing && (
                                <div className="ai-provider-enable-row">
                                    <div className="ai-provider-enable-copy">
                                        <label
                                            htmlFor="ai-provider-enabled-switch"
                                            className="ai-provider-enable-label"
                                        >
                                            启用该服务商
                                        </label>
                                        <span className="ai-provider-enable-hint">
                                            禁用后该服务商下所有模型均不可用于对话。
                                        </span>
                                    </div>
                                    <Switch
                                        id="ai-provider-enabled-switch"
                                        aria-label="启用该服务商"
                                        checked={providerEnabled}
                                        disabled={working}
                                        onCheckedChange={(checked) => {
                                            setProviderEnabled(checked);
                                            setProviderEnabledTouched(true);
                                        }}
                                    />
                                </div>
                            )}
                            {!editing && user.role === "admin" && (
                                <FormField label="范围">
                                    <RadioGroup
                                        variant="segmented"
                                        aria-label="范围"
                                        value={scope}
                                        disabled={working}
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
                        {providerFormError && (
                            <StatusBanner tone="error">
                                {providerFormError}
                            </StatusBanner>
                        )}
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={working}
                                onClick={closeProviderModal}
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
                open={host.active && configuringModel !== null}
                onOpenChange={(open) => {
                    if (!open) closeModelConfig();
                }}
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
                                    disabled={working}
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
                                                            disabled={working}
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
                                            value={selectedLevels.length > 0
                                                ? defaultLevel
                                                : null}
                                            disabled={working ||
                                                selectedLevels.length === 0}
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
                                                <SelectValue>
                                                    {(
                                                        value:
                                                            | ReasoningEffort
                                                            | null,
                                                    ) => value &&
                                                            selectedLevels
                                                                .includes(value)
                                                        ? getReasoningEffortLabel(
                                                            value,
                                                        )
                                                        : "请先选择支持的强度"}
                                                </SelectValue>
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
                            {modelConfigError && (
                                <StatusBanner tone="error">
                                    {modelConfigError}
                                </StatusBanner>
                            )}
                            <div className="model-config-actions">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    disabled={working}
                                    onClick={() => void revertModelConfig()}
                                >
                                    <RotateCcw size="1em" className="icon-sm" />
                                    <span>恢复自动发现</span>
                                </Button>
                                <div className="model-config-action-group">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={working}
                                        onClick={closeModelConfig}
                                    >
                                        取消
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="default"
                                        onClick={() => void saveModelConfig()}
                                        disabled={working ||
                                            (manualReasoningEnabled &&
                                                selectedLevels.length === 0)}
                                    >
                                        {working ? "保存中…" : "保存"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={host.active && deleteTarget !== null}
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
                        <AlertDialogCancel disabled={isDeleting}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={isDeleting}
                            onClick={() => void handleConfirmDelete()}
                        >
                            {isDeleting ? "正在删除…" : "删除"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <StatusBanner
                tone="success"
                presentation="floating"
                open={host.active && status !== ""}
            >
                {status}
            </StatusBanner>
        </div>
    );
}
