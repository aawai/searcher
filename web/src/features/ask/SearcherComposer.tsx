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
    Ellipsis,
    Paperclip,
    Square,
    Wrench,
    X,
} from "lucide-react";
import {
    type ModelOption,
    ModelSelector,
} from "../../components/searcher/ModelSelector.tsx";
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
import type {
    AiCapabilitiesDto,
    GenerationConfig,
    ToolsConfig,
} from "./types.ts";
import { ReasoningSelector } from "./ReasoningSelector.tsx";
import { GenerationSettings } from "./GenerationSettings.tsx";
import { useAttachmentError } from "./assistant-runtime.tsx";
interface SearcherComposerProps {
    models: AiModelDto[];
    modelOptions: ModelOption[];
    selectedModelId: string | null;
    onSelectModel: (id: string) => void;
    generationConfig: GenerationConfig;
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
                isError ? "is-error border-danger/50 text-danger" : ""
            }`}
        >
            {image?.type === "image" && (
                <img
                    src={image.image}
                    alt="图片附件预览"
                    className="ask-attachment-preview"
                />
            )}
            {isError && (
                <AlertCircle size={12} className="shrink-0 text-danger" />
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
                    <X size={12} />
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

    const aui = useAui();
    const { attachmentError, clearAttachmentError } = useAttachmentError();

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

    const activeTools = [
        supportsTools && toolsConfig.notes ? "笔记检索" : undefined,
        supportsTools && toolsConfig.apps ? "应用检索" : undefined,
        supportsTools && toolsConfig.webSearch &&
            capabilities?.tools.webSearch !== false
            ? "联网搜索"
            : undefined,
    ].filter((tool): tool is string => tool !== undefined);
    const hasActiveTools = activeTools.length > 0;
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
                            <span
                                key={tool}
                                className="ask-composer__tool-chip"
                            >
                                {tool}
                            </span>
                        ))}
                    </div>
                )}

                {/* User-Visible Attachment Error Banner */}
                {attachmentError && (
                    <div
                        role="alert"
                        className="ask-composer__attachment-error"
                    >
                        <div className="flex items-center gap-1.5 overflow-hidden">
                            <AlertCircle size={13} className="shrink-0" />
                            <span className="truncate">{attachmentError}</span>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={clearAttachmentError}
                            className="h-5 w-5 p-0 hover:bg-transparent"
                            aria-label="关闭附件错误"
                        >
                            <X size={12} />
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
                                            aria-label="添加附件 (图片/文档)"
                                        />
                                    }
                                >
                                    <Paperclip size={16} />
                                </TooltipTrigger>
                            </ComposerPrimitive.AddAttachment>
                            <TooltipContent>
                                {supportsVision
                                    ? "添加图片或文档，也可拖拽文件到输入框"
                                    : "添加文档，也可拖拽文件到输入框"}
                            </TooltipContent>
                        </Tooltip>

                        {/* Model Selector */}
                        <ModelSelector
                            models={modelOptions}
                            selected={selectedModelId}
                            onChange={onSelectModel}
                        />

                        {/* Low-frequency controls in one shared settings panel */}
                        <Popover>
                            <PopoverTrigger
                                render={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="ask-composer__icon-btn ask-composer__settings-trigger"
                                        aria-label="更多设置"
                                        title="推理、检索与生成设置"
                                    />
                                }
                            >
                                <Ellipsis size={17} />
                                {hasActiveTools && (
                                    <span
                                        className="ask-composer__active-dot"
                                        aria-hidden="true"
                                    />
                                )}
                            </PopoverTrigger>
                            <PopoverContent
                                side="top"
                                align="end"
                                sideOffset={8}
                                className="ask-composer__settings-panel"
                                aria-label="问答设置"
                            >
                                <div className="ask-composer__settings-heading">
                                    <Wrench size={14} />
                                    <span>问答设置</span>
                                </div>

                                <section className="ask-composer__tools-panel">
                                    <h3>扩展检索</h3>
                                    {!supportsTools && (
                                        <p
                                            className="ask-composer__tools-unavailable"
                                            role="status"
                                        >
                                            当前模型不支持工具调用。切换到支持工具的模型后，可使用笔记、应用和联网搜索。
                                        </p>
                                    )}
                                    <div className="ask-composer__tool-options">
                                        <div className="ask-composer__tool-option">
                                            <label htmlFor="tool-notes">
                                                查询个人笔记
                                            </label>
                                            <Switch
                                                id="tool-notes"
                                                aria-label="查询个人笔记"
                                                size="sm"
                                                disabled={!supportsTools}
                                                checked={Boolean(
                                                    toolsConfig.notes,
                                                )}
                                                onCheckedChange={(checked) =>
                                                    onChangeToolsConfig({
                                                        ...toolsConfig,
                                                        notes: checked,
                                                    })}
                                            />
                                        </div>

                                        <div className="ask-composer__tool-option">
                                            <label htmlFor="tool-apps">
                                                查询已添加应用
                                            </label>
                                            <Switch
                                                id="tool-apps"
                                                aria-label="查询已添加应用"
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
                                            <div>
                                                <label htmlFor="tool-web">
                                                    联网搜索 (SearXNG)
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
                                                aria-label="联网搜索 (SearXNG)"
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

                                <div className="ask-composer__generation-controls">
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
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div className="ask-composer__tools-right">
                        <ThreadPrimitive.If running={false}>
                            <ComposerPrimitive.Send asChild>
                                <Button
                                    variant="default"
                                    size="icon"
                                    className="ask-composer__send-btn is-ready min-w-[44px] min-h-[44px]"
                                    aria-label="发送问题 (Enter)"
                                    title="发送问题 (Enter)"
                                >
                                    <ArrowUp size={16} />
                                </Button>
                            </ComposerPrimitive.Send>
                        </ThreadPrimitive.If>

                        <ThreadPrimitive.If running>
                            <ComposerPrimitive.Cancel asChild>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="ask-composer__send-btn is-stop min-w-[44px] min-h-[44px]"
                                    aria-label="停止生成"
                                    title="停止生成"
                                >
                                    <Square size={15} />
                                </Button>
                            </ComposerPrimitive.Cancel>
                        </ThreadPrimitive.If>
                    </div>
                </div>
            </ComposerPrimitive.Root>

            <div className="ask-composer__disclaimer">
                AI 生成内容可能存在疏漏，请注意甄别重要事实与信息
            </div>
        </div>
    );
}
