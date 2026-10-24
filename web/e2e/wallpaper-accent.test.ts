import { assert, assertEquals, assertNotEquals } from "@std/assert";
import type { BrowserContext, Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

type Rgb = [number, number, number];

function luminance(rgb: Rgb): number {
    const [r, g, b] = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/** Resolved sRGB of tokens on <html>, read through Canvas 2D like accent-contrast. */
function tokens(page: Page, names: string[]): Promise<Record<string, Rgb>> {
    return page.evaluate((names) => {
        const context = document.createElement("canvas").getContext("2d")!;
        const result: Record<string, [number, number, number]> = {};
        for (const name of names) {
            const probe = document.createElement("span");
            probe.style.backgroundColor = `var(${name})`;
            document.body.append(probe);
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = getComputedStyle(probe).backgroundColor;
            probe.remove();
            context.fillRect(0, 0, 1, 1);
            const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
            result[name] = [r, g, b];
        }
        return result;
    }, names);
}

const derived = (page: Page) =>
    page.evaluate(() =>
        document.documentElement.style.getPropertyValue("--wallpaper-accent")
    );

async function pngFile(page: Page, path: string, color: string) {
    const data = await page.evaluate((color) => {
        const canvas = document.createElement("canvas");
        canvas.width = 800;
        canvas.height = 450;
        const context = canvas.getContext("2d")!;
        context.fillStyle = color;
        context.fillRect(0, 0, 800, 450);
        return canvas.toDataURL("image/png").split(",")[1];
    }, color);
    await Deno.writeFile(
        path,
        Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
    );
}

async function upload(page: Page, path: string) {
    const before = await derived(page);
    await page.getByTestId("wallpaper-file-input").setInputFiles(path);
    await page.waitForFunction(
        (before) =>
            document.documentElement.style.getPropertyValue(
                "--wallpaper-accent",
            ) !== before,
        before,
    );
    return await derived(page);
}

async function assertAccentContrast(page: Page) {
    for (const theme of ["浅色", "深色"]) {
        await page.getByRole("radio", { name: theme, exact: true }).click();
        const t = await tokens(page, [
            "--accent",
            "--accent-foreground",
            "--accent-hover",
            "--accent-active",
            "--ring",
            "--surface",
            "--background",
            "--surface-soft",
        ]);
        const pairs: [string, string, number][] = [
            ["--accent", "--surface", 4.5],
            ["--accent-foreground", "--accent", 4.5],
            ["--accent-foreground", "--accent-hover", 4.5],
            ["--accent-foreground", "--accent-active", 4.5],
            ["--ring", "--background", 3],
            ["--ring", "--surface-soft", 3],
        ];
        for (const [a, b, minimum] of pairs) {
            const ratio = contrast(t[a], t[b]);
            assert(
                ratio >= minimum,
                `${theme} ${a}/${b} ${ratio.toFixed(2)}:1`,
            );
        }
    }
}

Deno.test("accent follows the wallpaper by default, stays a manual override and matches across devices #241", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({ headless: true });
    const contexts: BrowserContext[] = [];
    try {
        const open = async () => {
            const context = await browser.newContext({
                viewport: { width: 1440, height: 900 },
            });
            contexts.push(context);
            const page = await context.newPage();
            const errors: string[] = [];
            page.on("pageerror", (error) => errors.push(error.message));
            return { context, page, errors };
        };

        // Guest, first visit: "跟随壁纸" is selected and without a wallpaper the accent is blue.
        const guest = await open();
        await guest.page.goto(`${app.origin}/settings/appearance`);
        await guest.page.getByRole("radio", {
            name: "跟随壁纸",
            exact: true,
            checked: true,
        }).waitFor();
        assertEquals(
            await guest.page.evaluate(() =>
                document.documentElement.dataset.accent
            ),
            "wallpaper",
        );
        assertEquals((await tokens(guest.page, ["--accent"]))["--accent"], [
            29,
            78,
            216,
        ]);

        // Account on device A: an orange wallpaper gives an orange-family accent.
        const credentials = {
            username: "accent_tester",
            password: "Accent-password-241!",
        };
        const device = await open();
        const registered = await device.context.request.post(
            `${app.origin}/api/auth/register`,
            {
                headers: { Origin: app.origin },
                data: { ...credentials, displayName: "Accent" },
            },
        );
        assertEquals(registered.status(), 200);
        await device.context.clearCookies();
        await loginAndVisit(
            device.page,
            app.origin,
            "/settings/appearance",
            credentials,
        );
        await device.page.getByTestId("wallpaper-file-input").waitFor({
            state: "attached",
        });
        const orange = `${app.tempDir}/orange.png`;
        const teal = `${app.tempDir}/teal.png`;
        await pngFile(device.page, orange, "#e8781e");
        await pngFile(device.page, teal, "#1e9aa0");
        const orangeAccent = await upload(device.page, orange);
        const [r, g, b] = (await tokens(device.page, ["--accent"]))["--accent"];
        assert(r > g && g > b, `orange wallpaper accent ${[r, g, b]}`);
        await assertAccentContrast(device.page);

        // Changing the wallpaper re-derives immediately.
        const tealAccent = await upload(device.page, teal);
        assertNotEquals(tealAccent, orangeAccent);

        // A manual accent overrides; it persists, and "跟随壁纸" restores the wallpaper colour.
        const accentSaved = device.page.waitForResponse((response) =>
            response.url().endsWith("/api/preferences") &&
            response.request().method() === "PATCH" && response.ok() &&
            response.request().postData()?.includes('"violet"') === true
        );
        await device.page.getByRole("radio", { name: "电光紫", exact: true })
            .click();
        await device.page.waitForFunction(() =>
            document.documentElement.dataset.accent === "violet"
        );
        // The reload must observe the persisted choice, not race the save.
        await accentSaved;
        await device.page.reload();
        await device.page.getByRole("radio", {
            name: "电光紫",
            exact: true,
            checked: true,
        }).waitFor();
        await device.page.getByRole("radio", { name: "跟随壁纸", exact: true })
            .click();
        await device.page.waitForFunction(() =>
            document.documentElement.dataset.accent === "wallpaper"
        );
        assertEquals(
            await device.page.evaluate(async () =>
                (await (await fetch("/api/preferences")).json()).data.accent
            ),
            "wallpaper",
        );

        // Device B derives the same colour from the synced wallpaper and focal point.
        const other = await open();
        await loginAndVisit(other.page, app.origin, "/", credentials);
        await other.page.waitForFunction(
            (expected) =>
                document.documentElement.style.getPropertyValue(
                    "--wallpaper-accent",
                ) === expected,
            tealAccent,
            { timeout: 10_000 },
        );
        assertEquals(
            await other.page.evaluate(() =>
                document.documentElement.dataset.accent
            ),
            "wallpaper",
        );

        assertEquals([...guest.errors, ...device.errors, ...other.errors], []);
    } finally {
        for (const context of contexts) await context.close();
        await browser.close();
        await app.close();
    }
});
