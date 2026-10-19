import { useEffect, useMemo, useState } from "react";
import type { AiModelDto } from "../../../../src/features/ai/types.ts";
import type { ModelOption } from "../../components/searcher/ModelSelector.tsx";
import type {
    AiCapabilitiesDto,
    AiConversationDto,
    AiMessageDto,
    AttachmentInput,
    GenerationConfig,
    ToolsConfig,
} from "./types.ts";
import { ConversationHeader } from "./ConversationHeader.tsx";
import { SearcherThread } from "./SearcherThread.tsx";
import { SearcherAssistantRuntimeProvider } from "./assistant-runtime.tsx";
import {
    getActiveBranchMessages,
    resolveLeafForSibling,
} from "./tree-utils.ts";
import { ConversationSearchDialog } from "./ConversationSearchDialog.tsx";
import {
    matchesShortcut,
    type ShortcutPlatform,
    SHORTCUTS,
} from "../shortcuts/shortcut-catalog.ts";

interface ConversationWorkspaceProps {
    conversation: AiConversationDto | null;
    allMessages: AiMessageDto[];
    isStreaming: boolean;
    models: AiModelDto[];
    modelOptions: ModelOption[];
    selectedModelId: string | null;
    onSelectModel: (id: string) => void;
    generationConfig: GenerationConfig;
    onChangeGenerationConfig: (cfg: GenerationConfig) => void;
    onSaveDefaultGenerationConfig: (cfg: GenerationConfig) => Promise<void>;
    onResetDefaultGenerationConfig: () => Promise<void>;
    isDefaultGenerationConfig: boolean;
    toolsConfig: ToolsConfig;
    onChangeToolsConfig: (cfg: ToolsConfig) => void;
    capabilities: AiCapabilitiesDto | null;
    draft: string;
    draftKey: number;
    onDraftChange: (text: string) => void;
    onSend: (text: string, attachments?: AttachmentInput[]) => Promise<boolean>;
    onStop: () => void;
    onRegenerate: (messageId: string) => Promise<void>;
    onEditAndResend: (messageId: string, newContent: string) => Promise<void>;
    onOpenDrawer: () => void;
    onRenameConversation: (newTitle: string) => Promise<void>;
    onDeleteConversation: () => Promise<void>;
    onToggleHistory: (enabled: boolean) => Promise<void>;
    onSaveSystemInstruction: (instruction: string | null) => Promise<void>;
    onSelectLeafMessage: (leafId: string) => Promise<void>;
    isNewConversationTemporary?: boolean;
    newConversationInstruction?: string | null;
    platform?: ShortcutPlatform;
}

export function ConversationWorkspace({
    conversation,
    allMessages,
    isStreaming,
    models,
    modelOptions,
    selectedModelId,
    onSelectModel,
    generationConfig,
    onChangeGenerationConfig,
    onSaveDefaultGenerationConfig,
    onResetDefaultGenerationConfig,
    isDefaultGenerationConfig,
    toolsConfig,
    onChangeToolsConfig,
    capabilities,
    onSend,
    draft,
    draftKey,
    onDraftChange,
    onStop,
    onRegenerate,
    onEditAndResend,
    onOpenDrawer,
    onRenameConversation,
    onDeleteConversation,
    onToggleHistory,
    onSaveSystemInstruction,
    onSelectLeafMessage,
    isNewConversationTemporary = false,
    newConversationInstruction = null,
    platform,
}: ConversationWorkspaceProps) {
    const [searchOpen, setSearchOpen] = useState(false);

    // Compute the active branch from the active leaf ID or latest messages
    const branchMessages = useMemo(() => {
        return getActiveBranchMessages(
            allMessages,
            conversation?.activeLeafMessageId,
        );
    }, [allMessages, conversation?.activeLeafMessageId]);
    const latestAssistantMessage = branchMessages.findLast((message) =>
        message.role === "assistant"
    );

    const activeModel = models.find((m) => m.id === selectedModelId);

    // Keyboard shortcut for conversation search (Cmd/Ctrl + F)
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (matchesShortcut(e, SHORTCUTS.askFind.binding)) {
                e.preventDefault();
                setSearchOpen(true);
            }
        }
        globalThis.addEventListener("keydown", handleKeyDown);
        return () => globalThis.removeEventListener("keydown", handleKeyDown);
    }, []);

    // Handle switching branch when user clicks branch pager
    function handleSwitchBranch(siblingId: string) {
        const nextLeafId = resolveLeafForSibling(allMessages, siblingId);
        void onSelectLeafMessage(nextLeafId);
    }

    return (
        <SearcherAssistantRuntimeProvider
            isRunning={isStreaming}
            draft={draft}
            draftKey={draftKey}
            onDraftChange={onDraftChange}
            messages={allMessages}
            activeLeafMessageId={conversation?.activeLeafMessageId}
            supportsVision={activeModel?.supportsVision ?? false}
            onNewMessage={async (text, atts) => {
                return await onSend(text, atts);
            }}
            onEditMessage={async (messageId, text) => {
                await onEditAndResend(messageId, text);
            }}
            onReloadMessage={async (messageId) => {
                await onRegenerate(messageId);
            }}
            onCancel={() => {
                onStop();
                return Promise.resolve();
            }}
            onBranchChange={(targetId) => handleSwitchBranch(targetId)}
        >
            <section className="ask-workspace" aria-label="对话工作区">
                <ConversationHeader
                    conversation={conversation}
                    messages={branchMessages}
                    onOpenDrawer={onOpenDrawer}
                    onRename={onRenameConversation}
                    onDelete={onDeleteConversation}
                    onToggleHistory={onToggleHistory}
                    onSaveSystemInstruction={onSaveSystemInstruction}
                    onOpenSearch={() => setSearchOpen(true)}
                    isNewConversationTemporary={isNewConversationTemporary}
                    newConversationInstruction={newConversationInstruction}
                    platform={platform}
                />

                <SearcherThread
                    isStreaming={isStreaming}
                    streamingTextLength={isStreaming &&
                            latestAssistantMessage?.status === "streaming"
                        ? latestAssistantMessage.content.length
                        : 0}
                    terminalMessageStatus={latestAssistantMessage?.status ??
                        null}
                    onSamplePrompt={onDraftChange}
                    models={models}
                    modelOptions={modelOptions}
                    selectedModelId={selectedModelId}
                    onSelectModel={onSelectModel}
                    generationConfig={generationConfig}
                    onChangeGenerationConfig={onChangeGenerationConfig}
                    onSaveDefaultGenerationConfig={onSaveDefaultGenerationConfig}
                    onResetDefaultGenerationConfig={onResetDefaultGenerationConfig}
                    isDefaultGenerationConfig={isDefaultGenerationConfig}
                    toolsConfig={toolsConfig}
                    onChangeToolsConfig={onChangeToolsConfig}
                    capabilities={capabilities}
                />

                <ConversationSearchDialog
                    open={searchOpen}
                    onOpenChange={setSearchOpen}
                    messages={allMessages}
                    platform={platform}
                    onSelectMessage={(msgId) => {
                        const targetLeaf = resolveLeafForSibling(
                            allMessages,
                            msgId,
                        );
                        void onSelectLeafMessage(targetLeaf);
                        // Also scroll target message element into view
                        setTimeout(() => {
                            const el = document.querySelector(
                                `[data-message-id="${msgId}"]`,
                            );
                            if (el) {
                                el.scrollIntoView({
                                    behavior: "smooth",
                                    block: "center",
                                });
                            }
                        }, 100);
                    }}
                />
            </section>
        </SearcherAssistantRuntimeProvider>
    );
}
