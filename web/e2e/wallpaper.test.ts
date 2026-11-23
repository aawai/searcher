import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
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
    const evidenceDir = "artifacts/wallpaper";
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
    async function subjectVisible(target: Page, selector: string) {
        // A top-level navigation cross-fades for --motion-base; sampling pixels
        // mid-fade would blend the previous page over the wallpaper.
        await target.evaluate(() =>
            Promise.allSettled(
                document.getAnimations().filter((animation) =>
                    Number.isFinite(
                        animation.effect?.getComputedTiming().endTime,
                    )
                ).map((animation) => animation.finished),
            )
        );
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
                // The dialog opens with a CSS transition. Pointer fractions must be
                // measured on the settled box, or they map onto a stale width.
                await page.waitForFunction(() => {
                    const dialog = document.querySelector(
                        '[data-testid="wallpaper-preview-dialog"]',
                    );
                    return dialog instanceof Element &&
                        dialog.getAnimations({ subtree: true }).every((
                            animation,
                        ) => animation.playState !== "running");
                });
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
            await input.fill("https://example.com/recovered.png");
            await page.getByTestId("wallpaper-apply-btn").click();
            await page.locator(".sync-failed-badge").waitFor();
            const theme = page.getByRole("button", { name: /^切换到/ });
            await theme.click();
            await held.promise;
            await theme.click();
            release.resolve();
            await waitCurrent("https://example.com/recovered.png");
            await page.locator(".sync-failed-badge").waitFor({
                state: "detached",
            });
            await page.waitForFunction(async () => {
                const result = await (await fetch("/api/preferences")).json();
                const resolvedTheme = result.data.theme === "system"
                    ? matchMedia("(prefers-color-scheme: dark)").matches
                        ? "dark"
                        : "light"
                    : result.data.theme;
                return document.documentElement.dataset.theme === resolvedTheme;
            });
            assert(!patchResponses.includes(400));
            await page.unroute("**/api/preferences");
        },
    );
    await t.step(
        "anonymous remote URL and local upload survive reload without touching cloud preferences",
        async () => {
            const guestContext = await browser.newContext();
            const cloudBefore = await prefs();
            const guest = await guestContext.newPage();
            await guest.goto(origin + "/settings/appearance");
            await guest.getByTestId("wallpaper-guest-notice").waitFor();
            const remote = "https://images.unsplash.com/photo-guest-restore";
            await guest.getByTestId("wallpaper-input").fill(remote);
            await guest.getByTestId("wallpaper-apply-btn").click();
            await guest.getByTestId("wallpaper-toast").waitFor();
            await guest.reload();
            await guest.waitForFunction(
                (value) =>
                    (document.querySelector(
                        '[data-testid="wallpaper-input"]',
                    ) as HTMLInputElement)?.value === value,
                remote,
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
            assertEquals(
                await guest.getByTestId("wallpaper-current-preview")
                    .getAttribute("data-substrate"),
                "image",
            );
            await guest.goto(origin + "/");
            // The surface can render the cached remote URL before IndexedDB
            // appearance hydration restores the uploaded image.
            await guest.waitForFunction(() => {
                const surface = document.querySelector(
                    '[data-testid="home-wallpaper-surface-image"]',
                );
                return surface && getComputedStyle(surface).backgroundImage
                    .includes("data:image/png;base64,");
            }).catch(async (error: unknown) => {
                console.error(
                    "Anonymous wallpaper diagnostics",
                    await guest.evaluate(async () => {
                        const surface = document.querySelector(
                            '[data-testid="home-wallpaper-surface"]',
                        );
                        const image = document.querySelector(
                            '[data-testid="home-wallpaper-surface-image"]',
                        );
                        const opened = Promise.withResolvers<IDBDatabase>();
                        const req = indexedDB.open("searcher-client", 1);
                        req.onsuccess = () => opened.resolve(req.result);
                        req.onerror = () => opened.reject(req.error);
                        const db = await opened.promise;
                        const loaded = Promise.withResolvers<
                            { wallpaper?: string }
                        >();
                        const get = db.transaction("state").objectStore("state")
                            .get("appearance:anonymous");
                        get.onsuccess = () => loaded.resolve(get.result);
                        get.onerror = () => loaded.reject(get.error);
                        const value = await loaded.promise;
                        db.close();
                        return {
                            url: location.href,
                            storedWallpaper: value?.wallpaper?.slice(0, 100),
                            storedLength: value?.wallpaper?.length,
                            substrate: surface?.getAttribute("data-substrate"),
                            source: surface instanceof HTMLElement
                                ? surface.style.getPropertyValue(
                                    "--wallpaper-image",
                                ).slice(0, 100)
                                : null,
                            computed: image
                                ? getComputedStyle(image).backgroundImage.slice(
                                    0,
                                    100,
                                )
                                : null,
                            page: document.body.innerText.slice(0, 300),
                        };
                    }),
                );
                throw error;
            });
            assertStringIncludes(
                await guest.getByTestId("home-wallpaper-surface-image")
                    .evaluate((el) => getComputedStyle(el).backgroundImage),
                "data:image/png;base64,",
            );
            assertEquals(await prefs(), cloudBefore);
            await guestContext.close();
        },
    );
    let uploadedSource = "";
    await t.step(
        "clearing wallpaper detaches current preview",
        async () => {
            await page.goto(origin + "/settings/appearance");
            await page.getByTestId("wallpaper-input").waitFor();

            // 1. Upload fresh wallpaper and verify it becomes current
            uploadedSource = await upload(0.3);
            await waitCurrent(uploadedSource);

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
        },
    );
    await t.step(
        "focal composition dialog persists adjusted focal point",
        async () => {
            // 1. Switch back to uploaded wallpaper
            const uploadedId = uploadedSource.split("/").pop()!;
            await page.getByTestId(`wallpaper-menu-trigger-${uploadedId}`)
                .click();
            await page.getByTestId("wallpaper-menu-set-current").click();
            await waitCurrent(uploadedSource);

            // Open focal composition dialog
            await page.goto(origin + "/settings/appearance");
            await page.getByTestId("wallpaper-current-adjust-focal-btn")
                .waitFor();
            await page.getByTestId("wallpaper-current-adjust-focal-btn")
                .click();
            await page.getByTestId("wallpaper-preview-dialog").waitFor();

            // The focal control explains that the home search and plate cover
            // the middle of the viewport and marks that footprint on the preview.
            const focalHint = page.getByTestId("wallpaper-focal-hint");
            await focalHint.waitFor();
            assert(
                (await focalHint.textContent())?.includes("38%"),
                "Focal hint must name the 38% home anchor",
            );
            await page.getByTestId("wallpaper-cover-band").waitFor();

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

            // Persisted focal point must be saved
            const pres = (await prefs()).wallpaperPresentations[uploadedSource];
            assert(
                Math.abs(pres.composition.focalX - 0.7) < 0.05,
                "Updated focal point must be persisted",
            );
        },
    );
    await t.step(
        "capture visual evidence for Main verification",
        async () => {
            await page.goto(origin + "/");
            await page.getByTestId("home-wallpaper-surface").waitFor();
            const homeProof = `${evidenceDir}/home-wallpaper.png`;
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

// 1.4.13 (#370 B5): the hover-revealed card menu covers part of the thumbnail,
// so Escape hides it without moving the pointer or closing settings.
Deno.test("壁纸卡片悬停菜单可用 Escape 关闭，移开再悬停恢复", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        await loginAndVisit(page, app.origin, "/settings/appearance", user);
        const path = `${app.tempDir}/card.png`;
        const data = await page.evaluate(() => {
            const canvas = document.createElement("canvas");
            canvas.width = 640;
            canvas.height = 360;
            canvas.getContext("2d")!.fillRect(0, 0, 640, 360);
            return canvas.toDataURL("image/png").split(",")[1];
        });
        await Deno.writeFile(
            path,
            Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
        );
        await page.getByTestId("wallpaper-file-input").setInputFiles(path);
        const card = page.locator(".wallpaper-card").first();
        await card.scrollIntoViewIfNeeded();
        const settle = (value: string) =>
            page.waitForFunction(
                (value) =>
                    getComputedStyle(
                        document.querySelector(
                            ".wallpaper-card__menu-trigger",
                        )!,
                    ).opacity === value,
                value,
            );

        await card.locator(".wallpaper-card__thumbnail").hover();
        await settle("1");
        await page.keyboard.press("Escape");
        await settle("0");
        assert(await page.locator('[data-window-id="settings"]').isVisible());
        // Leaving and hovering again brings the button back.
        await page.mouse.move(0, 0);
        await card.locator(".wallpaper-card__thumbnail").hover();
        await settle("1");
    } finally {
        await browser.close();
        await app.close();
    }
});
