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
