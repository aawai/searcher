import { assert, assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { startProductionApp } from "./helpers/production-app.ts";

// Production-page regression for Zen home pins: 68px touch tracks, 4px gap,
// and at least 44px usable targets without changing Widgets Quick or desktop.
Deno.test("mobile Zen pinned launcher keeps five columns at 390px", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
        const context = await browser.newContext({
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
            colorScheme: "light",
        });
        const page = await context.newPage();
        await page.goto(app.origin + "/register");
        await page.locator("#auth-username").fill("zen_pinned_density");
        await page.locator("#auth-display-name").fill("Zen density tester");
        await page.locator("#auth-password").fill("Zen-density-password-150!");
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(app.origin + "/");

        await page.evaluate(async () => {
            for (let index = 0; index < 6; index++) {
                const response = await fetch("/api/webapps", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: "Pinned " + index,
                        url: "https://pinned-" + index + ".example/",
                        isPinned: true,
                        sortOrder: index,
                    }),
                });
                if (!response.ok) {
                    throw new Error("Seed pinned app: " + await response.text());
                }
            }
        });
        const setStyle = async (style: "zen" | "widgets") => {
            const status = await page.evaluate(async (value) => {
                const response = await fetch("/api/preferences", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ style: value }),
                });
                return response.status;
            }, style);
            assertEquals(status, 200);
            await page.reload();
        };
        await setStyle("zen");

        const grid = page.locator(".pinned-area .launcher-grid--home");
        await grid.waitFor({ state: "visible" });
        await page.waitForFunction(() =>
            document.querySelectorAll(
                ".pinned-area .launcher-grid--home .launcher-tile",
            ).length === 6
        );
        assertEquals(
            await page.evaluate(() =>
                matchMedia("(pointer: coarse), (hover: none)").matches
            ),
            true,
        );

        for (const { width, columns } of [
            { width: 375, columns: 4 },
            { width: 390, columns: 5 },
            { width: 430, columns: 5 },
        ]) {
            await page.setViewportSize({ width, height: 844 });
            await page.waitForFunction((count) =>
                document.querySelector(
                    ".pinned-area .launcher-grid--home",
                )?.getAttribute("data-columns") === String(count), columns);
            const metrics = await grid.evaluate((node) => {
                const element = node as HTMLElement;
                const css = getComputedStyle(element);
                const col = parseFloat(
                    css.getPropertyValue("--launcher-col-w"),
                );
                const row = parseFloat(
                    css.getPropertyValue("--launcher-row-h"),
                );
                const gapX = parseFloat(css.columnGap);
                const gapY = parseFloat(css.rowGap);
                const parentWidth = element.parentElement!
                    .getBoundingClientRect().width;
                const tiles = Array.from(
                    element.querySelectorAll<HTMLElement>(".launcher-tile"),
                    (tile) => {
                        const r = tile.getBoundingClientRect();
                        return {
                            left: r.left,
                            right: r.right,
                            top: r.top,
                            bottom: r.bottom,
                        };
                    },
                );
                const buttons = Array.from(
                    element.querySelectorAll<HTMLElement>(".webapp-icon"),
                );
                const hittable = buttons.every((button) => {
                    const rect = button.getBoundingClientRect();
                    if (rect.width < 44 || rect.height < 44) return false;
                    const hit = document.elementFromPoint(
                        rect.left + rect.width / 2,
                        rect.top + rect.height / 2,
                    );
                    return hit === button || button.contains(hit);
                });
                const overlaps = tiles.some((a, i) =>
                    tiles.slice(i + 1).some((b) =>
                        a.left < b.right - 0.5 &&
                        a.right > b.left + 0.5 &&
                        a.top < b.bottom - 0.5 &&
                        a.bottom > b.top + 0.5
                    )
                );
                const firstRow = tiles.filter((tile) =>
                    Math.abs(tile.top - tiles[0].top) < 1
                ).length;
                return {
                    col,
                    row,
                    gapX,
                    gapY,
                    parentWidth,
                    firstRow,
                    hittable,
                    overlaps,
                    overflow: element.scrollWidth > element.clientWidth + 1,
                    columns: Number(element.dataset.columns),
                };
            });
            assertEquals(metrics.col, 68);
            assertEquals(metrics.row, 68);
            assertEquals(metrics.gapX, 4);
            assertEquals(metrics.gapY, 4);
            assertEquals(metrics.columns, columns);
            assertEquals(
                Math.min(
                    6,
                    Math.floor(
                        (metrics.parentWidth + metrics.gapX) /
                            (metrics.col + metrics.gapX),
                    ),
                ),
                columns,
            );
            assertEquals(metrics.firstRow, columns);
            assertEquals(metrics.hittable, true);
            assertEquals(metrics.overlaps, false);
            assertEquals(metrics.overflow, false);
            if (width === 390) {
                assert(metrics.parentWidth >= 356);
            }
        }

        // Visual icon size and label preferences must not change tracks/columns.
        await page.setViewportSize({ width: 390, height: 844 });
        const setHomeVisuals = async (payload: {
            webAppIconSize?: "compact" | "default" | "large";
            showAppLabels?: boolean;
        }) => {
            const status = await page.evaluate(async (values) => {
                const response = await fetch("/api/preferences", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(values),
                });
                return response.status;
            }, payload);
            assertEquals(status, 200);
            await page.reload();
            await grid.waitFor({ state: "visible" });
        };
        for (
            const { size, iconWidth } of [
                { size: "compact", iconWidth: 40 },
                { size: "default", iconWidth: 42 },
                { size: "large", iconWidth: 44 },
            ] as const
        ) {
            await setHomeVisuals({
                webAppIconSize: size,
                showAppLabels: true,
            });
            await page.waitForFunction((width) => {
                const glyph = document.querySelector<HTMLElement>(
                    ".pinned-area .launcher-grid--home .webapp-glyph",
                );
                return glyph && Math.abs(glyph.getBoundingClientRect().width - width) < 1;
            }, iconWidth);
            const visual = await grid.evaluate((element) => ({
                tileCount: element.querySelectorAll(".launcher-tile").length,
                labels: element.querySelectorAll(".webapp-name").length,
                track: Number.parseFloat(
                    getComputedStyle(element).getPropertyValue("--launcher-col-w"),
                ),
                columns: Number((element as HTMLElement).dataset.columns),
            }));
            assertEquals(visual.tileCount, 6);
            assertEquals(visual.labels, 6);
            assertEquals(visual.track, 68);
            assertEquals(visual.columns, 5);
        }
        await setHomeVisuals({
            webAppIconSize: "default",
            showAppLabels: false,
        });
        await page.waitForFunction(() =>
            document.querySelector(
                ".pinned-area .launcher-grid--home.launcher-grid--icons-only",
            ) !== null
        );
        assertEquals(await grid.locator(".webapp-name").count(), 0);
        assertEquals(await grid.getAttribute("data-columns"), "5");
        await setHomeVisuals({ showAppLabels: true });
        await page.waitForFunction(() =>
            document.querySelectorAll(
                ".pinned-area .launcher-grid--home .webapp-name",
            ).length === 6
        );

        // Enter arranging via context menu; reproduce real CDP touch dragging
        // into another cell and verify the portaled preview + persistence.
        const tiles = grid.locator(":scope > .launcher-tile");
        const initialIds = await tiles.evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("data-tile-id"))
        );
        assertEquals(initialIds.length, 6);
        await tiles.first().locator(".webapp-icon").click({ button: "right" });
        await page.getByRole("menuitem", {
            name: "整理布局",
            exact: true,
        }).click();
        await page.waitForFunction(() =>
            document.querySelectorAll(
                ".pinned-area .launcher-tile.is-managing",
            ).length === 6
        );
        const source = (await tiles.nth(0).boundingBox())!;
        const destination = (await tiles.nth(1).boundingBox())!;
        const start = {
            x: source.x + source.width / 2,
            y: source.y + source.height / 2,
            id: 1,
        };
        const cdp = await context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [start],
        });
        await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ ...start, x: start.x + 12 }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ ...start, x: start.x + 20 }],
        });
        const overlay = page.locator(".launcher-overlay--home");
        await overlay.waitFor({ state: "visible" });
        const previewGeometry = await overlay.evaluate((element) => {
            const r = element.getBoundingClientRect();
            const glyph = element.querySelector(".webapp-glyph")!
                .getBoundingClientRect();
            const css = getComputedStyle(element);
            return {
                width: r.width,
                height: r.height,
                glyphWidth: glyph.width,
                cell: Number.parseFloat(css.getPropertyValue("--launcher-col-w")),
                gap: Number.parseFloat(css.getPropertyValue("--launcher-gap-x")),
            };
        });
        assertEquals(previewGeometry.width, 68);
        assertEquals(previewGeometry.height, 68);
        assertEquals(previewGeometry.glyphWidth, 42);
        assertEquals(previewGeometry.cell, 68);
        assertEquals(previewGeometry.gap, 4);

        const saved = page.waitForResponse((response) =>
            new URL(response.url()).pathname === "/api/webapps/reorder" &&
            response.request().method() === "PUT"
        );
        const dropPoint = {
            x: destination.x + destination.width / 2,
            y: destination.y + destination.height / 2,
            id: 1,
        };
        await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [dropPoint],
        });
        await page.waitForFunction((targetId) =>
            Array.from(
                document.querySelectorAll(
                    ".pinned-area .launcher-tile.is-over",
                ),
            ).some((node) => node.getAttribute("data-tile-id") === targetId),
        initialIds[1]);
        await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
        });
        assertEquals((await saved).status(), 200);
        await page.waitForFunction((ids) => {
            const actual = Array.from(
                document.querySelectorAll(
                    ".pinned-area .launcher-grid--home > .launcher-tile",
                ),
                (node) => node.getAttribute("data-tile-id"),
            );
            return actual[0] === ids[1] && actual[1] === ids[0];
        }, initialIds);
        await page.reload();
        await grid.waitFor({ state: "visible" });
        const reorderedIds = await grid.locator(":scope > .launcher-tile")
            .evaluateAll((nodes) =>
                nodes.map((node) => node.getAttribute("data-tile-id"))
            );
        assertEquals(reorderedIds.slice(0, 2), [
            initialIds[1],
            initialIds[0],
        ]);

        // Widgets Quick retains its independent touch density.
        await page.setViewportSize({ width: 390, height: 844 });
        await setStyle("widgets");
        const quick = page.locator(".widgets-bento-card .launcher-grid--quick");
        await quick.waitFor({ state: "visible" });
        const quickMetrics = await quick.evaluate((node) => {
            const css = getComputedStyle(node);
            return {
                cell: parseFloat(css.getPropertyValue("--launcher-col-w")),
                gap: parseFloat(css.columnGap),
            };
        });
        assertEquals(quickMetrics.cell, 88);
        assertEquals(quickMetrics.gap, 8);

        // Fine-pointer Home keeps the pre-existing 64px / 6px layout.
        await setStyle("zen");
        const fineContext = await browser.newContext({
            viewport: { width: 390, height: 844 },
            storageState: await context.storageState(),
        });
        try {
            const finePage = await fineContext.newPage();
            await finePage.goto(app.origin + "/");
            const fineGrid = finePage.locator(
                ".pinned-area .launcher-grid--home",
            );
            await fineGrid.waitFor({ state: "visible" });
            const fineMetrics = await fineGrid.evaluate((node) => {
                const css = getComputedStyle(node);
                return {
                    cell: parseFloat(css.getPropertyValue("--launcher-col-w")),
                    gap: parseFloat(css.columnGap),
                };
            });
            assertEquals(fineMetrics.cell, 64);
            assertEquals(fineMetrics.gap, 6);
        } finally {
            await fineContext.close();
        }
    } finally {
        await browser.close();
        await app.close();
    }
});
