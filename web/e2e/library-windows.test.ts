import { assert, assertEquals } from "@std/assert";
import type { Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

const APPS = '[data-window-id="apps"]';
const NOTES = '[data-window-id="notes"]';

function historyIndex(page: Page): Promise<number | null> {
    return page.evaluate(() => history.state?.idx ?? null);
}

async function box(page: Page, selector: string) {
    const rect = await page.locator(selector).boundingBox();
    assert(rect, `${selector} has a box`);
    return rect;
}

/** The list's create action asks for a title, then opens the note. */
async function createNote(page: Page, title: string) {
    await page.locator(NOTES).getByRole("button", {
        name: "新建笔记",
        exact: true,
    }).click();
    const dialog = page.getByRole("dialog", { name: "新建笔记", exact: true });
    await dialog.getByLabel("笔记标题").fill(title);
    await dialog.getByRole("button", { name: "创建", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
}

Deno.test("应用窗口锚定任务栏图标，失焦或再次点击图标收起且不留历史", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    try {
        await loginAndVisit(page, app.origin, "/", user);
        const icon = page.locator('[data-dock-id="apps"]');
        const frame = page.locator(APPS);
        const start = await historyIndex(page);

        await icon.click();
        await page.waitForURL(app.origin + "/?view=apps");
        await frame.waitFor({ state: "visible" });
        const anchored = await box(page, APPS);
        const iconBox = await icon.boundingBox();
        assert(iconBox);
        assert(
            anchored.y + anchored.height <= iconBox.y,
            "opens above the bottom Dock",
        );
        assert(
            Math.abs(
                anchored.x + anchored.width / 2 -
                    (iconBox.x + iconBox.width / 2),
            ) <= 1,
            "centered on its icon",
        );

        // A press outside collapses it; the entry that opened it is undone.
        await page.mouse.click(100, 450);
        await frame.waitFor({ state: "hidden" });
        await page.waitForURL(app.origin + "/");
        assertEquals(await historyIndex(page), start);
        assertEquals(
            await icon.getAttribute("data-window-status"),
            "minimized",
        );

        // Restoring returns to the anchored position; the icon collapses it again.
        await icon.click();
        await page.waitForURL(app.origin + "/?view=apps");
        await frame.waitFor({ state: "visible" });
        assertEquals(await box(page, APPS), anchored);
        await icon.click();
        await frame.waitFor({ state: "hidden" });
        await page.waitForURL(app.origin + "/");

        // Leaving the browser tab is not a press outside.
        await icon.click();
        await frame.waitFor({ state: "visible" });
        await page.evaluate(() => globalThis.dispatchEvent(new Event("blur")));
        await page.waitForTimeout(150);
        assert(await frame.isVisible());

        // Another window takes over: the apps window is minimized, not closed.
        await page.locator('[data-dock-id="settings"]').click();
        await page.waitForURL(/\/settings/);
        await frame.waitFor({ state: "hidden" });
        assertEquals(
            await icon.getAttribute("data-window-status"),
            "minimized",
        );
        await icon.click();
        await page.waitForURL(app.origin + "/?view=apps");
        await frame.waitFor({ state: "visible" });

        // Its own overlays are inside it: the add form opens and closes in place.
        await frame.getByRole("button", { name: "添加应用", exact: true })
            .click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached" });
        assert(await frame.isVisible());
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("移动过的应用窗口脱离锚定，其他窗口接管时保持可见", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    try {
        await loginAndVisit(page, app.origin, "/", user);
        const icon = page.locator('[data-dock-id="apps"]');
        const frame = page.locator(APPS);
        await icon.click();
        await frame.waitFor({ state: "visible" });
        const before = await box(page, APPS);
        const title = frame.locator(".window-frame__title");
        const titleBox = await title.boundingBox();
        assert(titleBox);
        await page.mouse.move(titleBox.x + 4, titleBox.y + 4);
        await page.mouse.down();
        await page.mouse.move(titleBox.x - 116, titleBox.y + 4, { steps: 4 });
        await page.mouse.up();
        const moved = await box(page, APPS);
        assert(moved.x < before.x, "the title bar drags the window");

        await page.locator('[data-dock-id="settings"]').click();
        await page.waitForURL(/\/settings/);
        assertEquals(await icon.getAttribute("data-window-status"), "visible");
        assert(await frame.isVisible());

        // Closing and reopening anchors again.
        await icon.click();
        await page.waitForURL(app.origin + "/?view=apps");
        await frame.getByRole("button", { name: "关闭应用" }).click();
        await frame.waitFor({ state: "hidden" });
        await icon.click();
        await frame.waitFor({ state: "visible" });
        assertEquals(await box(page, APPS), before);
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("笔记窗口最小化保留编辑内容，Escape 先退出内部视图再最小化", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    try {
        await loginAndVisit(page, app.origin, "/", user);
        const icon = page.locator('[data-dock-id="notes"]');
        const frame = page.locator(NOTES);
        await icon.click();
        await page.waitForURL(app.origin + "/?view=notes");
        await createNote(page, "窗口内的笔记");
        const title = frame.getByRole("textbox", { name: "笔记标题" });
        const editor = frame.locator(".ProseMirror");
        await editor.click();
        await page.keyboard.type("最小化后仍在编辑");

        await frame.getByRole("button", { name: "最小化笔记" }).click();
        await frame.waitFor({ state: "hidden" });
        await page.waitForURL(app.origin + "/");
        assertEquals(
            await icon.getAttribute("data-window-status"),
            "minimized",
        );
        await icon.click();
        await page.waitForURL(app.origin + "/?view=notes");
        await frame.waitFor({ state: "visible" });
        assertEquals(await title.inputValue(), "窗口内的笔记");
        assertEquals(await editor.textContent(), "最小化后仍在编辑");

        // Escape closes the open note first, then minimizes the window.
        await frame.getByRole("button", { name: /^返回/ }).focus();
        await page.keyboard.press("Escape");
        await frame.getByRole("button", { name: "新建笔记", exact: true })
            .waitFor();
        assert(await frame.isVisible());
        await page.keyboard.press("Escape");
        await frame.waitFor({ state: "hidden" });
        await page.waitForURL(app.origin + "/");

        // Closing destroys the window; reopening starts at the list.
        await icon.click();
        await frame.getByRole("button", { name: "关闭笔记" }).click();
        await frame.waitFor({ state: "hidden" });
        assertEquals(await icon.getAttribute("data-window-status"), null);
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("全屏笔记覆盖视口，Escape 先退出全屏而不最小化窗口", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    try {
        await loginAndVisit(page, app.origin, "/?view=notes", user);
        const frame = page.locator(NOTES);
        await createNote(page, "全屏笔记");
        await frame.getByRole("button", { name: "全屏编辑" }).click();
        await page.waitForFunction((selector) => {
            const rect = document.querySelector(selector)
                ?.getBoundingClientRect();
            return rect?.width === innerWidth && rect.height === innerHeight;
        }, NOTES);
        await page.locator('[data-dock-id="notes"]').waitFor({
            state: "detached",
        });
        await frame.getByRole("button", { name: "退出全屏" }).focus();
        await page.keyboard.press("Escape");
        await frame.getByRole("button", { name: "全屏编辑" }).waitFor();
        assert(await frame.isVisible());
        assertEquals(page.url(), app.origin + "/?view=notes");
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("窄屏应用与笔记窗口为单活动窗口，窗口列表可恢复最小化的窗口", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
    });
    try {
        await loginAndVisit(page, app.origin, "/", user);
        await page.locator('[data-dock-id="apps"]').click();
        await page.locator(APPS).waitFor({ state: "visible" });
        const area = await box(page, APPS);
        assert(area.width >= 340, "near full width");
        await page.locator('[data-dock-id="notes"]').click();
        await page.locator(NOTES).waitFor({ state: "visible" });
        // One active window at a time; the other keeps its state in the list.
        assert(await page.locator(APPS).isHidden());
        assertEquals(
            await page.locator('[data-dock-id="apps"]').getAttribute(
                "data-window-status",
            ),
            "visible",
        );
        await page.locator(NOTES).getByRole("button", { name: "窗口列表" })
            .click();
        await page.getByRole("button", { name: "激活 应用" }).click();
        await page.waitForURL(app.origin + "/?view=apps");
        await page.locator(APPS).waitFor({ state: "visible" });
        assert(await page.locator(NOTES).isHidden());
    } finally {
        await browser.close();
        await app.close();
    }
});
