import type { NoteItem } from "../src/components/searcher/NoteCard.tsx";
import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

Deno.test("Notes history flush, cancel, restore and failure preserve real server contracts", async () => {
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
            body: JSON.stringify({ title: "历史契约", body: "初始正文" }),
        });
        return (await response.json()).data.id as string;
    });
    await page.reload();
    await page.locator(
        '.desktop-dock button[data-workspace="notes"], .zen-edge-btn[data-workspace="notes"]',
    ).first().click();
    await page.locator(".notes-workspace-list .note-title").filter({
        hasText: "历史契约",
    }).click();
    const editor = page.locator(".note-editor");
    await editor.locator(".ProseMirror").waitFor();
    await editor.getByRole("tab", { name: "源码", exact: true }).click();
    const source = editor.locator(".note-body-textarea");
    const writes: string[] = [];
    page.on("request", (request) => {
        if (
            request.url().includes(`/api/notes/${id}`) &&
            ["PATCH", "POST"].includes(request.method())
        ) writes.push(request.method());
    });
    async function state(): Promise<NoteItem> {
        return await page.evaluate(
            async (id) => (await (await fetch(`/api/notes/${id}`)).json()).data,
            id,
        );
    }
    await editor.getByRole("textbox", { name: "便签标题", exact: true }).fill(
        "第一版标题",
    );
    await source.fill("第一版手动保存");
    await editor.getByRole("button", { name: "版本历史", exact: true }).click();
    await editor.getByRole("button", { name: "恢复此版本", exact: true })
        .waitFor();
    assertEquals(writes, ["PATCH"]);
    assertEquals((await state()).body, "第一版手动保存");
    await editor.getByRole("button", { name: "返回编辑", exact: true }).click();
    assertEquals(await source.inputValue(), "第一版手动保存");
    assertEquals(
        await source.evaluate((el) => el === document.activeElement),
        true,
    );
    await editor.getByRole("textbox", { name: "便签标题", exact: true }).fill(
        "第二版标题",
    );
    await source.fill("第二版手动保存");
    await editor.getByRole("button", { name: "版本历史", exact: true }).click();
    await editor.getByRole("button", { name: "恢复此版本", exact: true })
        .waitFor();
    const before = await state();
    await editor.locator(".note-history-list button").filter({
        hasText: `版本 ${before.version - 1} ·`,
    }).click();
    await editor.getByRole("button", { name: "恢复此版本", exact: true })
        .click();
    await page.getByRole("button", { name: "取消", exact: true }).click();
    assertEquals(await state(), before);
    assertEquals(writes, ["PATCH", "PATCH"]);
    await editor.getByRole("button", { name: "恢复此版本", exact: true })
        .click();
    await page.getByRole("button", { name: "确认恢复", exact: true }).click();
    await source.waitFor();
    assertEquals(await source.inputValue(), "第一版手动保存");
    const restored = await state();
    assertEquals(
        await editor.getByRole("textbox", { name: "便签标题", exact: true })
            .inputValue(),
        "第一版标题",
    );
    assertEquals(restored.body, "第一版手动保存");
    assertEquals(restored.version, before.version + 1);
    await editor.getByRole("button", { name: "版本历史", exact: true }).click();
    await editor.getByRole("button", { name: "恢复此版本", exact: true })
        .waitFor();
    assertEquals(writes, ["PATCH", "PATCH", "POST"]);
    await page.keyboard.press("Escape");
    await source.waitFor();
    await page.route(`**/api/notes/${id}`, (route) => route.abort());
    await source.fill("离线草稿");
    await editor.getByRole("button", { name: "版本历史", exact: true }).click();
    await editor.locator(".save-error").waitFor();
    assertEquals(await source.isVisible(), true);
    assertEquals(await source.inputValue(), "离线草稿");
    await page.unroute(`**/api/notes/${id}`);
    await editor.getByRole("button", { name: "重试同步", exact: true }).click();
    await editor.locator(".save-saved").waitFor();
    assertEquals((await state()).body, "离线草稿");
    const synced = await state();
    await source.fill("冲突草稿");
    await page.evaluate(async ({ id, version }) => {
        const response = await fetch(`/api/notes/${id}`, {
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
    await page.getByRole("button", { name: "用云端版本", exact: true })
        .waitFor();
    assertEquals(await editor.locator(".note-history").count(), 0);
    await page.getByRole("button", { name: "用云端版本", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", {
        name: "确认用云端版本",
        exact: true,
    }).click();
    await page.getByRole("button", { name: "用云端版本", exact: true }).waitFor(
        {
            state: "detached",
        },
    );
    await editor.getByRole("button", { name: "版本历史", exact: true }).click();
    await editor.locator(".note-history-list button").filter({
        hasText: "版本 2 ·",
    }).click();
    const beforeFailedRestore = await state();
    await page.route(
        `**/api/notes/${id}/versions/*/restore`,
        (route) => route.abort(),
    );
    await editor.getByRole("button", { name: "恢复此版本", exact: true })
        .click();
    await page.getByRole("button", { name: "确认恢复", exact: true }).click();
    await editor.getByRole("alert").filter({ hasText: "版本恢复失败" })
        .waitFor();
    assertEquals(await state(), beforeFailedRestore);
    assertEquals(await source.inputValue(), "另一设备更新");
    assertEquals(await source.isVisible(), false);
    await page.unroute(`**/api/notes/${id}/versions/*/restore`);
    await editor.getByRole("button", { name: "重试", exact: true }).click();
    await source.waitFor();
    assertEquals(await source.inputValue(), "第一版手动保存");
    assertEquals(
        await editor.getByRole("textbox", { name: "便签标题", exact: true })
            .inputValue(),
        "第一版标题",
    );
    assertEquals((await state()).color, "amber");
});
