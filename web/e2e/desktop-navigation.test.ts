import { assert, assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

Deno.test("desktop window menu, snap shortcuts, and overview are keyboard accessible", async () => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({ prefix: "desktop-navigation-" });
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
    const app = createApp({
        store,
        auth: new AuthService({ store, origin }),
        origin,
        settings: new SystemSettingsStore(":memory:"),
        wallpaper: new WallpaperService(`${files}/wallpapers`),
        icons: new WebAppIconService(`${files}/icons`),
    });
    const baseUrl = origin;
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({
        reducedMotion: "reduce",
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(baseUrl + "/register");
    await page.locator("#auth-username").fill("desktop_keyboard");
    await page.locator("#auth-display-name").fill("Desktop keyboard");
    await page.locator("#auth-password").fill("desktop-keyboard-password");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(baseUrl + "/");
    const preferences = await page.evaluate(async () => {
        const response = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ style: "widgets" }),
        });
        if (!response.ok) throw new Error(await response.text());
        return await response.json();
    });
    assert(preferences);
    await page.reload();

    const dockApps = page.getByRole("button", { name: "应用工作区" });
    await dockApps.waitFor({ state: "visible" });
    const overviewButton = page.getByRole("button", { name: "窗口总览" });
    assertEquals(
        await overviewButton.getAttribute("aria-keyshortcuts"),
        "Control+Alt+Shift+O",
    );
    await dockApps.click();
    const appWindow = page.locator(
        '.desktop-window[data-window-kind="apps"]',
    );
    await appWindow.waitFor({ state: "visible" });
    const menuTrigger = appWindow.getByTestId("window-menu-trigger");
    assertEquals(
        await menuTrigger.getAttribute("aria-keyshortcuts"),
        "Control+Alt+Shift+M",
    );
    await menuTrigger.focus();
    await page.keyboard.press("Enter");
    const windowMenu = page.getByTestId("window-menu-content");
    await windowMenu.waitFor({ state: "visible" });
    assert(await windowMenu.getByText("Ctrl+Alt+Shift+←").isVisible());
    assert(await windowMenu.getByText("Ctrl+Alt+Shift+→").isVisible());
    assert(await windowMenu.getByText("Ctrl+Alt+Shift+O").isVisible());
    await page.keyboard.press("Escape");
    await windowMenu.waitFor({ state: "hidden" });
    await page.keyboard.press("Control+Alt+Shift+M");
    await windowMenu.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await windowMenu.waitFor({ state: "hidden" });
    await appWindow.waitFor({ state: "visible" });

    await page.keyboard.press("Control+Alt+Shift+ArrowLeft");
    await page.waitForFunction(() =>
        document.querySelector(
            '.desktop-window[data-window-kind="apps"]',
        )?.getAttribute("data-window-snap") === "left"
    );
    assertEquals(await appWindow.getAttribute("data-window-snap"), "left");
    await page.keyboard.press("Control+Alt+Shift+ArrowRight");
    await page.waitForFunction(() =>
        document.querySelector(
            '.desktop-window[data-window-kind="apps"]',
        )?.getAttribute("data-window-snap") === "right"
    );
    assertEquals(await appWindow.getAttribute("data-window-snap"), "right");

    await page.keyboard.press("Control+Alt+Shift+O");
    const overview = page.getByRole("dialog", { name: "窗口总览" });
    await overview.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await overview.waitFor({ state: "hidden" });
    await appWindow.waitFor({ state: "visible" });
    await context.close();
});
