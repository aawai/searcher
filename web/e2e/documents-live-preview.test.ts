import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { openNotes } from "./helpers/desk.ts";

Deno.test("Document live preview: opening and switching preserve canonical Markdown without saves", async () => {
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
        const response = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "Live contract", body }),
        });
        if (!response.ok) throw new Error("Cannot create document");
    }, body);
    await page.reload();
    await openNotes(page);
    await page.locator("[data-document-id] h4 button").filter({
        hasText: "Live contract",
    }).click();
    const writes: string[] = [];
    page.on("request", (request) => {
        if (
            request.method() === "PATCH" &&
            new URL(request.url()).pathname.startsWith("/api/documents/")
        ) writes.push(request.postData() ?? "");
    });
    await page.locator('.document-editor-scroll-area [contenteditable="true"]')
        .waitFor();
    assertEquals(
        await page.getByRole("button", { name: "编辑", exact: true })
            .getAttribute("aria-pressed"),
        "true",
    );
    await page.getByRole("button", { name: "Markdown 源码", exact: true })
        .click();
    assertEquals(
        await page.getByRole("textbox", {
            name: "Markdown 源码正文",
            exact: true,
        }).inputValue(),
        body,
    );
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await page.locator('.document-editor-scroll-area [contenteditable="true"]')
        .waitFor();
    // Cross the autosave debounce; mode hydration must never create a transaction to save.
    await page.waitForTimeout(1800);
    assertEquals(writes, []);
});
