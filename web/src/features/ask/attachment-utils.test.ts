import { assertEquals } from "@std/assert";
import { validateAttachmentFile } from "./attachment-utils.ts";

Deno.test("attachment-utils: rejects image if vision not supported", () => {
    const file = new File(["dummy content"], "test.png", { type: "image/png" });
    const result = validateAttachmentFile(file, 0, false);
    assertEquals(result.valid, false);
    if (!result.valid) {
        assertEquals(result.reason.includes("不支持视觉"), true);
    }
});

Deno.test("attachment-utils: accepts image if vision is supported and under 5MiB", () => {
    const file = new File(["dummy content"], "test.png", { type: "image/png" });
    const result = validateAttachmentFile(file, 0, true);
    assertEquals(result.valid, true);
    if (result.valid) {
        assertEquals(result.type, "image");
    }
});

Deno.test("attachment-utils: rejects image if over 5MiB", () => {
    const bigBlob = new Uint8Array(5 * 1024 * 1024 + 10);
    const file = new File([bigBlob], "big.png", { type: "image/png" });
    const result = validateAttachmentFile(file, 0, true);
    assertEquals(result.valid, false);
    if (!result.valid) {
        assertEquals(result.reason.includes("5 MiB"), true);
    }
});

Deno.test("attachment-utils: accepts text documents under 1MiB", () => {
    const file = new File(["# Title\nHello"], "notes.md", {
        type: "text/markdown",
    });
    const result = validateAttachmentFile(file, 0, false);
    assertEquals(result.valid, true);
    if (result.valid) {
        assertEquals(result.type, "text");
    }
});

Deno.test("attachment-utils: rejects when max files reached", () => {
    const file = new File(["hello"], "file.txt", { type: "text/plain" });
    const result = validateAttachmentFile(file, 4, true);
    assertEquals(result.valid, false);
    if (!result.valid) {
        assertEquals(result.reason.includes("最多只能添加 4 个附件"), true);
    }
});
