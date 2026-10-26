import { assert, assertEquals } from "@std/assert";
import type {
    BrowserContext,
    Locator,
    Page,
    Response as PlaywrightResponse,
} from "playwright";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import {
    closeLibrary,
    libraryEntry,
    libraryView,
    openLibrary,
} from "./helpers/library.ts";

// Issue #285 Y8: the library holds every app; the home grid shows only pinned
// root apps and folders. 更多（N） opens the library app view, releases inherit
// their folder's pin, and pin/unpin works with pointer, keyboard and touch.

async function openApps(page: Page): Promise<Locator> {
    await openLibrary(page);
    await libraryEntry(page, "apps").click();
    const view = libraryView(page, "apps");
    await view.waitFor();
    return view;
}

async function chooseMenu(page: Page, tile: Locator, name: string) {
    await tile.click({ button: "right" });
    await page.getByRole("menuitem", { name, exact: true }).click();
}

const homeGrid = (page: Page) => page.locator(".launcher-grid--home");
const homeTile = (page: Page, id: string) =>
    homeGrid(page).locator(`.launcher-tile[data-tile-id="${id}"]`);
const libraryTile = (page: Page, id: string) =>
    page.locator(`[data-library-view="apps"] [data-app-id="${id}"]`);

async function saveApp(
    context: BrowserContext,
    origin: string,
    data: Record<string, unknown>,
): Promise<{ id: string }> {
    const response = await context.request.post(origin + "/api/webapps", {
        headers: { Origin: origin },
        data,
    });
    assert(response.ok(), await response.text());
    return (await response.json()).data;
}

/** A point on the plate away from tiles, used for the blank context menu. */
async function blankPoint(page: Page): Promise<{ x: number; y: number }> {
    return await page.evaluate(() => {
        const wrap = document.querySelector<HTMLElement>(".launcher-plate");
        if (!wrap) throw new Error("No home plate");
        const rect = wrap.getBoundingClientRect();
        const tiles = [...wrap.querySelectorAll(".launcher-tile")]
            .map((tile) => tile.getBoundingClientRect());
        for (let y = rect.bottom - 3; y > rect.top; y -= 4) {
            for (let x = rect.left + 3; x < rect.right; x += 4) {
                const hit = document.elementFromPoint(x, y);
                if (
                    !hit || !wrap.contains(hit) ||
                    hit.closest(
                        ".launcher-tile, .home-managing-bar, button",
                    )
                ) continue;
                const distance = Math.min(
                    ...tiles.map((tile) =>
                        Math.hypot(
                            Math.max(tile.left - x, 0, x - tile.right),
                            Math.max(tile.top - y, 0, y - tile.bottom),
                        )
                    ),
                );
                if (distance > 24) return { x, y };
            }
        }
        throw new Error("No blank point on the home plate");
    });
}

async function enterArranging(page: Page) {
    const { x, y } = await blankPoint(page);
    await page.mouse.click(x, y, { button: "right" });
    const menu = page.locator('[data-slot="context-menu-content"]');
    await menu.waitFor();
    await menu.getByRole("menuitem", { name: "整理布局", exact: true })
        .click();
    await menu.waitFor({ state: "detached" });
    await page.locator(".home-managing-bar").waitFor();
}

async function exitArranging(page: Page) {
    const { x, y } = await blankPoint(page);
    await page.mouse.click(x, y, { button: "right" });
    const menu = page.locator('[data-slot="context-menu-content"]');
    await menu.waitFor();
    await menu.getByRole("menuitem", { name: "完成整理", exact: true })
        .click();
    await menu.waitFor({ state: "detached" });
    await page.locator(".home-managing-bar").waitFor({ state: "detached" });
}

async function reloadHome(page: Page) {
    await page.reload();
    await homeGrid(page).waitFor();
}

async function dragAppOntoApp(
    page: Page,
    fromId: string,
    toId: string,
): Promise<PlaywrightResponse> {
    const source = homeTile(page, fromId);
    const target = homeTile(page, toId);
    const a = (await source.boundingBox())!;
    const b = (await target.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(
        a.x + a.width / 2 + 15,
        a.y + a.height / 2 + 15,
    );
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await target.locator("xpath=self::*[contains(@class,'is-over')]")
        .waitFor();
    const created = page.waitForResponse((response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/webapp-groups"
    );
    await page.mouse.up();
    return await created;
}

Deno.test("Apps pin and unpin from home and the library #285 Y8", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const credentials = await app.seedAskFixtureUser({
        username: "apps_pinning",
        password: "Apps-pinning-password-285!",
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

    const pinned = await saveApp(context, app.origin, {
        name: "固定在首页",
        url: "https://pinned-app.example.test/",
        openMode: "new_tab",
        sortOrder: 0,
        isHomeFixed: true,
    });
    const unpinned = await saveApp(context, app.origin, {
        name: "只在资料库",
        url: "https://library-only.example.test/",
        openMode: "new_tab",
        sortOrder: 1,
    });
    const folderResponse = await context.request.post(
        app.origin + "/api/webapp-groups",
        {
            headers: { Origin: app.origin },
            data: { name: "库文件夹", sortOrder: 2 },
        },
    );
    assert(folderResponse.ok(), await folderResponse.text());
    const unpinnedFolder = (await folderResponse.json()).data as {
        id: string;
        isHomeFixed: boolean;
    };
    assertEquals(unpinnedFolder.isHomeFixed, false);
    await reloadHome(page);

    await t.step("home shows only the pinned root app", async () => {
        await homeTile(page, pinned.id).waitFor();
        assertEquals(await homeTile(page, unpinned.id).count(), 0);
        assertEquals(
            await homeGrid(page).locator(
                `.launcher-folder-item[data-folder-id="${unpinnedFolder.id}"]`,
            ).count(),
            0,
        );
        // The "+" is the empty home's only content; it never shares the grid
        // with tiles.
        assertEquals(
            await homeGrid(page).locator('[data-library-cell="add"]').count(),
            0,
        );
    });

    await t.step(
        "unpin updates home immediately and survives reload",
        async () => {
            const patched = page.waitForResponse((response) =>
                response.request().method() === "PATCH" &&
                new URL(response.url()).pathname === `/api/webapps/${pinned.id}`
            );
            await chooseMenu(page, homeTile(page, pinned.id), "取消固定");
            assertEquals((await patched).status(), 200);
            await homeTile(page, pinned.id).waitFor({ state: "detached" });
            // The emptied home shows the "+" in place of its last tile.
            await homeGrid(page).locator('[data-library-cell="add"]').waitFor();
            assertEquals(
                await homeGrid(page).locator('[data-library-cell="add"]')
                    .count(),
                1,
            );
            await reloadHome(page);
            assertEquals(await homeTile(page, pinned.id).count(), 0);
            assertEquals(
                await homeGrid(page).locator('[data-library-cell="add"]')
                    .count(),
                1,
            );
        },
    );

    await t.step("home add defaults to pinned", async () => {
        // The empty home's "+" is still an app-create entry: 固定到首页
        // starts on and the created app lands on home.
        const add = homeGrid(page).locator('[data-library-cell="add"]');
        await add.waitFor();
        await add.click();
        const form = page.locator(".app-form-dialog");
        await form.waitFor();
        const toggle = form.getByRole("switch", {
            name: "固定到首页",
            exact: true,
        });
        assertEquals(await toggle.getAttribute("aria-checked"), "true");
        await form.locator("#app-url-input").fill(
            "https://home-added.example.test/",
        );
        await form.locator("#app-name-input").fill("首页添加");
        const created = page.waitForResponse((response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === "/api/webapps"
        );
        await form.locator(".app-dialog-footer button[type=submit]").click();
        const response = await created;
        assertEquals(response.status(), 200);
        assertEquals((await response.json()).data.isHomeFixed, true);
        await form.waitFor({ state: "detached" });
        await homeGrid(page).getByRole("button", {
            name: "打开 首页添加",
            exact: true,
        }).waitFor();
    });

    await t.step(
        "the library pins a folder and an app back onto home",
        async () => {
            await openApps(page);
            const folderTile = page.locator(
                `[data-library-view="apps"] .launcher-folder-item[data-folder-id="${unpinnedFolder.id}"]`,
            );
            await folderTile.waitFor();
            const folderPatched = page.waitForResponse((response) =>
                response.request().method() === "PATCH" &&
                new URL(response.url()).pathname ===
                    `/api/webapp-groups/${unpinnedFolder.id}`
            );
            await chooseMenu(page, folderTile, "固定到首页");
            assertEquals((await folderPatched).status(), 200);
            await closeLibrary(page);
            await homeGrid(page).locator(
                `.launcher-folder-item[data-folder-id="${unpinnedFolder.id}"]`,
            ).waitFor();
            await openApps(page);
            await chooseMenu(page, folderTile, "取消固定");
            await closeLibrary(page);
            await homeGrid(page).locator(
                `.launcher-folder-item[data-folder-id="${unpinnedFolder.id}"]`,
            ).waitFor({ state: "detached" });

            await openApps(page);
            await libraryTile(page, unpinned.id).waitFor();
            const patched = page.waitForResponse((response) =>
                response.request().method() === "PATCH" &&
                new URL(response.url()).pathname ===
                    `/api/webapps/${unpinned.id}`
            );
            await chooseMenu(
                page,
                libraryTile(page, unpinned.id),
                "固定到首页",
            );
            assertEquals((await patched).status(), 200);
            await closeLibrary(page);
            await homeTile(page, unpinned.id).waitFor();
            await reloadHome(page);
            await homeTile(page, unpinned.id).waitFor();
        },
    );

    await t.step("the library add form defaults to pinned", async () => {
        await openApps(page);
        await page.locator("[data-library]").getByRole("button", {
            name: "添加应用",
            exact: true,
        }).click();
        const form = page.locator(".app-form-dialog");
        await form.waitFor();
        assertEquals(
            await form.getByRole("switch", {
                name: "固定到首页",
                exact: true,
            }).getAttribute("aria-checked"),
            "true",
        );
        await form.locator("#app-url-input").fill(
            "https://library-added.example.test/",
        );
        await form.locator("#app-name-input").fill("资料库添加");
        const created = page.waitForResponse((response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === "/api/webapps"
        );
        await form.locator(".app-dialog-footer button[type=submit]").click();
        const response = await created;
        assertEquals(response.status(), 200);
        assertEquals((await response.json()).data.isHomeFixed, true);
        await form.waitFor({ state: "detached" });
        await page.locator(
            '[data-library-view="apps"] .webapp-name',
            { hasText: "资料库添加" },
        ).waitFor();
        await closeLibrary(page);
        // Every app-create entry pins by default, so the library's new app is
        // on home too.
        await homeGrid(page).getByRole("button", {
            name: "打开 资料库添加",
            exact: true,
        }).waitFor();
    });

    await t.step(
        "an unpinned app still opens from the library and search",
        async () => {
            // Self-contained: a reloaded home cannot inherit an earlier
            // step's form backdrop or open panel, which would swallow the
            // avatar menu click.
            await reloadHome(page);
            await context.route(
                "https://pinned-app.example.test/**",
                (route) =>
                    route.fulfill({
                        contentType: "text/html",
                        body: "<title>Pinned app</title>",
                    }),
            );
            await openApps(page);
            const opened = context.waitForEvent("page");
            await libraryTile(page, pinned.id).click();
            const fromLibrary = await opened;
            await fromLibrary.waitForURL("https://pinned-app.example.test/");
            await fromLibrary.close();
            await closeLibrary(page);

            await page.locator("#search-query").fill("固定在首页");
            const suggestion = page.getByRole("option").filter({
                hasText: "pinned-app.example.test",
            }).first();
            await suggestion.waitFor();
            const fromSearch = context.waitForEvent("page");
            await suggestion.click();
            const openedFromSearch = await fromSearch;
            await openedFromSearch.waitForURL(
                "https://pinned-app.example.test/",
            );
            await openedFromSearch.close();
        },
    );
});

Deno.test("Dropping one app onto another creates a pinned folder #285 Y8", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const credentials = await app.seedAskFixtureUser({
        username: "apps_drop_folder",
        password: "Apps-drop-folder-password-285!",
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

    const first = await saveApp(context, app.origin, {
        name: "拖入目标",
        url: "https://drop-target.example.test/",
        sortOrder: 0,
        isHomeFixed: true,
    });
    const second = await saveApp(context, app.origin, {
        name: "被拖入",
        url: "https://drop-source.example.test/",
        sortOrder: 1,
        isHomeFixed: true,
    });
    await reloadHome(page);
    await enterArranging(page);
    const response = await dragAppOntoApp(page, second.id, first.id);
    assertEquals(response.status(), 200);
    const folder = (await response.json()).data as {
        id: string;
        isHomeFixed: boolean;
    };
    assertEquals(folder.isHomeFixed, true);
    await homeTile(page, first.id).waitFor({ state: "detached" });
    await homeTile(page, second.id).waitFor({ state: "detached" });
    await exitArranging(page);

    const folderTile = homeGrid(page).locator(
        `.launcher-folder-item[data-folder-id="${folder.id}"]`,
    );
    await folderTile.waitFor();
    await folderTile.click();
    const popup = page.locator(".launcher-popup");
    await popup.waitFor();
    assertEquals(
        await popup.locator(".webapp-name").allTextContents(),
        ["拖入目标", "被拖入"],
    );
    await page.keyboard.press("Escape");
    await popup.waitFor({ state: "detached" });

    await reloadHome(page);
    await folderTile.waitFor();
    const apps = await context.request.get(app.origin + "/api/webapps");
    const listed = (await apps.json()).data as Array<{
        id: string;
        groupId: string | null;
    }>;
    assertEquals(
        listed.filter((item) => item.groupId === folder.id).map((item) =>
            item.id
        ).sort(),
        [first.id, second.id].sort(),
    );
});

Deno.test("Keyboard and touch can pin and unpin #285 Y8", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const credentials = await app.seedAskFixtureUser({
        username: "apps_pin_input",
        password: "Apps-pin-input-password-285!",
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
    const keyboardApp = await saveApp(context, app.origin, {
        name: "键盘固定",
        url: "https://keyboard-pin.example.test/",
        sortOrder: 0,
        isHomeFixed: true,
    });
    const touchApp = await saveApp(context, app.origin, {
        name: "触屏固定",
        url: "https://touch-pin.example.test/",
        sortOrder: 1,
    });
    await reloadHome(page);

    const button = homeTile(page, keyboardApp.id).locator(".webapp-icon");
    await button.focus();
    await button.press("Shift+F10");
    const unpin = page.getByRole("menuitem", { name: "取消固定", exact: true });
    await unpin.waitFor();
    const patched = page.waitForResponse((response) =>
        response.request().method() === "PATCH" &&
        new URL(response.url()).pathname ===
            `/api/webapps/${keyboardApp.id}`
    );
    await unpin.press("Enter");
    assertEquals((await patched).status(), 200);
    await homeTile(page, keyboardApp.id).waitFor({ state: "detached" });

    await openApps(page);
    const libraryButton = libraryTile(page, keyboardApp.id);
    await libraryButton.focus();
    await libraryButton.press("Shift+F10");
    const pin = page.getByRole("menuitem", { name: "固定到首页", exact: true });
    await pin.waitFor();
    const repatched = page.waitForResponse((response) =>
        response.request().method() === "PATCH" &&
        new URL(response.url()).pathname ===
            `/api/webapps/${keyboardApp.id}`
    );
    await pin.press("Enter");
    assertEquals((await repatched).status(), 200);
    await closeLibrary(page);
    await homeTile(page, keyboardApp.id).waitFor();

    const touchContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
        isMobile: true,
        hasTouch: true,
        storageState: await context.storageState(),
    });
    cleanup.defer(() => touchContext.close());
    const touchPage = await touchContext.newPage();
    await touchPage.goto(app.origin + "/");
    await homeGrid(touchPage).waitFor();
    const touchView = await openApps(touchPage);
    const target = touchView.locator(`[data-app-id="${touchApp.id}"]`);
    await target.waitFor();
    const box = (await target.boundingBox())!;
    const cdp = await touchContext.newCDPSession(touchPage);
    await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
            id: 1,
        }],
    });
    const touchPin = touchPage.getByRole("menuitem", {
        name: "固定到首页",
        exact: true,
    });
    await touchPin.waitFor();
    await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
    });
    await touchPin.tap();
    await closeLibrary(touchPage);
    await touchPage.reload();
    await homeGrid(touchPage).waitFor();
    await homeTile(touchPage, touchApp.id).waitFor();
});
