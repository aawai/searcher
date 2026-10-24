import { createEvidenceDirectory } from "./helpers/evidence.ts";
import { libraryPanel, openNotes } from "./helpers/library.ts";
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
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
 * Matrix C: Documents states (root/edit/empty/loading/error) at 390 mobile and 1440
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
    await request<{ id: string }>("/api/documents", "POST", {
        title: "Welcome Note",
        body: "First note content for matrix verification",
        color: "amber",
    });

    async function openWorkspace(target: Page = page) {
        await openNotes(target);
    }

    async function closeWorkspace(target: Page = page) {
        const detail = libraryPanel(target);
        if (await detail.isVisible()) {
            await detail.getByRole("button", {
                name: "关闭资料库",
                exact: true,
            }).click();
            await detail.waitFor({ state: "detached" });
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
                    await openWorkspace();
                    if (vp.width < 768) {
                        await libraryPanel(page).and(
                            page.getByRole("dialog"),
                        ).waitFor({ state: "visible" });
                        await libraryPanel(page).getByRole("button", {
                            name: "返回资料库",
                            exact: true,
                        }).waitFor({ state: "visible" });
                    } else {
                        assertEquals(
                            await page.locator("#search-query").evaluate((el) =>
                                Boolean(el.closest("[inert]"))
                            ),
                            false,
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

            await openWorkspace();
            const sheet = libraryPanel(page);
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
    // Matrix C: Documents states (root/edit/empty) at 390 mobile
    // =========================================================================
    await t.step(
        "Matrix C: Documents states (root/edit/empty) at 390 mobile",
        async () => {
            // Part 1: 390 Mobile
            await page.setViewportSize({ width: 390, height: 844 });
            await request("/api/preferences", "PATCH", {
                theme: "light",
            });
            await visit("/");

            // 1e. Documents root state
            await openWorkspace();
            const documentsPanel = libraryPanel(page);
            await documentsPanel.and(page.getByRole("dialog"))
                .waitFor({ state: "visible" });
            await documentsPanel.locator("[data-document-id]").first()
                .waitFor({ state: "visible" });

            // 1f. Documents edit state
            const docCard = documentsPanel.locator("[data-document-id]")
                .first();
            await docCard.waitFor({ state: "visible" });
            await docCard.locator("h4 button, .documents-summary-open").click();
            const docEditor = documentsPanel.locator(
                ".document-editor-container, [data-workspace-editor]",
            ).first();
            await docEditor.waitFor({ state: "visible" });
            const mobileDocBack = documentsPanel.locator(
                'button[aria-label="返回上一级"]',
            ).first();
            await mobileDocBack.waitFor({ state: "visible" });
            await mobileDocBack.click();
            await documentsPanel.locator("[data-document-id]").first()
                .waitFor({ state: "visible" });

            // 1g. Documents empty state
            const documentsSearch = documentsPanel.locator(
                "input[data-workspace-search], input[type='search']",
            ).first();
            await documentsSearch.waitFor({ state: "visible" });
            await documentsSearch.fill("xyznonexistent");
            const documentsEmpty = documentsPanel.locator(
                ".empty-state, [data-slot='empty-state']",
            ).first();
            await documentsEmpty.waitFor({ state: "visible" });
            await documentsSearch.fill("");
            await documentsPanel.locator("[data-document-id]").first()
                .waitFor({ state: "visible" });
            await closeWorkspace();
            await visit("/");
        },
    );

    // =========================================================================
    // Matrix C (loading/error): Apps/Documents loading, error and retry at 390 and 1440
    // =========================================================================
    await t.step(
        "Matrix C: Documents loading, error and retry at 390 and 1440",
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
                const targetPath = "/api/documents";
                const isTarget = (url: URL) => url.pathname === targetPath;
                const getSurface = () => libraryPanel(page);
                const rows = "[data-document-id]";
                const gate = Promise.withResolvers<void>();
                await page.route(isTarget, async (route) => {
                    if (route.request().method() === "GET") {
                        await gate.promise;
                    }
                    await route.continue();
                });
                try {
                    await visit("/");
                    await openWorkspace();
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
                    isTarget,
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
                    await openWorkspace();
                    const surface = getSurface();
                    const alert = surface.locator(
                        '.status-banner[role="alert"]',
                    );
                    await alert.waitFor({ state: "visible" });
                    assert(
                        (await alert.textContent())?.includes(message),
                        "documents must expose its network failure to the user",
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
        },
    );
});
