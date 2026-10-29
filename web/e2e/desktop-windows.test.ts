import { assert, assertEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

Deno.test("C1 窗口保留局部路由与内容，返回桌面后可恢复，关闭后重建", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    try {
        await loginAndVisit(page, app.origin, "/", user);
        await page.locator('[data-dock-id="settings"]').click();
        await page.locator(
            '[data-window-id="settings"] a[href="/settings/appearance"]',
        ).click();
        await page.waitForURL(app.origin + "/settings/appearance");
        await page.locator('[data-dock-id="trash"]').click();
        await page.waitForURL(app.origin + "/trash");
        const trash = page.locator('[data-window-id="trash"]');
        await trash.getByRole("tab", { name: /笔记/ }).click();
        assert(await page.locator('[data-window-id="settings"]').isVisible());
        await trash.getByRole("button", { name: "最小化回收站" }).click();
        await page.waitForURL(app.origin + "/settings/appearance");
        await trash.waitFor({ state: "hidden" });
        await page.locator('[data-dock-id="trash"]').click();
        await page.waitForURL(app.origin + "/trash");
        assertEquals(
            await trash.getByRole("tab", { name: /笔记/ }).getAttribute(
                "aria-selected",
            ),
            "true",
        );
        await page.locator('[data-dock-id="home"]').click();
        await page.waitForURL(app.origin + "/");
        await page.waitForFunction(() =>
            document.activeElement?.id === "search-query"
        );
        assert(await trash.isHidden());
        assert(await page.locator('[data-window-id="settings"]').isHidden());
        await page.locator('[data-dock-id="trash"]').click();
        await page.waitForURL(app.origin + "/trash");
        assertEquals(
            await trash.getByRole("tab", { name: /笔记/ }).getAttribute(
                "aria-selected",
            ),
            "true",
        );
        await trash.getByRole("button", { name: "关闭回收站" }).click();
        await page.waitForURL(app.origin + "/");
        await page.locator('[data-dock-id="trash"]').click();
        await page.waitForURL(app.origin + "/trash");
        assertEquals(
            await trash.getByRole("tab", { name: /应用/ }).getAttribute(
                "aria-selected",
            ),
            "true",
        );
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("窗口键盘操作可移动、取消，并调整所选边", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    try {
        await loginAndVisit(page, app.origin, "/settings/appearance", user);
        const frame = page.locator('[data-window-id="settings"]');
        await frame.waitFor({ state: "visible" });
        const before = await frame.boundingBox();
        assert(before);
        await frame.getByRole("button", { name: "设置窗口菜单" }).click();
        await page.getByRole("menuitem", { name: "移动窗口" }).click();
        await page.waitForFunction(() =>
            !document.querySelector('[aria-label="设置窗口菜单"]')
                ?.getAttribute("aria-expanded")?.includes("true")
        );
        await page.keyboard.press("ArrowRight");
        await page.waitForFunction(
            (x) =>
                document.querySelector('[data-window-id="settings"]')!
                    .getBoundingClientRect().x > x,
            before.x,
        );
        await page.keyboard.press("Escape");
        await page.waitForFunction(
            (x) =>
                document.querySelector('[data-window-id="settings"]')!
                    .getBoundingClientRect().x === x,
            before.x,
        );
        await frame.getByRole("button", { name: "设置窗口菜单" }).click();
        await page.getByRole("menuitem", { name: "调整左边" }).click();
        await page.waitForFunction(() =>
            !document.querySelector('[aria-label="设置窗口菜单"]')
                ?.getAttribute("aria-expanded")?.includes("true")
        );
        await page.keyboard.press("ArrowRight");
        await page.waitForFunction(
            (width) =>
                document.querySelector('[data-window-id="settings"]')!
                    .getBoundingClientRect().width < width,
            before.width,
        );
        await page.keyboard.press("Enter");
        const resized = await frame.boundingBox();
        assert(resized && resized.x > before.x && resized.width < before.width);
        await frame.getByRole("button", { name: "设置窗口菜单" }).click();
        await page.getByRole("menuitem", { name: "调整左边" }).click();
        const wallpaper = frame.getByRole("textbox", { name: "壁纸来源" });
        await wallpaper.fill("https://example.com/image");
        await wallpaper.press("End");
        await wallpaper.press("ArrowLeft");
        assertEquals(
            await wallpaper.evaluate((element: HTMLInputElement) =>
                element.selectionStart
            ),
            "https://example.com/image".length - 1,
        );
        assertEquals((await frame.boundingBox())?.width, resized.width);
        await frame.getByRole("button", { name: "取消调整" }).click();
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("粗指针可通过窗口菜单拖动调整尺寸并取消或完成", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        hasTouch: true,
    });
    const page = await context.newPage();
    try {
        await loginAndVisit(page, app.origin, "/settings/appearance", user);
        const frame = page.locator('[data-window-id="settings"]');
        await frame.waitFor({ state: "visible" });
        const before = await frame.boundingBox();
        assert(before);
        const cdp = await context.newCDPSession(page);
        const drag = async (
            x: number,
            y: number,
            dx: number,
            cancel = false,
        ) => {
            await cdp.send("Input.dispatchTouchEvent", {
                type: "touchStart",
                touchPoints: [{ x, y, id: 1 }],
            });
            await cdp.send("Input.dispatchTouchEvent", {
                type: "touchMove",
                touchPoints: [{ x: x + dx, y, id: 1 }],
            });
            await page.waitForFunction(
                (width) =>
                    document.querySelector('[data-window-id="settings"]')!
                        .getBoundingClientRect().width < width,
                before.width,
            );
            await cdp.send("Input.dispatchTouchEvent", {
                type: cancel ? "touchCancel" : "touchEnd",
                touchPoints: [],
            });
        };
        const beginResize = async () => {
            await frame.getByRole("button", { name: "设置窗口菜单" }).tap();
            await page.getByRole("menuitem", { name: "调整左边" }).tap();
            await frame.getByText("拖动标题栏调整所选边").waitFor();
        };
        await beginResize();
        for (const name of ["取消调整", "完成调整"]) {
            const size = await frame.getByRole("button", { name })
                .boundingBox();
            assert(size && size.width >= 44 && size.height >= 44);
        }
        await frame.getByRole("button", { name: "取消调整" }).tap();
        await frame.getByText("拖动标题栏调整所选边").waitFor({
            state: "detached",
        });
        await beginResize();
        await drag(before.x + 60, before.y + 22, 48, true);
        await page.waitForFunction(
            ({ x, width }) => {
                const bounds = document.querySelector(
                    '[data-window-id="settings"]',
                )!.getBoundingClientRect();
                return bounds.x === x && bounds.width === width;
            },
            { x: before.x, width: before.width },
        );
        const canceled = await frame.boundingBox();
        assert(
            canceled && canceled.x === before.x &&
                canceled.width === before.width,
        );

        await page.reload();
        await frame.waitFor({ state: "visible" });
        await beginResize();
        await drag(before.x + 60, before.y + 22, 48);
        await frame.getByText("拖动标题栏调整所选边").waitFor({
            state: "detached",
        });
        const completed = await frame.boundingBox();
        assert(
            completed && completed.x > before.x &&
                completed.width < before.width,
        );
        const swatches = frame.getByRole("radiogroup", { name: "强调色" })
            .getByRole("radio");
        const rows = await swatches.evaluateAll((items) => {
            const counts = new Map<number, number>();
            for (const item of items) {
                const top = Math.round(item.getBoundingClientRect().top);
                counts.set(top, (counts.get(top) ?? 0) + 1);
            }
            return [...counts.values()];
        });
        assertEquals(rows, [5, 5]);
        await swatches.nth(4).focus();
        await page.keyboard.press("ArrowRight");
        assertEquals(
            await swatches.nth(5).evaluate((element) =>
                document.activeElement === element
            ),
            true,
        );
    } finally {
        await context.close();
        await browser.close();
        await app.close();
    }
});

Deno.test("恢复窗口时上次焦点不可见则回到标题栏", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    try {
        await loginAndVisit(page, app.origin, "/settings/appearance", user);
        const settings = page.locator('[data-window-id="settings"]');
        await settings.locator('a[href="/settings/appearance"]').focus();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() =>
            document.querySelector(".settings-layout")?.getAttribute(
                "data-host-narrow",
            ) === "true"
        );
        await page.locator('[data-dock-id="home"]').click();
        await page.waitForURL(app.origin + "/");
        await page.locator('[data-dock-id="settings"]').click();
        await page.waitForURL(app.origin + "/settings/appearance");
        await page.waitForFunction(() =>
            document.activeElement ===
                document.querySelector(
                    '[data-window-id="settings"] .window-frame__titlebar',
                )
        );
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("访客设置保持独立页面并可从首页进入及返回", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
    });
    try {
        await page.goto(app.origin + "/");
        await page.getByRole("link", { name: "设置", exact: true }).click();
        await page.waitForURL(app.origin + "/settings");
        await page.locator(".settings-layout").waitFor({ state: "visible" });
        assertEquals(
            await page.locator('nav[aria-label="工作区任务栏"]').count(),
            0,
        );
        assertEquals(await page.locator("[data-window-id]").count(), 0);
        await page.getByRole("link", { name: "Searcher 首页" }).click();
        await page.waitForURL(app.origin + "/");
        await page.locator("main.home").waitFor({ state: "visible" });
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("回收站恢复后桌面与原撤销提示同步", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    try {
        await loginAndVisit(page, app.origin, "/", user);
        await page.evaluate(async () => {
            const response = await fetch("/api/webapps", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "窗口同步应用",
                    url: "https://example.invalid",
                    iconSource: "default",
                    openMode: "global",
                    isHomeFixed: true,
                }),
            });
            if (!response.ok) throw new Error(await response.text());
        });
        await page.reload();
        const tile = page.locator(".launcher-tile").filter({
            hasText: "窗口同步应用",
        });
        await tile.click({ button: "right" });
        await page.getByRole("menuitem", { name: "移至回收站", exact: true })
            .click();
        const undo = page.locator(".undo-toast").filter({
            hasText: "窗口同步应用",
        });
        await undo.waitFor({ state: "visible" });
        await page.locator('[data-dock-id="trash"]').click();
        const trash = page.locator('[data-window-id="trash"]');
        const row = trash.locator("tr").filter({ hasText: "窗口同步应用" });
        await row.getByRole("button", { name: "恢复", exact: true }).click();
        await row.waitFor({ state: "hidden" });
        await page.locator('[data-dock-id="home"]').click();
        await tile.waitFor({ state: "visible" });
        await undo.waitFor({ state: "hidden" });
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("首击关闭或最小化后台窗口不改变活动窗口与历史", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    try {
        await loginAndVisit(page, app.origin, "/settings", user);
        const settings = page.locator('[data-window-id="settings"]');
        await settings.getByRole("button", { name: "设置窗口菜单" }).click();
        await page.getByRole("menuitem", { name: "移动窗口" }).click();
        await page.waitForFunction(() =>
            document.querySelector('[aria-label="设置窗口菜单"]')?.getAttribute(
                "aria-expanded",
            ) === "false"
        );
        for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Enter");
        await page.waitForFunction(() =>
            document.querySelector('[data-window-id="settings"]')!
                .getBoundingClientRect().x >= 440
        );
        await page.locator('[data-dock-id="trash"]').click();
        await page.waitForURL(app.origin + "/trash");
        const trash = page.locator('[data-window-id="trash"]');
        await trash.waitFor({ state: "visible" });
        const focused = trash.getByRole("tab", { name: /笔记/ });
        await focused.focus();
        let historyLength = await page.evaluate(() => history.length);
        await settings.locator('button[aria-label="关闭设置"]').click();
        await settings.waitFor({ state: "hidden" });
        assertEquals(new URL(page.url()).pathname, "/trash");
        assertEquals(await page.evaluate(() => history.length), historyLength);
        assertEquals(
            await focused.evaluate((node) => document.activeElement === node),
            true,
        );
        assertEquals(await settings.locator(".settings-layout").count(), 0);

        await page.locator('[data-dock-id="settings"]').click();
        await page.waitForURL(app.origin + "/settings");
        await page.locator('[data-dock-id="trash"]').click();
        await page.waitForURL(app.origin + "/trash");
        historyLength = await page.evaluate(() => history.length);
        await settings.locator('button[aria-label="最小化设置"]').click();
        await settings.waitFor({ state: "hidden" });
        assertEquals(new URL(page.url()).pathname, "/trash");
        assertEquals(await page.evaluate(() => history.length), historyLength);
        assertEquals(await settings.locator(".settings-layout").count(), 1);
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("AI 覆盖页在明暗极端壁纸上保持文字可读", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
    });
    try {
        await loginAndVisit(page, app.origin, "/", user);
        for (
            const [theme, color] of [["dark", "white"], [
                "light",
                "black",
            ]] as const
        ) {
            const response = await page.request.patch(
                app.origin + "/api/preferences",
                {
                    headers: { Origin: app.origin },
                    data: {
                        theme,
                        backgroundImage: `linear-gradient(${color}, ${color})`,
                    },
                },
            );
            assertEquals(response.status(), 200);
            await page.goto(app.origin + "/ask");
            const heading = page.locator(".ask-empty-hero__title");
            await heading.waitFor({ state: "visible" });
            await page.waitForFunction(
                ({ theme, color }) => {
                    const wallpaper = document.querySelector<HTMLElement>(
                        ".wallpaper-surface__image",
                    );
                    const value = color === "white"
                        ? "255, 255, 255"
                        : "0, 0, 0";
                    return document.documentElement.dataset.theme === theme &&
                        Boolean(
                            wallpaper &&
                                getComputedStyle(wallpaper).backgroundImage
                                    .includes(value),
                        );
                },
                { theme, color },
            );
            await page.evaluate(() =>
                Promise.allSettled(
                    document.getAnimations().filter((animation) =>
                        Number.isFinite(
                            animation.effect?.getComputedTiming().endTime,
                        )
                    ).map((animation) => animation.finished),
                )
            );
            const box = await heading.boundingBox();
            assert(box);
            const foreground = await heading.evaluate((node) =>
                getComputedStyle(node).color
            );
            const pixels = await page.screenshot({
                clip: {
                    x: Math.round(box.x + box.width / 2),
                    y: Math.max(0, Math.round(box.y - 8)),
                    width: 1,
                    height: 1,
                },
            });
            const encoded = btoa(String.fromCharCode(...pixels));
            const ratio = await page.evaluate(
                async ({ encoded, foreground }) => {
                    const image = new Image();
                    image.src = `data:image/png;base64,${encoded}`;
                    await image.decode();
                    const canvas = document.createElement("canvas");
                    canvas.width = canvas.height = 1;
                    const context = canvas.getContext("2d")!;
                    context.drawImage(image, 0, 0);
                    const background = [
                        ...context.getImageData(0, 0, 1, 1).data,
                    ].slice(0, 3);
                    const text = foreground.match(/\d+/g)!.slice(0, 3).map(
                        Number,
                    );
                    const luminance = (channels: number[]) =>
                        channels.map((value) => {
                            const srgb = value / 255;
                            return srgb <= 0.04045
                                ? srgb / 12.92
                                : ((srgb + 0.055) / 1.055) ** 2.4;
                        }).reduce(
                            (sum, value, index) =>
                                sum + value * [0.2126, 0.7152, 0.0722][index],
                            0,
                        );
                    const a = luminance(text);
                    const b = luminance(background);
                    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
                },
                { encoded, foreground },
            );
            assert(ratio >= 4.5, `${theme} on ${color}: ${ratio.toFixed(2)}:1`);
        }
    } finally {
        await browser.close();
        await app.close();
    }
});
