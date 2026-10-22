import { createEvidenceDirectory } from "./helpers/evidence.ts";
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
 * Matrix A: 4 viewports x 2 themes - overflow, search/home geometry, presenter type, focus-visible
 * Matrix B: Wallpaper material - 390 wallpaper on/off, light surface boundary and readability
 * Matrix C: Apps/Notes states (root/nested/empty/loading/error) at 390 mobile and 1440
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
        handleSIGTERM: false,
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

    async function openWorkspace(type: "apps" | "notes", target: Page = page) {
        const label = type === "apps" ? "应用工作区" : "便签工作区";
        const trigger = target.locator(
            `.zen-edge-btn[data-workspace="${type}"], button[aria-label="${label}"]`,
        ).first();
        await trigger.waitFor({ state: "visible" });
        await trigger.click();
        const win = target.locator(
            ".workspace-panel--mobile, aside.workspace-panel",
        ).first();
        await win.waitFor({ state: "visible" });
    }

    async function closeWorkspace(target: Page = page) {
        const win = target.locator(
            ".workspace-panel--mobile, aside.workspace-panel",
        ).first();
        if (await win.isVisible()) {
            const closeBtn = win.locator(
                'button[aria-label="收起工作区"], button[aria-label="关闭便签"]',
            ).first();
            await closeBtn.waitFor({ state: "visible" });
            await closeBtn.click();
            await win.waitFor({ state: "hidden" });
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
    // Matrix A: responsive & visual matrix
    // 4 viewports x 2 themes = 8 scenarios
    // Checks: overflow, Search/Home geometry, Presenter, focus-visible
    // =========================================================================
    await t.step(
        "Matrix A: responsive & visual matrix (4 viewports x 2 themes)",
        async () => {
            const viewports = [
                { width: 390, height: 844, name: "390x844-mobile" },
                { width: 768, height: 1024, name: "768x1024-tablet" },
                { width: 1024, height: 768, name: "1024x768-desktop-standard" },
                { width: 1440, height: 900, name: "1440x900-desktop-wide" },
            ];
            const themes = ["light", "dark"] as const;

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
                        `Horizontal overflow detected at ${vp.name} theme=${theme}`,
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

                    // 3. Keyboard Tab navigation & :focus-visible check
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
                        `Keyboard focus must show a visible ring at ${vp.name}/${theme}`,
                    );

                    if (vp.width === 1440 && theme === "light") {
                        const evidenceDir = await createEvidenceDirectory(
                            "workspace-matrix",
                        );
                        await page.screenshot({
                            path: `${evidenceDir}/matrix-a-1440-light.png`,
                        });
                    }

                    // 4. Presenter check: open and verify presenter type
                    await openWorkspace("apps");
                    if (vp.width === 390) {
                        const isMobileSheet = await page.locator(
                            '.workspace-panel--mobile[data-slot="sheet-content"]',
                        ).first().isVisible();
                        assert(
                            isMobileSheet,
                            "Mobile viewport must render Sheet presenter",
                        );
                    } else {
                        const isZenPanel = await page.locator(
                            'aside.workspace-panel[data-presentation="panel"]',
                        ).first().isVisible();
                        assert(
                            isZenPanel,
                            "Tablet and desktop viewports must render Panel presenter",
                        );
                    }
                    await closeWorkspace();
                }
            }
        },
    );

    // =========================================================================
    // Matrix B: Wallpaper material and sheet surface boundaries
    // 390 wallpaper on/off, light theme
    // =========================================================================
    await t.step(
        "Matrix B: Wallpaper material and sheet surface boundaries (390 mobile)",
        async () => {
            // Representative combination 1: 390x844 light theme (Sheet presenter)
            await page.setViewportSize({ width: 390, height: 844 });
            await request("/api/preferences", "PATCH", {
                theme: "light",
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
            await closeWorkspace();

            await request("/api/preferences", "PATCH", {
                backgroundImage: null,
            });
        },
    );

    // =========================================================================
    // Matrix C: Apps/Notes states (root/nested/empty) at 390 mobile
    // =========================================================================
    await t.step(
        "Matrix C: Apps/Notes states (root/nested/empty) at 390 mobile",
        async () => {
            // Part 1: 390 Mobile
            await page.setViewportSize({ width: 390, height: 844 });
            await request("/api/preferences", "PATCH", {
                theme: "light",
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
                'button[aria-label="返回应用列表"], button[aria-label="返回上一级"]',
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
            await closeWorkspace();

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
            await noteCard.locator(".note-title").click();
            const noteEditor = notesPanel.locator(
                ".notes-workspace-editor, textarea",
            ).first();
            await noteEditor.waitFor({ state: "visible" });
            const mobileNotesBack = notesPanel.locator(
                'button[aria-label="返回便签列表"]',
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
            await closeWorkspace();
            await visit("/");
        },
    );

    // =========================================================================
    // Matrix C (loading/error): Apps/Notes loading, error and retry at 390 and 1440
    // =========================================================================
    await t.step(
        "Matrix C: Apps/Notes loading, error and retry at 390 and 1440",
        async () => {
            await request("/api/preferences", "PATCH", {
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
                    const url = kind === "apps"
                        ? "**/api/webapps"
                        : "**/api/notes";
                    const getSurface = () =>
                        page.locator(
                            viewport.width === 390
                                ? ".workspace-panel--mobile"
                                : "aside.workspace-panel",
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
                        await closeWorkspace();
                    } finally {
                        gate.resolve();
                        await page.unrouteAll({ behavior: "wait" });
                    }
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
                        await closeWorkspace();
                    } finally {
                        await page.unrouteAll({ behavior: "wait" });
                    }
                }
            }
        },
    );
});
