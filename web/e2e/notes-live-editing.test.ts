import { assertEquals, assertStringIncludes } from "@std/assert";
import { chromium } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

Deno.test("Notes Live Preview: user changes, IME, shortcuts, cloud replacement and restore", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const credentials = await app.seedAskFixtureUser();
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    await loginAndVisit(page, app.origin, "/", credentials);
    const id = await page.evaluate(async () => {
        const response = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "Live business", body: "旧正文" }),
        });
        if (!response.ok) throw new Error("Cannot create note");
        return (await response.json()).data.id as string;
    });
    await page.reload();
    await page.locator(
        '.zen-edge-btn[data-workspace="notes"]',
    ).first().click();
    await page.locator(".notes-workspace-list .note-title").filter({
        hasText: "Live business",
    }).click();
    const live = page.locator(".note-live-editor .ProseMirror");
    await live.waitFor();
    const writes: Array<{ body: string; origin: string }> = [];
    page.on("request", (request) => {
        if (
            request.method() === "PATCH" &&
            request.url().endsWith(`/api/notes/${id}`)
        ) writes.push(request.postDataJSON());
    });

    async function manualSave() {
        const response = page.waitForResponse((response) =>
            response.request().method() === "PATCH" &&
            response.url().endsWith(`/api/notes/${id}`)
        );
        await live.press("Control+s");
        assertEquals((await response).status(), 200);
        await page.waitForFunction(() =>
            document.querySelector(".save-state")?.textContent === "已保存"
        );
    }

    await t.step(
        "IME does not save or format partial composition; final text autosaves",
        async () => {
            await live.fill("中文输入");
            await live.dispatchEvent("compositionstart", { data: "中文" });
            await live.dispatchEvent("keydown", {
                key: "b",
                ctrlKey: true,
                isComposing: true,
            });
            await page.waitForTimeout(1800);
            assertEquals(writes, []);
            assertEquals(await live.locator("strong").count(), 0);
            await live.dispatchEvent("compositionend", { data: "中文输入" });
            await page.waitForFunction(() =>
                document.querySelector(".save-state")?.textContent === "已保存"
            );
            assertEquals(writes.at(-1)?.origin, "autosave");
            assertEquals(writes.at(-1)?.body.trim(), "中文输入");
        },
    );

    await t.step(
        "selection, undo/redo, local link precedence and manual save",
        async () => {
            await live.fill("中文链接");
            await live.press("Control+a");
            await live.press("Control+b");
            assertEquals(
                await live.locator("strong").textContent(),
                "中文链接",
            );
            await live.press("Control+z");
            assertEquals(await live.locator("strong").count(), 0);
            await live.press("Control+Shift+z");
            assertEquals(
                await live.locator("strong").textContent(),
                "中文链接",
            );
            await live.press("Control+k");
            assertEquals(await live.locator("a").textContent(), "中文链接");
            assertEquals(
                await page.evaluate(() =>
                    document.activeElement?.closest(".note-live-editor") !==
                        null
                ),
                true,
            );
            await manualSave();
            assertEquals(writes.at(-1)?.origin, "manual");
            assertStringIncludes(writes.at(-1)?.body ?? "", "中文链接");
            assertStringIncludes(writes.at(-1)?.body ?? "", "https://");
        },
    );

    await t.step(
        "toolbar focus stays inside composite and tasks persist checked state",
        async () => {
            await live.fill("任务正文");
            const before = writes.length;
            await page.getByRole("button", { name: "任务列表", exact: true })
                .click();
            await page.getByRole("button", { name: "粗体", exact: true })
                .focus();
            await live.focus();
            assertEquals(writes.length, before);
            const checkbox = live.getByRole("checkbox", {
                name: "任务完成状态",
            });
            await checkbox.check();
            await manualSave();
            assertStringIncludes(writes.at(-1)?.body ?? "", "[x]");
            assertStringIncludes(writes.at(-1)?.body ?? "", "任务正文");
        },
    );

    await t.step(
        "use cloud replaces both modes without callback/autosave loop",
        async () => {
            await live.fill("本地待解决草稿");
            await page.evaluate(async (id) => {
                const note =
                    (await (await fetch(`/api/notes/${id}`)).json()).data;
                const response = await fetch(`/api/notes/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        body: "## 云端权威正文",
                        version: note.version,
                        origin: "manual",
                    }),
                });
                if (!response.ok) throw new Error("Cloud edit failed");
            }, id);
            await page.getByRole("dialog", { name: "发现版本冲突" }).waitFor();
            const before = writes.length;
            await page.getByRole("button", { name: "用云端版本", exact: true })
                .click();
            await page.getByRole("alertdialog").getByRole("button", {
                name: "确认用云端版本",
                exact: true,
            }).click();
            await live.locator("h2").waitFor();
            assertEquals(
                await live.locator("h2").textContent(),
                "云端权威正文",
            );
            await page.getByRole("tab", { name: "源码", exact: true }).click();
            assertEquals(
                await page.locator("textarea.note-body-textarea").inputValue(),
                "## 云端权威正文",
            );
            await page.getByRole("tab", { name: "所见即所得", exact: true })
                .click();
            await live.waitFor();
            await page.waitForTimeout(1800);
            assertEquals(writes.length, before);
        },
    );

    await t.step(
        "long Markdown saves without truncation; over-limit draft survives rejection",
        async () => {
            const long = "中".repeat(9500);
            await live.fill(long);
            await manualSave();
            assertEquals(writes.at(-1)?.body.trim(), "## " + long);
            const excessive = "中".repeat(10001);
            await live.fill(excessive);
            const rejected = page.waitForResponse((response) =>
                response.request().method() === "PATCH" &&
                response.url().endsWith(`/api/notes/${id}`)
            );
            await live.press("Control+s");
            assertEquals((await rejected).status(), 400);
            assertEquals(await live.textContent(), excessive);
            await live.fill("恢复前正文");
            await manualSave();
        },
    );

    await t.step(
        "restore updates Live and Source without a second PATCH",
        async () => {
            await page.getByRole("button", { name: "便签选项", exact: true })
                .click();
            await page.getByRole("menuitem", { name: "版本历史", exact: true })
                .click();
            const versionNumber = await page.evaluate(async (id) => {
                const versions =
                    (await (await fetch(`/api/notes/${id}/versions`)).json())
                        .data as Array<{ version: number; body: string }>;
                return versions.find((version) =>
                    version.body.includes("中文链接")
                )!.version;
            }, id);
            await page.locator(".note-history-list button").filter({
                hasText: `版本 ${versionNumber} ·`,
            }).click();
            const before = writes.length;
            await page.getByRole("button", { name: "恢复此版本", exact: true })
                .click();
            await page.getByRole("button", { name: "确认恢复", exact: true })
                .click();
            await page.locator(".note-history").waitFor({ state: "detached" });
            assertStringIncludes(await live.textContent() ?? "", "中文链接");
            await page.getByRole("tab", { name: "源码", exact: true }).click();
            assertStringIncludes(
                await page.locator("textarea.note-body-textarea").inputValue(),
                "中文链接",
            );
            await page.waitForTimeout(1800);
            assertEquals(writes.length, before);
        },
    );
    await t.step(
        "clean remote updates replace silently; dirty updates preserve an unmarked merge draft",
        async () => {
            const source = page.locator("textarea.note-body-textarea");
            async function updateRemote(body: string) {
                await page.evaluate(async ({ id, body }) => {
                    const note =
                        (await (await fetch(`/api/notes/${id}`)).json())
                            .data as { version: number };
                    const response = await fetch(`/api/notes/${id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            body,
                            version: note.version,
                            origin: "manual",
                        }),
                    });
                    if (!response.ok) {
                        throw new Error("Remote note update failed");
                    }
                }, { id, body });
            }

            const cleanStart = writes.length;
            await updateRemote("云端静默更新");
            await page.waitForFunction((body) => {
                const source = document.querySelector(
                    ".note-editor textarea.note-body-textarea",
                );
                return source instanceof HTMLTextAreaElement &&
                    source.value === body;
            }, "云端静默更新");
            await page.waitForTimeout(1700);
            assertEquals(writes.length, cleanStart + 1);

            const localBody = "本地待合并草稿";
            await source.fill(localBody);
            const dirtyStart = writes.length;
            await updateRemote("云端冲突更新");
            const conflict = page.getByRole("dialog", { name: "发现版本冲突" });
            await conflict.waitFor();
            const merge = conflict.locator("textarea");
            const mergeInitial = await merge.inputValue();
            assertEquals(mergeInitial, localBody);
            await page.waitForTimeout(1700);
            assertEquals(writes.length, dirtyStart + 1);

            await merge.fill(localBody + "\n\n合并补充");
            const mergeSave = page.waitForResponse((response) =>
                response.request().method() === "PATCH" &&
                response.url().endsWith(`/api/notes/${id}`) &&
                response.request().postDataJSON().origin ===
                    "conflict_resolution"
            );
            await conflict.getByRole("button", {
                name: "合并并保存",
                exact: true,
            }).click();
            await page.getByRole("alertdialog").getByRole("button", {
                name: "确认覆盖云端",
                exact: true,
            }).click();
            assertEquals((await mergeSave).status(), 200);
            await conflict.waitFor({ state: "detached" });

            await source.fill("自己保存的正文");
            const ownSave = page.waitForResponse((response) =>
                response.request().method() === "PATCH" &&
                response.url().endsWith(`/api/notes/${id}`) &&
                response.request().postDataJSON().origin === "manual"
            );
            await source.press("Control+s");
            assertEquals((await ownSave).status(), 200);
            await page.waitForTimeout(1800);
            assertEquals(
                await page.getByRole("dialog", { name: "发现版本冲突" })
                    .count(),
                0,
            );
            assertEquals(await source.inputValue(), "自己保存的正文");
        },
    );
    await t.step(
        "unmount during live IME composition preserves the editor snapshot",
        async () => {
            await page.getByRole("tab", {
                name: "所见即所得",
                exact: true,
            }).click();
            await live.click();
            const count = writes.length;
            await live.dispatchEvent("compositionstart", { data: "" });
            await live.fill("组合编辑中的正文");
            await page.getByRole("button", {
                name: "返回便签列表",
                exact: true,
            }).click();
            await page.locator(".note-editor").waitFor({
                state: "detached",
            });
            await page.waitForTimeout(1800);
            assertEquals(writes.length, count);
            await page.locator(".notes-workspace-list .note-title").filter({
                hasText: "Live business",
            }).click();
            await live.waitFor();
            await page.waitForFunction(() => {
                const editor = document.querySelector(
                    ".note-live-editor .ProseMirror",
                );
                return editor?.textContent === "组合编辑中的正文";
            });
        },
    );
});
