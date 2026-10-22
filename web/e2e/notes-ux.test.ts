import { assert, assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

Deno.test("Notes long document actions and history stay reachable without replacing editor", async () => {
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
        viewport: { width: 390, height: 844 },
    });
    await loginAndVisit(page, app.origin, "/", credentials);
    await page.evaluate(async () => {
        await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "长文操作",
                body: "原始正文\n\n".repeat(100),
            }),
        });
    });
    await page.reload();
    await page.locator(
        '.zen-edge-btn[data-workspace="notes"]',
    ).first().click();
    await page.locator(".notes-workspace-list .note-title").filter({
        hasText: "长文操作",
    }).click();
    const live = page.locator(".note-live-editor .ProseMirror");
    await live.waitFor();
    const bounds = await page.locator(".note-editor").boundingBox();
    assert(
        bounds && bounds.height < 844,
        "Long content must not push actions below the host",
    );
    await live.evaluate((element) =>
        element.setAttribute("data-instance-proof", "original")
    );
    await live.focus();
    await live.evaluate((element) => {
        const text = element.querySelector("p")?.firstChild;
        if (!text) throw new Error("Long document paragraph missing");
        const range = document.createRange();
        range.setStart(text, 1);
        range.setEnd(text, 3);
        const selection = globalThis.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
    });
    await page.waitForFunction(() =>
        globalThis.getSelection()?.toString() === "始正"
    );
    const scroll = page.locator(".note-body-scroll");
    await scroll.evaluate((element) => {
        element.scrollTop = 400;
    });
    await page.getByRole("button", { name: "便签选项", exact: true }).click();
    await page.getByRole("menuitem", { name: "版本历史", exact: true }).click();
    await page.getByRole("button", { name: "返回编辑", exact: true }).waitFor();
    assertEquals(await live.count(), 1);
    assertEquals(await live.isVisible(), false);
    await page.getByRole("button", { name: "返回编辑", exact: true }).click();
    assertEquals(await live.getAttribute("data-instance-proof"), "original");
    assertEquals(await live.isVisible(), true);
    assertEquals(
        await live.evaluate(() => globalThis.getSelection()?.toString()),
        "始正",
    );
    assertEquals(await scroll.evaluate((element) => element.scrollTop), 400);
    await page.getByRole("tab", { name: "源码", exact: true }).click();
    const source = page.locator(".note-body-textarea");
    await source.focus();
    await source.evaluate((element) => {
        if (!(element instanceof HTMLTextAreaElement)) {
            throw new Error("Source missing");
        }
        element.setSelectionRange(100, 110);
        element.scrollTop = 400;
    });
    await page.getByRole("button", { name: "便签选项", exact: true }).click();
    await page.getByRole("menuitem", { name: "版本历史", exact: true }).click();
    await page.getByRole("button", { name: "返回编辑", exact: true }).waitFor();
    await page.waitForFunction(() => {
        const back = document.querySelector<HTMLButtonElement>(
            ".note-history-header button",
        );
        return back && !back.disabled && back === document.activeElement;
    });
    await page.keyboard.press("Escape");
    await source.waitFor();
    assertEquals(
        await source.evaluate((element) => {
            if (!(element instanceof HTMLTextAreaElement)) {
                throw new Error("Source missing");
            }
            return {
                start: element.selectionStart,
                end: element.selectionEnd,
                scroll: element.scrollTop,
                focused: element === document.activeElement,
            };
        }),
        { start: 100, end: 110, scroll: 400, focused: true },
    );
});
