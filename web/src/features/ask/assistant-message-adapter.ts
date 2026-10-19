import type { ThreadMessageLike } from "@assistant-ui/react";
import type { AskMessageDto } from "./types.ts";

const MAX_FAILURE_REASON_LENGTH = 180;

export function sanitizeFailureReason(reason: unknown): string {
    const normalized = (typeof reason === "string" ? reason : "")
        .replace(
            /[\p{Cc}\p{Cf}]/gu,
            " ",
        )
        .replace(/\s+/g, " ")
        .trim();
    if (!normalized) return "模型生成失败，请重试。";
    const characters = Array.from(normalized);
    return characters.length > MAX_FAILURE_REASON_LENGTH
        ? `${characters.slice(0, MAX_FAILURE_REASON_LENGTH - 1).join("")}…`
        : normalized;
}

export function convertAiMessageToThreadMessageLike(
    msg: AskMessageDto,
): ThreadMessageLike {
    let status: ThreadMessageLike["status"] = undefined;

    if (msg.role === "assistant") {
        if (msg.status === "streaming") {
            status = { type: "running" };
        } else if (msg.status === "interrupted") {
            status = { type: "incomplete", reason: "cancelled" };
        } else if (msg.status === "failed") {
            status = {
                type: "incomplete",
                reason: "error",
                error: sanitizeFailureReason(msg.failureReason),
            };
        } else {
            status = { type: "complete", reason: "stop" };
        }
    }

    return {
        id: msg.id,
        role: msg.role === "system"
            ? "system"
            : msg.role === "user"
            ? "user"
            : "assistant",
        content: msg.content,
        createdAt: new Date(msg.createdAt),
        ...(status ? { status } : {}),
        metadata: {
            custom: {
                rawMessage: msg,
                modelId: msg.modelId,
                providerId: msg.providerId,
                status: msg.status,
                inputTokens: msg.inputTokens,
                outputTokens: msg.outputTokens,
                parentMessageId: msg.parentMessageId,
                variantGroupId: msg.variantGroupId,
            },
        },
    };
}
