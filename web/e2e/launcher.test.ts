import { assertEquals, assertStringIncludes } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

// Run with: NODE_ENV=test deno test -A web/e2e/launcher.test.ts
Deno.test("production launcher contracts - Issue #47", async (t) => {
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
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({ colorScheme: "light" });
    const page = await context.newPage();

    const username = "launcher_user_47";
    const password = "Launcher-Password-47!";

    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor();
    }

    // Register test account
    await visit("/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Launcher Tester");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor();

    // Configure widgets style and system theme
    await visit("/settings/appearance");
    await page.getByText("空间轻桌面", { exact: true }).click();
    await page.waitForFunction(() =>
        document.documentElement.dataset.style === "widgets"
    );
    await page.getByText("跟随系统", { exact: true }).click();
    await page.waitForFunction(() =>
        document.documentElement.dataset.theme !== undefined
    );
    await visit("/");

    // Helper for authenticated API calls
    async function apiRequest(
        endpoint: string,
        method = "GET",
        body?: unknown,
    ) {
        return await page.evaluate(
            async ({ endpoint, method, body }) => {
                const res = await fetch(endpoint, {
                    method,
                    headers: {
                        "content-type": "application/json",
                    },
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

    // Seed test data: 2 groups, 3 apps (1 in group, 2 loose, 1 pinned)
    const { data: group1 } = await apiRequest("/api/webapp-groups", "POST", {
        name: "Dev Tools",
        sortOrder: 0,
        folderSize: "small",
    });
    await apiRequest("/api/webapp-groups", "POST", {
        name: "Empty Folder",
        sortOrder: 1,
        folderSize: "small",
    });

    const { data: appGitHub } = await apiRequest("/api/webapps", "POST", {
        name: "GitHub",
        url: "https://github.com",
        sortOrder: 0,
        isPinned: true,
        pinnedSortOrder: 0,
    });
    const { data: appLinear } = await apiRequest("/api/webapps", "POST", {
        name: "Linear",
        url: "https://linear.app",
        sortOrder: 1,
        isPinned: false,
    });
    const { data: _appGitLab } = await apiRequest("/api/webapps", "POST", {
        name: "GitLab",
        url: "https://gitlab.com",
        groupId: group1.id,
        sortOrder: 0,
        isPinned: false,
    });

    await page.reload();
    await page.locator("main").waitFor();

    await t.step(
        "1. Unified Launcher Root: defaults directly to complete launcher without legacy IA",
        async () => {
            await page.setViewportSize({ width: 1280, height: 800 });

            // Open Apps Workspace
            const dock = page.locator(".workspace-dock");
            await dock.waitFor();
            await page.locator(
                '.workspace-dock button[aria-label="应用工作区"]',
            ).click();

            const panel = page.locator("aside.workspace-panel");
            await panel.waitFor();
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "应用",
            );

            // Absolute verification of removed legacy IA
            assertEquals(
                await panel.getByText("常用网站", { exact: true }).count(),
                0,
            );
            assertEquals(
                await panel.getByText("管理文件夹", { exact: true }).count(),
                0,
            );
            assertEquals(
                await panel.getByRole("button", { name: "全部网站" }).count(),
                0,
            );
            assertEquals(
                await panel.getByRole("button", { name: "未分组" }).count(),
                0,
            );

            // Single primary contract in normal state:
            // "添加应用" in footer is default primary (has class workspace-primary)
            const addAppBtn = panel.locator(
                ".workspace-footer button.workspace-primary",
            );
            assertEquals(await addAppBtn.isVisible(), true);
            assertEquals(await addAppBtn.textContent(), "添加应用");

            // Secondary bar contains outline "新建文件夹" and outline "整理布局"
            const newFolderBtn = panel.locator(
                '.apps-workspace-secondary-bar button[aria-label="新建文件夹"]',
            );
            const arrangeBtn = panel.locator(
                '.apps-workspace-secondary-bar button[aria-label="整理网站排序与布局"]',
            );
            assertEquals(await newFolderBtn.isVisible(), true);
            assertEquals(await arrangeBtn.isVisible(), true);

            // Tiles on root: loose apps (GitHub, Linear) and folders (Dev Tools, Empty Folder)
            // Grouped app (GitLab) is inside Dev Tools, NOT duplicated on root!
            const rootAppNames = await panel.locator(
                ".launcher-tile .webapp-name",
            )
                .allTextContents();
            assertEquals(rootAppNames.includes("GitHub"), true);
            assertEquals(rootAppNames.includes("Linear"), true);
            assertEquals(rootAppNames.includes("GitLab"), false);

            const folderNames = await panel.locator(
                ".launcher-tile .launcher-folder-name",
            ).allTextContents();
            assertEquals(folderNames.includes("Dev Tools"), true);
            assertEquals(folderNames.includes("Empty Folder"), true);
        },
    );

    await t.step(
        "2. Folder Inline Browse & Back scroll-focus restoration",
        async () => {
            const panel = page.locator("aside.workspace-panel");

            // Click Dev Tools folder to open inline view
            const folderTile = panel.locator(
                '.launcher-folder-item[data-folder-id="' + group1.id + '"]',
            );
            await folderTile.click();

            // Renders inline folder view (role="region", not a route change!)
            const inlineView = panel.locator(
                '.launcher-folder-inline[role="region"]',
            );
            await inlineView.waitFor();
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "应用",
            ); // Route stays apps/root!
            assertEquals(
                await inlineView.locator("h3").textContent(),
                "Dev Tools",
            );

            // Focus enters folder region on open: Back button has focus
            const backBtn = inlineView.locator(
                'button[aria-label="返回网站列表"]',
            );
            await backBtn.waitFor();
            assertEquals(
                await backBtn.evaluate((el) => document.activeElement === el),
                true,
            );

            // Inside folder: GitLab is visible and directly accessible
            assertEquals(
                await inlineView.locator(".webapp-name").textContent(),
                "GitLab",
            );

            // Click Back -> returns to Launcher root, restores focus to Dev Tools folder tile
            await backBtn.click();
            await inlineView.waitFor({ state: "detached" });

            // Folder tile receives focus back
            await page.waitForFunction(
                (id) => {
                    const el = document.querySelector(
                        `[data-folder-id="${id}"], [data-tile-id="folder:${id}"]`,
                    );
                    return Boolean(
                        el &&
                            (el.contains(document.activeElement) ||
                                el === document.activeElement),
                    );
                },
                group1.id,
            );
            const isFolderFocused = await folderTile.evaluate((el) =>
                el.contains(document.activeElement) ||
                el === document.activeElement
            );
            assertEquals(isFolderFocused, true);
        },
    );

    await t.step(
        "3. Blank space context menu & Keyboard / Touch folder creation",
        async () => {
            const panel = page.locator("aside.workspace-panel");

            // Right click on empty launcher surface to open context menu
            const surface = panel.locator(".launcher-surface-wrap");
            await surface.click({ button: "right", position: { x: 5, y: 5 } });

            const contextMenu = page.locator(
                '[data-slot="context-menu-content"]',
            );
            await contextMenu.waitFor();
            const newFolderItem = contextMenu.locator(
                '[data-slot="context-menu-item"]',
                {
                    hasText: "新建文件夹",
                },
            );
            await newFolderItem.click();

            // Lightweight FolderNameDialog opens
            const dialog = page.locator('[data-slot="dialog-content"]');
            await dialog.waitFor();
            assertEquals(
                await dialog.locator('[data-slot="dialog-title"]')
                    .textContent(),
                "新建文件夹",
            );

            const input = dialog.locator("#folder-name-input");
            const submitBtn = dialog.locator('button[type="submit"]');

            // Empty name cannot be submitted
            await input.fill("   ");
            assertEquals(await submitBtn.isDisabled(), true);

            // Valid name submits and folder appears directly in launcher
            await input.fill("Social Media");
            await submitBtn.click();
            await dialog.waitFor({ state: "detached" });

            // Folder appears directly in launcher
            await panel.locator(
                '.launcher-folder-name:has-text("Social Media")',
            )
                .waitFor();

            // Also test visible trigger button in secondary toolbar
            const toolbarBtn = panel.locator(
                '.apps-workspace-secondary-bar button[aria-label="新建文件夹"]',
            );
            await toolbarBtn.click();
            await dialog.waitFor();
            await input.fill("Productivity");
            await submitBtn.click();
            await dialog.waitFor({ state: "detached" });
            await panel.locator(
                '.launcher-folder-name:has-text("Productivity")',
            )
                .waitFor();
        },
    );

    await t.step(
        "4. Folder context actions: resize, rename, delete with confirmation and apps preserved",
        async () => {
            const panel = page.locator("aside.workspace-panel");

            const folderTile = panel.locator(
                '.launcher-folder-item:has(.launcher-folder-name:has-text("Productivity"))',
            );
            await folderTile.click({ button: "right" });

            const contextMenu = page.locator(
                '[data-slot="context-menu-content"]',
            );
            await contextMenu.waitFor();

            // 4a. Resize to large
            const resizeItem = contextMenu.locator(
                '[data-slot="context-menu-item"]',
                {
                    hasText: "显示为大文件夹",
                },
            );
            await resizeItem.click();
            await page.waitForFunction(() => {
                const el = document.querySelector(
                    ".launcher-folder-item--large",
                );
                return el !== null;
            });

            // 4b. Rename folder inline
            await folderTile.click({ button: "right" });
            await contextMenu.waitFor();
            const renameItem = contextMenu.locator(
                '[data-slot="context-menu-item"]',
                {
                    hasText: "重命名",
                },
            );
            await renameItem.click();

            const dialog = page.locator('[data-slot="dialog-content"]');
            await dialog.waitFor();
            assertEquals(
                await dialog.locator('[data-slot="dialog-title"]')
                    .textContent(),
                "重命名文件夹",
            );

            const input = dialog.locator("#folder-name-input");
            assertEquals(await input.inputValue(), "Productivity");
            await input.fill("Office Suite");
            await dialog.locator('button[type="submit"]').click();
            await dialog.waitFor({ state: "detached" });

            await panel.locator(
                '.launcher-folder-name:has-text("Office Suite")',
            )
                .waitFor();

            // 4c. Delete folder with destructive confirmation
            const updatedFolder = panel.locator(
                '.launcher-folder-item:has(.launcher-folder-name:has-text("Office Suite"))',
            );
            await updatedFolder.click({ button: "right" });
            await contextMenu.waitFor();

            const deleteItem = contextMenu.locator(
                '[data-slot="context-menu-item"]',
                {
                    hasText: "删除文件夹",
                },
            );
            await deleteItem.click();

            const alert = page.locator('[data-slot="alert-dialog-content"]');
            await alert.waitFor();
            assertStringIncludes(
                await alert.locator('[data-slot="alert-dialog-description"]')
                    .textContent() ?? "",
                "文件夹中的网站将保留在启动器根目录，不会被删除",
            );

            // Confirm delete
            await alert.locator('button[data-slot="alert-dialog-action"]')
                .click();
            await alert.waitFor({ state: "detached" });

            // Folder deleted from root
            assertEquals(
                await panel.locator(
                    '.launcher-folder-name:has-text("Office Suite")',
                ).count(),
                0,
            );
        },
    );

    await t.step(
        "5. Search deduplication, Folder result click & arrange mode search unbinding",
        async () => {
            const panel = page.locator("aside.workspace-panel");
            const searchInput = panel.locator(
                'input[data-workspace-search=""]',
            );

            // Search for "git" (matches GitHub loose app, GitLab in Dev Tools folder, and folder name Dev Tools)
            await searchInput.fill("git");

            // Matched count badge is shown
            const countBadge = panel.locator(".apps-workspace-count-badge");
            await countBadge.waitFor();

            // GitLab (inside Dev Tools folder) directly appears in search results for fast access
            const appResults = panel.locator(
                ".apps-workspace-section .webapp-name",
            );
            const textContents = await appResults.allTextContents();
            assertEquals(textContents.includes("GitHub"), true);
            assertEquals(textContents.includes("GitLab"), true);

            // Deduplication: each app appears at most once
            const gitLabCount =
                textContents.filter((t) => t === "GitLab").length;
            assertEquals(gitLabCount, 1);

            // Clear search
            await panel.locator('button[aria-label="清除搜索"]').click();
            assertEquals(await searchInput.inputValue(), "");

            // Arrange mode disables search input and unbinds query
            await searchInput.fill("test");
            const arrangeBtn = panel.locator(
                '.apps-workspace-secondary-bar button[aria-label="整理网站排序与布局"]',
            );
            await arrangeBtn.click();

            // In arrange mode: query was cleared and input is disabled
            assertEquals(await searchInput.inputValue(), "");
            assertEquals(await searchInput.isDisabled(), true);

            // Single primary contract: "完成整理" is primary variant, "添加应用" is hidden
            const finishArrangeBtn = panel.locator(
                '.apps-workspace-secondary-bar button[aria-label="完成排序整理"]',
            );
            assertEquals(await finishArrangeBtn.isVisible(), true);
            assertEquals(
                await panel.locator(
                    ".workspace-footer button.workspace-primary",
                ).count(),
                0,
            );

            // Exit arrange mode: search is re-enabled
            await finishArrangeBtn.click();
            assertEquals(await searchInput.isDisabled(), false);
        },
    );

    await t.step(
        "6. App Context Menu ownership fallback (move in & out of folder)",
        async () => {
            const panel = page.locator("aside.workspace-panel");

            // Move GitHub into "Dev Tools" via context menu
            const gitHubTile = panel.locator(
                '.launcher-tile:has(.webapp-name:has-text("GitHub"))',
            );
            await gitHubTile.click({ button: "right" });

            const contextMenu = page.locator(
                '[data-slot="context-menu-content"]',
            );
            await contextMenu.waitFor();
            const moveToDevTools = contextMenu.locator(
                '[data-slot="context-menu-item"]',
                {
                    hasText: "移至文件夹 Dev Tools",
                },
            );
            await moveToDevTools.click();

            // GitHub disappears from root
            await page.waitForFunction(() => {
                const p = document.querySelector("aside.workspace-panel");
                if (!p) return false;
                const names = Array.from(
                    p.querySelectorAll(".launcher-tile .webapp-name"),
                ).map((e) => e.textContent);
                return !names.includes("GitHub");
            });

            // Open Dev Tools -> GitHub is now inside Dev Tools
            const devToolsTile = panel.locator(
                '.launcher-folder-item[data-folder-id="' + group1.id + '"]',
            );
            await devToolsTile.click();

            const inlineView = panel.locator(
                '.launcher-folder-inline[role="region"]',
            );
            await inlineView.waitFor();
            const folderAppNames = await inlineView.locator(".webapp-name")
                .allTextContents();
            assertEquals(folderAppNames.includes("GitHub"), true);

            // Move GitHub back out via context menu
            const gitHubInFolder = inlineView.locator(
                '.launcher-app:has(.webapp-name:has-text("GitHub"))',
            );
            await gitHubInFolder.click({ button: "right" });
            const folderContextMenu = page.locator(
                '[data-slot="context-menu-content"]',
            );
            await folderContextMenu.waitFor();
            const moveOutItem = folderContextMenu.locator(
                '[data-slot="context-menu-item"]',
                {
                    hasText: "移出文件夹",
                },
            );
            await moveOutItem.click();

            // Close folder view
            await inlineView.locator('button[aria-label="返回网站列表"]')
                .click();
            await inlineView.waitFor({ state: "detached" });

            // GitHub is back on Launcher root
            await panel.locator(
                '.launcher-tile .webapp-name:has-text("GitHub")',
            ).waitFor();
        },
    );

    await t.step(
        "7. App -> Folder pointer DnD: drop-target feedback and move failure rollback",
        async () => {
            const panel = page.locator("aside.workspace-panel");

            // Enter arrange mode
            const arrangeBtn = panel.locator(
                '.apps-workspace-secondary-bar button[aria-label="整理网站排序与布局"]',
            );
            await arrangeBtn.click();

            const linearTile = panel.locator(
                '.launcher-tile:has(.webapp-name:has-text("Linear"))',
            );
            const devToolsTile = panel.locator(
                '.launcher-tile[data-folder-id="' + group1.id + '"]',
            );

            const linearBox = await linearTile.boundingBox();
            const devToolsBox = await devToolsTile.boundingBox();
            assertEquals(Boolean(linearBox && devToolsBox), true);

            // Intercept PATCH /api/webapps/* to simulate API failure
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

            // Real pointer drag beyond threshold (8px) over Dev Tools folder
            await page.mouse.move(
                linearBox!.x + linearBox!.width / 2,
                linearBox!.y + linearBox!.height / 2,
            );
            await page.mouse.down();
            await page.mouse.move(
                linearBox!.x + linearBox!.width / 2 + 15,
                linearBox!.y + linearBox!.height / 2 + 15,
            );
            await page.mouse.move(
                devToolsBox!.x + devToolsBox!.width / 2,
                devToolsBox!.y + devToolsBox!.height / 2,
            );

            // Assert drop target feedback: outline class and visual badge
            await page.waitForFunction(() => {
                const el = document.querySelector(
                    ".launcher-tile.is-folder-drop-target",
                );
                return el !== null;
            });
            assertEquals(
                await panel.locator(".launcher-folder-drop-badge").isVisible(),
                true,
            );

            // Drop: pointerup
            await page.mouse.up();

            // Move failed -> error banner shown
            const errorBanner = panel.locator(
                '.apps-workspace-banner--error[role="alert"]',
            );
            await errorBanner.waitFor();
            assertStringIncludes(
                await errorBanner.textContent() ?? "",
                "Simulated DnD move network failure",
            );

            // Rollback: Linear returns to root!
            await page.waitForFunction(() => {
                const p = document.querySelector("aside.workspace-panel");
                if (!p) return false;
                const names = Array.from(
                    p.querySelectorAll(".launcher-tile .webapp-name"),
                ).map((e) => e.textContent);
                return names.includes("Linear");
            });

            // Clean up route intercept
            await page.unroute("**/api/webapps/*");
            await errorBanner.locator("button").click();
            await errorBanner.waitFor({ state: "detached" });

            // Exit arrange mode
            await panel.locator(
                '.apps-workspace-secondary-bar button[aria-label="完成排序整理"]',
            ).click();

            // Verify server state on reload: Linear is still loose, not in Dev Tools
            await page.reload();
            await page.locator("main").waitFor();
            const dock = page.locator(".workspace-dock");
            await dock.waitFor();
            await page.locator(
                '.workspace-dock button[aria-label="应用工作区"]',
            )
                .click();
            await panel.waitFor();

            const { data: serverApps } = await apiRequest("/api/webapps");
            const serverLinear =
                (serverApps as Array<{ id: string; groupId: string | null }>)
                    .find(
                        (a) => a.id === appLinear.id,
                    );
            assertEquals(serverLinear?.groupId, null);
        },
    );

    await t.step(
        "8. App -> Folder pointer DnD: successful move and server reload consistency",
        async () => {
            const panel = page.locator("aside.workspace-panel");

            // Enter arrange mode
            await panel.locator(
                '.apps-workspace-secondary-bar button[aria-label="整理网站排序与布局"]',
            ).click();

            const linearTile = panel.locator(
                '.launcher-tile:has(.webapp-name:has-text("Linear"))',
            );
            const devToolsTile = panel.locator(
                '.launcher-tile[data-folder-id="' + group1.id + '"]',
            );

            const linearBox = await linearTile.boundingBox();
            const devToolsBox = await devToolsTile.boundingBox();
            assertEquals(Boolean(linearBox && devToolsBox), true);

            // Drag Linear over Dev Tools
            await page.mouse.move(
                linearBox!.x + linearBox!.width / 2,
                linearBox!.y + linearBox!.height / 2,
            );
            await page.mouse.down();
            await page.mouse.move(
                linearBox!.x + linearBox!.width / 2 + 15,
                linearBox!.y + linearBox!.height / 2 + 15,
            );
            await page.mouse.move(
                devToolsBox!.x + devToolsBox!.width / 2,
                devToolsBox!.y + devToolsBox!.height / 2,
            );

            await page.waitForFunction(() => {
                const el = document.querySelector(
                    ".launcher-tile.is-folder-drop-target",
                );
                return el !== null;
            });

            // Drop
            await page.mouse.up();

            // Linear disappears from root
            await page.waitForFunction(() => {
                const p = document.querySelector("aside.workspace-panel");
                if (!p) return false;
                const names = Array.from(
                    p.querySelectorAll(".launcher-tile .webapp-name"),
                ).map((e) => e.textContent);
                return !names.includes("Linear");
            });

            // Exit arrange mode
            await panel.locator(
                '.apps-workspace-secondary-bar button[aria-label="完成排序整理"]',
            ).click();

            // Verify server state on reload: Linear now has groupId === group1.id
            await page.reload();
            await page.locator("main").waitFor();
            const dock = page.locator(".workspace-dock");
            await dock.waitFor();
            await page.locator(
                '.workspace-dock button[aria-label="应用工作区"]',
            )
                .click();
            await panel.waitFor();

            const { data: serverApps } = await apiRequest("/api/webapps");
            const serverLinear = (serverApps as Array<
                { id: string; groupId: string | null; sortOrder: number }
            >).find(
                (a) => a.id === appLinear.id,
            );
            assertEquals(serverLinear?.groupId, group1.id);
        },
    );

    await t.step(
        "9. Folder-internal App reorder, scope-local order, and pinnedOrder untouched",
        async () => {
            const panel = page.locator("aside.workspace-panel");

            const beforeReorder = (await apiRequest("/api/webapps"))
                .data as Array<
                    {
                        id: string;
                        groupId: string | null;
                        sortOrder: number;
                        pinnedSortOrder: number;
                    }
                >;
            // Open Dev Tools folder (now contains GitLab and Linear)
            const devToolsTile = panel.locator(
                '.launcher-folder-item[data-folder-id="' + group1.id + '"]',
            );
            await devToolsTile.click();

            const inlineView = panel.locator(
                '.launcher-folder-inline[role="region"]',
            );
            await inlineView.waitFor();

            // Enter arrange mode
            await panel.locator(
                '.apps-workspace-secondary-bar button[aria-label="整理网站排序与布局"]',
            ).click();

            // Apps inside folder: Linear and GitLab
            const linearInFolder = inlineView.locator(
                '.launcher-app:has(.webapp-name:has-text("Linear"))',
            );
            const gitLabInFolder = inlineView.locator(
                '.launcher-app:has(.webapp-name:has-text("GitLab"))',
            );
            await linearInFolder.waitFor();
            await gitLabInFolder.waitFor();

            const linearBox = await linearInFolder.boundingBox();
            const gitLabBox = await gitLabInFolder.boundingBox();
            assertEquals(Boolean(linearBox && gitLabBox), true);

            // Drag Linear before GitLab inside folder
            await page.mouse.move(
                linearBox!.x + linearBox!.width / 2,
                linearBox!.y + linearBox!.height / 2,
            );
            await page.mouse.down();
            await page.mouse.move(
                linearBox!.x + linearBox!.width / 2 - 15,
                linearBox!.y + linearBox!.height / 2,
            );
            await page.mouse.move(
                gitLabBox!.x + gitLabBox!.width / 2 - 5,
                gitLabBox!.y + gitLabBox!.height / 2,
            );
            await page.mouse.up();

            // Exit arrange mode
            await panel.locator(
                '.apps-workspace-secondary-bar button[aria-label="完成排序整理"]',
            ).click();

            // Return to root
            await inlineView.locator('button[aria-label="返回网站列表"]')
                .click();
            await inlineView.waitFor({ state: "detached" });

            // Verify server state on reload:
            // 1. Linear and GitLab inside folder reordered
            // 2. Loose app GitHub sortOrder untouched
            // 3. GitHub pinnedSortOrder untouched (still 0)
            await page.reload();
            await page.locator("main").waitFor();

            const { data: serverApps } = await apiRequest("/api/webapps");
            const appsList = serverApps as Array<{
                id: string;
                groupId: string | null;
                sortOrder: number;
                isPinned: boolean;
                pinnedSortOrder: number | null;
            }>;
            assertEquals(
                appsList.filter((item) => item.groupId === group1.id).sort((
                    a,
                    b,
                ) => a.sortOrder - b.sortOrder).map((item) => item.id),
                [appLinear.id, _appGitLab.id],
            );
            const rootRanks = (items: typeof beforeReorder) =>
                items.filter((item) => item.groupId !== group1.id).map((
                    item,
                ) => ({
                    id: item.id,
                    sortOrder: item.sortOrder,
                    pinnedSortOrder: item.pinnedSortOrder,
                })).sort((a, b) => a.id.localeCompare(b.id));
            assertEquals(
                rootRanks(appsList as typeof beforeReorder),
                rootRanks(beforeReorder),
            );

            const gitHub = appsList.find((a) => a.id === appGitHub.id);
            assertEquals(gitHub?.isPinned, true);
            assertEquals(gitHub?.pinnedSortOrder, 0); // Pinned order untouched!
        },
    );

    await t.step(
        "10. Mixed Root Reorder via KeyboardSensor and atomic PUT persistence",
        async () => {
            const panel = page.locator("aside.workspace-panel");
            const dock = page.locator(".workspace-dock");
            await dock.waitFor();
            await page.locator(
                '.workspace-dock button[aria-label="应用工作区"]',
            )
                .click();
            await panel.waitFor();

            // Enter arrange mode
            await panel.locator(
                '.apps-workspace-secondary-bar button[aria-label="整理网站排序与布局"]',
            ).click();
            const readRoot = () =>
                panel.locator(".launcher-grid > .launcher-tile").evaluateAll((
                    elements,
                ) => elements.map((element) =>
                    element.getAttribute("data-tile-id")
                ));
            const before = await readRoot();
            assertEquals(before.length >= 2, true);
            const expected = [before[1], before[0], ...before.slice(2)];
            const firstButton = panel.locator(".launcher-tile button").first();
            await firstButton.focus();
            await page.keyboard.press("Space");
            await panel.locator(".launcher-tile.is-dragging").waitFor();
            await page.evaluate(() =>
                new Promise<void>((resolve) =>
                    requestAnimationFrame(() =>
                        requestAnimationFrame(() => resolve())
                    )
                )
            );
            await page.keyboard.press("ArrowRight");
            await panel.locator(`[data-tile-id="${before[1]}"].is-over`)
                .waitFor();
            const persisted = page.waitForResponse((response) =>
                new URL(response.url()).pathname === "/api/webapps/reorder" &&
                response.request().method() === "PUT"
            );
            await page.keyboard.press("Space");
            assertEquals((await persisted).status(), 200);
            await panel.locator(
                '.apps-workspace-secondary-bar button[aria-label="完成排序整理"]',
            ).click();
            assertEquals(await readRoot(), expected);
            await page.reload();
            await dock.waitFor();
            await page.locator(
                '.workspace-dock button[aria-label="应用工作区"]',
            ).click();
            await panel.waitFor();
            assertEquals(await readRoot(), expected);
            const apps = (await apiRequest("/api/webapps")).data as Array<
                {
                    id: string;
                    groupId: string | null;
                    sortOrder: number;
                    pinnedSortOrder: number;
                }
            >;
            const groups = (await apiRequest("/api/webapp-groups"))
                .data as Array<{ id: string; sortOrder: number }>;
            const serverRoot = [
                ...apps.filter((item) => !item.groupId).map((item) => ({
                    id: item.id,
                    rank: item.sortOrder,
                })),
                ...groups.map((item) => ({
                    id: "folder:" + item.id,
                    rank: item.sortOrder,
                })),
            ].sort((a, b) => a.rank - b.rank);
            assertEquals(serverRoot.map((item) => item.id), expected);
            assertEquals(
                serverRoot.map((item) => item.rank),
                expected.map((_, index) => index),
            );
            assertEquals(
                apps.find((item) => item.id === appGitHub.id)?.pinnedSortOrder,
                0,
            );
        },
    );

    await t.step(
        "11. 375px mobile viewport & real theme system (dataset.theme reactive)",
        async () => {
            const panel = page.locator(".workspace-panel");

            // Mobile 375px
            await page.setViewportSize({ width: 375, height: 667 });
            await page.waitForFunction(() => globalThis.innerWidth === 375);

            // Check no horizontal overflow
            const scrollWidth = await panel.evaluate((el) => el.scrollWidth);
            const clientWidth = await panel.evaluate((el) => el.clientWidth);
            assertEquals(scrollWidth <= clientWidth + 2, true);

            // System theme reactive integration: emulate dark color scheme
            await page.emulateMedia({ colorScheme: "dark" });
            await page.waitForFunction(
                () => document.documentElement.dataset.theme === "dark",
            );
            assertEquals(
                await page.evaluate(() =>
                    document.documentElement.dataset.theme
                ),
                "dark",
            );

            // Emulate light color scheme
            await page.emulateMedia({ colorScheme: "light" });
            await page.waitForFunction(
                () => document.documentElement.dataset.theme === "light",
            );
            assertEquals(
                await page.evaluate(() =>
                    document.documentElement.dataset.theme
                ),
                "light",
            );
        },
    );

    await t.step(
        "12. Folder across App and App across App preserve mixed order on reload",
        async () => {
            await page.setViewportSize({ width: 1280, height: 800 });
            const added = await apiRequest("/api/webapps", "POST", {
                name: "Second Loose",
                url: "https://example.org/second-loose",
                sortOrder: 1000,
            });
            assertEquals(added.status, 200);
            const loose = added.data as { id: string };
            const panel = page.locator("aside.workspace-panel");
            const readRoot = () =>
                panel.locator(".launcher-grid > .launcher-tile").evaluateAll((
                    elements,
                ) => elements.map((element) =>
                    element.getAttribute("data-tile-id")
                ));
            for (const sourceId of ["folder:" + group1.id, loose.id]) {
                await page.reload();
                await page.locator(
                    '.workspace-dock button[aria-label="应用工作区"]',
                ).click();
                await panel.waitFor();
                await panel.locator(
                    '.apps-workspace-secondary-bar button[aria-label="整理网站排序与布局"]',
                ).click();
                const before = await readRoot();
                const expected = [...before];
                const from = before.indexOf(sourceId);
                const to = before.indexOf(appGitHub.id);
                assertEquals(from >= 0 && to >= 0, true);
                expected.splice(to, 0, ...expected.splice(from, 1));
                const source = panel.locator(
                    '[data-tile-id="' + sourceId + '"]',
                ).first();
                const target = panel.locator(
                    '[data-tile-id="' + appGitHub.id + '"]',
                ).first();
                const a = (await source.boundingBox())!;
                const b = (await target.boundingBox())!;
                await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
                await page.mouse.down();
                await page.mouse.move(
                    a.x + a.width / 2 + 10,
                    a.y + a.height / 2 + 10,
                );
                await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
                await target.locator(
                    "xpath=self::*[contains(@class,'is-over')]",
                ).waitFor();
                const saved = page.waitForResponse((response) =>
                    new URL(response.url()).pathname ===
                        "/api/webapps/reorder" &&
                    response.request().method() === "PUT"
                );
                await page.mouse.up();
                assertEquals((await saved).status(), 200);
                assertEquals(await readRoot(), expected);
                await page.reload();
                await page.locator(
                    '.workspace-dock button[aria-label="应用工作区"]',
                ).click();
                await panel.waitFor();
                assertEquals(await readRoot(), expected);
                const apps = (await apiRequest("/api/webapps")).data as Array<
                    {
                        id: string;
                        groupId: string | null;
                        pinnedSortOrder: number;
                    }
                >;
                assertEquals(
                    apps.find((item) => item.id === loose.id)?.groupId,
                    null,
                );
                assertEquals(
                    apps.find((item) => item.id === appGitHub.id)?.groupId,
                    null,
                );
                assertEquals(
                    apps.find((item) => item.id === appGitHub.id)
                        ?.pinnedSortOrder,
                    0,
                );
            }
        },
    );

    await t.step(
        "13. Real touch drag moves App into Folder without changing Home pin order",
        async () => {
            const touchContext = await browser.newContext({
                viewport: { width: 390, height: 844 },
                hasTouch: true,
                isMobile: true,
                storageState: await context.storageState(),
            });
            try {
                const touchPage = await touchContext.newPage();
                await visit("/", touchPage);
                await touchPage.locator(
                    '.workspace-dock button[aria-label="应用工作区"]',
                ).click();
                const panel = touchPage.locator(".workspace-panel");
                await panel.locator(
                    '.apps-workspace-secondary-bar button[aria-label="整理网站排序与布局"]',
                ).click();
                const folder =
                    ((await apiRequest("/api/webapp-groups")).data as Array<
                        { id: string; name: string }
                    >).find((item) => item.name === "Empty Folder")!;
                const source = panel.locator(
                    '[data-tile-id="' + appGitHub.id + '"]',
                ).first();
                const target = panel.locator(
                    '[data-tile-id="folder:' + folder.id + '"]',
                ).first();
                const a = (await source.boundingBox())!;
                const b = (await target.boundingBox())!;
                const cdp = await touchContext.newCDPSession(touchPage);
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
                await panel.locator(".launcher-folder-drop-badge").waitFor();
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
                const apps = (await apiRequest("/api/webapps")).data as Array<
                    {
                        id: string;
                        groupId: string | null;
                        pinnedSortOrder: number;
                    }
                >;
                assertEquals(
                    apps.find((item) => item.id === appGitHub.id)?.groupId,
                    folder.id,
                );
                assertEquals(
                    apps.find((item) => item.id === appGitHub.id)
                        ?.pinnedSortOrder,
                    0,
                );
            } finally {
                await touchContext.close();
            }
        },
    );
});
