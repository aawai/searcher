import { assertEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import sharp from "sharp";
import { startProductionApp } from "./helpers/production-app.ts";

Deno.test("icon presentation real-page matrix: fixed glyphs, opaque and transparent artwork", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({
        args: ["--no-sandbox"],
        handleSIGTERM: false,
    });
    const evidence = Deno.env.get("ICON_EVIDENCE_DIR") ??
        `${app.tempDir}/evidence`;
    await Deno.mkdir(evidence, { recursive: true });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(app.origin + "/register");
        await page.locator("#auth-username").fill("icon_matrix");
        await page.locator("#auth-display-name").fill("Icon matrix");
        await page.locator("#auth-password").fill("Icon-matrix-password-243!");
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(app.origin + "/");
        for (
            const [name, svg] of [
                [
                    "满版",
                    '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="#6057d9"/><path d="M40 130V50h70v20H62v12h40v20H62v28z" fill="white"/></svg>',
                ],
                [
                    "透明",
                    '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><circle cx="90" cy="90" r="78" fill="#d23064"/></svg>',
                ],
            ]
        ) {
            const bytes = await sharp(new TextEncoder().encode(svg)).png()
                .toBuffer();
            const assetResponse = await context.request.post(
                app.origin + "/api/webapp-icons/upload",
                {
                    multipart: {
                        icon: {
                            name: "icon.png",
                            mimeType: "image/png",
                            buffer: bytes,
                        },
                    },
                    headers: { Origin: app.origin },
                },
            );
            assertEquals(assetResponse.status(), 200);
            const asset = (await assetResponse.json()).data;
            const created = await context.request.post(
                app.origin + "/api/webapps",
                {
                    data: {
                        name,
                        url: `https://${
                            name === "满版" ? "opaque" : "transparent"
                        }.example/`,
                        iconAssetId: asset.id,
                        iconSource: "upload",
                        isHomeFixed: true,
                    },
                    headers: { Origin: app.origin },
                },
            );
            assertEquals(created.status(), 200);
        }
        const fallback = await context.request.post(
            app.origin + "/api/webapps",
            {
                data: {
                    name: "域名回退",
                    url: "https://fallback.example/",
                    iconSource: "default",
                    isHomeFixed: true,
                },
                headers: { Origin: app.origin },
            },
        );
        assertEquals(fallback.status(), 200);
        for (const theme of ["light", "dark"]) {
            await context.request.patch(app.origin + "/api/preferences", {
                data: { theme },
                headers: { Origin: app.origin },
            });
            for (
                const [width, height] of [[390, 844], [768, 1024], [1440, 900]]
            ) {
                await page.setViewportSize({ width, height });
                await page.reload();
                await page.locator(
                    ".launcher-library .launcher-tile[data-tile-id] .webapp-glyph img",
                ).first()
                    .waitFor();
                await page.waitForFunction(() =>
                    [...document.querySelectorAll<HTMLImageElement>(
                        ".launcher-library .launcher-tile[data-tile-id] .webapp-glyph img",
                    )].every((image) =>
                        image.complete && image.naturalWidth === 256
                    )
                );
                const widths = await page.locator(
                    ".launcher-library .launcher-tile[data-tile-id] .webapp-glyph",
                )
                    .evaluateAll((nodes) =>
                        nodes.map((node) => node.getBoundingClientRect().width)
                    );
                assertEquals(widths, [
                    width < 768 ? 44 : 48,
                    width < 768 ? 44 : 48,
                    width < 768 ? 44 : 48,
                ]);
                const edges = await page.locator(
                    ".launcher-grid--home .webapp-glyph",
                ).evaluateAll((nodes) =>
                    nodes.map((node) => ({
                        ring: getComputedStyle(node, "::after").boxShadow,
                        shadow: getComputedStyle(node).boxShadow,
                    }))
                );
                assertEquals(
                    edges.every((edge) =>
                        edge.ring.includes("inset") && edge.shadow !== "none"
                    ),
                    true,
                );
                assertEquals(new Set(edges.map((edge) => edge.ring)).size, 1);
                assertEquals(
                    await page.evaluate(() =>
                        document.documentElement.scrollWidth > innerWidth
                    ),
                    false,
                );
                await page.screenshot({
                    path: `${evidence}/icons-${width}-${theme}.png`,
                    fullPage: true,
                });
            }
        }
        const wallpaper = await sharp({
            create: {
                width: 1440,
                height: 900,
                channels: 3,
                background: "#5f8192",
            },
        }).jpeg().toBuffer();
        for (const signedIn of [true, false]) {
            const matrixContext = signedIn
                ? context
                : await browser.newContext();
            const matrixPage = signedIn ? page : await matrixContext.newPage();
            for (const imageWallpaper of [false, true]) {
                if (imageWallpaper) {
                    await matrixPage.goto(app.origin + "/settings/appearance");
                    await matrixPage.getByTestId("wallpaper-file-input")
                        .setInputFiles({
                            name: "wallpaper.jpg",
                            mimeType: "image/jpeg",
                            buffer: wallpaper,
                        });
                    await matrixPage.getByText("壁纸已上传并设为当前背景", {
                        exact: true,
                    }).waitFor();
                }
                for (const colorScheme of ["light", "dark"] as const) {
                    await matrixPage.emulateMedia({ colorScheme });
                    if (signedIn) {
                        await matrixContext.request.patch(
                            app.origin + "/api/preferences",
                            {
                                data: { theme: colorScheme },
                                headers: { Origin: app.origin },
                            },
                        );
                    }
                    for (
                        const [width, height] of [[390, 844], [768, 1024], [
                            1440,
                            900,
                        ]]
                    ) {
                        await matrixPage.setViewportSize({ width, height });
                        await matrixPage.goto(app.origin);
                        await matrixPage.locator("main.home").waitFor();
                        if (imageWallpaper) {
                            await matrixPage.locator(
                                ".app-shell[data-wallpaper-image]",
                            ).waitFor();
                        }
                        assertEquals(
                            await matrixPage.evaluate(() =>
                                document.documentElement.scrollWidth >
                                    innerWidth
                            ),
                            false,
                        );
                        await matrixPage.screenshot({
                            path: `${evidence}/${signedIn ? "user" : "guest"}-${
                                imageWallpaper ? "image" : "default"
                            }-${width}-${colorScheme}.png`,
                            fullPage: true,
                        });
                    }
                }
            }
            if (!signedIn) await matrixContext.close();
        }
        console.log(`Icon matrix evidence: ${evidence}`);
    } finally {
        await browser.close();
        await app.close();
    }
});
