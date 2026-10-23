import { createEvidenceDirectory } from "./helpers/evidence.ts";
import { assert, assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

Deno.test("Zen panel follows shared chrome and preserves focused scroll bounds", async () => {
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
    const trigger = page.locator(
        '.zen-edge-trigger button[data-workspace="documents"]',
    );
    await trigger.waitFor({ state: "visible" });

    await trigger.focus();
    await page.keyboard.press("Enter");
    const panel = page.locator("aside.workspace-panel");
    await panel.waitFor({ state: "visible" });
    assertEquals(await panel.getAttribute("data-presentation"), "panel");
    const closeButton = panel.getByRole("button", {
        name: "收起工作区",
        exact: true,
    });
    await page.waitForFunction(() =>
        document.activeElement?.getAttribute("aria-label") === "收起工作区"
    );
    await page.keyboard.press("Tab");
    const search = panel.locator("input[data-workspace-search]");
    assertEquals(
        await panel.evaluate((element) =>
            element.querySelector(".workspace-body")?.contains(
                document.activeElement,
            ) ?? false
        ),
        true,
        "opening the panel should place keyboard focus inside its content",
    );

    const panelTop = () =>
        panel.evaluate((element) => element.getBoundingClientRect().top);

    // `--workspace-top-inset` is a token (control-height + space-6), not a literal.
    const topInset = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.cssText =
            "position:fixed;visibility:hidden;inset-block-start:var(--workspace-top-inset);";
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
    const expectedTop = await page.evaluate((inset) => {
        const bannerElement = document.querySelector(
            ".connection-banner",
        ) as HTMLElement;
        return Math.max(inset, bannerElement.getBoundingClientRect().bottom);
    }, topInset);
    const actualTop = await panelTop();
    assert(
        Math.abs(actualTop - expectedTop) <= 1,
        `Zen panel top should follow chrome bottom (${expectedTop}px), got ${actualTop}px`,
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
    await page.waitForFunction((inset) => {
        const panelElement = document.querySelector(
            "aside.workspace-panel",
        );
        return panelElement !== null &&
            Math.abs(panelElement.getBoundingClientRect().top - inset) <= 1;
    }, topInset);
    assert(
        Math.abs((await panelTop()) - topInset) <= 1,
        `without a banner the Zen panel must start at the top inset (${topInset}px), got ${await panelTop()}px`,
    );
    if (evidence) {
        await page.screenshot({ path: `${evidence}/recovered-panel.png` });
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
    const chromeBeforeScroll = await panel.evaluate((element) => {
        const bounds = (selector: string) => {
            const target = element.querySelector(selector);
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
            header: bounds(".workspace-header"),
        };
    });
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
            "aside.workspace-panel .workspace-body",
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
        "scrolling panel content should preserve its focused control",
    );
    assertEquals(
        await panel.evaluate((element) => {
            const bounds = (selector: string) => {
                const target = element.querySelector(selector);
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
                header: bounds(".workspace-header"),
            };
        }),
        chromeBeforeScroll,
        "internal scrolling must leave the panel header fixed",
    );

    await closeButton.focus();
    await page.keyboard.press("Enter");
    await panel.waitFor({ state: "hidden" });
    await page.waitForFunction(() =>
        document.activeElement?.getAttribute("data-workspace") === "documents"
    );
});
