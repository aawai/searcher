import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { chromium, type Page } from "playwright";
import { startProductionApp } from "./helpers/production-app.ts";

const status = (page: Page) =>
    page.getByTestId("accent-lab-status").innerText();
const derived = (page: Page) =>
    page.evaluate(() =>
        document.documentElement.style.getPropertyValue("--wallpaper-accent")
    );

Deno.test("accent lab derives the accent from the wallpaper focal region and keeps manual overrides #241", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${app.origin}/design-lab/accent`);
        await page.waitForFunction(() =>
            document.querySelector('[data-testid="accent-lab-status"]')
                ?.textContent?.startsWith("色相")
        );

        // Focal region: the left half of the split sample is red, the right half blue.
        await page.getByRole("radio", { name: "红蓝对开", exact: true })
            .click();
        const stage = page.getByRole("slider", { name: "取色焦点" });
        const box = (await stage.boundingBox())!;
        await stage.click({
            position: { x: box.width * 0.1, y: box.height / 2 },
        });
        await page.waitForFunction(() =>
            /色相 (?:[0-3]?\d|3[3-5]\d)°/.test(
                document.querySelector('[data-testid="accent-lab-status"]')
                    ?.textContent ?? "",
            )
        );
        const red = await derived(page);
        await stage.click({
            position: { x: box.width * 0.9, y: box.height / 2 },
        });
        await page.waitForFunction(
            (previous) =>
                document.documentElement.style.getPropertyValue(
                    "--wallpaper-accent",
                ) !== previous,
            red,
        );
        assert((await status(page)).startsWith("色相 2"));

        // Every check row in both themes holds its minimum.
        assertEquals(await page.locator('tr[data-pass="false"]').count(), 0);
        assertEquals(await page.locator('tr[data-pass="true"]').count(), 16);

        // Neutral wallpapers fall back to a neutral accent.
        await page.getByRole("radio", { name: "纯黑", exact: true }).click();
        await page.waitForFunction(() =>
            document.querySelector('[data-testid="accent-lab-status"]')
                ?.textContent?.includes("中性")
        );

        // A manual accent overrides the wallpaper; following again restores it.
        await page.getByRole("radio", { name: "电光紫", exact: true }).click();
        const accentOf = () =>
            page.evaluate(() =>
                getComputedStyle(document.documentElement).getPropertyValue(
                    "--accent",
                ).trim()
            );
        assertEquals(
            await page.evaluate(() => document.documentElement.dataset.accent),
            "violet",
        );
        const manual = await accentOf();
        await page.getByRole("radio", { name: "跟随壁纸", exact: true })
            .click();
        assertNotEquals(await accentOf(), manual);

        // No wallpaper: following the wallpaper falls back to the default palette.
        await page.getByRole("button", { name: "移除壁纸" }).click();
        await page.waitForFunction(() =>
            document.querySelector('[data-testid="accent-lab-status"]')
                ?.textContent?.startsWith("无壁纸")
        );
        assertEquals(await derived(page), "");
        assertEquals(errors, []);
    } finally {
        await browser.close();
        await app.close();
    }
});
