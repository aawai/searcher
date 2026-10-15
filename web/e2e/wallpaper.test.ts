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
import {
    GLOBAL_MOTION_BUDGET,
    WALLPAPER_DRIFT_PARAMS,
    WALLPAPER_READABILITY_MASKS,
    WALLPAPER_ZOOM_PARAMS,
    type WallpaperMotionLevel,
} from "../../src/shared/wallpaper-presentation.ts";
import {
    analyzeAmbientRecurrence,
    WALLPAPER_TEMPORAL_BUDGET,
} from "../../src/shared/wallpaper-temporal.ts";

Deno.test("production wallpaper composition, lifecycle and sync E2E", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({ prefix: "searcher_wallpaper_e2e_" });
    cleanup.defer(() => Deno.remove(files, { recursive: true }));
    const evidenceDir = "artifacts/wallpaper-motion";
    await Deno.mkdir(evidenceDir, { recursive: true });
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
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        reducedMotion: "reduce",
    });
    await context.tracing.start({ screenshots: true, snapshots: true });
    cleanup.defer(async () => {
        try {
            await context.tracing.stop({
                path: `${evidenceDir}/trace.zip`,
            });
        } catch {
            // Context may be already closed
        }
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
    function toBase64(bytes: Uint8Array): string {
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(
                ...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)),
            );
        }
        return btoa(binary);
    }
    async function stableScreenshot(
        selector = '[data-testid="home-wallpaper-surface"]',
    ): Promise<Uint8Array> {
        return await page.locator(selector).screenshot();
    }
    async function ambientPhase(
        phase: number,
        selector = "home-wallpaper-surface",
    ) {
        const progress = await page.getByTestId(selector).evaluate(
            async (el, phase) => {
                const progress: number[] = [];
                for (const name of ["a", "b"]) {
                    const field = el.querySelector(
                        ".wallpaper__ambient-field-" + name,
                    )!;
                    const animation = field.getAnimations()[0];
                    if (!animation?.effect) {
                        throw new Error("Missing ambient animation");
                    }
                    const timing = animation.effect.getTiming();
                    animation.pause();
                    // Use the second iteration to avoid negative local time for B's delay.
                    animation.currentTime =
                        (1 + phase) * Number(timing.duration) +
                        Number(timing.delay);
                    await animation.ready;
                    progress.push(
                        animation.effect.getComputedTiming().progress!,
                    );
                }
                const { promise, resolve } = Promise.withResolvers<void>();
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => resolve())
                );
                await promise;
                return progress;
            },
            phase,
        );
        for (const actual of progress) {
            assert(
                Math.abs(actual - phase) < 1e-6,
                `Expected phase ${phase}, got ${actual}`,
            );
        }
    }
    async function framePixels(bytes: Uint8Array) {
        return await page.evaluate(async (encoded) => {
            const image = new Image();
            image.src = "data:image/png;base64," + encoded;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(image, 0, 0);
            const { data } = ctx.getImageData(0, 0, image.width, image.height);
            let luminance = 0;
            let maximum = 0;
            const roi: number[] = [];
            // Frozen Phase 0B ROI: top edge, x=0.42 (21/50), w=1/18, h=4/45.
            const left = Math.round(image.width * 21 / 50);
            const right = Math.round(image.width * (21 / 50 + 1 / 18));
            const bottom = Math.round(image.height * 4 / 45);
            for (let y = 0; y < image.height; y++) {
                for (let x = 0; x < image.width; x++) {
                    const i = (y * image.width + x) * 4;
                    luminance += .2126 * data[i] + .7152 * data[i + 1] +
                        .0722 * data[i + 2];
                    maximum = Math.max(maximum, data[i] / 255);
                    if (y < bottom && x >= left && x < right) {
                        roi.push(data[i], data[i + 1], data[i + 2]);
                    }
                }
            }
            return {
                luminance: luminance / (image.width * image.height),
                maximum,
                roi,
            };
        }, toBase64(bytes));
    }
    async function renderMotion(
        level: WallpaperMotionLevel,
        readability: "clear" | "balanced" = "balanced",
        targetSource?: string,
    ) {
        const current = await prefs();
        const source = targetSource ?? current.backgroundImage;
        assert(source);
        const response = await context.request.patch(
            origin + "/api/preferences",
            {
                headers: { Origin: origin },
                data: {
                    theme: "light",
                    style: "zen",
                    accent: "blue",
                    backgroundImage: source,
                    wallpaperPresentations: {
                        ...current.wallpaperPresentations,
                        [source]: {
                            ...current.wallpaperPresentations[source],
                            motion: "ambient",
                            motionLevel: level,
                            readability,
                            softness: "none",
                            tone: "natural",
                        },
                    },
                },
            },
        );
        assertEquals(response.status(), 200);
        await page.goto(origin + "/");
        await page.waitForFunction(({ level, source }) => {
            const root = document.querySelector(
                '[data-testid="home-wallpaper-surface"]',
            );
            const image = root?.querySelector(".wallpaper-surface__image");
            return root?.getAttribute("data-motion-level") === level && image &&
                getComputedStyle(image).backgroundImage.includes(source);
        }, { level, source });
        await page.evaluate(async () => {
            await Promise.all(
                document.getAnimations().filter((a) =>
                    a instanceof CSSTransition
                ).map((a) => a.finished),
            );
            const image = new Image();
            const css = getComputedStyle(
                document.querySelector(".wallpaper-surface__image")!,
            ).backgroundImage;
            image.src = css.slice(5, -2);
            await image.decode();
        });
    }
    async function subjectVisible(target: Page, selector: string) {
        const bytes = await target.locator(selector).screenshot();
        const base64 = toBase64(bytes);
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
    await t.step(
        "reduced-motion disables background animations and displays settings notice",
        async () => {
            await page.goto(origin + "/");
            assertEquals(
                await page.locator(".wallpaper-surface__image").evaluate((el) =>
                    getComputedStyle(el).animationName
                ),
                "none",
            );
            // Navigate to Settings while motion is non-off and verify reduced motion notice
            await page.goto(origin + "/settings/appearance");
            await page.getByTestId("wallpaper-motion-group").getByRole(
                "radio",
                {
                    name: "环境光",
                },
            ).click();
            const notice = page.getByTestId("wallpaper-reduced-motion-notice");
            await notice.waitFor();
            const text = await notice.textContent();
            assert(
                text?.includes("系统已启用“减少动态效果”，动态预览已静止。"),
                `Expected notice to explain reduced motion, got: ${text}`,
            );
            await page.getByTestId("wallpaper-motion-group").getByRole(
                "radio",
                {
                    name: "关闭",
                },
            ).click();
        },
    );
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

            // Test Home -> 0 ("无 · 0%")
            await readabilityThumb.press("Home");
            assertEquals(
                await readabilityThumb.getAttribute("aria-valuenow"),
                "0",
            );
            assertEquals(
                await readabilityThumb.getAttribute("aria-valuetext"),
                "无 · 0%",
            );
            assertEquals(
                await page.getByTestId("wallpaper-current-preview").evaluate((
                    el,
                ) => el.style.getPropertyValue("--wallpaper-mask")),
                "0",
            );

            // Test ArrowRight -> 1 ("清透 · 12%")
            await readabilityThumb.press("ArrowRight");
            assertEquals(
                await readabilityThumb.getAttribute("aria-valuenow"),
                "1",
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

            // Test End -> 4 ("专注 · 48%")
            await readabilityThumb.press("End");
            assertEquals(
                await readabilityThumb.getAttribute("aria-valuenow"),
                "4",
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

            // Test ArrowLeft -> 3 ("沉静 · 36%")
            await readabilityThumb.press("ArrowLeft");
            assertEquals(
                await readabilityThumb.getAttribute("aria-valuenow"),
                "3",
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

            // Verify canonical mark-to-thumb center geometry (<= 1.0 CSS px)
            const sliderGeometries = await page.evaluate(() => {
                const sliders = Array.from(
                    document.querySelectorAll(".settings-preset-slider"),
                );
                return sliders.map((slider) => {
                    const thumb = slider.querySelector(".slider-thumb")!;
                    const thumbRect = thumb.getBoundingClientRect();
                    const thumbCenter = thumbRect.left + thumbRect.width / 2;
                    const marks = Array.from(
                        slider.querySelectorAll(
                            ".settings-preset-slider__mark",
                        ),
                    );
                    const activeMark = slider.querySelector(
                        ".settings-preset-slider__mark--active",
                    )!;
                    const markRect = activeMark.getBoundingClientRect();
                    const markCenter = markRect.left + markRect.width / 2;
                    return {
                        markCount: marks.length,
                        diff: Math.abs(markCenter - thumbCenter),
                    };
                });
            });
            for (const geo of sliderGeometries) {
                assert(
                    geo.diff <= 1.0,
                    `Slider mark-to-thumb center offset (${geo.diff}px) must be <= 1.0 CSS px for ${geo.markCount}-stage slider`,
                );
            }

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
                "wallpaper-motion-level-group",
            );
            const subtleRadio = motionLevel.getByRole("radio", {
                name: "轻微",
            });
            const pronouncedRadio = motionLevel.getByRole("radio", {
                name: "明显",
            });
            const standardRadio = motionLevel.getByRole("radio", {
                name: "标准",
            });

            await subtleRadio.click();
            assertEquals(
                await subtleRadio.getAttribute("aria-checked"),
                "true",
            );

            await pronouncedRadio.click();
            assertEquals(
                await pronouncedRadio.getAttribute("aria-checked"),
                "true",
            );

            await standardRadio.click();
            assertEquals(
                await standardRadio.getAttribute("aria-checked"),
                "true",
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
                "0",
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
                "none",
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
                "wallpaper-motion-level-group",
            );
            await motionLevel.getByRole("radio", { name: "明显" }).click();

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
            await motionLevel.getByRole("radio", { name: "轻微" }).click();

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
            await motionLevel.getByRole("radio", { name: "标准" }).click();

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
            assertEquals(await rThumb.getAttribute("aria-valuenow"), "3");
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
            assertEquals(
                await motionLevel.getByRole("radio", { name: "明显" })
                    .getAttribute("aria-checked"),
                "true",
            );
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
            assertEquals(await rThumb.getAttribute("aria-valuenow"), "1");
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
            assertEquals(
                await motionLevel.getByRole("radio", { name: "轻微" })
                    .getAttribute("aria-checked"),
                "true",
            );

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
            assertEquals(await rThumb.getAttribute("aria-valuenow"), "4");
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
            assertEquals(
                await motionLevel.getByRole("radio", { name: "标准" })
                    .getAttribute("aria-checked"),
                "true",
            );

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
            assertEquals(await rThumb.getAttribute("aria-valuenow"), "4");
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
            assertEquals(
                await motionLevel.getByRole("radio", { name: "标准" })
                    .getAttribute("aria-checked"),
                "true",
            );
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
                await page.getByTestId("wallpaper-motion-level-group").count(),
                0,
                "Motion level group must be detached when motion is off",
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

            assertEquals(
                await page.getByTestId("wallpaper-motion-level-group")
                    .getByRole("radio", { name: "明显" }).getAttribute(
                        "aria-checked",
                    ),
                "true",
            );
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

            await page.getByTestId("wallpaper-motion-level-group").getByRole(
                "radio",
                {
                    name: "轻微",
                },
            ).click();
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
            assertEquals(
                await page.getByTestId("wallpaper-motion-level-group").count(),
                0,
            );
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
    await t.step(
        "Settings live preview plays motion, immediately updates CSS variables without reload, and prevents PATCH flooding during drag",
        async () => {
            await page.emulateMedia({ reducedMotion: "no-preference" });
            await page.goto(origin + "/settings/appearance");
            const testSource = await upload(0.5);
            await waitCurrent(testSource);
            const preview = page.getByTestId("wallpaper-current-preview");
            await preview.waitFor();

            // Set motion to ambient
            await page.getByTestId("wallpaper-motion-group").getByRole(
                "radio",
                {
                    name: "环境光",
                },
            ).click();

            // Verify live preview attributes and active animation
            assertEquals(
                await preview.getAttribute("data-motion"),
                "ambient",
                "Current preview must have data-motion='ambient'",
            );
            assertEquals(
                await preview.getAttribute("data-substrate"),
                "image",
                "Uploaded wallpaper must have data-substrate='image'",
            );

            // Verify animation is actually present and not disabled by motionOverride='off'
            const hasActiveAnimation = await preview.evaluate((el) => {
                const fieldA = el.querySelector(".wallpaper__ambient-field-a");
                if (!fieldA) return false;
                const style = getComputedStyle(fieldA);
                return style.animationName !== "none" &&
                    style.animationName !== "";
            });
            assert(
                hasActiveAnimation,
                "Current preview ambient field must have active animation running",
            );

            // Test immediate live preview CSS updates via segmented selector
            const motionLevelGroup = page.getByTestId(
                "wallpaper-motion-level-group",
            );
            await motionLevelGroup.getByRole("radio", { name: "明显" }).click();
            await page.waitForFunction(() =>
                document.querySelector(
                    '[data-testid="wallpaper-current-preview"]',
                )?.getAttribute("data-motion-level") === "pronounced"
            );
            const high = await preview.evaluate((el) => ({
                mix: parseFloat(
                    el.style.getPropertyValue("--wallpaper-ambient-mix-a"),
                ),
                travel: parseFloat(
                    el.style.getPropertyValue("--wallpaper-ambient-travel"),
                ),
                floor: parseFloat(
                    el.style.getPropertyValue(
                        "--wallpaper-ambient-opacity-floor",
                    ),
                ),
            }));

            await motionLevelGroup.getByRole("radio", { name: "轻微" }).click();
            await page.waitForFunction(() =>
                document.querySelector(
                    '[data-testid="wallpaper-current-preview"]',
                )?.getAttribute("data-motion-level") === "subtle"
            );
            const low = await preview.evaluate((el) => ({
                mix: parseFloat(
                    el.style.getPropertyValue("--wallpaper-ambient-mix-a"),
                ),
                travel: parseFloat(
                    el.style.getPropertyValue("--wallpaper-ambient-travel"),
                ),
                floor: parseFloat(
                    el.style.getPropertyValue(
                        "--wallpaper-ambient-opacity-floor",
                    ),
                ),
            }));
            assert(
                high.mix > low.mix && high.travel > low.travel &&
                    high.floor < low.floor,
                "Live preview must change intensity without reload",
            );

            // Verify segmented selector persistence contract (1 commit per click, latest intent wins)
            let patchCalls = 0;
            const patchListener = (
                req: { method: () => string; url: () => string },
            ) => {
                if (
                    req.method() === "PATCH" &&
                    req.url().includes("/api/preferences")
                ) {
                    patchCalls++;
                }
            };
            page.on("request", patchListener);

            const patchPromise = page.waitForResponse(
                (res) =>
                    res.request().method() === "PATCH" &&
                    res.url().includes("/api/preferences"),
            );
            await motionLevelGroup.getByRole("radio", { name: "明显" }).click();
            await patchPromise;
            page.off("request", patchListener);
            assertEquals(
                patchCalls,
                1,
                "Each semantic segmented selection must emit exactly one sync",
            );

            const currentPrefs = await prefs();
            assertEquals(
                currentPrefs.wallpaperPresentations[testSource]?.motion,
                "ambient",
            );
        },
    );

    await t.step(
        "substrate contract validates canvas, gradient, and image ambient calibration and layering",
        async () => {
            await page.emulateMedia({ reducedMotion: "no-preference" });

            // 1. Image substrate (uploaded wallpaper)
            await page.goto(origin + "/settings/appearance");
            const imgSource = await upload(0.5);
            await waitCurrent(imgSource);
            await page.evaluate(
                async ({ source, records }) => {
                    await fetch("/api/preferences", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            wallpaperPresentations: {
                                ...records,
                                [source]: {
                                    ...records[source],
                                    motion: "ambient",
                                    motionLevel: "pronounced",
                                    readability: "balanced",
                                    softness: "none",
                                    tone: "natural",
                                },
                            },
                        }),
                    });
                },
                {
                    source: imgSource,
                    records: (await prefs()).wallpaperPresentations,
                },
            );
            await page.waitForFunction(async (src) => {
                const res = await (await fetch("/api/preferences")).json();
                return res.data.wallpaperPresentations[src]?.motion ===
                    "ambient";
            }, imgSource);

            await page.goto(origin + "/");
            const surface = page.getByTestId("home-wallpaper-surface");
            await surface.waitFor();
            await page.waitForFunction(
                () =>
                    document.querySelector(
                        '[data-testid="home-wallpaper-surface"]',
                    )?.getAttribute("data-motion") === "ambient",
            );
            assertEquals(
                await surface.getAttribute("data-substrate"),
                "image",
                "Surface with uploaded wallpaper must report data-substrate='image'",
            );
            assertEquals(
                await surface.getAttribute("data-motion"),
                "ambient",
            );
            assertEquals(
                await surface.locator(".wallpaper__ambient-field-a").count(),
                1,
            );
            assertEquals(
                await surface.locator(".wallpaper__ambient-field-b").count(),
                1,
            );

            // Check image substrate canonical mix values (pronounced: 12% / 9.6%)
            assertEquals(
                await surface.evaluate((el) =>
                    el.style.getPropertyValue("--wallpaper-ambient-mix-a")
                ),
                "12%",
            );
            assertEquals(
                await surface.evaluate((el) =>
                    el.style.getPropertyValue("--wallpaper-ambient-mix-b")
                ),
                "9.6%",
            );

            // Mask z-index must be strictly higher than ambient z-index
            const { maskZ, ambientZ } = await surface.evaluate((el) => {
                const mask = el.querySelector(".wallpaper-surface__mask")!;
                const ambient = el.querySelector(".wallpaper__ambient")!;
                return {
                    maskZ: Number(getComputedStyle(mask).zIndex),
                    ambientZ: Number(getComputedStyle(ambient).zIndex),
                };
            });
            assert(
                maskZ > ambientZ,
                `Readability mask z-index (${maskZ}) must be higher than ambient z-index (${ambientZ})`,
            );

            // 2. Gradient substrate
            const gradientSource = "linear-gradient(135deg, #102030, #204060)";
            await page.evaluate(
                async ({ gradient, records }) => {
                    await fetch("/api/preferences", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            backgroundImage: gradient,
                            wallpaperPresentations: {
                                ...records,
                                [gradient]: {
                                    composition: { focalX: 0.5, focalY: 0.5 },
                                    motion: "ambient",
                                    motionLevel: "pronounced",
                                    readability: "balanced",
                                    softness: "none",
                                    tone: "natural",
                                },
                            },
                        }),
                    });
                },
                {
                    gradient: gradientSource,
                    records: (await prefs()).wallpaperPresentations,
                },
            );
            await page.waitForFunction(async (src) => {
                const res = await (await fetch("/api/preferences")).json();
                return res.data.backgroundImage === src &&
                    res.data.wallpaperPresentations[src]?.motion === "ambient";
            }, gradientSource);

            await page.goto(origin + "/");
            await surface.waitFor();
            await page.waitForFunction(
                () =>
                    document.querySelector(
                            '[data-testid="home-wallpaper-surface"]',
                        )?.getAttribute("data-substrate") === "gradient" &&
                    document.querySelector(
                            '[data-testid="home-wallpaper-surface"]',
                        )?.getAttribute("data-motion") === "ambient",
            );
            assertEquals(
                await surface.getAttribute("data-substrate"),
                "gradient",
                "Surface with CSS gradient wallpaper must report data-substrate='gradient'",
            );

            // Gradient must use canvas/low-noise table (pronounced: 8.5% / 6.8%), NOT image table (12% / 9.6%)
            assertEquals(
                await surface.evaluate((el) =>
                    el.style.getPropertyValue("--wallpaper-ambient-mix-a")
                ),
                "8.5%",
                "Gradient substrate must not use image compensation mix values",
            );
            assertEquals(
                await surface.evaluate((el) =>
                    el.style.getPropertyValue("--wallpaper-ambient-mix-b")
                ),
                "6.8%",
                "Gradient substrate must not use image compensation mix values",
            );

            // Test soft tone on gradient: mix multiplied by 0.9 (8.5 * 0.9 = 7.65%, 6.8 * 0.9 = 6.12%)
            await page.evaluate(
                async ({ gradient, records }) => {
                    await fetch("/api/preferences", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            wallpaperPresentations: {
                                ...records,
                                [gradient]: {
                                    ...records[gradient],
                                    tone: "soft",
                                },
                            },
                        }),
                    });
                },
                {
                    gradient: gradientSource,
                    records: (await prefs()).wallpaperPresentations,
                },
            );
            await page.waitForFunction(async (src) => {
                const res = await (await fetch("/api/preferences")).json();
                return res.data.wallpaperPresentations[src]?.tone === "soft";
            }, gradientSource);
            await page.goto(origin + "/");
            await surface.waitFor();
            await page.waitForFunction(
                () =>
                    document.querySelector(
                        '[data-testid="home-wallpaper-surface"]',
                    )?.getAttribute("data-tone") === "soft",
            );
            const softMixA = await surface.evaluate((el) =>
                parseFloat(
                    el.style.getPropertyValue("--wallpaper-ambient-mix-a"),
                )
            );
            assert(
                Math.abs(softMixA - 7.65) < 0.05,
                `Soft tone on gradient must scale mix by 0.9 (expected ~7.65%, got ${softMixA}%)`,
            );

            // 3. Canvas substrate (cleared wallpaper)
            await page.evaluate(async () => {
                await fetch("/api/preferences", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        backgroundImage: null,
                        canvasMotion: "ambient",
                        canvasMotionLevel: "pronounced",
                    }),
                });
            });
            await page.waitForFunction(async () => {
                const res = await (await fetch("/api/preferences")).json();
                return res.data.backgroundImage === null &&
                    res.data.canvasMotion === "ambient";
            });

            await page.goto(origin + "/");
            await surface.waitFor();
            await page.waitForFunction(
                () =>
                    document.querySelector(
                            '[data-testid="home-wallpaper-surface"]',
                        )?.getAttribute("data-substrate") === "canvas" &&
                    document.querySelector(
                            '[data-testid="home-wallpaper-surface"]',
                        )?.getAttribute("data-motion") === "ambient",
            );
            assertEquals(
                await surface.getAttribute("data-substrate"),
                "canvas",
                "Cleared wallpaper must report data-substrate='canvas'",
            );
            assertEquals(
                await surface.getAttribute("data-motion"),
                "ambient",
            );
            assertEquals(
                await surface.evaluate((el) =>
                    el.style.getPropertyValue("--wallpaper-ambient-mix-a")
                ),
                "8.5%",
            );
            assertEquals(
                await surface.evaluate((el) =>
                    el.style.getPropertyValue("--wallpaper-ambient-mix-b")
                ),
                "6.8%",
            );
        },
    );

    await t.step(
        "embedded and fullscreen ambient motion use their own container geometry",
        async () => {
            await page.goto(origin + "/settings/appearance");
            if (!(await prefs()).backgroundImage) await upload(.5);
            await renderMotion("pronounced");
            await ambientPhase(.35);
            const home = await page.getByTestId("home-wallpaper-surface")
                .evaluate((el) => {
                    const field = el.querySelector(
                        ".wallpaper__ambient-field-a",
                    )!;
                    const matrix = new DOMMatrix(
                        getComputedStyle(field).transform,
                    );
                    const rect = el.getBoundingClientRect();
                    return {
                        extent: Math.max(rect.width, rect.height),
                        movement: matrix.e,
                    };
                });
            await page.goto(origin + "/settings/appearance");
            await page.getByTestId("wallpaper-current-preview").waitFor();
            await ambientPhase(.35, "wallpaper-current-preview");
            const embedded = await page.getByTestId("wallpaper-current-preview")
                .evaluate((el) => {
                    const field = el.querySelector(
                        ".wallpaper__ambient-field-a",
                    )!;
                    const matrix = new DOMMatrix(
                        getComputedStyle(field).transform,
                    );
                    const rect = el.getBoundingClientRect();
                    return {
                        extent: Math.max(rect.width, rect.height),
                        movement: matrix.e,
                    };
                });
            assert(embedded.extent < home.extent * .5);
            assert(
                Math.abs(
                    home.movement / home.extent -
                        embedded.movement / embedded.extent,
                ) < .001,
            );
            assert(
                embedded.movement < home.movement * .5,
                "Embedded motion must not retain viewport-sized travel",
            );
        },
    );

    await t.step(
        "drift and zoom satisfy deterministic onset deadlines with at least 10% geometric progress",
        async () => {
            await page.goto(origin + "/settings/appearance");
            const source = (await prefs()).backgroundImage ??
                (await upload(0.5));
            assert(source);

            const stages =
                (["subtle", "soft", "standard", "pronounced"] as const).map(
                    (level) => ({
                        level,
                        deadlineSec:
                            GLOBAL_MOTION_BUDGET.minOnsetDeadlines[level],
                        zoomPeak: WALLPAPER_ZOOM_PARAMS[level].scale,
                        driftX: WALLPAPER_DRIFT_PARAMS[level].x,
                        driftY: WALLPAPER_DRIFT_PARAMS[level].y,
                    }),
                );

            // 1. Verify Zoom onset progress by deadline
            for (const { level, deadlineSec, zoomPeak } of stages) {
                await page.evaluate(
                    async ({ source, level, records }) => {
                        await fetch("/api/preferences", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                wallpaperPresentations: {
                                    ...records,
                                    [source]: {
                                        ...records[source],
                                        motion: "zoom",
                                        motionLevel: level,
                                        readability: "balanced",
                                        softness: "none",
                                    },
                                },
                            }),
                        });
                    },
                    {
                        source,
                        level,
                        records: (await prefs()).wallpaperPresentations,
                    },
                );

                await page.goto(origin + "/");
                const surface = page.getByTestId("home-wallpaper-surface");
                await surface.waitFor();

                const zoomProgress = await surface.evaluate(
                    async (el, { deadlineSec, zoomPeak }) => {
                        const img = el.querySelector(
                            ".wallpaper-surface__image",
                        ) as HTMLElement;
                        const anim = img.getAnimations()[0];
                        if (!anim) throw new Error("Zoom animation not found");
                        anim.pause();
                        anim.currentTime = deadlineSec * 1000;
                        const { promise, resolve } = Promise.withResolvers<
                            void
                        >();
                        requestAnimationFrame(() => resolve());
                        await promise;

                        const style = getComputedStyle(img);
                        const matrix = new DOMMatrix(style.transform);
                        const currentScale = matrix.a;
                        const fullDelta = zoomPeak - 1;
                        const currentDelta = currentScale - 1;
                        return currentDelta / fullDelta;
                    },
                    { deadlineSec, zoomPeak },
                );

                assert(
                    zoomProgress >=
                        GLOBAL_MOTION_BUDGET.minOnsetEffectiveProgress,
                    `Zoom stage '${level}' at deadline ${deadlineSec}s must achieve >= 10% progress, got ${
                        (zoomProgress * 100).toFixed(2)
                    }%`,
                );
            }

            // 2. Verify Drift onset progress by deadline
            for (const { level, deadlineSec, driftX } of stages) {
                await page.evaluate(
                    async ({ source, level, records }) => {
                        await fetch("/api/preferences", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                wallpaperPresentations: {
                                    ...records,
                                    [source]: {
                                        ...records[source],
                                        motion: "drift",
                                        motionLevel: level,
                                        readability: "balanced",
                                        softness: "none",
                                    },
                                },
                            }),
                        });
                    },
                    {
                        source,
                        level,
                        records: (await prefs()).wallpaperPresentations,
                    },
                );

                await page.goto(origin + "/");
                const surface = page.getByTestId("home-wallpaper-surface");
                await surface.waitFor();

                const driftProgress = await surface.evaluate(
                    async (el, { deadlineSec, driftX }) => {
                        const img = el.querySelector(
                            ".wallpaper-surface__image",
                        ) as HTMLElement;
                        const anim = img.getAnimations()[0];
                        if (!anim) throw new Error("Drift animation not found");
                        anim.pause();

                        // Read starting transform at t = 0
                        anim.currentTime = 0;
                        const r1 = Promise.withResolvers<void>();
                        requestAnimationFrame(() => r1.resolve());
                        await r1.promise;
                        const startMatrix = new DOMMatrix(
                            getComputedStyle(img).transform,
                        );

                        // Read transform at deadline
                        anim.currentTime = deadlineSec * 1000;
                        const r2 = Promise.withResolvers<void>();
                        requestAnimationFrame(() => r2.resolve());
                        await r2.promise;
                        const deadlineMatrix = new DOMMatrix(
                            getComputedStyle(img).transform,
                        );

                        const dx = deadlineMatrix.e - startMatrix.e;
                        const imageWidth = img.getBoundingClientRect().width;
                        const fullAmplitude = imageWidth * (2 * (driftX / 100));

                        return Math.abs(dx) / fullAmplitude;
                    },
                    { deadlineSec, driftX },
                );

                assert(
                    driftProgress >=
                        GLOBAL_MOTION_BUDGET.minOnsetEffectiveProgress,
                    `Drift stage '${level}' at deadline ${deadlineSec}s must achieve >= 10% amplitude, got ${
                        (driftProgress * 100).toFixed(2)
                    }%`,
                );
            }
        },
    );

    await t.step(
        "fixed gray texture: frozen ROI lower bounds and adjacent stage separation",
        async () => {
            const textureData = await page.evaluate(() => {
                const canvas = document.createElement("canvas");
                canvas.width = 800;
                canvas.height = 600;
                const ctx = canvas.getContext("2d")!;
                const data = ctx.createImageData(800, 600);
                for (let y = 0; y < 600; y++) {
                    for (let x = 0; x < 800; x++) {
                        const i = (y * 800 + x) * 4;
                        const noise = Math.sin(x * .08) * Math.cos(y * .08) * 2;
                        data.data[i] = Math.round(122 + noise);
                        data.data[i + 1] = Math.round(130 + noise);
                        data.data[i + 2] = Math.round(122 + noise);
                        data.data[i + 3] = 255;
                    }
                }
                ctx.putImageData(data, 0, 0);
                return canvas.toDataURL("image/png").split(",")[1];
            });
            const path = files + "/texture-gray.png";
            await Deno.writeFile(
                path,
                Uint8Array.from(atob(textureData), (c) => c.charCodeAt(0)),
            );
            await page.goto(origin + "/settings/appearance");
            await page.getByTestId("wallpaper-file-input").setInputFiles(path);
            await page.getByTestId("wallpaper-toast").filter({
                hasText: "已上传",
            }).waitFor();
            await page.waitForFunction(async () => {
                const res = await (await fetch("/api/preferences")).json();
                return typeof res.data.backgroundImage === "string" &&
                    res.data.backgroundImage.startsWith("/api/wallpaper/");
            });
            const textureSource = (await prefs()).backgroundImage;
            assert(textureSource);
            await waitCurrent(textureSource);
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.emulateMedia({ reducedMotion: "no-preference" });
            let previous = 0;
            for (
                const level of [
                    "subtle",
                    "soft",
                    "standard",
                    "pronounced",
                ] as const
            ) {
                const lowerBound =
                    GLOBAL_MOTION_BUDGET.minAmbientHotspotDelta[level];
                await renderMotion(level, "balanced", textureSource);
                await ambientPhase(0);
                await ambientPhase(0.35);
                await ambientPhase(0);
                await stableScreenshot();
                const samples: number[] = [];
                for (
                    let attempt = 0;
                    attempt <
                        WALLPAPER_TEMPORAL_BUDGET.perceptibilitySampleCount;
                    attempt++
                ) {
                    await ambientPhase(0);
                    const before = await framePixels(await stableScreenshot());
                    await ambientPhase(.35);
                    const after = await framePixels(await stableScreenshot());
                    assertEquals(before.roi.length, after.roi.length);
                    const delta = after.roi.reduce((sum, value, i) =>
                        sum + Math.abs(value - before.roi[i]), 0) /
                        after.roi.length;
                    samples.push(delta);
                }
                samples.sort((a, b) => a - b);
                const median = samples[Math.floor(samples.length / 2)];
                const min = samples[0];
                console.log(
                    "[PERCEPTIBILITY]",
                    level,
                    "median:",
                    median,
                    "min:",
                    min,
                    "samples:",
                    samples,
                );
                assert(
                    median >= lowerBound,
                    `Stage ${level}: median ${median} below calibrated lower bound ${lowerBound}`,
                );
                assert(
                    min >=
                        lowerBound -
                            WALLPAPER_TEMPORAL_BUDGET
                                .perceptibilityQuantizationTolerance,
                    `Stage ${level}: min ${min} below bound - tolerance (${
                        lowerBound -
                        WALLPAPER_TEMPORAL_BUDGET
                            .perceptibilityQuantizationTolerance
                    })`,
                );
                assert(
                    median > previous,
                    "Adjacent stages must have increasing local color change",
                );
                previous = median;
            }
        },
    );
    await t.step(
        "ambient peaks are separated and actual full-frame luminance does not breathe",
        async () => {
            await renderMotion("pronounced");
            const peaks = await page.getByTestId("home-wallpaper-surface")
                .evaluate((el) =>
                    ["a", "b"].map((name) => {
                        const animation = el.querySelector(
                            ".wallpaper__ambient-field-" + name,
                        )!.getAnimations()[0];
                        const frames = (animation.effect as KeyframeEffect)
                            .getKeyframes();
                        const peak = frames.find((frame) =>
                            Number(frame.opacity) === 1
                        );
                        if (
                            peak?.computedOffset === undefined
                        ) throw new Error("Missing opacity peak");
                        return peak.computedOffset;
                    })
                );
            assert(
                Math.abs(peaks[0] - peaks[1]) >=
                    GLOBAL_MOTION_BUDGET.minPhaseSeparation,
            );
            const means: number[] = [];
            for (const phase of [0, .15, .35, .55, .70, .85]) {
                await ambientPhase(phase);
                means.push(
                    (await framePixels(
                        await page.getByTestId("home-wallpaper-surface")
                            .screenshot(),
                    )).luminance,
                );
            }
            const swing = Math.max(...means) - Math.min(...means);
            console.log("[LUMINANCE]", { peaks, means, swing });
            assert(
                swing <= GLOBAL_MOTION_BUDGET.maxAmbientAggregateLuminanceSwing,
            );
        },
    );
    await t.step(
        "wall-clock ambient recurrence: top-6 worst overlap windows aggregate luminance swing <= budget",
        async () => {
            const { worstOverlapWindows } = analyzeAmbientRecurrence(
                28,
                37,
                7,
                0.25,
            );
            const worstMeans: number[] = [];

            for (const win of worstOverlapWindows) {
                await page.getByTestId("home-wallpaper-surface").evaluate(
                    async (el, tSec) => {
                        for (const name of ["a", "b"]) {
                            const field = el.querySelector(
                                ".wallpaper__ambient-field-" + name,
                            )!;
                            const anim = field.getAnimations()[0];
                            if (!anim?.effect) {
                                throw new Error("Missing ambient animation");
                            }
                            const timing = anim.effect.getTiming();
                            anim.pause();
                            const dur = Number(timing.duration);
                            const del = Number(timing.delay);
                            anim.currentTime = ((tSec % dur) + dur) % dur +
                                del + 2 * dur;
                            await anim.ready;
                        }
                        const { promise, resolve } = Promise.withResolvers<
                            void
                        >();
                        requestAnimationFrame(() =>
                            requestAnimationFrame(() => resolve())
                        );
                        await promise;
                    },
                    win.timeSeconds,
                );

                const pixels = await framePixels(
                    await page.getByTestId("home-wallpaper-surface")
                        .screenshot(),
                );
                worstMeans.push(pixels.luminance);
            }

            const worstSwing = Math.max(...worstMeans) -
                Math.min(...worstMeans);
            console.log("[RECURRENCE WORST-CASE SWING]", {
                worstMeans,
                worstSwing,
            });
            assert(
                worstSwing <=
                    WALLPAPER_TEMPORAL_BUDGET.maxAmbientLuminanceSwing,
                `Worst-case wall-clock recurrence swing ${worstSwing} exceeds budget ${WALLPAPER_TEMPORAL_BUDGET.maxAmbientLuminanceSwing}`,
            );
        },
    );
    await t.step(
        "actual raster composite: all stages, clear/balanced, fixed cycle phases",
        async () => {
            const phases = [0, .15, .35, .55, .70, .85];
            const quantization = 1 / 255;
            for (const readability of ["clear", "balanced"] as const) {
                for (
                    const level of [
                        "subtle",
                        "soft",
                        "standard",
                        "pronounced",
                    ] as const
                ) {
                    await renderMotion(level, readability);
                    const surface = page.getByTestId("home-wallpaper-surface");
                    const maskOpacity = await surface.evaluate((el) => {
                        // White field over black preserves the product's radial alpha,
                        // opacity, geometry and transforms; every pixel is its contribution.
                        el.style.zIndex = "2147483647";
                        el.style.background = "#000";
                        el.style.setProperty(
                            "--wallpaper-ambient-color",
                            "#fff",
                        );
                        const image = el.querySelector(
                            ".wallpaper-surface__image",
                        ) as HTMLElement;
                        image.style.backgroundImage = "none";
                        image.style.backgroundColor = "#000";
                        image.style.filter = "none";
                        const mask = el.querySelector(
                            ".wallpaper-surface__mask",
                        ) as HTMLElement;
                        mask.style.background = "#000";
                        return Number(getComputedStyle(mask).opacity);
                    });
                    assertEquals(
                        maskOpacity,
                        WALLPAPER_READABILITY_MASKS[readability],
                    );
                    let compositeMaximum = 0, afterMaskMaximum = 0;
                    for (const phase of phases) {
                        await ambientPhase(phase);
                        await surface.evaluate((el) =>
                            (el.querySelector(
                                ".wallpaper-surface__mask",
                            ) as HTMLElement).style.visibility = "hidden"
                        );
                        compositeMaximum = Math.max(
                            compositeMaximum,
                            (await framePixels(await surface.screenshot()))
                                .maximum,
                        );
                        await surface.evaluate((el) =>
                            (el.querySelector(
                                ".wallpaper-surface__mask",
                            ) as HTMLElement).style.visibility = "visible"
                        );
                        afterMaskMaximum = Math.max(
                            afterMaskMaximum,
                            (await framePixels(await surface.screenshot()))
                                .maximum,
                        );
                    }
                    console.log("[RASTER]", {
                        level,
                        readability,
                        compositeMaximum,
                        afterMaskMaximum,
                    });
                    assert(
                        compositeMaximum <=
                            GLOBAL_MOTION_BUDGET
                                    .maxAmbientCompositeContribution +
                                quantization,
                    );
                    assert(
                        afterMaskMaximum <=
                            GLOBAL_MOTION_BUDGET
                                    .maxAmbientCompositeContributionAfterClear +
                                quantization,
                    );
                    assert(
                        afterMaskMaximum <=
                            compositeMaximum * (1 - maskOpacity) + quantization,
                    );
                }
            }
        },
    );

    await t.step(
        "capture visual evidence for Main verification",
        async () => {
            await page.goto(origin + "/");
            await page.getByTestId("home-wallpaper-surface").waitFor();
            const homeProof = `${evidenceDir}/home-pronounced-ambient.png`;
            await page.screenshot({ path: homeProof });
            assert(await Deno.stat(homeProof));

            await page.goto(origin + "/settings/appearance");
            await page.getByTestId("wallpaper-current-preview").waitFor();
            const settingsProof = `${evidenceDir}/settings-live-preview.png`;
            await page.screenshot({ path: settingsProof });
            assert(await Deno.stat(settingsProof));
        },
    );
    assertEquals(errors, []);
});
