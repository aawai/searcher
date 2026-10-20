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
        handleSIGTERM: false,
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
    await page.getByRole("radio", { name: /空间轻桌面/ }).click();
    await page.waitForFunction(() => {
        const radio = document.querySelector(
            'button[role="radio"][aria-checked="true"]',
        );
        return radio?.textContent?.includes("空间轻桌面");
    });
    assertEquals(
        await page.evaluate(() => document.documentElement.dataset.style),
        undefined,
    );
    await page.getByText("跟随系统", { exact: true }).click();
    await page.waitForFunction(() =>
        document.documentElement.dataset.theme !== undefined
    );
    await visit("/");
    await page.locator("main.home-widgets").waitFor({ state: "visible" });
    assertEquals(
        await page.evaluate(() => document.documentElement.dataset.style),
        undefined,
    );

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

    // Helper to calculate blank coordinate strictly below last grid row above footer
    async function getSurfaceBlankCoordinate(targetPage: Page = page) {
        return await targetPage.evaluate(() => {
            const panelEl = document.querySelector(
                ".desktop-window[data-window-id='apps'], .workspace-panel--mobile, aside.workspace-panel, .workspace-panel",
            );
            if (!panelEl) throw new Error("Workspace panel not found");
            const footerEl = panelEl.querySelector(".workspace-footer");
            const panelRect = panelEl.getBoundingClientRect();
            const bodyEl = panelEl.querySelector<HTMLElement>(
                ".workspace-body",
            );
            const bottomLimit = bodyEl
                ? bodyEl.getBoundingClientRect().bottom - 16
                : panelRect.bottom - 16;
            const footerTop = footerEl
                ? footerEl.getBoundingClientRect().top
                : Math.min(bottomLimit, globalThis.innerHeight);

            const contentElements = Array.from(
                panelEl.querySelectorAll<HTMLElement>(
                    ".launcher-tile, .launcher-folder-item, .launcher-app, .apps-workspace-group-card, .empty-state, .launcher-empty, .launcher-folder-inline-header, .workspace-section-header",
                ),
            ).filter((el) => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            });

            let contentBottom: number;
            if (contentElements.length > 0) {
                contentBottom = Math.max(
                    ...contentElements.map((el) =>
                        el.getBoundingClientRect().bottom
                    ),
                );
            } else {
                const controls = panelEl.querySelector<HTMLElement>(
                    ".workspace-root-controls",
                );
                contentBottom = controls
                    ? controls.getBoundingClientRect().bottom
                    : panelEl.getBoundingClientRect().top + 50;
            }

            const x = Math.round(panelRect.left + panelRect.width / 2);
            const gap = footerTop - contentBottom;
            const y = Math.round(
                gap > 20
                    ? contentBottom + gap / 2
                    : (gap > 5
                        ? contentBottom + gap * 0.7
                        : contentBottom + 20),
            );
            return { x, y, contentBottom, footerTop };
        });
    }

    async function rightClickBlankSurface(targetPage: Page = page) {
        const { x, y } = await getSurfaceBlankCoordinate(targetPage);
        await targetPage.mouse.click(x, y, { button: "right" });
    }

    async function openSurfaceMenu(targetPage: Page = page) {
        await rightClickBlankSurface(targetPage);
        const menu = targetPage.locator('[data-slot="context-menu-content"]');
        await menu.waitFor({ timeout: 5000 });
        await targetPage.waitForFunction(() =>
            document.querySelector(
                '[data-slot="context-menu-content"]',
            )?.contains(document.activeElement)
        );
        return menu;
    }

    async function enterArrangingViaSurface(targetPage: Page = page) {
        const menu = await openSurfaceMenu(targetPage);
        const item = menu.locator('[data-slot="context-menu-item"]', {
            hasText: "整理布局",
        });
        await item.click();
        await menu.waitFor({ state: "detached" });
    }

    async function exitArrangingViaSurface(targetPage: Page = page) {
        const menu = await openSurfaceMenu(targetPage);
        const item = menu.locator('[data-slot="context-menu-item"]', {
            hasText: "完成整理",
        });
        await item.click();
        await menu.waitFor({ state: "detached" });
    }

    await t.step(
        "0. Empty Launcher Root: blank surface menu available when zero apps or folders",
        async () => {
            await page.setViewportSize({ width: 1280, height: 800 });
            const dock = page.locator(".desktop-dock");
            await dock.waitFor();
            await page.locator(
                '.desktop-dock button[aria-label="应用工作区"]',
            ).click();

            const panel = page.locator(
                '.desktop-window[data-window-id="apps"]',
            );
            await panel.waitFor();
            await panel.locator(".launcher-empty, .empty-state").waitFor();
            const managementHint = panel.locator(".apps-management-help");
            await managementHint.waitFor({ state: "visible" });
            assertEquals(await managementHint.getAttribute("role"), "note");
            assertStringIncludes(await managementHint.innerText(), "长按");
            assertStringIncludes(
                await managementHint.innerText(),
                "Shift+F10",
            );
            assertEquals(
                await panel.locator(".launcher-empty, .empty-state").first()
                    .isVisible(),
                true,
            );

            // Blank surface menu is accessible in empty root state
            const emptyMenu = await openSurfaceMenu(page);
            assertEquals(
                await emptyMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("新建文件夹")',
                ).count(),
                1,
            );
            assertEquals(
                await emptyMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("整理布局")',
                ).count(),
                1,
            );
            await page.keyboard.press("Escape");
            await emptyMenu.waitFor({ state: "detached" });
        },
    );

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
            const dock = page.locator(".desktop-dock");
            await dock.waitFor();
            await page.locator(
                '.desktop-dock button[aria-label="应用工作区"]',
            ).click();

            const panel = page.locator(
                '.desktop-window[data-window-id="apps"]',
            );
            await panel.waitFor();
            // Dock stays visible while windows open; root nav Dock not footer
            assertEquals(await dock.isVisible(), true);
            assertEquals(
                await panel.locator(
                    ".desktop-window-chrome-title, .workspace-title",
                ).textContent(),
                "应用",
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
                ".workspace-footer button.workspace-primary, .workspace-footer button:has-text('添加应用'), button:has-text('添加应用')",
            );
            assertEquals(await addAppBtn.first().isVisible(), true);
            assertEquals(await addAppBtn.first().textContent(), "添加应用");

            // Top secondary toolbar buttons are removed per Issue #61
            assertEquals(
                await panel.locator(
                    '.apps-workspace-secondary-bar button[aria-label="新建文件夹"]',
                ).count(),
                0,
            );
            assertEquals(
                await panel.locator(
                    '.apps-workspace-secondary-bar button[aria-label="整理网站排序与布局"]',
                ).count(),
                0,
            );

            // Workspace blank surface menu is accessible below sparse grid rows above footer
            const surfaceMenu = await openSurfaceMenu(page);
            assertEquals(
                await surfaceMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("新建文件夹")',
                ).count(),
                1,
            );
            assertEquals(
                await surfaceMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("整理布局")',
                ).count(),
                1,
            );
            await page.keyboard.press("Escape");
            await surfaceMenu.waitFor({ state: "detached" });
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
            const panel = page.locator(
                '.desktop-window[data-window-id="apps"]',
            );

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
                await panel.locator(
                    ".desktop-window-chrome-title, .workspace-title",
                ).textContent(),
                "应用",
            ); // Route stays apps/root!
            assertEquals(
                await panel.getByRole("heading", {
                    name: "Dev Tools",
                    exact: true,
                }).textContent(),
                "Dev Tools",
            );

            // Focus enters folder region on open: Back button has focus
            const backBtn = panel.locator(
                'button[aria-label="返回应用列表"]',
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

            // Blank surface menu is accessible inside inline folder view below apps
            const folderSurfaceMenu = await openSurfaceMenu(page);
            assertEquals(
                await folderSurfaceMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("新建文件夹")',
                ).count(),
                1,
            );
            assertEquals(
                await folderSurfaceMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("整理布局")',
                ).count(),
                1,
            );
            await page.keyboard.press("Escape");
            await folderSurfaceMenu.waitFor({ state: "detached" });
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
            const panel = page.locator(
                '.desktop-window[data-window-id="apps"]',
            );

            // Right click on empty launcher surface below last grid row to open context menu
            const contextMenu = await openSurfaceMenu(page);
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

            // Create second folder "Productivity" also via surface context menu below last grid row
            const secondMenu = await openSurfaceMenu(page);
            await secondMenu.locator(
                '[data-slot="context-menu-item"]:has-text("新建文件夹")',
            ).click();
            await dialog.waitFor();
            await input.fill("Productivity");
            await submitBtn.click();
            await dialog.waitFor({ state: "detached" });
            await panel.locator(
                '.launcher-folder-name:has-text("Productivity")',
            )
                .waitFor();

            // Verify arranging menu behavior: "完成整理" is shown and "新建文件夹" is disabled
            await enterArrangingViaSurface(page);
            const arrangingMenu = await openSurfaceMenu(page);
            assertEquals(
                await arrangingMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("完成整理")',
                ).count(),
                1,
            );
            const disabledCreateFolder = arrangingMenu.locator(
                '[data-slot="context-menu-item"]:has-text("新建文件夹")',
            );
            if (await disabledCreateFolder.count() > 0) {
                const disabled =
                    await disabledCreateFolder.getAttribute("aria-disabled") ===
                        "true" ||
                    await disabledCreateFolder.getAttribute("data-disabled") !==
                        null ||
                    await disabledCreateFolder.isDisabled();
                assertEquals(disabled, true);
            }
            await page.keyboard.press("Escape");
            await arrangingMenu.waitFor({ state: "detached" });
            await exitArrangingViaSurface(page);
        },
    );

    await t.step(
        "4. Folder context actions: resize, rename, delete with confirmation and apps preserved",
        async () => {
            const panel = page.locator(
                '.desktop-window[data-window-id="apps"]',
            );

            const folderTile = panel.locator(
                '.launcher-folder-item:has(.launcher-folder-name:has-text("Productivity"))',
            );
            await folderTile.click({ button: "right" });

            const contextMenu = page.locator(
                '[data-slot="context-menu-content"]',
            );
            await contextMenu.waitFor();

            // Folder context menu isolation: does NOT contain workspace-level actions
            assertEquals(
                await contextMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("整理布局")',
                ).count(),
                0,
            );
            assertEquals(
                await contextMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("完成整理")',
                ).count(),
                0,
            );
            assertEquals(
                await contextMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("新建文件夹")',
                ).count(),
                0,
            );

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
            const panel = page.locator(
                '.desktop-window[data-window-id="apps"]',
            );
            const searchInput = panel.locator(
                'input[data-workspace-search=""]',
            );

            // Search for "git" (matches GitHub loose app, GitLab in Dev Tools folder, and folder name Dev Tools)
            await searchInput.fill("git");

            // Matched count badge is shown
            const searchSection = panel.getByRole("region", {
                name: "搜索结果",
            });
            await searchSection.waitFor();
            const countBadge = searchSection.locator('[data-slot="badge"]');
            await countBadge.waitFor();
            assertEquals(await countBadge.isVisible(), true);

            // GitLab (inside Dev Tools folder) directly appears in search results for fast access
            const appResults = searchSection.locator(".apps-search-name");
            const textContents = await appResults.allTextContents();
            assertEquals(textContents.includes("GitHub"), true);
            assertEquals(textContents.includes("GitLab"), true);

            // Deduplication: each app appears at most once
            const gitLabCount =
                textContents.filter((t) => t === "GitLab").length;
            assertEquals(gitLabCount, 1);

            // Blank surface menu is accessible below search results above footer
            const searchMenu = await openSurfaceMenu(page);
            assertEquals(
                await searchMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("新建文件夹")',
                ).count(),
                1,
            );
            assertEquals(
                await searchMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("整理布局")',
                ).count(),
                1,
            );
            await page.keyboard.press("Escape");
            await searchMenu.waitFor({ state: "detached" });

            // Clear search
            await panel.locator('button[aria-label="清除搜索"]').click();
            assertEquals(await searchInput.inputValue(), "");

            // Search with no results state
            await searchInput.fill("nonexistentqueryxyz");
            await panel.locator(".empty-state").waitFor();

            // Blank surface menu is accessible in search no-results state
            const noResultsMenu = await openSurfaceMenu(page);
            assertEquals(
                await noResultsMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("新建文件夹")',
                ).count(),
                1,
            );
            assertEquals(
                await noResultsMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("整理布局")',
                ).count(),
                1,
            );
            await page.keyboard.press("Escape");
            await noResultsMenu.waitFor({ state: "detached" });

            // Type query and enter arrange mode via surface menu: clears query and unbinds search
            await searchInput.fill("test");
            await enterArrangingViaSurface(page);

            // In arrange mode: query was cleared and input is disabled
            assertEquals(await searchInput.inputValue(), "");
            assertEquals(await searchInput.isDisabled(), true);

            // In arrange mode: "添加应用" is hidden
            assertEquals(
                await panel.locator(
                    "button:has-text('添加应用')",
                ).count(),
                0,
            );

            // In arrange mode: surface menu shows "完成整理" and disabled "新建文件夹"
            const arrangeModeMenu = await openSurfaceMenu(page);
            assertEquals(
                await arrangeModeMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("完成整理")',
                ).count(),
                1,
            );
            const disabledNewFolder = arrangeModeMenu.locator(
                '[data-slot="context-menu-item"]:has-text("新建文件夹")',
            );
            if (await disabledNewFolder.count() > 0) {
                const disabled =
                    await disabledNewFolder.getAttribute("aria-disabled") ===
                        "true" ||
                    await disabledNewFolder.getAttribute("data-disabled") !==
                        null ||
                    await disabledNewFolder.isDisabled();
                assertEquals(disabled, true);
            }
            await page.keyboard.press("Escape");
            await arrangeModeMenu.waitFor({ state: "detached" });

            // Exit arrange mode via surface menu: search is re-enabled
            await exitArrangingViaSurface(page);
            assertEquals(await searchInput.isDisabled(), false);
        },
    );

    await t.step(
        "6. App Context Menu ownership fallback (move in & out of folder)",
        async () => {
            const panel = page.locator(
                '.desktop-window[data-window-id="apps"]',
            );

            // Move GitHub into "Dev Tools" via context menu
            const gitHubTile = panel.locator(
                '.launcher-tile:has(.webapp-name:has-text("GitHub"))',
            );
            await gitHubTile.click({ button: "right" });

            const contextMenu = page.locator(
                '[data-slot="context-menu-content"]',
            );
            await contextMenu.waitFor();

            // App context menu isolation: does NOT contain workspace-level actions
            assertEquals(
                await contextMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("整理布局")',
                ).count(),
                0,
            );
            assertEquals(
                await contextMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("完成整理")',
                ).count(),
                0,
            );
            assertEquals(
                await contextMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("新建文件夹")',
                ).count(),
                0,
            );
            const moveToDevTools = contextMenu.locator(
                '[data-slot="context-menu-item"]',
                {
                    hasText: "移至文件夹 Dev Tools",
                },
            );
            await moveToDevTools.click();

            // GitHub disappears from root
            await page.waitForFunction(() => {
                const p = document.querySelector(
                    ".desktop-window[data-window-id='apps'], aside.workspace-panel",
                );
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
            await panel.locator('button[aria-label="返回应用列表"]')
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
            const panel = page.locator(
                '.desktop-window[data-window-id="apps"]',
            );

            // Enter arrange mode via surface menu
            await enterArrangingViaSurface(page);

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
            const errorBanner = panel.getByRole("alert");
            await errorBanner.waitFor();
            assertStringIncludes(
                await errorBanner.textContent() ?? "",
                "Simulated DnD move network failure",
            );

            // Rollback: Linear returns to root!
            await page.waitForFunction(() => {
                const p = document.querySelector(
                    ".desktop-window[data-window-id='apps'], aside.workspace-panel",
                );
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

            // Exit arrange mode via surface menu
            await exitArrangingViaSurface(page);

            // Verify server state on reload: Linear is still loose, not in Dev Tools
            await page.reload();
            await page.locator("main").waitFor();
            const dock = page.locator(".desktop-dock");
            await dock.waitFor();
            await page.locator(
                '.desktop-dock button[aria-label="应用工作区"]',
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
            const panel = page.locator(
                '.desktop-window[data-window-id="apps"]',
            );

            // Enter arrange mode via surface menu
            await enterArrangingViaSurface(page);

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

            const saved = page.waitForResponse((response) =>
                new URL(response.url()).pathname ===
                    "/api/webapps/" + appLinear.id &&
                response.request().method() === "PATCH"
            );
            // Drop
            await page.mouse.up();
            assertEquals((await saved).status(), 200);

            // Linear disappears from root
            await page.waitForFunction(() => {
                const p = document.querySelector(
                    ".desktop-window[data-window-id='apps'], aside.workspace-panel",
                );
                if (!p) return false;
                const names = Array.from(
                    p.querySelectorAll(".launcher-tile .webapp-name"),
                ).map((e) => e.textContent);
                return !names.includes("Linear");
            });

            // Exit arrange mode via surface menu
            await exitArrangingViaSurface(page);

            // Verify server state on reload: Linear now has groupId === group1.id
            await page.reload();
            await page.locator("main").waitFor();
            const dock = page.locator(".desktop-dock");
            await dock.waitFor();
            await page.locator(
                '.desktop-dock button[aria-label="应用工作区"]',
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
            const panel = page.locator(
                '.desktop-window[data-window-id="apps"]',
            );

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

            // Enter arrange mode via surface menu
            await enterArrangingViaSurface(page);

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
            const saved = page.waitForResponse((response) =>
                new URL(response.url()).pathname === "/api/webapps/reorder" &&
                response.request().method() === "PUT"
            );
            await page.mouse.up();
            assertEquals((await saved).status(), 200);

            // Exit arrange mode via surface menu
            await exitArrangingViaSurface(page);

            // Return to root
            await panel.locator('button[aria-label="返回应用列表"]')
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
            const panel = page.locator(
                '.desktop-window[data-window-id="apps"]',
            );
            const dock = page.locator(".desktop-dock");
            await dock.waitFor();
            await page.locator(
                '.desktop-dock button[aria-label="应用工作区"]',
            )
                .click();
            await panel.waitFor();

            // Enter arrange mode via surface menu
            await enterArrangingViaSurface(page);
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
            // Exit arrange mode via surface menu
            await exitArrangingViaSurface(page);
            assertEquals(await readRoot(), expected);
            await page.reload();
            await dock.waitFor();
            await page.locator(
                '.desktop-dock button[aria-label="应用工作区"]',
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
            // Mobile 375px
            await page.setViewportSize({ width: 375, height: 667 });
            await page.locator(".desktop-dock").waitFor({ state: "detached" });

            // DesktopDock absent below 768; Mobile uses shared Sheet .workspace-panel--mobile
            assertEquals(await page.locator(".desktop-dock").count(), 0);
            const panel = page.locator(".workspace-panel--mobile");
            await panel.waitFor();

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

            // Add extra loose apps to establish a multi-row root layout
            for (let i = 1; i <= 3; i++) {
                await apiRequest("/api/webapps", "POST", {
                    name: `Multi App ${i}`,
                    url: `https://example.org/multi-${i}`,
                    sortOrder: 1000 + i,
                });
            }
            await page.reload();
            const dock = page.locator(".desktop-dock");
            await dock.waitFor();
            assertEquals(await dock.isVisible(), true);
            await page.locator(
                '.desktop-dock button[aria-label="应用工作区"]',
            ).click();
            const panel = page.locator(
                '.desktop-window[data-window-id="apps"]',
            );

            // Multi-row root: blank surface coordinate is below the lowest tile row and above footer
            const multiRowPoint = await getSurfaceBlankCoordinate(page);
            assertEquals(multiRowPoint.y > multiRowPoint.contentBottom, true);
            assertEquals(multiRowPoint.y < multiRowPoint.footerTop, true);

            // Workspace surface menu functions below multirow grid
            const multiRowMenu = await openSurfaceMenu(page);
            assertEquals(
                await multiRowMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("新建文件夹")',
                ).count(),
                1,
            );
            assertEquals(
                await multiRowMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("整理布局")',
                ).count(),
                1,
            );
            await page.keyboard.press("Escape");
            await multiRowMenu.waitFor({ state: "detached" });
            const readRoot = () =>
                panel.locator(".launcher-grid > .launcher-tile").evaluateAll((
                    elements,
                ) => elements.map((element) =>
                    element.getAttribute("data-tile-id")
                ));
            for (const sourceId of ["folder:" + group1.id, loose.id]) {
                await page.reload();
                await page.locator(
                    '.desktop-dock button[aria-label="应用工作区"]',
                ).click();
                await panel.waitFor();
                await enterArrangingViaSurface(page);
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
                    '.desktop-dock button[aria-label="应用工作区"]',
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
                // On mobile (< 768), desktop dock is absent, host uses mobile navigation
                assertEquals(
                    await touchPage.locator(".desktop-dock").count(),
                    0,
                );
                const panel = touchPage.locator(
                    ".workspace-panel--mobile, .workspace-panel",
                );
                const ensureMobileAppsSheetOpen = async () => {
                    const grid = panel.locator(".launcher-grid");
                    const restored = await grid.waitFor({
                        state: "visible",
                        timeout: 2500,
                    }).then(() => true).catch(() => false);
                    if (!restored) {
                        await touchPage.locator(
                            '.workspace-mobile-navigation button[aria-label="应用工作区"], button[data-workspace="apps"]',
                        ).first().click();
                        await grid.waitFor({ state: "visible" });
                    }
                };
                await ensureMobileAppsSheetOpen();
                const cdp = await touchContext.newCDPSession(touchPage);
                const blankPoint = await getSurfaceBlankCoordinate(touchPage);
                assertEquals(blankPoint.y > blankPoint.contentBottom, true);
                assertEquals(blankPoint.y < blankPoint.footerTop, true);

                // 13a. Real touch scrolling below grid does NOT trigger context menu
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchStart",
                    touchPoints: [{ x: blankPoint.x, y: blankPoint.y, id: 1 }],
                });
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchMove",
                    touchPoints: [{
                        x: blankPoint.x,
                        y: blankPoint.y - 30,
                        id: 1,
                    }],
                });
                await touchPage.waitForTimeout(600);
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchEnd",
                    touchPoints: [],
                });
                assertEquals(
                    await touchPage.locator(
                        '[data-slot="context-menu-content"]',
                    ).count(),
                    0,
                );

                // 13b. Real touch CDP longpress below grid triggers workspace surface context menu
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchStart",
                    touchPoints: [{ x: blankPoint.x, y: blankPoint.y, id: 2 }],
                });
                await touchPage.waitForTimeout(600);
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchEnd",
                    touchPoints: [],
                });

                const touchMenu = touchPage.locator(
                    '[data-slot="context-menu-content"]',
                );
                await touchMenu.waitFor();
                assertEquals(
                    await touchMenu.locator(
                        '[data-slot="context-menu-item"]:has-text("新建文件夹")',
                    ).count(),
                    1,
                );
                assertEquals(
                    await touchMenu.locator(
                        '[data-slot="context-menu-item"]:has-text("整理布局")',
                    ).count(),
                    1,
                );

                // Enter arrange mode directly from touch surface menu
                await touchMenu.locator(
                    '[data-slot="context-menu-item"]:has-text("整理布局")',
                ).click();
                await touchMenu.waitFor({ state: "detached" });
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
                await panel.locator(".launcher-folder-drop-badge").waitFor();
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
                await touchPage.getByRole("button", {
                    name: "完成整理",
                    exact: true,
                }).click();
                for (
                    const selector of [
                        ".launcher-app",
                        ".launcher-folder-item--small, .launcher-folder-item--large",
                    ]
                ) {
                    const tile = panel.locator(selector).first();
                    const bounds = (await tile.boundingBox())!;
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
                            name: /^(新建文件夹|整理布局|完成整理)$/,
                        }).count(),
                        0,
                    );
                    assertEquals(touchPage.url(), origin + "/");
                    assertEquals(
                        await panel.locator(".launcher-grid").isVisible(),
                        true,
                    );
                    await touchPage.reload();
                    await ensureMobileAppsSheetOpen();
                }
                // A short viewport creates real overflow; a swipe on the blank
                // surface must move the body, not merely avoid opening a menu.
                await touchPage.setViewportSize({ width: 390, height: 400 });
                const body = panel.locator(".workspace-body");
                await body.evaluate((el) => {
                    el.scrollTop = el.scrollHeight;
                });
                const scrollBefore = await body.evaluate((el) => el.scrollTop);
                assertEquals(scrollBefore > 0, true);
                const swipe = await panel.evaluate((el) => {
                    const bodyRect = el.querySelector(".workspace-body")!
                        .getBoundingClientRect();
                    const surfaceRect = el.querySelector(
                        ".launcher-surface-wrap",
                    )!
                        .getBoundingClientRect();
                    const y = bodyRect.top + bodyRect.height / 3;
                    for (
                        let x = surfaceRect.left + 1;
                        x < surfaceRect.right;
                        x += 2
                    ) {
                        const hit = document.elementFromPoint(x, y);
                        if (
                            hit?.closest(".launcher-surface-wrap") &&
                            !hit.closest(
                                ".launcher-tile, .launcher-app, .launcher-folder-item",
                            )
                        ) {
                            return { x, y };
                        }
                    }
                    throw new Error(
                        "No visible blank Surface for scroll gesture",
                    );
                });
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchStart",
                    touchPoints: [{ ...swipe, id: 3 }],
                });
                for (let offset = 20; offset <= 100; offset += 20) {
                    await cdp.send("Input.dispatchTouchEvent", {
                        type: "touchMove",
                        touchPoints: [{
                            x: swipe.x,
                            y: swipe.y + offset,
                            id: 3,
                        }],
                    });
                }
                await cdp.send("Input.dispatchTouchEvent", {
                    type: "touchEnd",
                    touchPoints: [],
                });
                await touchPage.waitForFunction((before) => {
                    const body = document.querySelector(
                        ".workspace-panel--mobile .workspace-body, .workspace-panel .workspace-body",
                    );
                    return body !== null && body.scrollTop < before;
                }, scrollBefore);
                assertEquals(await touchMenu.count(), 0);
            } finally {
                await touchContext.close();
            }
        },
    );
});
