import { Buffer } from "node:buffer";
import { assert, assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { createEvidenceDirectory } from "./helpers/evidence.ts";

Deno.test("home color hierarchy keeps avatar, engine and primary icons neutral", async () => {
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
            const avatar = await page.locator(".user-avatar-badge").evaluate(
                (el) => {
                    const probe = document.createElement("span");
                    probe.style.background = "var(--surface-soft)";
                    probe.style.color = "var(--foreground)";
                    document.body.append(probe);
                    const matches = getComputedStyle(el).backgroundColor ===
                            getComputedStyle(probe).backgroundColor &&
                        getComputedStyle(el).color ===
                            getComputedStyle(probe).color;
                    probe.remove();
                    return matches;
                },
            );
            assert(avatar, `${theme}: neutral avatar`);
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
            const engine = page.locator(".search-engine .engine-icon");
            assert(
                await engine.evaluate((el) =>
                    [...el.querySelectorAll("path")].every((path) =>
                        getComputedStyle(path).fill ===
                            getComputedStyle(el).color
                    )
                ),
                `${theme}: engine mark uses monochrome ink`,
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
