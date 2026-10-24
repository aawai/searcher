import { assertEquals, assertStringIncludes } from "@std/assert";
import { type Locator, type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";
import { openMoreApps } from "./helpers/app-library.ts";
import { closeLibrary } from "./helpers/library.ts";
import { assertLargeFolderGeometry } from "./helpers/launcher-geometry.ts";

interface ServerApp {
    id: string;
    groupId: string | null;
    sortOrder: number;
}

// Run with: NODE_ENV=test deno test -A web/e2e/launcher.test.ts
// The home page is the app library (#244): folders open in a popup, layout
// changes happen in 整理 mode on home.
Deno.test("production launcher contracts - Issue #47 / #244", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({ prefix: "searcher_launcher_" });
    cleanup.defer(() => Deno.remove(files, { recursive: true }));
    const store = openDatabase(":memory:");
    cleanup.defer(() => store.close());
    await migrateDatabase(store);

    const server = Deno.serve(
        { hostname: "127.0.0.1", port: 0, onListen() {} },
        (request) => app.fetch(request),
    );
    cleanup.defer(() => server.shutdown());
    const origin = `http://127.0.0.1:${server.addr.port}`;
    const auth = new AuthService({ store, origin });
    const app = createApp({
        store,
        auth,
        origin,
        settings: new SystemSettingsStore(":memory:"),
        wallpaper: new WallpaperService(`${files}/wallpapers`),
        icons: new WebAppIconService(`${files}/icons`),
    });

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({ colorScheme: "light" });
    // Launcher interactions must not depend on real website/DNS backfill.
    await context.route(
        "**/api/webapps/*/fetch-icon",
        (route) => route.abort(),
    );
    const page = await context.newPage();

    const username = "launcher_user_47";
    const password = "Launcher-Password-47!";

    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor();
    }

    async function showHome(target: Page = page) {
        await visit("/", target);
        await target.locator(".launcher-grid--home").waitFor();
    }

    await visit("/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Launcher Tester");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main.home").waitFor({ state: "visible" });
    await page.setViewportSize({ width: 1280, height: 800 });

    async function apiRequest(
        endpoint: string,
        method = "GET",
        body?: unknown,
    ) {
        return await page.evaluate(
            async ({ endpoint, method, body }) => {
                const res = await fetch(endpoint, {
                    method,
                    headers: { "content-type": "application/json" },
                    body: body ? JSON.stringify(body) : undefined,
                });
                const json = await res.json();
                return {
                    status: res.status,
                    data: (json && typeof json === "object" && "data" in json)
                        ? json.data
                        : json,
                };
            },
            { endpoint, method, body },
        );
    }

    async function settlePresentation(targetPage: Page = page) {
        await targetPage.evaluate(async () => {
            await document.fonts.ready;
        });
        // Transitions can be replaced or cancelled while a popup closes.
        // Poll the live animation set instead of rejecting a cancelled finished
        // promise, and bound the wait if the presentation never settles.
        await targetPage.waitForFunction(
            () =>
                document.getAnimations().every((animation) =>
                    !Number.isFinite(
                        animation.effect?.getComputedTiming().endTime,
                    ) ||
                    (animation.playState !== "running" && !animation.pending)
                ),
            undefined,
            { timeout: 5000 },
        );
        await targetPage.evaluate(async () => {
            for (let frame = 0; frame < 2; frame++) {
                const { promise, resolve } = Promise.withResolvers<number>();
                requestAnimationFrame(resolve);
                await promise;
            }
        });
    }

    const homeGrid = page.locator(".launcher-grid--home");
    const homeTiles = page.locator(
        ".launcher-grid--home > .launcher-tile[data-tile-id]",
    );
    const popup = page.locator(".launcher-popup");
    const menu = page.locator('[data-slot="context-menu-content"]');
    const readTileIds = (scope: Locator) =>
        scope.evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("data-tile-id"))
        );
    const homeApp = (name: string) =>
        homeGrid.locator(".launcher-tile", {
            has: page.locator(".webapp-name", { hasText: name }),
        });
    const homeFolder = (name: string) =>
        homeGrid.locator(".launcher-folder-item", {
            has: page.locator(".launcher-folder-name", { hasText: name }),
        });

    /** A point on the blank part of an app grid surface (not on any tile). */
    async function blankPoint(scope: string, targetPage: Page = page) {
        await settlePresentation(targetPage);
        return await targetPage.evaluate((selector) => {
            const wrap = document.querySelector<HTMLElement>(
                `${selector} .launcher-surface-wrap`,
            );
            if (!wrap) throw new Error(`No library surface in ${selector}`);
            const rect = wrap.getBoundingClientRect();
            // Touch hit-testing is fuzzy: take the blank point farthest from
            // every tile, not merely the first one.
            const tiles = [...wrap.querySelectorAll(".launcher-tile")].map((
                el,
            ) => el.getBoundingClientRect());
            let best: { x: number; y: number; distance: number } | null = null;
            for (let y = rect.bottom - 3; y > rect.top; y -= 4) {
                for (let x = rect.left + 3; x < rect.right; x += 4) {
                    const hit = document.elementFromPoint(x, y);
                    if (
                        !hit || !wrap.contains(hit) ||
                        hit.closest(
                            ".launcher-tile, .launcher-app, .launcher-folder-item, .home-managing-bar, button",
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
                    if (!best || distance > best.distance) {
                        best = { x, y, distance };
                    }
                }
            }
            if (!best) {
                throw new Error(`No blank point on the surface in ${selector}`);
            }
            return { x: best.x, y: best.y };
        }, scope);
    }

    async function openBlankMenu(
        scope = ".launcher-library",
        targetPage: Page = page,
    ) {
        const { x, y } = await blankPoint(scope, targetPage);
        await targetPage.mouse.click(x, y, { button: "right" });
        const content = targetPage.locator(
            '[data-slot="context-menu-content"]',
        );
        await content.waitFor();
        await targetPage.waitForFunction(() =>
            document.querySelector('[data-slot="context-menu-content"]')
                ?.contains(document.activeElement)
        );
        return content;
    }

    async function blankMenuItem(name: string, scope = ".launcher-library") {
        const content = await openBlankMenu(scope);
        await content.getByRole("menuitem", { name, exact: true }).click();
        await content.waitFor({ state: "detached" });
    }

    const enterArranging = () => blankMenuItem("整理布局");
    const exitArranging = () => blankMenuItem("完成整理");

    async function dragTo(
        source: Locator,
        target: Locator,
        waitFor: () => Promise<unknown>,
    ) {
        const a = (await source.boundingBox())!;
        const b = (await target.boundingBox())!;
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(
            a.x + a.width / 2 + 15,
            a.y + a.height / 2 + 15,
        );
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await waitFor();
    }

    async function serverRoot() {
        const apps = (await apiRequest("/api/webapps")).data as ServerApp[];
        const groups = (await apiRequest("/api/webapp-groups"))
            .data as Array<{ id: string; sortOrder: number }>;
        return [
            ...apps.filter((item) => !item.groupId).map((item) => ({
                id: item.id,
                rank: item.sortOrder,
            })),
            ...groups.map((item) => ({
                id: "folder:" + item.id,
                rank: item.sortOrder,
            })),
        ].sort((a, b) => a.rank - b.rank);
    }

    await t.step(
        "0. Empty library: only the add cell; blank menu still offers folder and arrange",
        async () => {
            assertEquals(await homeTiles.count(), 0);
            assertEquals(
                await homeGrid.locator('[data-library-cell="add"]').count(),
                1,
            );
            const content = await openBlankMenu();
            for (const name of ["新建文件夹", "整理布局"]) {
                assertEquals(
                    await content.getByRole("menuitem", { name, exact: true })
                        .count(),
                    1,
                    name,
                );
            }
            await page.keyboard.press("Escape");
            await content.waitFor({ state: "detached" });
        },
    );

    // Seed test data: 2 folders, 3 apps (1 in folder, 2 loose)
    const { data: group1 } = await apiRequest("/api/webapp-groups", "POST", {
        name: "Dev Tools",
        sortOrder: 0,
        folderSize: "small",
        isHomeFixed: true,
    });
    await apiRequest("/api/webapp-groups", "POST", {
        name: "Empty Folder",
        sortOrder: 1,
        folderSize: "small",
        isHomeFixed: true,
    });
    const { data: appGitHub } = await apiRequest("/api/webapps", "POST", {
        name: "GitHub",
        url: "https://github.com",
        sortOrder: 0,
        isHomeFixed: true,
    });
    const { data: appLinear } = await apiRequest("/api/webapps", "POST", {
        name: "Linear",
        url: "https://linear.app",
        sortOrder: 1,
        isHomeFixed: true,
    });
    const { data: appGitLab } = await apiRequest("/api/webapps", "POST", {
        name: "GitLab",
        url: "https://gitlab.com",
        groupId: group1.id,
        sortOrder: 0,
    });
    await showHome();

    await t.step(
        "1. Home shows loose apps and folders; folder members stay inside their folder",
        async () => {
            assertEquals(
                await page.locator('[data-workspace="apps"]').count(),
                0,
            );
            const rootAppNames = await homeGrid.locator(
                ".launcher-tile .webapp-name",
            ).allTextContents();
            assertEquals(rootAppNames.includes("GitHub"), true);
            assertEquals(rootAppNames.includes("Linear"), true);
            assertEquals(rootAppNames.includes("GitLab"), false);
            const folderNames = await homeGrid.locator(
                ".launcher-folder-name",
            ).allTextContents();
            assertEquals(folderNames.includes("Dev Tools"), true);
            assertEquals(folderNames.includes("Empty Folder"), true);
            assertEquals(
                await homeGrid.locator('[data-library-cell="add"]').count(),
                1,
            );
            assertEquals(
                await homeGrid.locator('[data-library-cell="more"]').count(),
                0,
            );
        },
    );

    await t.step(
        "2. Folder opens in a popup over home; Escape and close button restore focus to the folder",
        async () => {
            const folder = homeFolder("Dev Tools");
            await folder.click();
            await popup.waitFor();
            assertEquals(page.url(), origin + "/");
            const dialog = page.getByRole("dialog", {
                name: "Dev Tools",
                exact: true,
            });
            await dialog.waitFor();
            assertEquals(
                await popup.locator(".launcher-popup-count").textContent(),
                "1 个应用",
            );
            assertEquals(
                await popup.locator(".webapp-name").allTextContents(),
                ["GitLab"],
            );
            await page.keyboard.press("Escape");
            await popup.waitFor({ state: "detached" });
            await page.waitForFunction(
                (id) =>
                    document.querySelector(`[data-folder-id="${id}"]`)
                        ?.contains(document.activeElement) === true,
                group1.id,
            );

            await folder.click();
            await popup.waitFor();
            await popup.getByRole("button", { name: "关闭", exact: true })
                .click();
            await popup.waitFor({ state: "detached" });
            await page.waitForFunction(
                (id) =>
                    document.querySelector(`[data-folder-id="${id}"]`)
                        ?.contains(document.activeElement) === true,
                group1.id,
            );
        },
    );

    await t.step(
        "2b. Opening a folder popup moves keyboard focus into it",
        async () => {
            await homeFolder("Dev Tools").click();
            try {
                await page.waitForFunction(() =>
                    document.querySelector(".launcher-popup")
                        ?.contains(document.activeElement) === true
                );
            } finally {
                await page.keyboard.press("Escape");
                await popup.waitFor({ state: "detached" });
            }
        },
    );

    await t.step(
        "3. Blank menu creates folders; 整理 mode disables 新建文件夹 and hides the add cell",
        async () => {
            const createFolder = async (name: string) => {
                await blankMenuItem("新建文件夹");
                const dialog = page.getByRole("dialog", {
                    name: "新建文件夹",
                    exact: true,
                });
                await dialog.waitFor();
                const input = dialog.locator("#folder-name-input");
                const submit = dialog.locator('button[type="submit"]');
                await input.fill("   ");
                assertEquals(await submit.isDisabled(), true);
                await input.fill(name);
                await submit.click();
                await dialog.waitFor({ state: "detached" });
                await homeFolder(name).waitFor();
            };
            await createFolder("Social Media");
            await createFolder("Productivity");

            await enterArranging();
            await page.locator(".home-managing-bar").waitFor();
            const arranging = await openBlankMenu();
            assertEquals(
                await arranging.getByRole("menuitem", {
                    name: "完成整理",
                    exact: true,
                }).count(),
                1,
            );
            assertEquals(
                await arranging.getByRole("menuitem", {
                    name: "新建文件夹",
                    exact: true,
                }).isDisabled(),
                true,
            );
            await page.keyboard.press("Escape");
            await arranging.waitFor({ state: "detached" });
            await exitArranging();
            await page.locator(".home-managing-bar").waitFor({
                state: "detached",
            });
        },
    );

    await t.step(
        "3b. 整理 mode hides the add cell; it returns after finishing",
        async () => {
            assertEquals(
                await homeGrid.locator('[data-library-cell="add"]').count(),
                1,
            );
            await enterArranging();
            try {
                await page.locator(".home-managing-bar").waitFor();
                assertEquals(
                    await homeGrid.locator('[data-library-cell="add"]')
                        .count(),
                    0,
                );
            } finally {
                await exitArranging();
            }
            await homeGrid.locator('[data-library-cell="add"]').waitFor();
        },
    );

    await t.step(
        "4. Folder context actions: resize, rename, delete with confirmation",
        async () => {
            const folder = homeFolder("Productivity");
            await folder.click({ button: "right" });
            await menu.waitFor();
            // Folder menu carries folder actions only.
            for (const name of ["整理布局", "完成整理", "新建文件夹"]) {
                assertEquals(
                    await menu.getByRole("menuitem", { name, exact: true })
                        .count(),
                    0,
                    name,
                );
            }
            await menu.getByRole("menuitem", {
                name: "显示为大文件夹",
                exact: true,
            }).click();
            await menu.waitFor({ state: "detached" });
            await page.locator(".launcher-folder-item--large").waitFor();
            await assertLargeFolderGeometry(
                homeGrid.locator(".launcher-tile", {
                    has: page.locator(".launcher-folder-item--large"),
                }),
                true,
            );

            await folder.click({ button: "right" });
            await menu.getByRole("menuitem", { name: "重命名", exact: true })
                .click();
            const dialog = page.getByRole("dialog", {
                name: "重命名文件夹",
                exact: true,
            });
            await dialog.waitFor();
            const input = dialog.locator("#folder-name-input");
            assertEquals(await input.inputValue(), "Productivity");
            await input.fill("Office Suite");
            await dialog.locator('button[type="submit"]').click();
            await dialog.waitFor({ state: "detached" });
            await homeFolder("Office Suite").waitFor();

            await homeFolder("Office Suite").click({ button: "right" });
            await menu.getByRole("menuitem", {
                name: "删除文件夹",
                exact: true,
            }).click();
            const alert = page.locator('[data-slot="alert-dialog-content"]');
            await alert.waitFor();
            await alert.locator('button[data-slot="alert-dialog-action"]')
                .click();
            await alert.waitFor({ state: "detached" });
            await homeFolder("Office Suite").waitFor({ state: "detached" });
        },
    );

    await t.step(
        "5. Search suggestions list apps once and open a matching folder on home",
        async () => {
            const search = page.getByPlaceholder("搜索或输入网址");
            await search.fill("git");
            const items = page.locator(".suggestion-item .suggestion-text");
            await items.filter({ hasText: "GitLab" }).first().waitFor();
            const texts = await items.allTextContents();
            assertEquals(texts.filter((text) => text === "GitHub").length, 1);
            assertEquals(texts.filter((text) => text === "GitLab").length, 1);

            await search.fill("Dev To");
            await page.locator(".suggestion-item", {
                hasText: "文件夹",
            }).filter({ hasText: "Dev Tools" }).click();
            await popup.waitFor();
            assertEquals(
                await popup.locator(".launcher-popup-title").textContent(),
                "Dev Tools",
            );
            await page.keyboard.press("Escape");
            await popup.waitFor({ state: "detached" });
            await search.fill("");
            // Empty focused search now offers desktop/notes quick entries.
            // Dismiss them before returning to pointer interactions on home.
            await search.press("Escape");
            await page.getByRole("listbox", { name: "搜索建议" }).waitFor({
                state: "hidden",
            });
        },
    );

    await t.step(
        "6. App menu moves an app into a folder and back out",
        async () => {
            await homeApp("GitHub").locator(".launcher-app").click({
                button: "right",
            });
            await menu.waitFor();
            // App menu has no folder-creation entry.
            assertEquals(
                await menu.getByRole("menuitem", {
                    name: "新建文件夹",
                    exact: true,
                }).count(),
                0,
            );
            await menu.getByRole("menuitem", {
                name: "移至文件夹 Dev Tools",
                exact: true,
            }).click();
            await homeApp("GitHub").waitFor({ state: "detached" });

            await homeFolder("Dev Tools").click();
            await popup.waitFor();
            assertEquals(
                (await popup.locator(".webapp-name").allTextContents())
                    .includes("GitHub"),
                true,
            );
            await popup.locator(".launcher-app", {
                has: page.locator(".webapp-name", { hasText: "GitHub" }),
            }).click({ button: "right" });
            await menu.getByRole("menuitem", {
                name: "移出文件夹",
                exact: true,
            }).click();
            await popup.locator(".launcher-app", {
                has: page.locator(".webapp-name", { hasText: "GitHub" }),
            }).waitFor({ state: "detached" });
            await page.keyboard.press("Escape");
            await popup.waitFor({ state: "detached" });
            await homeApp("GitHub").waitFor();
        },
    );

    await t.step(
        "7. App -> folder pointer drop: drop-target feedback and failure rollback",
        async () => {
            await enterArranging();
            await page.route("**/api/webapps/*", (route) => {
                if (route.request().method() === "PATCH") {
                    void route.fulfill({
                        status: 500,
                        contentType: "application/json",
                        body: JSON.stringify({
                            code: 500,
                            message: "Simulated DnD move network failure",
                        }),
                    });
                } else {
                    void route.continue();
                }
            });
            await dragTo(
                homeApp("Linear"),
                homeGrid.locator(`[data-folder-id="${group1.id}"]`).first(),
                async () => {
                    await homeGrid.locator(
                        ".launcher-tile.is-folder-drop-target",
                    )
                        .waitFor();
                    await page.locator(".launcher-folder-drop-badge")
                        .first().waitFor();
                },
            );
            await page.mouse.up();

            const banner = page.getByRole("alert").filter({
                hasText: "排列保存失败",
            });
            await banner.waitFor();
            assertStringIncludes(
                await banner.textContent() ?? "",
                "Simulated DnD move network failure",
            );
            // Rollback: Linear is back on root and the server never moved it.
            await homeApp("Linear").waitFor();
            await page.unroute("**/api/webapps/*");
            await banner.getByRole("button", { name: "关闭", exact: true })
                .click();
            await banner.waitFor({ state: "detached" });
            await exitArranging();

            await showHome();
            const serverApps = (await apiRequest("/api/webapps"))
                .data as ServerApp[];
            assertEquals(
                serverApps.find((item) => item.id === appLinear.id)?.groupId,
                null,
            );
        },
    );

    await t.step(
        "8. App -> folder pointer drop: success persists across reload",
        async () => {
            await enterArranging();
            await dragTo(
                homeApp("Linear"),
                homeGrid.locator(`[data-folder-id="${group1.id}"]`).first(),
                () =>
                    homeGrid.locator(".launcher-tile.is-folder-drop-target")
                        .waitFor(),
            );
            const saved = page.waitForResponse((response) =>
                new URL(response.url()).pathname ===
                    "/api/webapps/" + appLinear.id &&
                response.request().method() === "PATCH"
            );
            await page.mouse.up();
            assertEquals((await saved).status(), 200);
            await homeApp("Linear").waitFor({ state: "detached" });
            await exitArranging();

            await showHome();
            const serverApps = (await apiRequest("/api/webapps"))
                .data as ServerApp[];
            assertEquals(
                serverApps.find((item) => item.id === appLinear.id)?.groupId,
                group1.id,
            );
        },
    );

    await t.step(
        "9. Folder popup reorder changes only member order",
        async () => {
            const before = (await apiRequest("/api/webapps"))
                .data as ServerApp[];
            await homeFolder("Dev Tools").click();
            await popup.waitFor();
            const members = popup.locator(".launcher-tile[data-tile-id]");
            assertEquals(await readTileIds(members), [
                appGitLab.id,
                appLinear.id,
            ]);
            // The app menu toggles 整理 mode from inside the popup.
            await popup.locator(".launcher-app", {
                has: page.locator(".webapp-name", { hasText: "Linear" }),
            }).click({ button: "right" });
            await menu.getByRole("menuitem", {
                name: "整理布局",
                exact: true,
            }).click();
            await popup.locator(".launcher-tile.is-managing").first()
                .waitFor();

            await dragTo(
                members.nth(1),
                members.nth(0),
                () => members.nth(0).locator(".webapp-icon").waitFor(),
            );
            const saved = page.waitForResponse((response) =>
                new URL(response.url()).pathname === "/api/webapps/reorder" &&
                response.request().method() === "PUT"
            );
            await page.mouse.up();
            assertEquals((await saved).status(), 200);
            assertEquals(await readTileIds(members), [
                appLinear.id,
                appGitLab.id,
            ]);

            await popup.locator(".launcher-app").first().click({
                button: "right",
            });
            await menu.getByRole("menuitem", {
                name: "完成整理",
                exact: true,
            }).click();
            await page.keyboard.press("Escape");
            await popup.waitFor({ state: "detached" });
            await page.locator(".home-managing-bar").waitFor({
                state: "detached",
            });

            await showHome();
            const after = (await apiRequest("/api/webapps"))
                .data as ServerApp[];
            assertEquals(
                after.filter((item) => item.groupId === group1.id).sort((
                    a,
                    b,
                ) => a.sortOrder - b.sortOrder).map((item) => item.id),
                [appLinear.id, appGitLab.id],
            );
            const rootRanks = (items: ServerApp[]) =>
                items.filter((item) => item.groupId !== group1.id).map((
                    item,
                ) => ({ id: item.id, sortOrder: item.sortOrder })).sort((
                    a,
                    b,
                ) => a.id.localeCompare(b.id));
            assertEquals(rootRanks(after), rootRanks(before));
        },
    );

    await t.step(
        "10. 整理 mode arrow keys move a tile in visual order and persist atomically",
        async () => {
            await enterArranging();
            const before = await readTileIds(homeTiles);
            assertEquals(before.length >= 2, true);
            const expected = [before[1], before[0], ...before.slice(2)];
            await homeTiles.first().locator("button").first().focus();
            const persisted = page.waitForResponse((response) =>
                new URL(response.url()).pathname === "/api/webapps/reorder" &&
                response.request().method() === "PUT"
            );
            await page.keyboard.press("ArrowRight");
            assertEquals((await persisted).status(), 200);
            assertEquals(await readTileIds(homeTiles), expected);
            await exitArranging();

            await showHome();
            assertEquals(await readTileIds(homeTiles), expected);
            const root = await serverRoot();
            assertEquals(root.map((item) => item.id), expected);
            assertEquals(
                root.map((item) => item.rank),
                expected.map((_, index) => index),
            );
        },
    );

    await t.step(
        "11. Folder across app preserves mixed order on reload",
        async () => {
            await showHome();
            await enterArranging();
            const before = await readTileIds(homeTiles);
            const expected = [...before];
            const from = before.indexOf("folder:" + group1.id);
            const to = before.indexOf(appGitHub.id);
            assertEquals(from >= 0 && to >= 0, true);
            expected.splice(to, 0, ...expected.splice(from, 1));
            const target = homeGrid.locator(
                `.launcher-tile[data-tile-id="${appGitHub.id}"]`,
            );
            await dragTo(
                homeGrid.locator(
                    `.launcher-tile[data-tile-id="folder:${group1.id}"]`,
                ),
                target,
                () =>
                    target.locator(
                        "xpath=self::*[contains(@class,'is-over')]",
                    ).waitFor(),
            );
            const saved = page.waitForResponse((response) =>
                new URL(response.url()).pathname ===
                    "/api/webapps/reorder" &&
                response.request().method() === "PUT"
            );
            await page.mouse.up();
            assertEquals((await saved).status(), 200);
            assertEquals(await readTileIds(homeTiles), expected);
            await showHome();
            assertEquals(await readTileIds(homeTiles), expected);
            assertEquals(
                (await serverRoot()).map((item) => item.id),
                expected,
            );
        },
    );

    await t.step(
        "12. 更多（N） opens the library app view instead of a popup",
        async () => {
            // Enough pinned root tiles to overflow one row at 1280x440.
            for (let index = 1; index <= 8; index++) {
                const added = await apiRequest("/api/webapps", "POST", {
                    name: `Overflow ${index}`,
                    url: `https://example.org/overflow-${index}`,
                    sortOrder: 100 + index,
                    isHomeFixed: true,
                });
                assertEquals(added.status, 200);
            }
            await page.setViewportSize({ width: 1280, height: 440 });
            await showHome();
            const more = homeGrid.locator('[data-library-cell="more"]');
            await more.waitFor();
            const total = (await serverRoot()).length;
            const shown = await homeTiles.count();
            assertEquals(
                await more.getAttribute("aria-label"),
                `更多（${total - shown}）`,
            );
            assertEquals(
                await homeGrid.locator('[data-library-cell="add"]').count(),
                0,
            );
            const library = await openMoreApps(page, more);
            await library.getByText("全部应用", { exact: true }).waitFor();
            assertEquals(
                await library.locator(
                    "[data-library-apps-grid] > :is(.launcher-app, .launcher-folder-item)",
                ).count(),
                total,
            );
            assertEquals(
                await page.locator("[data-library]").getByRole("button", {
                    name: "添加应用",
                    exact: true,
                }).count(),
                1,
            );
            await closeLibrary(page);
            await page.setViewportSize({ width: 1280, height: 800 });
            await showHome();
        },
    );

    await t.step(
        "13. Real touch drag moves an app into a folder; long press and swipe on blank surface behave",
        async () => {
            const touchContext = await browser.newContext({
                viewport: { width: 390, height: 844 },
                hasTouch: true,
                isMobile: true,
                storageState: await context.storageState(),
            });
            await touchContext.route(
                "**/api/webapps/*/fetch-icon",
                (route) => route.abort(),
            );
            try {
                const touchPage = await touchContext.newPage();
                await showHome(touchPage);
                await settlePresentation(touchPage);
                const touchGrid = touchPage.locator(".launcher-grid--home");
                const touchMenu = touchPage.locator(
                    '[data-slot="context-menu-content"]',
                );
                const cdp = await touchContext.newCDPSession(touchPage);
                const blank = await blankPoint(".launcher-library", touchPage);

                // 13a. A touch that moves before the long-press delay scrolls and
                // must not open the menu. The 600ms wait is the long-press window.
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchStart",
                    touchPoints: [{ x: blank.x, y: blank.y, id: 1 }],
                });
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchMove",
                    touchPoints: [{ x: blank.x, y: blank.y - 30, id: 1 }],
                });
                await touchPage.waitForTimeout(600);
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchEnd",
                    touchPoints: [],
                });
                assertEquals(await touchMenu.count(), 0);

                // 13b. Long press on the blank surface opens the surface menu.
                // The swipe above may have scrolled the page: measure again.
                const pressPoint = await blankPoint(
                    ".launcher-library",
                    touchPage,
                );
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchStart",
                    touchPoints: [{ x: pressPoint.x, y: pressPoint.y, id: 2 }],
                });
                await touchMenu.waitFor();
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchEnd",
                    touchPoints: [],
                });
                for (const name of ["新建文件夹", "整理布局"]) {
                    assertEquals(
                        await touchMenu.getByRole("menuitem", {
                            name,
                            exact: true,
                        }).count(),
                        1,
                        name,
                    );
                }
                await touchMenu.getByRole("menuitem", {
                    name: "整理布局",
                    exact: true,
                }).click();
                await touchMenu.waitFor({ state: "detached" });

                const folder =
                    ((await apiRequest("/api/webapp-groups")).data as Array<
                        { id: string; name: string }
                    >).find((item) => item.name === "Empty Folder")!;
                const source = touchGrid.locator(
                    `.launcher-tile[data-tile-id="${appGitHub.id}"]`,
                );
                const target = touchGrid.locator(
                    `.launcher-tile[data-tile-id="folder:${folder.id}"]`,
                );
                await settlePresentation(touchPage);
                const a = (await source.boundingBox())!;
                const b = (await target.boundingBox())!;
                assertEquals([a.width, a.height], [68, 68]);
                assertEquals([b.width, b.height], [68, 68]);
                const point = (x: number, y: number) => [{ x, y, id: 1 }];
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchStart",
                    touchPoints: point(a.x + a.width / 2, a.y + a.height / 2),
                });
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchMove",
                    touchPoints: point(
                        a.x + a.width / 2 + 12,
                        a.y + a.height / 2 + 12,
                    ),
                });
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchMove",
                    touchPoints: point(b.x + b.width / 2, b.y + b.height / 2),
                });
                await touchPage.locator(".launcher-folder-drop-badge").first()
                    .waitFor();
                const overlay = touchPage.locator(".launcher-overlay");
                await overlay.waitFor();
                const overlayBox = (await overlay.boundingBox())!;
                assertEquals([overlayBox.width, overlayBox.height], [68, 68]);
                assertEquals(
                    Math.abs(
                        overlayBox.x + overlayBox.width / 2 -
                            (b.x + b.width / 2),
                    ) < 1,
                    true,
                );
                assertEquals(
                    Math.abs(
                        overlayBox.y + overlayBox.height / 2 -
                            (b.y + b.height / 2),
                    ) < 1,
                    true,
                );
                const saved = touchPage.waitForResponse((response) =>
                    new URL(response.url()).pathname ===
                        "/api/webapps/" + appGitHub.id &&
                    response.request().method() === "PATCH"
                );
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchEnd",
                    touchPoints: [],
                });
                assertEquals((await saved).status(), 200);
                const apps = (await apiRequest("/api/webapps"))
                    .data as ServerApp[];
                assertEquals(
                    apps.find((item) => item.id === appGitHub.id)?.groupId,
                    folder.id,
                );
                await touchPage.locator(".launcher-drag-overlay").waitFor({
                    state: "detached",
                });
                // dnd-kit keeps a click blocker for 50ms after pointerup,
                // even if removing the source skips its drop animation.
                // Use a normal-duration press so release clears that window;
                // do not force or re-send a click that was swallowed.
                await touchPage.getByRole("button", {
                    name: "完成",
                    exact: true,
                }).click({ delay: 60 });
                await touchPage.locator(".home-managing-bar").waitFor({
                    state: "detached",
                });
                await settlePresentation(touchPage);

                // 13c. Long press on a tile opens that tile's own menu, never
                // the surface menu, and does not navigate or open the folder.
                for (
                    const [selector, item] of [
                        [".launcher-app", "编辑"],
                        [
                            ".launcher-folder-item--small, .launcher-folder-item--large",
                            "打开文件夹",
                        ],
                    ] as const
                ) {
                    const bounds = (await touchGrid.locator(selector).first()
                        .boundingBox())!;
                    await cdp.send("Input.dispatchTouchEvent", {
                        type: "touchStart",
                        touchPoints: [{
                            x: bounds.x + bounds.width / 2,
                            y: bounds.y + bounds.height / 2,
                            id: 4,
                        }],
                    });
                    await touchMenu.waitFor();
                    await cdp.send("Input.dispatchTouchEvent", {
                        type: "touchEnd",
                        touchPoints: [],
                    });
                    assertEquals(
                        await touchMenu.getByRole("menuitem", {
                            name: item,
                            exact: true,
                        }).count(),
                        1,
                        item,
                    );
                    assertEquals(
                        await touchMenu.getByRole("menuitem", {
                            name: "新建文件夹",
                            exact: true,
                        }).count(),
                        0,
                    );
                    assertEquals(touchPage.url(), origin + "/");
                    assertEquals(
                        await touchPage.locator(".launcher-popup").count(),
                        0,
                    );
                    await touchPage.keyboard.press("Escape");
                    await touchMenu.waitFor({ state: "detached" });
                }
            } finally {
                await touchContext.close();
            }
        },
    );
});
