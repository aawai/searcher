import { assertEquals, assertStringIncludes } from "@std/assert";
import { libraryPanel, openNotes } from "./helpers/library.ts";
import { type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

// Focused behavioral contracts for Workspace (#80)
// Run with: deno task test:workspace
Deno.test("production workspace #80 behavioral contracts", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({
        prefix: "searcher_workspace_contract_",
    });
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
        viewport: { width: 1280, height: 800 },
        colorScheme: "light",
    });
    const page = await context.newPage();

    const username = "contract_tester_80";
    const password = "Contract-password-80!";

    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor();
    }

    // Register primary user
    await visit("/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Contract Tester");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor();

    await visit("/");

    function getWorkspace() {
        return libraryPanel(page);
    }

    async function openWorkspace() {
        if (!(await getWorkspace().isVisible())) {
            await openNotes(page);
        }
        await getWorkspace().waitFor({ state: "visible" });
    }

    // 1. Heading hierarchy contract: h2 panel -> h3 subsection with accessible regions
    await t.step(
        "Heading hierarchy contract: h2 panel -> h3 subsection with accessible regions (no skipping levels)",
        async () => {
            await openWorkspace();
            const documentsPanel = getWorkspace();
            await documentsPanel.waitFor({ state: "visible" });

            const documentsTitle = documentsPanel.locator(
                ".workspace-title, h2",
            );
            await documentsTitle.first().waitFor({ state: "visible" });
            assertEquals(await documentsTitle.first().textContent(), "笔记");

            const documentsSubH3 = documentsPanel.getByRole("heading", {
                name: "全部笔记",
                level: 3,
            });
            await documentsSubH3.waitFor({ state: "visible" });
            assertEquals(await documentsSubH3.textContent(), "全部笔记");

            const documentsRegion = documentsPanel.getByRole("region", {
                name: "全部笔记",
            });
            await documentsRegion.waitFor({ state: "visible" });

            // Verify strict heading levels in documents panel
            const documentsHeadings = await documentsPanel.evaluate((el) =>
                Array.from(el.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((
                    h,
                ) => ({
                    tag: h.tagName.toLowerCase(),
                    text: h.textContent?.trim(),
                    level: Number(h.tagName.substring(1)),
                }))
            );
            assertEquals(documentsHeadings.some((h) => h.tag === "h1"), false);
            assertEquals(documentsHeadings.some((h) => h.tag === "h4"), false);
            assertEquals(documentsHeadings.some((h) => h.tag === "h5"), false);
            assertEquals(
                documentsHeadings.filter((h) => h.tag === "h3").length >= 1,
                true,
            );
        },
    );

    // 2. Documents root canonical EmptyState contract
    await t.step(
        "Documents root canonical EmptyState contract (h3, compact)",
        async () => {
            await openWorkspace();
            const rootEmpty = getWorkspace().locator(
                ".workspace-body .empty-state",
            );
            await rootEmpty.waitFor({ state: "visible" });
            assertEquals(
                await rootEmpty.getAttribute("data-density"),
                "compact",
            );
            await rootEmpty.getByRole("heading", { level: 3 }).waitFor({
                state: "visible",
            });
        },
    );

    // 3. Section count and search results contract
    await t.step(
        "Section count and search results contract: visible count and '搜索结果' region in Documents",
        async () => {
            // Seed 2 documents
            await page.evaluate(async () => {
                await fetch("/api/documents", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "Alpha Document",
                        body: "Alpha content",
                    }),
                });
                await fetch("/api/documents", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "Beta Document",
                        body: "Beta content",
                    }),
                });
            });

            // Reload page to reflect seeded data
            await page.reload();
            await page.locator("main").waitFor();

            // B. Documents Workspace: section count & search
            await openWorkspace();
            const documentsPanel = getWorkspace();
            await documentsPanel.waitFor({ state: "visible" });
            const documentsRegion = documentsPanel.getByRole("region", {
                name: "全部笔记",
            });
            await documentsRegion.waitFor({ state: "visible" });

            // Section count shows the two seeded documents
            const documentsCount = documentsRegion.locator(
                ".workspace-section-count",
            );
            await documentsCount.waitFor({ state: "visible" });
            assertEquals(await documentsCount.textContent(), "2");

            // Perform search in Documents
            const documentsSearchInput = documentsPanel.locator(
                "input[data-workspace-search]",
            );
            await documentsSearchInput.fill("Beta");

            // "全部笔记" region transforms into "搜索结果"
            const documentsSearchRegion = documentsPanel.getByRole("region", {
                name: "搜索结果",
            });
            await documentsSearchRegion.waitFor({ state: "visible" });
            assertEquals(
                await documentsPanel.getByRole("region", { name: "全部笔记" })
                    .count(),
                0,
            );

            // Section count shows 1
            const documentsSearchCount = documentsSearchRegion.locator(
                ".workspace-section-count",
            );
            await documentsSearchCount.waitFor({ state: "visible" });
            assertEquals(await documentsSearchCount.textContent(), "1");
            assertStringIncludes(
                await documentsSearchRegion.textContent() ?? "",
                "Beta Document",
            );

            // Clear search restores the full list
            await documentsSearchInput.fill("");
            await documentsRegion.waitFor({ state: "visible" });
            await documentsRegion.locator(".workspace-section-count").filter({
                hasText: /^2$/,
            }).waitFor({ state: "visible" });
        },
    );

    // 4. Empty search action contract: EmptyState with '清空搜索' action clears query and restores items
    await t.step(
        "Empty search action contract: EmptyState with '清空搜索' action clears query and restores items",
        async () => {
            await openWorkspace();
            const documentsPanel = getWorkspace();
            const searchInput = documentsPanel.locator(
                "input[data-workspace-search]",
            );
            await searchInput.fill("__nonexistent_query_xyz__");

            const searchRegion = documentsPanel.getByRole("region", {
                name: "搜索结果",
            });
            await searchRegion.waitFor({ state: "visible" });

            // EmptyState with heading level 3 and compact density
            const emptyState = searchRegion.locator(".empty-state");
            await emptyState.waitFor({ state: "visible" });
            assertEquals(
                await emptyState.getAttribute("data-density"),
                "compact",
            );
            await emptyState.getByRole("heading", { level: 3 }).waitFor({
                state: "visible",
            });

            // Action button "清空搜索" is present
            const clearBtn = emptyState.getByRole("button", {
                name: "清空搜索",
            });
            await clearBtn.waitFor({ state: "visible" });

            // Click "清空搜索" -> clears query and restores full list
            await clearBtn.click();
            assertEquals(await searchInput.inputValue(), "");

            const region = documentsPanel.getByRole("region", {
                name: "全部笔记",
            });
            await region.waitFor({ state: "visible" });
            await region.getByText("Alpha Document").waitFor({
                state: "visible",
            });
            await region.getByText("Beta Document").waitFor({
                state: "visible",
            });
        },
    );

    // 5. Loading and error live roles + retry contract
    await t.step(
        "Loading and error live roles + retry contract",
        async () => {
            // A. Error state with alert live role and retry button
            const failList = (url: URL) => url.pathname === "/api/documents";
            await page.route(failList, (route) => {
                if (route.request().method() === "GET") {
                    route.fulfill({
                        status: 500,
                        contentType: "application/json",
                        body: JSON.stringify({ message: "笔记服务内部错误" }),
                    });
                } else {
                    route.continue();
                }
            });

            await page.reload();
            await openWorkspace();
            const errorPanel = getWorkspace();

            // StatusBanner tone="error" has role="alert" and data-density="compact"
            const alertBanner = errorPanel.locator(
                '.status-banner[role="alert"][data-density="compact"]',
            );
            await alertBanner.waitFor({ state: "visible" });
            assertStringIncludes(
                await alertBanner.textContent() ?? "",
                "笔记服务内部错误",
            );

            // Has retry button
            const retryBtn = alertBanner.getByRole("button", { name: "重试" });
            await retryBtn.waitFor({ state: "visible" });

            // Unmock error route and click retry -> loads successfully
            await page.unroute(failList);
            await retryBtn.click();
            await alertBanner.waitFor({ state: "hidden" });
            await errorPanel.getByRole("region", { name: "全部笔记" })
                .waitFor({ state: "visible" });

            // B. Loading state with status live role in Documents
            const documentsGate = Promise.withResolvers<void>();
            let documentsUnrouted = false;
            const documentsListUrl = (url: URL) =>
                url.pathname === "/api/documents";
            await page.route(documentsListUrl, async (route) => {
                if (route.request().method() === "GET") {
                    await documentsGate.promise;
                }
                if (!documentsUnrouted) {
                    try {
                        await route.continue();
                    } catch {
                        // request may have finished or navigated
                    }
                }
            });

            // Trigger refetch by reloading
            await page.reload();
            await openWorkspace();
            const documentsPanel = getWorkspace();
            await documentsPanel.waitFor({ state: "visible" });

            const loadingState = documentsPanel.locator(
                '.loading-state[role="status"][data-density="compact"]',
            );
            await loadingState.waitFor({ state: "visible" });
            assertStringIncludes(
                await loadingState.textContent() ?? "",
                "正在加载笔记",
            );

            // Release gate and wait for loading state to finish before unrouting
            documentsGate.resolve();
            await loadingState.waitFor({ state: "hidden" });
            documentsUnrouted = true;
            await page.unroute(documentsListUrl);
            await documentsPanel.getByRole("region", { name: "全部笔记" })
                .waitFor({ state: "visible" });
        },
    );
});
