import {
    AttachmentPrimitive,
    ComposerPrimitive,
    ThreadPrimitive,
    useAui,
    useAuiState,
} from "@assistant-ui/react";
import {
    AlertCircle,
    ArrowUp,
    ChevronDown,
    Paperclip,
    SlidersHorizontal,
    Sparkles,
    Square,
    X,
} from "lucide-react";
import {
    type ModelOption,
    ModelSelector,
} from "../../components/searcher/ModelSelector.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "../../components/ui/popover.tsx";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "../../components/ui/tooltip.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import { Button } from "../../components/ui/button.tsx";
import type { AiModelDto } from "../../../../src/features/ai/types.ts";
import {
    type AiCapabilitiesDto,
    type GenerationConfig,
    REASONING_EFFORT_LABELS,
    type ToolsConfig,
} from "./types.ts";
import { ReasoningSelector } from "./ReasoningSelector.tsx";
import { GenerationSettings } from "./GenerationSettings.tsx";
import { useAttachmentError } from "./assistant-runtime.tsx";
import { hasCustomGenerationOverrides } from "./ask-ui-helpers.ts";
interface SearcherComposerProps {
    models: AiModelDto[];
    modelOptions: ModelOption[];
    selectedModelId: string | null;
    onSelectModel: (id: string) => void;
    generationConfig: GenerationConfig;
    baselineGenerationConfig?: GenerationConfig;
    onChangeGenerationConfig: (cfg: GenerationConfig) => void;
    toolsConfig: ToolsConfig;
    onChangeToolsConfig: (cfg: ToolsConfig) => void;
    capabilities: AiCapabilitiesDto | null;
    onSaveDefaultGenerationConfig?: (
        config: GenerationConfig,
    ) => Promise<void> | void;
    onResetDefaultGenerationConfig?: () => Promise<void> | void;
    isDefaultGenerationConfig?: boolean;
}

function ComposerAttachmentChip() {
    const image = useAuiState((s) =>
        s.attachment.content?.find((part) => part.type === "image")
    );
    const status = useAuiState((s) => s.attachment.status);
    const isError = status?.type === "incomplete";

    return (
        <AttachmentPrimitive.Root
            className={`ask-composer__attachment-chip ${
                isError ? "is-error" : ""
            }`}
        >
            {image?.type === "image" && (
                <img
                    src={image.image}
                    alt="图片附件预览"
                    width={20}
                    height={20}
                    className="ask-attachment-preview"
                />
            )}
            {isError && (
                <AlertCircle
                    size="1em"
                    className="icon-sm"
                    aria-hidden="true"
                />
            )}
            <span className="ask-composer__attachment-name">
                <AttachmentPrimitive.Name />
            </span>
            <AttachmentPrimitive.Remove asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ask-composer__attachment-remove"
                    aria-label="移除附件"
                >
                    <X size="1em" className="icon-sm" aria-hidden="true" />
                </Button>
            </AttachmentPrimitive.Remove>
        </AttachmentPrimitive.Root>
    );
}

export function SearcherComposer({
    models,
    modelOptions,
    selectedModelId,
    onSelectModel,
    generationConfig,
    baselineGenerationConfig = {},
    onChangeGenerationConfig,
    toolsConfig,
    onChangeToolsConfig,
    capabilities,
    onSaveDefaultGenerationConfig,
    onResetDefaultGenerationConfig,
    isDefaultGenerationConfig,
}: SearcherComposerProps) {
    const activeModel = models.find((m) => m.id === selectedModelId);
    const supportsVision = activeModel?.supportsVision ?? false;
    const supportsTools = activeModel?.supportsTools ?? false;
    const availableReasoningLevels = activeModel?.supportsReasoning
        ? (activeModel.reasoningEfforts ?? [])
        : [];

    const aui = useAui();
    const { attachmentError, clearAttachmentError } = useAttachmentError();
    const isComposerEmpty = useAuiState((s) =>
        s.composer.text.trim().length === 0 &&
        s.composer.attachments.length === 0
    );

    const handleDragOver = (e: React.DragEvent) => {
        if (
            e.dataTransfer &&
            (e.dataTransfer.types?.includes("Files") ||
                (e.dataTransfer.files && e.dataTransfer.files.length > 0))
        ) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        const files = e.dataTransfer?.files
            ? Array.from(e.dataTransfer.files)
            : [];
        if (files.length === 0) return;
        e.preventDefault();
        for (const file of files) {
            try {
                await aui.composer.addAttachment(file);
            } catch {
                // Handled via adapter onError
            }
        }
    };

    const activeTools: Array<{
        key: "documents" | "apps" | "webSearch";
        label: string;
    }> = [];
    if (
        supportsTools && toolsConfig.documents &&
        capabilities?.tools.documents !== false
    ) {
        activeTools.push({ key: "documents", label: "搜索笔记" });
    }
    if (supportsTools && toolsConfig.apps) {
        activeTools.push({ key: "apps", label: "搜索应用" });
    }
    if (
        supportsTools && toolsConfig.webSearch &&
        capabilities?.tools.webSearch !== false
    ) {
        activeTools.push({ key: "webSearch", label: "联网搜索" });
    }
    const hasActiveSettings = hasCustomGenerationOverrides(
        generationConfig,
        baselineGenerationConfig,
        activeModel?.isReasoningStrict,
    );
    return (
        <div className="ask-composer-container">
            <ComposerPrimitive.Root
                className="ask-composer-surface"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {/* Assistant-UI Attachments Preview */}
                <div className="ask-composer__attachments-bar">
                    <ComposerPrimitive.Attachments
                        components={{
                            Attachment: ComposerAttachmentChip,
                        }}
                    />
                </div>
                {activeTools.length > 0 && (
                    <div
                        className="ask-composer__active-tools"
                        role="group"
                        aria-label="已启用的检索工具"
                    >
                        {activeTools.map((tool) => (
                            <button
                                key={tool.key}
                                type="button"
                                className="ask-composer__tool-chip"
                                aria-label={`关闭${tool.label}`}
                                onClick={() =>
                                    onChangeToolsConfig({
                                        ...toolsConfig,
                                        [tool.key]: false,
                                    })}
                            >
                                <span>{tool.label}</span>
                                <X
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                            </button>
                        ))}
                    </div>
                )}

                {/* User-Visible Attachment Error Banner */}
                {attachmentError && (
                    <div
                        role="alert"
                        className="ask-composer__attachment-error"
                    >
                        <AlertCircle
                            size="1em"
                            className="icon-sm"
                            aria-hidden="true"
                        />
                        <span className="ask-composer__attachment-error-msg">
                            {attachmentError}
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={clearAttachmentError}
                            className="ask-composer__attachment-error-close"
                            aria-label="关闭附件错误"
                        >
                            <X
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                        </Button>
                    </div>
                )}

                {/* Assistant-UI Auto-Growing Accessible Input */}
                <ComposerPrimitive.Input
                    placeholder="输入问题…"
                    className="ask-composer__textarea"
                    rows={1}
                    autoFocus
                    aria-label="向 AI 提问"
                />

                {/* Bottom Controls Bar */}
                <div className="ask-composer__toolbar">
                    <div className="ask-composer__tools-left">
                        {/* Assistant-UI Add Attachment Button */}
                        <Tooltip>
                            <ComposerPrimitive.AddAttachment asChild>
                                <TooltipTrigger
                                    render={
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="ask-composer__icon-btn"
                                            aria-label="添加文件"
                                        />
                                    }
                                >
                                    <Paperclip
                                        size="1em"
                                        className="icon-md"
                                        aria-hidden="true"
                                    />
                                </TooltipTrigger>
                            </ComposerPrimitive.AddAttachment>
                            <TooltipContent>
                                {supportsVision
                                    ? "添加图片或文件，也可拖拽文件到输入框"
                                    : "添加文件，也可拖拽文件到输入框"}
                            </TooltipContent>
                        </Tooltip>

                        {/* Low-frequency controls in one shared settings panel */}
                        <Popover>
                            <Tooltip>
                                <TooltipTrigger
                                    render={
                                        <PopoverTrigger
                                            render={
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="ask-composer__icon-btn"
                                                    aria-label="更多设置（推理、搜索与生成）"
                                                />
                                            }
                                        />
                                    }
                                >
                                    <SlidersHorizontal
                                        size="1em"
                                        className="icon-md"
                                        aria-hidden="true"
                                    />
                                    {hasActiveSettings && (
                                        <span
                                            className="ask-composer__active-dot"
                                            aria-hidden="true"
                                        />
                                    )}
                                </TooltipTrigger>
                                <TooltipContent>更多设置</TooltipContent>
                            </Tooltip>
                            <PopoverContent
                                side="top"
                                align="start"
                                sideOffset={8}
                                className="ask-composer__settings-panel"
                                aria-label="问答设置"
                            >
                                <section className="ask-composer__tools-panel">
                                    <h3>扩展检索</h3>
                                    {!supportsTools && (
                                        <p
                                            className="ask-composer__tools-unavailable"
                                            role="status"
                                        >
                                            当前模型不支持工具调用。切换到支持工具的模型后，可使用搜索笔记、搜索应用和联网搜索。
                                        </p>
                                    )}
                                    <div className="ask-composer__tool-options">
                                        <div className="ask-composer__tool-option">
                                            <div className="ask-composer__tool-label">
                                                <label htmlFor="tool-documents">
                                                    搜索笔记
                                                </label>
                                                {capabilities?.tools
                                                            .documents ===
                                                        false && (
                                                    <span className="ask-composer__tool-note">
                                                        服务端未配置
                                                    </span>
                                                )}
                                            </div>
                                            <Switch
                                                id="tool-documents"
                                                aria-label="搜索笔记"
                                                size="sm"
                                                disabled={!supportsTools ||
                                                    capabilities?.tools
                                                            .documents ===
                                                        false}
                                                checked={Boolean(
                                                    toolsConfig.documents,
                                                )}
                                                onCheckedChange={(checked) =>
                                                    onChangeToolsConfig({
                                                        ...toolsConfig,
                                                        documents: checked,
                                                    })}
                                            />
                                        </div>

                                        <div className="ask-composer__tool-option">
                                            <label htmlFor="tool-apps">
                                                搜索应用
                                            </label>
                                            <Switch
                                                id="tool-apps"
                                                aria-label="搜索应用"
                                                size="sm"
                                                disabled={!supportsTools}
                                                checked={Boolean(
                                                    toolsConfig.apps,
                                                )}
                                                onCheckedChange={(checked) =>
                                                    onChangeToolsConfig({
                                                        ...toolsConfig,
                                                        apps: checked,
                                                    })}
                                            />
                                        </div>

                                        <div className="ask-composer__tool-option">
                                            <div className="ask-composer__tool-label">
                                                <label htmlFor="tool-web">
                                                    联网搜索（SearXNG）
                                                </label>
                                                {capabilities?.tools
                                                            .webSearch ===
                                                        false && (
                                                    <span className="ask-composer__tool-note">
                                                        服务端未配置
                                                    </span>
                                                )}
                                            </div>
                                            <Switch
                                                id="tool-web"
                                                aria-label="联网搜索（SearXNG）"
                                                size="sm"
                                                disabled={!supportsTools ||
                                                    capabilities?.tools
                                                            .webSearch ===
                                                        false}
                                                checked={Boolean(
                                                    toolsConfig.webSearch,
                                                )}
                                                onCheckedChange={(checked) =>
                                                    onChangeToolsConfig({
                                                        ...toolsConfig,
                                                        webSearch: checked,
                                                    })}
                                            />
                                        </div>
                                    </div>
                                </section>

                                <ReasoningSelector
                                    model={activeModel}
                                    value={generationConfig.reasoningEffort}
                                    onChange={(reasoningEffort) =>
                                        onChangeGenerationConfig({
                                            ...generationConfig,
                                            reasoningEffort,
                                        })}
                                />
                                <GenerationSettings
                                    config={generationConfig}
                                    onChange={onChangeGenerationConfig}
                                    model={activeModel}
                                    isReasoningStrict={activeModel
                                        ?.isReasoningStrict}
                                    onSaveDefault={onSaveDefaultGenerationConfig}
                                    onResetDefault={onResetDefaultGenerationConfig}
                                    isDefault={isDefaultGenerationConfig}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div className="ask-composer__tools-right">
                        {/* Quick reasoning effort switcher (desktop/tablet) */}
                        {availableReasoningLevels.length > 0 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    className="model-pill model-trigger ask-composer__reasoning-trigger"
                                    aria-label="切换推理强度"
                                    title="切换推理强度"
                                >
                                    <Sparkles
                                        size="1em"
                                        className="icon-sm"
                                        aria-hidden="true"
                                    />
                                    <span className="model-pill-label">
                                        {generationConfig.reasoningEffort
                                            ? (REASONING_EFFORT_LABELS[
                                                generationConfig
                                                    .reasoningEffort
                                            ] ??
                                                generationConfig
                                                    .reasoningEffort)
                                            : "默认"}
                                    </span>
                                    <ChevronDown
                                        size="1em"
                                        className="icon-sm"
                                        aria-hidden="true"
                                    />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    side="top"
                                    align="end"
                                    sideOffset={8}
                                    aria-label="推理强度"
                                >
                                    <DropdownMenuRadioGroup
                                        aria-label="推理强度"
                                        value={generationConfig
                                            .reasoningEffort ?? "default"}
                                        onValueChange={(next) =>
                                            onChangeGenerationConfig({
                                                ...generationConfig,
                                                reasoningEffort:
                                                    availableReasoningLevels
                                                        .find(
                                                            (level) =>
                                                                level === next,
                                                        ),
                                            })}
                                    >
                                        <DropdownMenuRadioItem
                                            value="default"
                                            closeOnClick
                                        >
                                            默认
                                        </DropdownMenuRadioItem>
                                        {availableReasoningLevels.map(
                                            (level) => (
                                                <DropdownMenuRadioItem
                                                    key={level}
                                                    value={level}
                                                    closeOnClick
                                                >
                                                    {REASONING_EFFORT_LABELS[
                                                        level
                                                    ] ?? level}
                                                </DropdownMenuRadioItem>
                                            ),
                                        )}
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}

                        {/* Model Selector */}
                        <ModelSelector
                            models={modelOptions}
                            selected={selectedModelId}
                            onChange={onSelectModel}
                            align="end"
                        />
                        <ThreadPrimitive.If running={false}>
                            <Tooltip>
                                <ComposerPrimitive.Send asChild>
                                    <TooltipTrigger
                                        render={
                                            <Button
                                                variant="default"
                                                size="icon"
                                                className="ask-composer__send-btn"
                                                data-empty={isComposerEmpty
                                                    ? "true"
                                                    : undefined}
                                                aria-label="发送问题（Enter）"
                                            />
                                        }
                                    >
                                        <ArrowUp
                                            size="1em"
                                            className="icon-md"
                                            aria-hidden="true"
                                        />
                                    </TooltipTrigger>
                                </ComposerPrimitive.Send>
                                <TooltipContent>
                                    发送问题（Enter）
                                </TooltipContent>
                            </Tooltip>
                        </ThreadPrimitive.If>

                        <ThreadPrimitive.If running>
                            <Tooltip>
                                <ComposerPrimitive.Cancel asChild>
                                    <TooltipTrigger
                                        render={
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="ask-composer__send-btn"
                                                aria-label="停止生成"
                                            />
                                        }
                                    >
                                        <Square
                                            size="1em"
                                            className="icon-md"
                                            aria-hidden="true"
                                        />
                                    </TooltipTrigger>
                                </ComposerPrimitive.Cancel>
                                <TooltipContent>停止生成</TooltipContent>
                            </Tooltip>
                        </ThreadPrimitive.If>
                    </div>
                </div>
            </ComposerPrimitive.Root>
        </div>
    );
}
