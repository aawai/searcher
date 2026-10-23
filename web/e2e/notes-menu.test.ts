import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

Deno.test("Notes format menus retain Source selection, keyboard focus and debounce; IME blocks commands", async () => {
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
            body: JSON.stringify({ title: "菜单选区", body: "选中文本" }),
        });
    });
    await page.reload();
    await page.locator(
        '.zen-edge-btn[data-workspace="notes"], button[aria-label="便签工作区"]',
    ).first().click();
    await page.locator(".notes-workspace-list .note-title").filter({
        hasText: "菜单选区",
    }).click();
    await page.locator(".ProseMirror").waitFor();
    await page.getByRole("tab", { name: "源码", exact: true }).click();
    const source = page.locator(".note-body-textarea");
    const writes: string[] = [];
    page.on("request", (request) => {
        if (
            request.method() === "PATCH" &&
            request.url().includes("/api/notes/")
        ) writes.push(request.postData() ?? "");
    });
    await source.fill("选中文本！");
    await source.evaluate((el) => {
        if (!(el instanceof HTMLTextAreaElement)) {
            throw new Error("Source textarea missing");
        }
        el.setSelectionRange(0, 4);
    });
    const more = page.getByRole("button", { name: "更多格式", exact: true });
    await more.focus();
    await more.press("Enter");
    await page.getByRole("menuitem", { name: "删除线", exact: true }).click();
    assertEquals(await source.inputValue(), "~~选中文本~~！");
    assertEquals(
        await source.evaluate((el) => el === document.activeElement),
        true,
    );
    await page.waitForTimeout(100);
    assertEquals(writes, []);
    await page.getByRole("menu").waitFor({ state: "detached" });
    await more.click();
    await page.getByRole("menu").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.getByRole("menu").waitFor({ state: "detached" });
    await page.waitForFunction(() =>
        document.activeElement?.getAttribute("aria-label") === "更多格式"
    );
    assertEquals(
        await more.evaluate((el) => el === document.activeElement),
        true,
    );
    assertEquals(writes, []);
    await source.focus();
    await source.dispatchEvent("compositionstart", { data: "输入中" });
    await more.click();
    await page.getByRole("menuitem", { name: "行内代码", exact: true }).click();
    assertEquals(await source.inputValue(), "~~选中文本~~！");
    await page.waitForTimeout(1700);
    assertEquals(writes, []);
    await source.dispatchEvent("compositionend", { data: "输入完成" });
    await page.locator(".save-saved").waitFor();
    assertEquals(writes.length, 1);
    for (const name of ["纸白", "琥珀", "玫瑰", "鼠尾草", "天空"]) {
        const trigger = page.getByRole("button", {
            name: "便签选项",
            exact: true,
        });
        await trigger.click();
        await page.getByRole("menuitemradio", { name, exact: true }).click();
        await page.getByRole("menu").waitFor({ state: "detached" });
        assertEquals(
            await trigger.evaluate((el) => el === document.activeElement),
            true,
        );
        await page.locator(".save-saved").waitFor();
    }
});

Deno.test("Home note menu changes color without moving the note or persisting a desktop position", async () => {
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
    const noteId = await page.evaluate(async () => {
        const response = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "菜单不移动便签",
                body: "保持自动布局",
                isHomeFixed: true,
            }),
        });
        return (await response.json()).data.id as string;
    });
    await page.reload();
    const card = page.locator(".note-card").filter({
        has: page.getByRole("button", { name: "菜单不移动便签", exact: true }),
    });
    await card.hover();
    await card.getByRole("button", { name: "更多操作", exact: true }).click();
    const changed = page.waitForResponse((response) =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(`/api/notes/${noteId}`)
    );
    await page.getByRole("menuitemradio", { name: "鼠尾草", exact: true })
        .click();
    assertEquals((await changed).ok(), true);
    await page.getByRole("menu").waitFor({ state: "detached" });
    const saved = await page.evaluate(async (id) => {
        const response = await fetch(`/api/notes/${id}`);
        return (await response.json()).data;
    }, noteId);
    assertEquals(saved.color, "sage");
    assertEquals(saved.layout, null);
});
