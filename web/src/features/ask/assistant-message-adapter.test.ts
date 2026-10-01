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
        error: "生成失败",
    });

    // 4. Complete message -> complete / stop reason with full content
    const completeMsg = repo.getMessage("m-complete")?.message;
    assertEquals(completeMsg?.status, { type: "complete", reason: "stop" });
    assertEquals(completeMsg?.content, [{
        type: "text",
        text: "fully finished response",
    }]);
});

Deno.test("assistant-message-adapter: satisfies ExportedMessageRepository canonical branch repository contract and branch switching", () => {
    // Tree topology:
    // u1 (root user) -> a1 (root assistant)
    //                \-> u2a (branch A) -> a2a (branch A leaf)
    //                \-> u2b (branch B) -> a2b (branch B leaf)
    const treeDtos: AiMessageDto[] = [
        {
            id: "u1",
            conversationId: "c-1",
            parentMessageId: null,
            role: "user",
            content: "Initial question",
            status: "complete",
            providerId: null,
            modelId: null,
            variantGroupId: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: 100,
        },
        {
            id: "a1",
            conversationId: "c-1",
            parentMessageId: "u1",
            role: "assistant",
            content: "First answer",
            status: "complete",
            providerId: "p1",
            modelId: "m1",
            variantGroupId: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: 200,
        },
        {
            id: "u2a",
            conversationId: "c-1",
            parentMessageId: "a1",
            role: "user",
            content: "Clarification A",
            status: "complete",
            providerId: null,
            modelId: null,
            variantGroupId: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: 300,
        },
        {
            id: "a2a",
            conversationId: "c-1",
            parentMessageId: "u2a",
            role: "assistant",
            content: "Branch A Answer",
            status: "complete",
            providerId: "p1",
            modelId: "m1",
            variantGroupId: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: 400,
        },
        {
            id: "u2b",
            conversationId: "c-1",
            parentMessageId: "a1",
            role: "user",
            content: "Clarification B",
            status: "complete",
            providerId: null,
            modelId: null,
            variantGroupId: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: 500,
        },
        {
            id: "a2b",
            conversationId: "c-1",
            parentMessageId: "u2b",
            role: "assistant",
            content: "Branch B Answer",
            status: "complete",
            providerId: "p1",
            modelId: "m1",
            variantGroupId: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: 600,
        },
    ];

    const branchItems = treeDtos.map((m) => ({
        message: convertAiMessageToThreadMessageLike(m),
        parentId: m.parentMessageId,
    }));

    // Ingest with headId pointing to Branch A
    const branchRepo = new MessageRepository();
    branchRepo.import(
        ExportedMessageRepository.fromBranchableArray(branchItems, {
            headId: "a2a",
        }),
    );

    assertEquals(branchRepo.headId, "a2a");
    assertEquals(branchRepo.getMessages().map((m) => m.id), [
        "u1",
        "a1",
        "u2a",
        "a2a",
    ]);

    // Switching branch to a2b selects Branch B path
    branchRepo.switchToBranch("a2b");
    assertEquals(branchRepo.headId, "a2b");
    assertEquals(branchRepo.getMessages().map((m) => m.id), [
        "u1",
        "a1",
        "u2b",
        "a2b",
    ]);

    // Fork inspection confirms branches at the junction
    assertEquals(branchRepo.getBranches("u2a"), ["u2a", "u2b"]);
});
