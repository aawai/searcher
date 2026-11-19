import { assert, assertEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { openNoteRows } from "./helpers/library.ts";

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
    await openNoteRows(page);
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
    // List items keep their bullet in the live view.
    assertEquals(
        await page.locator(
            '.document-editor-scroll-area [contenteditable="true"] ul > li',
        ).first().evaluate((item) => {
            const style = getComputedStyle(item);
            return [style.display, style.listStyleType];
        }),
        ["list-item", "disc"],
    );
    const modes = page.getByRole("radiogroup", { name: "视图模式" });
    const edit = modes.getByRole("radio", { name: "编辑", exact: true });
    const source = modes.getByRole("radio", { name: "Markdown 源码" });
    await source.click();
    assertEquals(await source.isChecked(), true);
    assertEquals(
        await page.getByRole("textbox", {
            name: "Markdown 源码正文",
            exact: true,
        }).inputValue(),
        body,
    );
    await source.press("ArrowRight");
    assertEquals(await edit.isChecked(), true);
    assertEquals(
        await edit.evaluate((el) => el === document.activeElement),
        true,
    );
    await page.locator('.document-editor-scroll-area [contenteditable="true"]')
        .waitFor();
    // Cross the autosave debounce; mode hydration must never create a transaction to save.
    await page.waitForTimeout(1800);
    assertEquals(writes, []);

    const touch = await browser.newPage({
        viewport: { width: 320, height: 700 },
        hasTouch: true,
        isMobile: true,
    });
    await loginAndVisit(touch, app.origin, "/", credentials);
    await openNoteRows(touch);
    await touch.locator("[data-document-id] h4 button").filter({
        hasText: "Live contract",
    }).tap();
    const touchModes = touch.getByRole("radiogroup", { name: "视图模式" });
    const pageMode = touchModes.getByRole("radio", {
        name: "分页",
        exact: true,
    });
    await pageMode.tap();
    assertEquals(await pageMode.isChecked(), true);
    await touch.locator('[data-pagination-mode="page"][data-page-count]')
        .waitFor();
    const [segments, stats] = await Promise.all([
        touchModes.boundingBox(),
        touch.locator(".document-metadata-bar").boundingBox(),
    ]);
    assert(segments && stats);
    assert(
        segments.x + segments.width <= stats.x && stats.x + stats.width <= 320,
    );
    const targets = await touchModes.getByRole("radio").evaluateAll((radios) =>
        radios.map((radio) => {
            const { width, height } = radio.getBoundingClientRect();
            return width >= 44 && height >= 44;
        })
    );
    assertEquals(targets, [true, true, true]);
});
