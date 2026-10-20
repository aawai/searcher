import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api.ts";
import { errorMessage } from "../../app/state.tsx";
import type {
    AiConversationDto,
    AiMessageDto,
    AiModelDto,
    AttachmentInput,
    GenerationConfig,
    MessageContentPart,
    SourceCitation,
    ToolsConfig,
} from "../../../../src/features/ai/types.ts";
import type {
    AskMessageDto,
    ConversationFullData,
    StreamMeta,
} from "./types.ts";
import { sanitizeFailureReason } from "./assistant-message-adapter.ts";

export interface SendChatRequestOptions {
    editMessageId?: string;
    regenerateMessageId?: string;
    parentMessageId?: string;
}

export type SseParseResult =
    | { ok: true; event: string; data: unknown }
    | { ok: false; error: "invalid_json" }
    | null;

export interface StreamAccumulator {
    meta: StreamMeta | null;
    liveText: string;
    liveParts: MessageContentPart[];
    receivedDone: boolean;
    streamFailed: boolean;
    errorMessage?: string;
}

export interface UseAskStreamOptions {
    user: { id: string } | null;
    models: AiModelDto[];
    selectedModelId: string | null;
    conversation: ConversationFullData | null;
    setConversation: React.Dispatch<
        React.SetStateAction<ConversationFullData | null>
    >;
    setHistory: React.Dispatch<React.SetStateAction<AiConversationDto[]>>;
    setError: (error: string | null) => void;
    input: string;
    setInput: (text: string) => void;
    newConvHistoryEnabled: boolean;
    newConvSystemInstruction: string | null;
    toolsConfig: ToolsConfig;
    generationConfig: GenerationConfig;
    generationEpochRef?: React.MutableRefObject<number>;
}

export interface UseAskStreamResult {
    isStreaming: boolean;
    setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
    abortRef: React.MutableRefObject<AbortController | null>;
    stop: () => void;
    reset: () => void;
    sendChatRequest: (
        messageText: string,
        attachmentsInput?: AttachmentInput[],
        options?: SendChatRequestOptions,
    ) => Promise<boolean>;
}

/**
 * Parses a single Server-Sent Events (SSE) block.
 * Returns null if the block does not contain both event and data fields.
 */
export function parseSseBlock(block: string): SseParseResult {
    const eventMatch = /^event: (.+)$/m.exec(block);
    const dataMatch = /^data: (.+)$/m.exec(block);
    const event = eventMatch?.[1]?.trim();
    const rawData = dataMatch?.[1]?.trim();
    if (!event || !rawData) return null;

    try {
        const data = JSON.parse(rawData);
        return { ok: true, event, data };
    } catch {
        return { ok: false, error: "invalid_json" };
    }
}

/**
 * Applies a parsed SSE event to the stream accumulator.
 */
export function applySseEvent(
    acc: StreamAccumulator,
    event: string,
    data: unknown,
): void {
    if (
        event === "meta" && data && typeof data === "object" &&
        "conversationId" in data &&
        typeof (data as Record<string, unknown>).conversationId === "string" &&
        "userMessageId" in data &&
        typeof (data as Record<string, unknown>).userMessageId === "string" &&
        "assistantMessageId" in data &&
        typeof (data as Record<string, unknown>).assistantMessageId === "string"
    ) {
        const d = data as {
            conversationId: string;
            userMessageId: string;
            assistantMessageId: string;
            title?: unknown;
        };
        acc.meta = {
            type: "meta",
            conversationId: d.conversationId,
            userMessageId: d.userMessageId,
            assistantMessageId: d.assistantMessageId,
            title: typeof d.title === "string" ? d.title : undefined,
        };
    } else if (event === "token" && typeof data === "string") {
        acc.liveText += data;
    } else if (event === "done") {
        acc.receivedDone = true;
    } else if (event === "tool-call" && data && typeof data === "object") {
        const call = data as {
            callId: string;
            toolName: "notes" | "apps" | "webSearch";
            args: Record<string, unknown>;
        };
        acc.liveParts.push({
            type: "tool-call",
            callId: call.callId,
            toolName: call.toolName,
            args: call.args,
        });
    } else if (event === "tool-result" && data && typeof data === "object") {
        const res = data as {
            callId: string;
            toolName: "notes" | "apps" | "webSearch";
            result: unknown;
            error?: string;
        };
        acc.liveParts.push({
            type: "tool-result",
            callId: res.callId,
            toolName: res.toolName,
            result: res.result,
            error: res.error,
        });
    } else if (event === "sources" && data && typeof data === "object") {
        const src = data as { sources: SourceCitation[] };
        acc.liveParts.push({
            type: "sources",
            sources: src.sources,
        });
    } else if (event === "error") {
        acc.streamFailed = true;
        let msg = "模型返回错误";
        if (typeof data === "string") {
            msg = data;
        } else if (data && typeof data === "object") {
            const obj = data as Record<string, unknown>;
            if (typeof obj.message === "string") {
                msg = obj.message;
            } else if (typeof obj.error === "string") {
                msg = obj.error;
            }
        }
        acc.errorMessage = msg;
    }
}

/**
 * Creates an optimistic conversation snapshot incorporating streaming tokens,
 * tool calls/results, sources, and message tree parentage.
 */
export function createOptimisticStreamSnapshot(params: {
    previous: ConversationFullData | null;
    meta: StreamMeta;
    userId: string;
    submittedText: string;
    attachments: AttachmentInput[];
    liveText: string;
    liveParts: MessageContentPart[];
    providerId: string;
    modelId: string;
    isAborted: boolean;
    isFailed?: boolean;
    failureReason?: string;
    timestamp: number;
    effectiveHistoryEnabled: boolean;
    effectiveSystemInstruction: string | null;
    options?: SendChatRequestOptions;
}): ConversationFullData {
    const {
        previous,
        meta,
        userId,
        submittedText,
        attachments,
        liveText,
        liveParts,
        providerId,
        modelId,
        isAborted,
        isFailed,
        failureReason,
        timestamp,
        effectiveHistoryEnabled,
        effectiveSystemInstruction,
        options,
    } = params;

    const current = previous?.conversation.id === meta.conversationId
        ? previous
        : null;
    const existingMessages = current?.messages ?? [];
    const sourceMessage = existingMessages.find((m) =>
        m.id === options?.editMessageId
    );

    const userMessageId = meta.userMessageId ?? "temp-user";
    const assistantMessageId = meta.assistantMessageId ?? "temp-assistant";

    const userMessage: AiMessageDto = {
        id: userMessageId,
        conversationId: meta.conversationId,
        parentMessageId: options?.editMessageId
            ? sourceMessage?.parentMessageId ?? null
            : options?.parentMessageId ?? null,
        role: "user",
        content: submittedText,
        parts: [
            { type: "text", text: submittedText },
            ...attachments.map((a) => ({
                type: "attachment" as const,
                id: a.id,
                name: a.name,
                mimeType: a.mimeType,
                data: a.data,
            })),
        ],
        providerId: null,
        modelId: null,
        status: "complete",
        variantGroupId: null,
        inputTokens: null,
        outputTokens: null,
        createdAt: timestamp,
    };

    const assistantMessage: AskMessageDto = {
        id: assistantMessageId,
        conversationId: meta.conversationId,
        parentMessageId: userMessageId,
        role: "assistant",
        content: liveText,
        parts: [{ type: "text", text: liveText }, ...liveParts],
        providerId,
        modelId,
        status: isAborted ? "interrupted" : isFailed ? "failed" : "streaming",
        ...(isFailed && failureReason
            ? { failureReason: sanitizeFailureReason(failureReason) }
            : {}),
        variantGroupId: options?.regenerateMessageId ?? null,
        inputTokens: null,
        outputTokens: null,
        createdAt: timestamp + 1,
    };

    return {
        conversation: {
            ...(current?.conversation ?? {
                id: meta.conversationId,
                userId,
                title: meta.title ?? submittedText.slice(0, 60),
                historyEnabled: effectiveHistoryEnabled,
                systemInstruction: effectiveSystemInstruction,
                createdAt: timestamp,
                updatedAt: timestamp,
            }),
            activeLeafMessageId: assistantMessageId,
        },
        messages: [
            ...existingMessages.filter((m) => m.id !== assistantMessageId),
            ...(existingMessages.some((m) => m.id === userMessageId)
                ? []
                : [userMessage]),
            assistantMessage,
        ],
    };
}
export function mergeCanonicalConversation(params: {
    canonical: ConversationFullData;
    previous: ConversationFullData | null;
    currentFailure?: {
        assistantMessageId: string;
        reason: string;
    };
}): ConversationFullData {
    let previousFailureReasons: Map<string, string> | undefined;
    for (const message of params.previous?.messages ?? []) {
        if (message.status === "failed" && message.failureReason) {
            previousFailureReasons ??= new Map();
            previousFailureReasons.set(
                message.id,
                sanitizeFailureReason(message.failureReason),
            );
        }
    }

    const currentFailureReason = params.currentFailure
        ? sanitizeFailureReason(params.currentFailure.reason)
        : undefined;
    if (!previousFailureReasons && !currentFailureReason) {
        return params.canonical;
    }

    return {
        ...params.canonical,
        messages: params.canonical.messages.map((message) => {
            const failureReason = message.id ===
                    params.currentFailure?.assistantMessageId
                ? currentFailureReason
                : message.status === "failed"
                ? previousFailureReasons?.get(message.id) ??
                    message.failureReason
                : message.failureReason;
            if (
                !failureReason || failureReason === message.failureReason
            ) {
                return message;
            }
            return { ...message, failureReason };
        }),
    };
}

/**
 * Determines whether canonical conversation data from the backend should update
 * the client conversation state. If an aborted or failed stream has not yet
 * reached a terminal status on the server, retain the local terminal snapshot.
 */
export function shouldApplyCanonicalConversation(params: {
    isAborted: boolean;
    isFailed?: boolean;
    canonicalMessages: AiMessageDto[];
    assistantMessageId?: string;
}): boolean {
    if (!params.isAborted && !params.isFailed) return true;
    if (!params.assistantMessageId) return true;
    const response = params.canonicalMessages.find((message) =>
        message.id === params.assistantMessageId
    );
    return response !== undefined && response.status !== "streaming";
}

/**
 * Hook managing the Ask page streaming request lifecycle, SSE parsing,
 * optimistic snapshot updates, abort handling, and Searcher backend reconciliation.
 */
export function useAskStream(options: UseAskStreamOptions): UseAskStreamResult {
    const {
        user,
        models,
        selectedModelId,
        conversation,
        setConversation,
        setHistory,
        setError,
        input: _input,
        setInput,
        newConvHistoryEnabled,
        newConvSystemInstruction,
        toolsConfig,
        generationConfig,
        generationEpochRef,
    } = options;

    const [isStreaming, setIsStreaming] = useState(false);
    const internalEpochRef = useRef(0);
    const epochRef = generationEpochRef ?? internalEpochRef;
    const abortRef = useRef<AbortController | null>(null);

    // Keep latest options in refs to ensure callbacks use current values
    const userRef = useRef(user);
    userRef.current = user;
    const modelsRef = useRef(models);
    modelsRef.current = models;
    const selectedModelIdRef = useRef(selectedModelId);
    selectedModelIdRef.current = selectedModelId;
    const conversationRef = useRef(conversation);
    conversationRef.current = conversation;
    const setConversationRef = useRef(setConversation);
    setConversationRef.current = setConversation;
    const setHistoryRef = useRef(setHistory);
    setHistoryRef.current = setHistory;
    const setErrorRef = useRef(setError);
    setErrorRef.current = setError;
    const setInputRef = useRef(setInput);
    setInputRef.current = setInput;
    const newConvHistoryEnabledRef = useRef(newConvHistoryEnabled);
    newConvHistoryEnabledRef.current = newConvHistoryEnabled;
    const newConvSystemInstructionRef = useRef(newConvSystemInstruction);
    newConvSystemInstructionRef.current = newConvSystemInstruction;
    const toolsConfigRef = useRef(toolsConfig);
    toolsConfigRef.current = toolsConfig;
    const generationConfigRef = useRef(generationConfig);
    generationConfigRef.current = generationConfig;

    const stop = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const reset = useCallback(() => {
        abortRef.current?.abort();
        setIsStreaming(false);
    }, []);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    const sendChatRequest = useCallback(
        async (
            messageText: string,
            attachmentsInput?: AttachmentInput[],
            sendOptions?: SendChatRequestOptions,
        ): Promise<boolean> => {
            const text = messageText.trim();
            const atts = attachmentsInput ?? [];
            const currentUser = userRef.current;
            const currentSelectedModelId = selectedModelIdRef.current;
            const currentModels = modelsRef.current;

            if (
                (!text && atts.length === 0 &&
                    !sendOptions?.regenerateMessageId) ||
                abortRef.current !== null || !currentUser
            ) {
                return false;
            }

            if (!currentSelectedModelId) {
                setErrorRef.current("请先选择一个可用的 AI 模型后再发送。");
                return false;
            }

            const model = currentModels.find((m) =>
                m.id === currentSelectedModelId
            );
            if (!model) {
                setErrorRef.current("当前选择的模型不可用，请重新选择。");
                return false;
            }
            const currentEpoch = ++epochRef.current;
            const controller = new AbortController();
            abortRef.current = controller;
            setIsStreaming(true);
            setErrorRef.current(null);

            const submittedText = text;
            if (!sendOptions?.regenerateMessageId) {
                setInputRef.current("");
            }

            const acc: StreamAccumulator = {
                meta: null,
                liveText: "",
                liveParts: [],
                receivedDone: false,
                streamFailed: false,
            };

            const currentConversation = conversationRef.current;
            const effectiveHistoryEnabled =
                currentConversation?.conversation.historyEnabled ??
                    newConvHistoryEnabledRef.current;
            const effectiveSystemInstruction =
                currentConversation?.conversation.systemInstruction ??
                    newConvSystemInstructionRef.current;
            const now = Date.now();

            function publishStream() {
                if (!acc.meta || currentEpoch !== epochRef.current) return;
                const meta = acc.meta;
                setConversationRef.current((previous) =>
                    createOptimisticStreamSnapshot({
                        previous,
                        meta,
                        userId: currentUser!.id,
                        submittedText,
                        attachments: atts,
                        liveText: acc.liveText,
                        liveParts: acc.liveParts,
                        providerId: model!.providerId,
                        modelId: model!.modelId,
                        isAborted: controller.signal.aborted,
                        isFailed: acc.streamFailed,
                        failureReason: acc.errorMessage,
                        timestamp: now,
                        effectiveHistoryEnabled,
                        effectiveSystemInstruction,
                        options: sendOptions,
                    })
                );
            }

            const handleBlock = (block: string) => {
                const parseResult = parseSseBlock(block);
                if (!parseResult) return;
                if (!parseResult.ok) {
                    acc.streamFailed = true;
                    const errorMsg =
                        "接收到异常的数据流格式 (Malformed Stream)";
                    acc.errorMessage = errorMsg;
                    setErrorRef.current(errorMsg);
                    publishStream();
                    return;
                }
                applySseEvent(acc, parseResult.event, parseResult.data);
                if (acc.errorMessage) {
                    setErrorRef.current(acc.errorMessage);
                }
                publishStream();
            };

            try {
                const currentTools = toolsConfigRef.current;
                const currentGenConfig = generationConfigRef.current;

                const response = await fetch("/api/ai/chat/stream", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        conversationId: currentConversation?.conversation.id,
                        providerId: model.providerId,
                        modelId: model.modelId,
                        message: submittedText,
                        parentMessageId: sendOptions?.parentMessageId,
                        editMessageId: sendOptions?.editMessageId,
                        regenerateMessageId: sendOptions?.regenerateMessageId,
                        historyEnabled: effectiveHistoryEnabled,
                        systemInstruction: effectiveSystemInstruction ??
                            undefined,
                        attachments: atts.length > 0 ? atts : undefined,
                        tools: model.supportsTools ? currentTools : undefined,
                        reasoningEffort: currentGenConfig.reasoningEffort,
                        temperature: currentGenConfig.temperature,
                        topP: currentGenConfig.topP,
                        maxTokens: currentGenConfig.maxTokens,
                    }),
                    signal: controller.signal,
                });

                if (!response.ok || !response.body) {
                    const payload = await response.json().catch(() => null);
                    throw new Error(
                        payload?.message ??
                            "请求失败 (HTTP " + response.status + ")",
                    );
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const blocks = buffer.split(/\r?\n\r?\n/);
                    buffer = blocks.pop() ?? "";
                    for (const b of blocks) handleBlock(b);
                }
                if (buffer.trim()) handleBlock(buffer);

                if (
                    !controller.signal.aborted &&
                    (!acc.meta || !acc.receivedDone) &&
                    !acc.streamFailed
                ) {
                    acc.streamFailed = true;
                    throw new Error(
                        acc.meta
                            ? "问答流在完成前断开"
                            : "问答流未返回会话元数据",
                    );
                }
            } catch (e) {
                if (!controller.signal.aborted) {
                    acc.streamFailed = true;
                    const failureReason = e instanceof Error
                        ? e.message
                        : errorMessage(e);
                    acc.errorMessage = failureReason;
                    setErrorRef.current(failureReason);
                    publishStream();
                }
            } finally {
                if (controller.signal.aborted) publishStream();

                // Restore input on any stream failure
                if (
                    acc.streamFailed && currentEpoch === epochRef.current &&
                    !sendOptions?.regenerateMessageId
                ) {
                    setInputRef.current(submittedText);
                }

                // Only update conversation state if epoch matches (prevents hijacking on conversation switch)
                if (acc.meta && currentEpoch === epochRef.current) {
                    const convId = acc.meta.conversationId;
                    try {
                        const [currentConv, items] = await Promise.all([
                            api<ConversationFullData>(
                                "/api/ai/conversations/" +
                                    encodeURIComponent(convId),
                            ),
                            api<AiConversationDto[]>("/api/ai/conversations"),
                        ]);
                        if (currentEpoch === epochRef.current) {
                            // Abort returns before the server finishes persisting its partial answer.
                            // Keep the observed stream snapshot until canonical data is terminal.
                            if (
                                shouldApplyCanonicalConversation({
                                    isAborted: controller.signal.aborted,
                                    isFailed: acc.streamFailed,
                                    canonicalMessages: currentConv.messages,
                                    assistantMessageId: acc.meta
                                        ?.assistantMessageId,
                                })
                            ) {
                                const assistantMessageId = acc.meta
                                    ?.assistantMessageId;
                                const failureReason = acc.streamFailed &&
                                        acc.errorMessage && assistantMessageId
                                    ? {
                                        assistantMessageId,
                                        reason: acc.errorMessage,
                                    }
                                    : undefined;
                                setConversationRef.current(
                                    mergeCanonicalConversation({
                                        canonical: currentConv,
                                        previous: currentConversation,
                                        currentFailure: failureReason,
                                    }),
                                );
                            }
                            setHistoryRef.current(items);
                        }
                    } catch (e) {
                        setErrorRef.current(errorMessage(e));
                    }
                }

                if (abortRef.current === controller) abortRef.current = null;
                if (currentEpoch === epochRef.current) {
                    setIsStreaming(false);
                }
            }

            return currentEpoch !== epochRef.current || !acc.streamFailed;
        },
        [epochRef],
    );

    return {
        isStreaming,
        setIsStreaming,
        abortRef,
        stop,
        reset,
        sendChatRequest,
    };
}
