import { assert, assertEquals } from "@std/assert";
import type { Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { ensureSidebarOpen } from "./helpers/library.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

const NOTES = '[data-window-id="notes"]';

async function createNote(page: Page, origin: string, title: string) {
    const response = await page.request.post(origin + "/api/documents", {
        headers: { Origin: origin },
        data: { title, body: "正文" },
    });
    assert(response.ok(), `create note: ${response.status()}`);
}

Deno.test("笔记窗口控件：侧栏折叠 / 展开按钮、创建图标位置与格式工具栏开关", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    try {
        await loginAndVisit(page, app.origin, "/", user);
        await createNote(page, app.origin, "控件笔记");
        await page.goto(app.origin + "/?view=notes");
        const frame = page.locator(NOTES);
        const search = frame.getByRole("searchbox", { name: "搜索笔记" });
        const sidebarButton = frame.getByRole("button", {
            name: "笔记侧栏",
            exact: true,
        });
        await search.waitFor();

        // The title bar carries no sidebar toggle and no create button.
        const titleBarButtons = await frame.locator(".window-frame__toolbar")
            .getByRole("button").evaluateAll(
                (nodes) =>
                    nodes.map((node) =>
                        node.getAttribute("aria-label") ?? node.textContent
                    ),
            );
        assert(
            !titleBarButtons.includes("笔记侧栏"),
            `title bar buttons: ${titleBarButtons}`,
        );
        assert(!titleBarButtons.includes("新建笔记"));

        // Create buttons sit in the 笔记本 heading row; search spans the row up to the collapse button.
        const row = frame.locator(".documents-notebooks-row");
        await row.getByRole("button", { name: "新建笔记", exact: true })
            .waitFor();
        await row.getByRole("button", { name: "新建笔记本", exact: true })
            .waitFor();
        assertEquals(
            await frame.locator(".documents-sidebar-header").getByRole(
                "button",
                { name: /^新建/ },
            ).count(),
            0,
        );
        const createBox = await row.getByRole("button", {
            name: "新建笔记",
            exact: true,
        }).boundingBox();
        assert(
            createBox && createBox.width <= 28 && createBox.height <= 28,
            `create box ${JSON.stringify(createBox)}`,
        );

        // Persistent sidebar: collapse button on the search row, right of the search box.
        assertEquals(await sidebarButton.getAttribute("aria-expanded"), "true");
        const searchBox = (await search.boundingBox())!;
        const collapseBox = (await sidebarButton.boundingBox())!;
        assert(
            collapseBox.x >= searchBox.x + searchBox.width - 1,
            "collapse sits right of search",
        );
        assert(
            Math.abs(
                (collapseBox.y + collapseBox.height / 2) -
                    (searchBox.y + searchBox.height / 2),
            ) < 4,
        );

        // Collapsing moves focus to the expand button in the editor-header row (empty state has a minimal header).
        await sidebarButton.click();
        await frame.locator(".documents-sidebar[hidden]").waitFor({
            state: "attached",
        });
        assertEquals(
            await sidebarButton.getAttribute("aria-expanded"),
            "false",
        );
        assert(
            await sidebarButton.evaluate((el) =>
                el === document.activeElement &&
                !!el.closest(".document-editor-header")
            ),
        );
        await sidebarButton.click();
        await search.waitFor();
        assert(
            await sidebarButton.evaluate((el) =>
                el === document.activeElement &&
                !!el.closest(".documents-sidebar-header")
            ),
        );

        // Open the note: expanded sidebar has no header toggle; collapsed shows it before the title.
        await frame.getByRole("button", { name: "最近", exact: true }).click();
        await frame.getByRole("button", { name: /打开笔记：控件笔记/ }).click();
        const title = frame.getByRole("textbox", {
            name: "笔记标题",
            exact: true,
        });
        await title.waitFor();
        assertEquals(
            await frame.locator(".document-editor-header").getByRole("button", {
                name: "笔记侧栏",
            }).count(),
            0,
        );
        await sidebarButton.click();
        const expand = frame.locator(".document-editor-header").getByRole(
            "button",
            { name: "笔记侧栏", exact: true },
        );
        await expand.waitFor();
        const expandBox = (await expand.boundingBox())!;
        const titleBox = (await title.boundingBox())!;
        assert(
            expandBox.x + expandBox.width <= titleBox.x + 1,
            "expand precedes the title",
        );
        await expand.click();
        await search.waitFor();

        // Toolbar: the status bar has no format icon; chevron collapses, Aa expands.
        await frame.getByRole("button", { name: /^切换编辑模式，当前：/ })
            .waitFor();
        assertEquals(
            await frame.getByRole("button", { name: "格式工具栏", exact: true })
                .count(),
            0,
        );
        const hide = frame.getByRole("button", {
            name: "隐藏格式工具栏",
            exact: true,
        });
        const show = frame.getByRole("button", {
            name: "显示格式工具栏",
            exact: true,
        });
        await hide.waitFor();
        const toolbar = frame.getByRole("toolbar", {
            name: "笔记编辑格式工具栏",
        });
        await toolbar.getByRole("button").first().focus();
        await hide.click();
        await show.waitFor();
        assertEquals(await show.getAttribute("aria-pressed"), "false");
        assertEquals(await toolbar.count(), 0);
        assert(
            await show.evaluate((el) => el === document.activeElement),
            "focus moves to Aa",
        );
        const headerButtons = await frame.locator(
            ".document-editor-header-actions",
        ).getByRole("button")
            .evaluateAll((nodes) =>
                nodes.map((node) => node.getAttribute("aria-label"))
            );
        assertEquals(headerButtons[0], "显示格式工具栏");
        await show.click();
        await hide.waitFor();
        assertEquals(await show.count(), 0);
        assert(
            await hide.evaluate((el) => el === document.activeElement),
            "focus moves to the chevron",
        );

        // Escape order and fullscreen: fullscreen hides the sidebar and its toggles.
        await sidebarButton.click();
        await frame.getByRole("button", { name: "全屏编辑" }).click();
        assertEquals(
            await frame.getByRole("button", { name: "笔记侧栏", exact: true })
                .count(),
            0,
        );
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("笔记窗口控件：抽屉模式的标题行按钮打开抽屉，关闭后焦点返回该按钮", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
    });
    try {
        await loginAndVisit(page, app.origin, "/", user);
        await createNote(page, app.origin, "抽屉笔记");
        await page.goto(app.origin + "/?view=notes");
        const frame = page.locator(NOTES);
        const toggle = frame.getByRole("button", {
            name: "笔记侧栏",
            exact: true,
        });
        await ensureSidebarOpen(page);
        await frame.getByRole("button", { name: "最近", exact: true }).click();
        await frame.getByRole("button", { name: /打开笔记：抽屉笔记/ }).click();
        await frame.locator(".documents-layout[data-drawer='closed']")
            .waitFor();
        assert(
            await toggle.evaluate((el) =>
                !!el.closest(".document-editor-header")
            ),
        );
        assertEquals(
            await frame.locator(".window-frame__toolbar").getByRole("button", {
                name: "笔记侧栏",
            }).count(),
            0,
        );
        await toggle.click();
        await frame.locator(".documents-layout[data-drawer='open']").waitFor();
        await page.keyboard.press("Escape");
        await frame.locator(".documents-layout[data-drawer='closed']")
            .waitFor();
        await page.waitForFunction(() => {
            const toggle = document.querySelector(
                '[data-window-id="notes"] .document-editor-header button[aria-label="笔记侧栏"]',
            );
            return toggle === document.activeElement;
        });
        assert(await toggle.evaluate((el) => el === document.activeElement));

        // Coarse pointers keep the visual size and reach the touch target through the hit area.
        const coarse = await browser.newContext({
            viewport: { width: 390, height: 844 },
            hasTouch: true,
            isMobile: true,
        });
        const touchPage = await coarse.newPage();
        await loginAndVisit(touchPage, app.origin, "/?view=notes", user);
        await ensureSidebarOpen(touchPage);
        const create = touchPage.locator(NOTES).locator(
            ".documents-notebooks-row",
        ).getByRole("button", { name: "新建笔记", exact: true });
        await create.waitFor();
        const metrics = await create.evaluate((el) => {
            const box = el.getBoundingClientRect();
            const after = getComputedStyle(el, "::after");
            return {
                width: box.width,
                hit: Math.abs(parseFloat(after.left)) * 2 + box.width,
                inset: after.left,
            };
        });
        assert(metrics.width <= 28, JSON.stringify(metrics));
        assert(metrics.hit >= 44, JSON.stringify(metrics));

        // Opening the drawer by touch never starts in its search field, which
        // would raise the soft keyboard; the labelled drawer takes focus.
        const touchFrame = touchPage.locator(NOTES);
        await touchFrame.getByRole("button", { name: "最近", exact: true })
            .tap();
        await touchFrame.getByRole("button", { name: /打开笔记：抽屉笔记/ })
            .tap();
        await touchFrame.locator(".documents-layout[data-drawer='closed']")
            .waitFor();
        await touchFrame.getByRole("button", { name: "笔记侧栏", exact: true })
            .tap();
        await touchFrame.locator(".documents-layout[data-drawer='open']")
            .waitFor();
        await touchPage.waitForFunction(() =>
            document.activeElement?.matches(".documents-sidebar--drawer")
        );
        await coarse.close();
    } finally {
        await browser.close();
        await app.close();
    }
});
