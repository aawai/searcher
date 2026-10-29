import { assert, assertEquals } from "@std/assert";
import { eq } from "drizzle-orm";
import type { BrowserContext, Locator, Page } from "playwright";
import { users } from "../../src/db/schema.ts";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

function dockNav(page: Page): Locator {
    return page.locator(
        "nav[aria-label='工作区任务栏']:not([data-ending-style]), nav.dock-bar:not([data-ending-style])",
    );
}

function dockSystemButton(page: Page, name: string): Locator {
    return dockNav(page).getByRole("button", { name, exact: true });
}

function dockAppButton(page: Page, name: string): Locator {
    return dockNav(page).getByRole("button", { name, exact: true });
}

function dockOptionsMenu(page: Page): Locator {
    return dockNav(page).locator(
        'button[data-dock-action="menu"], button[aria-label="任务栏选项"]',
    );
}

function dockManagementModal(page: Page): Locator {
    return page.locator('[data-dock-modal="management"]');
}

async function openDockManagement(page: Page): Promise<Locator> {
    await dockOptionsMenu(page).click();
    await page.getByRole("menuitem", { name: "管理任务栏" }).click();
    const modal = dockManagementModal(page);
    await modal.waitFor({ state: "visible" });
    return modal;
}

async function setDockEdgeViaManagement(
    page: Page,
    label: string,
): Promise<void> {
    const modal = await openDockManagement(page);
    await modal.getByRole("radio", { name: label, exact: true }).click();
    await modal.getByRole("button", { name: "关闭" }).click();
    await modal.waitFor({ state: "hidden" });
}

async function collapseDockViaMenu(page: Page): Promise<void> {
    const menuBtn = dockOptionsMenu(page);
    await menuBtn.waitFor({ state: "visible" });
    await menuBtn.click();
    const collapseItem = page.getByRole("menuitem", { name: "收起任务栏" });
    await collapseItem.waitFor({ state: "visible" });
    await collapseItem.click();
}

function expandBall(page: Page): Locator {
    return page.locator(
        'button[data-dock-action="expand"]:not([data-ending-style]), button[aria-label="展开任务栏"]:not([data-ending-style]), .dock-ball:not([data-ending-style])',
    );
}

function userMenuTrigger(page: Page): Locator {
    return page.getByRole("button", { name: /^用户菜单/ }).or(
        page.locator(".user-avatar-trigger"),
    );
}

async function registerFreshUser(
    page: Page,
    origin: string,
    username: string,
    password = "Dock-password-2026!",
    displayName = "Dock Tester",
): Promise<{ username: string; password: string }> {
    await page.goto(origin + "/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill(displayName);
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main.home").waitFor({ state: "visible" });
    return { username, password };
}

async function createWebApp(
    context: BrowserContext,
    origin: string,
    data: {
        name: string;
        url: string;
        isHomeFixed?: boolean;
    },
): Promise<{ id: string; name: string }> {
    const response = await context.request.post(origin + "/api/webapps", {
        headers: { Origin: origin },
        data: {
            name: data.name,
            url: data.url,
            isHomeFixed: data.isHomeFixed ?? false,
            openMode: "new_tab",
        },
    });
    assert(response.ok(), await response.text());
    const body = await response.json();
    return body.data;
}

Deno.test("workspace dock: guest has no dock, first login has six system items and no copied home apps", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    await t.step("guest visiting home has no workspace dock", async () => {
        const guestContext = await browser.newContext({
            viewport: { width: 1280, height: 800 },
        });
        cleanup.defer(() => guestContext.close());
        const guestPage = await guestContext.newPage();

        await guestPage.goto(app.origin + "/");
        await guestPage.locator("main.home").waitFor({ state: "visible" });
        await guestPage.locator("#search-query").waitFor({ state: "visible" });

        assertEquals(
            await dockNav(guestPage).count(),
            0,
            "guest session must not display workspace dock",
        );
    });

    await t.step(
        "first login displays six system items, no pinned apps and independent from home apps",
        async () => {
            const context = await browser.newContext({
                viewport: { width: 1280, height: 800 },
            });
            cleanup.defer(() => context.close());
            const page = await context.newPage();

            await registerFreshUser(page, app.origin, "dock_fresh_user_1");
            const homeOnly = await createWebApp(context, app.origin, {
                name: "首页固定但不复制到任务栏",
                url: "https://home-only.example.test/",
                isHomeFixed: true,
            });
            await page.reload();
            await page.locator(
                `.launcher-grid--home [data-app-id="${homeOnly.id}"]`,
            )
                .waitFor({ state: "visible" });

            // Dock navigation is mounted and visible
            const dock = dockNav(page);
            await dock.waitFor({ state: "visible" });

            // All six system entries are present
            assertEquals(
                await dockSystemButton(page, "首页").isVisible(),
                true,
            );
            assertEquals(
                await dockSystemButton(page, "应用").isVisible(),
                true,
            );
            assertEquals(
                await dockSystemButton(page, "笔记").isVisible(),
                true,
            );
            assertEquals(
                await dockSystemButton(page, "AI 问答").isVisible(),
                true,
            );
            assertEquals(
                await dockSystemButton(page, "设置").isVisible(),
                true,
            );
            assertEquals(
                await dockSystemButton(page, "回收站").isVisible(),
                true,
            );
            assertEquals(await dock.locator("button[data-dock-id]").count(), 6);

            // No app items pinned to dock initially
            assertEquals(
                await dock.locator("button[data-dock-app-id]").count(),
                0,
                "initial dock has no pinned apps",
            );

            // Preferences API verification: dock preferences are canonical defaults
            const prefRes = await context.request.get(
                app.origin + "/api/preferences",
            );
            assert(prefRes.ok());
            const prefBody = await prefRes.json();
            assertEquals(prefBody.data.dock, {
                systemOrder: [
                    "home",
                    "apps",
                    "notes",
                    "ai",
                    "settings",
                    "trash",
                ],
                hiddenSystemIds: [],
                appIds: [],
            });
        },
    );
});

Deno.test("workspace dock: system navigation, nonmodal panels, and browser back/close behavior", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();

    await registerFreshUser(page, app.origin, "dock_nav_user");
    await dockNav(page).waitFor({ state: "visible" });

    await t.step(
        "clicking 笔记 opens nonmodal notes panel while home remains interactive",
        async () => {
            await dockSystemButton(page, "笔记").click();
            await page.waitForURL((url) =>
                url.searchParams.get("view") === "notes"
            );

            const notesPanel = page.locator('[data-library="notes"]');
            await notesPanel.waitFor({ state: "visible" });

            // Verify home surface remains interactive (non-modal contract)
            const searchInput = page.locator("#search-query");
            await searchInput.waitFor({ state: "visible" });
            assertEquals(await searchInput.getAttribute("inert"), null);
            await searchInput.fill("非模态主页验证");
            assertEquals(await searchInput.inputValue(), "非模态主页验证");
            await searchInput.fill("");
        },
    );

    await t.step(
        "switching to 应用 swaps to apps panel without full reload",
        async () => {
            await dockSystemButton(page, "应用").click();
            await page.waitForURL((url) =>
                url.searchParams.get("view") === "apps"
            );

            const appsPanel = page.locator('[data-library="apps"]');
            await appsPanel.waitFor({ state: "visible" });
        },
    );

    await t.step(
        "browser back restores notes panel, then back to home closes panel",
        async () => {
            await page.goBack();
            await page.waitForURL((url) =>
                url.searchParams.get("view") === "notes"
            );
            await page.locator('[data-library="notes"]').waitFor({
                state: "visible",
            });

            await page.goBack();
            await page.waitForURL((url) =>
                url.pathname === "/" && !url.searchParams.has("view")
            );
            await page.locator("[data-library]").waitFor({ state: "detached" });
        },
    );

    await t.step(
        "panel close button with label '返回首页' closes panel and updates URL",
        async () => {
            await dockSystemButton(page, "应用").click();
            await page.waitForURL((url) =>
                url.searchParams.get("view") === "apps"
            );
            await page.locator('[data-library="apps"]').waitFor({
                state: "visible",
            });

            const closeBtn = page.getByRole("button", { name: "返回首页" });
            await closeBtn.waitFor({ state: "visible" });
            await closeBtn.click();

            await page.waitForURL((url) =>
                url.pathname === "/" && !url.searchParams.has("view")
            );
            await page.locator("[data-library]").waitFor({ state: "detached" });
        },
    );

    await t.step(
        "clicking dock '首页' button when panel is open closes panel",
        async () => {
            await dockSystemButton(page, "笔记").click();
            await page.waitForURL((url) =>
                url.searchParams.get("view") === "notes"
            );
            await page.locator('[data-library="notes"]').waitFor({
                state: "visible",
            });

            await dockSystemButton(page, "首页").click();
            await page.waitForURL((url) =>
                url.pathname === "/" && !url.searchParams.has("view")
            );
            await page.locator("[data-library]").waitFor({ state: "detached" });
        },
    );
    await t.step(
        "settings and trash keep the dock and desktop while opening windows",
        async () => {
            for (
                const [label, path, id] of [
                    ["设置", "/settings", "settings"],
                    ["回收站", "/trash", "trash"],
                ] as const
            ) {
                await dockSystemButton(page, label).click();
                await page.waitForURL(app.origin + path);
                const frame = page.locator(`[data-window-id="${id}"]`);
                await frame.waitFor({ state: "visible" });
                await dockNav(page).waitFor({ state: "visible" });
                assertEquals(await page.locator("main.home").count(), 1);
                await page.goBack();
                await page.waitForURL(app.origin + "/");
                await frame.waitFor({ state: "hidden" });
            }
        },
    );

    await t.step(
        "mobile viewport: notes panel does not obscure dock geometrically and dock switches to apps",
        async () => {
            await page.setViewportSize({ width: 390, height: 844 });
            await dockSystemButton(page, "笔记").click();
            await page.waitForURL((url) =>
                url.searchParams.get("view") === "notes"
            );

            const notesPanel = page.locator('[data-library="notes"]').first();
            await notesPanel.waitFor({ state: "visible" });
            const dock = dockNav(page);
            await dock.waitFor({ state: "visible" });
            await page.waitForFunction(
                () => {
                    const panel = document.querySelector(
                        '[data-library="notes"]',
                    );
                    const bar = document.querySelector("nav.dock-bar");
                    if (!panel || !bar) return false;
                    const panelRect = panel.getBoundingClientRect();
                    const dockRect = bar.getBoundingClientRect();
                    return panelRect.height > 0 &&
                        panelRect.bottom <= dockRect.top + 1;
                },
                undefined,
                { timeout: 5000 },
            );

            const panelBox = (await notesPanel.boundingBox())!;
            const dockBox = (await dock.boundingBox())!;

            // Panel must not cover or obscure the dock: panel bottom edge must be above or at dock top edge
            assert(
                panelBox.y + panelBox.height <= dockBox.y + 1,
                `mobile panel bottom (${
                    panelBox.y + panelBox.height
                }) must be <= dock top (${dockBox.y})`,
            );

            // Click 应用 button directly on dock while notes panel is open on mobile
            await dockSystemButton(page, "应用").click();
            await page.waitForURL((url) =>
                url.searchParams.get("view") === "apps"
            );

            const appsPanel = page.locator('[data-library="apps"]').first();
            await appsPanel.waitFor({ state: "visible" });

            // Restore desktop viewport
            await page.setViewportSize({ width: 1280, height: 800 });
            await page.getByRole("button", { name: "返回首页" }).click();
            await page.waitForURL((url) =>
                url.pathname === "/" && !url.searchParams.has("view")
            );
        },
    );
});

Deno.test("workspace dock: user avatar menu contains strictly 5 permission-controlled items", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();

    const normalCreds = await registerFreshUser(
        page,
        app.origin,
        "normal_dock_user",
    );

    await t.step(
        "normal user avatar menu has strictly 4 items (no admin, no library/notes/ai)",
        async () => {
            await userMenuTrigger(page).click();
            const menu = page.locator('[role="menu"]');
            await menu.waitFor({ state: "visible" });

            const items = await menu.getByRole("menuitem").allInnerTexts();
            const cleaned = items.map((t) => t.trim().replace(/\s+/g, " "));

            assertEquals(
                cleaned.includes("账户与安全"),
                true,
                "账户与安全 must be present",
            );
            assertEquals(
                cleaned.includes("设置"),
                true,
                "设置 must be present",
            );
            assertEquals(
                cleaned.includes("回收站"),
                true,
                "回收站 must be present",
            );
            assertEquals(
                cleaned.includes("退出登录"),
                true,
                "退出登录 must be present",
            );
            assertEquals(
                cleaned.includes("管理后台"),
                false,
                "normal user must not see 管理后台",
            );
            assertEquals(
                cleaned.includes("资料库"),
                false,
                "legacy 资料库 must be removed",
            );
            assertEquals(
                cleaned.includes("笔记"),
                false,
                "legacy 笔记 must be removed from avatar menu",
            );
            assertEquals(
                cleaned.includes("AI 问答"),
                false,
                "legacy AI 问答 must be removed from avatar menu",
            );
            assertEquals(
                cleaned.length,
                4,
                `expected exactly 4 items, got: ${cleaned.join(", ")}`,
            );

            await page.keyboard.press("Escape");
            await menu.waitFor({ state: "hidden" });
        },
    );

    await t.step(
        "admin user avatar menu has strictly 5 items (including 管理后台)",
        async () => {
            // Upgrade normal user to admin
            await app.store.run(async (db) => {
                await db.update(users).set({ role: "admin" }).where(
                    eq(users.username, normalCreds.username),
                );
            });

            await page.reload();
            await page.locator("main.home").waitFor({ state: "visible" });

            await userMenuTrigger(page).click();
            const menu = page.locator('[role="menu"]');
            await menu.waitFor({ state: "visible" });

            const items = await menu.getByRole("menuitem").allInnerTexts();
            const cleaned = items.map((t) => t.trim().replace(/\s+/g, " "));

            assertEquals(cleaned.includes("账户与安全"), true);
            assertEquals(cleaned.includes("设置"), true);
            assertEquals(
                cleaned.includes("管理后台"),
                true,
                "admin must see 管理后台",
            );
            assertEquals(cleaned.includes("回收站"), true);
            assertEquals(cleaned.includes("退出登录"), true);
            assertEquals(cleaned.includes("资料库"), false);
            assertEquals(cleaned.includes("笔记"), false);
            assertEquals(cleaned.includes("AI 问答"), false);
            assertEquals(
                cleaned.length,
                5,
                `expected exactly 5 items, got: ${cleaned.join(", ")}`,
            );

            await page.keyboard.press("Escape");
        },
    );
});

Deno.test("workspace dock: app menu pinning, independence from home, and management modal / options menu", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();

    await registerFreshUser(page, app.origin, "dock_pinning_user");

    // Create App A (not pinned to home) and App B (pinned to home)
    const appA = await createWebApp(context, app.origin, {
        name: "Dock App Alpha",
        url: "https://alpha.dock.test/",
        isHomeFixed: false,
    });
    const appB = await createWebApp(context, app.origin, {
        name: "Dock App Beta",
        url: "https://beta.dock.test/",
        isHomeFixed: true,
    });

    await page.reload();
    await dockNav(page).waitFor({ state: "visible" });

    await t.step(
        "pinning app to dock from app library context menu adds to dock and preserves home independence",
        async () => {
            await dockSystemButton(page, "应用").click();
            const appsView = page.locator("[data-library-apps]");
            await appsView.waitFor({ state: "visible" });

            const tileA = appsView.locator(`[data-app-id="${appA.id}"]`);
            await tileA.waitFor({ state: "visible" });
            await tileA.click({ button: "right" });

            const pinMenuItem = page.getByRole("menuitem", {
                name: "固定到任务栏",
            });
            await pinMenuItem.waitFor({ state: "visible" });
            await pinMenuItem.click();

            // App Alpha appears on dock
            const dockBtnA = dockAppButton(page, "Dock App Alpha");
            await dockBtnA.waitFor({ state: "visible" });

            // Verify home fixed status of App Alpha is still false
            await page.getByRole("button", { name: "返回首页" }).click();
            await page.locator("main.home").waitFor({ state: "visible" });
            assertEquals(
                await page.locator(
                    `.launcher-grid--home [data-tile-id="${appA.id}"]`,
                ).count(),
                0,
                "pinning to dock must not pin to home",
            );
        },
    );

    await t.step("pinning second app to dock displays both apps", async () => {
        await dockSystemButton(page, "应用").click();
        const appsView = page.locator("[data-library-apps]");
        await appsView.waitFor({ state: "visible" });

        const tileB = appsView.locator(`[data-app-id="${appB.id}"]`);
        await tileB.waitFor({ state: "visible" });
        await tileB.click({ button: "right" });

        await page.getByRole("menuitem", { name: "固定到任务栏" }).click();
        await dockAppButton(page, "Dock App Beta").waitFor({
            state: "visible",
        });

        // Both Alpha and Beta are present
        assertEquals(
            await dockAppButton(page, "Dock App Alpha").isVisible(),
            true,
        );
        assertEquals(
            await dockAppButton(page, "Dock App Beta").isVisible(),
            true,
        );
        await page.getByRole("button", { name: "返回首页" }).click();
    });

    await t.step(
        "management configures system visibility without duplicating app actions",
        async () => {
            await dockOptionsMenu(page).click();
            assertEquals(
                await page.locator("[data-dock-overflow-app]").count(),
                0,
                "non-overflowing dock does not list apps in the options menu",
            );
            await page.getByRole("menuitem", { name: "管理任务栏" }).click();
            const modal = dockManagementModal(page);
            await modal.waitFor({ state: "visible" });
            assertEquals(await modal.getByRole("switch").count(), 6);
            assertEquals(
                await modal.getByRole("radiogroup", { name: "任务栏位置" })
                    .count(),
                1,
            );
            assertEquals(
                await modal.getByRole("radiogroup", { name: "任务栏展示模式" })
                    .count(),
                0,
            );
            assertEquals(
                await modal.getByRole("heading", { name: /^固定应用/ }).count(),
                0,
            );
            await modal.getByRole("switch", { name: "显示 AI 问答" }).click();
            await modal.getByRole("switch", { name: "显示 设置" }).click();
            await modal.getByRole("switch", { name: "显示 回收站" }).click();
            await modal.getByRole("button", { name: "关闭" }).click();
            await modal.waitFor({ state: "hidden" });
            assertEquals(
                await dockNav(page).locator('[data-dock-id="settings"]')
                    .count(),
                0,
            );
            assertEquals(
                await dockNav(page).locator('[data-dock-id="trash"]').count(),
                0,
            );
            const restoreModal = await openDockManagement(page);
            await restoreModal.getByRole("switch", { name: "显示 设置" })
                .click();
            await restoreModal.getByRole("switch", { name: "显示 回收站" })
                .click();
            await restoreModal.getByRole("button", { name: "关闭" }).click();
            await restoreModal.waitFor({ state: "hidden" });
            assertEquals(
                await dockNav(page).locator('[data-dock-id="ai"]').count(),
                0,
            );
            assertEquals(
                await dockSystemButton(page, "首页").isVisible(),
                true,
            );
            assertEquals(
                await dockSystemButton(page, "应用").isVisible(),
                true,
            );
            assertEquals(
                await dockSystemButton(page, "笔记").isVisible(),
                true,
            );
        },
    );

    await t.step(
        "taskbar context menu reorders and unpins without deleting the application or home pin",
        async () => {
            await dockAppButton(page, appA.name).click({ button: "right" });
            await page.getByRole("menuitem", { name: "向右移动" }).click();
            await page.waitForFunction(([first, second]) =>
                Array.from(
                    document.querySelectorAll<HTMLElement>(
                        "[data-dock-app-id]",
                    ),
                    (item) => item.dataset.dockAppId,
                ).slice(0, 2).join(",") === `${first},${second}`, [
                appB.id,
                appA.id,
            ]);
            await dockAppButton(page, appB.name).click({ button: "right" });
            await page.getByRole("menuitem", { name: "取消任务栏固定" })
                .click();
            await dockAppButton(page, appB.name).waitFor({ state: "detached" });
            await page.waitForFunction(async (id) => {
                const response = await fetch("/api/preferences");
                const body = await response.json();
                return !body.data.dock.appIds.includes(id);
            }, appB.id);
            const appsResponse = await context.request.get(
                app.origin + "/api/webapps",
            );
            assert(appsResponse.ok());
            const appList = (await appsResponse.json()).data as Array<{
                id: string;
                isHomeFixed: boolean;
            }>;
            assertEquals(
                appList.find((item) => item.id === appB.id)?.isHomeFixed,
                true,
            );

            await dockSystemButton(page, "应用").click();
            const appsView = page.locator("[data-library-apps]");
            await appsView.locator(`[data-app-id="${appB.id}"]`).click({
                button: "right",
            });
            await page.getByRole("menuitem", { name: "固定到任务栏" }).click();
            await dockAppButton(page, appB.name).waitFor({ state: "visible" });
            await page.getByRole("button", { name: "返回首页" }).click();
            await appsView.waitFor({ state: "detached" });
        },
    );

    await t.step(
        "keyboard opens the taskbar item menu, sorts, and restores focus",
        async () => {
            const notes = dockSystemButton(page, "笔记");
            await notes.focus();
            await page.keyboard.press("Shift+F10");
            const menu = page.locator("[data-dock-item-menu]");
            await menu.waitFor();
            await menu.getByRole("menuitem", { name: "向左移动" }).focus();
            await page.keyboard.press("Enter");
            await page.waitForFunction(() =>
                Array.from(
                    document.querySelectorAll<HTMLElement>("[data-dock-id]"),
                    (item) => item.dataset.dockId,
                ).join(",") === "home,notes,apps,settings,trash"
            );
            assertEquals(new URL(page.url()).search, "");
            await page.waitForFunction(() =>
                document.activeElement?.getAttribute("data-dock-id") === "notes"
            );

            await page.keyboard.press("Shift+F10");
            await menu.waitFor();
            await page.keyboard.press("Escape");
            await menu.waitFor({ state: "hidden" });
            await page.waitForFunction(() =>
                document.activeElement?.getAttribute("data-dock-id") === "notes"
            );
        },
    );

    await t.step("new system entries can be reordered", async () => {
        await dockSystemButton(page, "回收站").click({ button: "right" });
        await page.getByRole("menuitem", { name: "向左移动" }).click();
        await page.waitForFunction(() =>
            Array.from(
                document.querySelectorAll<HTMLElement>("[data-dock-id]"),
                (item) => item.dataset.dockId,
            ).join(",") === "home,notes,apps,trash,settings"
        );
    });

    await t.step("settings no longer duplicates taskbar controls", async () => {
        await page.goto(app.origin + "/settings/appearance");
        await page.getByRole("navigation", { name: "设置分类" }).waitFor({
            state: "visible",
        });
        assertEquals(
            await page.getByRole("heading", { name: "任务栏", exact: true })
                .count(),
            0,
        );
        assertEquals(
            await page.getByRole("radiogroup", { name: "任务栏位置" }).count(),
            0,
        );
        assertEquals(
            await page.getByRole("switch", { name: "显示 笔记" }).count(),
            0,
        );
        await page.goto(app.origin + "/");
        await dockNav(page).waitFor({ state: "visible" });
        const modal = await openDockManagement(page);
        await modal.getByRole("switch", { name: "显示 笔记" }).click();
        await modal.getByRole("switch", { name: "显示 AI 问答" }).click();
        await modal.getByRole("button", { name: "关闭" }).click();
        await modal.waitFor({ state: "hidden" });
        assertEquals(
            await dockNav(page).locator('[data-dock-id="notes"]').count(),
            0,
        );
        assertEquals(await dockSystemButton(page, "AI 问答").isVisible(), true);
    });
});

Deno.test("workspace dock: desktop four edges, collapsible floating ball with refresh recovery, and mobile bottom isolation", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();

    await registerFreshUser(page, app.origin, "dock_layout_user");

    await t.step("desktop four edges placement switching", async () => {
        for (const edge of ["top", "left", "right", "bottom"] as const) {
            const edgeNames: Record<string, string> = {
                top: "顶部",
                left: "左侧",
                right: "右侧",
                bottom: "底部",
            };
            await setDockEdgeViaManagement(page, edgeNames[edge]);
            await page.locator(
                `.app-shell[data-dock-edge="${edge}"], .dock-container[data-edge="${edge}"]`,
            ).first().waitFor();
        }
    });

    await t.step(
        "floating ball persists across page reload",
        async () => {
            await collapseDockViaMenu(page);

            // Dock is collapsed into floating ball
            const ball = expandBall(page);
            await ball.waitFor({ state: "visible" });
            assertEquals(
                await dockNav(page).count(),
                0,
                "dock nav unmounted or hidden while collapsed",
            );

            await page.waitForFunction(() =>
                Number.parseFloat(
                    getComputedStyle(document.documentElement)
                        .getPropertyValue("--dock-inset-bottom"),
                ) === 0
            );

            // Reload page to verify collapsed state persists
            await page.reload();
            await expandBall(page).waitFor({ state: "visible" });
            assertEquals(
                await dockNav(page).count(),
                0,
                "dock stays collapsed after reload",
            );

            // Click floating ball to expand
            await expandBall(page).click();
            await dockNav(page).waitFor({ state: "visible" });
            await page.waitForFunction(() =>
                Number.parseFloat(
                    getComputedStyle(document.documentElement)
                        .getPropertyValue("--dock-inset-bottom"),
                ) > 0
            );
            assertEquals(
                await dockSystemButton(page, "首页").isVisible(),
                true,
            );

            // Keyboard Enter and Space on floating ball activate once and expand dock
            await collapseDockViaMenu(page);
            await expandBall(page).waitFor({ state: "visible" });
            await expandBall(page).focus();
            await page.keyboard.press("Enter");
            await dockNav(page).waitFor({ state: "visible" });
            await expandBall(page).waitFor({ state: "detached" });

            await collapseDockViaMenu(page);
            await expandBall(page).waitFor({ state: "visible" });
            await expandBall(page).focus();
            await page.keyboard.press(" ");
            await dockNav(page).waitFor({ state: "visible" });
            await expandBall(page).waitFor({ state: "detached" });
        },
    );

    await t.step(
        "mobile viewport locks dock to bottom without overwriting desktop layout",
        async () => {
            await setDockEdgeViaManagement(page, "左侧");
            await page.locator(
                `.app-shell[data-dock-edge="left"], .dock-container[data-edge="left"]`,
            ).first().waitFor();

            // Switch to mobile viewport (< 768px)
            await page.setViewportSize({ width: 390, height: 844 });
            // On mobile, effective dock edge is forced to bottom
            await page.locator(
                `.app-shell[data-dock-edge="bottom"], .dock-container[data-edge="bottom"]`,
            ).first().waitFor();

            // Switch back to desktop viewport
            await page.setViewportSize({ width: 1280, height: 800 });

            // Desktop layout edge remains "left", not overwritten by mobile
            await page.locator(
                `.app-shell[data-dock-edge="left"], .dock-container[data-edge="left"]`,
            ).first().waitFor();
        },
    );
});

Deno.test("workspace dock: four saved edges survive the 767/768 boundary with reachable overflow and matching insets", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
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
    cleanup.defer(() => context.close());
    const page = await context.newPage();
    await registerFreshUser(page, app.origin, "dock_boundary_user");

    const appIds: string[] = [];
    for (let i = 1; i <= 14; i++) {
        const pinned = await createWebApp(context, app.origin, {
            name: `Boundary App ${i}`,
            url: `https://boundary-${i}.example.test/`,
        });
        appIds.push(pinned.id);
    }
    const response = await context.request.patch(
        app.origin + "/api/preferences",
        {
            headers: { Origin: app.origin },
            data: {
                dock: {
                    systemOrder: [
                        "notes",
                        "home",
                        "apps",
                        "ai",
                        "settings",
                        "trash",
                    ],
                    hiddenSystemIds: ["ai"],
                    appIds,
                },
            },
        },
    );
    assert(response.ok(), await response.text());
    await page.reload();
    await dockNav(page).waitFor({ state: "visible" });

    for (
        const [savedEdge, label] of [
            ["top", "顶部"],
            ["bottom", "底部"],
            ["left", "左侧"],
            ["right", "右侧"],
        ] as const
    ) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await setDockEdgeViaManagement(page, label);

        for (const width of [1440, 767, 768, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            if (width === 767) await page.reload();
            const edge = width < 768 ? "bottom" : savedEdge;
            await page.waitForFunction((expectedEdge) => {
                const dock = document.querySelector<HTMLElement>(
                    ".dock-container",
                );
                const shell = document.querySelector<HTMLElement>(
                    ".app-shell",
                );
                if (
                    !dock || dock.dataset.edge !== expectedEdge ||
                    shell?.dataset.dockEdge !== expectedEdge
                ) return false;
                const r = dock.getBoundingClientRect();
                const expectedInset = {
                    top: r.bottom,
                    right: innerWidth - r.left,
                    bottom: innerHeight - r.top,
                    left: r.right,
                }[expectedEdge];
                const actualInset = Number.parseFloat(
                    getComputedStyle(document.documentElement)
                        .getPropertyValue(`--dock-inset-${expectedEdge}`),
                );
                return Math.abs(actualInset - expectedInset) < 1;
            }, edge);

            const geometry = await page.evaluate(() => {
                const dock = document.querySelector<HTMLElement>(
                    ".dock-container",
                )!;
                const r = dock.getBoundingClientRect();
                const root = getComputedStyle(document.documentElement);
                return {
                    gaps: {
                        top: r.top,
                        right: innerWidth - r.right,
                        bottom: innerHeight - r.bottom,
                        left: r.left,
                    },
                    insets: Object.fromEntries(
                        ["top", "right", "bottom", "left"].map((e) => [
                            e,
                            Number.parseFloat(
                                root.getPropertyValue(`--dock-inset-${e}`),
                            ),
                        ]),
                    ),
                    systemIds: Array.from(
                        dock.querySelectorAll<HTMLElement>("[data-dock-id]"),
                        (item) => item.dataset.dockId,
                    ),
                };
            });
            assert(
                geometry.gaps[edge] >= 0 && geometry.gaps[edge] <= 16,
                `${width}px ${edge} dock must remain against its edge`,
            );
            for (const other of ["top", "right", "bottom", "left"] as const) {
                if (other !== edge) assertEquals(geometry.insets[other], 0);
            }
            assertEquals(geometry.systemIds, [
                "notes",
                "home",
                "apps",
                "settings",
                "trash",
            ]);

            const apps = dockNav(page).locator(".dock-group--apps");
            const vertical = edge === "left" || edge === "right";
            const overflow = await apps.evaluate((group) => ({
                width: group.scrollWidth - group.clientWidth,
                height: group.scrollHeight - group.clientHeight,
            }));
            assert(
                (vertical ? overflow.height : overflow.width) > 0,
                `${width}px ${edge} pinned apps must overflow on the dock axis`,
            );
            await apps.evaluate((group) => {
                group.scrollLeft = group.scrollWidth;
                group.scrollTop = group.scrollHeight;
            });
            await page.waitForFunction(() => {
                const group = document.querySelector(".dock-group--apps");
                return group?.hasAttribute("data-overflow-start") &&
                    !group.hasAttribute("data-overflow-end");
            });
            const groupBox = (await apps.boundingBox())!;
            const lastBox = (await apps.locator("[data-dock-app-id]").last()
                .boundingBox())!;
            assert(
                vertical
                    ? lastBox.y + lastBox.height <=
                        groupBox.y + groupBox.height + 1
                    : lastBox.x + lastBox.width <=
                        groupBox.x + groupBox.width + 1,
                `${width}px ${edge} last pinned app must be reachable`,
            );
        }
    }
});

Deno.test("workspace dock: multi-context cloud sync and independent device layout", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    const creds = {
        username: "dock_multicontext_user",
        password: "Password-multicontext-1!",
    };

    // Device Context A (e.g. Work PC)
    const contextA = await browser.newContext({
        viewport: { width: 1280, height: 800 },
    });
    cleanup.defer(() => contextA.close());
    const pageA = await contextA.newPage();

    await registerFreshUser(pageA, app.origin, creds.username, creds.password);

    // Create app and pin to dock in Context A
    const cloudApp = await createWebApp(contextA, app.origin, {
        name: "Cloud Synced App",
        url: "https://synced.dock.test/",
    });

    await setDockEdgeViaManagement(pageA, "右侧");
    await pageA.locator(
        `.app-shell[data-dock-edge="right"], .dock-container[data-edge="right"]`,
    ).first().waitFor();
    // Pin app to dock via API
    await contextA.request.patch(app.origin + "/api/preferences", {
        headers: { Origin: app.origin },
        data: {
            dock: {
                systemOrder: [
                    "home",
                    "apps",
                    "notes",
                    "ai",
                    "settings",
                    "trash",
                ],
                appIds: [cloudApp.id],
            },
        },
    });

    // Device Context B (e.g. Laptop)
    const contextB = await browser.newContext({
        viewport: { width: 1280, height: 800 },
    });
    cleanup.defer(() => contextB.close());
    const pageB = await contextB.newPage();

    await loginAndVisit(pageB, app.origin, "/", creds);
    await dockNav(pageB).waitFor({ state: "visible" });

    await t.step(
        "Context B syncs cloud-pinned apps from user preferences",
        async () => {
            // App pinned in Context A appears on Context B dock
            await dockAppButton(pageB, "Cloud Synced App").waitFor({
                state: "visible",
            });
        },
    );

    await t.step(
        "Context B maintains its own local device layout independent of Context A",
        async () => {
            // Context B defaults to bottom edge, not Context A's right edge
            await pageB.locator(
                `.app-shell[data-dock-edge="bottom"], .dock-container[data-edge="bottom"]`,
            ).first().waitFor();

            // Change Context B edge to top
            await setDockEdgeViaManagement(pageB, "顶部");
            await pageB.locator(
                `.app-shell[data-dock-edge="top"], .dock-container[data-edge="top"]`,
            ).first().waitFor();

            // Check Context A: still right edge
            await pageA.locator(
                `.app-shell[data-dock-edge="right"], .dock-container[data-edge="right"]`,
            ).first().waitFor();
        },
    );
});

Deno.test("workspace dock: soft-deleted app is removed from dock and does not re-pin upon restore", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();

    await registerFreshUser(page, app.origin, "dock_trash_user");

    const ephemeralApp = await createWebApp(context, app.origin, {
        name: "Ephemeral Dock App",
        url: "https://ephemeral.dock.test/",
    });

    // Pin app to dock
    await context.request.patch(app.origin + "/api/preferences", {
        headers: { Origin: app.origin },
        data: {
            dock: {
                systemOrder: [
                    "home",
                    "apps",
                    "notes",
                    "ai",
                    "settings",
                    "trash",
                ],
                appIds: [ephemeralApp.id],
            },
        },
    });

    await page.reload();
    await dockNav(page).waitFor({ state: "visible" });
    await dockAppButton(page, "Ephemeral Dock App").waitFor({
        state: "visible",
    });

    // Soft delete the app
    const deleteRes = await context.request.delete(
        `${app.origin}/api/webapps/${ephemeralApp.id}`,
        { headers: { Origin: app.origin } },
    );
    assert(deleteRes.ok(), await deleteRes.text());

    await page.reload();
    await dockNav(page).waitFor({ state: "visible" });

    // Verify app is removed from dock
    assertEquals(
        await dockNav(page).locator(`[data-dock-app-id="${ephemeralApp.id}"]`)
            .count(),
        0,
        "soft-deleted app must be removed from dock",
    );

    // Restore app from trash
    const restoreRes = await context.request.post(
        `${app.origin}/api/webapps/${ephemeralApp.id}/restore`,
        { headers: { Origin: app.origin } },
    );
    assert(restoreRes.ok(), await restoreRes.text());

    await page.reload();
    await dockNav(page).waitFor({ state: "visible" });

    // Restored app exists in library, but MUST NOT automatically re-pin to dock
    assertEquals(
        await dockNav(page).locator(`[data-dock-app-id="${ephemeralApp.id}"]`)
            .count(),
        0,
        "restored app must not automatically re-pin to dock",
    );

    // Verify app exists in apps view
    await dockSystemButton(page, "应用").click();
    await page.locator(
        `[data-library-apps] [data-app-id="${ephemeralApp.id}"]`,
    ).waitFor({ state: "visible" });
});

Deno.test("workspace dock: AI no-model entry point is explicitly reachable and informative", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();

    // Fresh user without seeded AI providers/models
    await registerFreshUser(page, app.origin, "dock_nomodel_user");

    const aiButton = dockSystemButton(page, "AI 问答");
    await aiButton.waitFor({ state: "visible" });

    // Clicking AI 问答 still successfully navigates to /ask without crashing
    await aiButton.click();
    await page.waitForURL((url) => url.pathname.startsWith("/ask"));

    await page.getByText("暂无可用 AI 模型", { exact: true }).waitFor();
    assertEquals(
        await page.getByRole("region", { name: "对话工作区", exact: true })
            .count(),
        0,
        "unconfigured AI must not expose an unusable composer",
    );
});

Deno.test("workspace dock: Mod+. expands and focuses dock without opening any panels", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();

    await registerFreshUser(page, app.origin, "dock_shortcut_user");

    // Manual collapse is available without changing a mode.
    await collapseDockViaMenu(page);
    await expandBall(page).waitFor({ state: "visible" });

    // Focus away on search input
    await page.locator("#search-query").focus();

    // Press Mod+. (Control+. on Linux/Windows, Meta+. on Mac)
    await page.keyboard.press("Control+.");

    // Dock expands
    await dockNav(page).waitFor({ state: "visible" });

    // Focus is placed within the dock (after the post-expand animation frame)
    await page.waitForFunction(() => {
        const nav = document.querySelector(
            "nav[aria-label='工作区任务栏'], nav.dock-bar",
        );
        return Boolean(nav && nav.contains(document.activeElement));
    });

    // Must NOT open notes or apps panel
    assertEquals(
        await page.locator("[data-library]").count(),
        0,
        "Mod+. must not open workspace panels",
    );
    assertEquals(new URL(page.url()).pathname, "/");
    assertEquals(new URL(page.url()).searchParams.has("view"), false);
});

Deno.test("workspace dock: touch drag, long-press actions, and overflow management", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    const touchContext = await browser.newContext({
        viewport: { width: 600, height: 844 },
        hasTouch: true,
        isMobile: true,
    });
    cleanup.defer(() => touchContext.close());
    const page = await touchContext.newPage();
    let unexpectedPopups = 0;
    page.on("popup", () => unexpectedPopups++);

    await registerFreshUser(page, app.origin, "dock_touch_drag_user");

    // Create 2 apps and pin both
    const app1 = await createWebApp(touchContext, app.origin, {
        name: "Touch Alpha",
        url: "https://touch-alpha.test/",
    });
    const app2 = await createWebApp(touchContext, app.origin, {
        name: "Touch Beta",
        url: "https://touch-beta.test/",
    });

    await touchContext.request.patch(app.origin + "/api/preferences", {
        headers: { Origin: app.origin },
        data: {
            dock: {
                systemOrder: [
                    "home",
                    "apps",
                    "notes",
                    "ai",
                    "settings",
                    "trash",
                ],
                appIds: [app1.id, app2.id],
            },
        },
    });

    await page.reload();
    await dockNav(page).waitFor({ state: "visible" });

    const btn1 = dockAppButton(page, "Touch Alpha");
    const btn2 = dockAppButton(page, "Touch Beta");
    await btn1.waitFor({ state: "visible" });
    await btn2.waitFor({ state: "visible" });

    // Perform real CDP touch long-press drag (not tap)
    const session = await touchContext.newCDPSession(page);
    const box1 = (await btn1.boundingBox())!;
    const box2 = (await btn2.boundingBox())!;

    const startX = box1.x + box1.width / 2;
    const startY = box1.y + box1.height / 2;
    const endX = box2.x + box2.width / 2;
    const endY = box2.y + box2.height / 2;

    await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: startX, y: startY, id: 1 }],
    });

    // Hold > 250ms to activate TouchSensor delay constraint
    await page.waitForTimeout(320);

    // Dispatch touchMove in steps to target location
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
        await session.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{
                x: startX + ((endX - startX) * i) / steps,
                y: startY + ((endY - startY) * i) / steps,
                id: 1,
            }],
        });
        await page.waitForTimeout(25);
    }

    await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
    });

    await page.waitForFunction(([first, second]) =>
        Array.from(
            document.querySelectorAll<HTMLElement>("[data-dock-app-id]"),
            (item) => item.dataset.dockAppId,
        ).join(",") === `${first},${second}`, [app2.id, app1.id]);
    // Observe the delayed compatibility click as well as the drag result.
    await page.waitForTimeout(300);
    assertEquals(await page.locator("[data-dock-item-menu]").count(), 0);
    assertEquals(unexpectedPopups, 0);

    // Returning to the starting point is still a drag, not a long-press action.
    const returnedBox = (await btn2.boundingBox())!;
    const returnedX = returnedBox.x + returnedBox.width / 2;
    const returnedY = returnedBox.y + returnedBox.height / 2;
    await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: returnedX, y: returnedY, id: 1 }],
    });
    await page.waitForTimeout(320);
    await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: returnedX + 20, y: returnedY, id: 1 }],
    });
    await page.waitForTimeout(25);
    await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: returnedX, y: returnedY, id: 1 }],
    });
    await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
    });
    await page.waitForTimeout(300);
    assertEquals(await page.locator("[data-dock-item-menu]").count(), 0);
    assertEquals(unexpectedPopups, 0);

    const longPress = async (target: Locator) => {
        const box = (await target.boundingBox())!;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await session.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x, y, id: 1 }],
        });
        await page.waitForTimeout(320);
        await session.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
        });
        await page.locator("[data-dock-item-menu]").waitFor({
            state: "visible",
        });
    };

    await longPress(btn2);
    await page.getByRole("menuitem", { name: "向右移动" }).tap();
    await page.waitForFunction(([first, second]) =>
        Array.from(
            document.querySelectorAll<HTMLElement>("[data-dock-app-id]"),
            (item) => item.dataset.dockAppId,
        ).join(",") === `${first},${second}`, [app1.id, app2.id]);

    await longPress(btn2);
    await page.getByRole("menuitem", { name: "取消任务栏固定" }).tap();
    await btn2.waitFor({ state: "detached" });
    await page.waitForFunction(async (id) => {
        const response = await fetch("/api/preferences");
        return !(await response.json()).data.dock.appIds.includes(id);
    }, app2.id);
    const appsResponse = await touchContext.request.get(
        app.origin + "/api/webapps",
    );
    assert(appsResponse.ok());
    const allApps = (await appsResponse.json()).data as Array<{ id: string }>;
    assert(
        allApps.some((item) => item.id === app2.id),
        "unpinning must not delete the app",
    );
    assertEquals(unexpectedPopups, 0);

    await longPress(dockSystemButton(page, "笔记"));
    assertEquals(
        await page.getByRole("menuitem", { name: "取消任务栏固定" }).count(),
        0,
    );
    await page.getByRole("menuitem", { name: "向左移动" }).tap();
    await page.waitForFunction(() =>
        Array.from(
            document.querySelectorAll<HTMLElement>("[data-dock-id]"),
            (item) => item.dataset.dockId,
        ).join(",") === "home,notes,apps,ai,settings,trash"
    );

    const extraApps = [];
    for (let i = 0; i < 3; i++) {
        extraApps.push(
            await createWebApp(touchContext, app.origin, {
                name: `Overflow ${i}`,
                url: `https://overflow-${i}.example.test/`,
            }),
        );
    }
    const update = await touchContext.request.patch(
        app.origin + "/api/preferences",
        {
            headers: { Origin: app.origin },
            data: {
                dock: {
                    appIds: [app1.id, ...extraApps.map((item) => item.id)],
                },
            },
        },
    );
    assert(update.ok());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await dockNav(page).waitFor({ state: "visible" });
    await page.waitForFunction(() =>
        document.querySelector(".dock-group--apps")?.hasAttribute(
            "data-overflow-end",
        )
    );
    await dockOptionsMenu(page).tap();
    await page.getByRole("menuitem", { name: "Overflow 2 的操作" }).tap();
    await page.getByRole("menuitem", { name: "取消任务栏固定" }).tap();
    await page.waitForFunction(async (id) => {
        const response = await fetch("/api/preferences");
        return !(await response.json()).data.dock.appIds.includes(id);
    }, extraApps[2].id);
});

function boxesOverlap(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
): boolean {
    return a.x < b.x + b.width - 0.5 &&
        a.x + a.width > b.x + 0.5 &&
        a.y < b.y + b.height - 0.5 &&
        a.y + a.height > b.y + 0.5;
}

Deno.test("workspace dock: four-edge clearance for workspace panels, expanded note editor, home grid/notes, undo toast, and landscape mobile sheet", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();

    await registerFreshUser(page, app.origin, "dock_clearance_user");

    // Seed 24 home-fixed apps (fills up to 4 rows) and 2 home-fixed notes (left + right bands)
    for (let i = 1; i <= 24; i++) {
        await createWebApp(context, app.origin, {
            name: `App ${i}`,
            url: `https://app-${i}.clearance.test/`,
            isHomeFixed: true,
        });
    }
    const leftNoteRes = await context.request.post(
        app.origin + "/api/documents",
        {
            headers: { Origin: app.origin },
            data: {
                title: "Left Band Note",
                body: "Pinned on left band",
                isHomeFixed: true,
            },
        },
    );
    assert(leftNoteRes.ok(), await leftNoteRes.text());
    const leftNote = (await leftNoteRes.json()).data;
    const patchLeft = await context.request.patch(
        `${app.origin}/api/documents/${leftNote.id}/layout`,
        {
            headers: { Origin: app.origin },
            data: { band: "left", col: 0, row: 0, size: "s" },
        },
    );
    assert(patchLeft.ok(), await patchLeft.text());

    const rightNoteRes = await context.request.post(
        app.origin + "/api/documents",
        {
            headers: { Origin: app.origin },
            data: {
                title: "Right Band Note",
                body: "Pinned on right band",
                isHomeFixed: true,
            },
        },
    );
    assert(rightNoteRes.ok(), await rightNoteRes.text());
    const rightNote = (await rightNoteRes.json()).data;
    const patchRight = await context.request.patch(
        `${app.origin}/api/documents/${rightNote.id}/layout`,
        {
            headers: { Origin: app.origin },
            data: { band: "right", col: 0, row: 0, size: "s" },
        },
    );
    assert(patchRight.ok(), await patchRight.text());
    const setDockEdge = async (
        edge: "bottom" | "top" | "left" | "right",
    ) => {
        const edgeNames: Record<string, string> = {
            top: "顶部",
            left: "左侧",
            right: "右侧",
            bottom: "底部",
        };
        await page.goto(app.origin + "/");
        await dockNav(page).waitFor({ state: "visible" });
        await setDockEdgeViaManagement(page, edgeNames[edge]);
        await page.locator(`.app-shell[data-dock-edge="${edge}"]`).waitFor();
    };

    await t.step(
        "768x1024, 1024x900, and 1440x900 bottom dock: apps panel, notes panel, and expanded editor never overlap dock",
        async () => {
            await setDockEdge("bottom");
            for (
                const [width, height] of [
                    [768, 1024],
                    [1024, 900],
                    [1440, 900],
                ] as const
            ) {
                await page.setViewportSize({ width, height });
                await dockSystemButton(page, "应用").click();
                const panel = page.locator(".workspace-panel").first();
                await panel.waitFor({ state: "visible" });
                await page.waitForFunction(() => {
                    const p = document.querySelector(".workspace-panel");
                    const d = document.querySelector("nav.dock-bar");
                    if (!p || !d) return false;
                    return p.getBoundingClientRect().bottom <=
                        d.getBoundingClientRect().top + 1;
                });
                let panelBox = (await panel.boundingBox())!;
                let dockBox = (await dockNav(page).boundingBox())!;
                assert(
                    !boxesOverlap(panelBox, dockBox),
                    `${width}x${height} apps panel overlaps bottom dock`,
                );

                await dockSystemButton(page, "笔记").click();
                await page.locator('[data-library="notes"]').waitFor({
                    state: "visible",
                });
                panelBox = (await panel.boundingBox())!;
                dockBox = (await dockNav(page).boundingBox())!;
                assert(
                    !boxesOverlap(panelBox, dockBox),
                    `${width}x${height} notes panel overlaps bottom dock`,
                );

                await page.getByText("Left Band Note").first().click();
                await page.locator(
                    '.workspace-panel[data-workspace-expanded="true"]',
                ).waitFor({ state: "visible" });
                panelBox = (await panel.boundingBox())!;
                dockBox = (await dockNav(page).boundingBox())!;
                assert(
                    !boxesOverlap(panelBox, dockBox),
                    `${width}x${height} expanded editor overlaps bottom dock`,
                );

                await dockSystemButton(page, "首页").click();
                await page.locator("[data-library]").waitFor({
                    state: "detached",
                });
            }
        },
    );

    await t.step(
        "1440x900 left and right dock: note editor expands to 900px without overlapping dock",
        async () => {
            await page.setViewportSize({ width: 1440, height: 900 });
            for (const edge of ["left", "right"] as const) {
                await setDockEdge(edge);
                await dockSystemButton(page, "笔记").click();
                await page.getByText("Left Band Note").first().click();
                const expanded = page.locator(
                    '.workspace-panel[data-workspace-expanded="true"]',
                );
                await expanded.waitFor({ state: "visible" });
                await page.waitForFunction(() => {
                    const p = document.querySelector(
                        '.workspace-panel[data-workspace-expanded="true"]',
                    );
                    const d = document.querySelector("nav.dock-bar");
                    if (!p || !d) return false;
                    const pr = p.getBoundingClientRect();
                    const dr = d.getBoundingClientRect();
                    const overlaps = pr.left < dr.right - 0.5 &&
                        pr.right > dr.left + 0.5 &&
                        pr.top < dr.bottom - 0.5 &&
                        pr.bottom > dr.top + 0.5;
                    return Math.round(pr.width) === 900 && !overlaps;
                });
                const panelBox = (await expanded.boundingBox())!;
                const dockBox = (await dockNav(page).boundingBox())!;
                assertEquals(
                    Math.round(panelBox.width),
                    900,
                    `${edge} dock expanded editor width must be 900px`,
                );
                assert(
                    !boxesOverlap(panelBox, dockBox),
                    `1440x900 ${edge} dock expanded editor overlaps dock`,
                );
                await dockSystemButton(page, "首页").click();
                await page.locator("[data-library]").waitFor({
                    state: "detached",
                });
            }
        },
    );

    await t.step(
        "1096x900 left/right dock and 1366x768 bottom dock: home notes and app plate avoid dock without rewriting saved note coordinates",
        async () => {
            await page.setViewportSize({ width: 1096, height: 900 });
            for (const edge of ["left", "right"] as const) {
                await setDockEdge(edge);
                await page.locator(".home-note").first().waitFor({
                    state: "visible",
                });
                await page.waitForFunction(() => {
                    const bar = document.querySelector("nav.dock-bar");
                    if (!bar) return false;
                    const dockRect = bar.getBoundingClientRect();
                    return Array.from(document.querySelectorAll(".home-note"))
                        .every((note) => {
                            const r = note.getBoundingClientRect();
                            return !(
                                r.left < dockRect.right - 0.5 &&
                                r.right > dockRect.left + 0.5 &&
                                r.top < dockRect.bottom - 0.5 &&
                                r.bottom > dockRect.top + 0.5
                            );
                        });
                });
                const dockBox = (await dockNav(page).boundingBox())!;
                const noteCount = await page.locator(".home-note").count();
                for (let i = 0; i < noteCount; i++) {
                    const noteBox = (await page.locator(".home-note").nth(i)
                        .boundingBox())!;
                    assert(
                        !boxesOverlap(noteBox, dockBox),
                        `1096x900 ${edge} dock overlaps home note ${i}`,
                    );
                }
            }

            await page.setViewportSize({ width: 1366, height: 768 });
            await setDockEdge("bottom");
            const plate = page.locator(".launcher-plate").first();
            await plate.waitFor({ state: "visible" });
            await page.waitForFunction(() => {
                const p = document.querySelector(".launcher-plate");
                const d = document.querySelector("nav.dock-bar");
                if (!p || !d) return false;
                return p.getBoundingClientRect().bottom <=
                    d.getBoundingClientRect().top + 1;
            });
            const plateBox = (await plate.boundingBox())!;
            const dockBox = (await dockNav(page).boundingBox())!;
            assert(
                !boxesOverlap(plateBox, dockBox),
                `1366x768 bottom dock overlaps launcher plate (${
                    plateBox.y + plateBox.height
                } vs ${dockBox.y})`,
            );

            // Verify server-stored note coordinates were NOT overwritten by viewport/dock reflow
            const leftCheck = await context.request.get(
                `${app.origin}/api/documents/${leftNote.id}/layout`,
            );
            assert(leftCheck.ok());
            const leftLayout = (await leftCheck.json()).data;
            assertEquals(leftLayout.band, "left");
            assertEquals(leftLayout.col, 0);
            assertEquals(leftLayout.row, 0);

            const rightCheck = await context.request.get(
                `${app.origin}/api/documents/${rightNote.id}/layout`,
            );
            assert(rightCheck.ok());
            const rightLayout = (await rightCheck.json()).data;
            assertEquals(rightLayout.band, "right");
            assertEquals(rightLayout.col, 0);
            assertEquals(rightLayout.row, 0);
        },
    );

    await t.step(
        "desktop and mobile bottom dock: UndoToast and landscape mobile sheet clear the dock",
        async () => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await setDockEdge("bottom");
            const searchInput = page.locator("#search-query");
            await searchInput.fill("Quick note for toast clearance");
            await searchInput.press("Shift+Enter");
            const toast = page.locator(".undo-toast").first();
            await toast.waitFor({ state: "visible" });
            const toastBoxDesktop = (await toast.boundingBox())!;
            const dockBoxDesktop = (await dockNav(page).boundingBox())!;
            assert(
                !boxesOverlap(toastBoxDesktop, dockBoxDesktop),
                `desktop undo-toast (${
                    toastBoxDesktop.y + toastBoxDesktop.height
                }) overlaps dock (${dockBoxDesktop.y})`,
            );

            await page.setViewportSize({ width: 390, height: 844 });
            await page.waitForFunction(() => {
                const t = document.querySelector(".undo-toast");
                const d = document.querySelector("nav.dock-bar");
                if (!t || !d) return false;
                return t.getBoundingClientRect().bottom <=
                    d.getBoundingClientRect().top + 1;
            });
            const toastBoxMobile = (await toast.boundingBox())!;
            const dockBoxMobile = (await dockNav(page).boundingBox())!;
            assert(
                !boxesOverlap(toastBoxMobile, dockBoxMobile),
                `mobile undo-toast (${
                    toastBoxMobile.y + toastBoxMobile.height
                }) overlaps dock (${dockBoxMobile.y})`,
            );

            // Landscape mobile (<=480px height): mobile sheet avoids bottom dock
            await page.setViewportSize({ width: 667, height: 375 });
            await dockSystemButton(page, "笔记").click();
            const mobileSheet = page.locator(".workspace-panel--mobile.sheet")
                .first();
            await mobileSheet.waitFor({ state: "visible" });
            await page.waitForFunction(() => {
                const s = document.querySelector(
                    ".workspace-panel--mobile.sheet",
                );
                const d = document.querySelector("nav.dock-bar");
                if (!s || !d) return false;
                return s.getBoundingClientRect().bottom <=
                    d.getBoundingClientRect().top + 0.1;
            });
            const sheetBox = (await mobileSheet.boundingBox())!;
            const dockBoxLandscape = (await dockNav(page).boundingBox())!;
            assert(
                !boxesOverlap(sheetBox, dockBoxLandscape),
                `landscape mobile sheet (${
                    sheetBox.y + sheetBox.height
                }) overlaps dock (${dockBoxLandscape.y})`,
            );
        },
    );

    await t.step(
        "Floating material, solid fallback, mobile overflow and reduced motion",
        async () => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await setDockEdge("bottom");

            // Pin 4 apps so mobile dock overflows
            const allAppsRes = await context.request.get(
                app.origin + "/api/webapps",
            );
            assert(allAppsRes.ok());
            const allApps = (await allAppsRes.json()).data as Array<{
                id: string;
            }>;
            const pinnedIds = allApps.slice(0, 4).map((a) => a.id);
            const patchDockRes = await context.request.patch(
                app.origin + "/api/preferences",
                {
                    headers: { Origin: app.origin },
                    data: {
                        dock: {
                            systemOrder: [
                                "home",
                                "apps",
                                "notes",
                                "ai",
                                "settings",
                                "trash",
                            ],
                            appIds: pinnedIds,
                        },
                    },
                },
            );
            assert(patchDockRes.ok());
            await page.reload();
            await dockNav(page).waitFor({ state: "visible" });

            // 1. Home dock uses Floating glass sheen + 3-layer material edge + blur, and .dock-glyph uses 23% radius + 1px inner rim
            const homeStyles = await page.evaluate(() => {
                const bar = document.querySelector("nav.dock-bar")!;
                const glyph = bar.querySelector(".dock-glyph")!;
                const barCs = getComputedStyle(bar);
                const glyphCs = getComputedStyle(glyph);
                const glyphAfterCs = getComputedStyle(glyph, "::after");
                return {
                    bgImage: barCs.backgroundImage,
                    backdropFilter: barCs.backdropFilter,
                    boxShadow: barCs.boxShadow,
                    glyphWidth: Number.parseFloat(glyphCs.width),
                    glyphRadius: Number.parseFloat(glyphCs.borderRadius),
                    glyphShadow: glyphCs.boxShadow,
                    glyphAfterShadow: glyphAfterCs.boxShadow,
                };
            });
            assert(
                homeStyles.bgImage.includes("linear-gradient"),
                `home dock must include --glass-sheen gradient, got: ${homeStyles.bgImage}`,
            );
            assert(
                homeStyles.backdropFilter.includes("blur"),
                `home dock must apply backdrop-filter blur, got: ${homeStyles.backdropFilter}`,
            );
            assert(
                homeStyles.boxShadow.includes("inset"),
                `home dock must include inset material edge shadow, got: ${homeStyles.boxShadow}`,
            );
            assertEquals(homeStyles.glyphWidth, 28);
            assert(
                Math.abs(homeStyles.glyphRadius - 28 * 0.23) < 0.2,
                `dock-glyph radius must be 28 * 0.23 (6.44px), got: ${homeStyles.glyphRadius}`,
            );
            assert(
                homeStyles.glyphShadow.includes("inset") &&
                    homeStyles.glyphAfterShadow.includes("inset"),
                `dock-glyph must include 1px inner rim shadow, got: ${homeStyles.glyphShadow}`,
            );

            // 2. /ask page falls back to solid surface-l3 with no backdrop-filter
            await dockSystemButton(page, "AI 问答").click();
            await page.waitForURL((url) => url.pathname.startsWith("/ask"));
            await page.locator(".app-shell:not([data-home])").waitFor();
            await dockNav(page).waitFor({ state: "visible" });
            const askStyles = await page.evaluate(() => {
                const bar = document.querySelector("nav.dock-bar")!;
                const cs = getComputedStyle(bar);
                return {
                    bgImage: cs.backgroundImage,
                    backdropFilter: cs.backdropFilter,
                    borderTopWidth: cs.borderTopWidth,
                };
            });
            assertEquals(askStyles.bgImage, "none");
            assertEquals(askStyles.backdropFilter, "none");
            assertEquals(askStyles.borderTopWidth, "1px");

            // Return to home
            await dockSystemButton(page, "首页").click();
            await page.waitForURL(app.origin + "/");
            await page.locator(".app-shell[data-home]").waitFor();
            await dockNav(page).waitFor({ state: "visible" });

            // 3. 390x844 mobile viewport: all dock items have equal height (44px) and overflowing apps group has mask-image
            await page.setViewportSize({ width: 390, height: 844 });
            await page.waitForFunction(() => {
                const group = document.querySelector(".dock-group--apps");
                return Boolean(
                    group && group.hasAttribute("data-overflow-end"),
                );
            });
            const mobileMetrics = await page.evaluate(() => {
                const items = Array.from(
                    document.querySelectorAll("nav.dock-bar .dock-item"),
                );
                const heights = items.map((el) =>
                    Math.round(el.getBoundingClientRect().height)
                );
                const group = document.querySelector(".dock-group--apps")!;
                const groupCs = getComputedStyle(group);
                const mask = groupCs.maskImage || groupCs.webkitMaskImage;
                const labels = Array.from(
                    document.querySelectorAll(
                        "nav.dock-bar .dock-item--system .dock-item-label",
                    ),
                    (el) => el.getBoundingClientRect().width,
                );
                return { heights, mask, labels };
            });
            for (const h of mobileMetrics.heights) {
                assertEquals(
                    h,
                    44,
                    `all mobile dock items must be 44px tall, got: ${
                        mobileMetrics.heights.join(",")
                    }`,
                );
            }
            assertEquals(mobileMetrics.labels.length, 6);
            assert(
                mobileMetrics.labels.every((width) => width <= 1),
                "system labels must not be visibly rendered",
            );
            assert(
                mobileMetrics.mask.includes("linear-gradient"),
                `overflowing mobile .dock-group--apps must apply gradient mask-image, got: ${mobileMetrics.mask}`,
            );

            // When overflowing on 390x844, options menu lists pinned apps directly
            await dockOptionsMenu(page).click();
            const menu = page.locator('[role="menu"]');
            await menu.waitFor({ state: "visible" });
            assertEquals(
                await menu.locator("[data-dock-overflow-app]").count(),
                4,
                "overflowing dock must list all 4 pinned apps in options menu",
            );
            await page.keyboard.press("Escape");
            await menu.waitFor({ state: "hidden" });
            // At 360px the system group can scroll without hiding the options.
            await page.setViewportSize({ width: 360, height: 844 });
            const systemGroup = dockNav(page).locator(".dock-group--system");
            await page.waitForFunction(() => {
                const group = document.querySelector(".dock-group--system");
                return Boolean(group && group.scrollWidth > group.clientWidth);
            });
            await systemGroup.evaluate((group) => {
                group.scrollLeft = group.scrollWidth;
            });
            await dockSystemButton(page, "回收站").click();
            await page.waitForURL(app.origin + "/trash");
            await page.goBack();
            await dockNav(page).waitFor({ state: "visible" });
            await dockOptionsMenu(page).click();
            await page.getByRole("menuitem", { name: "管理任务栏" }).waitFor();
            await page.keyboard.press("Escape");
            // 4. prefers-reduced-motion: reduce uses pure opacity transition (translate: 0px)
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.emulateMedia({ reducedMotion: "reduce" });
            const reducedMotionCheck = await page.evaluate(() => {
                const bar = document.querySelector("nav.dock-bar")!;
                const cs = getComputedStyle(bar);
                return {
                    transitionProperty: cs.transitionProperty,
                    travelY: cs.getPropertyValue("--dock-travel-y").trim(),
                };
            });
            assertEquals(reducedMotionCheck.transitionProperty, "opacity");
            assertEquals(reducedMotionCheck.travelY, "0px");
            await page.emulateMedia({ reducedMotion: "no-preference" });
        },
    );
});
