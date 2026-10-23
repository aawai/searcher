import { assertEquals, assertStringIncludes } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

// Run with deno task test:workspace; the task builds the real production frontend.

Deno.test("production workspace contracts", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({ prefix: "searcher_workspace_" });
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
    const username = "workspace_tester_36";
    const password = "Workspace-password-36!";

    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor();
    }

    // Register and set up user account
    await visit("/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Workspace Tester");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor();

    await page.setViewportSize({ width: 1280, height: 800 });
    await visit("/");

    await t.step(
        "nested AppForm dirty Back/Close protection and save",
        async () => {
            // This contract saves forms, not third-party website metadata.
            await page.route(
                "**/api/webapp-icons/fetch",
                (route) =>
                    route.fulfill({
                        status: 502,
                        contentType: "application/json",
                        body: JSON.stringify({
                            success: false,
                            message: "Metadata unavailable in form contract",
                        }),
                    }),
            );
            await page.locator(
                '.zen-edge-trigger button[data-workspace="apps"]',
            ).click();
            const appsWindow = page.locator(
                ".workspace-panel--mobile, aside.workspace-panel",
            ).first();
            await appsWindow.waitFor();

            // Root view has primary action "添加应用"
            const createBtn = appsWindow.locator(
                ".workspace-header .workspace-primary",
            );
            assertEquals(
                await createBtn.getAttribute("aria-label"),
                "添加应用",
            );
            await createBtn.click();

            // Enters nested AppForm view (apps/create)
            assertEquals(
                await appsWindow.locator(".workspace-title")
                    .textContent(),
                "添加应用",
            );

            // Header has Back button
            const backBtn = appsWindow.locator(
                'button[aria-label="返回上一级"]',
            );
            await backBtn.waitFor();

            // Clean form: Back navigation returns immediately without confirmation
            await backBtn.click();
            await appsWindow.locator(".apps-workspace").waitFor();
            assertEquals(
                await appsWindow.locator(".workspace-title")
                    .textContent(),
                "应用",
            );
            assertEquals(await page.locator('[role="alertdialog"]').count(), 0);

            // Re-enter AppForm
            await appsWindow.locator(
                ".workspace-header .workspace-primary",
            )
                .click();
            await page.locator("#app-url-input").waitFor();

            // Dirty form: Enter URL and Name
            await page.locator("#app-url-input").fill("https://example.org");
            await page.locator("#app-name-input").fill("Example Site");

            // Dirty Back navigation triggers confirmation alert dialog
            await backBtn.click();
            const alert = page.locator('[role="alertdialog"]');
            await alert.waitFor();
            assertStringIncludes(
                await alert.textContent() ?? "",
                "放弃未保存的应用修改？",
            );

            // Cancel confirmation keeps user in form with input intact
            await alert.getByRole("button", { name: "继续编辑" }).click();
            await alert.waitFor({ state: "detached" });
            assertEquals(
                await page.locator("#app-url-input").inputValue(),
                "https://example.org",
            );
            assertEquals(
                await page.locator("#app-name-input").inputValue(),
                "Example Site",
            );

            // Dirty Close navigation triggers confirmation alert dialog
            const closeBtn = appsWindow.locator(
                'button[aria-label="收起工作区"]',
            );
            await closeBtn.click();
            await alert.waitFor();

            // Confirming discard closes the window
            await alert.getByRole("button", { name: "放弃修改" }).click();
            await alert.waitFor({ state: "detached" });
            await appsWindow.waitFor({ state: "detached" });

            // Re-open Apps workspace and successfully create and save an app
            await page.locator(
                '.zen-edge-trigger button[data-workspace="apps"]',
            ).click();
            await appsWindow.waitFor();
            await appsWindow.getByRole("status").filter({ hasText: "正在加载" })
                .waitFor({ state: "detached" });
            await appsWindow.locator(
                ".workspace-header .workspace-primary",
            )
                .click();
            await page.locator("#app-url-input").waitFor();

            await page.locator("#app-url-input").fill(
                "https://news.ycombinator.com",
            );
            await page.locator("#app-name-input").fill("Hacker News");
            const saved = page.waitForResponse((response) =>
                response.url() === origin + "/api/webapps" &&
                response.request().method() === "POST"
            );
            await page.locator(".app-dialog-footer button[type=submit]")
                .click();
            const savedResponse = await saved;
            assertEquals(savedResponse.ok(), true, await savedResponse.text());
            await appsWindow.locator(".apps-workspace").waitFor();
            // A saved loose app is immediately browsable at Unified Launcher root.
            await page.locator(".apps-workspace").getByRole("button", {
                name: "打开 Hacker News",
                exact: true,
            }).waitFor();

            // App is persisted to real server
            const serverApps = await page.evaluate(async () => {
                const res = await fetch("/api/webapps");
                const body = await res.json();
                return body.data as Array<{ name: string; url: string }>;
            });
            assertEquals(
                serverApps.some((a) => a.name === "Hacker News"),
                true,
            );

            // Close apps window
            await appsWindow.locator(
                'button[aria-label="收起工作区"]',
            ).click();
            await appsWindow.waitFor({ state: "detached" });
        },
    );

    await t.step(
        "Home pinned Quick Apps order and context menu",
        async () => {
            for (const name of ["Order Alpha", "Order Beta"]) {
                const status = await page.evaluate(async (name) => {
                    const response = await fetch("/api/webapps", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            name,
                            url: "https://" +
                                name.replace(" ", "-").toLowerCase() +
                                ".example",
                            isPinned: true,
                            sortOrder: name === "Order Alpha" ? 1 : 2,
                            pinnedSortOrder: name === "Order Alpha" ? 2 : 1,
                        }),
                    });
                    return response.status;
                }, name);
                assertEquals(status, 200);
            }
            await visit("/");
            const expectedPins = await page.evaluate(async () => {
                const { data } = await (await fetch("/api/webapps")).json();
                return data.filter((app: { isPinned: boolean }) => app.isPinned)
                    .sort((
                        a: { pinnedSortOrder?: number },
                        b: { pinnedSortOrder?: number },
                    ) => (a.pinnedSortOrder ?? 0) - (b.pinnedSortOrder ?? 0))
                    .map((app: { name: string }) => "打开 " + app.name);
            });
            const pinned = page.locator(
                ".pinned-area .launcher-grid .webapp-icon",
            );
            await pinned.first().waitFor();
            assertEquals(
                await pinned.evaluateAll((els) =>
                    els.map((el) => el.getAttribute("aria-label"))
                ),
                expectedPins,
            );
            await pinned.first().click({ button: "right" });
            const menuItems = await page.getByRole("menuitem")
                .allTextContents();
            assertEquals(menuItems[0], "打开");
            await page.keyboard.press("Escape");
            await page.locator(
                '.zen-edge-trigger button[data-workspace="apps"]',
            ).click();
            assertEquals(
                await page.locator(".workspace-header .workspace-primary")
                    .getAttribute("aria-label"),
                "添加应用",
            );
            await page.locator(
                '.workspace-header button[aria-label="收起工作区"]',
            ).click();
            await page.locator(
                ".workspace-panel--mobile, aside.workspace-panel",
            ).first().waitFor({ state: "detached" });
        },
    );

    await t.step(
        "Mobile focustrap/swipe/escape and focus return",
        async () => {
            // Set mobile viewport (< 768px)
            await page.setViewportSize({ width: 375, height: 667 });

            // Open workspace from mobile navigation
            const mobileAppsBtn = page.locator(
                'button.zen-edge-btn[data-workspace="apps"]',
            );
            await mobileAppsBtn.first().click();

            // Mobile panel is presented inside modal Sheet
            const sheet = page.locator(".workspace-panel--mobile");
            await sheet.waitFor();
            const backdrop = page.locator('[data-slot="sheet-backdrop"]');
            await backdrop.waitFor();
            assertEquals(await backdrop.isVisible(), true);

            // Escape closes sheet and restores focus to opener
            await page.keyboard.press("Escape");
            await sheet.waitFor({ state: "detached" });
            await page.waitForFunction(() =>
                document.activeElement?.getAttribute("data-workspace") ===
                    "apps"
            );
            assertEquals(
                await page.evaluate(() =>
                    document.activeElement?.getAttribute("data-workspace")
                ),
                "apps",
            );

            // Reopen sheet for swipe down test
            await mobileAppsBtn.first().click();
            await sheet.waitFor();

            // Mobile grip handle is visible in header
            const grip = page.locator(".workspace-grip");
            assertEquals(await grip.count(), 1);

            // Dispatch swipe down touch gesture (> 80px deltaY)
            await page.evaluate(() => {
                const header = document.querySelector(
                    ".workspace-panel--mobile .workspace-header",
                );
                if (!header) throw new Error("Mobile header not found");
                const touchStart = new Touch({
                    identifier: Date.now(),
                    target: header,
                    clientX: 180,
                    clientY: 100,
                });
                header.dispatchEvent(
                    new TouchEvent("touchstart", {
                        touches: [touchStart],
                        targetTouches: [touchStart],
                        changedTouches: [touchStart],
                        bubbles: true,
                    }),
                );
                const touchEnd = new Touch({
                    identifier: Date.now(),
                    target: header,
                    clientX: 180,
                    clientY: 210, // 210 - 100 = 110 > 80px threshold
                });
                header.dispatchEvent(
                    new TouchEvent("touchend", {
                        touches: [],
                        targetTouches: [],
                        changedTouches: [touchEnd],
                        bubbles: true,
                    }),
                );
            });

            // Sheet closes from swipe gesture
            await sheet.waitFor({ state: "detached" });

            // Focus returns to dock opener
            await page.waitForFunction(() =>
                document.activeElement?.getAttribute("data-workspace") ===
                    "apps"
            );
            assertEquals(
                await page.evaluate(() =>
                    document.activeElement?.getAttribute("data-workspace")
                ),
                "apps",
            );
        },
    );
});
