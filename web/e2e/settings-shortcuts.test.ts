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

Deno.test("production settings shortcuts contracts", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({
        prefix: "searcher_shortcuts_test_",
    });
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

    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor();
    }

    await t.step(
        "guest direct access, active tab state, and refresh persistence",
        async () => {
            // Direct access as guest
            await visit("/settings/shortcuts");
            await page.getByRole("heading", {
                level: 1,
                name: "快捷键",
                exact: true,
            }).waitFor({ state: "visible" });
            assertEquals(
                await page.getByRole("heading", { level: 1 }).allTextContents(),
                ["快捷键"],
            );
            assertEquals(
                await page.getByRole("heading", { level: 2 }).allTextContents(),
                [
                    "全局",
                    "搜索",
                    "AI 问答",
                    "笔记编辑",
                    "快捷命令",
                ],
            );
            assertEquals(
                await page.getByRole("heading", { level: 3 }).count(),
                0,
            );

            // Active tab navigation link state
            const navLink = page.getByRole("navigation", { name: "设置分类" })
                .getByRole("link", { name: "快捷键", exact: true });
            assertEquals(await navLink.getAttribute("aria-current"), "page");

            // Refresh persistence
            const reloadResponse = await page.reload();
            assertEquals(reloadResponse?.status(), 200);
            await page.getByRole("heading", {
                level: 1,
                name: "快捷键",
                exact: true,
            }).waitFor({ state: "visible" });
            assertEquals(
                await page.getByRole("heading", { level: 1 }).allTextContents(),
                ["快捷键"],
            );
        },
    );

    await t.step(
        "settings 404 for unknown shortcut routes and recovery",
        async () => {
            for (
                const badPath of [
                    "/settings/shortcuts/extra",
                    "/settings/shortcuts-fake",
                ]
            ) {
                await visit(badPath);
                await page.getByRole("heading", { name: "页面不存在" }).waitFor(
                    { state: "visible" },
                );
                await page.getByRole("link", { name: "返回首页", exact: true })
                    .click();
                await page.waitForURL(origin + "/");
            }
        },
    );

    await t.step(
        "macOS and other platform keycaps and screen reader accessibility",
        async () => {
            // Real platform detection on macOS context
            const macContext = await browser.newContext({
                userAgent:
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            });
            const macPage = await macContext.newPage();
            await visit("/settings/shortcuts", macPage);
            await macPage.locator('.settings-shortcuts[data-platform="mac"]')
                .waitFor();
            const macKbd = await macPage.locator(".settings-shortcut-keycap")
                .allTextContents();
            assert(macKbd.some((text) => text.includes("⌘ K")));
            assert(macKbd.some((text) => text.includes("⌘ ⇧ X")));
            assert(macKbd.some((text) => text.includes("⌘ Enter")));
            assert(macKbd.some((text) => text.includes("/g")));
            assert(macKbd.includes("⌘ ."));

            // Screen reader accessible text on Mac
            const macSr = await macPage.locator(".settings-shortcuts .sr-only")
                .allTextContents();
            assert(macSr.some((text) => text.includes("Command K")));
            assert(macSr.some((text) => text.includes("Command Shift X")));
            assert(macSr.some((text) => text.includes("快捷命令：/g")));
            assert(macSr.includes("快捷键：Command ."));
            await macContext.close();

            // Real platform detection on Linux/Windows context
            const linuxContext = await browser.newContext({
                userAgent:
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            });
            const linuxPage = await linuxContext.newPage();
            await visit("/settings/shortcuts", linuxPage);
            await linuxPage.locator(
                '.settings-shortcuts[data-platform="other"]',
            ).waitFor();
            const otherKbd = await linuxPage.locator(
                ".settings-shortcut-keycap",
            ).allTextContents();
            assert(otherKbd.some((text) => text.includes("Ctrl + K")));
            assert(otherKbd.some((text) => text.includes("Ctrl + Shift + X")));
            assert(otherKbd.some((text) => text.includes("Ctrl + Enter")));
            assert(otherKbd.includes("Ctrl + ."));

            // Screen reader accessible text on other
            const otherSr = await linuxPage.locator(
                ".settings-shortcuts .sr-only",
            ).allTextContents();
            assert(otherSr.some((text) => text.includes("Ctrl + K")));
            assert(otherSr.some((text) => text.includes("Ctrl + Shift + X")));
            assert(otherSr.includes("快捷键：Ctrl + ."));

            // Verify Cmd/Ctrl+K context separation in DOM
            const globalSection = linuxPage.locator(".settings-group").filter({
                has: linuxPage.getByRole("heading", {
                    name: "全局",
                    exact: true,
                }),
            });
            assertStringIncludes(
                await globalSection.innerText(),
                "首页非可编辑区域",
            );
            assertStringIncludes(
                await globalSection.innerText(),
                "笔记正文中由插入链接优先处理",
            );
            await globalSection.getByText("进入或退出桌面“览”", { exact: true })
                .waitFor();
            assertStringIncludes(
                await globalSection.innerText(),
                "首页（含主搜索框），需要登录",
            );
            assertStringIncludes(
                await globalSection.innerText(),
                "笔记编辑器与其他输入控件内不响应。",
            );

            const notesSection = linuxPage.locator(".settings-group").filter({
                has: linuxPage.getByRole("heading", {
                    name: "笔记编辑",
                    exact: true,
                }),
            });
            assertStringIncludes(
                await notesSection.innerText(),
                "笔记正文编辑器",
            );
            assertStringIncludes(
                await notesSection.innerText(),
                "本地编辑操作优先，不会聚焦主搜索框",
            );
            await linuxContext.close();
        },
    );

    await t.step(
        "responsive geometry across 390 / 768 / 1440 widths and light/dark themes without horizontal overflow",
        async () => {
            const widths = [390, 768, 1440];
            const themes = ["light", "dark"] as const;

            await visit("/settings/shortcuts");
            for (const width of widths) {
                for (const theme of themes) {
                    await page.setViewportSize({ width, height: 900 });
                    await page.evaluate((t) => {
                        if (t === "dark") {
                            document.documentElement.setAttribute(
                                "data-theme",
                                "dark",
                            );
                        } else {
                            document.documentElement.removeAttribute(
                                "data-theme",
                            );
                        }
                    }, theme);

                    await page.evaluate(() => {
                        const { promise, resolve } = Promise.withResolvers<
                            void
                        >();
                        requestAnimationFrame(() => resolve());
                        return promise;
                    });

                    const hasOverflow = await page.evaluate(() => {
                        return document.documentElement.scrollWidth >
                            globalThis.innerWidth;
                    });
                    assertEquals(
                        hasOverflow,
                        false,
                        `Horizontal overflow detected at width ${width}px in ${theme} theme`,
                    );

                    const panelOverflow = await page.locator(".settings-panel")
                        .evaluate((el) => {
                            return el.scrollWidth > el.clientWidth + 1;
                        });
                    assertEquals(
                        panelOverflow,
                        false,
                        `Settings panel horizontal overflow detected at width ${width}px in ${theme} theme`,
                    );
                }
            }
        },
    );
});
