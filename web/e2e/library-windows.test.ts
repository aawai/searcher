import { assert, assertEquals } from "@std/assert";
import type { Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { ensureSidebarOpen } from "./helpers/library.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

const APPS = '[data-window-id="apps"]';
const NOTES = '[data-window-id="notes"]';

async function box(page: Page, selector: string) {
    const rect = await page.locator(selector).boundingBox();
    assert(rect, `${selector} has a box`);
    return rect;
}

/** A new note opens immediately and is persisted after the first input. */
async function createNote(page: Page, title: string) {
    await ensureSidebarOpen(page);
    const frame = page.locator(NOTES);
    await frame.getByRole("button", { name: /^新建笔记(?:（|$)/ }).click();
    const created = page.waitForResponse((response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/documents" && response.ok()
    );
    await frame.getByRole("textbox", { name: "笔记标题", exact: true }).fill(
        title,
    );
    await created;
}

Deno.test("应用窗口首次出现在任务栏图标旁，再次点击图标切换最小化与恢复", async () => {
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

        // The icon toggles the window: minimize, then restore in place.
        await icon.click();
        await frame.waitFor({ state: "hidden" });
        await page.waitForURL(app.origin + "/");
        assertEquals(
            await icon.getAttribute("data-window-status"),
            "minimized",
        );
        await icon.click();
        await page.waitForURL(app.origin + "/?view=apps");
        await frame.waitFor({ state: "visible" });
        assertEquals(await box(page, APPS), anchored);

        // A press on the desktop returns to it like any other window.
        await page.mouse.click(100, 450);
        await frame.waitFor({ state: "hidden" });
        await page.waitForURL(app.origin + "/");
        await icon.click();
        await frame.waitFor({ state: "visible" });

        // Leaving the browser tab is not a press outside.
        await page.evaluate(() => globalThis.dispatchEvent(new Event("blur")));
        await page.waitForTimeout(150);
        assert(await frame.isVisible());

        // Another window takes over: the apps window stays open behind it.
        await page.locator('[data-dock-id="settings"]').click();
        await page.waitForURL(/\/settings/);
        assertEquals(await icon.getAttribute("data-window-status"), "visible");
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

Deno.test("移动过的应用窗口点击图标仍切换显示，重开时记住位置", async () => {
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
        // Pressing alone must not move or re-place the window.
        await page.evaluate(() =>
            new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve))
            )
        );
        assertEquals(await box(page, APPS), before);
        await page.mouse.move(titleBox.x - 116, titleBox.y + 4, { steps: 4 });
        await page.mouse.up();
        const moved = await box(page, APPS);
        assert(moved.x < before.x, "the title bar drags the window");

        // Another window taking focus leaves the moved window open behind it.
        await page.locator('[data-dock-id="settings"]').click();
        await page.waitForURL(/\/settings/);
        assertEquals(await icon.getAttribute("data-window-status"), "visible");
        assert(await frame.isVisible());

        // Moving does not cost the icon its toggle: focus, minimize, restore.
        await icon.click();
        await page.waitForURL(app.origin + "/?view=apps");
        assertEquals(await box(page, APPS), moved);
        await icon.click();
        await frame.waitFor({ state: "hidden" });
        assertEquals(
            await icon.getAttribute("data-window-status"),
            "minimized",
        );
        await icon.click();
        await frame.waitFor({ state: "visible" });
        assertEquals(await box(page, APPS), moved);

        // Closing and reopening keeps the position.
        await frame.getByRole("button", { name: "关闭应用" }).click();
        await frame.waitFor({ state: "hidden" });
        await icon.click();
        await frame.waitFor({ state: "visible" });
        assertEquals(await box(page, APPS), moved);
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("笔记窗口最小化保留编辑内容，Escape 直接最小化", async () => {
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

        // There is no intermediate list route: Escape minimizes the editor.
        await title.focus();
        await page.keyboard.press("Escape");
        await frame.waitFor({ state: "hidden" });
        await page.waitForURL(app.origin + "/");

        // Closing destroys the window and its selection.
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
        const sidebar = frame.getByRole("button", {
            name: "笔记侧栏",
            exact: true,
        });
        const sidebarExpanded = await sidebar.getAttribute("aria-expanded");
        await frame.getByRole("button", { name: "全屏编辑" }).click();
        await page.waitForFunction((selector) => {
            const rect = document.querySelector(selector)
                ?.getBoundingClientRect();
            return rect?.width === innerWidth && rect.height === innerHeight;
        }, NOTES);
        await page.locator('[data-dock-id="notes"]').waitFor({
            state: "detached",
        });
        assertEquals(await sidebar.isVisible(), false);
        await frame.getByRole("button", { name: "退出全屏" }).focus();
        await page.keyboard.press("Escape");
        await frame.getByRole("button", { name: "全屏编辑" }).waitFor();
        assertEquals(
            await sidebar.getAttribute("aria-expanded"),
            sidebarExpanded,
        );
        assert(await frame.isVisible());
        assertEquals(page.url(), app.origin + "/?view=notes");
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("大纲在窗口调整时保留展开状态，覆盖层不阻止编辑", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 1600, height: 900 },
    });
    try {
        await loginAndVisit(page, app.origin, "/?view=notes", user);
        const frame = page.locator(NOTES);
        await createNote(page, "大纲宽度测试");
        const outlineButton = frame.getByRole("button", {
            name: "大纲",
            exact: true,
        });
        await outlineButton.click();
        const overlay = frame.locator(".document-outline-panel--overlay");
        await overlay.waitFor({ state: "visible" });
        const editor = frame.locator(".ProseMirror");
        await editor.fill("覆盖层打开时仍可编辑");
        assertEquals(await editor.textContent(), "覆盖层打开时仍可编辑");
        await overlay.getByRole("button", { name: "收起大纲", exact: true })
            .focus();
        await page.keyboard.press("Escape");
        await overlay.waitFor({ state: "detached" });
        assertEquals(
            await outlineButton.evaluate((el) => el === document.activeElement),
            true,
        );
        await outlineButton.click();
        await overlay.waitFor({ state: "visible" });

        await frame.getByRole("button", { name: "笔记窗口菜单" }).click();
        await page.getByRole("menuitem", { name: "调整左边" }).click();
        for (let i = 0; i < 18; i++) await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("Enter");
        await frame.locator(
            ".document-outline-panel:not(.document-outline-panel--overlay)",
        )
            .waitFor({ state: "visible" });
        assertEquals(await editor.textContent(), "覆盖层打开时仍可编辑");
        await frame.getByRole("button", { name: "笔记窗口菜单" }).click();
        await page.getByRole("menuitem", { name: "调整左边" }).click();
        for (let i = 0; i < 18; i++) await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Enter");
        await overlay.waitFor({ state: "visible" });
        // Crossing the host breakpoint with the drawer open transfers its
        // expanded state to the wide outline rather than losing it.
        await page.setViewportSize({ width: 390, height: 900 });
        await page.waitForFunction(() =>
            document.querySelector(
                '.documents-layout[data-outline-drawer="closed"]',
            ) !== null
        );
        const sidebarDismiss = frame.getByRole("button", {
            name: "关闭笔记侧栏",
            exact: true,
        });
        if (await sidebarDismiss.isVisible()) await sidebarDismiss.click();
        await outlineButton.click();
        await frame.locator(".documents-outline-drawer").waitFor({
            state: "visible",
        });
        await page.setViewportSize({ width: 1600, height: 900 });
        await page.waitForFunction(() =>
            document.querySelector(".documents-layout")?.getAttribute(
                "data-outline-drawer",
            ) === null
        );
        await frame.locator(".document-outline-panel").waitFor({
            state: "visible",
        });
        assertEquals(await outlineButton.getAttribute("aria-pressed"), "true");
        assertEquals(await editor.textContent(), "覆盖层打开时仍可编辑");
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("窄窗口大纲右侧抽屉选择标题、关闭并与笔记侧栏互斥", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
    });
    try {
        await loginAndVisit(page, app.origin, "/?view=notes", user);
        const frame = page.locator(NOTES);
        await createNote(page, "抽屉大纲测试");
        const editor = frame.locator(".ProseMirror");
        await editor.click();
        await page.keyboard.type("# ");
        await page.keyboard.type("抽屉标题");
        await editor.locator("h1").filter({ hasText: "抽屉标题" }).waitFor();

        const layout = frame.locator(".documents-layout");
        const drawer = frame.locator(".documents-outline-drawer");
        const outlineButton = frame.getByRole("button", {
            name: "大纲",
            exact: true,
        });
        const sidebarButton = frame.getByRole("button", {
            name: "笔记侧栏",
            exact: true,
        });
        await outlineButton.click();
        await drawer.getByRole("button", { name: "抽屉标题", exact: true })
            .click();
        await page.waitForFunction(() =>
            document.querySelector(
                '.documents-layout[data-outline-drawer="closed"]',
            ) !== null
        );
        assertEquals(await outlineButton.getAttribute("aria-pressed"), "false");
        await page.waitForFunction(() =>
            document.activeElement?.classList.contains("ProseMirror")
        );

        await outlineButton.click();
        await drawer.waitFor({ state: "visible" });
        assertEquals(
            await layout.locator(".documents-editor-pane").evaluate((el) =>
                (el as HTMLElement).inert
            ),
            true,
        );
        const heading = drawer.getByRole("button", {
            name: "抽屉标题",
            exact: true,
        });
        const dismiss = drawer.getByRole("button", {
            name: "关闭笔记大纲",
            exact: true,
        });
        await heading.focus();
        await page.keyboard.press("Tab");
        assertEquals(
            await dismiss.evaluate((el) => el === document.activeElement),
            true,
        );
        await page.keyboard.press("Shift+Tab");
        assertEquals(
            await heading.evaluate((el) => el === document.activeElement),
            true,
        );
        await page.waitForFunction(() => {
            const layout = document.querySelector(".documents-layout")
                ?.getBoundingClientRect();
            const outline = document.querySelector(
                ".documents-outline-drawer .document-outline-sidebar",
            )
                ?.getBoundingClientRect();
            return !!layout && !!outline &&
                Math.abs(outline.right - layout.right) <= 1;
        });
        assertEquals(await layout.getAttribute("data-drawer"), "closed");
        // The transparent area over the exposed editor card dismisses the drawer.
        await drawer.getByRole("button", { name: "关闭笔记大纲", exact: true })
            .click();
        await drawer.waitFor({ state: "hidden" });
        await outlineButton.click();
        await drawer.getByRole("button", { name: "收起大纲", exact: true })
            .click();
        await drawer.waitFor({ state: "hidden" });

        await sidebarButton.click();
        await page.waitForFunction(() =>
            document.querySelector('.documents-layout[data-drawer="open"]') !==
                null
        );
        assertEquals(
            await layout.getAttribute("data-outline-drawer"),
            "closed",
        );
        await frame.getByRole("button", { name: "关闭笔记侧栏", exact: true })
            .click();
        await outlineButton.click();
        await drawer.waitFor({ state: "visible" });
        await page.keyboard.press("Escape");
        await drawer.waitFor({ state: "hidden" });
        await page.waitForFunction(() =>
            document.activeElement?.getAttribute("aria-label") === "大纲"
        );
        assert(await frame.isVisible());

        // A host width change keeps an open narrow drawer and its content intact.
        await outlineButton.click();
        await drawer.waitFor({ state: "visible" });
        const before = await box(page, NOTES);
        await page.setViewportSize({ width: 450, height: 844 });
        await page.waitForFunction((width) => {
            const rect = document.querySelector('[data-window-id="notes"]')
                ?.getBoundingClientRect();
            return rect !== undefined && rect.width !== width;
        }, before.width);
        assertEquals(await layout.getAttribute("data-outline-drawer"), "open");
        await drawer.getByRole("button", { name: "抽屉标题", exact: true })
            .waitFor();
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

Deno.test("笔记编辑器：任务复选框与首行文字居中，状态信息钉在底部角落且不占独立行", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    try {
        await loginAndVisit(page, app.origin, "/?view=notes", user);
        const frame = page.locator(NOTES);
        await createNote(page, "任务与状态");
        const editor = frame.locator(".ProseMirror");
        await editor.click();
        await page.keyboard.type("- [ ] 任务甲\n任务乙");
        for (let i = 0; i < 40; i++) {
            await page.keyboard.press("Enter");
            await page.keyboard.type("行 " + i);
        }
        await page.waitForTimeout(600);

        const rows = await page.evaluate(() =>
            Array.from(
                document.querySelectorAll<HTMLElement>(
                    '.ProseMirror li[data-item-type="task"]',
                ),
            ).slice(0, 2).map((item) => {
                const box = item.querySelector("input")!
                    .getBoundingClientRect();
                const text = item.querySelector(
                    ".markdown-list-item-content p",
                )!;
                const range = document.createRange();
                range.selectNodeContents(text);
                const line = range.getClientRects()[0];
                return {
                    box: box.top + box.height / 2,
                    text: line.top + line.height / 2,
                };
            })
        );
        assertEquals(rows.length, 2);
        for (const row of rows) {
            assert(
                Math.abs(row.box - row.text) <= 1,
                `checkbox centre ${row.box} vs first line ${row.text}`,
            );
        }

        const layout = await page.evaluate(() => {
            const rect = (selector: string) =>
                document.querySelector(selector)!.getBoundingClientRect();
            const container = rect(".document-editor-container");
            const scroller = rect(".document-editor-scroll-area");
            const status = rect(".document-editor-status-bar");
            const last = document.querySelector(".ProseMirror")!
                .lastElementChild!
                .getBoundingClientRect();
            return {
                scrollerGap: container.bottom - scroller.bottom,
                statusBottomInset: container.bottom - status.bottom,
                statusLeftInset: status.left - container.left,
                statusRightInset: container.right - status.right,
                statusTop: status.top,
                lastBottom: last.bottom,
                strip: getComputedStyle(
                    document.querySelector(".document-editor-status-bar")!,
                ).borderTopWidth,
            };
        });
        // The text area reaches the bottom edge: the status line is not a row.
        assertEquals(layout.scrollerGap, 0, JSON.stringify(layout));
        assertEquals(layout.strip, "0px");
        assertEquals(
            [
                layout.statusBottomInset,
                layout.statusLeftInset,
                layout.statusRightInset,
            ],
            [0, 16, 16],
            JSON.stringify(layout),
        );
        // At the end of a long note the last line stays above the corners.
        assert(layout.lastBottom <= layout.statusTop, JSON.stringify(layout));
    } finally {
        await browser.close();
        await app.close();
    }
});
