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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
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

    const hasActiveTools = supportsTools && (
        Boolean(toolsConfig.notes) ||
        Boolean(toolsConfig.apps) ||
        Boolean(toolsConfig.webSearch)
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
                    placeholder="输入问题，Enter 发送，Shift+Enter 换行 (支持拖拽/粘贴图片与文档)..."
                    className="ask-composer__textarea"
                    rows={1}
                    autoFocus
                    aria-label="向 AI 提问"
                />

                {/* Bottom Controls Bar */}
                <div className="ask-composer__toolbar">
                    <div className="ask-composer__tools-left">
                        {/* Assistant-UI Add Attachment Button */}
                        <ComposerPrimitive.AddAttachment asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="ask-composer__icon-btn"
                                aria-label="添加附件 (图片/文档)"
                                title={supportsVision
                                    ? "添加附件 (支持 PNG/JPEG/WebP 图片及 TXT/MD 文档)"
                                    : "添加附件 (当前模型仅支持文本文档)"}
                            >
                                <Paperclip size={16} />
                            </Button>
                        </ComposerPrimitive.AddAttachment>

                        {/* Model Selector */}
                        <ModelSelector
                            models={modelOptions}
                            selected={selectedModelId}
                            onChange={onSelectModel}
                        />

                        {/* Reasoning Effort Selector */}
                        <ReasoningSelector
                            model={activeModel}
                            value={generationConfig.reasoningEffort}
                            onChange={(reasoningEffort) =>
                                onChangeGenerationConfig({
                                    ...generationConfig,
                                    reasoningEffort,
                                })}
                        />

                        {/* Tools Menu (Notes, Apps, Web Search) - gated by supportsTools */}
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className={`ask-composer__action-pill ${
                                            hasActiveTools
                                                ? "is-tool-active text-accent"
                                                : ""
                                        } ${
                                            !supportsTools
                                                ? "opacity-50"
                                                : ""
                                        }`}
                                        aria-label="工具集成与检索"
                                        title={supportsTools
                                            ? "工具集成与搜索设置"
                                            : "当前模型不支持工具调用"}
                                        disabled={!supportsTools}
                                    />
                                }
                            >
                                <Wrench
                                    size={13}
                                    className="ask-composer__pill-icon"
                                />
                                <span className="ask-composer__pill-text">
                                    工具
                                    {hasActiveTools && (
                                        <span className="ask-composer__active-dot" />
                                    )}
                                </span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                sideOffset={6}
                                className="w-56 p-2 space-y-2"
                            >
                                <div className="text-xs font-semibold px-2 py-1 text-muted border-b border-border/40">
                                    问答扩展检索能力 (默认关闭)
                                </div>

                                <div className="flex items-center justify-between px-2 py-1">
                                    <label
                                        htmlFor="tool-notes"
                                        className="text-xs cursor-pointer"
                                    >
                                        查询个人笔记
                                    </label>
                                    <Switch
                                        id="tool-notes"
                                        aria-label="查询个人笔记"
                                        size="sm"
                                        checked={Boolean(toolsConfig.notes)}
                                        onCheckedChange={(checked) =>
                                            onChangeToolsConfig({
                                                ...toolsConfig,
                                                notes: checked,
                                            })}
                                    />
                                </div>

                                <div className="flex items-center justify-between px-2 py-1">
                                    <label
                                        htmlFor="tool-apps"
                                        className="text-xs cursor-pointer"
                                    >
                                        查询已添加应用
                                    </label>
                                    <Switch
                                        id="tool-apps"
                                        aria-label="查询已添加应用"
                                        size="sm"
                                        checked={Boolean(toolsConfig.apps)}
                                        onCheckedChange={(checked) =>
                                            onChangeToolsConfig({
                                                ...toolsConfig,
                                                apps: checked,
                                            })}
                                    />
                                </div>

                                <div className="flex items-center justify-between px-2 py-1">
                                    <div className="flex flex-col">
                                        <label
                                            htmlFor="tool-web"
                                            className="text-xs cursor-pointer"
                                        >
                                            联网搜索 (SearXNG)
                                        </label>
                                        {capabilities?.tools.webSearch ===
                                                false && (
                                            <span className="text-xs text-muted">
                                                服务端未配置
                                            </span>
                                        )}
                                    </div>
                                    <Switch
                                        id="tool-web"
                                        aria-label="联网搜索 (SearXNG)"
                                        size="sm"
                                        disabled={capabilities?.tools
                                            .webSearch === false}
                                        checked={Boolean(toolsConfig.webSearch)}
                                        onCheckedChange={(checked) =>
                                            onChangeToolsConfig({
                                                ...toolsConfig,
                                                webSearch: checked,
                                            })}
                                    />
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Generation Settings Popover (⚙) */}
                        <GenerationSettings
                            config={generationConfig}
                            onChange={onChangeGenerationConfig}
                            model={activeModel}
                            isReasoningStrict={activeModel?.isReasoningStrict}
                            onSaveDefault={onSaveDefaultGenerationConfig}
                            onResetDefault={onResetDefaultGenerationConfig}
                            isDefault={isDefaultGenerationConfig}
                        />
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
