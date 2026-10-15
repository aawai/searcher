import { assert, assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

Deno.test("production search shortcuts respect editable focus and submit command targets", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir();
    cleanup.defer(() => Deno.removeSync(files, { recursive: true }));
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
    const page = await browser.newPage();
    await page.goto(origin);
    const search = page.locator(".search-form input");
    await search.waitFor();

    await t.step(
        "global focus yields to input textarea select contenteditable and textbox descendants",
        async () => {
            for (
                const kind of [
                    "input",
                    "textarea",
                    "select",
                    "editable",
                    "textbox",
                ]
            ) {
                await page.evaluate((kind) => {
                    const node = document.createElement(
                        kind === "editable" || kind === "textbox"
                            ? "div"
                            : kind,
                    );
                    node.id = "shortcut-fixture";
                    node.tabIndex = 0;
                    if (kind === "editable") node.contentEditable = "true";
                    if (kind === "textbox") {
                        node.setAttribute("role", "textbox");
                    }
                    if (kind === "editable" || kind === "textbox") {
                        const child = document.createElement("span");
                        child.tabIndex = 0;
                        node.append(child);
                    }
                    document.body.append(node);
                    ((node.firstElementChild ?? node) as HTMLElement).focus();
                }, kind);
                for (const key of ["/", "Control+k", "Meta+k"]) {
                    await page.keyboard.press(key);
                    assert(
                        await page.evaluate(() =>
                            document.activeElement?.closest(
                                "#shortcut-fixture",
                            ) !== null
                        ),
                        `${kind}: ${key} retains editable focus`,
                    );
                }
                await page.evaluate(() =>
                    document.getElementById("shortcut-fixture")?.remove()
                );
            }
        },
    );
    await t.step(
        "plain global bindings focus search but extra modifiers do not",
        async () => {
            for (const key of ["/", "Control+k", "Meta+k"]) {
                await search.evaluate((element) =>
                    (element as HTMLElement).blur()
                );
                await page.keyboard.press(key);
                assert(
                    await search.evaluate((element) =>
                        document.activeElement === element
                    ),
                );
            }
            await search.evaluate((element) => (element as HTMLElement).blur());
            await page.keyboard.press("Control+Shift+k");
            assert(
                await search.evaluate((element) =>
                    document.activeElement !== element
                ),
            );
        },
    );
    await t.step(
        "late suggestions do not reopen the listbox after search loses focus",
        async () => {
            const gate = Promise.withResolvers<void>();
            await page.route(/\/api\/search\/suggestions\?/, async (route) => {
                await gate.promise;
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        status: true,
                        data: [
                            {
                                text: "late popup regression check",
                                source: "engine",
                                engine: "google",
                            },
                        ],
                    }),
                });
            });
            try {
                const requested = page.waitForRequest(
                    /\/api\/search\/suggestions\?/,
                );
                await search.fill("late popup regression");
                await requested;
                await search.evaluate((element) =>
                    (element as HTMLElement).blur()
                );
                const completed = page.waitForResponse(
                    /\/api\/search\/suggestions\?/,
                );
                gate.resolve();
                await (await completed).finished();
                assert(
                    await search.evaluate((element) =>
                        document.activeElement !== element
                    ),
                );
                // Wait past the production debounce/propagation window so a
                // fixed component has time to wrongly reopen the listbox.
                await page.waitForTimeout(240);
                assertEquals(
                    await page.getByRole("listbox", { name: "搜索建议" })
                        .isVisible(),
                    false,
                );
            } finally {
                gate.resolve();
                await page.unroute(/\/api\/search\/suggestions\?/);
            }
        },
    );
    await t.step(
        "all quick commands select their target without query pollution",
        async () => {
            for (
                const [prefix, label] of [["/g", "Google"], ["/b", "Bing"], [
                    "/ba",
                    "百度",
                ], ["/d", "DuckDuckGo"]]
            ) {
                await search.fill(prefix);
                await page.getByRole("option").filter({ hasText: prefix })
                    .first().waitFor();
                await search.press("Enter");
                assertEquals(await search.inputValue(), "");
                assert(
                    (await page.locator(".search-engine").getAttribute(
                        "aria-label",
                    ))?.includes(label),
                );
            }
            await search.fill("/ai");
            await page.getByRole("option").filter({ hasText: "/ai" }).waitFor();
            await search.press("Enter");
            await page.getByText("登录后使用 AI 问答", { exact: true })
                .waitFor();
            await page.goto(origin + "/register");
            await page.locator("#auth-username").fill("shortcut_search");
            await page.locator("#auth-display-name").fill("Shortcut Search");
            await page.locator("#auth-password").fill(
                "Shortcut-test-password-103",
            );
            await page.locator("form button[type=submit]").click();
            await page.waitForURL(origin + "/");
            await search.fill("/ai");
            await page.getByRole("option").filter({ hasText: "/ai" }).waitFor();
            await search.press("Enter");
            await page.getByPlaceholder("输入问题，开始对话").waitFor();
            assertEquals(
                await search.getAttribute("placeholder"),
                "输入问题，开始对话",
            );
        },
    );
    await t.step(
        "mod Enter opens the stripped engine query in a new tab",
        async () => {
            await page.goto(origin);
            await search.waitFor();
            await page.context().route(
                "https://www.google.com/**",
                (route) => route.fulfill({ status: 200, body: "search test" }),
            );
            await search.fill("/g shortcut smoke");
            const popupPromise = page.waitForEvent("popup");
            await search.press("Control+Enter");
            const popup = await popupPromise;
            await popup.waitForURL(/google\.com\/search/);
            assertEquals(
                new URL(popup.url()).searchParams.get("q"),
                "shortcut smoke",
            );
            assertEquals(new URL(page.url()).origin, origin);
            await popup.close();
        },
    );
});
