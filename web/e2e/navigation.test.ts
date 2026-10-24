import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { type BrowserContext, type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { eq } from "drizzle-orm";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { users } from "../../src/db/schema.ts";
import {
    AuthService,
    SESSION_COOKIE_NAME,
} from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

// React Router starts a view transition for each `viewTransition` navigation.
function trackViewTransitions(context: BrowserContext) {
    return context.addInitScript(() => {
        const start = document.startViewTransition.bind(document);
        let count = 0;
        let finished: Promise<void> = Promise.resolve();
        Object.defineProperty(globalThis, "viewTransitionCount", {
            get: () => count,
        });
        Object.defineProperty(globalThis, "viewTransitionFinished", {
            get: () => finished,
        });
        document.startViewTransition = (
            ...args: Parameters<Document["startViewTransition"]>
        ) => {
            count += 1;
            const transition = start(...args);
            finished = transition.finished;
            return transition;
        };
    });
}

async function viewTransitions(page: Page, expected: number): Promise<number> {
    await page.waitForFunction(
        (count) => Reflect.get(globalThis, "viewTransitionCount") >= count,
        expected,
    );
    return page.evaluate(async () => {
        await Reflect.get(globalThis, "viewTransitionFinished");
        return Reflect.get(globalThis, "viewTransitionCount") as number;
    });
}

// Run with deno task test:routing; the task builds the real production frontend.
Deno.test("production navigation contracts", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({ prefix: "searcher_navigation_" });
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
    const username = "navigation_user";
    const password = "Navigation-test-password-28";
    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor();
    }
    async function signIn(target: Page = page) {
        await target.locator("#auth-username").fill(username);
        await target.locator("#auth-password").fill(password);
        await target.locator('form button[type="submit"]').click();
    }
    await t.step(
        "auth surfaces retain responsive geometry in both themes",
        async () => {
            const guest = await browser.newContext();
            try {
                const target = await guest.newPage();
                for (const colorScheme of ["light", "dark"] as const) {
                    await target.emulateMedia({
                        colorScheme,
                        reducedMotion: "reduce",
                    });
                    for (const width of [390, 768, 1440]) {
                        await target.setViewportSize({ width, height: 900 });
                        for (const path of ["/login", "/register"]) {
                            await visit(path, target);
                            await target.locator("#auth-username").waitFor();
                            await target.waitForFunction(
                                (theme) =>
                                    document.documentElement.dataset.theme ===
                                        theme,
                                colorScheme,
                            );
                            const geometry = await target.locator(
                                ".narrow-form",
                            ).last().evaluate((surface) => {
                                const rect = surface.getBoundingClientRect();
                                const style = getComputedStyle(surface);
                                const max = parseFloat(
                                    style.getPropertyValue("--layout-auth-max"),
                                );
                                const controls = [
                                    ...surface.querySelectorAll(
                                        "input, button[type=submit]",
                                    ),
                                ].map((control) => {
                                    const box = control.getBoundingClientRect();
                                    return { left: box.left, right: box.right };
                                });
                                const axes = [
                                    ...surface.querySelectorAll(
                                        "h1, label, form, .auth-footer",
                                    ),
                                ].map((element) =>
                                    element.getBoundingClientRect().left
                                );
                                return {
                                    width: rect.width,
                                    left: rect.left,
                                    right: rect.right,
                                    max,
                                    controls,
                                    axes,
                                    overflow:
                                        document.documentElement.scrollWidth >
                                            innerWidth,
                                };
                            });
                            const scenario = path + " " + width + "px " +
                                colorScheme;
                            assert(
                                geometry.width <= geometry.max,
                                scenario + " narrow surface",
                            );
                            assert(
                                !geometry.overflow,
                                scenario + " horizontal overflow",
                            );
                            assert(
                                geometry.left > 0 && geometry.right < width,
                                scenario + " page gutters",
                            );
                            for (const control of geometry.controls) {
                                assert(
                                    control.left >= geometry.left &&
                                        control.right <= geometry.right,
                                    scenario + " control containment",
                                );
                            }
                            assert(
                                geometry.axes.every((left) =>
                                    Math.abs(left - geometry.axes[0]) < 1
                                ),
                                scenario + " content axis",
                            );
                        }
                    }
                }
            } finally {
                await guest.close();
            }
        },
    );
    await t.step(
        "auth switch links use the accent color and underline on hover",
        async () => {
            const guest = await browser.newContext();
            try {
                const target = await guest.newPage();
                for (const colorScheme of ["light", "dark"] as const) {
                    await target.emulateMedia({ colorScheme });
                    for (
                        const [path, name] of [
                            ["/login", "注册"],
                            ["/register", "登录"],
                        ] as const
                    ) {
                        await visit(path, target);
                        await target.waitForFunction(
                            (theme) =>
                                document.documentElement.dataset.theme ===
                                    theme,
                            colorScheme,
                        );
                        const link = target.locator(".auth-footer")
                            .getByRole("link", { name, exact: true });
                        await link.waitFor({ state: "visible" });
                        const accent = await target.evaluate(() => {
                            const probe = document.createElement("span");
                            probe.style.color = "var(--accent)";
                            document.body.append(probe);
                            const color = getComputedStyle(probe).color;
                            probe.remove();
                            return color;
                        });
                        const appearance = () =>
                            link.evaluate((element) => {
                                const style = getComputedStyle(element);
                                return {
                                    color: style.color,
                                    decoration: style.textDecorationLine,
                                };
                            });
                        const scenario = path + " " + colorScheme;
                        assertEquals(
                            (await appearance()).color,
                            accent,
                            scenario + " link color",
                        );
                        assertEquals(
                            (await appearance()).decoration,
                            "none",
                            scenario + " resting link",
                        );
                        await link.hover();
                        assertEquals(
                            (await appearance()).decoration,
                            "underline",
                            scenario + " hovered link",
                        );
                    }
                }
            } finally {
                await guest.close();
            }
        },
    );
    await t.step(
        "settings direct-entry, refresh, canonicalization and one-step Back",
        async () => {
            for (
                const [path, heading] of [
                    ["/settings", "搜索"],
                    ["/settings/appearance", "外观"],
                    ["/settings/ai", "AI 问答"],
                    ["/settings/data", "数据与同步"],
                    ["/settings/shortcuts", "快捷键"],
                ]
            ) {
                await visit(path);
                await page.getByRole("heading", {
                    name: heading,
                    exact: true,
                }).first().waitFor({ state: "visible" });
                assertEquals(
                    await page.getByRole("heading", { level: 1 })
                        .allTextContents(),
                    [heading],
                );
                assertEquals(
                    await page.getByRole("navigation", { name: "设置分类" })
                        .getByRole("link", { name: heading, exact: true })
                        .getAttribute("aria-current"),
                    "page",
                );
                assertEquals((await page.reload())?.status(), 200);
                await page.getByRole("heading", {
                    name: heading,
                    exact: true,
                }).first().waitFor({ state: "visible" });
            }
            // A guest's home top bar holds only the theme and sign-in; settings
            // and the shortcut reference open from search box commands.
            await visit("/");
            assertEquals(
                (await page.getByRole("navigation", { name: "账户与设置" })
                    .locator("a, button").evaluateAll((items) =>
                        items.map((item) => item.getAttribute("aria-label"))
                    )).map((label) => label?.split("，")[0]),
                ["切换主题", "登录"],
            );
            const search = page.locator("#search-query");
            await search.fill("/快捷键");
            await page.getByRole("option", { name: /查看快捷键/ }).waitFor();
            await search.press("ArrowDown");
            await search.press("Enter");
            await page.waitForURL(origin + "/settings/shortcuts");
            await page.goBack();
            await page.waitForURL(origin + "/");
            await search.fill("/settings");
            await page.getByRole("option", { name: /打开设置/ }).click();
            await page.waitForURL(origin + "/settings");
            for (const label of ["外观", "AI 问答", "数据与同步", "快捷键"]) {
                await page.getByRole("navigation", { name: "设置分类" })
                    .getByRole("link", { name: label, exact: true })
                    .click();
            }
            await page.waitForURL(origin + "/settings/shortcuts");
            await page.goBack();
            await page.waitForURL(origin + "/");
            await visit("/settings/search");
            await page.getByRole("heading", {
                level: 1,
                name: "搜索",
                exact: true,
            }).waitFor({ state: "visible" });
            assertEquals(page.url(), origin + "/settings/search");
            assertEquals(
                await page.getByRole("link", { name: "设置", exact: true })
                    .count(),
                1,
                "pages other than home keep the settings link",
            );
        },
    );
    await t.step(
        "anonymous device appearance survives reload without an account",
        async () => {
            await visit("/settings/appearance");
            await page.getByRole("radio", { name: "浅色", exact: true })
                .click();
            await page.waitForFunction(() =>
                document.documentElement.dataset.theme === "light"
            );

            await page.getByRole("link", { name: "Searcher 首页" }).click();
            await page.waitForURL(origin + "/");
            await page.locator("main.home").waitFor({
                state: "visible",
            });

            await page.reload();
            await page.locator("main.home").waitFor({
                state: "visible",
            });
            await page.waitForFunction(() =>
                document.documentElement.dataset.theme === "light"
            );
        },
    );
    await t.step(
        "unknown pages and workspace children render the same recoverable 404 in a narrow column",
        async () => {
            const cases: [
                path: string,
                back?: { label: string; to: string },
            ][] = [
                ["/missing"],
                ["/settings/nope", { label: "返回设置", to: "/settings" }],
                [
                    "/settings/ai/extra",
                    { label: "返回设置", to: "/settings" },
                ],
                [
                    "/settings/shortcuts/extra",
                    { label: "返回设置", to: "/settings" },
                ],
                ["/admin/nope", { label: "返回管理后台", to: "/admin" }],
                [
                    "/admin/users/extra",
                    { label: "返回管理后台", to: "/admin" },
                ],
            ];
            for (const [path, back] of cases) {
                await visit(path);
                await page.getByRole("heading", {
                    level: 1,
                    name: "页面不存在",
                    exact: true,
                }).waitFor({ state: "visible" });
                await page.getByText("链接可能有误，或页面已被移除。").waitFor({
                    state: "visible",
                });
                // Home is the only primary action; settings and admin paths add
                // one way back into the area they were under.
                assertEquals(
                    (await page.locator("main").getByRole("link")
                        .allTextContents()).map((label) => label.trim()),
                    back ? ["返回首页", back.label] : ["返回首页"],
                    path + " actions",
                );
                if (back) {
                    assertEquals(
                        await page.getByRole("link", {
                            name: back.label,
                            exact: true,
                        }).getAttribute("href"),
                        back.to,
                        path + " back target",
                    );
                }
                const column = await page.locator(".narrow-form").evaluate(
                    (element) => {
                        const rect = element.getBoundingClientRect();
                        return {
                            width: rect.width,
                            max: parseFloat(
                                getComputedStyle(element).getPropertyValue(
                                    "--layout-auth-max",
                                ),
                            ),
                            offCenter: Math.abs(
                                rect.left + rect.width / 2 -
                                    document.documentElement.clientWidth / 2,
                            ),
                        };
                    },
                );
                assert(column.width <= column.max, path + " narrow column");
                assert(column.offCenter < 1, path + " centered column");
                await page.getByRole("link", {
                    name: "返回首页",
                    exact: true,
                }).click();
                await page.waitForURL(origin + "/");
            }
        },
    );
    await t.step(
        "register after a guest CTA retains destination through auth mode switching",
        async () => {
            await visit("/trash?filter=documents");
            await page.getByRole("link", { name: "请先登录", exact: true })
                .click();
            await page.getByRole("link", { name: "注册", exact: true })
                .click();
            await page.getByRole("link", { name: "登录", exact: true }).click();
            await page.getByRole("link", { name: "注册", exact: true }).click();
            assertStringIncludes(
                page.url(),
                "next=%2Ftrash%3Ffilter%3Ddocuments",
            );
            await page.locator("#auth-username").fill(username);
            await page.locator("#auth-display-name").fill(
                "Navigation Test",
            );
            await page.locator("#auth-password").fill(password);
            await page.locator('form button[type="submit"]').click();
            await page.waitForURL(origin + "/trash?filter=documents");
        },
    );
    await t.step(
        "account appearance survives reload and syncs without leaking on logout or expiry",
        async () => {
            await visit("/settings/appearance");
            await page.locator(".user-avatar-badge").waitFor();

            await Promise.all([
                page.waitForResponse((r) =>
                    r.url().endsWith("/api/preferences") &&
                    r.request().method() === "PATCH" && r.ok()
                ),
                page.getByRole("radio", { name: "深色", exact: true }).click(),
            ]);
            await page.reload();
            await page.waitForFunction(() =>
                document.documentElement.dataset.theme === "dark"
            );

            const otherDevice = await browser.newContext({
                colorScheme: "light",
            });
            try {
                const remote = await otherDevice.newPage();
                await visit("/login", remote);
                await signIn(remote);
                await remote.waitForURL(origin + "/");
                await remote.waitForFunction(() =>
                    document.documentElement.dataset.theme === "dark"
                );
                await remote.locator("main.home").waitFor({
                    state: "visible",
                });
            } finally {
                await otherDevice.close();
            }

            await page.getByRole("button", { name: /^用户菜单/ }).click();
            await page.getByRole("menuitem", { name: "退出登录", exact: true })
                .click();
            await page.getByRole("link", { name: "登录", exact: true })
                .waitFor();
            await page.waitForFunction(() =>
                document.documentElement.dataset.theme === "light"
            );

            await visit("/register");
            await page.locator("#auth-username").fill(username + "_other");
            await page.locator("#auth-display-name").fill("Other account");
            await page.locator("#auth-password").fill(password);
            await page.locator("form button[type=submit]").click();
            await page.waitForURL(origin + "/");
            await page.getByRole("button", { name: /^用户菜单/ }).click();
            await page.getByRole("menuitem", { name: "退出登录", exact: true })
                .click();
            await page.getByRole("link", { name: "登录", exact: true })
                .waitFor();
            await visit("/login");
            await signIn();
            await page.waitForURL(origin + "/");
            await page.locator("main.home").waitFor({
                state: "visible",
            });

            await context.clearCookies();
            await page.getByRole("button", { name: /^用户菜单/ }).click();
            await page.getByRole("menuitem", { name: "偏好设置", exact: true })
                .click();
            await page.getByRole("navigation", { name: "设置分类" })
                .getByRole("link", { name: "AI 问答", exact: true }).click();
            await page.getByRole("link", { name: "登录", exact: true })
                .first().waitFor();
            await page.waitForFunction(() =>
                document.documentElement.dataset.theme === "light"
            );

            await visit("/");
            await page.locator("main.home").waitFor({
                state: "visible",
            });
        },
    );
    await t.step(
        "login restores ask, trash and account queries; direct and external next return home",
        async () => {
            for (
                const [path, label] of [["/ask?q=foo", "登录后提问"], [
                    "/trash?filter=documents",
                    "请先登录",
                ], ["/account?section=password", "前往登录"]]
            ) {
                await context.clearCookies();
                await visit(path);
                await page.getByRole("link", { name: label, exact: true })
                    .click();
                await signIn();
                await page.waitForURL(origin + path);
            }
            for (
                const path of [
                    "/login",
                    "/login?next=https%3A%2F%2Fevil.example",
                    "/login?next=%2F%2Fevil.example",
                    "/login?next=%2Fsafe%2F..%2F%2Fevil.example",
                ]
            ) {
                await context.clearCookies();
                await visit(path);
                await signIn();
                await page.waitForURL(origin + "/");
            }
        },
    );
    await t.step(
        "settings data tab hides the Design Lab entry from guests and regular users",
        async () => {
            const guestContext = await browser.newContext();
            const guest = await guestContext.newPage();
            await visit("/settings/data", guest);
            await guest.getByRole("heading", { name: "同步", exact: true })
                .waitFor();
            assertEquals(
                await guest.getByRole("link", { name: "打开设计实验室" })
                    .count(),
                0,
            );
            assertEquals(
                await guest.getByRole("heading", { name: "数据管理" }).count(),
                0,
            );
            await guestContext.close();

            await visit("/settings/data");
            await page.getByRole("link", { name: "打开回收站" }).waitFor();
            assertEquals(
                await page.getByRole("link", { name: "打开设计实验室" })
                    .count(),
                0,
            );
        },
    );
    await t.step(
        "account page joins the settings shell for signed-in users and stays out of the guest list",
        async () => {
            const settingsNav = page.getByRole("navigation", {
                name: "设置分类",
            });
            const accountLink = settingsNav.getByRole("link", {
                name: "账户与安全",
                exact: true,
            });
            const accountHeading = page.getByRole("heading", {
                level: 1,
                name: "账户与安全",
                exact: true,
            });
            const entries = async (target: Page) =>
                (await target.getByRole("navigation", { name: "设置分类" })
                    .getByRole("link").allTextContents()).map((label) =>
                        label.trim()
                    );
            const withAccount = [
                "账户与安全",
                "搜索",
                "外观",
                "AI 问答",
                "数据与同步",
                "快捷键",
            ];

            // Wide: the account content sits beside the navigation, marked current.
            await visit("/account");
            await accountLink.waitFor({ state: "visible" });
            assertEquals(await entries(page), withAccount);
            assertEquals(
                await accountLink.getAttribute("aria-current"),
                "page",
            );
            assertEquals(
                await page.getByRole("heading", { level: 1 })
                    .allTextContents(),
                ["账户与安全"],
            );
            assertEquals(
                await page.locator(".settings-back").isVisible(),
                false,
            );
            assertEquals(
                await page.locator('.topbar-link--active[aria-label="设置"]')
                    .count(),
                1,
            );
            await settingsNav.getByRole("link", { name: "外观", exact: true })
                .click();
            await page.waitForURL(origin + "/settings/appearance");
            await page.getByRole("heading", {
                level: 1,
                name: "外观",
                exact: true,
            }).waitFor({ state: "visible" });
            assertEquals(await accountLink.getAttribute("aria-current"), null);
            await accountLink.click();
            await page.waitForURL(origin + "/account");
            await accountHeading.waitFor({ state: "visible" });
            assertEquals(
                await accountLink.getAttribute("aria-current"),
                "page",
            );

            // Entering from the user menu keeps a normal history entry; the
            // navigation items, account included, replace it.
            await visit("/");
            await page.getByRole("button", { name: /^用户菜单/ }).click();
            await page.getByRole("menuitem", {
                name: "账户与安全",
                exact: true,
            }).click();
            await page.waitForURL(origin + "/account");
            await accountHeading.waitFor({ state: "visible" });
            await settingsNav.getByRole("link", { name: "快捷键", exact: true })
                .click();
            await page.waitForURL(origin + "/settings/shortcuts");
            await page.goBack();
            await page.waitForURL(origin + "/");

            // Narrow: /settings lists the account, /account opens as a detail view.
            await page.setViewportSize({ width: 390, height: 844 });
            try {
                await visit("/settings");
                await accountLink.waitFor({ state: "visible" });
                assertEquals(await entries(page), withAccount);
                await accountLink.click();
                await page.waitForURL(origin + "/account");
                await accountHeading.waitFor({ state: "visible" });
                assertEquals(await settingsNav.isVisible(), false);
                const back = page.locator(".settings-back");
                await back.waitFor({ state: "visible" });
                await back.click();
                await page.waitForURL(origin + "/settings");
                await settingsNav.waitFor({ state: "visible" });
            } finally {
                await page.setViewportSize({ width: 1280, height: 720 });
            }

            // Guests never see the entry; direct entry keeps its sign-in prompt.
            const guestContext = await browser.newContext();
            try {
                const guest = await guestContext.newPage();
                await visit("/settings", guest);
                await guest.getByRole("navigation", { name: "设置分类" })
                    .waitFor({ state: "visible" });
                assertEquals(await entries(guest), withAccount.slice(1));
                await visit("/account", guest);
                await guest.getByRole("heading", {
                    level: 1,
                    name: "账户与安全",
                    exact: true,
                }).waitFor({ state: "visible" });
                await guest.getByRole("link", { name: "前往登录", exact: true })
                    .waitFor({ state: "visible" });
                assertEquals(await entries(guest), withAccount.slice(1));
            } finally {
                await guestContext.close();
            }
        },
    );
    await t.step(
        "top-level navigations start a view transition; settings navigation stays in its shell",
        async () => {
            await trackViewTransitions(context);
            const settingsNav = page.getByRole("navigation", {
                name: "设置分类",
            });

            // Home has no settings link; any other page keeps it.
            await visit("/trash");
            await page.getByRole("link", { name: "设置", exact: true }).click();
            await page.waitForURL(origin + "/settings");
            await settingsNav.waitFor({ state: "visible" });
            assertEquals(await viewTransitions(page, 1), 1, "top bar link");
            await settingsNav.getByRole("link", { name: "外观", exact: true })
                .click();
            await page.getByRole("heading", {
                level: 1,
                name: "外观",
                exact: true,
            }).waitFor({ state: "visible" });
            await settingsNav.getByRole("link", {
                name: "账户与安全",
                exact: true,
            }).click();
            await page.getByRole("heading", {
                level: 1,
                name: "账户与安全",
                exact: true,
            }).waitFor({ state: "visible" });
            assertEquals(
                await viewTransitions(page, 1),
                1,
                "settings navigation",
            );
            await page.getByRole("button", { name: /^用户菜单/ }).click();
            await page.getByRole("menuitem", {
                name: "偏好设置",
                exact: true,
            }).click();
            await page.waitForURL(origin + "/settings");
            await settingsNav.waitFor({ state: "visible" });
            assertEquals(await viewTransitions(page, 2), 2, "user menu entry");
            await page.getByRole("link", { name: "Searcher 首页" }).click();
            await page.waitForURL(origin + "/");
            await page.locator("main.home").waitFor({ state: "visible" });
            assertEquals(await viewTransitions(page, 3), 3, "home wordmark");

            const guestContext = await browser.newContext();
            try {
                await trackViewTransitions(guestContext);
                const guest = await guestContext.newPage();
                await visit("/missing", guest);
                await guest.getByRole("link", {
                    name: "返回首页",
                    exact: true,
                }).click();
                await guest.waitForURL(origin + "/");
                await guest.locator("main.home").waitFor({ state: "visible" });
                assertEquals(
                    await viewTransitions(guest, 1),
                    1,
                    "404 home link",
                );
                await visit("/login", guest);
                await guest.getByRole("link", { name: "注册", exact: true })
                    .click();
                await guest.waitForURL(origin + "/register");
                await guest.locator("#auth-display-name").waitFor();
                assertEquals(
                    await viewTransitions(guest, 1),
                    1,
                    "auth mode link",
                );
            } finally {
                await guestContext.close();
            }
        },
    );
    await t.step(
        "admin exact children, tab Back and AI Provider workspace entry",
        async () => {
            await store.run((db) =>
                db.update(users).set({ role: "admin" }).where(
                    eq(users.username, username),
                ).run()
            );
            const [user] = await store.run((db) =>
                db.select().from(users).where(eq(users.username, username))
                    .limit(1).all()
            );
            const session = await auth.createSession(
                user.id,
                user.authVersion,
            );
            await context.addCookies([{
                name: SESSION_COOKIE_NAME,
                value: session.token,
                url: origin,
                httpOnly: true,
                sameSite: "Lax",
            }]);
            for (
                const [path, label] of [
                    ["/admin", "概览"],
                    ["/admin/users", "用户管理"],
                    ["/admin/settings", "系统设置"],
                    ["/admin/audit", "审计日志"],
                    ["/admin/backup", "备份与恢复"],
                ]
            ) {
                await visit(path);
                const activeLink = page.getByRole("navigation", {
                    name: "管理后台主导航",
                }).getByRole("link", { name: label, exact: true });
                await activeLink.waitFor();
                assertEquals(
                    await activeLink.getAttribute("aria-current"),
                    "page",
                );
                assertEquals((await page.reload())?.status(), 200);
            }
            await visit("/");
            await page.getByRole("button", { name: /用户菜单/ }).click();
            await page.getByRole("menuitem", {
                name: "管理后台",
                exact: true,
            }).click();
            for (
                const label of [
                    "用户管理",
                    "系统设置",
                    "审计日志",
                    "备份与恢复",
                ]
            ) {
                await page.getByRole("navigation", { name: "管理后台主导航" })
                    .getByRole("link", { name: new RegExp("^" + label) })
                    .click();
            }
            await page.waitForURL(origin + "/admin/backup");
            await page.goBack();
            await page.waitForURL(origin + "/");
            await visit("/admin");
            await page.getByRole("link", {
                name: /^配置 AI Provider/,
            }).click();
            await page.waitForURL(origin + "/settings/ai");
            await page.goBack();
            await page.waitForURL(origin + "/admin");
        },
    );
    await t.step(
        "settings data tab shows the Design Lab entry to admins",
        async () => {
            await visit("/settings/data");
            await page.getByRole("link", { name: "打开设计实验室" }).click();
            await page.waitForURL(origin + "/design-lab");
        },
    );
    await t.step(
        "admin dialog keyboard close restores focus to its opener",
        async () => {
            await visit("/admin/users");
            const opener = page.getByRole("button", {
                name: "重置密码",
                exact: true,
            }).first();
            const handle = await opener.elementHandle();
            assertEquals(handle !== null, true);
            await opener.click();
            const dialog = page.getByRole("dialog");
            await dialog.waitFor({ state: "visible" });
            try {
                await page.keyboard.press("Escape");
                await dialog.waitFor({ state: "hidden" });
                await page.waitForFunction(
                    (element) => document.activeElement === element,
                    handle,
                );
                assertEquals(
                    await opener.evaluate((element) =>
                        document.activeElement === element
                    ),
                    true,
                );
            } finally {
                await handle?.dispose();
            }
        },
    );
    await t.step(
        "mobile settings back link and admin navigation remain within viewport",
        async () => {
            await page.setViewportSize({ width: 320, height: 800 });
            await visit("/settings/data");
            const back = page.locator(".settings-back");
            await back.waitFor({ state: "visible" });
            const backBounds = await back.boundingBox();
            assertEquals(
                !!backBounds && backBounds.x >= 0 &&
                    backBounds.x + backBounds.width <= 320,
                true,
                "Settings back link",
            );
            await back.click();
            await page.waitForURL(origin + "/settings");
            await page.getByRole("navigation", { name: "设置分类" }).waitFor();

            await visit("/admin/backup");
            const nav = page.getByRole("navigation", {
                name: "管理后台主导航",
            });
            await nav.waitFor({ state: "visible" });
            const bounds = await nav.boundingBox();
            assertEquals(
                !!bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320,
                true,
                "/admin/backup",
            );
            await nav.getByRole("link", { name: "概览", exact: true }).click();
            await page.waitForURL(origin + "/admin");
        },
    );
});
