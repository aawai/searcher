import type { ThreadMessageLike } from "@assistant-ui/react";
import type { AiMessageDto } from "./types.ts";

export function convertAiMessageToThreadMessageLike(
    msg: AiMessageDto,
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
                error: "生成失败",
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
