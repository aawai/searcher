import { createEvidenceDirectory } from "./helpers/evidence.ts";
import {
    libraryPanel,
    libraryWindow,
    openNotesByKeyboard,
    workspaceNotesTrigger,
} from "./helpers/library.ts";
import { assert, assertEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

Deno.test("Notes window stays in the work area under shared chrome and preserves focused scroll bounds", async () => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({ prefix: "searcher-chrome-inset-" });
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
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({
        viewport: { width: 768, height: 1024 },
        reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const evidence = Deno.env.get("E2E_EVIDENCE_DIR")
        ? await createEvidenceDirectory("workspace-chrome-inset")
        : undefined;

    async function request<T>(
        path: string,
        method = "GET",
        body?: object,
    ): Promise<T> {
        return await page.evaluate(async ({ path, method, body }) => {
            const response = await fetch(path, {
                method,
                headers: { "Content-Type": "application/json" },
                body: body ? JSON.stringify(body) : undefined,
            });
            if (!response.ok) throw new Error(await response.text());
            return (await response.json()).data as T;
        }, { path, method, body });
    }

    await page.goto(`${origin}/register`);
    await page.locator("#auth-username").fill("chrome_inset_179");
    await page.locator("#auth-display-name").fill("Chrome Inset");
    await page.locator("#auth-password").fill("chrome-inset-password-179");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`${origin}/`);
    await page.getByRole("button", { name: "用户菜单：Chrome Inset" })
        .waitFor({ state: "visible" });

    for (let index = 0; index < 60; index++) {
        await request("/api/documents", "POST", {
            title: `Inset Note ${String(index).padStart(2, "0")}`,
            body: `Chrome inset note ${index}`,
        });
    }
    await page.reload();
    const userMenu = page.getByRole("button", {
        name: "用户菜单：Chrome Inset",
    });
    await userMenu.waitFor({ state: "visible" });
    await userMenu.click();
    await page.getByRole("menuitem", {
        name: "退出登录",
        exact: true,
    }).click();
    await page.getByRole("link", { name: "登录", exact: true }).waitFor();

    await page.route("**/api/auth/me", (route) => route.abort());
    const authRequestFailed = page.waitForEvent(
        "requestfailed",
        (request) => new URL(request.url()).pathname === "/api/auth/me",
    );
    await page.reload();
    const failedRequest = await authRequestFailed;
    assertEquals(new URL(failedRequest.url()).pathname, "/api/auth/me");
    const banner = page.locator(".connection-banner");
    await banner.waitFor({ state: "visible" });
    await page.unroute("**/api/auth/me");

    await page.getByRole("link", { name: "登录", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/login");
    await banner.waitFor({ state: "visible" });
    await page.locator("#auth-username").fill("chrome_inset_179");
    await page.locator("#auth-password").fill("chrome-inset-password-179");
    const loggedIn = page.waitForResponse((response) =>
        new URL(response.url()).pathname === "/api/auth/login" &&
        response.request().method() === "POST" &&
        response.status() === 200
    );
    await page.locator('form button[type="submit"]').click();
    await loggedIn;
    await page.waitForURL(`${origin}/`);
    await userMenu.waitFor({ state: "visible" });
    await banner.waitFor({ state: "visible" });
    const trigger = workspaceNotesTrigger(page);
    await trigger.waitFor({ state: "visible" });
    const opener = await trigger.elementHandle();
    assert(opener);

    await openNotesByKeyboard(page);
    const panel = libraryPanel(page);
    await panel.waitFor({ state: "visible" });
    const frame = libraryWindow(page, "notes");
    await frame.waitFor({ state: "visible" });
    const closeButton = frame.getByRole("button", {
        name: "关闭笔记",
        exact: true,
    });
    await closeButton.waitFor({ state: "visible" });
    const search = panel.locator("input[data-workspace-search]:visible");
    await search.focus();
    assertEquals(
        await panel.evaluate((element) =>
            element.querySelector(".workspace-body")?.contains(
                document.activeElement,
            ) ?? false
        ),
        true,
        "opening the panel should place keyboard focus inside its content",
    );

    const windowTop = () =>
        frame.evaluate((element) => element.getBoundingClientRect().top);

    // The work area starts below the safe area at the window margin
    // (`--space-4`) and below any connection banner.
    const workAreaTop = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.cssText =
            "position:fixed;visibility:hidden;inset-block-start:var(--space-4);";
        document.body.append(probe);
        const top = probe.getBoundingClientRect().top;
        probe.remove();
        return top;
    });
    const retry = banner.getByRole("button", { name: "重试", exact: true });
    const hitTest = await retry.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const target = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
        );
        return {
            receivesPointer: target === button || button.contains(target),
            target: target instanceof HTMLElement
                ? `${target.tagName.toLowerCase()}.${target.className}`
                : String(target),
        };
    });
    if (evidence) {
        await page.screenshot({ path: `${evidence}/banner-and-panel.png` });
    }
    assert(
        hitTest.receivesPointer,
        `banner Retry is occluded at its center by ${hitTest.target}`,
    );
    // The banner is chrome with its own action: the work area starts a margin
    // below it, so the window never covers Retry.
    const bannerBottom = await banner.evaluate((element) =>
        element.getBoundingClientRect().bottom
    );
    const expectedTop = Math.max(workAreaTop, bannerBottom + workAreaTop);
    const actualTop = await windowTop();
    assert(
        Math.abs(actualTop - expectedTop) <= 1,
        `window top should clear the banner (${expectedTop}px), got ${actualTop}px`,
    );

    const recovered = page.waitForResponse((response) =>
        new URL(response.url()).pathname === "/api/auth/me" &&
        response.status() === 200
    );
    await retry.click();
    await recovered;
    await banner.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "用户菜单：Chrome Inset" })
        .waitFor({ state: "visible" });
    await page.waitForFunction((top) => {
        const frameElement = document.querySelector(
            '[data-window-id="notes"]',
        );
        return frameElement !== null &&
            Math.abs(frameElement.getBoundingClientRect().top - top) <= 1;
    }, workAreaTop);
    assert(
        Math.abs((await windowTop()) - workAreaTop) <= 1,
        `without a banner the window must still start at the work-area top (${workAreaTop}px), got ${await windowTop()}px`,
    );
    if (evidence) {
        await page.screenshot({ path: `${evidence}/recovered-window.png` });
    }

    const body = panel.locator(".workspace-body");
    const bodyMetrics = await body.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
    }));
    assert(
        bodyMetrics.scrollHeight > bodyMetrics.clientHeight + 1,
        `Documents panel should have internal overflow: ${
            JSON.stringify(bodyMetrics)
        }`,
    );
    const chromeBounds = () =>
        frame.evaluate((element) => {
            const bounds = (selector: string | null) => {
                const target = selector
                    ? element.querySelector(selector)
                    : element;
                if (!target) throw new Error(`Missing ${selector}`);
                const rect = target.getBoundingClientRect();
                return {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                };
            };
            return {
                window: bounds(null),
                titlebar: bounds(".window-frame__titlebar"),
            };
        });
    const chromeBeforeScroll = await chromeBounds();
    await search.focus();
    const bodyBounds = await body.boundingBox();
    assert(bodyBounds);
    await page.mouse.move(
        bodyBounds.x + bodyBounds.width / 2,
        bodyBounds.y + bodyBounds.height / 2,
    );
    await page.mouse.wheel(0, 700);
    await page.waitForFunction(() => {
        const bodyElement = document.querySelector(
            '[data-window-id="notes"] .workspace-body',
        );
        return bodyElement !== null && bodyElement.scrollTop > 0;
    });
    const scrollMetrics = await body.evaluate((element) => ({
        scrollTop: element.scrollTop,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
    }));
    assert(scrollMetrics.scrollTop > 0);
    assert(scrollMetrics.scrollTop < scrollMetrics.scrollHeight);
    assertEquals(await page.evaluate(() => globalThis.scrollY), 0);
    assertEquals(
        await search.evaluate((element) => element === document.activeElement),
        true,
        "scrolling window content should preserve its focused control",
    );
    assertEquals(
        await chromeBounds(),
        chromeBeforeScroll,
        "internal scrolling must leave the window and its header fixed",
    );

    await closeButton.focus();
    await page.keyboard.press("Enter");
    await panel.waitFor({ state: "detached" });
    await page.waitForFunction(
        (element) =>
            document.activeElement ===
                (element.isConnected
                    ? element
                    : document.querySelector("#search-query")),
        opener,
    );
});
