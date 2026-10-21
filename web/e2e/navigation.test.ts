import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { chromium, type Page } from "playwright";
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
                                ".auth-surface",
                            ).last().evaluate((surface) => {
                                const rect = surface.getBoundingClientRect();
                                const style = getComputedStyle(surface);
                                const padding = [
                                    style.paddingTop,
                                    style.paddingRight,
                                    style.paddingBottom,
                                    style.paddingLeft,
                                ].map(parseFloat);
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
                                        "h1, .page-description, label, form, .auth-footer",
                                    ),
                                ].map((element) =>
                                    element.getBoundingClientRect().left
                                );
                                return {
                                    width: rect.width,
                                    left: rect.left,
                                    right: rect.right,
                                    padding,
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
                                geometry.padding.every((value) => value > 0),
                                scenario + " card padding",
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
                                    control.left >=
                                            geometry.left +
                                                geometry.padding[3] &&
                                        control.right <=
                                            geometry.right -
                                                geometry.padding[1],
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
                    ["设置"],
                );
                assertEquals(
                    await page.getByRole("heading", { level: 2 })
                        .allTextContents(),
                    [heading],
                );
                assertEquals(
                    await page.getByRole("navigation", { name: "设置分类" })
                        .getByRole("button", { name: heading, exact: true })
                        .getAttribute("aria-current"),
                    "page",
                );
                assertEquals((await page.reload())?.status(), 200);
                await page.getByRole("heading", {
                    name: heading,
                    exact: true,
                }).first().waitFor({ state: "visible" });
            }
            await visit("/");
            await page.getByRole("link", { name: "设置", exact: true })
                .click();
            for (const label of ["外观", "AI 问答", "数据与同步", "快捷键"]) {
                await page.getByRole("navigation", { name: "设置分类" })
                    .getByRole("button", { name: label, exact: true })
                    .click();
            }
            await page.waitForURL(origin + "/settings/shortcuts");
            await page.goBack();
            await page.waitForURL(origin + "/");
            await visit("/settings/search");
            await page.waitForURL(origin + "/settings");
        },
    );
    await t.step(
        "anonymous device appearance survives reload without an account",
        async () => {
            await visit("/settings/appearance");
            await page.getByRole("tab", { name: "浅色", exact: true }).click();
            await page.getByRole("radio", { name: /空间轻桌面/ }).click();
            await page.waitForFunction(() => {
                const radio = document.querySelector(
                    'button[role="radio"][aria-checked="true"]',
                );
                return radio?.textContent?.includes("空间轻桌面") &&
                    document.documentElement.dataset.theme === "light";
            });

            await page.getByRole("link", { name: "Searcher 首页" }).click();
            await page.waitForURL(origin + "/");
            await page.locator("main.home-widgets").waitFor({
                state: "visible",
            });
            await page.getByRole("heading", { name: "Searcher." }).waitFor({
                state: "visible",
            });
            assertEquals(
                await page.evaluate(() =>
                    getComputedStyle(document.querySelector("main")!)
                        .getPropertyValue("--radius").trim()
                ),
                "22px",
            );

            await page.reload();
            await page.locator("main.home-widgets").waitFor({
                state: "visible",
            });
            await page.waitForFunction(() =>
                document.documentElement.dataset.theme === "light"
            );
            await page.getByRole("heading", { name: "Searcher." }).waitFor({
                state: "visible",
            });
            assertEquals(
                await page.evaluate(() =>
                    getComputedStyle(document.querySelector("main")!)
                        .getPropertyValue("--radius").trim()
                ),
                "22px",
            );
        },
    );
    await t.step(
        "unknown pages and workspace children render the same recoverable 404",
        async () => {
            for (
                const path of [
                    "/missing",
                    "/settings/nope",
                    "/settings/ai/extra",
                    "/settings/shortcuts/extra",
                    "/admin/nope",
                    "/admin/users/extra",
                ]
            ) {
                await visit(path);
                await page.getByRole("heading", { name: "页面不存在" })
                    .waitFor({ state: "visible" });
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
            await visit("/trash?filter=notes");
            await page.getByRole("link", { name: "请先登录", exact: true })
                .click();
            await page.getByRole("link", { name: "注册", exact: true })
                .click();
            await page.getByRole("link", { name: "登录", exact: true }).click();
            await page.getByRole("link", { name: "注册", exact: true }).click();
            assertStringIncludes(
                page.url(),
                "next=%2Ftrash%3Ffilter%3Dnotes",
            );
            await page.locator("#auth-username").fill(username);
            await page.locator("#auth-display-name").fill(
                "Navigation Test",
            );
            await page.locator("#auth-password").fill(password);
            await page.locator('form button[type="submit"]').click();
            await page.waitForURL(origin + "/trash?filter=notes");
        },
    );
    await t.step(
        "account appearance survives reload and syncs without leaking on logout or expiry",
        async () => {
            await visit("/settings/appearance");
            await page.locator(".user-avatar-badge").waitFor();
            await page.waitForFunction(() => {
                const radio = document.querySelector(
                    'button[role="radio"][aria-checked="true"]',
                );
                return radio?.textContent?.includes("极简呼吸");
            });

            await Promise.all([
                page.waitForResponse((r) =>
                    r.url().endsWith("/api/preferences") &&
                    r.request().method() === "PATCH" && r.ok()
                ),
                page.getByRole("tab", { name: "深色", exact: true }).click(),
            ]);
            await Promise.all([
                page.waitForResponse((r) =>
                    r.url().endsWith("/api/preferences") &&
                    r.request().method() === "PATCH" && r.ok()
                ),
                page.getByRole("radio", { name: /空间轻桌面/ }).click(),
            ]);
            await page.getByRole("switch", {
                name: "显示 Searcher 标题",
                exact: true,
            })
                .uncheck();
            await page.waitForFunction(async () => {
                const db = await new Promise<IDBDatabase>((resolve, reject) => {
                    const open = indexedDB.open("searcher-client");
                    open.onsuccess = () => resolve(open.result);
                    open.onerror = () => reject(open.error);
                });
                try {
                    return await new Promise<boolean>((resolve, reject) => {
                        const request = db.transaction("state", "readonly")
                            .objectStore("state").getAll();
                        request.onsuccess = () => {
                            const values: unknown[] = request.result;
                            resolve(
                                values.some((value) =>
                                    typeof value === "object" &&
                                    value !== null &&
                                    "showTitle" in value &&
                                    value.showTitle === false
                                ),
                            );
                        };
                        request.onerror = () => reject(request.error);
                    });
                } finally {
                    db.close();
                }
            });
            await page.reload();
            await page.waitForFunction(() =>
                document.documentElement.dataset.theme === "dark"
            );
            await page.waitForFunction(() => {
                const radio = document.querySelector(
                    'button[role="radio"][aria-checked="true"]',
                );
                return radio?.textContent?.includes("空间轻桌面");
            });

            assertEquals(
                await page.getByRole("switch", {
                    name: "显示 Searcher 标题",
                    exact: true,
                })
                    .isChecked(),
                false,
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
                await remote.locator("main.home-widgets").waitFor({
                    state: "visible",
                });
                assertEquals(
                    await remote.evaluate(() =>
                        getComputedStyle(document.querySelector("main")!)
                            .getPropertyValue("--radius").trim()
                    ),
                    "22px",
                );
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
            await page.waitForFunction(() => {
                const radio = document.querySelector(
                    'button[role="radio"][aria-checked="true"]',
                );
                return radio?.textContent?.includes("空间轻桌面");
            });

            await visit("/register");
            await page.locator("#auth-username").fill(username + "_other");
            await page.locator("#auth-display-name").fill("Other account");
            await page.locator("#auth-password").fill(password);
            await page.locator("form button[type=submit]").click();
            await page.waitForURL(origin + "/");
            await Promise.all([
                page.waitForResponse((r) =>
                    r.url().endsWith("/api/preferences") &&
                    r.request().method() === "GET" && r.ok()
                ),
                visit("/settings/appearance"),
            ]);
            assertEquals(
                await page.getByRole("switch", {
                    name: "显示 Searcher 标题",
                    exact: true,
                })
                    .isChecked(),
                true,
            );
            await page.getByRole("button", { name: /^用户菜单/ }).click();
            await page.getByRole("menuitem", { name: "退出登录", exact: true })
                .click();
            await page.getByRole("link", { name: "登录", exact: true })
                .waitFor();
            await visit("/login");
            await signIn();
            await page.waitForURL(origin + "/");
            await page.locator("main.home-widgets").waitFor({
                state: "visible",
            });

            await context.clearCookies();
            await page.getByRole("link", { name: "设置", exact: true }).click();
            await page.getByRole("navigation", { name: "设置分类" })
                .getByRole("button", { name: "AI 问答", exact: true }).click();
            await page.getByRole("link", { name: "登录", exact: true })
                .waitFor();
            await page.waitForFunction(() =>
                document.documentElement.dataset.theme === "light"
            );

            await visit("/");
            await page.locator("main.home-widgets").waitFor({
                state: "visible",
            });
            await page.getByRole("heading", { name: "Searcher." }).waitFor({
                state: "visible",
            });
        },
    );
    await t.step(
        "login restores ask, trash and account queries; direct and external next return home",
        async () => {
            for (
                const [path, label] of [["/ask?q=foo", "登录后提问"], [
                    "/trash?filter=notes",
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
            await guest.getByRole("heading", { name: "同步" }).waitFor();
            assertEquals(
                await guest.getByRole("link", { name: "打开 Design Lab" })
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
                await page.getByRole("link", { name: "打开 Design Lab" })
                    .count(),
                0,
            );
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
                await page.getByRole("navigation", { name: "页面层级" })
                    .getByText(label, { exact: true }).waitFor();
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
            await page.getByRole("link", { name: "打开 Design Lab" }).click();
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
        "mobile breadcrumbs remain visible within viewport",
        async () => {
            await page.setViewportSize({ width: 320, height: 800 });
            for (
                const path of [
                    "/settings/data",
                    "/admin/backup",
                    "/account",
                    "/trash",
                ]
            ) {
                await visit(path);
                const nav = page.getByRole("navigation", {
                    name: "页面层级",
                });
                await nav.waitFor({ state: "visible" });
                const bounds = await nav.boundingBox();
                assertEquals(
                    !!bounds && bounds.x >= 0 &&
                        bounds.x + bounds.width <= 320,
                    true,
                    path,
                );
                await nav.getByRole("link", { name: "首页", exact: true })
                    .click();
                await page.waitForURL(origin + "/");
            }
        },
    );
});
