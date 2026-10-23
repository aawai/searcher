import { assertEquals, assertStringIncludes } from "@std/assert";
import { chromium, type Page } from "playwright";
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

    function getWorkspace(type: "apps" | "documents") {
        const label = type === "apps" ? "应用工作区" : "笔记工作区";
        return page.locator(`aside.workspace-panel[aria-label="${label}"]`);
    }

    async function openWorkspace(type: "apps" | "documents") {
        const target = getWorkspace(type);
        const openTarget = page.locator(
            `aside.workspace-panel:not([data-ending-style])[aria-label="${
                type === "apps" ? "应用工作区" : "笔记工作区"
            }"]`,
        );
        if ((await openTarget.count()) === 0) {
            const openPanel = page.locator(
                "aside.workspace-panel:not([data-ending-style])",
            );
            if (await openPanel.count() > 0) {
                // The Dock is hidden while a panel is open; switch via header tabs.
                await openPanel.getByRole("tab", {
                    name: type === "apps" ? "应用工作区" : "笔记工作区",
                    exact: true,
                }).click();
            } else {
                await page.locator(
                    `.zen-edge-trigger button[data-workspace="${type}"]`,
                ).click();
            }
        }
        await target.waitFor({ state: "visible" });
    }
    // 1. Heading hierarchy contract: h2 panel -> h3 subsection with accessible regions
    await t.step(
        "Heading hierarchy contract: h2 panel -> h3 subsection with accessible regions (no skipping levels)",
        async () => {
            // Open Apps Workspace
            await openWorkspace("apps");
            const appsPanel = getWorkspace("apps");
            await appsPanel.waitFor({ state: "visible" });

            // Title is accessible (chrome title or h2 in surface)
            const appsTitle = appsPanel.locator(
                ".workspace-title, h2",
            );
            await appsTitle.first().waitFor({ state: "visible" });
            assertEquals(await appsTitle.first().textContent(), "应用");

            // Subsection is h3 in an accessible region
            const appsSubH3 = appsPanel.getByRole("heading", {
                name: "全部应用",
                level: 3,
            });
            await appsSubH3.waitFor({ state: "visible" });
            assertEquals(await appsSubH3.textContent(), "全部应用");

            const appsRegion = appsPanel.getByRole("region", {
                name: "全部应用",
            });
            await appsRegion.waitFor({ state: "visible" });

            // Verify strict heading levels inside panel (no skipping levels)
            const appsHeadings = await appsPanel.evaluate((el) =>
                Array.from(el.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((
                    h,
                ) => ({
                    tag: h.tagName.toLowerCase(),
                    text: h.textContent?.trim(),
                    level: Number(h.tagName.substring(1)),
                }))
            );
            assertEquals(appsHeadings.some((h) => h.tag === "h1"), false);
            assertEquals(appsHeadings.some((h) => h.tag === "h4"), false);
            assertEquals(appsHeadings.some((h) => h.tag === "h5"), false);
            assertEquals(
                appsHeadings.filter((h) => h.tag === "h3").length >= 1,
                true,
            );

            // Open Documents Workspace
            await openWorkspace("documents");
            const documentsPanel = getWorkspace("documents");
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

    // 2. Computed typography & spacing parity between Apps and Documents
    await t.step(
        "Typography & spacing contract: Apps and Documents section titles computed styles parity",
        async () => {
            // Measure Documents workspace h3 & header
            await openWorkspace("documents");
            const documentsPanel = getWorkspace("documents");
            await documentsPanel.getByRole("heading", {
                name: "全部笔记",
                level: 3,
            })
                .waitFor({ state: "visible" });

            const documentsStyles = await documentsPanel.evaluate((el) => {
                const title = el.querySelector(".workspace-section-title");
                if (!title) return null;
                const cs = globalThis.getComputedStyle(title);
                const header = title.closest(".workspace-section-header");
                const hcs = header ? globalThis.getComputedStyle(header) : null;
                const section = title.closest(".workspace-section");
                const scs = section
                    ? globalThis.getComputedStyle(section)
                    : null;
                return {
                    fontSize: cs.fontSize,
                    lineHeight: cs.lineHeight,
                    fontWeight: cs.fontWeight,
                    marginTop: cs.marginTop,
                    marginBottom: cs.marginBottom,
                    headerDisplay: hcs?.display,
                    headerGap: hcs?.gap,
                    sectionDisplay: scs?.display,
                    sectionGap: scs?.gap,
                };
            });

            // Switch to Apps workspace and measure
            await openWorkspace("apps");
            const appsPanel = getWorkspace("apps");
            await appsPanel.getByRole("heading", { name: "全部应用", level: 3 })
                .waitFor({ state: "visible" });

            const appsStyles = await appsPanel.evaluate((el) => {
                const title = el.querySelector(".workspace-section-title");
                if (!title) return null;
                const cs = globalThis.getComputedStyle(title);
                const header = title.closest(".workspace-section-header");
                const hcs = header ? globalThis.getComputedStyle(header) : null;
                const section = title.closest(".workspace-section");
                const scs = section
                    ? globalThis.getComputedStyle(section)
                    : null;
                return {
                    fontSize: cs.fontSize,
                    lineHeight: cs.lineHeight,
                    fontWeight: cs.fontWeight,
                    marginTop: cs.marginTop,
                    marginBottom: cs.marginBottom,
                    headerDisplay: hcs?.display,
                    headerGap: hcs?.gap,
                    sectionDisplay: scs?.display,
                    sectionGap: scs?.gap,
                };
            });

            assertEquals(Boolean(documentsStyles), true);
            assertEquals(Boolean(appsStyles), true);

            // Assert exact parity for typography & spacing
            assertEquals(appsStyles?.fontSize, documentsStyles?.fontSize);
            assertEquals(appsStyles?.lineHeight, documentsStyles?.lineHeight);
            assertEquals(appsStyles?.fontWeight, documentsStyles?.fontWeight);
            assertEquals(appsStyles?.marginTop, documentsStyles?.marginTop);
            assertEquals(
                appsStyles?.marginBottom,
                documentsStyles?.marginBottom,
            );
            assertEquals(
                appsStyles?.headerDisplay,
                documentsStyles?.headerDisplay,
            );
            assertEquals(appsStyles?.headerGap, documentsStyles?.headerGap);
            assertEquals(
                appsStyles?.sectionDisplay,
                documentsStyles?.sectionDisplay,
            );
            assertEquals(appsStyles?.sectionGap, documentsStyles?.sectionGap);
        },
    );
    // 2.5. Apps root and empty folder canonical EmptyState contract
    await t.step(
        "Apps root and empty folder canonical EmptyState contract (h3, compact, header primary action)",
        async () => {
            await openWorkspace("apps");
            const appsPanel = getWorkspace("apps");
            await appsPanel.waitFor({ state: "visible" });

            // A. Root empty state (0 apps)
            const rootEmpty = appsPanel.locator(".workspace-body .empty-state");
            await rootEmpty.waitFor({ state: "visible" });
            assertEquals(
                await rootEmpty.getAttribute("data-density"),
                "compact",
            );
            const emptyH3 = rootEmpty.getByRole("heading", { level: 3 });
            await emptyH3.waitFor({ state: "visible" });

            // Header primary is the sole create action: icon button labelled 添加应用
            const addBtn = appsPanel.locator(
                ".workspace-header .workspace-primary",
            );
            await addBtn.waitFor({ state: "visible" });
            assertEquals(await addBtn.getAttribute("aria-label"), "添加应用");

            // Clicking header "添加应用" navigates to AppForm
            await addBtn.click();
            // The panel label follows the view title (添加应用工作区 in the form),
            // so locate the panel by the form it contains.
            const formPanel = page.locator(
                "aside.workspace-panel:has(.apps-workspace-form)",
            );
            await formPanel.locator(".apps-workspace-form").waitFor({
                state: "visible",
            });
            await formPanel.locator('button[aria-label="返回上一级"]').click();
            await rootEmpty.waitFor({ state: "visible" });
            // B. Empty folder state (0 apps in group)
            const groupId = await page.evaluate(async () => {
                const res = await fetch("/api/webapp-groups", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: "空测试文件夹" }),
                });
                const payload: { data?: { id?: string } } = await res.json();
                return payload.data?.id ?? "";
            });

            await page.reload();
            await openWorkspace("apps");
            const folderCard = appsPanel.getByRole("button", {
                name: /空测试文件夹/,
            });
            await folderCard.waitFor({ state: "visible" });
            await folderCard.click();

            // Inside folder: section heading is folder name (h3) and count is 0
            const folderRegion = appsPanel.getByRole("region", {
                name: "空测试文件夹",
                exact: true,
            });
            const folderH3 = folderRegion.locator("h3.workspace-section-title");
            await folderH3.waitFor({ state: "visible" });
            assertEquals(await folderH3.textContent(), "空测试文件夹");
            const folderCount = folderRegion.locator(
                ".workspace-section-count",
            );
            assertEquals(await folderCount.textContent(), "0");

            // Folder body renders canonical EmptyState with heading level 3 and compact density
            const folderEmpty = appsPanel.locator(
                ".workspace-body .empty-state",
            );
            await folderEmpty.waitFor({ state: "visible" });
            assertEquals(
                await folderEmpty.getAttribute("data-density"),
                "compact",
            );
            const folderEmptyH3 = folderEmpty.getByRole("heading", {
                level: 3,
            });
            await folderEmptyH3.waitFor({ state: "visible" });

            // Header primary button navigates to create inside folder
            await addBtn.click();
            await formPanel.locator(".apps-workspace-form").waitFor({
                state: "visible",
            });
            await formPanel.locator('button[aria-label="返回上一级"]').click();
            await folderEmpty.waitFor({ state: "visible" });

            // Return to root and clean up group
            await appsPanel.locator('button[aria-label="返回应用列表"]')
                .click();
            await page.evaluate(async (id) => {
                await fetch(`/api/webapp-groups/${id}`, { method: "DELETE" });
            }, groupId);
            await page.reload();
        },
    );

    // 3. Section count and search results contract
    await t.step(
        "Section count and search results contract: visible count and '搜索结果' region in Apps and Documents",
        async () => {
            // Seed 2 webapps
            await page.evaluate(async () => {
                await fetch("/api/webapps", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: "Alpha Tool",
                        url: "https://alpha.example.com",
                    }),
                });
                await fetch("/api/webapps", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: "Beta Dashboard",
                        url: "https://beta.example.com",
                    }),
                });
            });

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

            // A. Test Apps Workspace: count badge & search
            await openWorkspace("apps");
            const appsPanel = getWorkspace("apps");
            await appsPanel.waitFor({ state: "visible" });

            const appsRegion = appsPanel.getByRole("region", {
                name: "全部应用",
            });
            await appsRegion.waitFor({ state: "visible" });

            // Section count in header is visible and shows count 2
            const appsCount = appsRegion.locator(".workspace-section-count");
            await appsCount.waitFor({ state: "visible" });
            assertEquals(await appsCount.textContent(), "2");

            // Perform search in Apps
            const appsSearchInput = appsPanel.locator(
                "input[data-workspace-search]",
            );
            await appsSearchInput.fill("Alpha");

            // Region transforms into "搜索结果"
            const appsSearchRegion = appsPanel.getByRole("region", {
                name: "搜索结果",
            });
            await appsSearchRegion.waitFor({ state: "visible" });
            const appsSearchH3 = appsPanel.getByRole("heading", {
                name: "搜索结果",
                level: 3,
            });
            await appsSearchH3.waitFor({ state: "visible" });

            // Section count in search results shows 1
            const searchCount = appsSearchRegion.locator(
                ".workspace-section-count",
            );
            await searchCount.waitFor({ state: "visible" });
            assertEquals(await searchCount.textContent(), "1");

            // Matching app is displayed
            assertStringIncludes(
                await appsSearchRegion.textContent() ?? "",
                "Alpha Tool",
            );
            assertEquals(
                (await appsSearchRegion.textContent() ?? "").includes(
                    "Beta Dashboard",
                ),
                false,
            );

            // Clear search restores "全部应用"
            await appsSearchInput.fill("");
            await appsRegion.waitFor({ state: "visible" });
            assertEquals(await appsCount.textContent(), "2");

            // B. Documents Workspace: section count & search
            await openWorkspace("documents");
            const documentsPanel = getWorkspace("documents");
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
            await openWorkspace("apps");
            const appsPanel = getWorkspace("apps");
            await appsPanel.waitFor({ state: "visible" });
            const appsSearchInput = appsPanel.locator(
                "input[data-workspace-search]",
            );
            await appsSearchInput.fill("__nonexistent_query_xyz__");

            const searchRegion = appsPanel.getByRole("region", {
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
            const emptyH3 = emptyState.getByRole("heading", { level: 3 });
            await emptyH3.waitFor({ state: "visible" });

            // Action button "清空搜索" is present
            const clearBtn = emptyState.getByRole("button", {
                name: "清空搜索",
            });
            await clearBtn.waitFor({ state: "visible" });

            // Click "清空搜索" -> clears query and restores full list
            await clearBtn.click();
            assertEquals(await appsSearchInput.inputValue(), "");

            const appsRegion = appsPanel.getByRole("region", {
                name: "全部应用",
            });
            await appsRegion.waitFor({ state: "visible" });
            assertStringIncludes(
                await appsRegion.textContent() ?? "",
                "Alpha Tool",
            );
            assertStringIncludes(
                await appsRegion.textContent() ?? "",
                "Beta Dashboard",
            );
        },
    );

    // 5. Loading and error live roles + retry contract
    await t.step(
        "Loading and error live roles + retry contract",
        async () => {
            // A. Error state with alert live role and retry button in Apps
            await page.route("**/api/webapps", (route) => {
                if (route.request().method() === "GET") {
                    route.fulfill({
                        status: 500,
                        contentType: "application/json",
                        body: JSON.stringify({ message: "应用服务内部错误" }),
                    });
                } else {
                    route.continue();
                }
            });

            await page.reload();
            await openWorkspace("apps");
            const appsPanel = getWorkspace("apps");
            await appsPanel.waitFor({ state: "visible" });

            // StatusBanner tone="error" has role="alert" and data-density="compact"
            const alertBanner = appsPanel.locator(
                '.status-banner[role="alert"][data-density="compact"]',
            );
            await alertBanner.waitFor({ state: "visible" });
            assertStringIncludes(
                await alertBanner.textContent() ?? "",
                "应用服务内部错误",
            );

            // Has retry button
            const retryBtn = alertBanner.getByRole("button", { name: "重试" });
            await retryBtn.waitFor({ state: "visible" });

            // Unmock error route and click retry -> loads successfully
            await page.unroute("**/api/webapps");
            await retryBtn.click();
            await alertBanner.waitFor({ state: "hidden" });
            await appsPanel.getByRole("region", { name: "全部应用" }).waitFor({
                state: "visible",
            });

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
            await openWorkspace("documents");
            const documentsPanel = getWorkspace("documents");
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

    // 6. Warning offline cache contract: offline status banner with compact density and retry button
    await t.step(
        "Warning offline cache contract: offline status banner with compact density and retry button",
        async () => {
            // First ensure online data is fully cached in IndexedDB
            await page.reload();
            await openWorkspace("apps");
            const appsPanel = getWorkspace("apps");
            await appsPanel.getByRole("region", { name: "全部应用" }).waitFor({
                state: "visible",
            });

            // Wait a brief tick for IndexedDB setLocal to persist
            await page.waitForTimeout(300);

            // Abort network request for webapps to simulate offline
            await page.route("**/api/webapps", (route) => {
                route.abort("failed");
            });

            // Reload page to trigger fetch under network offline
            await page.reload();
            await openWorkspace("apps");
            await appsPanel.waitFor({ state: "visible" });

            // Offline warning status banner should appear
            const warningBanner = appsPanel.locator(
                '.status-banner[data-density="compact"][data-tone="warning"]',
            );
            await warningBanner.waitFor({ state: "visible" });

            // Cached apps are still displayed
            assertStringIncludes(
                await appsPanel.textContent() ?? "",
                "Alpha Tool",
            );
            assertStringIncludes(
                await appsPanel.textContent() ?? "",
                "Beta Dashboard",
            );

            // Retry button is present
            const retryBtn = warningBanner.getByRole("button", {
                name: "重试",
            });
            await retryBtn.waitFor({ state: "visible" });

            // Restore network and retry
            await page.unroute("**/api/webapps");
            await retryBtn.click();
            await warningBanner.waitFor({ state: "hidden" });
        },
    );
});
