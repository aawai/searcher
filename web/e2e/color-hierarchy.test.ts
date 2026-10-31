import { Buffer } from "node:buffer";
import { assert, assertEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { createEvidenceDirectory } from "./helpers/evidence.ts";

Deno.test("home color hierarchy keeps avatar and primary icons neutral and the engine mark in brand color", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({
        args: ["--no-sandbox"],
        handleSIGTERM: false,
    });
    try {
        const credentials = await app.seedAskFixtureUser({
            displayName: "alice",
        });
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        await loginAndVisit(page, app.origin, "/", credentials);
        await page.locator(".user-avatar-badge").waitFor();
        assertEquals(await page.locator(".user-avatar-badge").innerText(), "a");
        for (const theme of ["light", "dark"]) {
            await page.evaluate(
                (theme) => document.documentElement.dataset.theme = theme,
                theme,
            );
            const identity = await page.evaluate(() => {
                const probe = document.createElement("span");
                probe.style.background = "var(--surface-control-thumb)";
                probe.style.color = "var(--accent)";
                document.body.append(probe);
                const badge = getComputedStyle(
                    document.querySelector(".user-avatar-badge")!,
                );
                const result = {
                    // On the home group the badge is a thumb, never accent.
                    badge: badge.backgroundColor ===
                        getComputedStyle(probe).backgroundColor,
                    badgeText: badge.color === getComputedStyle(
                        document.querySelector(".wordmark-small")!,
                    ).color,
                    // The wordmark's full stop is the brand's only accent.
                    dot: getComputedStyle(
                        document.querySelector(".wordmark-dot")!,
                    ).color === getComputedStyle(probe).color,
                };
                probe.remove();
                return result;
            });
            assertEquals(
                identity,
                { badge: true, badgeText: true, dot: true },
                `${theme}: neutral avatar and accent wordmark stop`,
            );
            const submit = page.locator(".search-submit");
            const idle = await submit.evaluate((el) => ({
                width: el.clientWidth,
                height: el.clientHeight,
                radius: getComputedStyle(el).borderRadius,
                background: getComputedStyle(el).backgroundColor,
            }));
            await page.locator("#search-query").fill("searcher");
            const typing = await submit.evaluate((el) => ({
                width: el.clientWidth,
                height: el.clientHeight,
                radius: getComputedStyle(el).borderRadius,
                background: getComputedStyle(el).backgroundColor,
            }));
            assertEquals(
                typing,
                idle,
                `${theme}: submit geometry/fill does not jump while typing`,
            );
            await page.locator("#search-query").fill("");
            // The search box shows the current engine's own logo colors.
            const engine = page.locator(".search-engine .engine-icon");
            assertEquals(
                await engine.locator("path").evaluateAll((paths) =>
                    paths.map((path) => getComputedStyle(path).fill)
                ),
                ["rgb(37, 143, 250)"],
                `${theme}: Bing mark uses its brand color`,
            );
        }
        await page.locator(".search-engine").click();
        assertEquals(
            await page.getByRole("menuitemradio", {
                name: "Google",
                exact: true,
            }).locator("path").first().evaluate((el) =>
                getComputedStyle(el).fill
            ),
            "rgb(66, 133, 244)",
        );
        await page.keyboard.press("Escape");
        assertEquals(
            await page.locator(".top-actions .lucide-sun-moon").count(),
            1,
        );
        for (
            const stroke of await page.locator(".top-actions svg").evaluateAll((
                els,
            ) => els.map((el) => el.getAttribute("stroke-width")))
        ) assertEquals(stroke, "2");
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("color hierarchy real-page matrix: guest/account, mesh/image, light/dark", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({
        args: ["--no-sandbox"],
        handleSIGTERM: false,
    });
    const evidence = await createEvidenceDirectory("243-x1");
    try {
        const credentials = await app.seedAskFixtureUser({
            displayName: "alice",
        });
        for (const account of [false, true]) {
            const context = await browser.newContext();
            const page = await context.newPage();
            if (account) {
                await loginAndVisit(page, app.origin, "/", credentials);
            } else await page.goto(app.origin + "/");
            for (const image of [false, true]) {
                if (image) {
                    await page.goto(app.origin + "/settings/appearance");
                    const png = await page.evaluate(() => {
                        const canvas = document.createElement("canvas");
                        canvas.width = 1440;
                        canvas.height = 900;
                        const ctx = canvas.getContext("2d")!;
                        const gradient = ctx.createLinearGradient(
                            0,
                            0,
                            1440,
                            900,
                        );
                        gradient.addColorStop(0, "#30475c");
                        gradient.addColorStop(0.5, "#809b89");
                        gradient.addColorStop(1, "#d9c9a9");
                        ctx.fillStyle = gradient;
                        ctx.fillRect(0, 0, 1440, 900);
                        return canvas.toDataURL("image/png").split(",")[1];
                    });
                    await page.getByTestId("wallpaper-file-input")
                        .setInputFiles({
                            name: "landscape.png",
                            mimeType: "image/png",
                            buffer: Buffer.from(png, "base64"),
                        });
                    await page.getByTestId("wallpaper-toast").filter({
                        hasText: "已上传",
                    }).waitFor();
                    await page.goto(app.origin + "/");
                    await page.getByTestId("home-wallpaper-surface-image")
                        .waitFor();
                }
                for (
                    const [width, height] of [[390, 844], [768, 1024], [
                        1440,
                        900,
                    ]]
                ) {
                    await page.setViewportSize({ width, height });
                    for (const theme of ["light", "dark"]) {
                        await page.evaluate(
                            (theme) =>
                                document.documentElement.dataset.theme = theme,
                            theme,
                        );
                        await page.locator(".search-frame").waitFor();
                        await page.screenshot({
                            path: `${evidence}/${
                                account ? "account" : "guest"
                            }-${
                                image
                                    ? "image"
                                    : "mesh"
                            }-${width}-${theme}.png`,
                            fullPage: true,
                            animations: "disabled",
                        });
                        assert(
                            await page.evaluate(() =>
                                document.documentElement.scrollWidth <=
                                    innerWidth
                            ),
                            "no horizontal overflow",
                        );
                    }
                }
            }
            await context.close();
        }
    } finally {
        await browser.close();
        await app.close();
    }
});
