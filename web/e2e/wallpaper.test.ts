import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";
import type { PreferencesDto } from "../../src/shared/contracts.ts";

Deno.test("production wallpaper composition, lifecycle and sync E2E", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({ prefix: "searcher_wallpaper_e2e_" });
    cleanup.defer(() => Deno.remove(files, { recursive: true }));
    const store = openDatabase(":memory:");
    cleanup.defer(() => store.close());
    await migrateDatabase(store);
    const server = Deno.serve(
        { hostname: "127.0.0.1", port: 0, onListen() {} },
        (r) => app.fetch(r),
    );
    cleanup.defer(() => server.shutdown());
    const origin = `http://127.0.0.1:${server.addr.port}`;
    const auth = new AuthService({ store, origin });
    const app = createApp({
        store,
        auth,
        origin,
        settings: new SystemSettingsStore(":memory:"),
        wallpaper: new WallpaperService(
            `${files}/wallpapers`,
            5,
            Date.now,
            store,
        ),
        icons: new WebAppIconService(`${files}/icons`),
    });
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const username = "wallpaper_tester";
    const password = "Wallpaper-password-75!";
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    async function signIn(target: Page = page) {
        await target.goto(origin + "/login");
        await target.locator("#auth-username").fill(username);
        await target.locator("#auth-password").fill(password);
        await target.locator('form button[type="submit"]').click();
        await target.waitForURL(origin + "/");
    }
    async function prefs(target: Page = page): Promise<PreferencesDto> {
        return await target.evaluate(async () =>
            (await (await fetch("/api/preferences")).json()).data
        );
    }
    async function waitCurrent(source: string | null, target: Page = page) {
        await target.waitForFunction(async (expected) => {
            const result = await (await fetch("/api/preferences")).json();
            return result.data.backgroundImage === expected;
        }, source);
    }
    async function upload(focalX: number) {
        const data = await page.evaluate((x) => {
            const canvas = document.createElement("canvas");
            canvas.width = 1600;
            canvas.height = 900;
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "#162330";
            ctx.fillRect(0, 0, 1600, 900);
            ctx.fillStyle = "#ff1010";
            ctx.fillRect(x * 1600 - 55, 250, 110, 400);
            return canvas.toDataURL("image/png").split(",")[1];
        }, focalX);
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const path = `${files}/subject-${focalX}.png`;
        await Deno.writeFile(path, bytes);
        await page.getByTestId("wallpaper-file-input").setInputFiles(path);
        await page.getByTestId("wallpaper-toast").filter({ hasText: "已上传" })
            .waitFor();
        const source = (await prefs()).backgroundImage;
        assert(source);
        assert(source.startsWith("/api/wallpaper/"));
        return source;
    }
    async function subjectVisible(target: Page, selector: string) {
        const bytes = await target.locator(selector).screenshot();
        const base64 = btoa(String.fromCharCode(...bytes));
        const count = await target.evaluate(async (encoded) => {
            const image = new Image();
            image.src = "data:image/png;base64," + encoded;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(image, 0, 0);
            const { data } = ctx.getImageData(0, 0, image.width, image.height);
            let red = 0;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i] > 150 && data[i + 1] < 90 && data[i + 2] < 90) {
                    red++;
                }
            }
            return red;
        }, base64);
        assert(
            count > 100,
            "The off-center red subject must remain visible in the actual rendered screenshot",
        );
    }
    const registration = await context.request.post(
        origin + "/api/auth/register",
        {
            headers: { Origin: origin },
            data: {
                username,
                password,
                displayName: "Wallpaper tester",
                email: "wallpaper@example.com",
            },
        },
    );
    assertEquals(registration.status(), 200);
    await context.clearCookies();
    await signIn();
    await page.goto(origin + "/settings/appearance");
    await page.getByTestId("wallpaper-input").waitFor();
    let left = "";
    let right = "";
    await t.step(
        "off-center subjects survive desktop/mobile preview, apply and refresh",
        async () => {
            for (const focalX of [0.2, 0.8]) {
                const source = await upload(focalX);
                const input = page.getByTestId("wallpaper-input");
                const applyBtn = page.getByTestId("wallpaper-apply-btn");

                assertEquals(await input.inputValue(), "");
                const placeholder = await input.getAttribute("placeholder");
                assert(
                    Boolean(placeholder && placeholder.includes("替换")),
                    "Placeholder should prompt replacement instead of exposing uploaded source",
                );
                assert(
                    await applyBtn.isDisabled(),
                    "Apply button should be disabled when input is empty",
                );

                await input.press("Enter");
                assertEquals(
                    (await prefs()).backgroundImage,
                    source,
                    "Submitting empty draft via Enter must preserve current uploaded wallpaper",
                );

                await page.reload();
                await input.waitFor();
                assertEquals(
                    await input.inputValue(),
                    "",
                    "Uploaded source path must remain hidden after reload",
                );
                const reloadPlaceholder = await input.getAttribute(
                    "placeholder",
                );
                assert(
                    Boolean(
                        reloadPlaceholder && reloadPlaceholder.includes("替换"),
                    ),
                    "Placeholder must continue prompting replacement after reload",
                );
                assert(
                    await applyBtn.isDisabled(),
                    "Apply button must remain disabled after reload while input is empty",
                );

                if (focalX === 0.2) {
                    left = source;
                    const remote = "https://images.unsplash.com/photo-custom";
                    await input.fill(remote);
                    assert(
                        !await applyBtn.isDisabled(),
                        "Apply button should enable when new remote source is drafted",
                    );
                    await input.press("Enter");
                    await waitCurrent(remote);
                    assertEquals((await prefs()).backgroundImage, remote);
                    assertEquals(await input.inputValue(), remote);
                    assert(
                        await applyBtn.isDisabled(),
                        "Apply button should be disabled when input matches current remote source",
                    );

                    const gradient =
                        "linear-gradient(135deg, #102030, #405060)";
                    await input.fill(gradient);
                    assert(
                        !await applyBtn.isDisabled(),
                        "Apply button should enable when new gradient source is drafted",
                    );
                    await input.press("Enter");
                    await waitCurrent(gradient);
                    assertEquals((await prefs()).backgroundImage, gradient);
                    assertEquals(await input.inputValue(), gradient);
                    assert(
                        await applyBtn.isDisabled(),
                        "Apply button should be disabled when input matches current gradient source",
                    );

                    const leftId = source.split("/").pop()!;
                    await page.getByTestId(`wallpaper-menu-trigger-${leftId}`)
                        .click();
                    await page.getByTestId("wallpaper-menu-set-current")
                        .click();
                    await waitCurrent(source);
                    assertEquals(await input.inputValue(), "");
                    assert(await applyBtn.isDisabled());
                } else {
                    right = source;
                }
                await page.getByTestId("wallpaper-current-adjust-focal-btn")
                    .click();
                const desktop = page.getByTestId("wallpaper-preview-desktop");
                await desktop.waitFor();
                const box = await desktop.boundingBox();
                assert(box);
                await desktop.click({
                    position: { x: box.width * focalX, y: box.height * 0.5 },
                });
                await subjectVisible(
                    page,
                    '[data-testid="wallpaper-preview-mobile"]',
                );
                await page.setViewportSize({ width: 390, height: 844 });
                await subjectVisible(
                    page,
                    '[data-testid="wallpaper-preview-mobile"]',
                );
                const savedResponse = page.waitForResponse((r) =>
                    r.request().method() === "PATCH" && r.url().endsWith(source)
                );
                await page.getByTestId("wallpaper-preview-save-btn").click();
                const saved = await savedResponse;
                assertEquals(saved.status(), 200, await saved.text());
                await page.getByTestId("wallpaper-preview-dialog").waitFor({
                    state: "hidden",
                });
                const composition =
                    (await prefs()).wallpaperPresentations[source].composition;
                assert(Math.abs(composition.focalX - focalX) < 0.015);
                await page.reload();
                await page.getByTestId("wallpaper-current-badge").waitFor();
                assertEquals(
                    (await prefs()).wallpaperPresentations[source].composition,
                    composition,
                );
                await page.goto(origin + "/");
                await page.getByTestId("home-wallpaper-surface-image")
                    .waitFor();
                await subjectVisible(
                    page,
                    '[data-testid="home-wallpaper-surface-image"]',
                );
                await page.setViewportSize({ width: 1440, height: 900 });
                await page.goto(origin + "/settings/appearance");
                await page.getByTestId("wallpaper-input").waitFor();
            }
        },
    );
    await t.step(
        "motion presets cover focal extremes without exposing canvas edges",
        async () => {
            const original = (await prefs()).wallpaperPresentations;
            await page.emulateMedia({ reducedMotion: "no-preference" });
            for (const motion of ["drift", "zoom"] as const) {
                for (const softness of ["none", "hazy"] as const) {
                    for (const focalX of [0, 0.5, 1]) {
                        for (const focalY of [0, 0.5, 1]) {
                            const result = await page.evaluate(
                                async (
                                    {
                                        source,
                                        records,
                                        motion,
                                        softness,
                                        focalX,
                                        focalY,
                                    },
                                ) => {
                                    const response = await fetch(
                                        "/api/preferences",
                                        {
                                            method: "PATCH",
                                            headers: {
                                                "Content-Type":
                                                    "application/json",
                                            },
                                            body: JSON.stringify({
                                                wallpaperPresentations: {
                                                    ...records,
                                                    [source]: {
                                                        ...records[source],
                                                        composition: {
                                                            focalX,
                                                            focalY,
                                                        },
                                                        softness,
                                                        motion,
                                                        motionLevel:
                                                            "pronounced",
                                                    },
                                                },
                                            }),
                                        },
                                    );
                                    return {
                                        status: response.status,
                                        body: await response.text(),
                                    };
                                },
                                {
                                    source: right,
                                    records: original,
                                    motion,
                                    softness,
                                    focalX,
                                    focalY,
                                },
                            );
                            assertEquals(result.status, 200, result.body);
                            await page.goto(origin + "/");
                            const surface = page.getByTestId(
                                "home-wallpaper-surface",
                            );
                            await surface.waitFor();
                            await page.waitForFunction(
                                (expected) =>
                                    document.querySelector(
                                        '[data-testid="home-wallpaper-surface"]',
                                    )?.getAttribute("data-motion") === expected,
                                motion,
                            );
                            for (const width of [390, 768, 1440]) {
                                await page.setViewportSize({
                                    width,
                                    height: width === 390
                                        ? 844
                                        : width === 768
                                        ? 1024
                                        : 900,
                                });
                                const coverage = await surface.evaluate(
                                    async (element) => {
                                        const image = element.querySelector(
                                            ".wallpaper-surface__image",
                                        )!;
                                        const animation =
                                            image.getAnimations()[0];
                                        animation.pause();
                                        const duration = Number(
                                            animation.effect!.getTiming()
                                                .duration,
                                        );
                                        const viewport = element
                                            .getBoundingClientRect();
                                        const failures = [];
                                        for (
                                            const phase of [
                                                0,
                                                0.25,
                                                0.33,
                                                0.5,
                                                0.66,
                                                0.75,
                                                0.999,
                                            ]
                                        ) {
                                            animation.currentTime = duration *
                                                phase;
                                            await new Promise<void>((resolve) =>
                                                requestAnimationFrame(() =>
                                                    resolve()
                                                )
                                            );
                                            const box = image
                                                .getBoundingClientRect();
                                            const filter =
                                                getComputedStyle(image).filter;
                                            const blur = Number(
                                                /blur\(([\d.]+)px\)/.exec(
                                                    filter,
                                                )?.[1] ?? 0,
                                            );
                                            const matrix = new DOMMatrix(
                                                getComputedStyle(image)
                                                    .transform,
                                            );
                                            const guard = 3 * blur * matrix.a;
                                            if (
                                                box.left + guard >
                                                    viewport.left + 0.1 ||
                                                box.top + guard >
                                                    viewport.top + 0.1 ||
                                                box.right - guard <
                                                    viewport.right - 0.1 ||
                                                box.bottom - guard <
                                                    viewport.bottom - 0.1
                                            ) {
                                                failures.push({
                                                    phase,
                                                    guard,
                                                    left: box.left,
                                                    right: box.right,
                                                    top: box.top,
                                                    bottom: box.bottom,
                                                });
                                            }
                                        }
                                        return failures;
                                    },
                                );
                                assertEquals(
                                    coverage,
                                    [],
                                    JSON.stringify({
                                        motion,
                                        softness,
                                        focalX,
                                        focalY,
                                        width,
                                    }),
                                );
                            }
                        }
                    }
                }
            }
            await page.evaluate(async (wallpaperPresentations) => {
                const r = await fetch("/api/preferences", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ wallpaperPresentations }),
                });
                if (!r.ok) throw new Error(await r.text());
            }, original);
            await page.emulateMedia({ reducedMotion: "reduce" });
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.goto(origin + "/settings/appearance");
            await page.getByTestId("wallpaper-input").waitFor();
        },
    );
    await t.step(
        "fresh device login restores cloud selection and asset-specific composition",
        async () => {
            const device = await browser.newContext({
                viewport: { width: 390, height: 844 },
            });
            const mobile = await device.newPage();
            await signIn(mobile);
            await mobile.getByTestId("home-wallpaper-surface-image").waitFor();
            await waitCurrent(right, mobile);
            assert(
                Math.abs(
                    (await prefs(mobile)).wallpaperPresentations[right]
                        .composition.focalX -
                        0.8,
                ) < 0.015,
            );
            await subjectVisible(
                mobile,
                '[data-testid="home-wallpaper-surface-image"]',
            );
            await device.close();
        },
    );
    await t.step(
        "history primary action previews, menu selects, clear does not delete",
        async () => {
            const leftId = left.split("/").pop()!;
            await page.getByTestId(`wallpaper-card-preview-btn-${leftId}`)
                .click();
            await page.getByTestId("wallpaper-preview-dialog").waitFor();
            assertEquals((await prefs()).backgroundImage, right);
            await page.getByTestId("wallpaper-preview-apply-btn").click();
            await waitCurrent(left);
            assert(
                Math.abs(
                    (await prefs()).wallpaperPresentations[left].composition
                        .focalX - 0.2,
                ) < 0.015,
            );
            await page.getByTestId("wallpaper-clear-btn").click();
            await waitCurrent(null);
            assertEquals(
                await page.getByTestId(`wallpaper-history-item-${leftId}`)
                    .count(),
                1,
            );
            await page.getByTestId(`wallpaper-menu-trigger-${leftId}`).click();
            await page.getByTestId("wallpaper-menu-set-current").click();
            await waitCurrent(left);
        },
    );
    await t.step(
        "delete failure preserves selection; non-current and current deletion have distinct consequences",
        async () => {
            const leftId = left.split("/").pop()!;
            const rightId = right.split("/").pop()!;
            await page.route(`**/api/wallpaper/${leftId}`, async (route) => {
                if (route.request().method() === "DELETE") {
                    await route.fulfill({
                        status: 500,
                        contentType: "application/json",
                        body: JSON.stringify({
                            success: false,
                            error: "删除失败",
                        }),
                    });
                } else await route.continue();
            });
            await page.getByTestId(`wallpaper-menu-trigger-${leftId}`).click();
            await page.getByTestId("wallpaper-menu-delete").click();
            assertStringIncludes(
                await page.getByTestId("wallpaper-delete-dialog").innerText(),
                "恢复默认背景",
            );
            await page.getByTestId("wallpaper-delete-confirm-btn").click();
            await page.getByTestId("wallpaper-toast").waitFor();
            assertEquals(
                await page.getByTestId(`wallpaper-history-item-${leftId}`)
                    .count(),
                1,
            );
            assertEquals((await prefs()).backgroundImage, left);
            await page.getByTestId("wallpaper-delete-cancel-btn").click();
            await page.unroute(`**/api/wallpaper/${leftId}`);
            await page.getByTestId(`wallpaper-menu-trigger-${rightId}`).click();
            await page.getByTestId("wallpaper-menu-delete").click();
            assertStringIncludes(
                await page.getByTestId("wallpaper-delete-dialog").innerText(),
                "无法撤销",
            );
            await page.getByTestId("wallpaper-delete-confirm-btn").click();
            await page.getByTestId(`wallpaper-history-item-${rightId}`).waitFor(
                { state: "detached" },
            );
            assertEquals((await prefs()).backgroundImage, left);
            await page.getByTestId(`wallpaper-menu-trigger-${leftId}`).click();
            await page.getByTestId("wallpaper-menu-delete").click();
            await page.getByTestId("wallpaper-delete-confirm-btn").click();
            await page.getByTestId(`wallpaper-history-item-${leftId}`).waitFor({
                state: "detached",
            });
            await waitCurrent(null);
            assertEquals(
                (await prefs()).wallpaperPresentations[left],
                undefined,
            );
            await page.goto(origin + "/");
            assertEquals(
                await page.getByTestId("home-wallpaper-surface").getAttribute(
                    "data-wallpaper-image",
                ),
                null,
            );
            await page.goto(origin + "/settings/appearance");
        },
    );
    await t.step(
        "URL draft does not PATCH; failed sync recovers and rapid changes retain the latest value",
        async () => {
            const patchResponses: number[] = [];
            page.on("response", (response) => {
                if (
                    response.url().endsWith("/api/preferences") &&
                    response.request().method() === "PATCH"
                ) patchResponses.push(response.status());
            });
            const input = page.getByTestId("wallpaper-input");
            await input.fill("https://");
            await input.pressSequentially("example.com/test.png", { delay: 5 });
            assertEquals(patchResponses, []);
            await page.getByTestId("wallpaper-apply-btn").click();
            await waitCurrent("https://example.com/test.png");
            let fail = true;
            const held = Promise.withResolvers<void>();
            const release = Promise.withResolvers<void>();
            let holdNext = true;
            await page.route("**/api/preferences", async (route) => {
                if (route.request().method() === "PATCH" && fail) {
                    fail = false;
                    await route.fulfill({
                        status: 503,
                        contentType: "application/json",
                        body: JSON.stringify({
                            success: false,
                            error: "暂时无法同步",
                        }),
                    });
                } else {
                    if (route.request().method() === "PATCH" && holdNext) {
                        holdNext = false;
                        held.resolve();
                        await release.promise;
                    }
                    await route.continue();
                }
            });
            await input.fill("linear-gradient(90deg, #102030, #405060)");
            await page.getByTestId("wallpaper-apply-btn").click();
            await page.locator(".sync-failed-badge").waitFor();
            const theme = page.locator('button[aria-label^="当前主题："]');
            await theme.click();
            await held.promise;
            await theme.click();
            release.resolve();
            await waitCurrent("linear-gradient(90deg, #102030, #405060)");
            await page.locator(".sync-failed-badge").waitFor({
                state: "detached",
            });
            await page.waitForFunction(async () => {
                const result = await (await fetch("/api/preferences")).json();
                const label = document.querySelector(
                    'button[aria-label^="当前主题："]',
                )?.getAttribute("aria-label");
                return label?.startsWith(`当前主题：${result.data.theme}，`);
            });
            assert(!patchResponses.includes(400));
            await page.unroute("**/api/preferences");
        },
    );
    await t.step("reduced-motion disables background animations", async () => {
        await page.goto(origin + "/");
        assertEquals(
            await page.locator(".wallpaper-surface__image").evaluate((el) =>
                getComputedStyle(el).animationName
            ),
            "none",
        );
        assertEquals(await page.locator(".wallpaper__ripple").count(), 0);
    });
    await t.step(
        "anonymous gradient and local upload survive reload without touching cloud preferences",
        async () => {
            const guestContext = await browser.newContext();
            const cloudBefore = await prefs();
            const guest = await guestContext.newPage();
            await guest.goto(origin + "/settings/appearance");
            await guest.getByTestId("wallpaper-guest-notice").waitFor();
            const gradient = "linear-gradient(135deg, #204060, #80a0c0)";
            await guest.getByTestId("wallpaper-input").fill(gradient);
            await guest.getByTestId("wallpaper-apply-btn").click();
            await guest.getByTestId("wallpaper-toast").waitFor();
            await guest.reload();
            await guest.waitForFunction(
                (value) =>
                    (document.querySelector(
                        '[data-testid="wallpaper-input"]',
                    ) as HTMLInputElement)?.value === value,
                gradient,
            );
            await guest.getByTestId("wallpaper-file-input").setInputFiles(
                `${files}/subject-0.2.png`,
            );
            await guest.getByTestId("wallpaper-toast").filter({
                hasText: "已上传",
            }).waitFor();
            await guest.reload();
            await guest.getByTestId("wallpaper-current-adjust-focal-btn")
                .waitFor();
            await guest.goto(origin + "/");
            await guest.getByTestId("home-wallpaper-surface-image").waitFor();
            assertStringIncludes(
                await guest.getByTestId("home-wallpaper-surface-image")
                    .evaluate((el) => getComputedStyle(el).backgroundImage),
                "data:image/png;base64,",
            );
            assertEquals(await prefs(), cloudBefore);
            await guestContext.close();
        },
    );
    await t.step(
        "preset sliders respond to keyboard Arrow, Home and End with semantic aria values and style updates",
        async () => {
            await page.emulateMedia({ reducedMotion: "no-preference" });
            await page.goto(origin + "/settings/appearance");
            await page.getByTestId("wallpaper-input").waitFor();

            const readability = page.getByTestId(
                "wallpaper-readability-slider",
            );
            const readabilityThumb = readability.getByRole("slider");
            await readabilityThumb.focus();

            // Test Home -> 0 ("清透 · 12%")
            await readabilityThumb.press("Home");
            assertEquals(
                await readabilityThumb.getAttribute("aria-valuenow"),
                "0",
            );
            assertEquals(
                await readabilityThumb.getAttribute("aria-valuetext"),
                "清透 · 12%",
            );
            assertEquals(
                await page.getByTestId("wallpaper-current-preview").evaluate((
                    el,
                ) => el.style.getPropertyValue("--wallpaper-mask")),
                "0.12",
            );

            // Test End -> 3 ("专注 · 48%")
            await readabilityThumb.press("End");
            assertEquals(
                await readabilityThumb.getAttribute("aria-valuenow"),
                "3",
            );
            assertEquals(
                await readabilityThumb.getAttribute("aria-valuetext"),
                "专注 · 48%",
            );
            assertEquals(
                await page.getByTestId("wallpaper-current-preview").evaluate((
                    el,
                ) => el.style.getPropertyValue("--wallpaper-mask")),
                "0.48",
            );

            // Test ArrowLeft -> 2 ("沉静 · 36%")
            await readabilityThumb.press("ArrowLeft");
            assertEquals(
                await readabilityThumb.getAttribute("aria-valuenow"),
                "2",
            );
            assertEquals(
                await readabilityThumb.getAttribute("aria-valuetext"),
                "沉静 · 36%",
            );
            assertEquals(
                await page.getByTestId("wallpaper-current-preview").evaluate((
                    el,
                ) => el.style.getPropertyValue("--wallpaper-mask")),
                "0.36",
            );

            // Test ArrowRight -> 3 ("专注 · 48%")
            await readabilityThumb.press("ArrowRight");
            assertEquals(
                await readabilityThumb.getAttribute("aria-valuenow"),
                "3",
            );
            assertEquals(
                await readabilityThumb.getAttribute("aria-valuetext"),
                "专注 · 48%",
            );
            assertEquals(
                await page.getByTestId("wallpaper-current-preview").evaluate((
                    el,
                ) => el.style.getPropertyValue("--wallpaper-mask")),
                "0.48",
            );

            // Softness slider keyboard tests
            const softness = page.getByTestId("wallpaper-softness-slider");
            const softnessThumb = softness.getByRole("slider");
            await softnessThumb.focus();

            await softnessThumb.press("Home");
            assertEquals(
                await softnessThumb.getAttribute("aria-valuenow"),
                "0",
            );
            assertEquals(
                await softnessThumb.getAttribute("aria-valuetext"),
                "无 · 0px",
            );
            let filter = await page.getByTestId("wallpaper-current-preview")
                .evaluate(
                    (el) => el.style.getPropertyValue("--wallpaper-filter"),
                );
            assertStringIncludes(filter, "blur(0px)");

            await softnessThumb.press("End");
            assertEquals(
                await softnessThumb.getAttribute("aria-valuenow"),
                "3",
            );
            assertEquals(
                await softnessThumb.getAttribute("aria-valuetext"),
                "朦胧 · 9px",
            );
            filter = await page.getByTestId("wallpaper-current-preview")
                .evaluate(
                    (el) => el.style.getPropertyValue("--wallpaper-filter"),
                );
            assertStringIncludes(filter, "blur(9px)");

            await softnessThumb.press("ArrowLeft");
            assertEquals(
                await softnessThumb.getAttribute("aria-valuenow"),
                "2",
            );
            assertEquals(
                await softnessThumb.getAttribute("aria-valuetext"),
                "柔和 · 5px",
            );
            filter = await page.getByTestId("wallpaper-current-preview")
                .evaluate(
                    (el) => el.style.getPropertyValue("--wallpaper-filter"),
                );
            assertStringIncludes(filter, "blur(5px)");

            // Enable ambient motion to test motion level slider keyboard navigation
            await page.getByTestId("wallpaper-motion-group").getByRole(
                "radio",
                {
                    name: "环境光",
                },
            ).click();
            const motionLevel = page.getByTestId(
                "wallpaper-motion-level-slider",
            );
            const motionLevelThumb = motionLevel.getByRole("slider");
            await motionLevelThumb.focus();

            await motionLevelThumb.press("Home");
            assertEquals(
                await motionLevelThumb.getAttribute("aria-valuenow"),
                "0",
            );
            assertEquals(
                await motionLevelThumb.getAttribute("aria-valuetext"),
                "轻微",
            );

            await motionLevelThumb.press("End");
            assertEquals(
                await motionLevelThumb.getAttribute("aria-valuenow"),
                "3",
            );
            assertEquals(
                await motionLevelThumb.getAttribute("aria-valuetext"),
                "明显",
            );

            await motionLevelThumb.press("ArrowLeft");
            assertEquals(
                await motionLevelThumb.getAttribute("aria-valuenow"),
                "2",
            );
            assertEquals(
                await motionLevelThumb.getAttribute("aria-valuetext"),
                "标准",
            );
        },
    );
    await t.step(
        "real pointer move preview updates thumbnail filter and mask with zero PATCH, and pointer release commits exactly one sync",
        async () => {
            let patchCount = 0;
            const patchHandler = (
                req: { method: () => string; url: () => string },
            ) => {
                if (
                    req.url().endsWith("/api/preferences") &&
                    req.method() === "PATCH"
                ) {
                    patchCount++;
                }
            };
            page.on("request", patchHandler);

            // 1. Softness slider pointer drag
            const softness = page.getByTestId("wallpaper-softness-slider");
            const softnessThumb = softness.getByRole("slider");
            const thumbBox = await softnessThumb.boundingBox();
            const sliderBox = await softness.boundingBox();
            assert(thumbBox && sliderBox);

            // Mouse down on thumb
            await page.mouse.move(
                thumbBox.x + thumbBox.width / 2,
                thumbBox.y + thumbBox.height / 2,
            );
            await page.mouse.down();

            // Drag to the far right (hazy: 9px)
            await page.mouse.move(
                sliderBox.x + sliderBox.width - 5,
                thumbBox.y + thumbBox.height / 2,
                { steps: 5 },
            );

            // Verify 0 API PATCH occurred during drag
            assertEquals(
                patchCount,
                0,
                "Dragging slider thumb must not trigger preferences PATCH",
            );

            // Verify preview filter updated during drag
            const filterWhileDragging = await page
                .getByTestId("wallpaper-current-preview")
                .evaluate((el) =>
                    el.style.getPropertyValue("--wallpaper-filter")
                );
            assertStringIncludes(
                filterWhileDragging,
                "blur(9px)",
                "Preview filter must reflect dragged softness value in real-time",
            );

            // Release pointer -> exactly 1 sync
            const patchPromise = page.waitForResponse(
                (r) =>
                    r.request().method() === "PATCH" &&
                    r.url().endsWith("/api/preferences"),
            );
            await page.mouse.up();
            const response = await patchPromise;
            assertEquals(response.status(), 200);
            assertEquals(
                patchCount,
                1,
                "Releasing pointer must trigger exactly one preferences PATCH",
            );

            const currentSrc = (await prefs()).backgroundImage;
            assert(currentSrc);
            assertEquals(
                (await prefs()).wallpaperPresentations[currentSrc].softness,
                "hazy",
            );

            // 2. Readability slider pointer drag
            patchCount = 0;
            const readability = page.getByTestId(
                "wallpaper-readability-slider",
            );
            const readabilityThumb = readability.getByRole("slider");
            const rThumbBox = await readabilityThumb.boundingBox();
            const rSliderBox = await readability.boundingBox();
            assert(rThumbBox && rSliderBox);

            await page.mouse.move(
                rThumbBox.x + rThumbBox.width / 2,
                rThumbBox.y + rThumbBox.height / 2,
            );
            await page.mouse.down();

            // Drag to far left (clear: 0.12)
            await page.mouse.move(
                rSliderBox.x + 5,
                rThumbBox.y + rThumbBox.height / 2,
                { steps: 5 },
            );

            assertEquals(
                patchCount,
                0,
                "Dragging readability slider must produce zero PATCH requests",
            );
            const maskWhileDragging = await page
                .getByTestId("wallpaper-current-preview")
                .evaluate((el) =>
                    el.style.getPropertyValue("--wallpaper-mask")
                );
            assertEquals(
                maskWhileDragging,
                "0.12",
                "Preview mask must reflect dragged readability value in real-time",
            );

            const patchPromise2 = page.waitForResponse(
                (r) =>
                    r.request().method() === "PATCH" &&
                    r.url().endsWith("/api/preferences"),
            );
            await page.mouse.up();
            const response2 = await patchPromise2;
            assertEquals(response2.status(), 200);
            assertEquals(
                patchCount,
                1,
                "Releasing pointer must commit exactly one sync",
            );
            assertEquals(
                (await prefs()).wallpaperPresentations[currentSrc].readability,
                "clear",
            );

            page.off("request", patchHandler);
        },
    );
    let uploadedSource = "";
    const remoteSource =
        "https://images.unsplash.com/photo-presentation-restore";
    const gradientSource = "linear-gradient(135deg, #223344, #556677)";

    await t.step(
        "per-wallpaper presentation restore across uploaded, remote, and gradient sources and reload",
        async () => {
            // 1. Upload fresh wallpaper and customize presentation
            uploadedSource = await upload(0.3);
            await waitCurrent(uploadedSource);

            const readability = page.getByTestId(
                "wallpaper-readability-slider",
            );
            const softness = page.getByTestId("wallpaper-softness-slider");
            const rThumb = readability.getByRole("slider");
            const sThumb = softness.getByRole("slider");

            // Uploaded: tone="mono", readability="quiet"(2), softness="soft"(2), motion="drift", motionLevel="pronounced"(3)
            await page.getByTestId("wallpaper-tone-group").getByRole("radio", {
                name: "黑白",
            }).click();
            await readability.locator(".settings-preset-slider__mark").filter({
                hasText: "沉静",
            }).click();
            await softness.locator(".settings-preset-slider__mark").filter({
                hasText: "柔和",
            }).click();
            await page.getByTestId("wallpaper-motion-group").getByRole(
                "radio",
                {
                    name: "漂移",
                },
            ).click();
            const motionLevel = page.getByTestId(
                "wallpaper-motion-level-slider",
            );
            const mThumb = motionLevel.getByRole("slider");
            await motionLevel.locator(".settings-preset-slider__mark").filter({
                hasText: "明显",
            }).click();

            await page.waitForFunction(async (src) => {
                const res = await (await fetch("/api/preferences")).json();
                const p = res.data.wallpaperPresentations[src];
                return p?.tone === "mono" && p?.readability === "quiet" &&
                    p?.softness === "soft" && p?.motion === "drift" &&
                    p?.motionLevel === "pronounced";
            }, uploadedSource);

            // 2. Set Remote wallpaper and customize presentation
            const input = page.getByTestId("wallpaper-input");
            await input.fill(remoteSource);
            await page.getByTestId("wallpaper-apply-btn").click();
            await waitCurrent(remoteSource);

            // Remote: tone="soft", readability="clear"(0), softness="subtle"(1), motion="zoom", motionLevel="subtle"(0)
            await page.getByTestId("wallpaper-tone-group").getByRole("radio", {
                name: "柔和",
            }).click();
            await readability.locator(".settings-preset-slider__mark").filter({
                hasText: "清透",
            }).click();
            await softness.locator(".settings-preset-slider__mark").filter({
                hasText: "轻柔",
            }).click();
            await page.getByTestId("wallpaper-motion-group").getByRole(
                "radio",
                {
                    name: "推近",
                },
            ).click();
            await motionLevel.locator(".settings-preset-slider__mark").filter({
                hasText: "轻微",
            }).click();

            await page.waitForFunction(async (src) => {
                const res = await (await fetch("/api/preferences")).json();
                const p = res.data.wallpaperPresentations[src];
                return p?.tone === "soft" && p?.readability === "clear" &&
                    p?.softness === "subtle" && p?.motion === "zoom" &&
                    p?.motionLevel === "subtle";
            }, remoteSource);

            // 3. Set Gradient wallpaper and customize presentation
            await input.fill(gradientSource);
            await page.getByTestId("wallpaper-apply-btn").click();
            await waitCurrent(gradientSource);

            // Gradient: tone="natural", readability="focus"(3), softness="none"(0), motion="ambient", motionLevel="standard"(2)
            await page.getByTestId("wallpaper-tone-group").getByRole("radio", {
                name: "原色",
            }).click();
            await readability.locator(".settings-preset-slider__mark").filter({
                hasText: "专注",
            }).click();
            await softness.locator(".settings-preset-slider__mark").filter({
                hasText: "无",
            }).click();
            await page.getByTestId("wallpaper-motion-group").getByRole(
                "radio",
                {
                    name: "环境光",
                },
            ).click();
            await motionLevel.locator(".settings-preset-slider__mark").filter({
                hasText: "标准",
            }).click();

            await page.waitForFunction(async (src) => {
                const res = await (await fetch("/api/preferences")).json();
                const p = res.data.wallpaperPresentations[src];
                return p?.tone === "natural" && p?.readability === "focus" &&
                    p?.softness === "none" && p?.motion === "ambient" &&
                    p?.motionLevel === "standard";
            }, gradientSource);

            // 4. Switch back to uploaded and verify restored state
            const uploadedId = uploadedSource.split("/").pop()!;
            await page.getByTestId(`wallpaper-menu-trigger-${uploadedId}`)
                .click();
            await page.getByTestId("wallpaper-menu-set-current").click();
            await waitCurrent(uploadedSource);

            assertEquals(
                await page.getByTestId("wallpaper-tone-group").getByRole(
                    "radio",
                    {
                        name: "黑白",
                    },
                ).getAttribute("aria-checked"),
                "true",
            );
            assertEquals(await rThumb.getAttribute("aria-valuenow"), "2");
            assertEquals(await sThumb.getAttribute("aria-valuenow"), "2");
            assertEquals(
                await page.getByTestId("wallpaper-motion-group").getByRole(
                    "radio",
                    {
                        name: "漂移",
                    },
                ).getAttribute("aria-checked"),
                "true",
            );
            assertEquals(await mThumb.getAttribute("aria-valuenow"), "3");
            assertEquals(
                await page.getByTestId("wallpaper-current-preview").evaluate(
                    (el) => el.style.getPropertyValue("--wallpaper-mask"),
                ),
                "0.36",
            );
            const filter = await page.getByTestId("wallpaper-current-preview")
                .evaluate((el) =>
                    el.style.getPropertyValue("--wallpaper-filter")
                );
            assertStringIncludes(filter, "blur(5px)");
            assertStringIncludes(filter, "grayscale(1)");

            // 5. Switch back to remote and verify restored state
            await input.fill(remoteSource);
            await page.getByTestId("wallpaper-apply-btn").click();
            await waitCurrent(remoteSource);

            assertEquals(
                await page.getByTestId("wallpaper-tone-group").getByRole(
                    "radio",
                    {
                        name: "柔和",
                    },
                ).getAttribute("aria-checked"),
                "true",
            );
            assertEquals(await rThumb.getAttribute("aria-valuenow"), "0");
            assertEquals(await sThumb.getAttribute("aria-valuenow"), "1");
            assertEquals(
                await page.getByTestId("wallpaper-motion-group").getByRole(
                    "radio",
                    {
                        name: "推近",
                    },
                ).getAttribute("aria-checked"),
                "true",
            );
            assertEquals(await mThumb.getAttribute("aria-valuenow"), "0");

            // 6. Switch back to gradient and verify restored state
            await input.fill(gradientSource);
            await page.getByTestId("wallpaper-apply-btn").click();
            await waitCurrent(gradientSource);

            assertEquals(
                await page.getByTestId("wallpaper-tone-group").getByRole(
                    "radio",
                    {
                        name: "原色",
                    },
                ).getAttribute("aria-checked"),
                "true",
            );
            assertEquals(await rThumb.getAttribute("aria-valuenow"), "3");
            assertEquals(await sThumb.getAttribute("aria-valuenow"), "0");
            assertEquals(
                await page.getByTestId("wallpaper-motion-group").getByRole(
                    "radio",
                    {
                        name: "环境光",
                    },
                ).getAttribute("aria-checked"),
                "true",
            );
            assertEquals(await mThumb.getAttribute("aria-valuenow"), "2");

            // 7. Reload and verify persistence
            await page.reload();
            await page.getByTestId("wallpaper-input").waitFor();

            assertEquals(
                await page.getByTestId("wallpaper-tone-group").getByRole(
                    "radio",
                    {
                        name: "原色",
                    },
                ).getAttribute("aria-checked"),
                "true",
            );
            assertEquals(await rThumb.getAttribute("aria-valuenow"), "3");
            assertEquals(await sThumb.getAttribute("aria-valuenow"), "0");
            assertEquals(
                await page.getByTestId("wallpaper-motion-group").getByRole(
                    "radio",
                    {
                        name: "环境光",
                    },
                ).getAttribute("aria-checked"),
                "true",
            );
            assertEquals(await mThumb.getAttribute("aria-valuenow"), "2");
        },
    );
    await t.step(
        "turning motion off preserves motion level, and clearing wallpaper restricts motion to off and ambient",
        async () => {
            // 1. Switch to uploaded wallpaper which has motion="drift", motionLevel="pronounced"(3)
            const uploadedId = uploadedSource.split("/").pop()!;
            await page.getByTestId(`wallpaper-menu-trigger-${uploadedId}`)
                .click();
            await page.getByTestId("wallpaper-menu-set-current").click();
            await waitCurrent(uploadedSource);

            // Turn motion off
            await page.getByTestId("wallpaper-motion-group").getByRole(
                "radio",
                {
                    name: "关闭",
                },
            ).click();
            await page.waitForFunction(async (src) => {
                const res = await (await fetch("/api/preferences")).json();
                return res.data.wallpaperPresentations[src]?.motion === "off";
            }, uploadedSource);

            assertEquals(
                await page.getByTestId("wallpaper-motion-group").getByRole(
                    "radio",
                    {
                        name: "关闭",
                    },
                ).getAttribute("aria-checked"),
                "true",
            );
            assertEquals(
                await page.getByTestId("wallpaper-motion-level-slider").count(),
                0,
                "Motion level slider must be detached when motion is off",
            );
            let p = await prefs();
            assertEquals(
                p.wallpaperPresentations[uploadedSource].motionLevel,
                "pronounced",
                "Turning motion off must preserve motion level in persisted preferences",
            );

            // Turn motion back to ambient
            await page.getByTestId("wallpaper-motion-group").getByRole(
                "radio",
                {
                    name: "环境光",
                },
            ).click();
            await page.waitForFunction(async (src) => {
                const res = await (await fetch("/api/preferences")).json();
                return res.data.wallpaperPresentations[src]?.motion ===
                    "ambient";
            }, uploadedSource);

            const mThumb = page
                .getByTestId("wallpaper-motion-level-slider")
                .getByRole("slider");
            assertEquals(await mThumb.getAttribute("aria-valuenow"), "3");
            assertEquals(await mThumb.getAttribute("aria-valuetext"), "明显");
            p = await prefs();
            assertEquals(
                p.wallpaperPresentations[uploadedSource].motion,
                "ambient",
            );
            assertEquals(
                p.wallpaperPresentations[uploadedSource].motionLevel,
                "pronounced",
            );

            // 2. Clear wallpaper -> no wallpaper state
            await page.getByTestId("wallpaper-clear-btn").click();
            await waitCurrent(null);

            assertEquals(
                await page.getByTestId("wallpaper-current-preview").count(),
                0,
                "Current preview must be detached when wallpaper is cleared",
            );
            assertEquals(
                await page.getByTestId("wallpaper-current-adjust-focal-btn")
                    .count(),
                0,
                "Adjust focal button must be detached when wallpaper is cleared",
            );
            assertEquals(
                await page.getByTestId("wallpaper-readability-slider")
                    .getAttribute(
                        "data-disabled",
                    ),
                "true",
            );
            assertEquals(
                await page.getByTestId("wallpaper-softness-slider")
                    .getAttribute(
                        "data-disabled",
                    ),
                "true",
            );

            // Motion group must only offer off and ambient
            const motionGroup = page.getByTestId("wallpaper-motion-group");
            assertEquals(
                await motionGroup.getByRole("radio", { name: "关闭" }).count(),
                1,
            );
            assertEquals(
                await motionGroup.getByRole("radio", { name: "环境光" })
                    .count(),
                1,
            );
            assertEquals(
                await motionGroup.getByRole("radio", { name: "漂移" }).count(),
                0,
                "Drift motion must not be available when no wallpaper is set",
            );
            assertEquals(
                await motionGroup.getByRole("radio", { name: "推近" }).count(),
                0,
                "Zoom motion must not be available when no wallpaper is set",
            );

            // Canvas ambient motion
            await motionGroup.getByRole("radio", { name: "环境光" }).click();
            await page.waitForFunction(async () => {
                const res = await (await fetch("/api/preferences")).json();
                return res.data.canvasMotion === "ambient";
            });

            const canvasMotionSlider = page.getByTestId(
                "wallpaper-motion-level-slider",
            );
            await canvasMotionSlider.locator(".settings-preset-slider__mark")
                .filter({
                    hasText: "轻微",
                }).click();
            await page.waitForFunction(async () => {
                const res = await (await fetch("/api/preferences")).json();
                return res.data.canvasMotionLevel === "subtle";
            });
            p = await prefs();
            assertEquals(p.canvasMotion, "ambient");
            assertEquals(p.canvasMotionLevel, "subtle");

            // Turn canvas motion off and verify level is preserved
            await motionGroup.getByRole("radio", { name: "关闭" }).click();
            await page.waitForFunction(async () => {
                const res = await (await fetch("/api/preferences")).json();
                return res.data.canvasMotion === "off";
            });
            assertEquals(await canvasMotionSlider.count(), 0);
            p = await prefs();
            assertEquals(p.canvasMotion, "off");
            assertEquals(p.canvasMotionLevel, "subtle");
        },
    );
    await t.step(
        "focal composition dialog forces runtime motion off while preserving persisted drift or zoom",
        async () => {
            // 1. Switch back to uploaded wallpaper
            const uploadedId = uploadedSource.split("/").pop()!;
            await page.getByTestId(`wallpaper-menu-trigger-${uploadedId}`)
                .click();
            await page.getByTestId("wallpaper-menu-set-current").click();
            await waitCurrent(uploadedSource);

            // 2. Set motion to drift
            await page.getByTestId("wallpaper-motion-group").getByRole(
                "radio",
                {
                    name: "漂移",
                },
            ).click();
            await page.waitForFunction(async (src) => {
                const res = await (await fetch("/api/preferences")).json();
                return res.data.wallpaperPresentations[src]?.motion === "drift";
            }, uploadedSource);

            // Home page renders drift motion
            await page.goto(origin + "/");
            await page.waitForFunction(
                () =>
                    document
                        .querySelector('[data-testid="home-wallpaper-surface"]')
                        ?.getAttribute("data-motion") === "drift",
            );
            assertEquals(
                await page.getByTestId("home-wallpaper-surface").getAttribute(
                    "data-motion",
                ),
                "drift",
            );

            // Open focal composition dialog
            await page.goto(origin + "/settings/appearance");
            await page.getByTestId("wallpaper-current-adjust-focal-btn")
                .waitFor();
            await page.getByTestId("wallpaper-current-adjust-focal-btn")
                .click();
            await page.getByTestId("wallpaper-preview-dialog").waitFor();

            // Desktop and mobile preview surfaces must have runtime data-motion="off"
            const desktopSurface = page
                .getByTestId("wallpaper-preview-desktop")
                .locator(".wallpaper-surface");
            assertEquals(
                await desktopSurface.getAttribute("data-motion"),
                "off",
                "Desktop preview in focal dialog must force runtime motion to off",
            );
            const mobileSurface = page
                .getByTestId("wallpaper-preview-mobile")
                .locator(".wallpaper-surface");
            assertEquals(
                await mobileSurface.getAttribute("data-motion"),
                "off",
                "Mobile preview in focal dialog must force runtime motion to off",
            );

            // Adjust focal point and save
            const desktop = page.getByTestId("wallpaper-preview-desktop");
            const box = await desktop.boundingBox();
            assert(box);
            await desktop.click({
                position: { x: box.width * 0.7, y: box.height * 0.4 },
            });
            const savedResponse = page.waitForResponse(
                (r) =>
                    r.request().method() === "PATCH" &&
                    r.url().endsWith(uploadedSource),
            );
            await page.getByTestId("wallpaper-preview-save-btn").click();
            await savedResponse;
            await page.getByTestId("wallpaper-preview-dialog").waitFor({
                state: "hidden",
            });

            // Persisted motion must remain drift
            const pres = (await prefs()).wallpaperPresentations[uploadedSource];
            assertEquals(
                pres.motion,
                "drift",
                "Persisted motion must remain drift after saving focal adjustment",
            );
            assert(
                Math.abs(pres.composition.focalX - 0.7) < 0.05,
                "Updated focal point must be persisted",
            );

            // Home page continues rendering drift motion
            await page.goto(origin + "/");
            await page.waitForFunction(
                () =>
                    document
                        .querySelector('[data-testid="home-wallpaper-surface"]')
                        ?.getAttribute("data-motion") === "drift",
            );
            assertEquals(
                await page.getByTestId("home-wallpaper-surface").getAttribute(
                    "data-motion",
                ),
                "drift",
            );
        },
    );
    await t.step(
        "real-page mono transparent-gradient regression verifies neutral sRGB channels and neutral ambient color",
        async () => {
            await page.goto(origin + "/settings/appearance");
            await page.getByTestId("wallpaper-input").waitFor();

            const transparentGradient =
                "linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0))";
            const input = page.getByTestId("wallpaper-input");
            await input.fill(transparentGradient);
            await page.getByTestId("wallpaper-apply-btn").click();
            await waitCurrent(transparentGradient);

            await page.getByTestId("wallpaper-tone-group").getByRole("radio", {
                name: "黑白",
            }).click();
            await page.getByTestId("wallpaper-motion-group").getByRole(
                "radio",
                {
                    name: "关闭",
                },
            ).click();
            await page.waitForFunction(async (src) => {
                const res = await (await fetch("/api/preferences")).json();
                const p = res.data.wallpaperPresentations[src];
                return p?.tone === "mono" && p?.motion === "off";
            }, transparentGradient);

            await page.goto(origin + "/");
            const surface = page.getByTestId("home-wallpaper-surface");
            await page.waitForFunction(
                () =>
                    document
                        .querySelector('[data-testid="home-wallpaper-surface"]')
                        ?.getAttribute("data-tone") === "mono",
            );
            assertEquals(await surface.getAttribute("data-tone"), "mono");
            assertEquals(await surface.getAttribute("data-motion"), "off");

            const parseRgb = (color: string) => {
                const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
                assert(match, `Invalid rgb color string: ${color}`);
                return {
                    r: Number(match[1]),
                    g: Number(match[2]),
                    b: Number(match[3]),
                };
            };

            // Light theme root background and mask
            const lightBg = await surface.evaluate((el) =>
                getComputedStyle(el).backgroundColor
            );
            const lRgb = parseRgb(lightBg);
            assertEquals(
                lRgb.r,
                lRgb.g,
                "Mono background red and green channels must be equal",
            );
            assertEquals(
                lRgb.g,
                lRgb.b,
                "Mono background green and blue channels must be equal",
            );

            const lightBgImg = await surface.evaluate((el) =>
                getComputedStyle(el).backgroundImage
            );
            assertEquals(
                lightBgImg,
                "none",
                "Mono transparent-gradient root background-image must be none",
            );

            const lightMaskBg = await page.locator(".wallpaper-surface__mask")
                .evaluate((el) => getComputedStyle(el).backgroundColor);
            const lmRgb = parseRgb(lightMaskBg);
            assertEquals(
                lmRgb.r,
                lmRgb.g,
                "Mask red and green channels must be equal",
            );
            assertEquals(
                lmRgb.g,
                lmRgb.b,
                "Mask green and blue channels must be equal",
            );

            // Dark theme
            await page.evaluate(() =>
                document.documentElement.setAttribute("data-theme", "dark")
            );
            const darkBg = await surface.evaluate((el) =>
                getComputedStyle(el).backgroundColor
            );
            const dRgb = parseRgb(darkBg);
            assertEquals(
                dRgb.r,
                dRgb.g,
                "Dark mono background red and green channels must be equal",
            );
            assertEquals(
                dRgb.g,
                dRgb.b,
                "Dark mono background green and blue channels must be equal",
            );

            const darkMaskBg = await page.locator(".wallpaper-surface__mask")
                .evaluate((el) => getComputedStyle(el).backgroundColor);
            const dmRgb = parseRgb(darkMaskBg);
            assertEquals(
                dmRgb.r,
                dmRgb.g,
                "Dark mask red and green channels must be equal",
            );
            assertEquals(
                dmRgb.g,
                dmRgb.b,
                "Dark mask green and blue channels must be equal",
            );
            await page.evaluate(() =>
                document.documentElement.removeAttribute("data-theme")
            );

            // Ambient motion with mono
            await page.goto(origin + "/settings/appearance");
            await page.getByTestId("wallpaper-motion-group").getByRole(
                "radio",
                {
                    name: "环境光",
                },
            ).click();
            await page.waitForFunction(async (src) => {
                const res = await (await fetch("/api/preferences")).json();
                return res.data.wallpaperPresentations[src]?.motion ===
                    "ambient";
            }, transparentGradient);

            await page.goto(origin + "/");
            await page.waitForFunction(() => {
                const el = document.querySelector(
                    '[data-testid="home-wallpaper-surface"]',
                );
                return (
                    el?.getAttribute("data-tone") === "mono" &&
                    el?.getAttribute("data-motion") === "ambient"
                );
            });
            assertEquals(await surface.getAttribute("data-motion"), "ambient");
            assertEquals(await surface.getAttribute("data-tone"), "mono");
            const ambBg = await surface.evaluate((el) =>
                getComputedStyle(el).backgroundColor
            );
            const ambRgb = parseRgb(ambBg);
            assertEquals(ambRgb.r, ambRgb.g);
            assertEquals(ambRgb.g, ambRgb.b);
            assertEquals(
                await surface.evaluate((el) =>
                    getComputedStyle(el).backgroundImage
                ),
                "none",
            );
            const ambColor = await surface.evaluate((el) =>
                el.style.getPropertyValue("--wallpaper-ambient-color")
            );
            assertStringIncludes(ambColor, "neutral");
        },
    );
    assertEquals(errors, []);
});
