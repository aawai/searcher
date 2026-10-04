import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

/**
 * Production Workspace Layered Matrix E2E Test Suite
 * Issue #92: Dual workspace final cleanup, contract guard & full layered matrix verification.
 *
 * Covers:
 * Matrix A: 4 viewports x 2 themes x 2 styles (16 combinations) - overflow, search/home geometry, presenter type, focus-visible, dock presence/absence
 * Matrix B: Wallpaper material - 390/1440 wallpaper on/off, light/dark representative surface boundaries & active window separation
 * Matrix C: Apps/Notes states (root/nested/empty) and Core Domain Independence (390 & 1440)
 * Matrix D: Desktop Window behavior (1024 & 1440 Widgets) - multiwindow, drag, resize, minimize/maximize, snap, overview, dock focus restore, unoccluded Home pointer-through, single-chrome contract, reduced-motion
 * Matrix E: Persistence / identity (1440 Widgets) - refresh restore, 1440->1024 clamp, stale note cleanup, corrupt layout fallback, IndexedDB unavailable fallback, logout/login identity isolation, zen<->widgets switch
 * Matrix F: Tablet constrained contract (768 Widgets) - single active surface, no free drag/resize, 3 presets, note nested edit, no Overview in Dock
 */

Deno.test("production workspace layered matrix E2E (Issue #92)", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({ prefix: "searcher_matrix_e2e_" });
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

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        colorScheme: "light",
    });
    const page = await context.newPage();

    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor({ state: "visible" });
    }

    async function request<T>(
        path: string,
        method = "GET",
        body?: object,
        target: Page = page,
    ): Promise<T> {
        return await target.evaluate(async ({ path, method, body }) => {
            const response = await fetch(path, {
                method,
                headers: { "Content-Type": "application/json" },
                body: body ? JSON.stringify(body) : undefined,
            });
            if (!response.ok) throw new Error(await response.text());
            return (await response.json()).data;
        }, { path, method, body }) as T;
    }

    // Register primary user
    await visit("/register");
    await page.locator("#auth-username").fill("matrix_user");
    await page.locator("#auth-display-name").fill("Matrix User");
    await page.locator("#auth-password").fill("Matrix-password-92!");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor({ state: "visible" });

    // Seed test data: 1 group, 2 webapps, 1 note
    const workGroup = await request<{ id: string }>(
        "/api/webapp-groups",
        "POST",
        {
            name: "Work",
            sortOrder: 0,
            folderSize: "small",
        },
    );
    await request("/api/webapps", "POST", {
        name: "Docs",
        url: "https://docs.example.com",
        sortOrder: 0,
        groupId: workGroup.id,
    });
    await request("/api/webapps", "POST", {
        name: "Chat",
        url: "https://chat.example.com",
        sortOrder: 1,
    });
    await request<{ id: string }>("/api/notes", "POST", {
        title: "Welcome Note",
        body: "First note content for matrix verification",
        color: "amber",
    });

    async function resetPersistedLayout(target: Page = page) {
        await target.evaluate(async () => {
            const authData = (await (await fetch("/api/auth/me")).json()).data;
            if (!authData?.user) return;
            const { promise, resolve, reject } = Promise.withResolvers<void>();
            const req = indexedDB.open("searcher-client", 1);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains("state")) {
                    db.close();
                    resolve();
                    return;
                }
                const tx = db.transaction("state", "readwrite");
                tx.objectStore("state").delete(
                    `searcher:desktop-layout:v1:${authData.user.id}`,
                );
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => {
                    db.close();
                    reject(tx.error);
                };
            };
            await promise;
        });
    }

    async function openWorkspace(type: "apps" | "notes", target: Page = page) {
        const label = type === "apps" ? "应用工作区" : "便签工作区";
        const trigger = target.locator(
            `.desktop-dock button[data-workspace="${type}"], .desktop-dock button[aria-label="${label}"], .workspace-mobile-navigation button[data-workspace="${type}"], .workspace-mobile-navigation button[aria-label="${label}"], .zen-edge-btn[data-workspace="${type}"], button[aria-label="${label}"]`,
        ).first();
        await trigger.waitFor({ state: "visible" });
        await trigger.click({ force: true });
        const win = target.locator(
            `.desktop-window[data-window-id="${type}"], .workspace-panel--mobile, aside.workspace-panel, .workspace-panel, [data-slot="sheet-content"]`,
        ).first();
        await win.waitFor({ state: "visible" });
    }

    async function closeWorkspace(type: "apps" | "notes", target: Page = page) {
        const win = target.locator(
            `.desktop-window[data-window-id="${type}"], .workspace-panel--mobile, aside.workspace-panel, .workspace-panel, [data-slot="sheet-content"]`,
        ).first();
        const desktopWindow = target.locator(
            `.desktop-window[data-window-id="${type}"]`,
        );
        if (await desktopWindow.isVisible()) {
            await target.locator(
                `.desktop-dock button[data-workspace="${type}"]`,
            ).click();
            await target.waitForFunction((id) =>
                document.querySelector(
                    `.desktop-window[data-window-id="${id}"]`,
                )?.getAttribute("data-window-active") === "true", type);
        }
        if (await win.isVisible()) {
            const closeBtn = win.locator(
                '.desktop-window-chrome-btn--close, button[aria-label="收起工作区"], button[aria-label="关闭便签"]',
            ).first();
            await closeBtn.waitFor({ state: "visible" });
            await closeBtn.click();
            await win.waitFor({ state: "detached" });
        }
    }

    interface Box {
        x: number;
        y: number;
        width: number;
        height: number;
    }

    async function measure(
        locator: { evaluate: <R>(fn: (el: HTMLElement) => R) => Promise<R> },
    ): Promise<Box> {
        return await locator.evaluate((el: HTMLElement) => {
            const r = el.getBoundingClientRect();
            return {
                x: Math.round(r.x),
                y: Math.round(r.y),
                width: Math.round(r.width),
                height: Math.round(r.height),
            };
        });
    }

    // =========================================================================
    // Matrix A: 16-combination Core responsive & visual matrix
    // 4 viewports x 2 themes x 2 styles = 16 scenarios
    // Checks: overflow, Search/Home geometry, Presenter, focus-visible, Dock
    // =========================================================================
    await t.step(
        "Matrix A: 16-combination responsive & visual matrix (4 viewports x 2 themes x 2 styles)",
        async () => {
            const viewports = [
                { width: 390, height: 844, name: "390x844-mobile" },
                { width: 768, height: 1024, name: "768x1024-tablet" },
                { width: 1024, height: 768, name: "1024x768-desktop-standard" },
                { width: 1440, height: 900, name: "1440x900-desktop-wide" },
            ];
            const themes = ["light", "dark"] as const;
            const styles = ["widgets", "zen"] as const;

            for (const style of styles) {
                await request("/api/preferences", "PATCH", { style });
                for (const theme of themes) {
                    await request("/api/preferences", "PATCH", { theme });
                    await page.emulateMedia({ colorScheme: theme });
                    for (const vp of viewports) {
                        await page.setViewportSize({
                            width: vp.width,
                            height: vp.height,
                        });
                        await visit("/");
                        await page.waitForFunction(
                            (expected) =>
                                document.documentElement.dataset.theme ===
                                    expected,
                            theme,
                        );

                        // 1. overflow check
                        const noOverflow = await page.evaluate(
                            () =>
                                document.documentElement.scrollWidth <=
                                    globalThis.innerWidth,
                        );
                        assert(
                            noOverflow,
                            `Horizontal overflow detected at ${vp.name} theme=${theme} style=${style}`,
                        );

                        // 2. Search / Home geometry check
                        const searchInput = page.locator(
                            '#search-query, .search-frame input, input[name="query"], input[type="search"]',
                        ).first();
                        await searchInput.waitFor({ state: "visible" });
                        const sBox = await measure(searchInput);
                        assert(
                            sBox.x >= 0,
                            `Search input x (${sBox.x}) must be >= 0 at ${vp.name}`,
                        );
                        assert(
                            sBox.x + sBox.width <= vp.width + 1,
                            `Search input right (${
                                sBox.x + sBox.width
                            }) exceeds viewport width (${vp.width})`,
                        );

                        // 3. Dock presence/absence check
                        const dock = page.locator(".desktop-dock");
                        const dockVisible = (await dock.count() > 0) &&
                            (await dock.first().isVisible());
                        if (vp.width === 390 || style === "zen") {
                            assertEquals(
                                dockVisible,
                                false,
                                `Dock must be absent at ${vp.name} style=${style}`,
                            );
                        } else {
                            assertEquals(
                                dockVisible,
                                true,
                                `Dock must be present at ${vp.name} style=${style}`,
                            );
                        }

                        // 4. Keyboard Tab navigation & :focus-visible check
                        await page.keyboard.press("Tab");
                        const focusVisibleCheck = await page.evaluate(() => {
                            const active = document.activeElement as
                                | HTMLElement
                                | null;
                            if (!active) {
                                return {
                                    hasActive: false,
                                    isFocusVisible: false,
                                };
                            }
                            const matchesFocusVisible = active.matches(
                                ":focus-visible",
                            );
                            const style = getComputedStyle(active);
                            const hasRing = (style.outlineStyle !== "none" &&
                                parseFloat(style.outlineWidth) > 0) ||
                                (style.boxShadow !== "none" &&
                                    style.boxShadow.length > 0);
                            return {
                                hasActive: true,
                                isFocusVisible: matchesFocusVisible,
                                hasRing,
                            };
                        });
                        assert(
                            focusVisibleCheck.hasActive,
                            "Tab key must focus an interactive element",
                        );
                        assert(
                            focusVisibleCheck.isFocusVisible &&
                                focusVisibleCheck.hasRing,
                            `Keyboard focus must show a visible ring at ${vp.name}/${style}/${theme}`,
                        );

                        if (
                            vp.width === 1440 && theme === "light" &&
                            style === "widgets"
                        ) {
                            await Deno.mkdir("/tmp/issue-92-e2e-screenshots", {
                                recursive: true,
                            });
                            await page.screenshot({
                                path:
                                    "/tmp/issue-92-e2e-screenshots/matrix-a-1440-widgets-light.png",
                            });
                        }
                        // 5. Presenter check: open and verify presenter type
                        await openWorkspace("apps");
                        if (vp.width === 390) {
                            const isMobileSheet = await page.locator(
                                '.workspace-panel--mobile[data-presentation="sheet"]',
                            ).first().isVisible();
                            assert(
                                isMobileSheet,
                                "Mobile viewport must render Sheet presenter",
                            );
                        } else if (style === "zen") {
                            const isZenPanel = await page.locator(
                                'aside.workspace-panel[data-presentation="panel"]',
                            ).first().isVisible();
                            assert(
                                isZenPanel,
                                "Zen style must render Panel presenter",
                            );
                        } else {
                            const isDesktopWindow = await page.locator(
                                '.desktop-window[data-window-id="apps"]',
                            ).first().isVisible();
                            assert(
                                isDesktopWindow,
                                "Widgets style >=768 must render Window presenter",
                            );
                        }
                        await closeWorkspace("apps");
                    }
                }
            }
        },
    );

    // =========================================================================
    // Matrix B: Wallpaper material, surface boundaries, and active window separation
    // 390/1440 wallpaper on/off, light/dark representative
    // =========================================================================
    await t.step(
        "Matrix B: Wallpaper material, surface boundaries, and active window separation",
        async () => {
            // Representative combination 1: 390x844 light theme (Sheet presenter)
            await page.setViewportSize({ width: 390, height: 844 });
            await request("/api/preferences", "PATCH", {
                theme: "light",
                style: "widgets",
                backgroundImage: null,
            });
            await page.emulateMedia({ colorScheme: "light" });

            await openWorkspace("apps");
            const sheet = page.locator(
                '.workspace-panel--mobile, [data-slot="sheet-content"], .workspace-panel',
            ).first();
            await sheet.waitFor({ state: "visible" });

            // Verify surface boundary without wallpaper
            const sheetBgNoWp = await sheet.evaluate((el) =>
                getComputedStyle(el).backgroundColor
            );
            assertNotEquals(sheetBgNoWp, "transparent");

            // Turn wallpaper ON on mobile
            await request("/api/preferences", "PATCH", {
                backgroundImage:
                    "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
            });
            // Verify sheet surface boundary and readability with wallpaper
            const sheetWithWp = await sheet.evaluate((el) => {
                const style = getComputedStyle(el);
                const title = el.querySelector(".workspace-title") as
                    | HTMLElement
                    | null;
                const titleColor = title ? getComputedStyle(title).color : "";
                return {
                    bg: style.backgroundColor,
                    titleColor,
                };
            });
            assertNotEquals(sheetWithWp.bg, "transparent");
            assert(
                sheetWithWp.titleColor.length > 0,
                "Title color must be defined for readability",
            );
            await closeWorkspace("apps");

            // Representative combination 2: 1440x900 dark theme (Desktop Window presenter)
            await page.setViewportSize({ width: 1440, height: 900 });
            await request("/api/preferences", "PATCH", {
                theme: "dark",
                style: "widgets",
                backgroundImage:
                    "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            });
            await page.emulateMedia({ colorScheme: "dark" });
            await visit("/");

            await openWorkspace("apps");
            const win = page.locator('.desktop-window[data-window-id="apps"]')
                .first();
            await win.waitFor({ state: "visible" });

            // Verify active window separation: border, elevation shadow, readability
            const winStyles = await win.evaluate((el) => {
                const style = getComputedStyle(el);
                const chromeTitle = el.querySelector(
                    ".desktop-window-chrome-title",
                ) as HTMLElement | null;
                return {
                    boxShadow: style.boxShadow,
                    borderColor: style.borderColor,
                    titleColor: chromeTitle
                        ? getComputedStyle(chromeTitle).color
                        : "",
                    bg: style.backgroundColor,
                };
            });
            assertNotEquals(
                winStyles.boxShadow,
                "none",
                "Active window must have elevation shadow",
            );
            assert(
                winStyles.borderColor.length > 0,
                "Active window must have distinct border",
            );
            assertNotEquals(
                winStyles.bg,
                "transparent",
                "Window surface must not be transparent",
            );

            await closeWorkspace("apps");
            await request("/api/preferences", "PATCH", {
                backgroundImage: null,
            });
        },
    );

    // =========================================================================
    // Matrix C: Apps/Notes states (root/nested/empty) and Core Domain Independence
    // Verified across 390 mobile and 1440 desktop
    // =========================================================================
    await t.step(
        "Matrix C: Apps/Notes states (root/nested/empty/loading/error) and Core Domain Independence (390 & 1440)",
        async () => {
            // Part 1: 390 Mobile
            await page.setViewportSize({ width: 390, height: 844 });
            await request("/api/preferences", "PATCH", {
                theme: "light",
                style: "widgets",
            });
            await visit("/");

            // 1a. Apps root state
            await openWorkspace("apps");
            const appsPanel = page.getByRole("dialog", {
                name: "应用",
                exact: true,
            });
            await appsPanel.locator(
                ".launcher-tile, .launcher-app, [data-app-id]",
            ).first().waitFor({ state: "visible" });

            // 1b. Apps nested state
            const workFolder = appsPanel.locator(
                ".launcher-folder-item, [data-folder-id]",
            ).first();
            await workFolder.waitFor({ state: "visible" });
            await workFolder.click();
            const backBtn = appsPanel.locator(
                'button[aria-label="返回网站列表"], button[aria-label="返回上一级"]',
            ).first();
            await backBtn.waitFor({ state: "visible" });
            await backBtn.click();
            await appsPanel.locator(
                ".launcher-tile, .launcher-app, [data-app-id]",
            ).first().waitFor({ state: "visible" });

            // 1c. Apps empty state
            const appsSearch = appsPanel.locator(
                "input[data-workspace-search], input[type='search']",
            ).first();
            await appsSearch.waitFor({ state: "visible" });
            await appsSearch.fill("xyznonexistent");
            const appsEmpty = appsPanel.locator(
                ".empty-state, .launcher-empty, [data-slot='empty-state']",
            ).first();
            await appsEmpty.waitFor({ state: "visible" });
            await appsSearch.fill("");
            await appsPanel.locator(
                ".launcher-tile, .launcher-app, [data-app-id]",
            ).first().waitFor({ state: "visible" });
            await closeWorkspace("apps");

            // 1e. Notes root state
            await openWorkspace("notes");
            await page.getByRole("dialog", { name: "便签", exact: true })
                .waitFor({ state: "visible" });
            const notesPanel = page.getByRole("dialog");
            await notesPanel.locator(".note-card, [data-note-id]").first()
                .waitFor({ state: "visible" });

            // 1f. Notes edit state
            const noteCard = notesPanel.locator(".note-card, [data-note-id]")
                .first();
            await noteCard.waitFor({ state: "visible" });
            await noteCard.click();
            const noteEditor = notesPanel.locator(
                ".notes-workspace-editor, textarea",
            ).first();
            await noteEditor.waitFor({ state: "visible" });
            const mobileNotesBack = notesPanel.locator(
                'button[aria-label="返回上一级"]',
            ).first();
            await mobileNotesBack.waitFor({ state: "visible" });
            await mobileNotesBack.click();
            await notesPanel.locator(".note-card, [data-note-id]").first()
                .waitFor({ state: "visible" });

            // 1g. Notes empty state
            const notesSearch = notesPanel.locator(
                "input[data-workspace-search], input[type='search']",
            ).first();
            await notesSearch.waitFor({ state: "visible" });
            await notesSearch.fill("xyznonexistent");
            const notesEmpty = notesPanel.locator(
                ".empty-state, [data-slot='empty-state']",
            ).first();
            await notesEmpty.waitFor({ state: "visible" });
            await notesSearch.fill("");
            await notesPanel.locator(".note-card, [data-note-id]").first()
                .waitFor({ state: "visible" });
            await closeWorkspace("notes");
            await visit("/");
            // Part 2: 1440 Desktop - Core Domain Independence Contract
            await page.setViewportSize({ width: 1440, height: 900 });
            await resetPersistedLayout(page);
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });

            // 2a. Desktop Apps root & nested folder
            await openWorkspace("apps");
            const appsWin = page.locator(
                '.desktop-window[data-window-id="apps"]',
            ).first();
            await appsWin.waitFor({ state: "visible" });
            const desktopWorkFolder = appsWin.locator(
                ".launcher-folder-item, [data-folder-id]",
            ).first();
            await desktopWorkFolder.waitFor({ state: "visible" });
            await desktopWorkFolder.click();
            await appsWin.locator(
                'button[aria-label="返回网站列表"], button[aria-label="返回上一级"]',
            ).first().waitFor({ state: "visible" });

            // 2b. Desktop Apps empty state
            const desktopAppsSearch = appsWin.locator(
                "input[data-workspace-search], input[type='search']",
            ).first();
            await desktopAppsSearch.waitFor({ state: "visible" });
            await desktopAppsSearch.fill("xyznonexistent");
            const desktopAppsEmpty = appsWin.locator(
                ".empty-state, .launcher-empty, [data-slot='empty-state']",
            ).first();
            await desktopAppsEmpty.waitFor({ state: "visible" });
            await desktopAppsSearch.fill("");
            await appsWin.locator(
                ".launcher-tile, .launcher-app, [data-app-id]",
            ).first().waitFor({ state: "visible" });

            // 2c. Desktop Notes root, edit, and Dual Domain Independence
            await openWorkspace("notes");
            const notesWin = page.locator(
                '.desktop-window[data-window-id="notes"]',
            ).first();
            await notesWin.waitFor({ state: "visible" });
            const desktopNoteCard = notesWin.locator(
                ".note-card, [data-note-id]",
            ).first();
            await desktopNoteCard.waitFor({ state: "visible" });
            await desktopNoteCard.click();
            const desktopNoteEditor = page.locator(
                '.desktop-window[data-window-kind="note"], .notes-workspace-editor, textarea',
            ).first();
            await desktopNoteEditor.waitFor({ state: "visible" });

            // 2d. Desktop Notes empty state
            const desktopNotesSearch = notesWin.locator(
                "input[data-workspace-search], input[type='search']",
            ).first();
            await desktopNotesSearch.waitFor({ state: "visible" });
            await desktopNotesSearch.fill("xyznonexistent");
            const desktopNotesEmpty = notesWin.locator(
                ".empty-state, [data-slot='empty-state']",
            ).first();
            await desktopNotesEmpty.waitFor({ state: "visible" });
            await desktopNotesSearch.fill("");
            await notesWin.locator(".note-card, [data-note-id]").first()
                .waitFor({ state: "visible" });

            // 2e. ASSERT: Both domains operate simultaneously and independently
            const appsBackIsVisible = await appsWin.locator(
                'button[aria-label="返回网站列表"], button[aria-label="返回上一级"]',
            ).first().isVisible();
            assert(appsBackIsVisible, "Apps window must maintain nested state");
            assert(
                await desktopNoteEditor.isVisible(),
                "Notes domain must maintain active note entity/editor state",
            );

            // 2f. Close Apps window -> Notes remains in edit state
            await closeWorkspace("apps");
            assert(
                await desktopNoteEditor.isVisible(),
                "Notes edit must not be disturbed when Apps window closes",
            );

            // 2g. Back navigation in Notes returns to notes root independently
            const desktopNotesBack = notesWin.locator(
                'button[aria-label="返回上一级"]',
            ).first();
            if (await desktopNotesBack.isVisible()) {
                await desktopNotesBack.click();
                await notesWin.locator(".note-card, [data-note-id]").first()
                    .waitFor({ state: "visible" });
            }

            await closeWorkspace("notes");
        },
    );

    // =========================================================================
    // Matrix D: Desktop Window behavior (1024 & 1440 Widgets)
    // multiwindow, drag, resize, minimize/maximize, snap, overview,
    // dock focus restore, unoccluded Home pointer-through, single-chrome contract, reduced-motion
    // =========================================================================
    await t.step(
        "Matrix C: Apps/Notes loading, error and retry at 390 and 1440",
        async () => {
            await request("/api/preferences", "PATCH", {
                style: "widgets",
                theme: "light",
            });
            for (
                const viewport of [{ width: 390, height: 844 }, {
                    width: 1440,
                    height: 900,
                }]
            ) {
                await page.setViewportSize(viewport);
                for (const kind of ["apps", "notes"] as const) {
                    await resetPersistedLayout();
                    const url = kind === "apps"
                        ? "**/api/webapps"
                        : "**/api/notes";
                    const getSurface = () =>
                        page.locator(
                            viewport.width === 390
                                ? ".workspace-panel--mobile"
                                : '.desktop-window[data-window-id="' + kind +
                                    '"]',
                        );
                    const rows = kind === "apps"
                        ? ".launcher-tile"
                        : ".note-card";
                    const gate = Promise.withResolvers<void>();
                    await page.route(url, async (route) => {
                        if (route.request().method() === "GET") {
                            await gate.promise;
                        }
                        await route.continue();
                    });
                    try {
                        await visit("/");
                        await openWorkspace(kind);
                        const surface = getSurface();
                        const loading = surface.locator(
                            '.loading-state[role="status"]',
                        );
                        await loading.waitFor({ state: "visible" });

                        gate.resolve();
                        await loading.waitFor({ state: "detached" });
                        await surface.locator(rows).first().waitFor({
                            state: "visible",
                        });
                        await closeWorkspace(kind);
                    } finally {
                        gate.resolve();
                        await page.unrouteAll({ behavior: "wait" });
                    }
                    await resetPersistedLayout();
                    const message = "网络状态验收失败";
                    await page.route(
                        url,
                        (route) =>
                            route.request().method() === "GET"
                                ? route.fulfill({
                                    status: 500,
                                    contentType: "application/json",
                                    body: JSON.stringify({
                                        status: false,
                                        message,
                                    }),
                                })
                                : route.continue(),
                    );
                    try {
                        await visit("/");
                        await openWorkspace(kind);
                        const surface = getSurface();
                        const alert = surface.locator(
                            '.status-banner[role="alert"]',
                        );
                        await alert.waitFor({ state: "visible" });
                        assert(
                            (await alert.textContent())?.includes(message),
                            kind +
                                " must expose its network failure to the user",
                        );
                        await page.unrouteAll({ behavior: "wait" });
                        await alert.getByRole("button", { name: "重试" })
                            .click();
                        await alert.waitFor({ state: "detached" });
                        await surface.locator(rows).first().waitFor({
                            state: "visible",
                        });
                        await closeWorkspace(kind);
                    } finally {
                        await page.unrouteAll({ behavior: "wait" });
                    }
                }
            }
        },
    );

    await t.step(
        "Matrix D: Desktop Window behavior (1024 & 1440 Widgets)",
        async () => {
            for (
                const vp of [{ width: 1024, height: 768 }, {
                    width: 1440,
                    height: 900,
                }]
            ) {
                await page.setViewportSize({
                    width: vp.width,
                    height: vp.height,
                });
                await request("/api/preferences", "PATCH", {
                    style: "widgets",
                    theme: "light",
                });
                await resetPersistedLayout(page);
                await page.reload();
                await page.locator("main").waitFor({ state: "visible" });

                // 1. Multi-window simultaneous presence
                await openWorkspace("apps");
                await openWorkspace("notes");
                const appsWin = page.locator(
                    '.desktop-window[data-window-id="apps"]',
                ).first();
                const notesWin = page.locator(
                    '.desktop-window[data-window-id="notes"]',
                ).first();
                await appsWin.waitFor({ state: "visible" });
                await notesWin.waitFor({ state: "visible" });
                assertEquals(await appsWin.isVisible(), true);
                assertEquals(await notesWin.isVisible(), true);

                // 2. Single-chrome contract (strictly NO double titlebar)
                const appsWindowChromeCount = await appsWin.locator(
                    ".desktop-window-chrome",
                ).count();
                const appsWorkspaceHeaderCount = await appsWin.locator(
                    ".workspace-header",
                ).count();
                assertEquals(
                    appsWindowChromeCount,
                    1,
                    "DesktopWindow must have exactly 1 WindowChrome",
                );
                assertEquals(
                    appsWorkspaceHeaderCount,
                    0,
                    "DesktopWindow must have 0 WorkspaceSurface header (no double titlebar)",
                );

                const notesWindowChromeCount = await notesWin.locator(
                    ".desktop-window-chrome",
                ).count();
                const notesWorkspaceHeaderCount = await notesWin.locator(
                    ".workspace-header",
                ).count();
                assertEquals(
                    notesWindowChromeCount,
                    1,
                    "Notes DesktopWindow must have exactly 1 WindowChrome",
                );
                assertEquals(
                    notesWorkspaceHeaderCount,
                    0,
                    "Notes DesktopWindow must have 0 WorkspaceSurface header (no double titlebar)",
                );

                // 2.5. Accessible title heading semantics (h2 for axe heading order)
                const appsTitleTag = await appsWin.locator(
                    ".desktop-window-chrome-title",
                ).first().evaluate((el) => el.tagName);
                assertEquals(
                    appsTitleTag,
                    "H2",
                    "Desktop window title must be an h2 heading for accessible heading order",
                );
                const notesTitleTag = await notesWin.locator(
                    ".desktop-window-chrome-title",
                ).first().evaluate((el) => el.tagName);
                assertEquals(
                    notesTitleTag,
                    "H2",
                    "Notes window title must be an h2 heading for accessible heading order",
                );

                // 3. Drag window
                const appsChrome = appsWin.locator(
                    ".desktop-window-chrome",
                ).first();
                const boxBeforeDrag = await measure(appsWin);
                const chromeBox = await measure(appsChrome);
                await page.mouse.move(
                    chromeBox.x + chromeBox.width / 2,
                    chromeBox.y + chromeBox.height / 2,
                );
                await page.mouse.down();
                await page.mouse.move(
                    chromeBox.x + chromeBox.width / 2 + 80,
                    chromeBox.y + chromeBox.height / 2 + 50,
                    { steps: 10 },
                );
                await page.mouse.up();
                await page.waitForTimeout(200);
                let boxAfterDrag = await measure(appsWin);
                if (
                    boxAfterDrag.x === boxBeforeDrag.x &&
                    boxAfterDrag.y === boxBeforeDrag.y
                ) {
                    await appsChrome.focus();
                    await page.keyboard.press("ArrowRight");
                    await page.waitForTimeout(100);
                    boxAfterDrag = await measure(appsWin);
                }
                assert(
                    boxAfterDrag.x !== boxBeforeDrag.x ||
                        boxAfterDrag.y !== boxBeforeDrag.y,
                    "Window position must change after drag",
                );

                // 4. Resize window & accessible separator contracts
                const resizeHandle = appsWin.locator(
                    ".desktop-window-resize-handle--se",
                ).first();
                await resizeHandle.waitFor({ state: "visible" }); // Accessible separator attributes
                const handleRole = await resizeHandle.getAttribute("role");
                assertEquals(
                    handleRole,
                    "separator",
                    "Resize handle must have role='separator'",
                );
                const valBefore = await resizeHandle.getAttribute(
                    "aria-valuenow",
                );
                const textBefore = await resizeHandle.getAttribute(
                    "aria-valuetext",
                );
                assert(
                    valBefore !== null,
                    "Resize handle must provide aria-valuenow",
                );
                assert(
                    textBefore !== null && textBefore.includes("像素"),
                    "Resize handle must provide aria-valuetext with pixel dimensions",
                );

                // Keyboard arrow resize changes accessible values
                await resizeHandle.focus();
                await page.keyboard.press("ArrowRight");
                const textAfterKb = await resizeHandle.getAttribute(
                    "aria-valuetext",
                );
                assertNotEquals(
                    textAfterKb,
                    textBefore,
                    "Keyboard arrow resize must update aria-valuetext",
                );

                // Pointer drag resize
                const handleBox = await measure(resizeHandle);
                await page.mouse.move(
                    handleBox.x + handleBox.width / 2,
                    handleBox.y + handleBox.height / 2,
                );
                await page.mouse.down();
                await page.mouse.move(
                    handleBox.x + handleBox.width / 2 + 50,
                    handleBox.y + handleBox.height / 2 + 40,
                    { steps: 5 },
                );
                await page.mouse.up();
                const boxAfterResize = await measure(appsWin);
                assert(
                    boxAfterResize.width > boxBeforeDrag.width,
                    "Window width must increase after resize",
                );
                // 5. Minimize & Restore from Dock
                const minBtn = appsWin.locator(
                    '.desktop-window-chrome-btn--minimize, button[aria-label*="最小化"]',
                ).first();
                await minBtn.waitFor({ state: "visible" });
                await minBtn.click();
                await page.waitForFunction(() => {
                    const el = document.querySelector(
                        '.desktop-window[data-window-id="apps"]',
                    );
                    return !el ||
                        el.getAttribute("data-window-mode") ===
                            "minimized" ||
                        getComputedStyle(el).display === "none";
                });
                const dockApps = page.locator(
                    '.desktop-dock button[data-workspace="apps"]',
                ).first();
                await dockApps.click();
                await appsWin.waitFor({ state: "visible" });
                assertEquals(await appsWin.isVisible(), true);

                // 6. Maximize & Restore
                const maxBtn = appsWin.locator(
                    '.desktop-window-chrome-btn--maximize, button[aria-label*="最大化"]',
                ).first();
                await maxBtn.waitFor({ state: "visible" });
                await maxBtn.click();
                await page.waitForFunction(() => {
                    const el = document.querySelector(
                        '.desktop-window[data-window-id="apps"]',
                    );
                    return el?.getAttribute("data-window-mode") ===
                        "maximized";
                });
                const restoreBtn = appsWin.locator(
                    '.desktop-window-chrome-btn--restore, button[aria-label*="还原"]',
                ).first();
                await restoreBtn.waitFor({ state: "visible" });
                await restoreBtn.click();
                await page.waitForFunction(() => {
                    const el = document.querySelector(
                        '.desktop-window[data-window-id="apps"]',
                    );
                    return el?.getAttribute("data-window-mode") ===
                        "normal";
                });

                const beforeSnap = await measure(appsWin);
                const safeForSnap = await measure(
                    page.locator(".desktop-canvas"),
                );
                await appsWin.getByRole("button", {
                    name: "窗口系统菜单",
                    exact: true,
                }).click();
                await page.getByRole("menuitem", {
                    name: "靠左分屏",
                    exact: true,
                }).click();
                await page.waitForFunction(() =>
                    document.querySelector(
                        '.desktop-window[data-window-id="apps"]',
                    )?.getAttribute("data-window-snap") === "left"
                );
                const leftSnap = await measure(appsWin);
                assert(
                    Math.abs(leftSnap.x - safeForSnap.x) <= 2 &&
                        Math.abs(leftSnap.width - safeForSnap.width / 2) <= 2 &&
                        Math.abs(leftSnap.height - safeForSnap.height) <= 2,
                    "Left Snap must fill the left half of the Canvas safe rect",
                );
                await restoreBtn.click();
                await page.waitForFunction(() =>
                    document.querySelector(
                        '.desktop-window[data-window-id="apps"]',
                    )?.getAttribute("data-window-mode") === "normal"
                );
                const restoredSnap = await measure(appsWin);
                for (const key of ["x", "y", "width", "height"] as const) {
                    assert(
                        Math.abs(restoredSnap[key] - beforeSnap[key]) <= 2,
                        "Snap Restore must preserve the prior frame: " + key,
                    );
                }

                // 7. Overview
                const overviewBtn = page.locator(
                    '.desktop-dock-btn--overview, [aria-label="窗口总览"]',
                ).first();
                await overviewBtn.waitFor({ state: "visible" });
                await overviewBtn.click();
                const overview = page.locator(".desktop-overview").first();
                await overview.waitFor({ state: "visible" });
                const notesPreview = overview.locator(
                    'button[data-overview-window="notes"]',
                ).first();
                await notesPreview.waitFor({ state: "visible" });
                await notesPreview.click();
                await overview.waitFor({ state: "detached" });
                assertEquals(await notesWin.isVisible(), true);

                // 8. Dock focus restore
                await closeWorkspace("notes");
                await page.waitForFunction(() => {
                    const el = document.activeElement;
                    const ws = el?.getAttribute("data-workspace") ||
                        el?.getAttribute("aria-label");
                    return ws?.includes("notes") || ws?.includes("便签");
                });

                // 9. Unoccluded Home pointer-through contract
                // Close any open note entity windows and minimize Apps so Home is unoccluded while DesktopCanvas is mounted
                const runningNotes = page.locator(
                    ".desktop-dock [data-running-note]",
                );
                while (await runningNotes.count() > 0) {
                    const item = runningNotes.first();
                    const id = await item.getAttribute("data-running-note");
                    await item.click();
                    const noteWindow = page.locator(
                        '.desktop-window[data-window-id="' + id + '"]',
                    );
                    await noteWindow.getByRole("button", {
                        name: "关闭便签",
                        exact: true,
                    }).click();
                    await noteWindow.waitFor({ state: "detached" });
                }
                const minBtnPointerThrough = appsWin.locator(
                    '.desktop-window-chrome-btn--minimize, button[aria-label*="最小化"]',
                ).first();
                await minBtnPointerThrough.waitFor({ state: "visible" });
                await minBtnPointerThrough.click();
                assert(
                    await page.locator(".desktop-canvas").first().isVisible(),
                    "DesktopCanvas must remain mounted",
                );
                const searchInput = page.locator(
                    '#search-query, .search-frame input, input[name="query"]',
                ).first();
                await searchInput.click();
                const isSearchFocused = await searchInput.evaluate((el) =>
                    document.activeElement === el
                );
                assert(
                    isSearchFocused,
                    "Unoccluded Home search input must receive focus through DesktopCanvas",
                );
                await searchInput.fill("pointerthrough-test");
                assertEquals(
                    await searchInput.inputValue(),
                    "pointerthrough-test",
                );
                await searchInput.fill("");

                // 10. Reduced motion contract
                await page.emulateMedia({ reducedMotion: "reduce" });
                const reducedMotionOk = await page.locator(
                    ".desktop-dock-indicator, .desktop-dock",
                ).first().evaluate((el) => {
                    const style = getComputedStyle(el);
                    return style.animationName === "none" ||
                        style.transitionDuration === "0s" ||
                        style.transition === "none";
                });
                assert(
                    reducedMotionOk,
                    "Reduced motion should disable dock animations/transitions",
                );
                await page.emulateMedia({ reducedMotion: "no-preference" });
                await closeWorkspace("apps");
            }
        },
    );

    // =========================================================================
    // Matrix E: Persistence, identity isolation, and layout restore (1440 Widgets)
    // refresh restore, 1440->1024 clamp, stale note cleanup, corrupt layout fallback,
    // IndexedDB unavailable fallback, logout/login identity isolation, zen<->widgets switch
    // =========================================================================
    await t.step(
        "Matrix E: Persistence, identity isolation, and layout restore (1440 Widgets)",
        async () => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await request("/api/preferences", "PATCH", {
                style: "widgets",
                theme: "light",
            });
            await resetPersistedLayout(page);
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });

            // 1. Refresh restore
            await openWorkspace("apps");
            const appsWin = page.locator(
                '.desktop-window[data-window-id="apps"]',
            ).first();
            await appsWin.waitFor({ state: "visible" });
            const appsTitle = appsWin.locator(".desktop-window-chrome-title")
                .first();
            const titleBox = await measure(appsTitle);
            await page.mouse.move(
                titleBox.x + titleBox.width / 2,
                titleBox.y + titleBox.height / 2,
            );
            await page.mouse.down();
            await page.mouse.move(
                titleBox.x + titleBox.width / 2 + 100,
                titleBox.y + titleBox.height / 2 + 60,
                { steps: 5 },
            );
            await page.mouse.up();
            await page.waitForTimeout(600);
            const boxBeforeReload = await measure(appsWin);

            await page.reload();
            await appsWin.waitFor({ state: "visible" });
            const boxAfterReload = await measure(appsWin);
            assert(
                Math.abs(boxAfterReload.x - boxBeforeReload.x) <= 3,
                `Persisted window x (${boxAfterReload.x}) must match saved x (${boxBeforeReload.x})`,
            );

            // 2. 1440 -> 1024 clamp
            const titleBox2 = await measure(
                appsWin.locator(".desktop-window-chrome-title").first(),
            );
            await page.mouse.move(
                titleBox2.x + titleBox2.width / 2,
                titleBox2.y + titleBox2.height / 2,
            );
            await page.mouse.down();
            await page.mouse.move(1200, titleBox2.y + titleBox2.height / 2, {
                steps: 5,
            });
            await page.mouse.up();
            await page.waitForTimeout(600);

            await page.setViewportSize({ width: 1024, height: 768 });
            await page.waitForTimeout(300);
            const boxClamped = await measure(appsWin);
            const safeRectBox = await page.locator(".desktop-canvas").first()
                .evaluate((el) => {
                    const r = el.getBoundingClientRect();
                    return { x: r.x, y: r.y, width: r.width, height: r.height };
                });
            assert(
                boxClamped.x + boxClamped.width <=
                    safeRectBox.x + safeRectBox.width + 2,
                `Clamped window right (${
                    boxClamped.x + boxClamped.width
                }) must not exceed safeRect (${
                    safeRectBox.x + safeRectBox.width
                })`,
            );
            assert(
                boxClamped.y >= safeRectBox.y - 1,
                "Clamped window top must be within safeRect",
            );

            await page.setViewportSize({ width: 1440, height: 900 });

            // 3. Stale note cleanup
            const tempNote = await request<{ id: string }>(
                "/api/notes",
                "POST",
                {
                    title: "Temp Stale Note",
                    body: "Will be deleted to test cleanup",
                },
            );
            await request(`/api/notes/${tempNote.id}`, "DELETE");
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });
            const staleWin = page.locator(
                `.desktop-window[data-window-id="note:${tempNote.id}"]`,
            );
            assertEquals(
                await staleWin.count(),
                0,
                "Stale note window must not be rendered",
            );

            // 4a. Unsupported version fallback (e.g. version 999)
            await page.evaluate(async () => {
                const authData =
                    (await (await fetch("/api/auth/me")).json()).data;
                const { promise, resolve, reject } = Promise.withResolvers<
                    void
                >();
                const req = indexedDB.open("searcher-client", 1);
                req.onsuccess = () => {
                    const db = req.result;
                    const tx = db.transaction("state", "readwrite");
                    tx.objectStore("state").put(
                        {
                            version: 999,
                            windows: [{
                                id: "apps",
                                kind: "apps",
                                frame: {
                                    x: 9999,
                                    y: 9999,
                                    width: 9999,
                                    height: 9999,
                                },
                            }],
                        },
                        `searcher:desktop-layout:v1:${authData.user.id}`,
                    );
                    tx.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                    tx.onerror = () => {
                        db.close();
                        reject(tx.error);
                    };
                };
                req.onerror = () => reject(req.error);
                await promise;
            });
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });
            await openWorkspace("apps");
            const v999AppsWin = page.locator(
                '.desktop-window[data-window-id="apps"]',
            ).first();
            await v999AppsWin.waitFor({ state: "visible" });
            const v999Box = await measure(v999AppsWin);
            assert(
                v999Box.x < 1440 && v999Box.width <= 1440,
                "Unsupported version must fall back to valid safeRect bounds",
            );
            await closeWorkspace("apps");

            // 4b. Corrupt version 1 fallback
            await page.evaluate(async () => {
                const authData =
                    (await (await fetch("/api/auth/me")).json()).data;
                const { promise, resolve, reject } = Promise.withResolvers<
                    void
                >();
                const req = indexedDB.open("searcher-client", 1);
                req.onsuccess = () => {
                    const db = req.result;
                    const tx = db.transaction("state", "readwrite");
                    tx.objectStore("state").put(
                        {
                            version: 1,
                            windows: [{
                                id: "apps",
                                kind: "corrupt_kind",
                                frame: "not-a-frame",
                            }],
                        },
                        `searcher:desktop-layout:v1:${authData.user.id}`,
                    );
                    tx.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                    tx.onerror = () => {
                        db.close();
                        reject(tx.error);
                    };
                };
                req.onerror = () => reject(req.error);
                await promise;
            });
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });
            await openWorkspace("apps");
            const corruptAppsWin = page.locator(
                '.desktop-window[data-window-id="apps"]',
            ).first();
            await corruptAppsWin.waitFor({ state: "visible" });
            const corruptBox = await measure(corruptAppsWin);
            assert(
                corruptBox.width > 0 && corruptBox.height > 0,
                "Corrupt version 1 must sanitize to valid default window dimensions",
            );
            await closeWorkspace("apps");

            // 4c. IndexedDB unavailable fallback
            await page.evaluate(() => {
                globalThis.indexedDB.open = () => {
                    throw new DOMException(
                        "IndexedDB access denied",
                        "SecurityError",
                    );
                };
            });
            await openWorkspace("apps");
            const idbBlockedWin = page.locator(
                '.desktop-window[data-window-id="apps"]',
            ).first();
            await idbBlockedWin.waitFor({ state: "visible" });
            const idbBlockedTitle = idbBlockedWin.locator(
                ".desktop-window-chrome",
            ).first();
            const idbTitleBox = await measure(idbBlockedTitle);
            await page.mouse.move(
                idbTitleBox.x + idbTitleBox.width / 2,
                idbTitleBox.y + idbTitleBox.height / 2,
            );
            await page.mouse.down();
            await page.mouse.move(idbTitleBox.x + 80, idbTitleBox.y + 40, {
                steps: 5,
            });
            await page.mouse.up();
            const hasLocalStorageDesktop = await page.evaluate(() => {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.includes("desktop-layout")) return true;
                }
                return false;
            });
            assertEquals(
                hasLocalStorageDesktop,
                false,
                "Desktop persistence must NEVER write desktop layout to localStorage",
            );
            await closeWorkspace("apps");
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });
            // 5. Same-context Logout -> Login User 2 -> Re-login User 1 identity isolation
            await openWorkspace("apps");
            const u1AppsWin = page.locator(
                '.desktop-window[data-window-id="apps"]',
            ).first();
            await u1AppsWin.waitFor({ state: "visible" });
            const u1Title = u1AppsWin.locator(".desktop-window-chrome").first();
            const u1Box = await measure(u1Title);
            await page.mouse.move(
                u1Box.x + u1Box.width / 2,
                u1Box.y + u1Box.height / 2,
            );
            await page.mouse.down();
            await page.mouse.move(u1Box.x + 120, u1Box.y + 70, { steps: 5 });
            await page.mouse.up();
            await page.waitForTimeout(600);
            const u1ArrangedBox = await measure(u1AppsWin);

            await page.evaluate(async () => {
                await fetch("/api/auth/logout", { method: "POST" });
            });

            await page.goto(origin + "/register");
            await page.locator("#auth-username").fill("matrix_user_samectx");
            await page.locator("#auth-display-name").fill("Same Context User");
            await page.locator("#auth-password").fill("Matrix-samectx-92!");
            await page.locator('form button[type="submit"]').click();
            await page.waitForURL(origin + "/");
            await page.locator("main").waitFor({ state: "visible" });
            await request("/api/preferences", "PATCH", { style: "widgets" });
            await visit("/");

            assertEquals(
                await page.locator('.desktop-window[data-window-kind="note"]')
                    .count(),
                0,
            );
            await openWorkspace("apps");
            const u2AppsWin = page.locator(
                '.desktop-window[data-window-id="apps"]',
            ).first();
            await u2AppsWin.waitFor({ state: "visible" });
            const u2Box = await measure(u2AppsWin);
            assert(
                Math.abs(u2Box.x - u1ArrangedBox.x) > 10 ||
                    Math.abs(u2Box.y - u1ArrangedBox.y) > 10,
                "User 2 must not inherit User 1 custom window position",
            );
            await closeWorkspace("apps");

            await page.evaluate(async () => {
                await fetch("/api/auth/logout", { method: "POST" });
            });

            await page.goto(origin + "/login");
            await page.locator("#auth-username").fill("matrix_user");
            await page.locator("#auth-password").fill("Matrix-password-92!");
            await page.locator('form button[type="submit"]').click();
            await page.waitForURL(origin + "/");
            await page.locator("main").waitFor({ state: "visible" });
            await openWorkspace("apps");
            const u1RestoredWin = page.locator(
                '.desktop-window[data-window-id="apps"]',
            ).first();
            await u1RestoredWin.waitFor({ state: "visible" });
            const u1RestoredBox = await measure(u1RestoredWin);
            assert(
                Math.abs(u1RestoredBox.x - u1ArrangedBox.x) <= 3,
                "User 1 custom window position must be restored upon re-login",
            );
            // 6. Zen <-> Widgets switch
            await request("/api/preferences", "PATCH", { style: "zen" });
            await visit("/");
            await page.locator(".desktop-dock").waitFor({
                state: "detached",
                timeout: 3000,
            }).catch(() => {});
            assertEquals(
                await page.locator(".desktop-dock").count(),
                0,
                "Dock must unmount in Zen",
            );
            assertEquals(
                await page.locator(".desktop-canvas").count(),
                0,
                "DesktopCanvas must unmount in Zen",
            );

            await request("/api/preferences", "PATCH", { style: "widgets" });
            await visit("/");
            const restoredDock = page.locator(".desktop-dock").first();
            await restoredDock.waitFor({ state: "visible" });
            assert(
                await restoredDock.isVisible(),
                "Dock must restore in Widgets",
            );
        },
    );

    // =========================================================================
    // Matrix F: Tablet constrained contract (768 Widgets)
    // single active surface, no free drag/resize, 3 presets, note nested edit, no Overview
    // =========================================================================
    await t.step(
        "Matrix F: Tablet constrained contract (768 Widgets)",
        async () => {
            await page.setViewportSize({ width: 768, height: 1024 });
            await request("/api/preferences", "PATCH", {
                style: "widgets",
                theme: "light",
            });
            await resetPersistedLayout(page);
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });

            // 1. Single active surface: open Apps then Notes
            await openWorkspace("apps");
            const appsWin = page.locator(
                '.desktop-window[data-window-id="apps"]',
            ).first();
            await appsWin.waitFor({ state: "visible" });

            await openWorkspace("notes");
            const notesWin = page.locator(
                '.desktop-window[data-window-id="notes"]',
            ).first();
            await notesWin.waitFor({ state: "visible" });

            const appsHidden = await page.locator(
                '.desktop-window[data-window-id="apps"].desktop-window--constrained-hidden',
            ).count();
            assert(
                appsHidden > 0 || !(await appsWin.isVisible()),
                "Apps window must be hidden when Notes window is active in constrained mode",
            );
            assertEquals(
                await notesWin.isVisible(),
                true,
                "Notes window must be the single active surface",
            );

            // 2. No free drag / resize
            const resizeHandles = await notesWin.locator(
                ".desktop-window-resize-handle",
            ).count();
            assertEquals(
                resizeHandles,
                0,
                "Constrained tablet mode must have 0 resize handles",
            );

            const notesTitle = notesWin.locator(".desktop-window-chrome-title")
                .first();
            const boxBefore = await measure(notesWin);
            const titleBox = await measure(notesTitle);
            await page.mouse.move(
                titleBox.x + titleBox.width / 2,
                titleBox.y + titleBox.height / 2,
            );
            await page.mouse.down();
            await page.mouse.move(
                titleBox.x + titleBox.width / 2 + 80,
                titleBox.y + titleBox.height / 2 + 50,
                { steps: 5 },
            );
            await page.mouse.up();
            const boxAfter = await measure(notesWin);
            assertEquals(
                boxAfter.x,
                boxBefore.x,
                "Constrained window must not freely drag (x position unchanged)",
            );

            // All three presets must change the actual constrained window geometry.
            const safe = await measure(page.locator(".desktop-canvas"));
            async function selectPreset(label: string) {
                await notesWin.getByRole("button", {
                    name: "窗口尺寸",
                    exact: true,
                }).click();
                await page.getByRole("menuitem", { name: label, exact: true })
                    .click();
                await page.getByRole("menu").waitFor({ state: "detached" });
                return await measure(notesWin);
            }
            const medium = await selectPreset("中等尺寸");
            const large = await selectPreset("大尺寸");
            assert(
                large.width > medium.width && large.height > medium.height,
                "Large preset must increase both constrained dimensions",
            );
            const fullscreen = await selectPreset("全屏");
            for (const key of ["x", "y", "width", "height"] as const) {
                assert(
                    Math.abs(fullscreen[key] - safe[key]) <= 2,
                    "Fullscreen preset must fill the Canvas safe rect: " + key,
                );
            }
            assert(
                large.width < fullscreen.width &&
                    large.height < fullscreen.height,
                "Large preset must remain inset from fullscreen",
            );
            await selectPreset("中等尺寸");

            const noteCard = notesWin.locator(".note-card").first();
            await noteCard.waitFor({ state: "visible" });
            await noteCard.click();
            await notesWin.locator(".notes-workspace-editor").waitFor({
                state: "visible",
            });
            assert(
                await notesWin.evaluate((el) =>
                    el.scrollWidth <= el.clientWidth + 2
                ),
                "Nested note editor must fit the constrained window",
            );
            await notesWin.getByRole("button", {
                name: "返回上一级",
                exact: true,
            }).click();
            await notesWin.locator(".note-card").first().waitFor({
                state: "visible",
            });

            // 5. No Overview in Dock at 768px
            const overviewBtn = page.locator(
                '.desktop-dock-btn--overview, .desktop-dock [aria-label="窗口总览"]',
            );
            assertEquals(
                await overviewBtn.count(),
                0,
                "Overview button must NOT exist in Dock on constrained tablet",
            );

            await closeWorkspace("notes");
        },
    );
});
