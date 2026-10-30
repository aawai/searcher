import { assert, assertEquals } from "@std/assert";
import type { Locator, Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { assertLargeFolderGeometry } from "./helpers/launcher-geometry.ts";
import {
    closeLibrary,
    libraryWindow,
    openApps,
    workspaceDock,
} from "./helpers/library.ts";

async function chooseMenu(page: Page, tile: Locator, name: string) {
    await tile.click({ button: "right" });
    assertEquals(
        await page.getByRole("menuitem", { name: "整理布局", exact: true })
            .count(),
        0,
    );
    await page.getByRole("menuitem", { name, exact: true }).click();
}

Deno.test("Library apps: complete searchable library, folder management, no sorting and labels #285", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const credentials = await app.seedAskFixtureUser({
        username: "library_apps",
        password: "Library-apps-password-285!",
    });
    const browser = await chromium.launch({ headless: true });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        reducedMotion: "reduce",
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();
    await loginAndVisit(page, app.origin, "/", credentials);
    const post = async (
        path: string,
        data: unknown,
    ): Promise<{ id: string }> => {
        const response = await page.request.post(app.origin + path, {
            headers: { Origin: app.origin },
            data,
        });
        assert(response.ok(), await response.text());
        return (await response.json()).data;
    };
    const empty = await post("/api/webapp-groups", {
        name: "空文件夹",
        folderSize: "small",
    });
    const apps: { id: string }[] = [];
    for (let index = 0; index < 32; index++) {
        apps.push(
            await post("/api/webapps", {
                name: `管理应用 ${index}`,
                url: `https://library-${index}.example.test/`,
                sortOrder: index,
            }),
        );
    }
    await page.reload();
    await openApps(page);
    const surface = page.locator("[data-library-apps]");
    const grid = surface.locator("[data-library-apps-grid]");
    const appTile = (id: string) => surface.locator(`[data-app-id="${id}"]`);
    const folderTile = (id: string) =>
        surface.locator(`[data-folder-id="${id}"]`);
    const search = surface.getByRole("searchbox", {
        name: "搜索应用",
        exact: true,
    });

    interface GridLayout {
        columns: number;
        leftGutter: number;
        rightGutter: number;
        controlLeft: number;
        controlRight: number;
        panelWidth: number;
        panelLeftInset: number;
        panelRightInset: number;
    }
    async function gridLayout(target: Locator = grid): Promise<GridLayout> {
        return await target.evaluate((node) => {
            const style = getComputedStyle(node);
            const box = node.getBoundingClientRect();
            const tiles = [...node.querySelectorAll<HTMLElement>(
                ".launcher-app, .launcher-folder-item",
            )].map((tile) => tile.getBoundingClientRect());
            const firstRowTop = Math.min(...tiles.map((rect) => rect.top));
            const firstRow = tiles.filter((rect) =>
                Math.abs(rect.top - firstRowTop) <= 1
            );
            const controls = node.closest(".library-apps")!
                .querySelector(".library-apps-controls")!
                .getBoundingClientRect();
            const panel = node.closest("[data-library]")!
                .getBoundingClientRect();
            // The body inset is measured from the body, inside the frame border.
            const body = node.closest(".workspace-body")!
                .getBoundingClientRect();
            return {
                columns: style.gridTemplateColumns.split(/\s+/).filter(
                    Boolean,
                ).length,
                leftGutter: Math.round(
                    Math.min(...firstRow.map((rect) => rect.left)) - box.left,
                ),
                rightGutter: Math.round(
                    box.right - Math.max(...firstRow.map((rect) => rect.right)),
                ),
                controlLeft: Math.round(box.left - controls.left),
                controlRight: Math.round(box.right - controls.right),
                panelWidth: Math.round(panel.width),
                panelLeftInset: Math.round(box.left - body.left),
                panelRightInset: Math.round(body.right - box.right),
            };
        });
    }
    function assertCenteredGrid(layout: GridLayout) {
        assertEquals(layout.controlLeft, 0, JSON.stringify(layout));
        assertEquals(layout.controlRight, 0, JSON.stringify(layout));
        assert(
            layout.leftGutter >= 0 && layout.rightGutter >= 0,
            JSON.stringify(layout),
        );
        assert(
            Math.abs(layout.leftGutter - layout.rightGutter) <= 1,
            `Grid gutters must match within 1px: ${JSON.stringify(layout)}`,
        );
    }

    const frame = libraryWindow(page, "apps");
    /** The window stays in the work area and never covers the Dock. */
    async function assertAboveDock(target: Page) {
        const windowBox = await libraryWindow(target, "apps").boundingBox();
        const dockBox = await workspaceDock(target).boundingBox();
        const viewport = target.viewportSize();
        assert(windowBox && dockBox && viewport);
        assert(
            windowBox.x >= 0 && windowBox.y >= 0 &&
                windowBox.x + windowBox.width <= viewport.width &&
                windowBox.y + windowBox.height <= viewport.height,
            JSON.stringify({ windowBox, viewport }),
        );
        assert(
            windowBox.x + windowBox.width <= dockBox.x ||
                dockBox.x + dockBox.width <= windowBox.x ||
                windowBox.y + windowBox.height <= dockBox.y ||
                dockBox.y + dockBox.height <= windowBox.y,
            JSON.stringify({ windowBox, dockBox }),
        );
    }
    async function windowWidth(target: Page) {
        return Math.round(
            (await libraryWindow(target, "apps").boundingBox())!.width,
        );
    }

    await t.step(
        "grid centres equal gutters and fits five columns in the 390px window",
        async () => {
            const desktop = await gridLayout();
            assertEquals(await windowWidth(page), 640);
            assert(desktop.columns >= 4, JSON.stringify(desktop));
            assertCenteredGrid(desktop);
            await assertAboveDock(page);
            await page.setViewportSize({ width: 768, height: 1024 });
            // Below 1024px the single active window fills the work area.
            await page.waitForFunction(
                (selector) =>
                    (document.querySelector(selector)?.getBoundingClientRect()
                        .width ?? 0) > 640,
                '[data-window-id="apps"]',
            );
            const tablet = await gridLayout();
            assert(tablet.columns >= 4, JSON.stringify(tablet));
            assertCenteredGrid(tablet);
            await assertAboveDock(page);
            await page.setViewportSize({ width: 390, height: 844 });
            await page.waitForFunction(
                (selector) =>
                    (document.querySelector(selector)?.getBoundingClientRect()
                        .width ?? 0) < 400,
                '[data-window-id="apps"]',
            );
            const phone = await gridLayout();
            assertEquals(phone.columns, 5);
            assertEquals([phone.panelLeftInset, phone.panelRightInset], [
                16,
                16,
            ]);
            assertCenteredGrid(phone);
            await assertAboveDock(page);
            const touchContext = await browser.newContext({
                viewport: { width: 390, height: 844 },
                hasTouch: true,
                reducedMotion: "reduce",
                storageState: await context.storageState(),
            });
            try {
                const touchPage = await touchContext.newPage();
                await touchPage.goto(app.origin + "/");
                await touchPage.locator(".user-avatar-trigger").waitFor();
                await openApps(touchPage);
                const touch = await gridLayout(
                    touchPage.locator("[data-library-apps-grid]"),
                );
                assertEquals(touch.columns, 5);
                assertEquals(
                    [touch.panelLeftInset, touch.panelRightInset],
                    [16, 16],
                );
                assertCenteredGrid(touch);
                await assertAboveDock(touchPage);
            } finally {
                await touchContext.close();
            }
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.waitForFunction(
                (selector) =>
                    (document.querySelector(selector)?.getBoundingClientRect()
                        .width ?? 0) >= 400,
                '[data-window-id="apps"]',
            );
            await frame.waitFor({ state: "visible" });
        },
    );

    await t.step(
        "all apps, overflow and empty folders; name and URL search",
        async () => {
            assertEquals(await grid.locator("[data-app-id]").count(), 32);
            await folderTile(empty.id).waitFor();
            assertEquals(
                await surface.locator(
                    '[draggable="true"], [aria-roledescription="sortable"], .launcher-drag-cue',
                ).count(),
                0,
            );
            await search.fill("library-31.example.test");
            await appTile(apps[31].id).waitFor();
            assertEquals(await surface.locator("[data-app-id]").count(), 1);
            await search.fill("空文件夹");
            await folderTile(empty.id).waitFor();
            assertEquals(await surface.locator("[data-app-id]").count(), 0);
            await search.fill("");
            await grid.waitFor();
        },
    );

    let folderId = "";
    let largeFolderId = "";
    await t.step("create, rename and resize folder", async () => {
        await surface.getByRole("button", { name: "应用更多操作", exact: true })
            .click();
        await page.getByRole("menuitem", { name: "新建文件夹", exact: true })
            .click();
        const dialog = page.getByRole("dialog").filter({
            has: page.getByRole("textbox", { name: "文件夹名称", exact: true }),
        });
        await dialog.getByRole("textbox", { name: "文件夹名称", exact: true })
            .fill("新文件夹");
        const created = page.waitForResponse((response) =>
            response.request().method() === "POST" &&
            response.url().endsWith("/api/webapp-groups") && response.ok()
        );
        await dialog.getByRole("button", { name: "创建", exact: true }).click();
        folderId = (await (await created).json()).data.id;
        await dialog.waitFor({ state: "detached" });
        await chooseMenu(page, folderTile(folderId), "重命名");
        await page.getByRole("textbox", { name: "文件夹名称", exact: true })
            .fill("资料归档");
        await page.getByRole("button", { name: "保存", exact: true }).click();
        await folderTile(folderId).getByText("资料归档", { exact: true })
            .waitFor();
        await chooseMenu(page, folderTile(folderId), "显示为大文件夹");
        await page.waitForFunction(
            (id) =>
                document.querySelector(`[data-folder-id="${id}"]`)?.classList
                    .contains("launcher-folder-item--large"),
            folderId,
        );
        await chooseMenu(page, folderTile(folderId), "显示为小文件夹");
        await folderTile(folderId).click({ button: "right" });
        await page.getByRole("menuitem", {
            name: "显示为大文件夹",
            exact: true,
        }).waitFor();
        await page.keyboard.press("Escape");
    });

    await t.step(
        "move in and out, inline folder return preserves focus",
        async () => {
            await chooseMenu(page, appTile(apps[0].id), "移至文件夹 资料归档");
            await appTile(apps[0].id).waitFor({ state: "detached" });
            const opener = folderTile(folderId).locator(
                ".launcher-folder-background",
            );
            await chooseMenu(page, folderTile(folderId), "打开文件夹");
            await appTile(apps[0].id).waitFor();
            await chooseMenu(page, appTile(apps[0].id), "移出文件夹");
            await appTile(apps[0].id).waitFor({ state: "detached" });
            await surface.getByRole("button", {
                name: "返回应用列表",
                exact: true,
            }).click();
            await appTile(apps[0].id).waitFor();
            assert(
                await opener.evaluate((node) =>
                    node === document.activeElement
                ),
            );
            await chooseMenu(page, appTile(apps[1].id), "移至文件夹 资料归档");
            await appTile(apps[1].id).waitFor({ state: "detached" });
            await chooseMenu(page, folderTile(folderId), "删除文件夹");
            const dialog = page.getByRole("alertdialog");
            await dialog.getByRole("button", { name: "确认删除", exact: true })
                .click();
            await folderTile(folderId).waitFor({ state: "detached" });
            await appTile(apps[1].id).waitFor();
            assertEquals(await grid.locator("[data-app-id]").count(), 32);
            const before = await grid.locator("[data-app-id]").evaluateAll((
                nodes,
            ) => nodes.map((node) => node.getAttribute("data-app-id")));
            await appTile(apps[0].id).dragTo(appTile(apps[2].id));
            assertEquals(
                await grid.locator("[data-app-id]").evaluateAll((nodes) =>
                    nodes.map((node) => node.getAttribute("data-app-id"))
                ),
                before,
            );
        },
    );

    await t.step(
        "large folders share the home square cell and 3x3 preview",
        async () => {
            const large = await post("/api/webapp-groups", {
                name: "大文件夹",
                folderSize: "large",
                sortOrder: 5,
            });
            largeFolderId = large.id;
            for (let index = 0; index < 10; index++) {
                await post("/api/webapps", {
                    name: `大文件夹成员 ${index}`,
                    url: `https://large-${index}.example.test/`,
                    groupId: largeFolderId,
                });
            }
            await closeLibrary(page);
            await page.reload();
            await openApps(page);
            const tile = folderTile(largeFolderId);
            await tile.waitFor();
            await tile.locator(".launcher-folder-name").waitFor();
            const tokens = await grid.evaluate((node) => {
                const style = getComputedStyle(node);
                const root = getComputedStyle(document.documentElement);
                return {
                    cell: style.getPropertyValue("--launcher-col-w").trim(),
                    gap: style.getPropertyValue("--launcher-gap-x").trim(),
                    homeCell: root.getPropertyValue("--home-grid-cell").trim(),
                    homeGap: root.getPropertyValue("--home-grid-gap").trim(),
                };
            });
            assert(parseFloat(tokens.cell) > 0, JSON.stringify(tokens));
            assertEquals(tokens.cell, tokens.homeCell);
            assertEquals(tokens.gap, tokens.homeGap);
            await assertLargeFolderGeometry(tile, true);
            assertEquals(
                await tile.locator(".launcher-folder-mini").count(),
                9,
            );
            await page.setViewportSize({ width: 390, height: 844 });
            await assertLargeFolderGeometry(tile, true);
            await page.setViewportSize({ width: 1440, height: 900 });
        },
    );

    await t.step("open, edit and move an app to the recycle bin", async () => {
        const launchable = await post("/api/webapps", {
            name: "可打开应用",
            url: "https://library-open.example.test/",
            openMode: "new_tab",
        });
        await closeLibrary(page);
        await page.reload();
        await openApps(page);
        await context.route(
            "https://library-open.example.test/**",
            (route) =>
                route.fulfill({
                    contentType: "text/html",
                    body: "<title>Library app</title>",
                }),
        );
        const opened = context.waitForEvent("page");
        await appTile(launchable.id).click();
        const destination = await opened;
        await destination.waitForURL("https://library-open.example.test/");
        await destination.close();
        await chooseMenu(page, appTile(launchable.id), "编辑");
        const dialog = page.getByRole("dialog", {
            name: "编辑应用",
            exact: true,
        });
        await dialog.getByRole("textbox", { name: "应用名称", exact: true })
            .fill("已编辑应用");
        await dialog.getByRole("button", { name: "保存修改", exact: true })
            .click();
        await dialog.waitFor({ state: "detached" });
        await appTile(launchable.id).getByText("已编辑应用", { exact: true })
            .waitFor();
        await chooseMenu(page, appTile(launchable.id), "移至回收站");
        await appTile(launchable.id).waitFor({ state: "detached" });
        const response = await page.request.get(
            app.origin + "/api/webapps/trash",
        );
        assert(response.ok(), await response.text());
        const { data } = await response.json();
        assert(data.some((item: { id: string }) => item.id === launchable.id));
    });

    await t.step(
        "labels follow appearance preference without losing accessible names",
        async () => {
            await closeLibrary(page);
            await page.goto(app.origin + "/settings/appearance");
            const toggle = page.getByRole("switch", {
                name: "显示应用名称",
                exact: true,
            });
            if (await toggle.getAttribute("aria-checked") === "true") {
                const saved = page.waitForResponse((response) =>
                    response.request().method() === "PATCH" &&
                    response.url().endsWith("/api/preferences") && response.ok()
                );
                await toggle.click();
                await saved;
            }
            await page.goto(app.origin + "/");
            await openApps(page);
            assertEquals(
                await appTile(apps[0].id).getAttribute("aria-label"),
                "打开 管理应用 0",
            );
            assertEquals(
                await surface.locator(
                    ".webapp-name:visible, .launcher-folder-name:visible",
                ).count(),
                0,
            );
            const largeTile = folderTile(largeFolderId);
            await largeTile.waitFor();
            await assertLargeFolderGeometry(largeTile, false);
            assertEquals(
                await largeTile.locator(".launcher-folder-name").count(),
                0,
            );
            assert(
                (await largeTile.locator(".launcher-folder-background")
                    .getAttribute("aria-label"))?.includes("大文件夹"),
            );
            assert(
                await folderTile(empty.id).getByRole("button").first()
                    .getAttribute("aria-label"),
            );
            await chooseMenu(page, folderTile(empty.id), "打开文件夹");
            assertEquals(
                await surface.getByRole("heading", {
                    name: "空文件夹",
                    exact: true,
                }).count(),
                0,
            );
            await closeLibrary(page);
        },
    );
});
