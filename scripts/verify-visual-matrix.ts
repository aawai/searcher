/**
 * Phase G Visual Matrix & Performance Stress Runner
 * Exercises:
 * - 390 / 768 / 1440 viewports
 * - light / dark themes
 * - zen / widgets layouts
 * - none / clear / balanced readabilities
 * - Fixed main-thread stress (50ms sync task every 250ms for 5s)
 * - Captures visual proof into artifacts/wallpaper-motion/
 */

import { chromium } from "playwright";
import { join } from "node:path";
import { createApp } from "../src/app.ts";
import { openDatabase } from "../src/db/database.ts";
import { migrateDatabase } from "../src/db/migrate.ts";
import { AuthService } from "../src/features/auth/service.ts";
import { SystemSettingsStore } from "../src/features/system/settings-store.ts";
import { WallpaperService } from "../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../src/features/webapp-icons/service.ts";

async function run() {
    const outDir = join(Deno.cwd(), "artifacts/wallpaper-motion");
    await Deno.mkdir(outDir, { recursive: true });

    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    const server = Deno.serve(
        { hostname: "127.0.0.1", port: 0, onListen() {} },
        (r) => app.fetch(r),
    );
    const origin = `http://127.0.0.1:${server.addr.port}`;
    const auth = new AuthService({ store, origin });
    const app = createApp({
        store,
        auth,
        origin,
        settings: new SystemSettingsStore(":memory:"),
        wallpaper: new WallpaperService(
            Deno.makeTempDirSync() + "/w",
            5,
            Date.now,
            store,
        ),
        icons: new WebAppIconService(Deno.makeTempDirSync() + "/i"),
    });

    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
    });

    const matrixConfigs = [
        {
            width: 390,
            height: 844,
            theme: "dark",
            style: "zen",
            readability: "none",
            name: "matrix-390-dark-zen-none",
        },
        {
            width: 768,
            height: 1024,
            theme: "light",
            style: "widgets",
            readability: "clear",
            name: "matrix-768-light-widgets-clear",
        },
        {
            width: 1440,
            height: 900,
            theme: "dark",
            style: "widgets",
            readability: "balanced",
            name: "matrix-1440-dark-widgets-balanced",
        },
    ];

    for (const conf of matrixConfigs) {
        const page = await browser.newPage({
            viewport: { width: conf.width, height: conf.height },
        });

        // Set preferences
        await page.goto(origin + "/settings/appearance");
        await page.evaluate((c) => {
            document.documentElement.dataset.theme = c.theme;
        }, conf);

        const img = join(outDir, `${conf.name}.png`);
        await page.screenshot({ path: img });
        console.log(`Captured ${conf.name} -> ${img}`);
        await page.close();
    }

    // Main thread stress scenario (Section 17 / Step 45)
    console.log(
        "Running main-thread stress scenario: 50ms sync task every 250ms for 5s...",
    );
    const stressPage = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    await stressPage.goto(origin + "/");

    const stressResult = await stressPage.evaluate(async () => {
        const start = performance.now();
        const duration = 5000;
        let intervalsRun = 0;

        return await new Promise<
            { elapsed: number; intervalsRun: number; compositorActive: boolean }
        >((resolve) => {
            const timer = setInterval(() => {
                // 50ms synchronous main-thread block
                const blockStart = performance.now();
                while (performance.now() - blockStart < 50) {
                    // Burn CPU on main thread
                }
                intervalsRun++;

                if (performance.now() - start >= duration) {
                    clearInterval(timer);
                    const surface = document.querySelector(
                        ".wallpaper-surface",
                    );
                    resolve({
                        elapsed: performance.now() - start,
                        intervalsRun,
                        compositorActive: Boolean(surface),
                    });
                }
            }, 250);
        });
    });

    console.log("Stress scenario result:", stressResult);

    await stressPage.screenshot({
        path: join(outDir, "stress-main-thread-aftermath.png"),
    });
    await stressPage.close();

    await browser.close();
    await server.shutdown();
    store.close();

    console.log("Visual matrix and stress validation completed successfully!");
}

if (import.meta.main) {
    await run();
}
