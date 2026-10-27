import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Eye, EyeOff, MoreHorizontal, Plus, RotateCcw } from "lucide-react";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
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
    NativeSelect,
    NativeSelectOption,
} from "../components/ui/native-select.tsx";
import { api, json } from "../lib/api.ts";
import { errorMessage, useAppState } from "./state.tsx";
import { authPath } from "./routes.ts";
import "./settings.css";
import {
    SettingsGroup,
    SettingsRow,
    StatusBanner,
} from "../components/searcher/semantic.tsx";

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
    return { label: "推理未知", title: "Provider 未声明推理支持状态" };
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
                <SettingsRow title="管理 Provider">
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
            setStatus("Provider 已删除");
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
                                        aria-label={`Provider 操作：${provider.name}`}
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
                                            编辑
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            disabled={working}
                                            onClick={() =>
                                                void refresh(provider.id)}
                                        >
                                            刷新模型
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            variant="destructive"
                                            disabled={working || isDeleting}
                                            onClick={() => openDelete(provider)}
                                        >
                                            删除
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
                                                <input
                                                    type="checkbox"
                                                    aria-label={`启用 ${model.displayName}`}
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
                                                />
                                                启用
                                            </label>
                                            <label className="ai-model-toggle">
                                                <input
                                                    type="checkbox"
                                                    aria-label={`可见 ${model.displayName}`}
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
                                                />
                                                可见
                                            </label>
                                            <label className="ai-model-toggle">
                                                <input
                                                    type="radio"
                                                    name={"default-" +
                                                        provider.id}
                                                    aria-label={`设为默认 ${model.displayName}`}
                                                    checked={model.isDefault}
                                                    onChange={() =>
                                                        void changeModel(
                                                            model.id,
                                                            {
                                                                isDefault: true,
                                                            },
                                                        )}
                                                />
                                                默认
                                            </label>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
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
                    </SettingsGroup>
                );
            })}
            <SettingsGroup
                footer={providers.length === 0
                    ? "尚未添加 Provider，添加后即可在首页使用 AI 问答。"
                    : undefined}
            >
                <Button
                    type="button"
                    variant="ghost"
                    className="settings-add-row"
                    onClick={openAdd}
                >
                    <Plus size="1em" className="icon-md" />
                    <span>添加 Provider</span>
                </Button>
            </SettingsGroup>
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent
                    aria-label={editing ? "编辑 Provider" : "添加 Provider"}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {editing ? "编辑 Provider" : "添加 Provider"}
                        </DialogTitle>
                        <DialogDescription>
                            OpenAI 兼容 API，保存时自动验证连接。
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={save} className="ai-provider-form">
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
                            发现模式
                            <NativeSelect
                                value={discoveryMode}
                                onChange={(e) => setDiscoveryMode(
                                    e.target.value as DiscoveryMode,
                                )}
                            >
                                <NativeSelectOption value="auto">
                                    自动
                                </NativeSelectOption>
                                <NativeSelectOption value="openai-compatible">
                                    OpenAI 兼容
                                </NativeSelectOption>
                                <NativeSelectOption value="cliproxyapi">
                                    CLIProxyAPIHome
                                </NativeSelectOption>
                            </NativeSelect>
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
                                        ? (
                                            <EyeOff
                                                size="1em"
                                                className="icon-md"
                                            />
                                        )
                                        : (
                                            <Eye
                                                size="1em"
                                                className="icon-md"
                                            />
                                        )}
                                </Button>
                            </div>
                            <p className="ai-field-hint">加密保存在服务端。</p>
                        </div>
                        {!editing && user.role === "admin" && (
                            <label className="field">
                                范围
                                <NativeSelect
                                    value={scope}
                                    onChange={(e) =>
                                        setScope(
                                            e.target.value as "user" | "system",
                                        )}
                                >
                                    <NativeSelectOption value="user">
                                        仅自己
                                    </NativeSelectOption>
                                    <NativeSelectOption value="system">
                                        所有用户
                                    </NativeSelectOption>
                                </NativeSelect>
                            </label>
                        )}
                        {error && (
                            <p role="alert" className="error ai-form-error">
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
                                    ? "正在验证…"
                                    : editing
                                    ? "保存并验证"
                                    : "验证并添加"}
                            </Button>
                        </div>
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
                                    开启推理
                                </label>
                            </div>
                            {manualReasoningEnabled && (
                                <>
                                    <div
                                        className="field"
                                        role="group"
                                        aria-labelledby="reasoning-levels-label"
                                    >
                                        <span id="reasoning-levels-label">
                                            支持的强度
                                        </span>
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
                                        默认强度
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
                        <AlertDialogTitle>删除 Provider？</AlertDialogTitle>
                        <AlertDialogDescription>
                            {activeDeleteTarget
                                ? `“${activeDeleteTarget.name}” 及其模型将被永久删除。`
                                : "该 Provider 及其模型将被永久删除。"}
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
