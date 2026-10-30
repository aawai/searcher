import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface AttachmentErrorContextValue {
    attachmentError: string | null;
    setAttachmentError: (err: string | null) => void;
    clearAttachmentError: () => void;
}

const AttachmentErrorContext = createContext<AttachmentErrorContextValue>({
    attachmentError: null,
    setAttachmentError: () => {},
    clearAttachmentError: () => {},
});

export function useAttachmentError() {
    return useContext(AttachmentErrorContext);
}
import {
    type AppendMessage,
    AssistantRuntimeProvider,
    ExportedMessageRepository,
    type ThreadMessage,
    useExternalStoreRuntime,
} from "@assistant-ui/react";
import type { AiMessageDto, AttachmentInput } from "./types.ts";
import { convertAiMessageToThreadMessageLike } from "./assistant-message-adapter.ts";
import { SearcherAttachmentAdapter } from "./SearcherAttachmentAdapter.ts";

interface SearcherAssistantRuntimeProps {
    children: React.ReactNode;
    isRunning: boolean;
    messages: AiMessageDto[];
    activeLeafMessageId?: string | null;
    supportsVision?: boolean;
    draft: string;
    draftKey: number;
    onDraftChange: (text: string) => void;
    onAttachmentCountChange?: (count: number) => void;
    onNewMessage: (
        text: string,
        attachments?: AttachmentInput[],
    ) => Promise<boolean>;
    onEditMessage?: (editMessageId: string, newText: string) => Promise<void>;
    onReloadMessage?: (messageId: string) => Promise<void>;
    onCancel?: () => Promise<void>;
    onBranchChange?: (targetHeadId: string) => void;
}

export function SearcherAssistantRuntimeProvider({
    children,
    isRunning,
    messages,
    activeLeafMessageId = null,
    supportsVision = true,
    draft,
    draftKey,
    onDraftChange,
    onAttachmentCountChange,
    onNewMessage,
    onEditMessage,
    onReloadMessage,
    onCancel,
    onBranchChange,
}: SearcherAssistantRuntimeProps) {
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const attachmentAdapter = useMemo(
        () => new SearcherAttachmentAdapter((err) => setAttachmentError(err)),
        [],
    );
    attachmentAdapter.setOnError((err) => setAttachmentError(err));
    attachmentAdapter.updateState(supportsVision);

    // Build true branchable message repository with parent pointers
    const messageRepository = useMemo(() => {
        const items = messages.map((m) => ({
            message: convertAiMessageToThreadMessageLike(m),
            parentId: m.parentMessageId,
        }));
        return ExportedMessageRepository.fromBranchableArray(items, {
            headId: activeLeafMessageId ?? null,
        });
    }, [messages, activeLeafMessageId]);

    const runtime = useExternalStoreRuntime<ThreadMessage>({
        isRunning,
        messageRepository,

        setMessages: (selectedMessages) => {
            const leafId = selectedMessages.at(-1)?.id;
            if (leafId) onBranchChange?.(leafId);
        },
        adapters: {
            attachments: attachmentAdapter,
        },
        onNew: async (msg: AppendMessage) => {
            const text = typeof msg.content === "string"
                ? msg.content
                : msg.content
                    .filter((c) => c.type === "text")
                    .map((c) => (c as { text: string }).text)
                    .join("\n");

            const attachments: AttachmentInput[] = (msg.attachments ?? []).map(
                (att) => {
                    let data = "";
                    let mimeType = att.contentType ??
                        "application/octet-stream";
                    if (att.content && Array.isArray(att.content)) {
                        for (const part of att.content) {
                            if (part.type === "image" && "image" in part) {
                                data = (part as { image: string }).image;
                                const match =
                                    /^data:(image\/[a-zA-Z0-9.+-]+);base64,/
                                        .exec(data);
                                if (match) {
                                    mimeType = match[1];
                                } else if (att.contentType) {
                                    mimeType = att.contentType;
                                } else {
                                    mimeType = "image/png";
                                }
                            } else if (part.type === "file" && "data" in part) {
                                data = (part as { data: string }).data;
                                if (
                                    "mimeType" in part &&
                                    (part as { mimeType: string }).mimeType
                                ) {
                                    mimeType =
                                        (part as { mimeType: string }).mimeType;
                                }
                            }
                        }
                    }
                    return {
                        id: att.id,
                        name: att.name,
                        type: att.type === "image" ? "image" : "text",
                        mimeType,
                        data,
                    };
                },
            );

            const succeeded = await onNewMessage(text, attachments);
            attachmentAdapter.reset();
            if (!succeeded) {
                runtime.thread.composer.setText(text);
                for (const attachment of msg.attachments ?? []) {
                    try {
                        await runtime.thread.composer.addAttachment(
                            attachment.file ?? attachment,
                        );
                    } catch {
                        // Prevent uncaught promise rejection crashing runtime on rollback
                    }
                }
            }
        },
        onEdit: async (msg: AppendMessage) => {
            if (!onEditMessage) return;
            const text = typeof msg.content === "string"
                ? msg.content
                : msg.content
                    .filter((c) => c.type === "text")
                    .map((c) => (c as { text: string }).text)
                    .join("\n");
            // sourceId identifies the message being edited
            const editMessageId = msg.sourceId ||
                (msg as { parentId?: string }).parentId || "";
            await onEditMessage(editMessageId, text);
        },
        onReload: async (parentId: string | null) => {
            if (!onReloadMessage || !parentId) return;
            // parentId is the parent user message of the assistant message being reloaded
            const targetAssistant = messages.find(
                (m) => m.role === "assistant" && m.parentMessageId === parentId,
            );
            const targetId = targetAssistant?.id ?? parentId;
            await onReloadMessage(targetId);
        },
        onCancel: async () => {
            if (onCancel) await onCancel();
        },
    });

    useEffect(() => {
        void runtime.thread.composer.clearAttachments();
        attachmentAdapter.reset();
    }, [runtime, attachmentAdapter, draftKey]);

    useEffect(() => {
        if (runtime.thread.composer.getState().text !== draft) {
            runtime.thread.composer.setText(draft);
        }
    }, [runtime, draft]);

    useEffect(() =>
        runtime.thread.composer.subscribe(() => {
            const state = runtime.thread.composer.getState();
            onDraftChange(state.text);
            onAttachmentCountChange?.(state.attachments.length);
        }), [runtime, onDraftChange, onAttachmentCountChange]);

    const errorContextValue = useMemo(() => ({
        attachmentError,
        setAttachmentError,
        clearAttachmentError: () => setAttachmentError(null),
    }), [attachmentError]);

    return (
        <AttachmentErrorContext.Provider value={errorContextValue}>
            <AssistantRuntimeProvider runtime={runtime}>
                {children}
            </AssistantRuntimeProvider>
        </AttachmentErrorContext.Provider>
    );
}
