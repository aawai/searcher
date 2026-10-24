import { assert, assertEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
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
        "web suggestions are limited to six and search has one trailing control",
        async () => {
            await page.route(
                /\/api\/search\/suggestions\?/,
                (route) =>
                    route.fulfill({
                        contentType: "application/json",
                        body: JSON.stringify({
                            status: true,
                            data: Array.from({ length: 10 }, (_, index) => ({
                                text: `bounded query ${index}`,
                                source: "engine",
                            })),
                        }),
                    }),
            );
            try {
                await search.fill("bounded query");
                await page.getByRole("option").first().waitFor();
                assertEquals(await page.getByRole("option").count(), 6);
                assertEquals(
                    await search.getAttribute("placeholder"),
                    "搜索或输入网址",
                );
                assertEquals(await page.locator(".search-hint").count(), 0);
            } finally {
                await page.unroute(/\/api\/search\/suggestions\?/);
                await search.fill("");
            }
        },
    );

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
        "combobox keeps focus, skips options on Tab and exposes online failure",
        async () => {
            await search.fill("/g");
            const options = page.getByRole("option");
            await options.first().waitFor();
            assertEquals(await search.getAttribute("role"), "combobox");
            assertEquals(await search.getAttribute("aria-expanded"), "true");
            await search.press("ArrowDown");
            assertEquals(
                await search.getAttribute("aria-activedescendant"),
                await options.first().getAttribute("id"),
            );
            assert(
                await search.evaluate((el) => document.activeElement === el),
            );
            await search.press("Escape");
            assertEquals(await search.getAttribute("aria-expanded"), "false");
            assert(
                await search.evaluate((el) => document.activeElement === el),
            );
            await search.fill("/b");
            await options.first().waitFor();
            await search.press("Tab");
            assert(
                await page.getByRole("button", { name: "搜索", exact: true })
                    .evaluate((el) => document.activeElement === el),
            );
            await page.route(
                /\/api\/search\/suggestions\?/,
                (route) =>
                    route.fulfill({
                        status: 503,
                        contentType: "application/json",
                        body: JSON.stringify({
                            status: false,
                            message: "private upstream detail",
                        }),
                    }),
            );
            try {
                await search.fill("unavailable unique query");
                await page.getByText("在线联想暂不可用", { exact: true })
                    .waitFor();
                assertEquals(await options.count(), 0);
                assertEquals(
                    await page.getByText("private upstream detail").count(),
                    0,
                );
                await search.press("Escape");
                assertEquals(
                    await search.getAttribute("aria-expanded"),
                    "false",
                );
            } finally {
                await page.unroute(/\/api\/search\/suggestions\?/);
                await search.fill("");
            }
        },
    );
    await t.step(
        "IME candidate keys and submit do not select commands, then normal Enter works",
        async () => {
            await page.goto(origin);
            await search.waitFor();
            await search.fill("/g");
            await page.getByRole("option").filter({ hasText: "/g" }).first()
                .waitFor();

            const engine = page.locator(".search-engine");
            const initialEngine = await engine.getAttribute("aria-label");
            await search.evaluate((element) => {
                element.dispatchEvent(
                    new CompositionEvent("compositionstart", {
                        bubbles: true,
                    }),
                );
            });
            for (const key of ["ArrowUp", "ArrowDown"]) {
                const candidateKeyWasNotCancelled = await search.evaluate(
                    (element, key) =>
                        element.dispatchEvent(
                            new KeyboardEvent("keydown", {
                                key,
                                bubbles: true,
                                cancelable: true,
                                isComposing: true,
                            }),
                        ),
                    key,
                );
                assert(
                    candidateKeyWasNotCancelled,
                    `${key} remains available to the IME candidate UI`,
                );
                assertEquals(
                    await page.getByRole("option").first().getAttribute(
                        "aria-selected",
                    ),
                    "false",
                );
            }

            await search.evaluate((element) => {
                element.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        key: "Enter",
                        bubbles: true,
                        cancelable: true,
                        isComposing: true,
                    }),
                );
            });
            await page.getByRole("button", { name: "搜索", exact: true })
                .click();
            assertEquals(await search.inputValue(), "/g");
            assertEquals(
                await engine.getAttribute("aria-label"),
                initialEngine,
            );

            await search.evaluate((element) => {
                element.dispatchEvent(
                    new CompositionEvent("compositionend", {
                        bubbles: true,
                        data: "g",
                    }),
                );
                element.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        key: "Enter",
                        keyCode: 229,
                        which: 229,
                        bubbles: true,
                        cancelable: true,
                    }),
                );
            });
            assertEquals(await search.inputValue(), "/g");
            assertEquals(
                await engine.getAttribute("aria-label"),
                initialEngine,
            );

            await search.focus();
            await search.press("ArrowDown");
            await search.press("Enter");
            assertEquals(await search.inputValue(), "/g ");
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
        "engine prefixes fill their command and run with a query; /ai is plain text without a usable model",
        async () => {
            for (const prefix of ["/g", "/b", "/ba", "/d"]) {
                await search.fill(prefix);
                await page.getByRole("option").filter({ hasText: prefix })
                    .first().waitFor();
                await search.press("ArrowDown");
                await search.press("Enter");
                assertEquals(await search.inputValue(), `${prefix} `);
            }
            await page.context().route(
                /https:\/\/www\.bing\.com\//,
                (route) => route.fulfill({ status: 200, body: "search" }),
            );
            // Without a usable model /ai is not an AI route: a literal web search.
            await search.fill("/ai guest question");
            await search.press("Enter");
            await page.waitForURL(/bing\.com\/search/);
            assertEquals(
                new URL(page.url()).searchParams.get("q"),
                "/ai guest question",
            );
            await page.goto(origin + "/register");
            await page.locator("#auth-username").fill("shortcut_search");
            await page.locator("#auth-display-name").fill("Shortcut Search");
            await page.locator("#auth-password").fill(
                "Shortcut-test-password-103",
            );
            await page.locator("form button[type=submit]").click();
            await page.waitForURL(origin + "/");
            await search.fill("/ai signed in question");
            await search.press("Enter");
            await page.waitForURL(/bing\.com\/search/);
            assertEquals(
                new URL(page.url()).searchParams.get("q"),
                "/ai signed in question",
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
    await t.step(
        "app matches use their own icon and remain separated from web suggestions",
        async () => {
            const uploaded = await page.request.post(
                origin + "/api/webapp-icons/upload",
                {
                    headers: { Origin: origin },
                    multipart: {
                        icon: {
                            name: "figma.png",
                            mimeType: "image/png",
                            buffer: await page.locator(".search-engine")
                                .screenshot(),
                        },
                    },
                },
            );
            assert(uploaded.ok(), await uploaded.text());
            const { data: icon } = await uploaded.json();
            const response = await page.request.post(origin + "/api/webapps", {
                headers: { Origin: origin },
                data: {
                    name: "Figma",
                    url: "https://figma.example.test",
                    iconAssetId: icon.id,
                    iconSource: "upload",
                    isHomeFixed: true,
                },
            });
            assert(response.ok(), await response.text());
            await page.route(
                /\/api\/search\/suggestions\?/,
                (route) =>
                    route.fulfill({
                        contentType: "application/json",
                        body: JSON.stringify({
                            status: true,
                            data: [{
                                text: "Figma tutorial",
                                source: "engine",
                            }],
                        }),
                    }),
            );
            try {
                await page.reload();
                await page.getByRole("button", {
                    name: "打开 Figma",
                    exact: true,
                })
                    .waitFor();
                await search.fill("Figma");
                const options = page.getByRole("option");
                await options.nth(1).waitFor();
                assertEquals(
                    await options.first().locator("img").getAttribute("src"),
                    icon.url,
                );
                assertEquals(
                    await page.getByRole("group", { name: "网页" }).evaluate((
                        element,
                    ) => getComputedStyle(element).borderTopStyle),
                    "solid",
                );
                await search.press("ArrowDown");
                await search.press("ArrowDown");
                assertEquals(
                    await search.getAttribute("aria-activedescendant"),
                    await options.nth(1).getAttribute("id"),
                );
            } finally {
                await page.unroute(/\/api\/search\/suggestions\?/);
                await search.fill("");
            }
        },
    );
    await t.step(
        "touch search targets stay usable inside the search frame",
        async () => {
            const touch = await browser.newContext({
                hasTouch: true,
                viewport: { width: 390, height: 844 },
            });
            try {
                const mobile = await touch.newPage();
                await mobile.goto(origin);
                await mobile.getByRole("combobox").fill("/g");
                await mobile.getByRole("option").first().waitFor();
                const frame = await mobile.locator(".search-frame")
                    .boundingBox();
                assert(frame);
                for (
                    const target of [
                        mobile.locator(".search-engine"),
                        mobile.getByRole("button", {
                            name: "搜索",
                            exact: true,
                        }),
                        mobile.getByRole("option").first(),
                    ]
                ) {
                    const box = await target.boundingBox();
                    assert(box && box.width >= 44 && box.height >= 44);
                }
                const submit = await mobile.getByRole("button", {
                    name: "搜索",
                    exact: true,
                }).boundingBox();
                assert(
                    submit && submit.y >= frame.y &&
                        submit.y + submit.height <= frame.y + frame.height,
                );
                assertEquals(
                    await mobile.evaluate(() =>
                        document.documentElement.scrollWidth > innerWidth
                    ),
                    false,
                );
            } finally {
                await touch.close();
            }
        },
    );
});
