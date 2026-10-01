import { ThreadPrimitive } from "@assistant-ui/react";
import { useEffect, useRef } from "react";
import { ArrowDown, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button.tsx";
import type { AiModelDto } from "../../../../src/features/ai/types.ts";
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

interface SearcherThreadProps {
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
    return (
        <ThreadPrimitive.Root ref={threadRef} className="ask-thread">
            {/* Empty state: welcome & composer centered together */}
            <ThreadPrimitive.Empty>
                <div className="ask-empty-layout">
                    <div className="ask-empty-centered-unit">
                        <div className="ask-empty-hero">
                            <h2 className="ask-empty-hero__title">
                                有什么可以帮你的？
                            </h2>
                            <p className="ask-empty-hero__subtitle">
                                {selectedModelId
                                    ? "输入任何问题，支持多轮对话、分支演进与扩展检索"
                                    : "配置 OpenAI 或兼容 Provider 后即可使用 AI 智能问答"}
                            </p>
                            {!selectedModelId && (
                                <Link
                                    to={routes.settings("ai")}
                                    className="button button--primary ask-empty-hero__cta"
                                >
                                    <SlidersHorizontal
                                        size={14}
                                        className="mr-1.5"
                                    />
                                    <span>配置 AI 模型与 Provider</span>
                                </Link>
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
                            <ArrowDown size={14} />
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
