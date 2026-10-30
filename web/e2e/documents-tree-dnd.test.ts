import { assert, assertEquals } from "@std/assert";
import type { Locator, Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { ensureSidebarOpen } from "./helpers/library.ts";

const NOTES = '[data-window-id="notes"]';

async function seed(page: Page, origin: string) {
    const post = async <T>(path: string, data: unknown): Promise<T> => {
        const response = await page.request.post(origin + path, {
            headers: { Origin: origin },
            data,
        });
        assert(response.ok(), `${path}: ${response.status()}`);
        return (await response.json()).data as T;
    };
    const notebook = (name: string, parentId: string | null = null) =>
        post<{ id: string }>("/api/document-notebooks", { name, parentId });
    const a = await notebook("甲");
    const child = await notebook("甲子", a.id);
    const b = await notebook("乙");
    const c = await notebook("丙");
    const note = (title: string, notebookId: string | null) =>
        post<{ id: string }>("/api/documents", {
            title,
            body: title,
            notebookId,
        });
    const one = await note("甲一", a.id);
    const two = await note("甲二", a.id);
    const root = await note("根一", null);
    return { a, b, c, child, one, two, root };
}

function tree(page: Page) {
    const frame = page.locator(NOTES);
    const container = frame.getByRole("tree", { name: "笔记本", exact: true });
    return {
        frame,
        container,
        item: (name: string) =>
            container.getByRole("treeitem", { name, exact: true }),
        labels: () =>
            container.getByRole("treeitem").evaluateAll((items) =>
                items.map((item) => item.getAttribute("aria-label"))
            ),
    };
}

async function startDrag(page: Page, source: Locator) {
    const box = (await source.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2, {
        steps: 3,
    });
}

async function hoverDrop(page: Page, target: Locator, fraction: number) {
    const box = (await target.boundingBox())!;
    await page.mouse.move(
        box.x + box.width / 2,
        box.y + box.height * fraction,
        { steps: 5 },
    );
}

Deno.test("笔记本树拖拽：笔记排序、跨笔记本移动、取消与失败回滚", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    try {
        await loginAndVisit(page, app.origin, "/", user);
        const ids = await seed(page, app.origin);
        await page.goto(app.origin + "/?view=notes");
        await ensureSidebarOpen(page);
        const ui = tree(page);
        await ui.item("根一").waitFor();
        await ui.item("甲").click();
        await ui.item("甲一").waitFor();

        // Drop on the upper half of a note to insert before it in the same scope.
        const reorder = page.waitForResponse((response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname ===
                `/api/documents/${ids.one.id}/position`
        );
        await startDrag(page, ui.item("甲一"));
        await hoverDrop(page, ui.item("甲二"), 0.2);
        await page.mouse.up();
        const reordered = await reorder;
        assert(reordered.ok());
        assertEquals(reordered.request().postDataJSON(), {
            notebookId: ids.a.id,
            beforeId: ids.two.id,
        });
        await page.waitForFunction(() => {
            const labels = Array.from(
                document.querySelectorAll(
                    '[data-window-id="notes"] [role="treeitem"]',
                ),
            ).map((el) => el.getAttribute("aria-label"));
            return labels.indexOf("甲一") < labels.indexOf("甲二");
        });
        await page.reload();
        await ensureSidebarOpen(page);
        await ui.item("甲").waitFor();
        if (await ui.item("甲").getAttribute("aria-expanded") !== "true") {
            await ui.item("甲").click();
        }
        await ui.item("甲一").waitFor();
        await ui.item("甲二").waitFor();
        assert(
            (await ui.labels()).indexOf("甲一") <
                (await ui.labels()).indexOf("甲二"),
            "order survives reload",
        );

        // The middle of a notebook moves the note to the top of that notebook.
        const move = page.waitForResponse((response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname ===
                `/api/documents/${ids.one.id}/position`
        );
        await startDrag(page, ui.item("甲一"));
        await hoverDrop(page, ui.item("乙"), 0.5);
        // Hovering a collapsed notebook expands it after the dwell delay.
        await page.waitForFunction(() =>
            document.querySelector(
                '[data-window-id="notes"] [role="treeitem"][aria-label="乙"]',
            )?.getAttribute("aria-expanded") === "true"
        );
        await page.mouse.up();
        const moved = await move;
        assert(moved.ok());
        assertEquals(moved.request().postDataJSON(), { notebookId: ids.b.id });
        await ui.item("甲一").waitFor();

        // Escape cancels without issuing a position request.
        let positions = 0;
        const observe = (request: { method(): string; url(): string }) => {
            if (
                request.method() === "POST" &&
                new URL(request.url()).pathname.endsWith("/position")
            ) positions++;
        };
        page.on("request", observe);
        await startDrag(page, ui.item("甲一"));
        await hoverDrop(page, ui.item("根一"), 0.8);
        await page.keyboard.press("Escape");
        await page.mouse.up();
        assertEquals(positions, 0);
        await ui.item("甲一").waitFor();
        page.off("request", observe);

        // A failed optimistic move restores the original visible scope.
        await page.route(
            `**/api/documents/${ids.one.id}/position`,
            (route) => route.fulfill({ status: 500, body: "failure" }),
        );
        const failed = page.waitForResponse((response) =>
            new URL(response.url()).pathname ===
                `/api/documents/${ids.one.id}/position` &&
            response.status() === 500
        );
        await startDrag(page, ui.item("甲一"));
        await hoverDrop(page, ui.item("根一"), 0.8);
        await page.mouse.up();
        await failed;
        await ui.item("甲一").waitFor();
        await page.unroute(`**/api/documents/${ids.one.id}/position`);
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("笔记本树拖拽：笔记本层级、非法落点与键盘移动", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    try {
        await loginAndVisit(page, app.origin, "/", user);
        const ids = await seed(page, app.origin);
        await page.goto(app.origin + "/?view=notes");
        await ensureSidebarOpen(page);
        const ui = tree(page);
        await ui.item("根一").waitFor();
        await ui.item("甲").click();
        await ui.item("甲子").waitFor();

        // A notebook with children cannot become a child itself.
        let moves = 0;
        const observe = (request: { method(): string; url(): string }) => {
            if (
                request.method() === "POST" &&
                new URL(request.url()).pathname.endsWith("/move")
            ) moves++;
        };
        page.on("request", observe);
        await startDrag(page, ui.item("甲"));
        await ui.item("甲子").waitFor({ state: "detached" });
        await hoverDrop(page, ui.item("乙"), 0.5);
        await page.mouse.up();
        assertEquals(moves, 0);
        await ui.item("甲子").waitFor();
        page.off("request", observe);

        // A leaf notebook may become the last child of a root notebook.
        const move = page.waitForResponse((response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname ===
                `/api/document-notebooks/${ids.c.id}/move`
        );
        await startDrag(page, ui.item("丙"));
        await hoverDrop(page, ui.item("乙"), 0.5);
        await page.mouse.up();
        const moved = await move;
        assert(moved.ok());
        assertEquals(moved.request().postDataJSON(), { parentId: ids.b.id });
        if (await ui.item("乙").getAttribute("aria-expanded") !== "true") {
            await ui.item("乙").click();
        }
        await ui.item("丙").waitFor();
        assertEquals(await ui.item("丙").getAttribute("aria-level"), "2");

        // The upper edge of the first root note places a notebook at the end of the root.
        const toRoot = page.waitForResponse((response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname ===
                `/api/document-notebooks/${ids.c.id}/move`
        );
        await startDrag(page, ui.item("丙"));
        await hoverDrop(page, ui.item("根一"), 0.2);
        await page.mouse.up();
        const rooted = await toRoot;
        assert(rooted.ok());
        assertEquals(rooted.request().postDataJSON(), { parentId: null });
        await page.waitForFunction(() =>
            document.querySelector(
                '[data-window-id="notes"] [role="treeitem"][aria-label="丙"]',
            )?.getAttribute("aria-level") === "1"
        );

        // Notes also offer keyboard-accessible reordering through their menu.
        await ui.item("甲二").click({ button: "right" });
        const menu = page.getByRole("menu");
        await menu.getByRole("menuitem", { name: "下移", exact: true }).click();
        await page.waitForFunction(() => {
            const labels = Array.from(
                document.querySelectorAll(
                    '[data-window-id="notes"] [role="treeitem"]',
                ),
            ).map((el) => el.getAttribute("aria-label"));
            return labels.indexOf("甲一") < labels.indexOf("甲二");
        });
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("笔记本树拖拽：触屏长按后移动笔记", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
    });
    const page = await context.newPage();
    try {
        await loginAndVisit(page, app.origin, "/", user);
        const ids = await seed(page, app.origin);
        await page.goto(app.origin + "/?view=notes");
        await ensureSidebarOpen(page);
        const ui = tree(page);
        await ui.item("根一").waitFor();
        const session = await context.newCDPSession(page);
        const source = (await ui.item("根一").boundingBox())!;
        const target = (await ui.item("乙").boundingBox())!;
        const point = (x: number, y: number) => ({ x, y, id: 1 });
        const moved = page.waitForResponse((response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname ===
                `/api/documents/${ids.root.id}/position`
        );
        await session.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [
                point(
                    source.x + source.width / 2,
                    source.y + source.height / 2,
                ),
            ],
        });
        await page.waitForTimeout(550);
        await session.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [
                point(
                    target.x + target.width / 2,
                    target.y + target.height / 2,
                ),
            ],
        });
        await session.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
        });
        const response = await moved;
        assert(response.ok());
        assertEquals(response.request().postDataJSON(), {
            notebookId: ids.b.id,
        });
        assertEquals(await page.getByRole("menu").count(), 0);
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("笔记本树拖拽：触屏快速滑动节点滚动侧栏而不拖拽", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const context = await browser.newContext({
        viewport: { width: 390, height: 600 },
        hasTouch: true,
        isMobile: true,
    });
    const page = await context.newPage();
    try {
        await loginAndVisit(page, app.origin, "/", user);
        for (let index = 0; index < 20; index++) {
            const response = await page.request.post(
                app.origin + "/api/document-notebooks",
                {
                    headers: { Origin: app.origin },
                    data: { name: `滑动笔记本${index}`, parentId: null },
                },
            );
            assert(response.ok());
        }
        await page.goto(app.origin + "/?view=notes");
        await ensureSidebarOpen(page);
        const ui = tree(page);
        await ui.item("滑动笔记本0").waitFor();
        const scroll = ui.frame.locator(".documents-sidebar > nav");
        const initial = await scroll.evaluate((el) => el.scrollTop);
        let moves = 0;
        page.on("request", (request) => {
            if (
                request.method() === "POST" &&
                /\/(move|position)$/.test(new URL(request.url()).pathname)
            ) moves++;
        });
        const box = (await ui.item("滑动笔记本3").boundingBox())!;
        const session = await context.newCDPSession(page);
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await session.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x, y, id: 1 }],
        });
        for (let distance = 20; distance <= 140; distance += 20) {
            await session.send("Input.dispatchTouchEvent", {
                type: "touchMove",
                touchPoints: [{ x, y: y - distance, id: 1 }],
            });
        }
        await session.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
        });
        await page.waitForFunction(({ start }) => {
            const scroll = document.querySelector(
                '[data-window-id="notes"] .documents-sidebar > nav',
            );
            return scroll !== null && scroll.scrollTop > start;
        }, { start: initial });
        assertEquals(moves, 0);
        assertEquals(await page.getByRole("menu").count(), 0);
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("笔记本树拖拽：同级重排、跨父级插入及编辑中移动", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    try {
        await loginAndVisit(page, app.origin, "/", user);
        const ids = await seed(page, app.origin);
        const extra = await page.request.post(
            app.origin + "/api/document-notebooks",
            {
                headers: { Origin: app.origin },
                data: { name: "乙子", parentId: ids.b.id },
            },
        );
        assert(extra.ok());
        await page.goto(app.origin + "/?view=notes");
        await ensureSidebarOpen(page);
        const ui = tree(page);
        await ui.item("根一").waitFor();
        const reorder = page.waitForResponse((response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname ===
                `/api/document-notebooks/${ids.c.id}/move`
        );
        await startDrag(page, ui.item("丙"));
        await hoverDrop(page, ui.item("乙"), 0.2);
        await page.mouse.up();
        const reordered = await reorder;
        assert(reordered.ok());
        assertEquals(reordered.request().postDataJSON(), {
            parentId: null,
            beforeId: ids.b.id,
        });
        await page.waitForFunction(() => {
            const rows = Array.from(
                document.querySelectorAll(
                    '[data-window-id="notes"] [role="treeitem"]',
                ),
            );
            return rows.findIndex((row) =>
                row.getAttribute("aria-label") === "丙"
            ) <
                rows.findIndex((row) =>
                    row.getAttribute("aria-label") === "乙"
                );
        });

        await startDrag(page, ui.item("丙"));
        await hoverDrop(page, ui.item("乙"), 0.5);
        await ui.item("乙").and(page.locator('[data-drop-zone="inside"]'))
            .waitFor();
        const nest = page.waitForResponse((response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname ===
                `/api/document-notebooks/${ids.c.id}/move`
        );
        await page.mouse.up();
        assert((await nest).ok());
        // A drop opens its destination notebook so the moved item stays visible.
        await ui.item("乙").and(page.locator('[aria-expanded="true"]'))
            .waitFor();
        await ui.item("丙").waitFor();
        await ui.item("甲").click();
        await ui.item("甲子").waitFor();

        const insert = page.waitForResponse((response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname ===
                `/api/document-notebooks/${ids.child.id}/move`
        );
        await startDrag(page, ui.item("甲子"));
        await hoverDrop(page, ui.item("丙"), 0.2);
        await page.mouse.up();
        const inserted = await insert;
        assert(inserted.ok());
        assertEquals(inserted.request().postDataJSON(), {
            parentId: ids.b.id,
            beforeId: ids.c.id,
        });
        await page.waitForFunction(() => {
            const labels = Array.from(
                document.querySelectorAll(
                    '[data-window-id="notes"] [role="treeitem"]',
                ),
            ).map((el) => el.getAttribute("aria-label"));
            return labels.indexOf("乙子") >= 0 &&
                labels.indexOf("乙子") < labels.indexOf("甲子") &&
                labels.indexOf("甲子") < labels.indexOf("丙");
        });

        // Position changes do not increment the editor version or create a save conflict.
        await ui.item("甲一").click();
        const title = ui.frame.getByRole("textbox", {
            name: "笔记标题",
            exact: true,
        });
        await title.waitFor();
        const position = page.waitForResponse((response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname ===
                `/api/documents/${ids.one.id}/position`
        );
        await startDrag(page, ui.item("甲一"));
        await hoverDrop(page, ui.item("根一"), 0.8);
        await page.mouse.up();
        assert((await position).ok());
        const save = page.waitForResponse((response) =>
            response.request().method() === "PATCH" &&
            new URL(response.url()).pathname === `/api/documents/${ids.one.id}`
        );
        await title.fill("移动后继续编辑");
        assert((await save).ok());
        assertEquals(
            await page.getByRole("dialog", { name: /冲突/ }).count(),
            0,
        );
    } finally {
        await browser.close();
        await app.close();
    }
});
