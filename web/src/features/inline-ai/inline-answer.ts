import { sanitizeFailureReason } from "../ask/assistant-message-adapter.ts";
import { getActiveBranchMessages } from "../ask/tree-utils.ts";
import type { ConversationFullData, SourceCitation } from "../ask/types.ts";

/** Router state the expanded view reads so its first frame already shows the answer. */
export interface ExpandedAnswerState {
    conversation: ConversationFullData;
}

export type InlineAnswerStatus =
    | "pending"
    | "streaming"
    | "done"
    | "interrupted"
    | "failed";

export interface InlineAnswerView {
    status: InlineAnswerStatus;
    question: string;
    answer: string;
    /** Personal notes first, then web sources; no repeats. */
    sources: SourceCitation[];
    /** Known once the server accepted the question; the expanded view opens it. */
    conversationId: string | null;
    failureReason: string | undefined;
}

function sourceKey(source: SourceCitation): string {
    return source.type === "document"
        ? `document:${source.documentId}`
        : `web:${source.url}`;
}

/**
 * Personal notes are cited before the web. Both groups keep the order the
 * model used them in, and a note or URL cited twice is listed once.
 */
export function orderSources(
    sources: readonly SourceCitation[],
): SourceCitation[] {
    const seen = new Set<string>();
    const unique = sources.filter((source) => {
        const key = sourceKey(source);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return [
        ...unique.filter((source) => source.type === "document"),
        ...unique.filter((source) => source.type !== "document"),
    ];
}

/** Reads the card state off the same conversation snapshot the Ask page renders. */
export function deriveInlineAnswer(params: {
    question: string;
    conversation: ConversationFullData | null;
    isStreaming: boolean;
    error: string | null;
}): InlineAnswerView {
    const { question, conversation, isStreaming, error } = params;
    const conversationId = conversation?.conversation.id ?? null;
    const assistantId = conversation
        ? getActiveBranchMessages(
            conversation.messages,
            conversation.conversation.activeLeafMessageId,
        ).findLast((message) => message.role === "assistant")?.id
        : undefined;
    const assistant = conversation?.messages.find((message) =>
        message.id === assistantId
    );

    if (!assistant) {
        return {
            status: !isStreaming && error ? "failed" : "pending",
            question,
            answer: "",
            sources: [],
            conversationId,
            failureReason: !isStreaming && error
                ? sanitizeFailureReason(error)
                : undefined,
        };
    }

    const sources = orderSources(
        (assistant.parts ?? []).flatMap((part) =>
            part.type === "sources" ? part.sources : []
        ),
    );
    let status: InlineAnswerStatus;
    switch (assistant.status) {
        case "complete":
            status = "done";
            break;
        case "failed":
            status = "failed";
            break;
        case "interrupted":
            status = "interrupted";
            break;
        case "streaming":
            // A persisted "streaming" that nobody is producing was cut off.
            status = isStreaming ? "streaming" : "interrupted";
            break;
    }
    return {
        status,
        question,
        answer: assistant.content,
        sources,
        conversationId,
        failureReason: status === "failed"
            ? sanitizeFailureReason(assistant.failureReason ?? error)
            : undefined,
    };
}
