import { assert, assertEquals, assertNotEquals } from "@std/assert";
import type { Page } from "playwright";
import { ACCENT_PREFERENCES } from "@shared/contracts.ts";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

// #383: the two high contrast themes are app palettes chosen from every theme
// entry. They map every accent to one highlight, render glass solid, keep the
// saved accent / glass / wallpaper, ignore the system scheme, and yield to
// the system's forced colours.

const HIGHLIGHT = {
    light: "rgb(55, 0, 110)",
    dark: "rgb(26, 235, 255)",
} as const;

function root(page: Page) {
    return page.evaluate(() => {
        const element = document.documentElement;
        const probe = document.createElement("div");
        probe.style.color = "var(--accent)";
        document.body.append(probe);
        const accent = getComputedStyle(probe).color;
        probe.remove();
        return {
            theme: element.dataset.theme,
            contrast: element.dataset.contrast ?? null,
            glass: element.dataset.glass,
            accent,
            canvas: getComputedStyle(document.body).backgroundColor,
            themeColor: (() => {
                probe.style.color = document.querySelector<HTMLMetaElement>(
                    'meta[name="theme-color"]',
                )?.content ?? "";
                document.body.append(probe);
                const color = getComputedStyle(probe).color;
                probe.remove();
                return color;
            })(),
            colorScheme: getComputedStyle(element).colorScheme,
        };
    });
}

function background(page: Page, selector: string) {
    return page.locator(selector).first().evaluate((element) =>
        getComputedStyle(element).backgroundColor
    );
}

async function waitForTheme(page: Page, scheme: string, contrast: boolean) {
    await page.waitForFunction(
        ({ scheme, contrast }) =>
            document.documentElement.dataset.theme === scheme &&
            (document.documentElement.dataset.contrast === "more") ===
                contrast,
        { scheme, contrast },
    );
}

async function savedPreferences(page: Page) {
    return await page.evaluate(async () =>
        (await (await fetch("/api/preferences")).json()).data
    );
}

Deno.test("高对比主题：设置、顶栏与快捷指令入口，高亮映射与偏好保留 #383", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
        const context = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            colorScheme: "light",
            serviceWorkers: "block",
        });
        const page = await context.newPage();
        await loginAndVisit(page, app.origin, "/settings/appearance", user);
        const settings = '[data-window-id="settings"]';
        await page.locator(`${settings} .theme-choices`).waitFor();
        await page.getByRole("radio", { name: "电光紫", exact: true }).check();
        await page.getByRole("radio", { name: "通透", exact: true }).check();
        await page.waitForFunction(() =>
            document.documentElement.dataset.glass === "clear"
        );
        const before = await root(page);

        // Settings entry: the five themes in one group, high contrast light.
        const themes = await page.locator(`${settings} .theme-choices`)
            .getByRole("radio").allTextContents();
        assertEquals(themes, [
            "跟随系统",
            "浅色",
            "深色",
            "高对比浅色",
            "高对比深色",
        ]);
        await page.getByRole("radio", { name: "高对比浅色", exact: true })
            .check();
        await waitForTheme(page, "light", true);
        const light = await root(page);
        assertEquals(light.accent, HIGHLIGHT.light);
        assertEquals(light.canvas, "rgb(255, 255, 255)");
        assertEquals(light.themeColor, "rgb(255, 255, 255)");
        assertEquals(light.glass, "clear", "the saved glass tier is kept");
        await page.getByText("高对比主题下以主题高亮色呈现").waitFor();
        await page.getByText("高对比主题下玻璃效果以实色显示").waitFor();

        // Swatches keep their palette; selections take the highlight fill.
        const violet = await page.locator(
            `${settings} .accent-swatch-color[data-accent="violet"]`,
        ).evaluate((dot) => getComputedStyle(dot).backgroundColor);
        assertEquals(violet, "rgb(109, 40, 217)");
        assertEquals(
            await background(
                page,
                '.accent-picker-chip-dot[data-tone="accent"]',
            ),
            "rgb(109, 40, 217)",
        );
        assertEquals(
            await background(
                page,
                `${settings} [data-variant="segmented"] .radio-item[data-checked]`,
            ),
            HIGHLIGHT.light,
        );
        await page.waitForFunction(
            ({ selector, color }) =>
                getComputedStyle(document.querySelector(selector)!)
                    .backgroundColor === color,
            {
                selector: `${settings} .settings-nav-item[aria-current="page"]`,
                color: HIGHLIGHT.light,
            },
        );
        assertEquals(
            await background(
                page,
                `${settings} .settings-nav-item[aria-current="page"]`,
            ),
            HIGHLIGHT.light,
        );

        // Every accent preference maps to the one highlight.
        const mapped = await page.evaluate(
            (accents) =>
                accents.map((accent) => {
                    document.documentElement.dataset.accent = accent;
                    const probe = document.createElement("div");
                    probe.style.color = "var(--accent)";
                    document.body.append(probe);
                    const color = getComputedStyle(probe).color;
                    probe.remove();
                    return color;
                }),
            [...ACCENT_PREFERENCES],
        );
        assertEquals(new Set(mapped), new Set([HIGHLIGHT.light]));
        await page.evaluate(() =>
            document.documentElement.dataset.accent = "violet"
        );

        // A system scheme change only moves 跟随系统.
        await page.emulateMedia({ colorScheme: "dark" });
        await waitForTheme(page, "light", true);

        // Forced colours keep priority over the app highlight.
        await page.emulateMedia({ forcedColors: "active" });
        assertNotEquals(
            await background(
                page,
                `${settings} [data-variant="segmented"] .radio-item[data-checked]`,
            ),
            HIGHLIGHT.light,
        );
        await page.emulateMedia({ forcedColors: "none", colorScheme: "light" });

        // Saved preferences: the theme changes, accent and glass do not.
        const saved = await savedPreferences(page);
        assertEquals(
            [saved.theme, saved.accent, saved.glassIntensity],
            ["high-contrast-light", "violet", "clear"],
        );

        // Top bar: the cycle continues into high contrast dark, then wraps.
        await page.goto(app.origin + "/");
        await waitForTheme(page, "light", true);
        const toggle = page.getByRole("button", { name: /^切换主题，/ });
        assertEquals(
            await toggle.getAttribute("aria-label"),
            "切换主题，当前：高对比浅色，下一个：高对比深色",
        );
        await toggle.click();
        await waitForTheme(page, "dark", true);
        const dark = await root(page);
        assertEquals(dark.accent, HIGHLIGHT.dark);
        assertEquals(dark.canvas, "rgb(0, 0, 0)");
        assertEquals(dark.themeColor, "rgb(0, 0, 0)");
        assertEquals(dark.colorScheme, "dark");
        // Material renders solid with a frame.
        await page.locator(".search-frame").evaluate(async (element) => {
            await Promise.allSettled(
                element.getAnimations().map((animation) => animation.finished),
            );
        });
        const frame = await page.locator(".search-frame").evaluate(
            (element) => {
                const style = getComputedStyle(element);
                return {
                    background: style.backgroundColor,
                    backdrop: style.backdropFilter,
                    shadow: style.boxShadow,
                };
            },
        );
        assertEquals(frame.background, "color(srgb 0 0 0)");
        assert(frame.backdrop === "none", frame.backdrop);
        assert(frame.shadow.includes("rgb(255, 255, 255)"), frame.shadow);
        assertEquals(
            await toggle.getAttribute("aria-label"),
            "切换主题，当前：高对比深色，下一个：跟随系统",
        );
        await toggle.click();
        await waitForTheme(page, "light", false);

        // Quick commands switch straight to either high contrast theme.
        const search = page.locator("#search-query");
        for (
            const [command, scheme] of [
                ["/hc-dark", "dark"],
                ["/hc-light", "light"],
            ] as const
        ) {
            await search.fill(command);
            await page.getByRole("option", { name: new RegExp(command) })
                .waitFor();
            await search.press("ArrowDown");
            await search.press("Enter");
            await waitForTheme(page, scheme, true);
        }

        // Leaving high contrast restores the saved look.
        await search.fill("/light");
        await page.getByRole("option", { name: /\/light/ }).waitFor();
        await search.press("ArrowDown");
        await search.press("Enter");
        await waitForTheme(page, "light", false);
        const restored = await root(page);
        assertEquals(restored.accent, before.accent);
        assertEquals(restored.canvas, before.canvas);
        assertEquals(restored.glass, "clear");
        await context.close();
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("高对比主题：访客偏好只存于本设备，与账号缓存隔离 #383", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
        const context = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            serviceWorkers: "block",
        });
        const page = await context.newPage();
        await page.goto(app.origin + "/settings/appearance");
        await page.getByRole("radio", { name: "高对比深色", exact: true })
            .check();
        await waitForTheme(page, "dark", true);
        await page.reload();
        await waitForTheme(page, "dark", true);

        await loginAndVisit(page, app.origin, "/", user);
        await waitForTheme(page, "light", false);
        assertEquals((await savedPreferences(page)).theme, "system");

        await page.getByRole("button", { name: /^用户菜单/ }).click();
        await page.getByRole("menuitem", { name: "退出登录" }).click();
        await waitForTheme(page, "dark", true);
        await context.close();
    } finally {
        await browser.close();
        await app.close();
    }
});
