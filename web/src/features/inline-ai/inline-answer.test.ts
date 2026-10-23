import { assertEquals } from "@std/assert";
import type {
    AskMessageDto,
    ConversationFullData,
    SourceCitation,
} from "../ask/types.ts";
import { deriveInlineAnswer, orderSources } from "./inline-answer.ts";

const web = (url: string, title = url): SourceCitation => ({ url, title });
const doc = (documentId: string, title = documentId): SourceCitation => ({
    type: "document",
    documentId,
    title,
});

function message(
    patch: Partial<AskMessageDto> & Pick<AskMessageDto, "id" | "role">,
): AskMessageDto {
    return {
        conversationId: "c-1",
        parentMessageId: null,
        content: "",
        providerId: null,
        modelId: null,
        status: "complete",
        variantGroupId: null,
        inputTokens: null,
        outputTokens: null,
        createdAt: 1,
        ...patch,
    };
}

function conversation(
    assistant: Partial<AskMessageDto> | null,
): ConversationFullData {
    const messages = [
        message({ id: "u-1", role: "user", content: "我的计划是什么" }),
    ];
    if (assistant) {
        messages.push(
            message({
                id: "a-1",
                role: "assistant",
                parentMessageId: "u-1",
                createdAt: 2,
                ...assistant,
            }),
        );
    }
    return {
        conversation: {
            id: "c-1",
            userId: "u",
            title: "t",
            historyEnabled: true,
            activeLeafMessageId: assistant ? "a-1" : "u-1",
            systemInstruction: null,
            createdAt: 1,
            updatedAt: 1,
        },
        messages,
    };
}

Deno.test("sources: personal notes come before web sources, order otherwise kept", () => {
    assertEquals(
        orderSources([
            web("https://a.example"),
            doc("d1"),
            web("https://b.example"),
            doc("d2"),
        ]),
        [
            doc("d1"),
            doc("d2"),
            web("https://a.example"),
            web("https://b.example"),
        ],
    );
});

Deno.test("sources: the same note or URL is listed once, first occurrence wins", () => {
    assertEquals(
        orderSources([
            web("https://a.example", "first"),
            doc("d1", "笔记"),
            web("https://a.example", "second"),
            doc("d1", "笔记 重复"),
        ]),
        [doc("d1", "笔记"), web("https://a.example", "first")],
    );
});

Deno.test("answer view: nothing has arrived yet is pending, with the question", () => {
    assertEquals(
        deriveInlineAnswer({
            question: "我的计划",
            conversation: null,
            isStreaming: true,
            error: null,
        }),
        {
            status: "pending",
            question: "我的计划",
            answer: "",
            sources: [],
            conversationId: null,
            failureReason: undefined,
        },
    );
});

Deno.test("answer view: a streaming assistant message keeps growing text and ordered sources", () => {
    const view = deriveInlineAnswer({
        question: "我的计划是什么",
        conversation: conversation({
            status: "streaming",
            content: "根据你的笔记",
            parts: [
                { type: "text", text: "根据你的笔记" },
                { type: "sources", sources: [web("https://w.example")] },
                { type: "sources", sources: [doc("d1")] },
            ],
        }),
        isStreaming: true,
        error: null,
    });
    assertEquals(view.status, "streaming");
    assertEquals(view.answer, "根据你的笔记");
    assertEquals(view.conversationId, "c-1");
    assertEquals(view.sources, [doc("d1"), web("https://w.example")]);
});

Deno.test("answer view: terminal statuses map one to one, failure reason is sanitized", () => {
    const status = (patch: Partial<AskMessageDto>, isStreaming = false) =>
        deriveInlineAnswer({
            question: "q",
            conversation: conversation(patch),
            isStreaming,
            error: null,
        });
    assertEquals(status({ status: "complete", content: "好" }).status, "done");
    assertEquals(status({ status: "interrupted" }).status, "interrupted");
    const failed = status({ status: "failed", failureReason: "boom" });
    assertEquals(failed.status, "failed");
    assertEquals(typeof failed.failureReason, "string");
});

Deno.test("answer view: a persisted streaming status settles only once the stream ended", () => {
    const view = deriveInlineAnswer({
        question: "q",
        conversation: conversation({ status: "streaming", content: "半" }),
        isStreaming: false,
        error: null,
    });
    assertEquals(view.status, "interrupted");
});

Deno.test("answer view: a request error before any message is a failure", () => {
    const view = deriveInlineAnswer({
        question: "q",
        conversation: null,
        isStreaming: false,
        error: "请求失败 (HTTP 500)",
    });
    assertEquals(view.status, "failed");
    assertEquals(view.conversationId, null);
});

Deno.test("answer view: the user message alone is still pending while streaming", () => {
    const view = deriveInlineAnswer({
        question: "q",
        conversation: conversation(null),
        isStreaming: true,
        error: null,
    });
    assertEquals(view.status, "pending");
    assertEquals(view.conversationId, "c-1");
});
