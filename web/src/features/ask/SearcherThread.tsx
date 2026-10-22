import { ThreadPrimitive, useAui } from "@assistant-ui/react";
import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button.tsx";
import type {
    AiMessageDto,
    AiModelDto,
} from "../../../../src/features/ai/types.ts";
import type {
    AiCapabilitiesDto,
    GenerationConfig,
    ToolsConfig,
} from "./types.ts";
import { SearcherUserMessage } from "./SearcherUserMessage.tsx";
import { SearcherAssistantMessage } from "./SearcherAssistantMessage.tsx";
import { SearcherComposer } from "./SearcherComposer.tsx";
import type { ModelOption } from "../../components/searcher/ModelSelector.tsx";
import { routes } from "../../app/routes.ts";
const SAMPLE_PROMPTS = [
    "用一个生活化例子解释机器学习",
    "帮我设计一周的健康饮食计划",
    "比较远程办公与办公室办公的优缺点",
];

interface SearcherThreadProps {
    isStreaming: boolean;
    streamingTextLength: number;
    terminalMessageStatus: AiMessageDto["status"] | null;
    onSamplePrompt: (prompt: string) => void;
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

export function SearcherThread({
    isStreaming,
    streamingTextLength,
    terminalMessageStatus,
    onSamplePrompt,
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
}: SearcherThreadProps) {
    const threadRef = useRef<HTMLDivElement>(null);
    const aui = useAui();
    const [liveAnnouncement, setLiveAnnouncement] = useState("");
    const streamingTextLengthRef = useRef(streamingTextLength);
    streamingTextLengthRef.current = streamingTextLength;
    const wasStreamingRef = useRef(false);
    const lastAnnouncedLengthRef = useRef(0);
    useEffect(() => {
        const viewport = globalThis.visualViewport;
        const thread = threadRef.current;
        if (!viewport || !thread) return;
        let frame = 0;
        const update = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const available = viewport.height + viewport.offsetTop -
                    thread.getBoundingClientRect().top;
                thread.style.maxHeight = Math.max(0, available) + "px";
            });
        };
        viewport.addEventListener("resize", update);
        viewport.addEventListener("scroll", update);
        globalThis.addEventListener("resize", update);
        update();
        return () => {
            cancelAnimationFrame(frame);
            viewport.removeEventListener("resize", update);
            viewport.removeEventListener("scroll", update);
            globalThis.removeEventListener("resize", update);
        };
    }, []);
    useEffect(() => {
        if (!isStreaming) return;
        wasStreamingRef.current = true;
        lastAnnouncedLengthRef.current = streamingTextLengthRef.current;
        setLiveAnnouncement("正在生成回答。");
        const interval = globalThis.setInterval(() => {
            const length = streamingTextLengthRef.current;
            if (length <= lastAnnouncedLengthRef.current) return;
            lastAnnouncedLengthRef.current = length;
            setLiveAnnouncement(`回答仍在生成，已生成约 ${length} 个字。`);
        }, 10_000);
        return () => globalThis.clearInterval(interval);
    }, [isStreaming]);

    useEffect(() => {
        if (isStreaming || !wasStreamingRef.current) return;
        wasStreamingRef.current = false;
        setLiveAnnouncement(
            terminalMessageStatus === "failed"
                ? "回答生成失败，错误详情见当前消息。"
                : terminalMessageStatus === "interrupted"
                ? "回答已中断，详情见当前消息。"
                : terminalMessageStatus === "complete"
                ? "回答生成完成。"
                : "生成请求已结束。",
        );
    }, [isStreaming, terminalMessageStatus]);
    return (
        <ThreadPrimitive.Root ref={threadRef} className="ask-thread">
            <div
                className="sr-only ask-thread__live-status"
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                {liveAnnouncement}
            </div>
            {/* Empty state: welcome & composer centered together */}
            <ThreadPrimitive.Empty>
                <div className="ask-empty-layout">
                    <div className="ask-empty-centered-unit">
                        <div className="ask-empty-hero">
                            <h2 className="ask-empty-hero__title">
                                有什么可以帮你的？
                            </h2>
                            {!selectedModelId && (
                                <>
                                    <p className="ask-empty-hero__subtitle">
                                        配置模型后即可开始提问。
                                    </p>
                                    <Link
                                        to={routes.settings("ai")}
                                        className="button button--primary ask-empty-hero__cta"
                                    >
                                        配置模型
                                    </Link>
                                </>
                            )}
                        </div>

                        {selectedModelId && (
                            <div className="ask-empty-composer-wrap">
                                <SearcherComposer
                                    models={models}
                                    modelOptions={modelOptions}
                                    selectedModelId={selectedModelId}
                                    onSelectModel={onSelectModel}
                                    generationConfig={generationConfig}
                                    onChangeGenerationConfig={onChangeGenerationConfig}
                                    toolsConfig={toolsConfig}
                                    onChangeToolsConfig={onChangeToolsConfig}
                                    capabilities={capabilities}
                                    onSaveDefaultGenerationConfig={onSaveDefaultGenerationConfig}
                                    onResetDefaultGenerationConfig={onResetDefaultGenerationConfig}
                                    isDefaultGenerationConfig={isDefaultGenerationConfig}
                                />
                            </div>
                        )}
                        {selectedModelId && (
                            <div
                                className="ask-empty-prompts"
                                role="group"
                                aria-label="示例问题"
                            >
                                {SAMPLE_PROMPTS.map((prompt) => (
                                    <Button
                                        key={prompt}
                                        type="button"
                                        variant="outline"
                                        className="ask-empty-prompt"
                                        onClick={() => {
                                            // Update the runtime immediately and keep the parent draft in sync.
                                            aui.composer.setText(prompt);
                                            onSamplePrompt(prompt);
                                            globalThis.requestAnimationFrame(
                                                () =>
                                                    document.querySelector<
                                                        HTMLTextAreaElement
                                                    >(
                                                        ".ask-empty-composer-wrap .ask-composer__textarea",
                                                    )?.focus(),
                                            );
                                        }}
                                    >
                                        {prompt}
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </ThreadPrimitive.Empty>

            {/* Populated state: assistant-ui Viewport & Messages */}
            <ThreadPrimitive.If empty={false}>
                <ThreadPrimitive.Viewport className="ask-thread__viewport">
                    <div className="ask-thread__messages-inner">
                        <ThreadPrimitive.Messages
                            components={{
                                UserMessage: SearcherUserMessage,
                                AssistantMessage: SearcherAssistantMessage,
                            }}
                        />
                    </div>
                </ThreadPrimitive.Viewport>

                {/* Populated state docked composer & scroll to bottom */}

                <div className="ask-thread__dock">
                    <ThreadPrimitive.ScrollToBottom asChild>
                        <Button
                            variant="outline"
                            className="ask-jump-latest"
                            aria-label="跳到最新内容"
                        >
                            <ArrowDown size="1em" className="icon-sm" />
                            <span>跳到最新</span>
                        </Button>
                    </ThreadPrimitive.ScrollToBottom>
                    <div className="ask-thread__dock-gradient" />
                    <div className="ask-thread__dock-inner">
                        <SearcherComposer
                            models={models}
                            modelOptions={modelOptions}
                            selectedModelId={selectedModelId}
                            onSelectModel={onSelectModel}
                            generationConfig={generationConfig}
                            onChangeGenerationConfig={onChangeGenerationConfig}
                            toolsConfig={toolsConfig}
                            onChangeToolsConfig={onChangeToolsConfig}
                            capabilities={capabilities}
                            onSaveDefaultGenerationConfig={onSaveDefaultGenerationConfig}
                            onResetDefaultGenerationConfig={onResetDefaultGenerationConfig}
                            isDefaultGenerationConfig={isDefaultGenerationConfig}
                        />
                    </div>
                </div>
            </ThreadPrimitive.If>
        </ThreadPrimitive.Root>
    );
}
