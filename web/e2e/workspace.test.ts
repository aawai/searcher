import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";
import {
    closeLibrary,
    libraryPanel,
    libraryWindow,
    openNotes,
    workspaceDock,
    workspaceNotesTrigger,
} from "./helpers/library.ts";

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
        await target.locator(
            path === "/register" ? "main:has(#auth-username)" : "main.home",
        ).waitFor();
    }

    // Register and set up user account
    await visit("/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Workspace Tester");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main.home").waitFor();

    await page.setViewportSize({ width: 1280, height: 800 });
    await visit("/");

    await t.step(
        "home AppForm dialog dirty Cancel/Escape protection and save",
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
            const addCell = page.locator(
                '.launcher-grid--home [data-library-cell="add"]',
            );
            await addCell.click();
            const dialog = page.locator(".app-form-dialog");
            await dialog.waitFor();
            assertEquals(
                await dialog.locator(".app-form-dialog-title").textContent(),
                "添加应用",
            );

            // Clean form: Cancel closes immediately without confirmation
            await dialog.getByRole("button", { name: "取消", exact: true })
                .click();
            await dialog.waitFor({ state: "detached" });
            assertEquals(await page.locator('[role="alertdialog"]').count(), 0);

            // Dirty form: Enter URL and Name
            await addCell.click();
            await page.locator("#app-url-input").fill("https://example.org");
            await page.locator("#app-name-input").fill("Example Site");

            // Dirty Cancel triggers confirmation alert dialog
            await dialog.getByRole("button", { name: "取消", exact: true })
                .click();
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

            // Dirty Escape triggers confirmation; confirming discards the form
            await page.keyboard.press("Escape");
            await alert.waitFor();
            await alert.getByRole("button", { name: "放弃修改" }).click();
            await alert.waitFor({ state: "detached" });
            await dialog.waitFor({ state: "detached" });

            // Reopen and successfully create and save an app
            await addCell.click();
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
            await dialog.waitFor({ state: "detached" });
            // A saved loose app is immediately visible on the home library.
            await page.locator(".launcher-grid--home").getByRole("button", {
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
        },
    );
    await t.step(
        "Narrow window: focus, Escape/minimize/close buttons and focus return",
        async () => {
            // Phone viewport (< 768px): the active window fills the work area.
            await page.setViewportSize({ width: 375, height: 667 });

            // The Dock notes button is the notes entry and focus-return target.
            const dockNotes = workspaceNotesTrigger(page);
            await openNotes(page);

            // Opening moves focus into the window frame; there is no Sheet,
            // backdrop or grip, and the window clears the Dock.
            const frame = libraryWindow(page, "notes");
            await frame.waitFor({ state: "visible" });
            await page.waitForFunction(
                (selector) =>
                    document.querySelector(selector)?.contains(
                        document.activeElement,
                    ) === true,
                '[data-window-id="notes"]',
            );
            assertEquals(
                await page.locator(
                    '[data-slot="sheet-backdrop"], .workspace-grip',
                )
                    .count(),
                0,
            );
            const windowBox = await frame.boundingBox();
            const dockBox = await workspaceDock(page).boundingBox();
            assert(windowBox && dockBox);
            assert(
                windowBox.x >= 0 && windowBox.y >= 0 &&
                    windowBox.x + windowBox.width <= 375 &&
                    windowBox.y + windowBox.height <= 667,
                JSON.stringify(windowBox),
            );
            assert(
                windowBox.y + windowBox.height <= dockBox.y ||
                    dockBox.y + dockBox.height <= windowBox.y ||
                    windowBox.x + windowBox.width <= dockBox.x ||
                    dockBox.x + dockBox.width <= windowBox.x,
                JSON.stringify({ windowBox, dockBox }),
            );

            // The drawer is open without a selection: Escape closes it first,
            // then (no inner layer open) minimizes: hidden, content kept, and
            // focus returns to the Dock trigger.
            await page.keyboard.press("Escape");
            await frame.locator(".documents-layout[data-drawer='closed']").waitFor();
            assertEquals(await frame.isVisible(), true);
            await page.keyboard.press("Escape");
            await frame.waitFor({ state: "hidden" });
            await page.waitForURL((url) => !url.searchParams.has("view"));
            assertEquals(
                await dockNotes.getAttribute("data-window-status"),
                "minimized",
            );
            await page.waitForFunction(
                (btn) => document.activeElement === btn,
                await dockNotes.elementHandle(),
            );

            // Reopen, then the minimize button does the same as Escape.
            await openNotes(page);
            await frame.waitFor({ state: "visible" });
            await frame.getByRole("button", { name: "最小化笔记", exact: true })
                .click();
            await frame.waitFor({ state: "hidden" });
            await page.waitForFunction(
                (btn) => document.activeElement === btn,
                await dockNotes.elementHandle(),
            );

            // The close button destroys the window; focus returns to the trigger.
            await openNotes(page);
            await frame.waitFor({ state: "visible" });
            await closeLibrary(page);
            assertEquals(await libraryPanel(page).count(), 0);
            await page.waitForFunction(
                (btn) => document.activeElement === btn,
                await dockNotes.elementHandle(),
            );
            assertEquals(
                await dockNotes.evaluate((el) => el === document.activeElement),
                true,
            );
        },
    );
});
