import { assert, assertEquals } from "@std/assert";
import { type Locator, type Route } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { openApps } from "./helpers/library.ts";

Deno.test("apps concurrent optimistic sorting converges to confirmed server order #141", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({
        handleSIGTERM: false,
        args: ["--no-sandbox"],
    });
    try {
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        await page.goto(app.origin + "/register");
        await page.locator("#auth-username").fill("apps_ordering");
        await page.locator("#auth-display-name").fill("Ordering tester");
        await page.locator("#auth-password").fill(
            "Apps-ordering-password-141!",
        );
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(app.origin + "/");
        await page.request.patch(app.origin + "/api/preferences", {
            headers: { Origin: app.origin },
            data: { showHomeApps: true },
        });
        for (let index = 0; index < 3; index++) {
            const response = await page.request.post(
                app.origin + "/api/webapps",
                {
                    headers: { Origin: app.origin },
                    data: {
                        name: `Order ${index}`,
                        url: `https://order${index}.example/`,
                        sortOrder: index,
                        isHomeFixed: true,
                    },
                },
            );
            assertEquals(response.status(), 200);
        }
        await page.reload();
        const tiles = page.locator(
            ".launcher-grid--home > .launcher-tile[data-tile-id]",
        );
        const readOrder = () =>
            tiles.evaluateAll((nodes) =>
                nodes.map((node) => node.getAttribute("data-tile-id"))
            );
        await tiles.first().waitFor();
        await tiles.first().click({ button: "right" });
        await page.getByRole("menuitem", { name: "整理布局", exact: true })
            .click();
        await page.locator(".home-managing-bar").waitFor();
        const initial = await readOrder();
        assertEquals(initial.length, 3);
        const routes: Route[] = [];
        await page.route("**/api/webapps/reorder", (route) => {
            routes.push(route);
        });
        // In 整理 mode the arrow keys move the focused tile one visual slot
        // and persist the whole order; every gesture is optimistic.
        const moveRight = async (
            index: number,
            expected: Array<string | null>,
        ) => {
            const requested = page.waitForRequest((request) =>
                new URL(request.url()).pathname === "/api/webapps/reorder" &&
                request.method() === "PUT"
            );
            await tiles.nth(index).locator("button").first().focus();
            await page.keyboard.press("ArrowRight");
            await requested;
            await page.waitForFunction(
                (order) =>
                    JSON.stringify(
                        Array.from(
                            document.querySelectorAll(
                                ".launcher-grid--home > .launcher-tile[data-tile-id]",
                            ),
                            (node) => node.getAttribute("data-tile-id"),
                        ),
                    ) === JSON.stringify(order),
                expected,
            );
        };
        const afterFirst = [initial[1], initial[0], initial[2]];
        const afterSecond = [initial[1], initial[2], initial[0]];
        await moveRight(0, afterFirst);
        await moveRight(1, afterSecond);
        // Both optimistic gestures run before either request settles. The newer
        // request succeeds first; the older one then fails, so snapshot rollback
        // would incorrectly replace the server-confirmed order.
        if (routes.length !== 2) {
            throw new Error(
                `Expected two pending gestures, got ${routes.length}`,
            );
        }
        const newer = await routes[1].fetch();
        await routes[1].fulfill({ response: newer });
        await routes[0].fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
                status: false,
                error: "Controlled ordering failure",
            }),
        });
        await page.getByRole("alert").filter({ hasText: "排列保存失败" })
            .waitFor();
        const server = await page.request.get(app.origin + "/api/webapps");
        const envelope = await server.json();
        const confirmed = envelope.data.toSorted((
            a: { sortOrder: number },
            b: { sortOrder: number },
        ) => a.sortOrder - b.sortOrder).map((item: { id: string }) => item.id);
        assertEquals(confirmed, afterSecond);
        await page.waitForFunction(
            (expected) =>
                JSON.stringify(
                    Array.from(
                        document.querySelectorAll(
                            ".launcher-grid--home > .launcher-tile[data-tile-id]",
                        ),
                        (node) => node.getAttribute("data-tile-id"),
                    ),
                ) === JSON.stringify(expected),
            confirmed,
        );
        await page.getByRole("button", { name: "完成", exact: true }).click();
        await page.reload();
        await tiles.first().waitFor();
        assertEquals(await readOrder(), confirmed);
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("app menu ordering persists on home, in the apps window and in folders", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const browser = await chromium.launch({ headless: true });
    cleanup.defer(() => browser.close());
    for (const touch of [false, true]) {
        const credentials = await app.seedAskFixtureUser({
            username: touch ? "menu_order_touch" : "menu_order_mouse",
            password: "Menu-order-password-394!",
        });
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
            isMobile: touch,
            hasTouch: touch,
            reducedMotion: "reduce",
        });
        try {
            const page = await context.newPage();
            await loginAndVisit(page, app.origin, "/", credentials);
            await page.request.patch(app.origin + "/api/preferences", {
                headers: { Origin: app.origin },
                data: { showHomeApps: true },
            });
            const post = async (
                path: string,
                data: unknown,
            ): Promise<string> => {
                const response = await page.request.post(app.origin + path, {
                    headers: { Origin: app.origin },
                    data,
                });
                assert(response.ok(), await response.text());
                return (await response.json()).data.id;
            };
            const first = await post("/api/webapps", {
                name: "排序甲",
                url: "https://order-a.example/",
                sortOrder: 0,
                isHomeFixed: true,
            });
            const hidden = await post("/api/webapps", {
                name: "排序未固定",
                url: "https://order-hidden.example/",
                sortOrder: 1,
                isHomeFixed: false,
            });
            const last = await post("/api/webapps", {
                name: "排序乙",
                url: "https://order-b.example/",
                sortOrder: 2,
                isHomeFixed: true,
            });
            const folder = await post("/api/webapp-groups", {
                name: "排序文件夹",
                folderSize: "small",
                sortOrder: 3,
                isHomeFixed: true,
            });
            const memberA = await post("/api/webapps", {
                name: "文件甲",
                url: "https://member-a.example/",
                groupId: folder,
                sortOrder: 0,
            });
            const memberB = await post("/api/webapps", {
                name: "文件乙",
                url: "https://member-b.example/",
                groupId: folder,
                sortOrder: 1,
            });
            await page.reload();
            const home = page.locator(".launcher-grid--home");
            const homeTiles = home.locator(".launcher-tile[data-tile-id]");
            const order = (tiles: Locator) =>
                tiles.evaluateAll((nodes) =>
                    nodes.map((node) => node.getAttribute("data-tile-id"))
                );
            const cdp = touch ? await context.newCDPSession(page) : null;
            const openMenu = async (tile: Locator) => {
                if (!cdp) {
                    await tile.click({ button: "right" });
                } else {
                    const box = await tile.boundingBox();
                    assert(box);
                    await cdp.send("Input.dispatchTouchEvent", {
                        type: "touchStart",
                        touchPoints: [{
                            x: box.x + box.width / 2,
                            y: box.y + box.height / 2,
                            id: 1,
                        }],
                    });
                    await page.getByRole("menu").waitFor();
                    await cdp.send("Input.dispatchTouchEvent", {
                        type: "touchEnd",
                        touchPoints: [],
                    });
                }
                await page.getByRole("menu").waitFor();
            };
            const choose = async (name: string) => {
                const saved = page.waitForResponse((response) =>
                    new URL(response.url()).pathname ===
                        "/api/webapps/reorder" &&
                    response.request().method() === "PUT" && response.ok()
                );
                await page.getByRole("menuitem", { name, exact: true }).click();
                await saved;
            };
            await homeTiles.first().waitFor();
            await openMenu(home.locator(`[data-tile-id="${first}"]`));
            assert(
                await page.getByRole("menuitem", { name: "上移", exact: true })
                    .isDisabled(),
            );
            await choose("下移");
            assertEquals(await order(homeTiles), [
                last,
                first,
                `folder:${folder}`,
            ]);
            await page.reload();
            await homeTiles.first().waitFor();
            assertEquals(await order(homeTiles), [
                last,
                first,
                `folder:${folder}`,
            ]);
            await home.locator(
                `[data-folder-id="${folder}"] .launcher-folder-background`,
            ).click();
            const popup = page.locator(".launcher-popup");
            const popupTiles = popup.locator(".launcher-tile[data-tile-id]");
            await popupTiles.first().waitFor();
            // The folder morph's snapshot overlay takes hits until it ends.
            await page.waitForFunction(() =>
                !document.documentElement.classList.contains(
                    "shared-element-transition",
                )
            );
            await openMenu(popup.locator(`[data-tile-id="${memberB}"]`));
            assert(
                await page.getByRole("menuitem", { name: "下移", exact: true })
                    .isDisabled(),
            );
            await choose("上移");
            assertEquals(await order(popupTiles), [memberB, memberA]);
            await page.keyboard.press("Escape");
            await popup.waitFor({ state: "detached" });

            await openApps(page);
            const grid = page.locator("[data-library-apps-grid]");
            const windowTiles = grid.locator(".launcher-tile[data-tile-id]");
            await windowTiles.first().waitFor();
            assertEquals(await order(windowTiles), [
                last,
                hidden,
                first,
                `folder:${folder}`,
            ]);
            await openMenu(grid.locator(`[data-tile-id="${first}"]`));
            await choose("上移");
            assertEquals(await order(windowTiles), [
                last,
                first,
                hidden,
                `folder:${folder}`,
            ]);
            await page.reload();
            await windowTiles.first().waitFor();
            assertEquals(await order(windowTiles), [
                last,
                first,
                hidden,
                `folder:${folder}`,
            ]);

            await grid.locator(
                `[data-folder-id="${folder}"] .launcher-folder-background`,
            ).click();
            const members = grid.locator(".launcher-tile[data-tile-id]");
            await members.first().waitFor();
            await openMenu(grid.locator(`[data-tile-id="${memberA}"]`));
            assert(
                await page.getByRole("menuitem", { name: "下移", exact: true })
                    .isDisabled(),
            );
            await choose("上移");
            assertEquals(await order(members), [memberA, memberB]);
            await page.reload();
            await grid.locator(
                `[data-folder-id="${folder}"] .launcher-folder-background`,
            ).click();
            await members.first().waitFor();
            assertEquals(await order(members), [memberA, memberB]);
        } finally {
            await context.close();
        }
    }
});
