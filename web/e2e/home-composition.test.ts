import { Buffer } from "node:buffer";
import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import { startProductionApp } from "./helpers/production-app.ts";

Deno.test("Home anchor is shared by guests and accounts and respects the plate clearance", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const evidence = Deno.env.get("COMPOSITION_EVIDENCE_DIR");
    if (evidence) await Deno.mkdir(evidence, { recursive: true });
    try {
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
        });
        const page = await context.newPage();
        await page.goto(app.origin + "/register");
        await page.locator("#auth-username").fill("composition_tester");
        await page.locator("#auth-display-name").fill("Composition");
        await page.locator("#auth-password").fill("Composition-password-150!");
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(app.origin + "/");
        await page.evaluate(async () => {
            for (let index = 0; index < 24; index++) {
                const response = await fetch("/api/webapps", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: `App ${index + 1}`,
                        url: `https://app-${index}.example/`,
                        sortOrder: index,
                        isHomeFixed: true,
                    }),
                });
                if (!response.ok) throw new Error(await response.text());
            }
            for (let index = 0; index < 2; index++) {
                const created = await fetch("/api/documents", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: index === 0 ? "今日计划" : "灵感",
                        body: "保留单元尺寸与 Material。\n\n- 搜索\n- 整理",
                        isHomeFixed: true,
                    }),
                });
                if (!created.ok) throw new Error(await created.text());
                const { data: document } = await created.json();
                const layout = await fetch(
                    `/api/documents/${document.id}/layout`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            band: index === 0 ? "left" : "right",
                            col: 0,
                            row: 0,
                            size: "s",
                        }),
                    },
                );
                if (!layout.ok) throw new Error(await layout.text());
            }
        });
        await page.reload();
        await page.locator(".launcher-grid--home .launcher-tile").first()
            .waitFor();
        if (evidence) {
            await page.goto(app.origin + "/design-lab");
            await page.locator('iframe[title="首页锚点 38%"]')
                .waitFor();
            for (const anchor of [31, 38]) {
                await page.frameLocator(`iframe[title="首页锚点 ${anchor}%"]`)
                    .locator(".launcher-grid--home .launcher-tile").nth(23)
                    .waitFor();
            }
            await page.screenshot({
                path: `${evidence}/lab-comparison.png`,
                fullPage: true,
            });
            await page.goto(app.origin + "/");
        }
        for (const theme of ["light", "dark"] as const) {
            await page.emulateMedia({
                colorScheme: theme,
                reducedMotion: "reduce",
            });
            for (
                const [width, height] of [
                    [1440, 900],
                    [1366, 768],
                    [768, 1024],
                    [390, 844],
                ]
            ) {
                await page.setViewportSize({ width, height });
                await page.reload();
                await page.locator(".launcher-grid--home .launcher-tile")
                    .first().waitFor();
                await page.locator(
                    width < 768
                        ? '.home-notes--flow[data-mode="stack"]'
                        : ".home-note-card",
                ).last().waitFor();
                await page.evaluate(() => document.fonts.ready);
                const metrics = await page.evaluate(() => {
                    const search = document.querySelector(".search-frame")!
                        .getBoundingClientRect();
                    const gridElement = document.querySelector(
                        ".launcher-grid--home",
                    )!;
                    const grid = gridElement.getBoundingClientRect();
                    const css = getComputedStyle(gridElement);
                    const plate = gridElement.closest(".launcher-plate");
                    return {
                        center: search.y + search.height / 2,
                        width: search.width,
                        rows: css.gridTemplateRows.split(" ").filter(Boolean)
                            .length,
                        plateBottom: (plate?.getBoundingClientRect() ?? grid)
                            .bottom,
                        overflow:
                            document.documentElement.scrollWidth > innerWidth,
                    };
                });
                // Preserve the flow-note layouts while calibrating desktop.
                let expectedCenter = height * 0.38;
                if (width < 1024) {
                    expectedCenter = 84 +
                        Math.min(220, Math.max(80, height * 0.22));
                }
                if (width < 768) {
                    expectedCenter = 82 +
                        Math.min(140, Math.max(64, height * 0.16));
                }
                assertAlmostEquals(metrics.center, expectedCenter, 1);
                assertAlmostEquals(metrics.width, Math.min(640, width - 32), 1);
                assert(!metrics.overflow);
                assert(metrics.rows >= 1 && metrics.rows <= 4);
                if (width === 1440) assertEquals(metrics.rows, 4);
                // 1366x768 with the 68px bottom dock: 316.16px holds three 76px rows (3 * 88 - 12 = 252).
                if (width === 1366) assertEquals(metrics.rows, 3);
                assert(
                    height - metrics.plateBottom >= 48 - 0.5,
                    JSON.stringify(metrics),
                );
                console.log(theme, width, height, metrics);
                if (evidence) {
                    await page.screenshot({
                        path: `${evidence}/account-${width}-${theme}.png`,
                        fullPage: true,
                    });
                }
                const guest = await browser.newContext({
                    viewport: { width, height },
                    colorScheme: theme,
                    reducedMotion: "reduce",
                });
                const guestPage = await guest.newPage();
                await guestPage.goto(app.origin + "/");
                await guestPage.locator(".search-frame").waitFor();
                const box = await guestPage.locator(".search-frame")
                    .boundingBox();
                assert(box);
                const screenshot = await guestPage.screenshot();
                const corner = await guestPage.evaluate(async (base64) => {
                    const image = new Image();
                    image.src = `data:image/png;base64,${base64}`;
                    await image.decode();
                    const canvas = document.createElement("canvas");
                    canvas.width = image.width;
                    canvas.height = image.height;
                    const context = canvas.getContext("2d")!;
                    context.drawImage(image, 0, 0);
                    return [
                        ...context.getImageData(20, image.height - 40, 1, 1)
                            .data,
                    ].slice(0, 3);
                }, screenshot.toString("base64"));
                assert(
                    theme === "light"
                        ? Math.max(...corner) < 240
                        : Math.min(...corner) >= 40,
                    `${theme} canvas corner: ${corner}`,
                );
                assertAlmostEquals(box.y + box.height / 2, metrics.center, 1);
                console.log(theme, width, "canvas corner", corner);
                if (evidence) {
                    await guestPage.screenshot({
                        path: `${evidence}/guest-${width}-${theme}.png`,
                        fullPage: true,
                    });
                }
                await guest.close();
            }
        }
        if (evidence) {
            // Exercise the real wallpaper upload path, not a CSS background override.
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.goto(app.origin + "/settings/appearance");
            const png = await page.evaluate(() => {
                const canvas = document.createElement("canvas");
                canvas.width = 1440;
                canvas.height = 900;
                const context = canvas.getContext("2d")!;
                const gradient = context.createLinearGradient(0, 0, 1440, 900);
                gradient.addColorStop(0, "#476779");
                gradient.addColorStop(1, "#b5c2ae");
                context.fillStyle = gradient;
                context.fillRect(0, 0, 1440, 900);
                return canvas.toDataURL("image/png").split(",")[1];
            });
            await page.getByTestId("wallpaper-file-input").setInputFiles({
                name: "composition.png",
                mimeType: "image/png",
                buffer: Buffer.from(png, "base64"),
            });
            await page.getByTestId("wallpaper-toast").filter({
                hasText: "已上传",
            }).waitFor();
            const guest = await browser.newContext({
                viewport: { width: 1440, height: 900 },
                reducedMotion: "reduce",
            });
            const guestPage = await guest.newPage();
            await guestPage.goto(app.origin + "/settings/appearance");
            await guestPage.getByTestId("wallpaper-file-input").setInputFiles({
                name: "composition.png",
                mimeType: "image/png",
                buffer: Buffer.from(png, "base64"),
            });
            await guestPage.getByTestId("wallpaper-toast").filter({
                hasText: "已上传",
            }).waitFor();
            for (
                const [identity, target] of [["account", page], [
                    "guest",
                    guestPage,
                ]] as const
            ) {
                for (const theme of ["light", "dark"] as const) {
                    await target.emulateMedia({ colorScheme: theme });
                    await target.goto(app.origin + "/");
                    await target.locator(".wallpaper-surface__image").waitFor();
                    await target.locator(".search-frame").waitFor();
                    if (identity === "account") {
                        await target.locator(".home-note").nth(1).waitFor();
                    }
                    await target.screenshot({
                        path:
                            `${evidence}/${identity}-wallpaper-1440-${theme}.png`,
                        fullPage: true,
                    });
                }
            }
            await guest.close();
        }
        await context.close();
    } finally {
        await browser.close();
        await app.close();
    }
});
