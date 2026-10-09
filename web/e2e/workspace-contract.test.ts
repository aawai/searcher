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

    // Use Widgets dock layout so workspace dock buttons are accessible
    await visit("/settings/appearance");
    await page.getByText("空间轻桌面", { exact: true }).click();
    await page.locator('.layout-mode-card[aria-checked="true"]', {
        hasText: "空间轻桌面",
    }).waitFor();
    await visit("/");

    function getWorkspace(type: "apps" | "notes") {
        return page.locator(
            `.desktop-window[data-window-id="${type}"], .workspace-panel--mobile, aside.workspace-panel, .workspace-panel`,
        );
    }

    async function openWorkspace(type: "apps" | "notes") {
        const label = type === "apps" ? "应用工作区" : "便签工作区";
        const target = getWorkspace(type);
        const dockBtn = page.locator(
            `.desktop-dock button[aria-label="${label}"], .desktop-dock button[data-workspace="${type}"], .workspace-mobile-navigation button[aria-label="${label}"], .workspace-dock button[aria-label="${label}"], button[data-workspace="${type}"]`,
        );
        await dockBtn.first().waitFor({ state: "visible" });
        // Reload may already have restored this workspace from the device layout.
        const restored = await target.waitFor({
            state: "visible",
            timeout: 2500,
        }).then(() => true, () => false);
        if (
            !restored ||
            await target.getAttribute("data-window-active") === "false"
        ) {
            await dockBtn.first().click();
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

            // Dock stays visible while windows open; root nav Dock not footer
            const dock = page.locator(".desktop-dock");
            if (await dock.count() > 0) {
                assertEquals(await dock.isVisible(), true);
            }

            // Title is accessible (chrome title or h2 in surface)
            const appsTitle = appsPanel.locator(
                ".desktop-window-chrome-title, .workspace-title, h2",
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

            // Open Notes Workspace
            await openWorkspace("notes");
            const notesPanel = getWorkspace("notes");
            await notesPanel.waitFor({ state: "visible" });

            const notesTitle = notesPanel.locator(
                ".desktop-window-chrome-title, .workspace-title, h2",
            );
            await notesTitle.first().waitFor({ state: "visible" });
            assertEquals(await notesTitle.first().textContent(), "便签");

            const notesSubH3 = notesPanel.getByRole("heading", {
                name: "全部便签",
                level: 3,
            });
            await notesSubH3.waitFor({ state: "visible" });
            assertEquals(await notesSubH3.textContent(), "全部便签");

            const notesRegion = notesPanel.getByRole("region", {
                name: "全部便签",
            });
            await notesRegion.waitFor({ state: "visible" });

            // Verify strict heading levels in notes panel
            const notesHeadings = await notesPanel.evaluate((el) =>
                Array.from(el.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((
                    h,
                ) => ({
                    tag: h.tagName.toLowerCase(),
                    text: h.textContent?.trim(),
                    level: Number(h.tagName.substring(1)),
                }))
            );
            assertEquals(notesHeadings.some((h) => h.tag === "h1"), false);
            assertEquals(notesHeadings.some((h) => h.tag === "h4"), false);
            assertEquals(notesHeadings.some((h) => h.tag === "h5"), false);
            assertEquals(
                notesHeadings.filter((h) => h.tag === "h3").length >= 1,
                true,
            );
        },
    );

    // 2. Computed typography & spacing parity between Apps and Notes
    await t.step(
        "Typography & spacing contract: Apps and Notes section titles computed styles parity",
        async () => {
            // Measure Notes workspace h3 & header
            await openWorkspace("notes");
            const notesPanel = getWorkspace("notes");
            await notesPanel.getByRole("heading", {
                name: "全部便签",
                level: 3,
            })
                .waitFor({ state: "visible" });

            const notesStyles = await notesPanel.evaluate((el) => {
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

            assertEquals(Boolean(notesStyles), true);
            assertEquals(Boolean(appsStyles), true);

            // Assert exact parity for typography & spacing
            assertEquals(appsStyles?.fontSize, notesStyles?.fontSize);
            assertEquals(appsStyles?.lineHeight, notesStyles?.lineHeight);
            assertEquals(appsStyles?.fontWeight, notesStyles?.fontWeight);
            assertEquals(appsStyles?.marginTop, notesStyles?.marginTop);
            assertEquals(appsStyles?.marginBottom, notesStyles?.marginBottom);
            assertEquals(appsStyles?.headerDisplay, notesStyles?.headerDisplay);
            assertEquals(appsStyles?.headerGap, notesStyles?.headerGap);
            assertEquals(
                appsStyles?.sectionDisplay,
                notesStyles?.sectionDisplay,
            );
            assertEquals(appsStyles?.sectionGap, notesStyles?.sectionGap);
        },
    );
    // 2.5. Apps root and empty folder canonical EmptyState contract
    await t.step(
        "Apps root and empty folder canonical EmptyState contract (h3, compact, footer primary sole action, no competing body button)",
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

            // Workspace footer has the sole primary action: "添加应用"
            const addBtn = appsPanel.locator(
                ".workspace-footer button.workspace-primary, .workspace-footer button:has-text('添加应用'), button:has-text('添加应用')",
            ).first();
            await addBtn.waitFor({ state: "visible" });
            assertEquals(await addBtn.textContent(), "添加应用");

            // Clicking footer "添加应用" navigates to AppForm
            await addBtn.click();
            await appsPanel.locator(".apps-workspace-form").waitFor({
                state: "visible",
            });
            await appsPanel.locator('button[aria-label="返回上一级"]').click();
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
            const folderBadge = folderRegion.locator('[data-slot="badge"]');
            assertEquals(await folderBadge.textContent(), "0");

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

            // Footer primary button navigates to create inside folder
            await addBtn.click();
            await appsPanel.locator(".apps-workspace-form").waitFor({
                state: "visible",
            });
            await appsPanel.locator('button[aria-label="返回上一级"]').click();
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

    // 3. Count badge and search results contract
    await t.step(
        "Count badge and search results contract: visible count and '搜索结果' region in Apps and Notes",
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

            // Seed 2 notes (1 fixed, 1 regular)
            await page.evaluate(async () => {
                await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "Alpha Fixed Note",
                        content: "Pinned content",
                        isHomeFixed: true,
                        isPinned: true,
                    }),
                });
                await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "Beta Regular Note",
                        content: "Regular content",
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

            // Count badge in section header is visible and shows count 2
            const appsCountBadge = appsRegion.locator('[data-slot="badge"]');
            await appsCountBadge.waitFor({ state: "visible" });
            assertEquals(await appsCountBadge.textContent(), "2");

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

            // Count badge in search results shows 1
            const searchCountBadge = appsSearchRegion.locator(
                '[data-slot="badge"]',
            );
            await searchCountBadge.waitFor({ state: "visible" });
            assertEquals(await searchCountBadge.textContent(), "1");

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
            assertEquals(await appsCountBadge.textContent(), "2");

            // B. Test Notes Workspace: count badge & search
            await openWorkspace("notes");
            const notesPanel = getWorkspace("notes");
            await notesPanel.waitFor({ state: "visible" });
            const fixedRegion = notesPanel.getByRole("region", {
                name: "置顶与首页固定",
            });
            const otherRegion = notesPanel.getByRole("region", {
                name: "其他便签",
            });
            await fixedRegion.waitFor({ state: "visible" });
            await otherRegion.waitFor({ state: "visible" });

            // Check counts
            const fixedBadge = fixedRegion.locator('[data-slot="badge"]');
            const otherBadge = otherRegion.locator('[data-slot="badge"]');
            assertEquals(await fixedBadge.textContent(), "1");
            assertEquals(await otherBadge.textContent(), "1");

            // Perform search in Notes
            const notesSearchInput = notesPanel.locator(
                "input[data-workspace-search]",
            );
            await notesSearchInput.fill("Beta");

            // Fixed and other regions hide, "搜索结果" region appears
            const notesSearchRegion = notesPanel.getByRole("region", {
                name: "搜索结果",
            });
            await notesSearchRegion.waitFor({ state: "visible" });
            assertEquals(
                await notesPanel.getByRole("region", { name: "置顶与首页固定" })
                    .count(),
                0,
            );
            assertEquals(
                await notesPanel.getByRole("region", { name: "其他便签" })
                    .count(),
                0,
            );

            // Count badge shows 1
            const notesSearchBadge = notesSearchRegion.locator(
                '[data-slot="badge"]',
            );
            await notesSearchBadge.waitFor({ state: "visible" });
            assertEquals(await notesSearchBadge.textContent(), "1");
            assertStringIncludes(
                await notesSearchRegion.textContent() ?? "",
                "Beta Regular Note",
            );

            // Clear search restores fixed and other sections
            await notesSearchInput.fill("");
            await fixedRegion.waitFor({ state: "visible" });
            await otherRegion.waitFor({ state: "visible" });
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

            // B. Loading state with status live role in Notes
            const notesGate = Promise.withResolvers<void>();
            let notesUnrouted = false;
            await page.route("**/api/notes", async (route) => {
                if (route.request().method() === "GET") {
                    await notesGate.promise;
                }
                if (!notesUnrouted) {
                    try {
                        await route.continue();
                    } catch {
                        // request may have finished or navigated
                    }
                }
            });

            // Trigger refetch by reloading
            await page.reload();
            await openWorkspace("notes");
            const notesPanel = getWorkspace("notes");
            await notesPanel.waitFor({ state: "visible" });

            const loadingState = notesPanel.locator(
                '.loading-state[role="status"][data-density="compact"]',
            );
            await loadingState.waitFor({ state: "visible" });
            assertStringIncludes(
                await loadingState.textContent() ?? "",
                "正在加载便签",
            );

            // Release gate and wait for loading state to finish before unrouting
            notesGate.resolve();
            await loadingState.waitFor({ state: "hidden" });
            notesUnrouted = true;
            await page.unroute("**/api/notes");
            await notesPanel.getByRole("region", { name: "置顶与首页固定" })
                .waitFor(
                    { state: "visible" },
                );
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
