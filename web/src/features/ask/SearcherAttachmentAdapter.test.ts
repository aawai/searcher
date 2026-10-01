import { assertEquals, assertRejects } from "@std/assert";
import { SearcherAttachmentAdapter } from "./SearcherAttachmentAdapter.ts";

Deno.test("SearcherAttachmentAdapter: prevents count leak if processFileToAttachment fails and preserves 4-file limit", async () => {
    const adapter = new SearcherAttachmentAdapter();
    const origReadAsText = FileReader.prototype.readAsText;
    FileReader.prototype.readAsText = function () {
        queueMicrotask(() => {
            if (this.onerror) {
                this.onerror(
                    new ProgressEvent("error") as unknown as ProgressEvent<
                        FileReader
                    >,
                );
            }
        });
    };

    const failingFile = new File(["corrupt payload"], "failed.txt", {
        type: "text/plain",
    });

    try {
        await assertRejects(
            async () => {
                await adapter.add({ file: failingFile });
            },
            Error,
            "读取文件失败",
        );

        // Invariant: Failed file processing must NOT leak count
        assertEquals(adapter.count, 0);

        // All 4 allowed slots must remain available for subsequent valid files
        FileReader.prototype.readAsText = origReadAsText;

        const a1 = await adapter.add({
            file: new File(["file 1"], "f1.txt", { type: "text/plain" }),
        });
        const a2 = await adapter.add({
            file: new File(["file 2"], "f2.txt", { type: "text/plain" }),
        });
        const a3 = await adapter.add({
            file: new File(["file 3"], "f3.txt", { type: "text/plain" }),
        });
        const a4 = await adapter.add({
            file: new File(["file 4"], "f4.txt", { type: "text/plain" }),
        });

        assertEquals(adapter.count, 4);
        assertEquals(Boolean(a1.id && a2.id && a3.id && a4.id), true);

        // 5th file must be rejected by validation limit
        await assertRejects(
            async () => {
                await adapter.add({
                    file: new File(["file 5"], "f5.txt", {
                        type: "text/plain",
                    }),
                });
            },
            Error,
            "最多只能添加 4 个附件",
        );
    } finally {
        FileReader.prototype.readAsText = origReadAsText;
    }
});

Deno.test("SearcherAttachmentAdapter: remove decrements count and prevents double-decrement", async () => {
    const adapter = new SearcherAttachmentAdapter();
    const att1 = await adapter.add({
        file: new File(["one"], "one.txt", { type: "text/plain" }),
    });
    const att2 = await adapter.add({
        file: new File(["two"], "two.txt", { type: "text/plain" }),
    });

    assertEquals(adapter.count, 2);

    await adapter.remove(att1);
    assertEquals(adapter.count, 1);

    // Idempotent remove on same attachment must not decrement count again
    await adapter.remove(att1);
    assertEquals(adapter.count, 1);

    await adapter.remove(att2);
    assertEquals(adapter.count, 0);

    // Removing when empty never drops below 0
    await adapter.remove(att2);
    assertEquals(adapter.count, 0);
});

Deno.test("SearcherAttachmentAdapter: reset clears count and active tracking", async () => {
    const adapter = new SearcherAttachmentAdapter();
    await adapter.add({
        file: new File(["hello"], "test.txt", { type: "text/plain" }),
    });
    assertEquals(adapter.count, 1);

    adapter.reset();
    assertEquals(adapter.count, 0);

    // Can add 4 files cleanly after reset
    for (let i = 0; i < 4; i++) {
        await adapter.add({
            file: new File([`content ${i}`], `file-${i}.txt`, {
                type: "text/plain",
            }),
        });
    }
    assertEquals(adapter.count, 4);
});

Deno.test("SearcherAttachmentAdapter: updates accept filter based on vision capability", () => {
    const adapter = new SearcherAttachmentAdapter();
    assertEquals(adapter.accept.includes("image/png"), true);

    adapter.updateState(false);
    assertEquals(adapter.accept.includes("image/png"), false);
    assertEquals(adapter.accept.includes("text/plain"), true);

    adapter.updateState(true);
    assertEquals(adapter.accept.includes("image/png"), true);
});

Deno.test("SearcherAttachmentAdapter: invokes onError callback when validation or processing fails", async () => {
    let reportedError: string | null = null;
    const adapter = new SearcherAttachmentAdapter((err) => {
        reportedError = err;
    });

    // Disable vision, then attempt to add an image
    adapter.updateState(false);
    const imgFile = new File(["fake image"], "photo.png", {
        type: "image/png",
    });
    await assertRejects(
        async () => {
            await adapter.add({ file: imgFile });
        },
        Error,
        "当前模型不支持视觉输入 (Vision)，请选择支持视觉的模型",
    );

    assertEquals(
        reportedError,
        "当前模型不支持视觉输入 (Vision)，请选择支持视觉的模型",
    );
});
