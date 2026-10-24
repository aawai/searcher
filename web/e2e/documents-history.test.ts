import type { DocumentDto } from "../../src/shared/documents.ts";
import { assertEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { openNotes } from "./helpers/desk.ts";

Deno.test("Document history flush, restore and failure preserve real server contracts", async () => {
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
        const response = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "历史契约", body: "初始正文" }),
        });
        return (await response.json()).data.id as string;
    });
    await page.reload();
    await openNotes(page);
    await page.locator("[data-document-id] h4 button").filter({
        hasText: "历史契约",
    }).click();
    const editor = page.locator(".document-editor-container");
    await editor.locator(".ProseMirror").waitFor();
    await page.getByRole("button", { name: "Markdown 源码", exact: true })
        .click();
    const source = page.getByRole("textbox", {
        name: "Markdown 源码正文",
        exact: true,
    });
    const writes: string[] = [];
    page.on("request", (request) => {
        if (
            request.url().includes(`/api/documents/${id}`) &&
            ["PATCH", "POST"].includes(request.method())
        ) writes.push(request.method());
    });
    async function state(): Promise<DocumentDto> {
        return await page.evaluate(
            async (id) =>
                (await (await fetch(`/api/documents/${id}`)).json()).data,
            id,
        );
    }
    const title = page.getByRole("textbox", { name: "笔记标题", exact: true });
    const openHistory = () =>
        page.getByRole("button", { name: "历史", exact: true }).click();
    const history = page.getByRole("dialog", { name: "历史版本" });
    const restoreButton = history.getByRole("button", {
        name: "恢复此版本",
        exact: true,
    });
    await title.fill("第一版标题");
    await source.fill("第一版手动保存");
    await openHistory();
    await history.getByRole("button", { name: /^#\d+/ }).first().waitFor();
    assertEquals(writes, ["PATCH"]);
    assertEquals((await state()).body, "第一版手动保存");
    await page.keyboard.press("Escape");
    await history.waitFor({ state: "detached" });
    assertEquals(await source.inputValue(), "第一版手动保存");
    assertEquals(
        await page.getByRole("button", { name: "历史", exact: true }).evaluate((
            el,
        ) => el === document.activeElement),
        true,
    );
    await title.fill("第二版标题");
    await source.fill("第二版手动保存");
    await openHistory();
    await history.getByRole("button", { name: /^#\d+/ }).first().waitFor();
    const before = await state();
    await history.getByRole("button", {
        name: new RegExp(`^#${before.version - 1}(?!\\d)`),
    }).click();
    await restoreButton.click();
    await history.waitFor({ state: "detached" });
    const restored = await state();
    assertEquals(writes, ["PATCH", "PATCH", "POST"]);
    await page.locator('.document-save-status[data-status="saved"]').waitFor();
    await source.waitFor();
    assertEquals(await source.inputValue(), "第一版手动保存");
    assertEquals(
        await title.inputValue(),
        "第一版标题",
    );
    assertEquals(restored.body, "第一版手动保存");
    assertEquals(restored.version, before.version + 1);
    await openHistory();
    await history.getByRole("button", { name: /^#\d+/ }).first().waitFor();
    await page.keyboard.press("Escape");
    await history.waitFor({ state: "detached" });
    await page.route(`**/api/documents/${id}`, (route) => route.abort());
    await source.fill("离线草稿");
    await page.locator('.document-save-status[data-status="error"]').waitFor();
    assertEquals(await source.isVisible(), true);
    assertEquals(await source.inputValue(), "离线草稿");
    await page.unroute(`**/api/documents/${id}`);
    await page.getByRole("button", { name: "重试保存", exact: true }).click();
    await page.locator('.document-save-status[data-status="saved"]').waitFor();
    assertEquals((await state()).body, "离线草稿");
    const synced = await state();
    await source.fill("冲突草稿");
    await page.evaluate(async ({ id, version }) => {
        const response = await fetch(`/api/documents/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                body: "另一设备更新",
                color: "amber",
                version,
            }),
        });
        if (!response.ok) throw new Error(await response.text());
    }, { id, version: synced.version });
    const conflict = page.getByRole("dialog", { name: "发现版本冲突" });
    await conflict.getByRole("button", { name: "用云端版本", exact: true })
        .waitFor();
    assertEquals(
        await page.getByRole("dialog", { name: "历史版本" }).count(),
        0,
    );
    await conflict.getByRole("button", { name: "用云端版本", exact: true })
        .click();
    await page.getByRole("alertdialog").getByRole("button", {
        name: "确认用云端版本",
        exact: true,
    }).click();
    await conflict.waitFor({ state: "detached" });
    await openHistory();
    await history.getByRole("button", { name: /^#2(?!\d)/ }).click();
    const beforeFailedRestore = await state();
    await page.route(
        `**/api/documents/${id}/versions/*/restore`,
        (route) => route.abort(),
    );
    await restoreButton.click();
    await history.getByText("恢复版本失败，请重试", { exact: true }).waitFor();
    assertEquals(await state(), beforeFailedRestore);
    await page.unroute(`**/api/documents/${id}/versions/*/restore`);
    await restoreButton.click();
    await history.waitFor({ state: "detached" });
    await source.waitFor();
    assertEquals(await source.inputValue(), "第一版手动保存");
    assertEquals(await title.inputValue(), "第一版标题");
    assertEquals((await state()).color, "amber");
});
