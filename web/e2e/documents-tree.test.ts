import { assert, assertEquals, assertMatch } from "@std/assert";
import type { Locator, Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

const NOTES = '[data-window-id="notes"]';

interface Seed {
    work: string;
    weekly: string;
    reading: string;
}

async function seed(page: Page, origin: string): Promise<Seed> {
    const post = async <T>(path: string, data: unknown) => {
        const response = await page.request.post(origin + path, { headers: { Origin: origin }, data });
        assert(response.ok(), `${path}: ${response.status()}`);
        return (await response.json()).data as T;
    };
    const notebook = (name: string, parentId: string | null = null) =>
        post<{ id: string }>("/api/document-notebooks", { name, parentId }).then((item) => item.id);
    const work = await notebook("工作");
    const weekly = await notebook("周报", work);
    const reading = await notebook("读书");
    await post("/api/documents", { title: "工作笔记", body: "w", notebookId: work });
    await post("/api/documents", { title: "周报一", body: "w1", notebookId: weekly });
    for (let index = 1; index <= 25; index++) {
        await post("/api/documents", { title: `读书${String(index).padStart(2, "0")}`, body: "r", notebookId: reading });
    }
    await post("/api/documents", { title: "散记置顶", body: "s", isHomeFixed: true, isFavorite: true });
    await post("/api/documents", { title: "散记二", body: "s2" });
    return { work, weekly, reading };
}

function sidebar(page: Page) {
    const frame = page.locator(NOTES);
    return {
        frame,
        tree: frame.getByRole("tree", { name: "笔记本", exact: true }),
        /** The node is the tree's selection; selection settles a tick after the route does. */
        selected: (name: string) =>
            frame.locator(`[role="treeitem"][aria-label="${name}"][aria-selected="true"]`).waitFor(),
        item: (name: string | RegExp) =>
            frame.getByRole("tree", { name: "笔记本", exact: true }).getByRole("treeitem", typeof name === "string" ? { name, exact: true } : { name }),
        newNote: frame.getByRole("button", { name: "新建笔记", exact: true }),
        newNotebook: frame.getByRole("button", { name: "新建笔记本", exact: true }),
        search: frame.getByRole("searchbox", { name: "搜索笔记" }),
        title: frame.getByRole("textbox", { name: "笔记标题", exact: true }),
        mode: () => frame.locator("[data-sidebar-mode]").getAttribute("data-sidebar-mode"),
    };
}

const expanded = (locator: Locator) => locator.getAttribute("aria-expanded");

Deno.test("笔记本树：结构、键盘、懒加载、未分类与图钉标记", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const listRequests: string[] = [];
    page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.pathname === "/api/documents" && url.searchParams.has("scope")) listRequests.push(url.search);
    });
    try {
        await loginAndVisit(page, app.origin, "/", user);
        const ids = await seed(page, app.origin);
        await page.goto(app.origin + "/?view=notes");
        const ui = sidebar(page);
        await ui.tree.waitFor();

        // Structure: search + create row, fixed entries, notebook area, trash; no legacy filters.
        await ui.search.waitFor();
        await ui.newNote.waitFor();
        await ui.newNotebook.waitFor();
        await ui.frame.getByRole("button", { name: "最近", exact: true }).waitFor();
        await ui.frame.getByRole("button", { name: "收藏", exact: true }).waitFor();
        await ui.frame.getByRole("button", { name: "笔记本", exact: true }).waitFor();
        await ui.frame.getByRole("button", { name: "回收站", exact: true }).waitFor();
        assertEquals(await ui.frame.getByRole("radio").count(), 0);
        assertEquals(await ui.frame.getByRole("combobox").count(), 0);
        assertEquals(await ui.frame.getByRole("button", { name: "管理笔记本" }).count(), 0);
        assertEquals(
            await ui.tree.getByRole("treeitem").evaluateAll((items) => items.map((item) => item.getAttribute("aria-label"))),
            ["工作", "读书", "未分类"],
        );
        assertEquals(listRequests.filter((search) => search.includes("scope=notebook")).length, 0, "nothing loads before a node opens");

        // Keyboard: one tab stop, arrows, expand/collapse, Home/End, Enter.
        assertEquals(await ui.tree.locator('[role="treeitem"][tabindex="0"]').count(), 1);
        await ui.item("工作").focus();
        await page.keyboard.press("ArrowRight");
        assertEquals(await expanded(ui.item("工作")), "true");
        await ui.item("周报").waitFor();
        await ui.item("工作笔记").waitFor();
        await page.keyboard.press("ArrowRight"); // into the first child
        assert(await ui.item("周报").evaluate((el) => el === document.activeElement));
        await page.keyboard.press("ArrowLeft"); // child → parent
        assert(await ui.item("工作").evaluate((el) => el === document.activeElement));
        await page.keyboard.press("End");
        assert(await ui.item("未分类").evaluate((el) => el === document.activeElement));
        await page.keyboard.press("Home");
        assert(await ui.item("工作").evaluate((el) => el === document.activeElement));
        await page.keyboard.press("ArrowLeft");
        assertEquals(await expanded(ui.item("工作")), "false");
        await page.keyboard.press("Enter"); // a notebook toggles and becomes the selection
        assertEquals(await expanded(ui.item("工作")), "true");
        await ui.selected("工作");
        await page.keyboard.press("ArrowDown"); // 周报 (sub-notebooks come first)
        await page.keyboard.press("ArrowDown"); // 工作笔记
        await page.keyboard.press("Enter");
        await ui.title.waitFor();
        assertEquals(await ui.title.inputValue(), "工作笔记");
        await ui.selected("工作笔记");
        assertEquals(await ui.item("工作").getAttribute("aria-selected"), "false");

        // Lazy pagination: 读书 loads 20, its own 加载更多 loads the rest.
        assertEquals(listRequests.filter((search) => search.includes(ids.reading)).length, 0);
        await ui.item("读书").click();
        await ui.item("读书20").waitFor();
        assertEquals(await ui.item(/^读书\d\d$/).count(), 20);
        assert(listRequests.some((search) => search.includes(ids.reading)));
        const more = ui.item("加载更多");
        await more.focus();
        await page.keyboard.press("Enter");
        await ui.item("读书25").waitFor();
        assertEquals(await ui.item(/^读书\d\d$/).count(), 25);
        assertEquals(await ui.item("加载更多").count(), 0);

        // 未分类 (scope=uncategorized) with favorite and pin markers.
        await ui.item("未分类").click();
        const pinned = ui.item(/^散记置顶/);
        await pinned.waitFor();
        await ui.item("散记二").waitFor();
        assertEquals(await pinned.locator("[data-pinned]").count(), 1);
        assertEquals(await pinned.locator("[data-favorite]").count(), 1);
        assertEquals(await ui.item("散记二").locator("[data-pinned]").count(), 0);
        assert(listRequests.some((search) => search.includes("scope=uncategorized")));
        // Collapsing and re-expanding keeps working.
        await ui.item("未分类").click();
        await ui.item("散记二").waitFor({ state: "detached" });
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("笔记本树：右键 / ⋯ / 键盘菜单、创建目标、模式切换与延迟创建落点", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
        await loginAndVisit(page, app.origin, "/", user);
        await seed(page, app.origin);
        await page.goto(app.origin + "/?view=notes");
        const ui = sidebar(page);
        await ui.tree.waitFor();
        const menu = page.getByRole("menu");
        const menuNames = async () =>
            (await menu.getByRole("menuitem").allTextContents()).map((text) => text.trim());
        const closeMenu = async () => {
            await page.keyboard.press("Escape");
            await menu.waitFor({ state: "detached" });
        };

        // One menu, four doors: right click, visible ⋯, ContextMenu key, Shift+F10.
        await ui.item("工作").click();
        const notebookMenu = ["新建笔记", "新建子笔记本", "重命名", "移动到…", "上移", "下移", "删除笔记本"];
        await ui.item("工作").click({ button: "right" });
        await menu.waitFor();
        assertEquals(await menuNames(), notebookMenu);
        await closeMenu();
        await ui.item("工作").hover();
        await ui.frame.getByRole("button", { name: "笔记本操作：工作", exact: true }).click();
        await menu.waitFor();
        assertEquals(await menuNames(), notebookMenu);
        await closeMenu();
        await ui.item("工作").focus();
        await page.keyboard.press("ContextMenu");
        await menu.waitFor();
        assertEquals(await menuNames(), notebookMenu);
        await closeMenu();
        assert(await ui.item("工作").evaluate((el) => el === document.activeElement), "focus returns to the node");
        await page.keyboard.press("Shift+F10");
        await menu.waitFor();
        assertEquals(await menuNames(), notebookMenu);
        await closeMenu();

        // A sub-notebook cannot have children; a note offers the note actions, not 新建.
        await ui.item("周报").click({ button: "right" });
        await menu.waitFor();
        assertEquals((await menuNames()).includes("新建子笔记本"), false);
        await closeMenu();
        await ui.item("工作笔记").click({ button: "right" });
        await menu.waitFor();
        assertEquals(await menuNames(), ["重命名", "收藏", "固定到首页", "移动笔记本", "移至回收站"]);
        assertEquals(await menu.getByRole("menuitemradio").count(), 5, "colors");
        await closeMenu();

        // Menu actions reuse the notebook dialogs: rename through the node menu.
        await ui.item("读书").click({ button: "right" });
        await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("textbox").fill("阅读");
        await dialog.getByRole("button", { name: /^(保存|确定|重命名)/ }).click();
        await ui.item("阅读").waitFor();
        await ui.item("读书").waitFor({ state: "detached" });

        // Create target follows the selection; the tooltip names it.
        await ui.item("工作").click(); // selected and collapsed
        await ui.item("周报").waitFor({ state: "detached" });
        await ui.item("工作").click(); // expanded again, still selected
        assertEquals(await ui.newNote.getAttribute("title"), "新建笔记（在「工作」）");
        assertEquals(await ui.newNotebook.getAttribute("title"), "新建子笔记本（在「工作」下）");
        await ui.item("周报").click();
        assertEquals(await ui.newNote.getAttribute("title"), "新建笔记（在「周报」）");
        assertEquals(await ui.newNotebook.getAttribute("title"), "新建笔记本", "no third level");
        await ui.item("工作笔记").click();
        assertEquals(await ui.title.inputValue(), "工作笔记");
        assertEquals(await ui.newNote.getAttribute("title"), "新建笔记（在「工作」）");

        // Deferred creation lands in the tree: expanded, selected, no home-fix.
        await ui.item("阅读").click(); // select 阅读 and open it
        assertEquals(await ui.newNote.getAttribute("title"), "新建笔记（在「阅读」）");
        const created = page.waitForResponse((response) =>
            response.request().method() === "POST" && new URL(response.url()).pathname === "/api/documents" && response.ok()
        );
        await ui.newNote.click();
        await ui.title.fill("新读书笔记");
        const response = await created;
        const body = await response.json();
        assertEquals(body.data.notebookId !== null, true);
        assertEquals(body.data.isHomeFixed, false);
        await ui.item("新读书笔记").waitFor();
        await ui.selected("新读书笔记");
        assertEquals(await expanded(ui.item("阅读")), "true");

        // List mode: fixed entries replace the tree; create target falls back to 未分类.
        await ui.frame.getByRole("button", { name: "最近", exact: true }).click();
        assertEquals(await ui.mode(), "list");
        assertEquals(await ui.tree.count(), 0);
        assertEquals(await ui.frame.getByRole("button", { name: "最近", exact: true }).getAttribute("aria-pressed"), "true");
        await ui.frame.getByRole("button", { name: /^打开笔记：/ }).first().waitFor();
        assertEquals(await ui.newNote.getAttribute("title"), "新建笔记（未分类）");
        await ui.frame.getByRole("button", { name: "收藏", exact: true }).click();
        await ui.frame.getByRole("button", { name: "打开笔记：散记置顶" }).waitFor();
        assertEquals(await ui.frame.getByRole("button", { name: /^打开笔记：/ }).count(), 1);
        assertEquals(await ui.frame.locator('[data-document-id] [data-pinned]').count(), 1, "pin marker in list rows");

        // Search is list mode too; clearing restores the previous mode (收藏).
        await ui.search.fill("读书笔记");
        await ui.frame.getByRole("button", { name: "打开笔记：新读书笔记" }).waitFor();
        assertEquals(await ui.mode(), "list");
        assertEquals(await ui.newNote.getAttribute("title"), "新建笔记（未分类）");
        await ui.search.fill("");
        await ui.frame.getByRole("button", { name: "打开笔记：散记置顶" }).waitFor();
        assertEquals(await ui.frame.getByRole("button", { name: "收藏", exact: true }).getAttribute("aria-pressed"), "true");

        // The 笔记本 heading returns to the tree, keeping its expansion and selection.
        await ui.frame.getByRole("button", { name: "笔记本", exact: true }).click();
        await ui.tree.waitFor();
        assertEquals(await ui.mode(), "tree");
        assertEquals(await expanded(ui.item("阅读")), "true");
        await ui.selected("新读书笔记");

        // Opening a note from the list reveals it in the tree.
        await ui.search.fill("工作笔记");
        await ui.frame.getByRole("button", { name: "打开笔记：工作笔记" }).click();
        await ui.search.fill("");
        await ui.frame.getByRole("button", { name: "笔记本", exact: true }).click();
        await ui.item("工作笔记").waitFor();
        await ui.selected("工作笔记");

        // 未分类 is the target with nothing selected; 回收站 opens the trash window.
        await ui.item("未分类").click();
        assertEquals(await ui.newNote.getAttribute("title"), "新建笔记（未分类）");
        await ui.frame.getByRole("button", { name: "回收站", exact: true }).click();
        await page.waitForURL(app.origin + "/trash");
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("笔记本树：触屏长按打开同一份菜单，松手不触发节点", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    try {
        await loginAndVisit(page, app.origin, "/", user);
        await seed(page, app.origin);
        await page.goto(app.origin + "/?view=notes");
        const ui = sidebar(page);
        await ui.tree.waitFor(); // the drawer is open without a selection
        const session = await context.newCDPSession(page);
        const longPress = async (target: Locator) => {
            const box = (await target.boundingBox())!;
            const point = { x: box.x + box.width / 3, y: box.y + box.height / 2, id: 1 };
            await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
            await page.waitForTimeout(700);
            await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        };
        const menu = page.getByRole("menu");

        await longPress(ui.item("工作"));
        await menu.waitFor();
        assertMatch((await menu.getByRole("menuitem").allTextContents()).join(","), /新建笔记.*新建子笔记本.*删除笔记本/);
        await page.waitForTimeout(400); // the delayed compatibility click
        assertEquals(await expanded(ui.item("工作")), "false", "releasing the press does not toggle the node");
        await page.keyboard.press("Escape");
        await menu.waitFor({ state: "detached" });

        // A short tap still toggles; the visible ⋯ is reachable by touch as well.
        await ui.item("工作").tap();
        assertEquals(await expanded(ui.item("工作")), "true");
        await ui.item("工作笔记").waitFor();
        await ui.frame.getByRole("button", { name: "笔记操作：工作笔记", exact: true }).tap();
        await menu.waitFor();
        assertEquals(await menu.getByRole("menuitem", { name: "移至回收站" }).count(), 1);
        await page.keyboard.press("Escape");
        await menu.waitFor({ state: "detached" });

        // Long-pressing a note opens its menu without opening the note.
        await longPress(ui.item("工作笔记"));
        await menu.waitFor();
        await page.waitForTimeout(400);
        assertEquals(await ui.title.count(), 0, "the note is not opened by the release");
        await page.keyboard.press("Escape");
    } finally {
        await browser.close();
        await app.close();
    }
});
