import { assertEquals, assertNotEquals } from "@std/assert";
import {
    applySseEvent,
    createOptimisticStreamSnapshot,
    parseSseBlock,
    shouldApplyCanonicalConversation,
    type StreamAccumulator,
} from "./useAskStream.ts";
import type { ConversationFullData, StreamMeta } from "./types.ts";
import type { AiMessageDto } from "../../../../src/features/ai/types.ts";

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
