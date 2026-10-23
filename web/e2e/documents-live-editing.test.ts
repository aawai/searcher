import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

Deno.test("Documents rich editing: IME, shortcuts and silent cloud replacement", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const credentials = await app.seedAskFixtureUser({
        username: "doc_live_user",
        password: "Doc-live-pass-123!",
    });
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
        const response = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "Live business", body: "旧正文" }),
        });
        if (!response.ok) throw new Error("Cannot create document");
        return (await response.json()).data.id as string;
    });
    await page.reload();
    await page.locator('button[data-workspace="documents"]').first().click();
    await page.locator(`[data-document-id="${id}"] h4 button`).click();
    const live = page.locator(".document-editor-container .ProseMirror");
    await live.waitFor();
    const writes: Array<{ body: string; origin: string }> = [];
    page.on("request", (request) => {
        if (
            request.method() === "PATCH" &&
            request.url().endsWith(`/api/documents/${id}`)
        ) writes.push(request.postDataJSON());
    });
    const status = page.locator(".document-save-status");

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
            await status.and(page.locator('[data-status="saved"]')).waitFor();
            assertEquals(writes.at(-1)?.origin, "autosave");
            assertEquals(writes.at(-1)?.body.trim(), "中文输入");
        },
    );

    await t.step(
        "selection, undo/redo and Ctrl+S manual save keep the user's edits",
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
            const response = page.waitForResponse((res) =>
                res.request().method() === "PATCH" &&
                res.url().endsWith(`/api/documents/${id}`)
            );
            await live.press("Control+s");
            assertEquals((await response).status(), 200);
            assertEquals(writes.at(-1)?.origin, "manual");
        },
    );

    await t.step(
        "clean editor adopts a cloud replacement silently; dirty editor keeps user edits",
        async () => {
            const remote = (body: string) =>
                page.evaluate(async ({ id, body }) => {
                    const current =
                        (await (await fetch(`/api/documents/${id}`)).json())
                            .data;
                    const res = await fetch(`/api/documents/${id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            version: current.version,
                            body,
                        }),
                    });
                    if (!res.ok) throw new Error(await res.text());
                }, { id, body });
            await status.and(page.locator('[data-status="saved"]')).waitFor();
            await remote("云端静默替换");
            await page.waitForFunction(
                () =>
                    document.querySelector(
                        ".document-editor-container .ProseMirror",
                    )?.textContent === "云端静默替换",
            );
            assertEquals(
                await page.getByRole("dialog", { name: "发现版本冲突" })
                    .count(),
                0,
            );
            await live.fill("用户尚未保存的编辑");
            await remote("另一设备的更新");
            await page.getByRole("dialog", { name: "发现版本冲突" }).waitFor();
            assertEquals(
                await live.textContent(),
                "用户尚未保存的编辑",
                "a cloud change must never overwrite dirty local text",
            );
        },
    );
});
