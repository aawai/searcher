import { assert, assertEquals } from "@std/assert";
import { type BrowserContext, chromium, type Page } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

const SUGGESTIONS = /\/api\/search\/suggestions\?/;
const PERSONAL = /\/api\/search\/personal\?/;
const PANEL = "aside.workspace-panel:not([data-ending-style])";

async function mockWeb(context: BrowserContext, requests: string[] = []) {
    await context.route(SUGGESTIONS, (route) => {
        requests.push(route.request().url());
        return route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
                status: true,
                data: [{ text: "灵感网页", source: "engine" }],
            }),
        });
    });
    await context.route(
        /https:\/\/www\.bing\.com\//,
        (route) => route.fulfill({ status: 200, body: "search" }),
    );
}

async function openHome(page: Page, origin: string) {
    await page.goto(origin);
    await page.locator("#search-query").waitFor({ state: "visible" });
}

const groupNames = (page: Page) =>
    page.getByRole("listbox", { name: "搜索建议" }).getByRole("group")
        .evaluateAll((groups) =>
            groups.map((group) =>
                document.getElementById(
                    group.getAttribute("aria-labelledby") ?? "",
                )?.textContent
            )
        );

async function documentTotals(page: Page, origin: string) {
    const list = await page.request.get(`${origin}/api/documents?limit=50`);
    const trash = await page.request.get(`${origin}/api/documents/trash`);
    const { data } = await list.json();
    const { data: trashed } = await trash.json();
    return {
        active: data.items as {
            id: string;
            displayTitle: string;
            isHomeFixed: boolean;
            isFavorite: boolean;
        }[],
        trashed: trashed.items as { id: string }[],
    };
}

Deno.test("unified input keyboard, groups, capture, commands and availability #237", async (t) => {
    const app = await startProductionApp();
    const withModel = await app.seedAskFixtureUser({
        username: "omnibox_ai",
        password: "Omnibox-AI-password-237!",
    });
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    try {
        const guestContext = await browser.newContext({
            viewport: { width: 1440, height: 900 },
        });
        const guestRequests: string[] = [];
        const guestSuggestions: string[] = [];
        await mockWeb(guestContext, guestSuggestions);
        const guest = await guestContext.newPage();
        guest.on("request", (request) => guestRequests.push(request.url()));

        await t.step("guests see only 网页 and 命令", async () => {
            await openHome(guest, app.origin);
            const search = guest.locator("#search-query");
            await search.fill("灵感");
            await guest.getByRole("option", { name: /灵感网页/ }).waitFor();
            assertEquals(await groupNames(guest), ["网页"]);
            assertEquals(await guest.getByText("问 AI：").count(), 0);
            await search.fill("/");
            await guest.getByRole("option", { name: /\/g /, exact: false })
                .first().waitFor();
            assertEquals(await groupNames(guest), ["命令"]);
            const commands = await guest.getByRole("option").allTextContents();
            for (const hidden of ["/ai", "/trash", "/notes", "/apps"]) {
                assert(
                    !commands.some((text) => text.includes(`${hidden} ·`)),
                    `${hidden} is hidden from guests`,
                );
            }
            assert(commands.some((text) => text.includes("/dark ·")));
            assertEquals(
                guestRequests.filter((url) => PERSONAL.test(url)).length,
                0,
            );
        });

        await t.step(
            "suggestions follow the interface language, default zh-CN",
            async () => {
                await openHome(guest, app.origin);
                const search = guest.locator("#search-query");
                guestSuggestions.length = 0;
                await search.fill("lang one");
                await guest.getByRole("option", { name: /灵感网页/ }).waitFor();
                assertEquals(
                    new URL(guestSuggestions.at(-1)!).searchParams.get(
                        "language",
                    ),
                    "zh-CN",
                );
                await guest.evaluate(() => {
                    document.documentElement.lang = "en-US";
                });
                await search.fill("lang two");
                await guest.waitForResponse((response) =>
                    SUGGESTIONS.test(response.url()) &&
                    new URL(response.url()).searchParams.get("q") === "lang two"
                );
                assertEquals(
                    new URL(guestSuggestions.at(-1)!).searchParams.get(
                        "language",
                    ),
                    "en-US",
                );
            },
        );

        await t.step(
            "guest Shift+Enter neither captures nor submits",
            async () => {
                await openHome(guest, app.origin);
                const search = guest.locator("#search-query");
                await search.fill("访客记录");
                await guest.getByRole("option", { name: /灵感网页/ }).waitFor();
                const posts: string[] = [];
                guest.on("request", (request) => {
                    if (request.method() === "POST") {
                        posts.push(request.url());
                    }
                });
                await search.press("Shift+Enter");
                await search.press("Alt+Enter");
                assertEquals(await search.inputValue(), "访客记录");
                assertEquals(new URL(guest.url()).pathname, "/");
                assertEquals(posts, []);
                assertEquals(await guest.getByText("已记录笔记").count(), 0);
            },
        );

        await t.step("coarse pointer targets are 44px", async () => {
            const touch = await browser.newContext({
                hasTouch: true,
                viewport: { width: 390, height: 844 },
            });
            try {
                await mockWeb(touch);
                const mobile = await touch.newPage();
                await openHome(mobile, app.origin);
                await mobile.locator("#search-query").fill("/");
                const options = mobile.getByRole("option");
                await options.first().waitFor();
                for (
                    const box of await options.evaluateAll((nodes) =>
                        nodes.map((node) => node.getBoundingClientRect().height)
                    )
                ) assert(box >= 44, `option height ${box}`);
            } finally {
                await touch.close();
            }
        });
        await guestContext.close();

        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
        });
        await mockWeb(context);
        const page = await context.newPage();
        await loginAndVisit(page, app.origin, "/", withModel);
        const created = await page.request.post(app.origin + "/api/documents", {
            headers: { Origin: app.origin },
            data: { title: "灵感来源", body: "今天的灵感来源是散步" },
        });
        assert(created.ok(), await created.text());
        const webapp = await page.request.post(app.origin + "/api/webapps", {
            headers: { Origin: app.origin },
            data: { name: "灵感站", url: "https://ideas.example.test" },
        });
        assert(webapp.ok(), await webapp.text());
        const search = page.locator("#search-query");

        await t.step(
            "signed-in groups: AI, 我的, 应用, 网页 with a polite count",
            async () => {
                await openHome(page, app.origin);
                await search.fill("灵感");
                await page.getByRole("option", { name: /灵感网页/ }).waitFor();
                assertEquals(await groupNames(page), [
                    "问 AI",
                    "我的",
                    "应用",
                    "网页",
                ]);
                assertEquals(await search.getAttribute("role"), "combobox");
                assertEquals(
                    await search.getAttribute("aria-activedescendant"),
                    null,
                );
                const tabIndexes = await page.getByRole("option").evaluateAll(
                    (nodes) => nodes.map((node) => node.tabIndex),
                );
                assertEquals(new Set(tabIndexes), new Set([-1]));
                const status = page.locator(
                    '.search-form-wrap > [role="status"]',
                );
                await page.waitForFunction(
                    () =>
                        document.querySelector(
                            '.search-form-wrap > [role="status"]',
                        )?.textContent === "4 条建议",
                );
                assertEquals(await status.getAttribute("aria-live"), "polite");
            },
        );

        await t.step(
            "Enter without a selection is always a default-engine search",
            async () => {
                for (const text of ["github", "/settings", "灵感"]) {
                    await openHome(page, app.origin);
                    await search.fill(text);
                    await page.getByRole("option").first().waitFor();
                    await search.press("Enter");
                    await page.waitForURL(/bing\.com\/search/);
                    assertEquals(
                        new URL(page.url()).searchParams.get("q"),
                        text,
                    );
                }
            },
        );

        await t.step("Enter with a selection executes that item", async () => {
            await openHome(page, app.origin);
            await search.fill("灵感");
            await page.getByRole("option", { name: /灵感网页/ }).waitFor();
            await search.press("ArrowDown");
            await search.press("ArrowDown");
            assertEquals(
                await page.getByRole("option", { selected: true })
                    .textContent(),
                "灵感来源笔记",
            );
            await search.press("Enter");
            await page.locator(PANEL).waitFor();
            assertEquals(new URL(page.url()).pathname, "/");
        });

        await t.step("Alt+Enter hands the input to AI", async () => {
            await openHome(page, app.origin);
            await search.fill("问题");
            await page.getByRole("option", { name: /问 AI：问题/ }).waitFor();
            await search.press("Alt+Enter");
            await page.waitForURL(/\/ask\?q=/);
            assertEquals(
                new URL(page.url()).searchParams.get("q"),
                "问题",
            );
        });

        await t.step(
            "selecting 问 AI then Enter equals Alt+Enter",
            async () => {
                await openHome(page, app.origin);
                await search.fill("另一个问题");
                await page.getByRole("option", { name: /问 AI：/ }).waitFor();
                await search.press("ArrowDown");
                await search.press("Enter");
                await page.waitForURL(/\/ask\?q=/);
                assertEquals(
                    new URL(page.url()).searchParams.get("q"),
                    "另一个问题",
                );
            },
        );

        await t.step("Mod+Enter submits in a new tab", async () => {
            await openHome(page, app.origin);
            await search.fill("新标签页");
            await page.getByRole("option").first().waitFor();
            const popup = page.waitForEvent("popup");
            await search.press("Control+Enter");
            const opened = await popup;
            await opened.waitForURL(/bing\.com\/search/);
            assertEquals(
                new URL(opened.url()).searchParams.get("q"),
                "新标签页",
            );
            assertEquals(new URL(page.url()).pathname, "/");
            await opened.close();
        });

        await t.step("Tab keeps native focus movement", async () => {
            await openHome(page, app.origin);
            await search.fill("灵感");
            await page.getByRole("option", { name: /灵感网页/ }).waitFor();
            await search.press("Tab");
            assert(
                await page.getByRole("button", { name: "搜索", exact: true })
                    .evaluate((el) => document.activeElement === el),
            );
        });

        await t.step(
            "Shift+Enter captures an unpinned note with 撤销 and 固定到首页",
            async () => {
                await openHome(page, app.origin);
                const before = await documentTotals(page, app.origin);
                await search.fill("快速记录一");
                await page.getByRole("option").first().waitFor();
                await search.press("Shift+Enter");
                await page.getByText("已记录笔记“快速记录一”").waitFor();
                assertEquals(await search.inputValue(), "");
                const after = await documentTotals(page, app.origin);
                const note = after.active.find((item) =>
                    item.displayTitle === "快速记录一"
                );
                assert(note, "note exists");
                assertEquals(
                    after.active.length,
                    before.active.length + 1,
                );
                assertEquals(note.isHomeFixed, false);
                assertEquals(note.isFavorite, false);
                await page.getByRole("button", { name: "撤销", exact: true })
                    .click();
                await page.getByText("已记录笔记“快速记录一”").waitFor({
                    state: "detached",
                });
                const undone = await documentTotals(page, app.origin);
                assert(
                    !undone.active.some((item) => item.id === note.id),
                    "undone note left the library",
                );
                assert(undone.trashed.some((item) => item.id === note.id));

                await search.fill("快速记录二");
                await page.getByRole("option").first().waitFor();
                await search.press("Shift+Enter");
                await page.getByText("已记录笔记“快速记录二”").waitFor();
                await page.getByRole("button", { name: "固定到首页" }).click();
                await page.getByText("已记录笔记“快速记录二”并固定到首页")
                    .waitFor();
                const pinned = (await documentTotals(page, app.origin)).active
                    .find((item) => item.displayTitle === "快速记录二");
                assertEquals(pinned?.isHomeFixed, true);
                assertEquals(pinned?.isFavorite, false);
            },
        );

        await t.step("/ lists commands and executes them", async () => {
            await openHome(page, app.origin);
            await search.fill("/");
            await page.getByRole("option").first().waitFor();
            assertEquals(await groupNames(page), ["命令"]);
            const texts = await page.getByRole("option").allTextContents();
            for (const prefix of ["/g", "/b", "/ba", "/d", "/ai", "/dark"]) {
                assert(
                    texts.some((text) => text.includes(`${prefix} ·`)),
                    `${prefix} listed`,
                );
            }
            await search.fill("/dark");
            await page.getByRole("option", { name: /\/dark/ }).waitFor();
            await search.press("ArrowDown");
            await search.press("Enter");
            await page.waitForFunction(() =>
                document.documentElement.dataset.theme === "dark"
            );
            assertEquals(await search.inputValue(), "");
            await search.fill("/light");
            await page.getByRole("option", { name: /\/light/ }).waitFor();
            await search.press("ArrowDown");
            await search.press("Enter");
            await page.waitForFunction(() =>
                document.documentElement.dataset.theme === "light"
            );

            await search.fill("/notes");
            await page.getByRole("option", { name: /\/notes/ }).waitFor();
            await search.press("ArrowDown");
            await search.press("Enter");
            await page.locator(PANEL).waitFor();

            await openHome(page, app.origin);
            await search.fill("/wallpaper");
            await page.getByRole("option", { name: /\/wallpaper/ }).waitFor();
            await search.press("ArrowDown");
            await search.press("Enter");
            await page.waitForURL(/\/settings\/appearance$/);

            for (
                const [command, path] of [["settings", "/settings"], [
                    "trash",
                    "/trash",
                ]]
            ) {
                await openHome(page, app.origin);
                await search.fill(`/${command}`);
                await page.getByRole("option", {
                    name: new RegExp(`/${command}`),
                }).waitFor();
                await search.press("ArrowDown");
                await search.press("Enter");
                await page.waitForURL((url) => url.pathname === path);
            }
        });

        await t.step(
            "engine prefixes keep their explicit meaning",
            async () => {
                await openHome(page, app.origin);
                await search.fill("/b ");
                await search.fill("/b engine prefix");
                await page.getByRole("option", { name: /灵感网页/ }).waitFor();
                await search.press("Enter");
                await page.waitForURL(/bing\.com\/search/);
                assertEquals(
                    new URL(page.url()).searchParams.get("q"),
                    "engine prefix",
                );
                await openHome(page, app.origin);
                await search.fill("/g");
                await page.getByRole("option", { name: /\/g ·/ }).waitFor();
                await search.press("ArrowDown");
                await search.press("Enter");
                assertEquals(await search.inputValue(), "/g ");
            },
        );

        await t.step("IME composition suppresses every key", async () => {
            await openHome(page, app.origin);
            await search.fill("/");
            await page.getByRole("option").first().waitFor();
            const before = await documentTotals(page, app.origin);
            await search.evaluate((element) => {
                element.dispatchEvent(
                    new CompositionEvent("compositionstart", {
                        bubbles: true,
                    }),
                );
            });
            const results = await search.evaluate((element) => {
                const keys: [string, KeyboardEventInit][] = [
                    ["Enter", {}],
                    ["Enter", { altKey: true }],
                    ["Enter", { shiftKey: true }],
                    ["Enter", { ctrlKey: true }],
                    ["ArrowDown", {}],
                    ["ArrowUp", {}],
                    ["Escape", {}],
                ];
                return keys.map(([key, init]) =>
                    element.dispatchEvent(
                        new KeyboardEvent("keydown", {
                            key,
                            bubbles: true,
                            cancelable: true,
                            isComposing: true,
                            ...init,
                        }),
                    )
                );
            });
            // Only Enter is consumed (no implicit submit); candidate-navigation keys stay with the IME.
            assertEquals(results, [
                false,
                false,
                false,
                false,
                true,
                true,
                true,
            ]);
            assertEquals(await search.getAttribute("aria-expanded"), "true");
            assertEquals(
                await search.getAttribute("aria-activedescendant"),
                null,
            );
            assertEquals(await search.inputValue(), "/");
            assertEquals(new URL(page.url()).pathname, "/");
            await search.evaluate((element) => {
                element.dispatchEvent(
                    new CompositionEvent("compositionend", {
                        bubbles: true,
                        data: "/",
                    }),
                );
                element.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        key: "Enter",
                        shiftKey: true,
                        keyCode: 229,
                        bubbles: true,
                        cancelable: true,
                    }),
                );
            });
            assertEquals(await search.inputValue(), "/");
            const after = await documentTotals(page, app.origin);
            assertEquals(after.active.length, before.active.length);
            // After composition a normal key works again.
            await search.press("ArrowDown");
            assert(
                (await search.getAttribute("aria-activedescendant")) !== null,
            );
        });

        await t.step(
            "Escape closes the suggestions before the open workspace",
            async () => {
                await openHome(page, app.origin);
                await search.fill("/notes");
                await page.getByRole("option", { name: /\/notes/ }).waitFor();
                await search.press("ArrowDown");
                await search.press("Enter");
                await page.locator(PANEL).waitFor();
                await search.fill("灵感");
                await page.getByRole("option", { name: /灵感网页/ }).waitFor();
                await search.press("Escape");
                assertEquals(
                    await search.getAttribute("aria-expanded"),
                    "false",
                );
                assert(
                    await search.evaluate((el) =>
                        document.activeElement === el
                    ),
                );
                assertEquals(await page.locator(PANEL).count(), 1);
            },
        );

        await t.step(
            "401 from personal search removes personal groups",
            async () => {
                await openHome(page, app.origin);
                await context.route(PERSONAL, (route) =>
                    route.fulfill({
                        status: 401,
                        contentType: "application/json",
                        body: JSON.stringify({
                            status: false,
                            message: "未登录",
                        }),
                    }));
                await search.fill("灵感");
                await page.getByRole("option", { name: /灵感网页/ }).waitFor();
                await page.waitForFunction(() =>
                    !document.body.textContent?.includes("问 AI：")
                );
                assertEquals(await groupNames(page), ["网页"]);
                await context.unroute(PERSONAL);
            },
        );
        await context.close();

        const plainContext = await browser.newContext({
            viewport: { width: 1440, height: 900 },
        });
        await mockWeb(plainContext);
        const plain = await plainContext.newPage();

        await t.step(
            "no usable model hides the AI row and Alt+Enter is inert",
            async () => {
                await plain.goto(app.origin + "/register");
                await plain.locator("#auth-username").fill("omnibox_plain");
                await plain.locator("#auth-display-name").fill("Plain");
                await plain.locator("#auth-password").fill(
                    "Omnibox-plain-password-237",
                );
                await plain.locator("form button[type=submit]").click();
                await plain.waitForURL(app.origin + "/");
                const input = plain.locator("#search-query");
                await input.waitFor();
                await input.fill("灵感");
                await plain.getByRole("option", { name: /灵感网页/ }).waitFor();
                assertEquals(await groupNames(plain), ["网页"]);
                assertEquals(await plain.getByText("问 AI：").count(), 0);
                await input.press("Alt+Enter");
                assertEquals(new URL(plain.url()).pathname, "/");
                assertEquals(await input.inputValue(), "灵感");
                await input.fill("/");
                await plain.getByRole("option").first().waitFor();
                const texts = await plain.getByRole("option")
                    .allTextContents();
                assert(!texts.some((text) => text.includes("/ai ·")));
                // Enter is still a plain web search.
                await input.fill("灵感");
                await plain.getByRole("option", { name: /灵感网页/ }).waitFor();
                await input.press("Enter");
                await plain.waitForURL(/bing\.com\/search/);
            },
        );
        await plainContext.close();
    } finally {
        await browser.close();
        await app.close();
    }
});
