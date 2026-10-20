import { assertEquals, assertNotEquals } from "@std/assert";
import {
    applySseEvent,
    createOptimisticStreamSnapshot,
    mergeCanonicalConversation,
    parseSseBlock,
    shouldApplyCanonicalConversation,
    type StreamAccumulator,
} from "./useAskStream.ts";
import type { ConversationFullData, StreamMeta } from "./types.ts";
import type { AiMessageDto } from "../../../../src/features/ai/types.ts";
import {
    convertAiMessageToThreadMessageLike,
    sanitizeFailureReason,
} from "./assistant-message-adapter.ts";

function createMockMsg(
    id: string,
    parentMessageId: string | null,
    role: "user" | "assistant",
    content: string,
    createdAt: number,
    providerId: string | null = null,
    modelId: string | null = null,
): AiMessageDto {
    return {
        id,
        conversationId: "c-1",
        parentMessageId,
        role,
        content,
        parts: [{ type: "text", text: content }],
        providerId,
        modelId,
        status: "complete",
        variantGroupId: null,
        inputTokens: null,
        outputTokens: null,
        createdAt,
    };
}

Deno.test("useAskStream: parseSseBlock parses valid SSE events", () => {
    const tokenBlock = 'event: token\ndata: "Hello, world!"';
    const tokenRes = parseSseBlock(tokenBlock);
    assertEquals(tokenRes, {
        ok: true,
        event: "token",
        data: "Hello, world!",
    });

    const metaBlock =
        'event: meta\ndata: {"conversationId":"c-123","userMessageId":"u-1","assistantMessageId":"a-1","title":"Test Title"}';
    const metaRes = parseSseBlock(metaBlock);
    assertEquals(metaRes, {
        ok: true,
        event: "meta",
        data: {
            conversationId: "c-123",
            userMessageId: "u-1",
            assistantMessageId: "a-1",
            title: "Test Title",
        },
    });

    const toolCallBlock =
        'event: tool-call\ndata: {"callId":"tc_1","toolName":"notes","args":{"query":"search"}}';
    const toolCallRes = parseSseBlock(toolCallBlock);
    assertEquals(toolCallRes, {
        ok: true,
        event: "tool-call",
        data: {
            callId: "tc_1",
            toolName: "notes",
            args: { query: "search" },
        },
    });

    const toolResultBlock =
        'event: tool-result\ndata: {"callId":"tc_1","toolName":"notes","result":"found 1 item"}';
    const toolResultRes = parseSseBlock(toolResultBlock);
    assertEquals(toolResultRes, {
        ok: true,
        event: "tool-result",
        data: {
            callId: "tc_1",
            toolName: "notes",
            result: "found 1 item",
        },
    });

    const sourcesBlock =
        'event: sources\ndata: {"sources":[{"title":"Source 1","url":"https://example.com"}]}';
    const sourcesRes = parseSseBlock(sourcesBlock);
    assertEquals(sourcesRes, {
        ok: true,
        event: "sources",
        data: {
            sources: [{
                title: "Source 1",
                url: "https://example.com",
            }],
        },
    });

    const doneBlock = "event: done\ndata: {}";
    const doneRes = parseSseBlock(doneBlock);
    assertEquals(doneRes, {
        ok: true,
        event: "done",
        data: {},
    });

    const errorBlock = 'event: error\ndata: "Upstream failure"';
    const errorRes = parseSseBlock(errorBlock);
    assertEquals(errorRes, {
        ok: true,
        event: "error",
        data: "Upstream failure",
    });
});

Deno.test("useAskStream: parseSseBlock handles invalid or missing data", () => {
    // Missing event
    assertEquals(parseSseBlock('data: "hello"'), null);

    // Missing data
    assertEquals(parseSseBlock("event: token"), null);

    // Empty block
    assertEquals(parseSseBlock("   \n\n  "), null);

    // Invalid JSON
    assertEquals(parseSseBlock("event: token\ndata: unquoted plain text"), {
        ok: false,
        error: "invalid_json",
    });
});

Deno.test("useAskStream: applySseEvent updates accumulator correctly", () => {
    const acc: StreamAccumulator = {
        meta: null,
        liveText: "",
        liveParts: [],
        receivedDone: false,
        streamFailed: false,
    };

    // 1. Meta event
    applySseEvent(acc, "meta", {
        conversationId: "conv-1",
        userMessageId: "user-1",
        assistantMessageId: "asst-1",
        title: "Hello Title",
    });
    assertEquals(acc.meta, {
        type: "meta",
        conversationId: "conv-1",
        userMessageId: "user-1",
        assistantMessageId: "asst-1",
        title: "Hello Title",
    });

    // 2. Token events
    applySseEvent(acc, "token", "Hello");
    applySseEvent(acc, "token", " world!");
    assertEquals(acc.liveText, "Hello world!");

    // 3. Tool call
    applySseEvent(acc, "tool-call", {
        callId: "c_1",
        toolName: "webSearch",
        args: { q: "deno" },
    });
    assertEquals(acc.liveParts.length, 1);
    assertEquals(acc.liveParts[0], {
        type: "tool-call",
        callId: "c_1",
        toolName: "webSearch",
        args: { q: "deno" },
    });

    // 4. Tool result
    applySseEvent(acc, "tool-result", {
        callId: "c_1",
        toolName: "webSearch",
        result: { hits: 3 },
    });
    assertEquals(acc.liveParts.length, 2);
    assertEquals(acc.liveParts[1], {
        type: "tool-result",
        callId: "c_1",
        toolName: "webSearch",
        result: { hits: 3 },
        error: undefined,
    });

    // 5. Sources
    applySseEvent(acc, "sources", {
        sources: [{ title: "Deno manual", url: "https://deno.land" }],
    });
    assertEquals(acc.liveParts.length, 3);
    assertEquals(acc.liveParts[2], {
        type: "sources",
        sources: [{ title: "Deno manual", url: "https://deno.land" }],
    });
    // 5b. Documents tool and source events
    applySseEvent(acc, "tool-call", {
        callId: "doc-call",
        toolName: "documents",
        args: { query: "release notes" },
    });
    applySseEvent(acc, "tool-result", {
        callId: "doc-call",
        toolName: "documents",
        result: [{ id: "doc-1", title: "Release notes" }],
    });
    applySseEvent(acc, "sources", {
        sources: [{
            type: "document",
            documentId: "doc-1",
            title: "Release notes",
            snippet: "Updated product changes",
        }],
    });
    assertEquals(acc.liveParts[3], {
        type: "tool-call",
        callId: "doc-call",
        toolName: "documents",
        args: { query: "release notes" },
    });
    assertEquals(acc.liveParts[4], {
        type: "tool-result",
        callId: "doc-call",
        toolName: "documents",
        result: [{ id: "doc-1", title: "Release notes" }],
        error: undefined,
    });
    assertEquals(acc.liveParts[5], {
        type: "sources",
        sources: [{
            type: "document",
            documentId: "doc-1",
            title: "Release notes",
            snippet: "Updated product changes",
        }],
    });

    // 6. Done event
    assertEquals(acc.receivedDone, false);
    applySseEvent(acc, "done", {});
    assertEquals(acc.receivedDone, true);

    // 7. Error event with string
    applySseEvent(acc, "error", "Rate limit exceeded");
    assertEquals(acc.streamFailed, true);
    assertEquals(acc.errorMessage, "Rate limit exceeded");

    // 8. Error event with object { message: ... }
    applySseEvent(acc, "error", { message: "Upstream gateway error" });
    assertEquals(acc.errorMessage, "Upstream gateway error");

    // 9. Error event with object { error: ... }
    applySseEvent(acc, "error", { error: "Custom provider failure" });
    assertEquals(acc.errorMessage, "Custom provider failure");
});

Deno.test("useAskStream: createOptimisticStreamSnapshot builds new conversation and messages", () => {
    const meta: StreamMeta = {
        type: "meta",
        conversationId: "conv-new",
        userMessageId: "u-msg-1",
        assistantMessageId: "a-msg-1",
        title: "How to use Deno?",
    };

    const snapshot = createOptimisticStreamSnapshot({
        previous: null,
        meta,
        userId: "user-42",
        submittedText: "How to use Deno?",
        attachments: [{
            id: "att-1",
            name: "code.ts",
            type: "text",
            mimeType: "text/plain",
            data: "console.log('hi')",
        }],
        liveText: "Deno is a secure runtime for JavaScript and TypeScript.",
        liveParts: [],
        providerId: "prov-openai",
        modelId: "gpt-4o",
        isAborted: false,
        timestamp: 1000,
        effectiveHistoryEnabled: true,
        effectiveSystemInstruction: "Be concise",
    });

    assertEquals(snapshot.conversation.id, "conv-new");
    assertEquals(snapshot.conversation.userId, "user-42");
    assertEquals(snapshot.conversation.title, "How to use Deno?");
    assertEquals(snapshot.conversation.activeLeafMessageId, "a-msg-1");
    assertEquals(snapshot.conversation.historyEnabled, true);
    assertEquals(snapshot.conversation.systemInstruction, "Be concise");

    assertEquals(snapshot.messages.length, 2);

    const userMsg = snapshot.messages[0];
    assertEquals(userMsg.id, "u-msg-1");
    assertEquals(userMsg.role, "user");
    assertEquals(userMsg.content, "How to use Deno?");
    assertEquals(userMsg.status, "complete");
    assertEquals(userMsg.parts?.length, 2);
    assertEquals(userMsg.parts?.[0], {
        type: "text",
        text: "How to use Deno?",
    });
    assertEquals(userMsg.parts?.[1], {
        type: "attachment",
        id: "att-1",
        name: "code.ts",
        mimeType: "text/plain",
        data: "console.log('hi')",
    });

    const asstMsg = snapshot.messages[1];
    assertEquals(asstMsg.id, "a-msg-1");
    assertEquals(asstMsg.role, "assistant");
    assertEquals(
        asstMsg.content,
        "Deno is a secure runtime for JavaScript and TypeScript.",
    );
    assertEquals(asstMsg.parentMessageId, "u-msg-1");
    assertEquals(asstMsg.status, "streaming");
    assertEquals(asstMsg.providerId, "prov-openai");
    assertEquals(asstMsg.modelId, "gpt-4o");
});

Deno.test("useAskStream: createOptimisticStreamSnapshot preserves interrupted status on abort", () => {
    const meta: StreamMeta = {
        type: "meta",
        conversationId: "conv-1",
        userMessageId: "u-1",
        assistantMessageId: "a-1",
    };

    const snapshot = createOptimisticStreamSnapshot({
        previous: null,
        meta,
        userId: "user-1",
        submittedText: "Write a long story",
        attachments: [],
        liveText: "Once upon a time in a faraway galaxy...",
        liveParts: [],
        providerId: "p1",
        modelId: "m1",
        isAborted: true, // User clicked Stop!
        timestamp: 5000,
        effectiveHistoryEnabled: false,
        effectiveSystemInstruction: null,
    });

    const asstMsg = snapshot.messages.find((m) => m.id === "a-1");
    assertEquals(asstMsg?.status, "interrupted");
    assertEquals(asstMsg?.content, "Once upon a time in a faraway galaxy...");
});

Deno.test("useAskStream: createOptimisticStreamSnapshot handles editMessageId and preserves parent tree", () => {
    const existing: ConversationFullData = {
        conversation: {
            id: "c-1",
            userId: "u1",
            title: "Original Title",
            historyEnabled: true,
            systemInstruction: null,
            activeLeafMessageId: "a-1",
            createdAt: 100,
            updatedAt: 100,
        },
        messages: [
            createMockMsg("u-1", null, "user", "First question", 100),
            createMockMsg(
                "a-1",
                "u-1",
                "assistant",
                "First answer",
                200,
                "p1",
                "m1",
            ),
            createMockMsg("u-2", "a-1", "user", "Old question", 300),
        ],
    };

    const meta: StreamMeta = {
        type: "meta",
        conversationId: "c-1",
        userMessageId: "u-2-edited",
        assistantMessageId: "a-2-new",
    };

    // User edits message u-2 (whose parent is a-1)
    const snapshot = createOptimisticStreamSnapshot({
        previous: existing,
        meta,
        userId: "u1",
        submittedText: "Edited question",
        attachments: [],
        liveText: "New answer",
        liveParts: [],
        providerId: "p1",
        modelId: "m1",
        isAborted: false,
        timestamp: 400,
        effectiveHistoryEnabled: true,
        effectiveSystemInstruction: null,
        options: {
            editMessageId: "u-2",
            parentMessageId: "a-1",
        },
    });

    const editedUserMsg = snapshot.messages.find((m) => m.id === "u-2-edited");
    assertNotEquals(editedUserMsg, undefined);
    assertEquals(editedUserMsg?.parentMessageId, "a-1");
    assertEquals(editedUserMsg?.content, "Edited question");

    const newAsstMsg = snapshot.messages.find((m) => m.id === "a-2-new");
    assertNotEquals(newAsstMsg, undefined);
    assertEquals(newAsstMsg?.parentMessageId, "u-2-edited");
    assertEquals(newAsstMsg?.content, "New answer");
    assertEquals(snapshot.conversation.activeLeafMessageId, "a-2-new");
});

Deno.test("useAskStream: createOptimisticStreamSnapshot handles regenerateMessageId variant grouping", () => {
    const existing: ConversationFullData = {
        conversation: {
            id: "c-1",
            userId: "u1",
            title: "Original",
            historyEnabled: true,
            systemInstruction: null,
            activeLeafMessageId: "a-1",
            createdAt: 100,
            updatedAt: 100,
        },
        messages: [
            createMockMsg("u-1", null, "user", "Tell me a joke", 100),
            createMockMsg(
                "a-1",
                "u-1",
                "assistant",
                "Why did the chicken cross the road?",
                200,
                "p1",
                "m1",
            ),
        ],
    };

    const meta: StreamMeta = {
        type: "meta",
        conversationId: "c-1",
        userMessageId: "u-1",
        assistantMessageId: "a-2",
    };

    const snapshot = createOptimisticStreamSnapshot({
        previous: existing,
        meta,
        userId: "u1",
        submittedText: "Tell me a joke",
        attachments: [],
        liveText: "A programmer walks into a bar...",
        liveParts: [],
        providerId: "p1",
        modelId: "m1",
        isAborted: false,
        timestamp: 300,
        effectiveHistoryEnabled: true,
        effectiveSystemInstruction: null,
        options: {
            regenerateMessageId: "a-1",
            parentMessageId: "u-1",
        },
    });

    const regeneratedAsstMsg = snapshot.messages.find((m) => m.id === "a-2");
    assertNotEquals(regeneratedAsstMsg, undefined);
    assertEquals(regeneratedAsstMsg?.variantGroupId, "a-1");
    assertEquals(regeneratedAsstMsg?.parentMessageId, "u-1");
    assertEquals(
        regeneratedAsstMsg?.content,
        "A programmer walks into a bar...",
    );
});

Deno.test("useAskStream: shouldApplyCanonicalConversation preserves client snapshot when aborted and backend still streaming", () => {
    const streamingMessages: AiMessageDto[] = [
        createMockMsg("u-1", null, "user", "Question", 100),
        {
            ...createMockMsg(
                "a-1",
                "u-1",
                "assistant",
                "Incomplete answer",
                200,
            ),
            status: "streaming", // Backend hasn't completed persisting abort yet
        },
    ];

    // Aborted stream + backend message still "streaming": MUST NOT overwrite client snapshot
    const shouldApplyStreaming = shouldApplyCanonicalConversation({
        isAborted: true,
        canonicalMessages: streamingMessages,
        assistantMessageId: "a-1",
    });
    assertEquals(shouldApplyStreaming, false);

    // Aborted stream + backend message now terminal ("interrupted" or "complete"): CAN overwrite
    const terminalMessages: AiMessageDto[] = [
        createMockMsg("u-1", null, "user", "Question", 100),
        {
            ...createMockMsg(
                "a-1",
                "u-1",
                "assistant",
                "Incomplete answer",
                200,
            ),
            status: "interrupted",
        },
    ];
    const shouldApplyTerminal = shouldApplyCanonicalConversation({
        isAborted: true,
        canonicalMessages: terminalMessages,
        assistantMessageId: "a-1",
    });
    assertEquals(shouldApplyTerminal, true);

    // Normal completed stream (not aborted): ALWAYS applies canonical backend data
    const shouldApplyNormal = shouldApplyCanonicalConversation({
        isAborted: false,
        canonicalMessages: terminalMessages,
        assistantMessageId: "a-1",
    });
    assertEquals(shouldApplyNormal, true);
});
Deno.test("useAskStream: failed optimistic messages keep a sanitized local reason", () => {
    const meta: StreamMeta = {
        type: "meta",
        conversationId: "conv-failed",
        userMessageId: "user-failed",
        assistantMessageId: "assistant-failed",
    };
    const snapshot = createOptimisticStreamSnapshot({
        previous: null,
        meta,
        userId: "user-1",
        submittedText: "Explain this",
        attachments: [],
        liveText: "Partial answer",
        liveParts: [],
        providerId: "provider-1",
        modelId: "model-1",
        isAborted: false,
        isFailed: true,
        failureReason: "Provider failed\u0000\nPlease retry",
        timestamp: 1000,
        effectiveHistoryEnabled: true,
        effectiveSystemInstruction: null,
    });
    const assistantMessage = snapshot.messages.find((message) =>
        message.id === "assistant-failed"
    );
    assertEquals(assistantMessage?.status, "failed");
    assertEquals(
        assistantMessage?.failureReason,
        "Provider failed Please retry",
    );
});

Deno.test("useAskStream: failure reasons remove controls and stay bounded", () => {
    assertEquals(
        sanitizeFailureReason("  provider\u0000 error\ntry again  "),
        "provider error try again",
    );
    assertEquals(sanitizeFailureReason("\u0000 \n"), "模型生成失败，请重试。");
    assertEquals(
        Array.from(sanitizeFailureReason("x".repeat(200))).length,
        180,
    );
});

Deno.test("useAskStream: keeps terminal local failures while backend persists", () => {
    const streamingMessage: AiMessageDto = {
        ...createMockMsg("a-1", "u-1", "assistant", "Partial answer", 200),
        status: "streaming",
    };
    assertEquals(
        shouldApplyCanonicalConversation({
            isAborted: false,
            isFailed: true,
            canonicalMessages: [streamingMessage],
            assistantMessageId: "a-1",
        }),
        false,
    );
    assertEquals(
        shouldApplyCanonicalConversation({
            isAborted: true,
            canonicalMessages: [],
            assistantMessageId: "a-1",
        }),
        false,
    );
    assertEquals(
        shouldApplyCanonicalConversation({
            isAborted: false,
            isFailed: true,
            canonicalMessages: [
                {
                    ...streamingMessage,
                    status: "failed",
                },
            ],
            assistantMessageId: "a-1",
        }),
        true,
    );
});

Deno.test("useAskStream: preserves prior failure details after a later successful turn", () => {
    const makeConversation = (
        messages: AiMessageDto[],
    ): ConversationFullData => ({
        conversation: {
            id: "c-1",
            userId: "u-1",
            title: "Follow-up",
            historyEnabled: true,
            activeLeafMessageId: messages.at(-1)?.id ?? null,
            systemInstruction: null,
            createdAt: 1,
            updatedAt: 1,
        },
        messages,
    });
    const originalUser = createMockMsg(
        "u-1",
        null,
        "user",
        "Explain this",
        100,
    );
    const failedAssistant: AiMessageDto = {
        ...createMockMsg(
            "assistant-failed",
            "u-1",
            "assistant",
            "Partial answer",
            200,
        ),
        status: "failed",
    };
    const localFailure = mergeCanonicalConversation({
        canonical: makeConversation([originalUser, failedAssistant]),
        previous: null,
        currentFailure: {
            assistantMessageId: "assistant-failed",
            reason: "Provider failure\u0000\nPlease retry",
        },
    });
    const followUpUser = createMockMsg(
        "u-2",
        "assistant-failed",
        "user",
        "Try another explanation",
        300,
    );
    const successfulAssistant = createMockMsg(
        "assistant-success",
        "u-2",
        "assistant",
        "Here is another explanation",
        400,
    );
    const afterSuccessfulTurn = mergeCanonicalConversation({
        canonical: makeConversation([
            originalUser,
            failedAssistant,
            followUpUser,
            successfulAssistant,
        ]),
        previous: localFailure,
    });
    const retainedFailure = afterSuccessfulTurn.messages.find((message) =>
        message.id === "assistant-failed"
    );
    assertEquals(
        retainedFailure?.failureReason,
        "Provider failure Please retry",
    );
    assertEquals(
        convertAiMessageToThreadMessageLike(retainedFailure!).status,
        {
            type: "incomplete",
            reason: "error",
            error: "Provider failure Please retry",
        },
    );
});
