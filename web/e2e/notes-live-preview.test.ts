import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

Deno.test("Notes Live Preview: opening and switching preserve canonical Markdown without saves", async () => {
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
    const body = "# 中文标题\n\n* 原有标记\n* 第二项\n\n第一行\n第二行";
    await page.evaluate(async (body) => {
        const response = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "Live contract", body }),
        });
        if (!response.ok) throw new Error("Cannot create note");
    }, body);
    await page.reload();
    await page.locator(
        '.desktop-dock button[data-workspace="notes"], .zen-edge-btn[data-workspace="notes"]',
    ).first().click();
    await page.locator(".notes-workspace-list .note-title").filter({
        hasText: "Live contract",
    }).click();
    const writes: string[] = [];
    page.on("request", (request) => {
        if (
            request.method() === "PATCH" &&
            request.url().includes("/api/notes/")
        ) writes.push(request.postData() ?? "");
    });
    await page.locator('.note-live-editor [contenteditable="true"]').waitFor();
    assertEquals(
        await page.getByRole("tab", { name: "所见即所得", exact: true })
            .getAttribute("aria-selected"),
        "true",
    );
    await page.getByRole("tab", { name: "源码", exact: true }).click();
    assertEquals(
        await page.locator("textarea.note-body-textarea").inputValue(),
        body,
    );
    await page.getByRole("tab", { name: "所见即所得", exact: true }).click();
    await page.locator('.note-live-editor [contenteditable="true"]').waitFor();
    // Cross the autosave debounce; mode hydration must never create a transaction to save.
    await page.waitForTimeout(1800);
    assertEquals(writes, []);
});
