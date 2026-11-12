import { layoutThemes } from "./helpers/evidence.ts";
import { assert, assertEquals } from "@std/assert";
import { type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { eq } from "drizzle-orm";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { users } from "../../src/db/schema.ts";
import {
    AuthService,
    SESSION_COOKIE_NAME,
} from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

Deno.test("UI Ownership and scoping contracts", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({ prefix: "searcher_ownership_e2e_" });
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
    });
    cleanup.defer(() => browser.close());

    // Register admin user via API
    const username = "ownership_admin_user";
    const password = "Admin-ownership-password-79!";
    const displayName = "Ownership Administrator";

    const regResponse = await app.request("/api/auth/register", {
        method: "POST",
        headers: {
            "origin": origin,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            username,
            displayName,
            password,
        }),
    });
    assertEquals(regResponse.status, 200, "Admin registration must succeed");

    // Promote to admin in DB
    await store.run((db) =>
        db.update(users).set({ role: "admin" }).where(
            eq(users.username, username),
        ).run()
    );

    // Extract session cookie
    const setCookieHeader = regResponse.headers.get("set-cookie");
    assert(
        setCookieHeader,
        "Missing Set-Cookie header in registration response",
    );
    const cookieMatch = setCookieHeader.match(
        new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
    );
    assert(cookieMatch, "Missing session token in Set-Cookie header");
    const sessionToken = cookieMatch[1];

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        reducedMotion: "reduce",
    });
    cleanup.defer(() => context.close());

    await context.addCookies([{
        name: SESSION_COOKIE_NAME,
        value: sessionToken,
        url: origin,
    }]);

    const page = await context.newPage();

    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path, {
            waitUntil: "domcontentloaded",
        });
        assertEquals(response?.status(), 200, `Visiting ${path} failed`);
        const selector = path === "/"
            ? "main.home .search-frame input"
            : path === "/settings/appearance"
            ? '[data-window-id="settings"] .theme-choices'
            : path.startsWith("/settings")
            ? '[data-window-id="settings"] [aria-label="设置分类"]'
            : path === "/account"
            ? '[data-window-id="settings"] .account-profile'
            : path === "/trash"
            ? '[data-window-id="trash"] .trash-tabs'
            : path.startsWith("/ask")
            ? '[data-window-id="ai"] .ask-page-shell'
            : path === "/admin/users"
            ? 'main[data-archetype="management"] table'
            : 'main[data-archetype="management"] .page-title';
        await target.locator(selector).waitFor({ state: "visible" });
    }

    async function updatePreferences(
        updates: Record<string, unknown>,
        target: Page = page,
    ) {
        const result = await target.evaluate(async (patch) => {
            const resp = await fetch("/api/preferences", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(patch),
            });
            return { ok: resp.ok, status: resp.status };
        }, updates);
        assertEquals(
            result.ok,
            true,
            `PATCH /api/preferences failed with status ${result.status}`,
        );
    }

    await t.step(
        "Admin login fixture establishes authenticated session",
        async () => {
            await visit("/admin");
            // Verify admin dashboard renders without '无权访问'
            await page.getByRole("heading", { name: "管理后台", exact: true })
                .first()
                .waitFor({
                    state: "visible",
                });
            const unauthorized = await page.getByText("无权访问").count();
            assertEquals(
                unauthorized,
                0,
                "Admin must not see unauthorized state",
            );
        },
    );

    await t.step(
        "Global theme and accent preferences remain effective globally",
        async () => {
            await visit("/settings/appearance");
            await page.getByRole("switch", {
                name: "在首页显示应用",
                checked: false,
            }).waitFor();
            assertEquals(
                await page.getByRole("switch", { name: "显示应用底板" })
                    .count(),
                0,
            );

            // 1. Theme global application via Appearance UI
            await page.getByRole("radio", { name: "深色", exact: true })
                .click();
            await page.waitForFunction(
                () => document.documentElement.dataset.theme === "dark",
            );
            assertEquals(
                await page.evaluate(() =>
                    document.documentElement.dataset.theme
                ),
                "dark",
            );

            await page.getByRole("radio", { name: "浅色", exact: true })
                .click();
            await page.waitForFunction(
                () => document.documentElement.dataset.theme === "light",
            );
            assertEquals(
                await page.evaluate(() =>
                    document.documentElement.dataset.theme
                ),
                "light",
            );

            // 2. Accent global application via Appearance UI swatches
            await page.getByRole("radio", { name: "电光紫" }).click();
            await page.waitForFunction(
                () => document.documentElement.dataset.accent === "violet",
            );
            assertEquals(
                await page.evaluate(() =>
                    document.documentElement.dataset.accent
                ),
                "violet",
            );

            // Verify accent is effective on another page too
            await visit("/settings");
            await page.waitForFunction(
                () => document.documentElement.dataset.accent === "violet",
            );
            assertEquals(
                await page.evaluate(() =>
                    document.documentElement.dataset.accent
                ),
                "violet",
            );

            await visit("/settings/appearance");

            // Shape and glass live in the top appearance group, while home toggles stay under "首页"
            const groupMembership = await page.evaluate(() => {
                const groups = Array.from(
                    document.querySelectorAll<HTMLElement>(
                        '[data-window-id="settings"] .settings-group',
                    ),
                );
                const firstTitles = Array.from(
                    groups[0]?.querySelectorAll(".settings-row-title") ?? [],
                    (el) => el.textContent?.trim(),
                );
                const homeGroup = groups.find((g) =>
                    g.querySelector(".settings-group-title")?.textContent
                        ?.trim() === "首页"
                );
                const homeTitles = Array.from(
                    homeGroup?.querySelectorAll(".settings-row-title") ?? [],
                    (el) => el.textContent?.trim(),
                );
                return { firstTitles, homeTitles };
            });
            assert(
                groupMembership.firstTitles.includes("控件形状") &&
                    groupMembership.firstTitles.includes("玻璃效果"),
                `Top appearance group must include shape and glass controls, got: ${
                    groupMembership.firstTitles.join(",")
                }`,
            );
            assert(
                !groupMembership.homeTitles.includes("控件形状") &&
                    !groupMembership.homeTitles.includes("玻璃效果") &&
                    groupMembership.homeTitles.includes("在首页显示应用"),
                `Home group must keep home toggles only, got: ${
                    groupMembership.homeTitles.join(",")
                }`,
            );

            // Default regular tier shows the scope explanation without the clear risk warning
            await page.getByText(
                "通透主要影响首页搜索框与应用底板；输入聚焦时及菜单等浮层优先保证可读性。",
            ).waitFor();
            assertEquals(
                await page.getByText(
                    "通透会透出壁纸，首页文字可读性随壁纸变化",
                ).count(),
                0,
            );

            // Populate a standalone field in a vertical settings row so its value, geometry and sibling button are live
            const wallpaperInput = page.getByTestId("wallpaper-input");
            await wallpaperInput.fill("https://example.com/wall.jpg");

            const roundedSettingsMetrics = await page.evaluate(() => {
                const shapeGroup = document.querySelector<HTMLElement>(
                    '[role="radiogroup"][aria-label="控件形状"]',
                )!;
                const pillRadio = Array.from(
                    shapeGroup.querySelectorAll<HTMLElement>('[role="radio"]'),
                ).find((el) => el.textContent?.trim() === "胶囊")!;
                const field = document.querySelector<HTMLInputElement>(
                    '[data-testid="wallpaper-input"]',
                )!;
                const applyBtn = document.querySelector<HTMLElement>(
                    '[data-testid="wallpaper-apply-btn"]',
                )!;
                const uploadIconBtn = document.querySelector<HTMLElement>(
                    '[data-testid="wallpaper-upload-btn"]',
                )!;
                const windowBtn = document.querySelector<HTMLElement>(
                    '[data-window-id="settings"] .window-frame__button',
                )!;
                const switchControl = document.querySelector<HTMLElement>(
                    '[data-window-id="settings"] .switch',
                )!;
                const card = document.querySelector<HTMLElement>(
                    '[data-window-id="settings"] .settings-card',
                )!;
                const measure = (el: HTMLElement) => {
                    const rect = el.getBoundingClientRect();
                    return {
                        radius: getComputedStyle(el).borderRadius,
                        width: Math.round(rect.width * 100) / 100,
                        height: Math.round(rect.height * 100) / 100,
                    };
                };
                return {
                    shapeGroup: measure(shapeGroup),
                    pillRadio: measure(pillRadio),
                    field: { ...measure(field), value: field.value },
                    applyBtn: measure(applyBtn),
                    uploadIconBtn: measure(uploadIconBtn),
                    windowBtn: measure(windowBtn),
                    switchRadius: getComputedStyle(switchControl).borderRadius,
                    cardRadius: getComputedStyle(card).borderRadius,
                };
            });
            assertEquals(roundedSettingsMetrics.shapeGroup.radius, "10px");
            assertEquals(roundedSettingsMetrics.pillRadio.radius, "8px");
            assertEquals(roundedSettingsMetrics.field.radius, "12px");
            assertEquals(roundedSettingsMetrics.applyBtn.radius, "10px");
            assertEquals(roundedSettingsMetrics.uploadIconBtn.radius, "10px");
            assertEquals(roundedSettingsMetrics.windowBtn.radius, "10px");
            assertEquals(roundedSettingsMetrics.switchRadius, "999px");
            assertEquals(roundedSettingsMetrics.cardRadius, "14px");

            // Switch shape via keyboard: focus stays on the selected radio, field value and geometry do not jump
            const roundedRadio = page.getByRole("radio", {
                name: "圆角",
                exact: true,
            });
            await roundedRadio.focus();
            await page.keyboard.press("ArrowRight");
            await page.waitForFunction(() =>
                document.documentElement.dataset.shape === "pill"
            );

            const pillSettingsMetrics = await page.evaluate(() => {
                const shapeGroup = document.querySelector<HTMLElement>(
                    '[role="radiogroup"][aria-label="控件形状"]',
                )!;
                const pillRadio = Array.from(
                    shapeGroup.querySelectorAll<HTMLElement>('[role="radio"]'),
                ).find((el) => el.textContent?.trim() === "胶囊")!;
                const field = document.querySelector<HTMLInputElement>(
                    '[data-testid="wallpaper-input"]',
                )!;
                const applyBtn = document.querySelector<HTMLElement>(
                    '[data-testid="wallpaper-apply-btn"]',
                )!;
                const uploadIconBtn = document.querySelector<HTMLElement>(
                    '[data-testid="wallpaper-upload-btn"]',
                )!;
                const windowBtn = document.querySelector<HTMLElement>(
                    '[data-window-id="settings"] .window-frame__button',
                )!;
                const switchControl = document.querySelector<HTMLElement>(
                    '[data-window-id="settings"] .switch',
                )!;
                const card = document.querySelector<HTMLElement>(
                    '[data-window-id="settings"] .settings-card',
                )!;
                const measure = (el: HTMLElement) => {
                    const rect = el.getBoundingClientRect();
                    return {
                        radius: getComputedStyle(el).borderRadius,
                        width: Math.round(rect.width * 100) / 100,
                        height: Math.round(rect.height * 100) / 100,
                    };
                };
                return {
                    focusedIsPill: document.activeElement === pillRadio,
                    shapeGroup: measure(shapeGroup),
                    pillRadio: measure(pillRadio),
                    field: { ...measure(field), value: field.value },
                    applyBtn: measure(applyBtn),
                    uploadIconBtn: measure(uploadIconBtn),
                    windowBtn: measure(windowBtn),
                    switchRadius: getComputedStyle(switchControl).borderRadius,
                    cardRadius: getComputedStyle(card).borderRadius,
                };
            });
            assertEquals(pillSettingsMetrics.focusedIsPill, true);
            assertEquals(pillSettingsMetrics.shapeGroup.radius, "999px");
            assertEquals(pillSettingsMetrics.pillRadio.radius, "997px");
            assertEquals(pillSettingsMetrics.field.radius, "999px");
            assertEquals(
                pillSettingsMetrics.field.value,
                "https://example.com/wall.jpg",
            );
            assertEquals(pillSettingsMetrics.applyBtn.radius, "999px");
            // Exclusions remain unchanged under pill
            assertEquals(pillSettingsMetrics.uploadIconBtn.radius, "10px");
            assertEquals(pillSettingsMetrics.windowBtn.radius, "10px");
            assertEquals(pillSettingsMetrics.switchRadius, "999px");
            assertEquals(pillSettingsMetrics.cardRadius, "14px");
            // Geometry (width & height) is invariant across rounded -> pill
            for (
                const key of [
                    "shapeGroup",
                    "pillRadio",
                    "field",
                    "applyBtn",
                    "uploadIconBtn",
                    "windowBtn",
                ] as const
            ) {
                assertEquals(
                    pillSettingsMetrics[key].width,
                    roundedSettingsMetrics[key].width,
                    `${key} width must not jump on shape switch`,
                );
                assertEquals(
                    pillSettingsMetrics[key].height,
                    roundedSettingsMetrics[key].height,
                    `${key} height must not jump on shape switch`,
                );
            }

            await Promise.all([
                page.waitForResponse((response) =>
                    response.url().endsWith("/api/preferences") &&
                    response.request().method() === "PATCH" &&
                    response.ok() &&
                    response.request().postDataJSON().glassIntensity === "clear"
                ),
                page.getByRole("radio", { name: "通透", exact: true }).click(),
            ]);
            await page.waitForFunction(() =>
                document.documentElement.dataset.glass === "clear"
            );
            await page.getByText(
                "通透会透出壁纸，首页文字可读性随壁纸变化",
            ).waitFor();
            await page.getByText(
                "通透主要影响首页搜索框与应用底板；输入聚焦时及菜单等浮层优先保证可读性。",
            ).waitFor();

            // High contrast and reduced-transparency notices take priority over clear help text while keeping saved glass preference
            await page.getByRole("radio", {
                name: "高对比浅色",
                exact: true,
            }).click();
            await page.waitForFunction(() =>
                document.documentElement.dataset.contrast === "more"
            );
            await page.getByText(
                "高对比主题下玻璃效果以实色显示，切换回其他主题即恢复",
            ).waitFor();
            assertEquals(
                await page.getByText(
                    "通透会透出壁纸，首页文字可读性随壁纸变化",
                ).count(),
                0,
            );
            const cdp = await context.newCDPSession(page);
            await cdp.send("Emulation.setEmulatedMedia", {
                features: [{
                    name: "prefers-reduced-transparency",
                    value: "reduce",
                }],
            });
            await page.getByText(
                "系统已开启「减少透明度」，玻璃效果暂以实色显示",
            ).waitFor();
            await cdp.send("Emulation.setEmulatedMedia", {
                features: [{
                    name: "prefers-reduced-transparency",
                    value: "no-preference",
                }],
            });
            await cdp.detach();
            await page.getByRole("radio", { name: "浅色", exact: true })
                .click();
            await page.waitForFunction(() =>
                document.documentElement.dataset.theme === "light" &&
                !document.documentElement.dataset.contrast
            );
            await page.getByText(
                "通透会透出壁纸，首页文字可读性随壁纸变化",
            ).waitFor();
            assertEquals(
                await page.getByText("应用图标大小", { exact: true }).count(),
                0,
            );
            await Promise.all([
                page.waitForResponse((response) =>
                    response.url().endsWith("/api/preferences") &&
                    response.request().method() === "PATCH" &&
                    response.ok() &&
                    response.request().postDataJSON().showAppLabels === false
                ),
                page.getByRole("switch", { name: "显示应用名称" }).click(),
            ]);
            await page.reload();
            await page.locator('[data-window-id="settings"] .theme-choices')
                .waitFor({ state: "visible" });
            await page.getByRole("radio", {
                name: "胶囊",
                exact: true,
                checked: true,
            }).waitFor();
            assertEquals(
                await page.getByText("应用图标大小", { exact: true }).count(),
                0,
            );
            await page.getByRole("switch", {
                name: "显示应用名称",
                checked: false,
            }).waitFor();
            await page.getByRole("radio", {
                name: "通透",
                exact: true,
                checked: true,
            }).waitFor();
            assertEquals(
                await page.evaluate(() =>
                    document.documentElement.dataset.glass
                ),
                "clear",
            );

            // Cross-page consumer verification on Home (/): concentric search radii and full material switch on focus/blur
            await visit("/");
            const homeResting = await page.evaluate(() => {
                const frame = document.querySelector<HTMLElement>(
                    ".search-frame",
                )!;
                const engine = frame.querySelector<HTMLElement>(
                    ".search-engine",
                )!;
                const submit = frame.querySelector<HTMLElement>(
                    ".search-submit",
                )!;
                const cs = getComputedStyle(frame);
                return {
                    frameRadius: cs.borderRadius,
                    engineRadius: getComputedStyle(engine).borderRadius,
                    submitRadius: getComputedStyle(submit).borderRadius,
                    bgColor: cs.backgroundColor,
                    bgImage: cs.backgroundImage,
                    backdropFilter: cs.backdropFilter,
                    boxShadow: cs.boxShadow,
                };
            });
            assertEquals(homeResting.frameRadius, "999px");
            assertEquals(homeResting.engineRadius, "991px");
            assertEquals(homeResting.submitRadius, "991px");
            assert(
                homeResting.backdropFilter.includes("blur(6px)") &&
                    homeResting.backdropFilter.includes("saturate(1.6)"),
                `resting clear search frame must use --material-regular-filter (blur 6px, saturate 1.6), got: ${homeResting.backdropFilter}`,
            );
            assert(
                homeResting.bgImage.includes("linear-gradient"),
                `resting clear search frame must include --material-regular-sheen, got: ${homeResting.bgImage}`,
            );

            // Focusing search input switches fill, filter and sheen together to Floating thick material
            const searchInput = page.locator("#search-query");
            await searchInput.focus();
            await searchInput.fill("/");
            await page.locator(".search-suggestions").waitFor({
                state: "visible",
            });
            await page.waitForFunction(() =>
                getComputedStyle(document.querySelector(".search-frame")!)
                    .backgroundColor ===
                    getComputedStyle(
                        document.querySelector(".search-suggestions")!,
                    )
                        .backgroundColor
            );
            const homeFocused = await page.evaluate(() => {
                const frame = document.querySelector<HTMLElement>(
                    ".search-frame",
                )!;
                const suggestions = document.querySelector<HTMLElement>(
                    ".search-suggestions",
                )!;
                const suggestionItem = suggestions.querySelector<HTMLElement>(
                    ".suggestion-item",
                )!;
                const cs = getComputedStyle(frame);
                const sugCs = getComputedStyle(suggestions);
                return {
                    matchesFocusVisible: frame.matches(
                        ":has(input:focus-visible)",
                    ),
                    bgColor: cs.backgroundColor,
                    bgImage: cs.backgroundImage,
                    backdropFilter: cs.backdropFilter,
                    boxShadow: cs.boxShadow,
                    suggestionsFilter: sugCs.backdropFilter,
                    suggestionsBgImage: sugCs.backgroundImage,
                    suggestionsRadius: sugCs.borderRadius,
                    suggestionItemRadius:
                        getComputedStyle(suggestionItem).borderRadius,
                };
            });
            assertEquals(homeFocused.matchesFocusVisible, true);
            assert(
                homeFocused.backdropFilter.includes("blur(8px)") &&
                    homeFocused.backdropFilter.includes("saturate(1.8)"),
                `focused search frame must switch to --material-thick-filter (blur 8px, saturate 1.8), got: ${homeFocused.backdropFilter}`,
            );
            assert(
                homeFocused.bgColor !== homeResting.bgColor,
                `focused search frame must switch fill from regular (${homeResting.bgColor}) to thick (${homeFocused.bgColor})`,
            );
            assert(
                homeFocused.bgImage !== homeResting.bgImage &&
                    homeFocused.bgImage === homeFocused.suggestionsBgImage,
                "focused search frame must switch sheen to --material-thick-sheen matching suggestions",
            );
            assert(
                homeFocused.boxShadow !== homeResting.boxShadow,
                "focused search frame must add focus ring shadow",
            );
            assert(
                homeFocused.suggestionsFilter.includes("blur(8px)") &&
                    homeFocused.suggestionsFilter.includes("saturate(1.8)"),
                `search suggestions must use Floating thick filter, got: ${homeFocused.suggestionsFilter}`,
            );
            assertEquals(homeFocused.suggestionsRadius, "14px");
            assertEquals(homeFocused.suggestionItemRadius, "10px");

            // Blurring restores resting clear Material fill, filter and sheen
            await searchInput.evaluate((el: HTMLInputElement) => el.blur());
            await page.waitForFunction(
                (expected) => {
                    const style = getComputedStyle(
                        document.querySelector(".search-frame")!,
                    );
                    return style.backdropFilter === expected.backdropFilter &&
                        style.backgroundColor === expected.bgColor &&
                        style.backgroundImage === expected.bgImage;
                },
                homeResting,
            );
            const homeRestored = await page.evaluate(() => {
                const cs = getComputedStyle(
                    document.querySelector(".search-frame")!,
                );
                return {
                    bgColor: cs.backgroundColor,
                    bgImage: cs.backgroundImage,
                    backdropFilter: cs.backdropFilter,
                };
            });
            assertEquals(homeRestored, {
                bgColor: homeResting.bgColor,
                bgImage: homeResting.bgImage,
                backdropFilter: homeResting.backdropFilter,
            });

            // Account page (/account): inline settings-row fields stay 12px while standalone buttons become pill
            await visit("/account");
            const accountShapes = await page.evaluate(() => {
                const inlineInput = document.querySelector<HTMLInputElement>(
                    'input[aria-label="显示名称"]',
                )!;
                const restRadius = getComputedStyle(inlineInput).borderRadius;
                inlineInput.focus();
                const focusRadius = getComputedStyle(inlineInput).borderRadius;
                const standaloneBtn = Array.from(
                    document.querySelectorAll<HTMLElement>("button"),
                ).find((b) => b.textContent?.trim() === "修改密码")!;
                const avatar = document.querySelector<HTMLElement>(
                    ".account-avatar",
                )!;
                return {
                    restRadius,
                    focusRadius,
                    standaloneBtnRadius:
                        getComputedStyle(standaloneBtn).borderRadius,
                    avatarRadius: getComputedStyle(avatar).borderRadius,
                    avatarWidth: avatar.getBoundingClientRect().width,
                    avatarHeight: avatar.getBoundingClientRect().height,
                };
            });
            assertEquals(accountShapes.restRadius, "12px");
            assertEquals(accountShapes.focusRadius, "12px");
            assertEquals(accountShapes.standaloneBtnRadius, "999px");
            assertEquals(accountShapes.avatarWidth, accountShapes.avatarHeight);
            assert(
                parseFloat(accountShapes.avatarRadius) >=
                    (accountShapes.avatarRadius.endsWith("%")
                        ? 50
                        : accountShapes.avatarWidth / 2),
                "identity avatar remains circular rather than adopting a control corner",
            );

            // Trash page (/trash): default segmented Tabs respond to pill and preserve geometry on rounded restore
            await visit("/trash");
            const trashTabsPill = await page.evaluate(() => {
                const list = document.querySelector<HTMLElement>(
                    '[data-slot="tabs-list"][data-variant="default"]',
                )!;
                const trigger = list.querySelector<HTMLElement>(
                    '[data-slot="tabs-trigger"]',
                )!;
                const listRect = list.getBoundingClientRect();
                const triggerRect = trigger.getBoundingClientRect();
                return {
                    listRadius: getComputedStyle(list).borderRadius,
                    triggerRadius: getComputedStyle(trigger).borderRadius,
                    listWidth: Math.round(listRect.width * 100) / 100,
                    listHeight: Math.round(listRect.height * 100) / 100,
                    triggerWidth: Math.round(triggerRect.width * 100) / 100,
                    triggerHeight: Math.round(triggerRect.height * 100) / 100,
                };
            });
            assertEquals(trashTabsPill.listRadius, "999px");
            assertEquals(trashTabsPill.triggerRadius, "997px");

            await visit("/settings/appearance");
            await page.getByRole("radio", { name: "圆角", exact: true })
                .click();
            await page.waitForFunction(
                () => document.documentElement.dataset.shape === "rounded",
            );

            await visit("/trash");
            const trashTabsRounded = await page.evaluate(() => {
                const list = document.querySelector<HTMLElement>(
                    '[data-slot="tabs-list"][data-variant="default"]',
                )!;
                const trigger = list.querySelector<HTMLElement>(
                    '[data-slot="tabs-trigger"]',
                )!;
                const listRect = list.getBoundingClientRect();
                const triggerRect = trigger.getBoundingClientRect();
                return {
                    listRadius: getComputedStyle(list).borderRadius,
                    triggerRadius: getComputedStyle(trigger).borderRadius,
                    listWidth: Math.round(listRect.width * 100) / 100,
                    listHeight: Math.round(listRect.height * 100) / 100,
                    triggerWidth: Math.round(triggerRect.width * 100) / 100,
                    triggerHeight: Math.round(triggerRect.height * 100) / 100,
                };
            });
            assertEquals(trashTabsRounded.listRadius, "10px");
            assertEquals(trashTabsRounded.triggerRadius, "8px");
            assertEquals(trashTabsRounded.listWidth, trashTabsPill.listWidth);
            assertEquals(trashTabsRounded.listHeight, trashTabsPill.listHeight);
            assertEquals(
                trashTabsRounded.triggerWidth,
                trashTabsPill.triggerWidth,
            );
            assertEquals(
                trashTabsRounded.triggerHeight,
                trashTabsPill.triggerHeight,
            );

            // Home search in rounded mode keeps 20px frame and 12px concentric inner controls (overriding 10px button default)
            await visit("/");
            const homeRounded = await page.evaluate(() => {
                const frame = document.querySelector<HTMLElement>(
                    ".search-frame",
                )!;
                const engine = frame.querySelector<HTMLElement>(
                    ".search-engine",
                )!;
                const submit = frame.querySelector<HTMLElement>(
                    ".search-submit",
                )!;
                return {
                    frameRadius: getComputedStyle(frame).borderRadius,
                    engineRadius: getComputedStyle(engine).borderRadius,
                    submitRadius: getComputedStyle(submit).borderRadius,
                };
            });
            assertEquals(homeRounded.frameRadius, "20px");
            assertEquals(homeRounded.engineRadius, "12px");
            assertEquals(homeRounded.submitRadius, "12px");

            await visit("/settings/appearance");
            await updatePreferences({
                searchShape: "rounded",
                glassIntensity: "regular",
                showAppLabels: true,
            });
            await page.reload();
            await page.locator('[data-window-id="settings"] .theme-choices')
                .waitFor({ state: "visible" });
            // Restore defaults for subsequent tests
            await page.getByRole("radio", { name: "跟随系统", exact: true })
                .click();
            await page.getByRole("radio", { name: "经典蓝" }).click();
            await page.waitForFunction(
                () => document.documentElement.dataset.accent === "blue",
            );
        },
    );
    await t.step(
        "Utility/Management/Workbench/Search geometry has no overflow across 390/768/1440",
        async () => {
            await updatePreferences({ theme: "system" });
            await page.reload();

            const archetypePaths = [
                "/", // Search
                "/settings", // Utility
                "/account", // Utility
                "/admin", // Management
                "/trash", // Management
                "/ask", // Workbench
            ];

            for (const colorScheme of layoutThemes()) {
                await page.emulateMedia({
                    colorScheme,
                    reducedMotion: "reduce",
                });

                for (const width of [390, 768, 1440]) {
                    await page.setViewportSize({ width, height: 900 });

                    for (const path of archetypePaths) {
                        await visit(path, page);
                        await page.waitForFunction(
                            (theme) =>
                                document.documentElement.dataset.theme ===
                                    theme,
                            colorScheme,
                        );

                        const geometry = await page.evaluate(() => {
                            const doc = document.documentElement;
                            const body = document.body;
                            return {
                                docOverflow: doc.scrollWidth > innerWidth,
                                bodyOverflow: body
                                    ? body.scrollWidth > innerWidth
                                    : false,
                                scrollWidth: doc.scrollWidth,
                                innerWidth: innerWidth,
                            };
                        });

                        assertEquals(
                            geometry.docOverflow,
                            false,
                            `Document horizontal overflow at ${path} on ${width}px (${colorScheme}): scrollWidth=${geometry.scrollWidth} > innerWidth=${geometry.innerWidth}`,
                        );
                        assertEquals(
                            geometry.bodyOverflow,
                            false,
                            `Body horizontal overflow at ${path} on ${width}px (${colorScheme})`,
                        );
                    }
                }
            }
        },
    );
    await t.step(
        "Canonical rendering and semantic feedback without checking source classes",
        async () => {
            await page.setViewportSize({ width: 1440, height: 900 });
            // 1. Account page profile update & password validation & logout dialog
            await visit("/account", page);
            await page.getByRole("heading", { name: "账户与安全" }).first()
                .waitFor({ state: "visible" });

            // Update display name
            const displayNameInput = page.getByLabel("显示名称");
            await displayNameInput.fill("Updated Administrator");
            await page.getByRole("button", { name: "保存资料" }).click();
            await page.getByRole("status").filter({
                hasText: "个人资料更新成功",
            }).waitFor({ state: "visible" });
            // Password change lives in a dialog opened from the security row
            await page.getByRole("button", { name: "修改密码" }).click();
            const passwordDialog = page.getByRole("dialog");
            await passwordDialog.waitFor({ state: "visible" });
            const currentPassInput = passwordDialog.getByLabel("当前密码");
            const newPassInput = passwordDialog.getByLabel("新密码", {
                exact: true,
            });
            const confirmPassInput = passwordDialog.getByLabel("确认新密码");

            await currentPassInput.fill(password);
            await newPassInput.fill("New-valid-password-123!");
            await confirmPassInput.fill("Mismatch-different-password-456!");
            await passwordDialog.getByRole("button", { name: "更新密码" })
                .click();
            const mismatch = passwordDialog.getByRole("alert").filter({
                hasText: "两次输入的新密码不一致",
            });
            await mismatch.waitFor({ state: "visible" });
            // The error belongs to the confirm field: it describes that
            // field, which is marked invalid and receives focus.
            assertEquals(
                await confirmPassInput.getAttribute("aria-invalid"),
                "true",
            );
            assert(
                await confirmPassInput.evaluate((input) => {
                    const ids = input.getAttribute("aria-describedby") ?? "";
                    return input === document.activeElement &&
                        ids.split(" ").some((id) =>
                            document.getElementById(id)?.textContent
                                ?.includes("两次输入的新密码不一致")
                        );
                }),
                "mismatch error describes the focused confirm field",
            );
            await passwordDialog.getByRole("button", { name: "取消" }).click();
            await passwordDialog.waitFor({ state: "hidden" });

            // Trigger logout confirmation AlertDialog from the current-device row
            await page.locator(".account-device-item", { hasText: "当前设备" })
                .getByRole("button", { name: "退出", exact: true }).click();
            const dialog = page.getByRole("alertdialog");
            await dialog.waitFor({ state: "visible" });
            await dialog.getByRole("heading", { name: "退出当前设备" }).waitFor(
                {
                    state: "visible",
                },
            );
            await dialog.getByText("确定要退出当前设备吗？").waitFor({
                state: "visible",
            });
            // Optional ephemeral screenshot proof
            await page.screenshot({
                path: `${files}/alert-dialog-proof.png`,
            });

            // Cancel closes AlertDialog without mutation
            await dialog.getByRole("button", { name: "取消" }).click();
            await dialog.waitFor({ state: "hidden" });
            assertEquals(page.url().includes("/account"), true);

            // 2. Trash page empty state canonical rendering
            await visit("/trash", page);
            await page.locator(
                '[data-window-id="trash"] .window-frame__title',
                {
                    hasText: "回收站",
                },
            ).waitFor({
                state: "visible",
            });
            await page.getByRole("heading", { name: "没有已删除的应用" })
                .waitFor({ state: "visible" });
            assertEquals(
                await page.getByRole("tab", { name: "应用 0", exact: true })
                    .count(),
                1,
            );
            assertEquals(
                await page.getByRole("heading", { name: "没有已删除的应用" })
                    .evaluate((el) => getComputedStyle(el).fontWeight),
                "400",
            );

            // Switch to documents tab
            await page.getByRole("tab", { name: /^笔记/ }).click();
            await page.getByRole("heading", { name: "没有已删除的笔记" })
                .waitFor({ state: "visible" });

            // 3. Admin user management table canonical rendering
            await visit("/admin/users", page);
            const table = page.getByRole("table");
            await table.waitFor({ state: "visible" });
            await page.locator("th").filter({ hasText: "用户" }).first()
                .waitFor({
                    state: "visible",
                });
            // The row's more-actions button carries the handle in its aria-label, so a name match
            // hits two cells. Match the identity cell by its visible handle text instead.
            await page.getByRole("cell").filter({ hasText: `@${username}` })
                .waitFor({
                    state: "visible",
                });

            // 4. Ask page workbench layout canonical rendering (no models configured)
            await visit("/ask", page);
            await page.getByRole("button", { name: "新建对话" }).waitFor({
                state: "visible",
            });
            await page.getByText("暂无可用 AI 模型", { exact: true }).waitFor({
                state: "visible",
            });
            await page.getByRole("link", { name: "前往 AI 设置" }).waitFor({
                state: "visible",
            });
        },
    );
});
