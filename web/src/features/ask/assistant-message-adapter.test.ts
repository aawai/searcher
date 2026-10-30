import { assertEquals, assertThrows } from "@std/assert";
import { ExportedMessageRepository } from "@assistant-ui/react";
import { MessageRepository } from "@assistant-ui/core/internal";
import { convertAiMessageToThreadMessageLike } from "./assistant-message-adapter.ts";
import type { AiMessageDto } from "./types.ts";

Deno.test("assistant-message-adapter: ExportedMessageRepository accepts converted user and system messages without blank-UI status rejection", () => {
    // In database storage, both user and system messages frequently persist with status="complete".
    // When consumed by @assistant-ui runtime (via ExportedMessageRepository.fromBranchableArray),
    // any presence of `status` on user or system messages throws:
    // "Error: status is only supported for assistant messages" -> crashing React into blank UI.
    const userMsg: AiMessageDto = {
        id: "u-1",
        conversationId: "c-1",
        parentMessageId: null,
        role: "user",
        content: "Explain quantum teleportation",
        providerId: null,
        modelId: null,
        status: "complete",
        variantGroupId: null,
        inputTokens: null,
        outputTokens: null,
        createdAt: 1000,
    };

    const sysMsg: AiMessageDto = {
        id: "s-1",
        conversationId: "c-1",
        parentMessageId: null,
        role: "system",
        content: "You are an expert physicist.",
        providerId: null,
        modelId: null,
        status: "complete",
        variantGroupId: null,
        inputTokens: null,
        outputTokens: null,
        createdAt: 500,
    };

    // Converted messages must cleanly import into ExportedMessageRepository & MessageRepository
    const convUser = convertAiMessageToThreadMessageLike(userMsg);
    const convSys = convertAiMessageToThreadMessageLike(sysMsg);

    const exported = ExportedMessageRepository.fromBranchableArray([
        { message: convSys, parentId: null },
        { message: convUser, parentId: "s-1" },
    ], { headId: "u-1" });

    const repo = new MessageRepository();
    repo.import(exported);

    const activeMessages = repo.getMessages();
    assertEquals(activeMessages.map((m) => m.id), ["s-1", "u-1"]);
    assertEquals(activeMessages[0].role, "system");
    assertEquals(activeMessages[0].status, undefined);
    assertEquals(activeMessages[1].role, "user");
    assertEquals(activeMessages[1].status, undefined);

    // Regression protection: prove raw unadapted user/system messages with status are rejected by assistant-ui
    assertThrows(
        () => {
            ExportedMessageRepository.fromBranchableArray([
                {
                    message: {
                        id: "u-unadapted",
                        role: "user",
                        content: "Hello",
                        createdAt: new Date(),
                        // Status on user message triggers assistant-ui rejection
                        status: {
                            type: "complete",
                            reason: "stop",
                        } as unknown as never,
                    },
                    parentId: null,
                },
            ], { headId: "u-unadapted" });
        },
        Error,
        "status is only supported for assistant messages",
    );
});

Deno.test("assistant-message-adapter: ExportedMessageRepository preserves assistant streaming, complete, interrupted, and failed status snapshots", () => {
    const makeAssistantDto = (
        id: string,
        status: AiMessageDto["status"],
        content: string,
        parentMessageId: string | null = null,
    ): AiMessageDto => ({
        id,
        conversationId: "c-1",
        parentMessageId,
        role: "assistant",
        content,
        status,
        providerId: "p-gemini",
        modelId: "gemini-2.5-flash",
        variantGroupId: null,
        inputTokens: 120,
        outputTokens: 80,
        createdAt: 2000,
    });

    const dtos: AiMessageDto[] = [
        makeAssistantDto(
            "m-stream",
            "streaming",
            "streaming token snapshot...",
        ),
        makeAssistantDto(
            "m-interrupted",
            "interrupted",
            "cancelled midway",
            "m-stream",
        ),
        makeAssistantDto("m-failed", "failed", "", "m-interrupted"),
        makeAssistantDto(
            "m-complete",
            "complete",
            "fully finished response",
            "m-failed",
        ),
    ];

    const exported = ExportedMessageRepository.fromBranchableArray(
        dtos.map((m) => ({
            message: convertAiMessageToThreadMessageLike(m),
            parentId: m.parentMessageId,
        })),
        { headId: "m-complete" },
    );

    const repo = new MessageRepository();
    repo.import(exported);

    // 1. Streaming message -> running status snapshot with in-flight text
    const streamMsg = repo.getMessage("m-stream")?.message;
    assertEquals(streamMsg?.status, { type: "running" });
    assertEquals(streamMsg?.content, [{
        type: "text",
        text: "streaming token snapshot...",
    }]);

    // 2. Interrupted message -> incomplete / cancelled reason with partial text
    const interruptedMsg = repo.getMessage("m-interrupted")?.message;
    assertEquals(interruptedMsg?.status, {
        type: "incomplete",
        reason: "cancelled",
    });
    assertEquals(interruptedMsg?.content, [{
        type: "text",
        text: "cancelled midway",
    }]);

    // 3. Failed message -> incomplete / error reason with localized failure notice
    const failedMsg = repo.getMessage("m-failed")?.message;
    assertEquals(failedMsg?.status, {
        type: "incomplete",
        reason: "error",
        error: "模型生成失败，请重试。",
    });

    // 4. Complete message -> complete / stop reason with full content
    const completeMsg = repo.getMessage("m-complete")?.message;
    assertEquals(completeMsg?.status, { type: "complete", reason: "stop" });
    assertEquals(completeMsg?.content, [{
        type: "text",
        text: "fully finished response",
    }]);
});

Deno.test("assistant-message-adapter: converted messages keep their DTO ids so sibling branches resolve", () => {
    const base = {
        conversationId: "c-1",
        providerId: null,
        modelId: null,
        status: "complete" as const,
        variantGroupId: null,
        inputTokens: null,
        outputTokens: null,
    };
    // u1 -> a1 -> { u2a, u2b }
    const dtos: AiMessageDto[] = [
        {
            ...base,
            id: "u1",
            parentMessageId: null,
            role: "user",
            content: "Q",
            createdAt: 100,
        },
        {
            ...base,
            id: "a1",
            parentMessageId: "u1",
            role: "assistant",
            content: "A",
            createdAt: 200,
            providerId: "p1",
            modelId: "m1",
        },
        {
            ...base,
            id: "u2a",
            parentMessageId: "a1",
            role: "user",
            content: "QA",
            createdAt: 300,
        },
        {
            ...base,
            id: "u2b",
            parentMessageId: "a1",
            role: "user",
            content: "QB",
            createdAt: 400,
        },
    ];

    for (const dto of dtos) {
        assertEquals(convertAiMessageToThreadMessageLike(dto).id, dto.id);
    }

    const repo = new MessageRepository();
    repo.import(
        ExportedMessageRepository.fromBranchableArray(
            dtos.map((m) => ({
                message: convertAiMessageToThreadMessageLike(m),
                parentId: m.parentMessageId,
            })),
            { headId: "u2a" },
        ),
    );
    assertEquals(repo.getBranches("u2a"), ["u2a", "u2b"]);
});
