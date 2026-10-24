import { assert, assertEquals } from "@std/assert";
import type { Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

type Box = { x: number; y: number; width: number; height: number };

type PlacementMetrics = {
    topbar: Box | null;
    search: Box | null;
    grid: Box | null;
    notes: Array<Box & { title: string }>;
    flowCardWidths: number[];
};

const NOTE_COUNT = 8;

function intersects(a: Box, b: Box): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
        a.y < b.y + b.height && a.y + a.height > b.y;
}

async function measure(page: Page): Promise<PlacementMetrics> {
    return await page.evaluate(() => {
        const boxOf = (element: Element): Box => {
            const rect = element.getBoundingClientRect();
            return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
            };
        };
        const topbar = document.querySelector(".topbar");
        const search = document.querySelector(".search-form-wrap");
        const grid = document.querySelector(
            ".launcher-library .launcher-grid--home",
        );
        return {
            topbar: topbar ? boxOf(topbar) : null,
            search: search ? boxOf(search) : null,
            grid: grid ? boxOf(grid) : null,
            notes: Array.from(
                document.querySelectorAll(".floating-notes .note-position"),
            ).map((note) => ({
                title: note.querySelector(".note-title")?.textContent?.trim() ??
                    "",
                ...boxOf(note),
            })),
            flowCardWidths: Array.from(
                document.querySelectorAll(
                    ".notes-flow-grid .note-flow-item .note-card",
                ),
            ).map((card) => card.getBoundingClientRect().width),
        };
    });
}

// Default placement and tablet flow geometry for notes without saved positions (#243 X6).
// Run with: NODE_ENV=test deno test -A web/e2e/home-papers-placement.test.ts
Deno.test("production home default note placement E2E (#243)", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({
        prefix: "searcher_home_placement_e2e_",
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
        ignoreDefaultArgs: ["--hide-scrollbars"],
    });
    cleanup.defer(() => browser.close());

    const context = await browser.newContext({
        colorScheme: "light",
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    async function visit(path: string) {
        const response = await page.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await page.locator("main").waitFor({ state: "visible" });
    }

    // Register user
    await visit("/register");
    await page.locator("#auth-username").fill("placement_tester");
    await page.locator("#auth-display-name").fill("Placement Tester");
    await page.locator("#auth-password").fill("Notes-password-62!");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor({ state: "visible" });

    // Seed notes without saved positions; sort order follows the index.
    for (let index = 0; index < NOTE_COUNT; index++) {
        await page.evaluate(async (data) => {
            const response = await fetch("/api/documents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: data.title,
                    body: `正文 ${data.title}`,
                    isHomeFixed: true,
                    homeSortOrder: data.homeSortOrder,
                }),
            });
            if (!response.ok) throw new Error(await response.text());
        }, { title: `便签 ${index}`, homeSortOrder: index });
    }

    // Ten apps make the home app grid a second obstacle.
    for (let index = 0; index < 10; index++) {
        await page.evaluate(async (i) => {
            const response = await fetch("/api/webapps", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: `应用 ${i}`,
                    url: `https://placement-${i}.example/`,
                }),
            });
            if (!response.ok) throw new Error(await response.text());
        }, index);
    }

    await t.step(
        "1440 default notes avoid the search box, top bar and each other",
        async () => {
            await visit("/");
            await page.waitForFunction(
                (count) =>
                    document.querySelectorAll(".floating-notes .note-position")
                            .length === count &&
                    document.querySelector(".floating-notes--canvas")
                            ?.getAttribute("data-placement-ready") === "true",
                NOTE_COUNT,
            );
            const metrics = await measure(page);
            assertEquals(metrics.notes.length, NOTE_COUNT, "all notes placed");
            const topbar = metrics.topbar;
            const search = metrics.search;
            const grid = metrics.grid;
            assert(topbar && search && grid, "chrome geometry is measurable");

            for (const note of metrics.notes) {
                assert(
                    !intersects(note, search),
                    `${note.title} avoids search`,
                );
                assert(!intersects(note, grid), `${note.title} avoids apps`);
                assert(
                    note.y >= topbar.y + topbar.height,
                    `${note.title} sits below the top bar`,
                );
            }
            for (let i = 0; i < metrics.notes.length; i++) {
                for (let j = i + 1; j < metrics.notes.length; j++) {
                    assert(
                        !intersects(metrics.notes[i], metrics.notes[j]),
                        `${metrics.notes[i].title} and ${
                            metrics.notes[j].title
                        } must not overlap`,
                    );
                }
            }

            // The top gap equals the left/right margin (the leftmost note x).
            const margin = Math.min(...metrics.notes.map((note) => note.x));
            const topGap = Math.min(...metrics.notes.map((note) => note.y)) -
                (topbar.y + topbar.height);
            assert(
                Math.abs(topGap - margin) <= 2,
                `top gap ${topGap} must equal side margin ${margin}`,
            );

            // Sort order alternates from the left outer column, then the right.
            const xOf = (title: string) =>
                metrics.notes.find((note) => note.title === title)?.x;
            const midpoint = 1440 / 2;
            const xs = [0, 1, 2, 3].map((index) => xOf(`便签 ${index}`));
            assert(xs.every((x) => x !== undefined), "first four notes placed");
            assert(
                (xs[0] ?? Infinity) < midpoint &&
                    (xs[1] ?? -Infinity) > midpoint &&
                    (xs[2] ?? Infinity) < midpoint &&
                    (xs[3] ?? -Infinity) > midpoint,
                "sort order alternates left and right",
            );
        },
    );

    await t.step("768 flow papers keep the fixed 220px width", async () => {
        await page.setViewportSize({ width: 768, height: 1024 });
        await visit("/");
        await page.waitForFunction(
            (count) =>
                document.querySelectorAll(
                    ".notes-flow-grid .note-flow-item .note-card",
                ).length === count,
            NOTE_COUNT,
        );
        const metrics = await measure(page);
        assertEquals(metrics.flowCardWidths.length, NOTE_COUNT);
        for (const width of metrics.flowCardWidths) {
            assert(Math.abs(width - 220) <= 0.5, `flow card width ${width}`);
        }
    });
});
