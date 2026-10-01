import { assertEquals } from "@std/assert";
import {
    getActiveBranchMessages,
    getMessageSiblings,
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

Deno.test("tree-utils: getMessageSiblings returns all siblings with correct index", () => {
    const messages = [
        createMsg("u1", null, "user", 100),
        createMsg("a1", "u1", "assistant", 200),
        createMsg("u2", "a1", "user", 300),
        createMsg("u3", "a1", "user", 350), // edited sibling of u2
        createMsg("u4", "a1", "user", 400), // another sibling
    ];

    const sibU3 = getMessageSiblings(messages, "u3");
    assertEquals(sibU3.count, 3);
    assertEquals(sibU3.currentIndex, 1);
    assertEquals(sibU3.siblings.map((m) => m.id), ["u2", "u3", "u4"]);
});

Deno.test("tree-utils: getMessageSiblings handles assistant variantGroupId", () => {
    const messages = [
        createMsg("u1", null, "user", 100),
        createMsg("a1_v1", "u1", "assistant", 200, "grp-1"),
        createMsg("a1_v2", "u1", "assistant", 250, "grp-1"),
    ];

    const sib = getMessageSiblings(messages, "a1_v2");
    assertEquals(sib.count, 2);
    assertEquals(sib.currentIndex, 1);
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
Deno.test("tree-utils: getMessageSiblings handles editing root prompt (first user message)", () => {
    // Initial prompt u1 was answered by a1
    // User edited initial prompt into u1_edited which was answered by a1_edited
    const messages = [
        createMsg("u1", null, "user", 100),
        createMsg("a1", "u1", "assistant", 200),
        createMsg("u1_edited", null, "user", 300),
        createMsg("a1_edited", "u1_edited", "assistant", 400),
    ];

    const sibU1 = getMessageSiblings(messages, "u1");
    assertEquals(sibU1.count, 2);
    assertEquals(sibU1.currentIndex, 0);
    assertEquals(sibU1.siblings.map((m) => m.id), ["u1", "u1_edited"]);

    const sibEdited = getMessageSiblings(messages, "u1_edited");
    assertEquals(sibEdited.count, 2);
    assertEquals(sibEdited.currentIndex, 1);
});
