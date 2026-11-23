import { assert, assertEquals } from "@std/assert";
import type { Locator, Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { highlightMenuItem } from "./helpers/menu.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { hitSize } from "./helpers/touch-target.ts";

type Box = { x: number; y: number; width: number; height: number };

/** The free-window work area: viewport minus `--window-margin` and the Dock. */
function workArea(page: Page): Promise<Box & { margin: number }> {
    return page.evaluate(() => {
        const margin = parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
                "--window-margin",
            ),
        );
        let left = margin, right = innerWidth - margin;
        let top = margin, bottom = innerHeight - margin;
        const dock = document.querySelector<HTMLElement>(
            ".dock-container:not([inert])",
        )!;
        const rect = dock.getBoundingClientRect();
        const edge = dock.dataset.edge;
        if (edge === "left") left = rect.right + margin;
        if (edge === "right") right = rect.left - margin;
        if (edge === "top") top = rect.bottom + margin;
        if (edge === "bottom") bottom = rect.top - margin;
        return {
            margin,
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
        };
    });
}

async function waitForFrame(page: Page, id: string, expected: Box) {
    try {
        await page.waitForFunction(([id, expected]) => {
            const rect = document.querySelector(`[data-window-id="${id}"]`)
                ?.getBoundingClientRect();
            return rect && rect.width > 0 &&
                (["x", "y", "width", "height"] as const).every((key) =>
                    Math.abs(rect[key] - expected[key]) < 0.5
                );
        }, [id, expected] as const);
    } catch (error) {
        const actual = await page.locator(`[data-window-id="${id}"]`)
            .boundingBox();
        throw new Error(
            `${id} frame ${JSON.stringify(actual)} ≠ ${
                JSON.stringify(expected)
            }`,
            { cause: error },
        );
    }
}

async function choosePreset(page: Page, frame: Locator, name: string) {
    await frame.getByRole("button", { name: "设置窗口菜单" }).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
}

Deno.test("desktop windows contracts", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    await t.step(
        "C1 窗口保留局部路由与内容，返回桌面后可恢复，关闭后重建",
        async () => {
            const user = await app.seedAskFixtureUser({
                username: "dw_step_1",
            });
            const context = await browser.newContext({
                viewport: { width: 1440, height: 900 },
            });
            const page = await context.newPage();
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
                assert(
                    await page.locator('[data-window-id="settings"]')
                        .isVisible(),
                );
                await trash.getByRole("button", { name: "最小化回收站" })
                    .click();
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
                const homeDock = page.locator('[data-dock-id="home"]');
                await homeDock.click();
                await page.waitForURL(app.origin + "/");
                await page.waitForFunction(() =>
                    document.activeElement?.id !== "search-query"
                );
                assertEquals(
                    await homeDock.evaluate((node) =>
                        document.activeElement === node
                    ),
                    true,
                );
                // Keyboard navigation from the dock does not jump to search query.
                await page.keyboard.press("Tab");
                assertEquals(
                    await page.evaluate(() =>
                        document.activeElement?.id === "search-query"
                    ),
                    false,
                );
                await page.keyboard.press("Shift+Tab");
                assertEquals(
                    await homeDock.evaluate((node) =>
                        document.activeElement === node
                    ),
                    true,
                );
                await trash.waitFor({ state: "hidden" });
                await page.locator('[data-window-id="settings"]').waitFor({
                    state: "hidden",
                });
                // Re-open trash and verify returning to desktop via keyboard activation
                await page.locator('[data-dock-id="trash"]').click();
                await page.waitForURL(app.origin + "/trash");
                await page.waitForFunction(() =>
                    document.querySelector('[data-window-id="trash"]')
                        ?.contains(
                            document.activeElement,
                        )
                );
                await homeDock.focus();
                await page.keyboard.press("Enter");
                await page.waitForURL(app.origin + "/");
                await page.waitForFunction(() =>
                    document.activeElement?.id !== "search-query"
                );
                assertEquals(
                    await homeDock.evaluate((node) =>
                        document.activeElement === node
                    ),
                    true,
                );
                await trash.waitFor({ state: "hidden" });
                await page.locator('[data-window-id="settings"]').waitFor({
                    state: "hidden",
                });
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
                await context.close();
            }
        },
    );

    await t.step(
        "应用窗口的打开控件隐藏后，关闭窗口聚焦首页标志而非搜索框",
        async () => {
            const user = await app.seedAskFixtureUser({
                username: "dw_step_2",
            });
            const context = await browser.newContext({
                viewport: { width: 1440, height: 900 },
            });
            const page = await context.newPage();
            try {
                await loginAndVisit(page, app.origin, "/", user);
                const opener = page.locator('[data-dock-id="apps"]');
                await opener.click();
                const frame = page.locator('[data-window-id="apps"]');
                await frame.waitFor({ state: "visible" });
                await opener.evaluate((element) => {
                    (element as HTMLElement).style.display = "none";
                });
                await frame.getByRole("button", { name: "关闭应用" }).click();
                await page.waitForURL(app.origin + "/");
                await page.waitForFunction(() =>
                    document.activeElement ===
                        document.querySelector(".wordmark-small")
                );
            } finally {
                await context.close();
            }
        },
    );

    await t.step(
        "设置窗口首次切到账户与安全不经过加载占位，顶栏不随窗口变化",
        async () => {
            const user = await app.seedAskFixtureUser({
                username: "dw_step_3",
            });
            const context = await browser.newContext({
                viewport: { width: 1440, height: 900 },
            });
            const page = await context.newPage();
            const topActions = () =>
                page.locator(".top-actions > a, .top-actions > button")
                    .evaluateAll(
                        (elements) =>
                            elements.map((el) => el.getAttribute("aria-label")),
                    );
            try {
                await loginAndVisit(page, app.origin, "/", user);
                const home = await topActions();
                for (const id of ["apps", "notes", "ai", "trash", "settings"]) {
                    await page.locator(`[data-dock-id="${id}"]`).click();
                    await page.locator(`[data-window-id="${id}"]`).waitFor();
                    assertEquals(await topActions(), home, `${id} window`);
                }

                const settings = page.locator('[data-window-id="settings"]');
                await settings.locator('a[href="/settings/appearance"]')
                    .click();
                await page.waitForURL(app.origin + "/settings/appearance");
                // Record every frame state the first switch passes through.
                await page.evaluate(() => {
                    const seen: string[] = [];
                    Object.assign(globalThis, { __settingsSeen: seen });
                    const window = document.querySelector(
                        '[data-window-id="settings"]',
                    )!;
                    new MutationObserver(() => {
                        if (
                            window.querySelector(
                                '[data-testid="route-loading-fallback"]',
                            )
                        ) seen.push("fallback");
                        if (window.textContent?.includes("暂无活跃设备记录")) {
                            seen.push("empty devices");
                        }
                    }).observe(window, {
                        childList: true,
                        subtree: true,
                        characterData: true,
                    });
                });
                await settings.getByRole("link", {
                    name: "账户与安全",
                    exact: true,
                })
                    .click();
                await settings.locator(".account-device-list").waitFor();
                assertEquals(
                    await page.evaluate(() =>
                        (globalThis as unknown as { __settingsSeen: string[] })
                            .__settingsSeen
                    ),
                    [],
                );
            } finally {
                await context.close();
            }
        },
    );

    await t.step("窗口键盘操作可移动、取消，并调整所选边", async () => {
        const user = await app.seedAskFixtureUser({ username: "dw_step_4" });
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
        });
        const page = await context.newPage();
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
            assert(
                resized && resized.x > before.x && resized.width < before.width,
            );
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
            await context.close();
        }
    });

    await t.step("粗指针可通过窗口菜单拖动调整尺寸并取消或完成", async () => {
        const user = await app.seedAskFixtureUser({ username: "dw_step_5" });
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
                const size = await hitSize(frame.getByRole("button", { name }));
                assert(
                    size.width >= 44 && size.height >= 44,
                    JSON.stringify(size),
                );
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
            await drag(before.x + 60, before.y + 22, 60);
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
        }
    });

    await t.step(
        "窗口位置预设：居中、左右半屏与默认大小避开四边任务栏并成为记忆位置",
        async () => {
            const user = await app.seedAskFixtureUser({
                username: "dw_step_6",
            });
            const context = await browser.newContext({
                viewport: { width: 1440, height: 900 },
            });
            const page = await context.newPage();
            const frame = page.locator('[data-window-id="settings"]');
            const halves = async (label: string) => {
                const area = await workArea(page);
                const width = Math.floor((area.width - area.margin) / 2);
                await choosePreset(page, frame, "左半屏");
                await waitForFrame(page, "settings", { ...area, width });
                await choosePreset(page, frame, "右半屏");
                const right = {
                    ...area,
                    x: area.x + area.width - width,
                    width,
                };
                await waitForFrame(page, "settings", right);
                assertEquals(right.x - (area.x + width), area.margin, label);
                return right;
            };
            try {
                await loginAndVisit(
                    page,
                    app.origin,
                    "/settings/appearance",
                    user,
                );
                await frame.waitFor({ state: "visible" });

                for (
                    const [width, height] of [[1440, 900], [1024, 768]] as const
                ) {
                    await page.setViewportSize({ width, height });
                    const label = `${width}x${height}`;
                    const right = await halves(label);

                    // Centering keeps the current size.
                    const area = await workArea(page);
                    await choosePreset(page, frame, "居中");
                    await waitForFrame(page, "settings", {
                        x: area.x + (area.width - right.width) / 2,
                        y: area.y + (area.height - right.height) / 2,
                        width: right.width,
                        height: right.height,
                    });

                    // Default size grows around the current center, inside the area.
                    await choosePreset(page, frame, "恢复默认大小");
                    const size = {
                        width: 840,
                        height: Math.min(680, area.height),
                    };
                    await waitForFrame(page, "settings", {
                        x: area.x + (area.width - size.width) / 2,
                        y: area.y + (area.height - size.height) / 2,
                        ...size,
                    });
                }

                // A preset leaves maximized state and becomes the remembered place.
                await page.setViewportSize({ width: 1440, height: 900 });
                await frame.getByRole("button", { name: "最大化设置" }).click();
                await waitForFrame(page, "settings", await workArea(page));
                const right = await halves("from maximized");
                await frame.getByRole("button", { name: "还原设置" }).waitFor({
                    state: "detached",
                });
                await frame.getByRole("button", { name: "最小化设置" }).click();
                await frame.waitFor({ state: "hidden" });
                await page.locator('[data-dock-id="settings"]').click();
                await waitForFrame(page, "settings", right);
                await frame.getByRole("button", { name: "关闭设置" }).click();
                await frame.waitFor({ state: "hidden" });
                await page.locator('[data-dock-id="settings"]').click();
                await waitForFrame(page, "settings", right);

                // Keyboard: open the menu, move to an item and choose it.
                const trigger = frame.getByRole("button", {
                    name: "设置窗口菜单",
                });
                await trigger.focus();
                await page.keyboard.press("Enter");
                await highlightMenuItem(page, "左半屏");
                await page.keyboard.press("Enter");
                const area = await workArea(page);
                await waitForFrame(page, "settings", {
                    ...area,
                    width: Math.floor((area.width - area.margin) / 2),
                });
                await page.waitForFunction(() =>
                    document.activeElement?.getAttribute("aria-label") ===
                        "设置窗口菜单"
                );
                await page.locator(".window-frame__status").filter({
                    hasText: "窗口已移到左半屏",
                }).waitFor({ state: "attached" });

                // Every Dock edge is kept clear.
                for (
                    const [edge, name] of [
                        ["left", "左侧"],
                        ["top", "顶部"],
                        ["right", "右侧"],
                        ["bottom", "底部"],
                    ] as const
                ) {
                    await page.getByRole("button", { name: "任务栏选项" })
                        .click();
                    await page.getByRole("menuitem", { name: "管理任务栏" })
                        .click();
                    const modal = page.locator(
                        '[data-dock-modal="management"]',
                    );
                    await modal.getByRole("radio", { name, exact: true })
                        .click();
                    await modal.getByRole("button", { name: "关闭" }).click();
                    await modal.waitFor({ state: "hidden" });
                    await page.locator(`.dock-container[data-edge="${edge}"]`)
                        .waitFor();
                    await halves(edge);
                }
            } finally {
                await context.close();
            }
        },
    );

    await t.step("恢复窗口时上次焦点不可见则回到标题栏", async () => {
        const user = await app.seedAskFixtureUser({ username: "dw_step_7" });
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
        });
        const page = await context.newPage();
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
            await context.close();
        }
    });

    await t.step("访客设置保持独立页面并可从首页进入及返回", async () => {
        const context = await browser.newContext({
            viewport: { width: 390, height: 844 },
        });
        const page = await context.newPage();
        try {
            await page.goto(app.origin + "/");
            await page.getByRole("link", { name: "设置", exact: true }).click();
            await page.waitForURL(app.origin + "/settings");
            await page.locator(".settings-layout").waitFor({
                state: "visible",
            });
            assertEquals(
                await page.locator('nav[aria-label="工作区任务栏"]').count(),
                0,
            );
            assertEquals(await page.locator("[data-window-id]").count(), 0);
            await page.getByRole("link", { name: "Searcher 首页" }).click();
            await page.waitForURL(app.origin + "/");
            await page.locator("main.home").waitFor({ state: "visible" });
        } finally {
            await context.close();
        }
    });

    await t.step("回收站恢复后桌面与原撤销提示同步", async () => {
        const user = await app.seedAskFixtureUser({ username: "dw_step_9" });
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
        });
        const page = await context.newPage();
        try {
            await loginAndVisit(page, app.origin, "/", user);
            await page.evaluate(async () => {
                const prefs = await fetch("/api/preferences", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ showHomeApps: true }),
                });
                if (!prefs.ok) throw new Error(await prefs.text());
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
            await page.getByRole("menuitem", {
                name: "移至回收站",
                exact: true,
            })
                .click();
            const undo = page.locator(".undo-toast").filter({
                hasText: "窗口同步应用",
            });
            await undo.waitFor({ state: "visible" });
            await page.locator('[data-dock-id="trash"]').click();
            const trash = page.locator('[data-window-id="trash"]');
            const row = trash.locator("tr").filter({ hasText: "窗口同步应用" });
            await row.getByRole("button", { name: "恢复", exact: true })
                .click();
            await row.waitFor({ state: "hidden" });
            await page.locator('[data-dock-id="home"]').click();
            await tile.waitFor({ state: "visible" });
            await undo.waitFor({ state: "hidden" });
        } finally {
            await context.close();
        }
    });

    await t.step("首击关闭或最小化后台窗口不改变活动窗口与历史", async () => {
        const user = await app.seedAskFixtureUser({ username: "dw_step_10" });
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
        });
        const page = await context.newPage();
        try {
            await loginAndVisit(page, app.origin, "/settings", user);
            const settings = page.locator('[data-window-id="settings"]');
            await settings.getByRole("button", { name: "设置窗口菜单" })
                .click();
            await page.getByRole("menuitem", { name: "移动窗口" }).click();
            await page.waitForFunction(() =>
                document.querySelector('[aria-label="设置窗口菜单"]')
                    ?.getAttribute(
                        "aria-expanded",
                    ) === "false"
            );
            for (let i = 0; i < 10; i++) {
                await page.keyboard.press("ArrowRight");
            }
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
            assertEquals(
                await page.evaluate(() => history.length),
                historyLength,
            );
            assertEquals(
                await focused.evaluate((node) =>
                    document.activeElement === node
                ),
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
            assertEquals(
                await page.evaluate(() => history.length),
                historyLength,
            );
            assertEquals(await settings.locator(".settings-layout").count(), 1);
        } finally {
            await context.close();
        }
    });

    // WCAG 2.4.11: behind an active window the desktop is a background layer,
    // so Tab never lands on desktop controls the window may cover entirely.
    await t.step(
        "活动窗口下方的桌面不进入 Tab 顺序，焦点不被窗口完全遮挡 #370",
        async () => {
            const user = await app.seedAskFixtureUser({
                username: "dw_step_11",
            });
            const context = await browser.newContext({
                viewport: { width: 1440, height: 900 },
            });
            const page = await context.newPage();
            /** Presses `key` up to `limit` times, describing each focus stop. */
            const traverse = async (key: string, limit: number) => {
                const stops: {
                    label: string;
                    desktop: boolean;
                    seen: boolean;
                }[] = [];
                for (let i = 0; i < limit; i++) {
                    await page.keyboard.press(key);
                    stops.push(
                        await page.evaluate(() => {
                            const active = document
                                .activeElement as HTMLElement;
                            const box = active.getBoundingClientRect();
                            // A 5×5 grid inside the box: any hit on the element
                            // itself means it is not entirely hidden.
                            let seen = false;
                            for (let x = 1; x <= 5 && !seen; x++) {
                                for (let y = 1; y <= 5 && !seen; y++) {
                                    const hit = document.elementFromPoint(
                                        box.left + box.width * x / 6,
                                        box.top + box.height * y / 6,
                                    );
                                    seen = Boolean(hit && active.contains(hit));
                                }
                            }
                            return {
                                label: active.getAttribute("aria-label") ??
                                    active.id ?? active.tagName,
                                desktop: Boolean(active.closest("main.home")),
                                seen: seen || active === document.body,
                            };
                        }),
                    );
                }
                return stops;
            };
            try {
                await loginAndVisit(page, app.origin, "/", user);
                // Start anywhere in the focus order and traverse far enough to reach
                // the desktop after the header and taskbar controls.
                const home = await traverse("Tab", 24);
                assert(home.some((stop) => stop.desktop), JSON.stringify(home));

                await page.locator('[data-dock-id="settings"]').click();
                const settings = page.locator('[data-window-id="settings"]');
                await settings.locator(".settings-row").first().waitFor();
                for (const key of ["Tab", "Shift+Tab"]) {
                    const stops = await traverse(key, 60);
                    const detail = `${key}: ${JSON.stringify(stops)}`;
                    assertEquals(
                        stops.filter((stop) => stop.desktop),
                        [],
                        detail,
                    );
                    assertEquals(
                        stops.filter((stop) => !stop.seen),
                        [],
                        detail,
                    );
                    // The cycle still runs through the window and the Dock.
                    assert(
                        stops.some((stop) => stop.label === "关闭设置"),
                        detail,
                    );
                }
            } finally {
                await context.close();
            }
        },
    );

    await t.step(
        "标题栏焦点环：直达 URL 与鼠标打开不显示，键盘打开显示",
        async () => {
            const user = await app.seedAskFixtureUser({
                username: "dw_step_12",
            });
            const context = await browser.newContext({
                viewport: { width: 1440, height: 900 },
            });
            const page = await context.newPage();
            try {
                await loginAndVisit(page, app.origin, "/", user);
                const icon = page.locator('[data-dock-id="apps"]');
                const titlebar = page.locator(
                    '[data-window-id="apps"] .window-frame__titlebar',
                );
                const ring = () =>
                    titlebar.evaluate((node) => ({
                        focused: document.activeElement === node,
                        focusVisible: node.matches(":focus-visible"),
                        outline: getComputedStyle(node).outlineStyle,
                    }));
                const settled = () =>
                    page.waitForFunction(() =>
                        document.activeElement?.classList.contains(
                            "window-frame__titlebar",
                        )
                    );

                // A pointer click on the Dock icon moves focus into the title bar
                // without drawing a keyboard ring.
                await icon.hover();
                const iconBox = await icon.boundingBox();
                assert(iconBox);
                await page.mouse.click(
                    iconBox.x + iconBox.width / 2,
                    iconBox.y + iconBox.height / 2,
                );
                await settled();
                const byMouse = await ring();
                assertEquals(byMouse.focused, true);
                assertEquals(
                    byMouse.focusVisible,
                    false,
                    JSON.stringify(byMouse),
                );
                assertEquals(byMouse.outline, "none", JSON.stringify(byMouse));

                // Minimize, then open the same window from the keyboard.
                await page.mouse.click(
                    iconBox.x + iconBox.width / 2,
                    iconBox.y + iconBox.height / 2,
                );
                await titlebar.waitFor({ state: "hidden" });
                await icon.focus();
                await page.keyboard.press("Tab");
                await page.keyboard.press("Shift+Tab");
                await page.keyboard.press("Enter");
                await titlebar.waitFor({ state: "visible" });
                await settled();
                const byKeyboard = await ring();
                assertEquals(byKeyboard.focused, true);
                assertEquals(
                    byKeyboard.focusVisible,
                    true,
                    JSON.stringify(byKeyboard),
                );
                assert(
                    byKeyboard.outline !== "none",
                    JSON.stringify(byKeyboard),
                );

                // A page load restores the window from its URL: focus still lands in
                // the title bar, but no input led there, so no ring until a key press.
                await page.goto(app.origin + "/settings/appearance");
                const settingsBar = page.locator(
                    '[data-window-id="settings"] .window-frame__titlebar',
                );
                await page.waitForFunction(() =>
                    document.activeElement ===
                        document.querySelector(
                            '[data-window-id="settings"] .window-frame__titlebar',
                        )
                );
                const restoredRing = () =>
                    settingsBar.evaluate((node) => ({
                        focused: document.activeElement === node,
                        outline: getComputedStyle(node).outlineStyle,
                    }));
                const byUrl = await restoredRing();
                assertEquals(byUrl.focused, true);
                assertEquals(byUrl.outline, "none", JSON.stringify(byUrl));
                await page.keyboard.press("Shift");
                const afterKey = await restoredRing();
                assertEquals(afterKey.focused, true);
                assert(afterKey.outline !== "none", JSON.stringify(afterKey));
            } finally {
                await context.close();
            }
        },
    );

    await t.step("触屏点击任务栏活动图标：最小化，再点击恢复", async () => {
        const user = await app.seedAskFixtureUser({ username: "dw_step_13" });
        const context = await browser.newContext({
            viewport: { width: 390, height: 844 },
            hasTouch: true,
            isMobile: true,
        });
        const page = await context.newPage();
        try {
            await loginAndVisit(page, app.origin, "/", user);
            const icon = page.locator('[data-dock-id="apps"]');
            const frame = page.locator('[data-window-id="apps"]');
            await icon.tap();
            await page.waitForURL(app.origin + "/?view=apps");
            await frame.waitFor({ state: "visible" });
            assertEquals(
                await icon.getAttribute("data-window-status"),
                "visible",
            );
            await icon.tap();
            await frame.waitFor({ state: "hidden" });
            await page.waitForURL(app.origin + "/");
            assertEquals(
                await icon.getAttribute("data-window-status"),
                "minimized",
            );
            await icon.tap();
            await page.waitForURL(app.origin + "/?view=apps");
            await frame.waitFor({ state: "visible" });
            assertEquals(
                await icon.getAttribute("data-window-status"),
                "visible",
            );
        } finally {
            await context.close();
        }
    });
});
