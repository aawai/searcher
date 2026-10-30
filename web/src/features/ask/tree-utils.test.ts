import { assertEquals } from "@std/assert";
import {
    getActiveBranchMessages,
    resolveLeafForSibling,
} from "./tree-utils.ts";
import type { AiMessageDto } from "./types.ts";

function createMsg(
    id: string,
    parentMessageId: string | null,
    role: "user" | "assistant",
    createdAt: number,
    variantGroupId: string | null = null,
): AiMessageDto {
    return {
        id,
        conversationId: "conv-1",
        parentMessageId,
        role,
        content: `Message ${id}`,
        providerId: "prov-1",
        modelId: "gpt-5.6-sol",
        status: "complete",
        variantGroupId,
        inputTokens: 10,
        outputTokens: 20,
        createdAt,
    };
}

Deno.test("tree-utils: getActiveBranchMessages with legacy linear messages without parentMessageId", () => {
    const messages = [
        createMsg("m1", null, "user", 100),
        createMsg("m2", null, "assistant", 200),
        createMsg("m3", null, "user", 300),
    ];
    const branch = getActiveBranchMessages(messages);
    assertEquals(branch.map((m) => m.id), ["m1", "m2", "m3"]);
});

Deno.test("tree-utils: getActiveBranchMessages follows parent chain to active leaf", () => {
    // Tree:
    // u1 (root) -> a1 -> u2 -> a2 (active leaf)
    //                \-> u3 -> a3
    const messages = [
        createMsg("u1", null, "user", 100),
        createMsg("a1", "u1", "assistant", 200),
        createMsg("u2", "a1", "user", 300),
        createMsg("a2", "u2", "assistant", 400),
        createMsg("u3", "a1", "user", 500),
        createMsg("a3", "u3", "assistant", 600),
    ];

    const branchA2 = getActiveBranchMessages(messages, "a2");
    assertEquals(branchA2.map((m) => m.id), ["u1", "a1", "u2", "a2"]);

    const branchA3 = getActiveBranchMessages(messages, "a3");
    assertEquals(branchA3.map((m) => m.id), ["u1", "a1", "u3", "a3"]);
});

Deno.test("tree-utils: resolveLeafForSibling navigates down subtree to latest leaf", () => {
    const messages = [
        createMsg("u1", null, "user", 100),
        createMsg("a1", "u1", "assistant", 200),
        createMsg("u2", "a1", "user", 300),
        createMsg("a2", "u2", "assistant", 400),
        createMsg("u3", "a1", "user", 500),
        createMsg("a3", "u3", "assistant", 600),
        createMsg("u4", "a3", "user", 700),
        createMsg("a4", "u4", "assistant", 800),
    ];

    // Sibling u3 should resolve down through a3 -> u4 -> a4
    const leaf = resolveLeafForSibling(messages, "u3");
    assertEquals(leaf, "a4");
});
