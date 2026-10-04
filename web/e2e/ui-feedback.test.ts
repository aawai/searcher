import { assertEquals, assertStringIncludes } from "@std/assert";
import { type BrowserContext, chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";
import { notes, users, webapps } from "../../src/db/schema.ts";
import { aiConversations, aiProviders } from "../../src/db/ai-schema.ts";

// Focused regression test suite for UI Feedback, Confirmation Dialogs, UndoToasts, and Loading/Error/Empty States
// Run with: NODE_ENV=test deno test -A web/e2e/ui-feedback.test.ts
Deno.test("UI feedback, confirmation dialogs, and undo contracts", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({ prefix: "searcher_feedback_e2e_" });
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
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    const username = "feedback_tester_79";
    const password = "Feedback-Password-79!";

    async function createTestPage(viewport = { width: 1280, height: 800 }) {
        const context = await browser.newContext({
            colorScheme: "light",
            viewport,
        });
        cleanup.defer(() => context.close());
        const page = await context.newPage();
        return { context, page };
    }

    async function visit(path: string, page: Page) {
        const response = await page.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await page.locator("main").waitFor({ state: "visible" });
    }

    // Register primary user
    const { page: regPage, context: _regContext } = await createTestPage();
    await visit("/register", regPage);
    await regPage.locator("#auth-username").fill(username);
    await regPage.locator("#auth-display-name").fill("Feedback Tester");
    await regPage.locator("#auth-password").fill(password);
    await regPage.locator('form button[type="submit"]').click();
    await regPage.waitForURL(origin + "/");
    await regPage.locator("main").waitFor({ state: "visible" });

    // Retrieve registered user
    const dbUser = await store.run((db) => db.select().from(users).all());
    const user = dbUser[0];
    assertEquals(Boolean(user), true);

    async function authenticateContext(context: BrowserContext) {
        const { token } = await auth.createSession(user.id, user.authVersion);
        await context.addCookies([{
            name: "searcher_session",
            value: token,
            domain: "127.0.0.1",
            path: "/",
            httpOnly: true,
            sameSite: "Lax",
        }]);
    }

    await t.step(
        "Account: 当前设备退出 / 其他设备退出 dialog contracts (Cancel/Escape no mutation, Confirm 1 mutation, pending disabled, focus recovery)",
        async () => {
            // Seed a secondary session device
            await auth.createSession(user.id, user.authVersion, {
                userAgent:
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
                ip: "192.168.1.100",
            });

            const { page, context } = await createTestPage();
            await authenticateContext(context);
            await visit("/account", page);

            // Wait for devices to load
            const deviceList = page.locator(".account-device-list");
            await deviceList.waitFor({ state: "visible" });

            // 1. Other devices logout
            const revokeOthersBtn = page.getByRole("button", {
                name: "退出其他所有设备",
            });
            await revokeOthersBtn.waitFor({ state: "visible" });

            let revokeOthersRequests = 0;
            const revokeGate = Promise.withResolvers<void>();
            await page.route(
                "**/api/auth/devices/revoke-others",
                async (route) => {
                    revokeOthersRequests++;
                    // Deterministic gate holds mutation in-flight to assert pending UI state
                    await revokeGate.promise;
                    await route.continue();
                },
            );

            // Escape closes dialog with 0 mutations
            await revokeOthersBtn.click();
            const revokeOthersDialog = page.locator(
                '[role="alertdialog"]:has-text("退出其他所有设备")',
            );
            await revokeOthersDialog.waitFor({ state: "visible" });
            await page.keyboard.press("Escape");
            await revokeOthersDialog.waitFor({ state: "hidden" });
            assertEquals(revokeOthersRequests, 0);

            // Cancel button closes dialog with 0 mutations
            await revokeOthersBtn.click();
            await revokeOthersDialog.waitFor({ state: "visible" });
            const cancelRevokeBtn = revokeOthersDialog.getByRole("button", {
                name: "取消",
            });
            await cancelRevokeBtn.click();
            await revokeOthersDialog.waitFor({ state: "hidden" });
            assertEquals(revokeOthersRequests, 0);

            // Confirm sends 1 mutation with pending disabled
            await revokeOthersBtn.click();
            await revokeOthersDialog.waitFor({ state: "visible" });
            const confirmRevokeBtn = revokeOthersDialog.getByRole("button", {
                name: "确认退出",
            });
            await confirmRevokeBtn.click();

            // While in flight: pending disabled state and text changes to "处理中…"
            const pendingRevokeBtn = revokeOthersDialog.getByRole("button", {
                name: "处理中…",
            });
            await pendingRevokeBtn.waitFor({ state: "visible" });
            assertEquals(await pendingRevokeBtn.isDisabled(), true);
            assertEquals(await cancelRevokeBtn.isDisabled(), true);

            // Release deterministic gate and await completion
            revokeGate.resolve();
            const successBanner = page.locator(
                ".status-banner:has-text('已退出所有其他设备')",
            );
            await successBanner.waitFor({ state: "visible" });

            // 2. Current device logout
            const currentDeviceRow = page.locator(
                ".account-device-item:has-text('当前设备')",
            );
            await currentDeviceRow.waitFor({ state: "visible" });
            const logoutCurrentBtn = currentDeviceRow.getByRole("button", {
                name: "退出此设备",
            });

            let logoutRequests = 0;
            const logoutGate = Promise.withResolvers<void>();
            await page.route("**/api/auth/logout", async (route) => {
                logoutRequests++;
                await logoutGate.promise;
                await route.continue();
            });

            // Escape closes current device logout dialog with 0 mutations
            await logoutCurrentBtn.click();
            const logoutCurrentDialog = page.locator(
                '[role="alertdialog"]:has-text("退出当前设备")',
            );
            await logoutCurrentDialog.waitFor({ state: "visible" });
            await page.keyboard.press("Escape");
            await logoutCurrentDialog.waitFor({ state: "hidden" });
            assertEquals(logoutRequests, 0);

            // Cancel closes dialog with 0 mutations
            await logoutCurrentBtn.click();
            await logoutCurrentDialog.waitFor({ state: "visible" });
            const cancelLogoutBtn = logoutCurrentDialog.getByRole("button", {
                name: "取消",
            });
            await cancelLogoutBtn.click();
            await logoutCurrentDialog.waitFor({ state: "hidden" });
            assertEquals(logoutRequests, 0);

            // Confirm sends 1 mutation with pending disabled and navigates to /login
            await logoutCurrentBtn.click();
            await logoutCurrentDialog.waitFor({ state: "visible" });
            const confirmLogoutBtn = logoutCurrentDialog.getByRole("button", {
                name: "确认退出",
            });
            await confirmLogoutBtn.click();

            // While in flight: pending disabled state and text changes to "退出中…"
            const pendingLogoutBtn = logoutCurrentDialog.getByRole("button", {
                name: "退出中…",
            });
            await pendingLogoutBtn.waitFor({ state: "visible" });
            assertEquals(await pendingLogoutBtn.isDisabled(), true);
            assertEquals(await cancelLogoutBtn.isDisabled(), true);

            logoutGate.resolve();
            await page.waitForURL(origin + "/login");
            assertEquals(logoutRequests, 1);
        },
    );
    await t.step(
        "Trash: 永久删除 dialog contracts on Desktop & Mobile (Escape/Cancel no mutation, Confirm 1 mutation, pending disabled, EmptyState after delete)",
        async () => {
            // Seed 1 deleted webapp and 1 deleted note
            const now = Date.now();
            await store.run(async (db) => {
                await db.insert(webapps).values({
                    id: "trash-app-1",
                    userId: user.id,
                    name: "Trash Test App",
                    url: "https://example.com/trash-app",
                    deletedAt: now,
                    createdAt: now,
                    updatedAt: now,
                });
                await db.insert(notes).values({
                    id: "trash-note-1",
                    userId: user.id,
                    title: "Trash Test Note",
                    currentBody: "Content to be permanently deleted",
                    color: "amber",
                    deletedAt: now,
                    createdAt: now,
                    updatedAt: now,
                });
            });

            // 1. Desktop: WebApp permanent delete
            const { page: desktopPage, context: desktopContext } =
                await createTestPage({
                    width: 1280,
                    height: 800,
                });
            await authenticateContext(desktopContext);
            await visit("/trash", desktopPage);

            // Desktop ManagementTable is visible
            const desktopTable = desktopPage.locator(".trash-page table");
            await desktopTable.waitFor({ state: "visible" });
            const appRow = desktopTable.locator(
                "tr:has-text('Trash Test App')",
            );
            await appRow.waitFor({ state: "visible" });

            const deleteAppBtn = appRow.getByRole("button", {
                name: "彻底删除",
            });
            let permAppRequests = 0;
            const permAppGate = Promise.withResolvers<void>();
            await desktopPage.route(
                "**/api/webapps/trash-app-1/permanent",
                async (route) => {
                    permAppRequests++;
                    await permAppGate.promise;
                    await route.continue();
                },
            );

            // Escape closes dialog with 0 mutations
            await deleteAppBtn.click();
            const permDialog = desktopPage.locator(
                '[role="alertdialog"]:has-text("彻底删除")',
            );
            await permDialog.waitFor({ state: "visible" });
            await desktopPage.keyboard.press("Escape");
            await permDialog.waitFor({ state: "hidden" });
            assertEquals(permAppRequests, 0);

            // Cancel button closes dialog with 0 mutations
            await deleteAppBtn.click();
            await permDialog.waitFor({ state: "visible" });
            const cancelBtn = permDialog.getByRole("button", { name: "取消" });
            await cancelBtn.click();
            await permDialog.waitFor({ state: "hidden" });
            assertEquals(permAppRequests, 0);

            // Confirm sends 1 mutation with pending disabled
            await deleteAppBtn.click();
            await permDialog.waitFor({ state: "visible" });
            const confirmBtn = permDialog.getByRole("button", {
                name: "彻底删除",
            });
            await confirmBtn.click();

            // Pending state: disabled and text shows "删除中…"
            const pendingBtn = permDialog.getByRole("button", {
                name: "删除中…",
            });
            await pendingBtn.waitFor({ state: "visible" });
            assertEquals(await pendingBtn.isDisabled(), true);
            assertEquals(await cancelBtn.isDisabled(), true);

            permAppGate.resolve();
            await permDialog.waitFor({ state: "hidden" });
            assertEquals(permAppRequests, 1);

            // Success banner and EmptyState appear
            const successBanner = desktopPage.locator(
                ".status-banner:has-text('APP 已彻底删除')",
            );
            await successBanner.waitFor({ state: "visible" });
            const emptyState = desktopPage.locator(
                ".empty-state:has-text('回收站空空如也')",
            );
            await emptyState.waitFor({ state: "visible" });

            // 2. Mobile: Note permanent delete
            const { page: mobilePage, context: mobileContext } =
                await createTestPage({
                    width: 390,
                    height: 844,
                });
            await authenticateContext(mobileContext);
            await visit("/trash", mobilePage);

            // Switch to notes tab on mobile
            const notesTab = mobilePage.getByRole("tab", { name: /便签/ });
            await notesTab.click();

            // Mobile stacked card list is visible, desktop table is hidden
            const mobileCard = mobilePage.locator(
                ".trash-mobile-card:has-text('Trash Test Note')",
            );
            await mobileCard.waitFor({ state: "visible" });

            const deleteNoteBtn = mobileCard.getByRole("button", {
                name: "彻底删除",
            });
            let permNoteRequests = 0;
            const permNoteGate = Promise.withResolvers<void>();
            await mobilePage.route(
                "**/api/notes/trash-note-1/permanent",
                async (route) => {
                    permNoteRequests++;
                    await permNoteGate.promise;
                    await route.continue();
                },
            );

            // Escape closes dialog on mobile
            await deleteNoteBtn.click();
            const mobilePermDialog = mobilePage.locator(
                '[role="alertdialog"]:has-text("彻底删除")',
            );
            await mobilePermDialog.waitFor({ state: "visible" });
            await mobilePage.keyboard.press("Escape");
            await mobilePermDialog.waitFor({ state: "hidden" });
            assertEquals(permNoteRequests, 0);

            // Cancel closes dialog on mobile
            await deleteNoteBtn.click();
            await mobilePermDialog.waitFor({ state: "visible" });
            const mobileCancelBtn = mobilePermDialog.getByRole("button", {
                name: "取消",
            });
            await mobileCancelBtn.click();
            await mobilePermDialog.waitFor({ state: "hidden" });
            assertEquals(permNoteRequests, 0);

            // Confirm sends 1 mutation with pending disabled on mobile
            await deleteNoteBtn.click();
            await mobilePermDialog.waitFor({ state: "visible" });
            const mobileConfirmBtn = mobilePermDialog.getByRole("button", {
                name: "彻底删除",
            });
            await mobileConfirmBtn.click();

            const mobilePendingBtn = mobilePermDialog.getByRole("button", {
                name: "删除中…",
            });
            await mobilePendingBtn.waitFor({ state: "visible" });
            assertEquals(await mobilePendingBtn.isDisabled(), true);
            assertEquals(await mobileCancelBtn.isDisabled(), true);

            permNoteGate.resolve();
            await mobilePermDialog.waitFor({ state: "hidden" });
            assertEquals(permNoteRequests, 1);

            const noteSuccessBanner = mobilePage.locator(
                ".status-banner:has-text('便签已彻底删除')",
            );
            await noteSuccessBanner.waitFor({ state: "visible" });
            const noteEmptyState = mobilePage.locator(
                ".empty-state:has-text('回收站空空如也')",
            );
            await noteEmptyState.waitFor({ state: "visible" });
        },
    );
    await t.step(
        "Provider: 删除 Provider dialog contracts (Cancel/Escape no mutation, focus restoration, Confirm 1 mutation, pending disabled)",
        async () => {
            const provId = "prov-feedback-1";
            const now = Date.now();
            await store.run(async (db) => {
                await db.insert(aiProviders).values({
                    id: provId,
                    ownerUserId: user.id,
                    scope: "user",
                    name: "Test AI Provider",
                    baseUrl: "https://api.openai.com/v1",
                    encryptedApiKey: "dummy-key",
                    discoveryMode: "openai-compatible",
                    enabled: true,
                    createdAt: now,
                    updatedAt: now,
                });
            });

            const { page: aiPage, context: aiContext } = await createTestPage();
            await authenticateContext(aiContext);
            await visit("/settings/ai", aiPage);

            const provCard = aiPage.locator(
                ".settings-card:has-text('Test AI Provider')",
            );
            await provCard.waitFor({ state: "visible" });
            const deleteProvBtn = provCard.getByRole("button", {
                name: "删除",
            });

            let provRequests = 0;
            const provGate = Promise.withResolvers<void>();
            await aiPage.route(
                `**/api/ai/providers/${provId}`,
                async (route) => {
                    provRequests++;
                    await provGate.promise;
                    await route.continue();
                },
            );

            // Escape closes dialog with 0 mutations and restores focus to delete button
            await deleteProvBtn.click();
            const provDialog = aiPage.locator(
                '[role="alertdialog"]:has-text("删除 Provider")',
            );
            await provDialog.waitFor({ state: "visible" });
            await aiPage.keyboard.press("Escape");
            await provDialog.waitFor({ state: "hidden" });
            assertEquals(provRequests, 0);
            assertEquals(
                await deleteProvBtn.evaluate((el) =>
                    el === document.activeElement
                ),
                true,
            );

            // Cancel closes dialog with 0 mutations and restores focus
            await deleteProvBtn.click();
            await provDialog.waitFor({ state: "visible" });
            const cancelProvBtn = provDialog.getByRole("button", {
                name: "取消",
            });
            await cancelProvBtn.click();
            await provDialog.waitFor({ state: "hidden" });
            assertEquals(provRequests, 0);
            assertEquals(
                await deleteProvBtn.evaluate((el) =>
                    el === document.activeElement
                ),
                true,
            );

            // Confirm sends 1 mutation with pending disabled
            await deleteProvBtn.click();
            await provDialog.waitFor({ state: "visible" });
            const confirmProvBtn = provDialog.getByRole("button", {
                name: "删除",
                exact: true,
            });
            await confirmProvBtn.click();

            const pendingProvBtn = provDialog.getByRole("button", {
                name: "正在删除...",
            });
            await pendingProvBtn.waitFor({ state: "visible" });
            assertEquals(await pendingProvBtn.isDisabled(), true);
            assertEquals(await cancelProvBtn.isDisabled(), true);

            provGate.resolve();
            await provDialog.waitFor({ state: "hidden" });
            assertEquals(provRequests, 1);

            const provSuccess = aiPage.locator(
                ".status-banner:has-text('Provider 已删除')",
            );
            await provSuccess.waitFor({ state: "visible" });
            assertEquals(await provCard.count(), 0);
        },
    );

    await t.step(
        "AppForm: 重复应用添加确认与图标覆盖确认 (Escape/Cancel no mutation, focus recovery, Confirm 1 mutation, pending disabled)",
        async () => {
            // Seed an initial webapp with an iconAssetId
            const baseAppId = "app-dup-base-1";
            const now = Date.now();
            await store.run(async (db) => {
                await db.insert(webapps).values({
                    id: baseAppId,
                    userId: user.id,
                    name: "Base App",
                    url: "https://example.com/base-url",
                    iconAssetId: "asset-123",
                    sortOrder: 0,
                    createdAt: now,
                    updatedAt: now,
                });
            });

            const { page, context } = await createTestPage({
                width: 1280,
                height: 800,
            });
            await authenticateContext(context);
            await visit("/", page);

            // Open Apps workspace
            const appsBtn = page.locator(
                '.desktop-dock button[aria-label="应用工作区"], button[data-workspace="apps"], .workspace-dock button[aria-label="应用工作区"]',
            );
            await appsBtn.first().waitFor({ state: "visible" });
            await appsBtn.first().click();

            const aside = page.locator(
                '.desktop-window[data-window-id="apps"], .workspace-panel--mobile, aside.workspace-panel, .workspace-panel',
            );
            await aside.waitFor({ state: "visible" });

            // 1. Duplicate app confirmation dialog
            const addAppBtn = aside.getByRole("button", { name: "添加应用" });
            await addAppBtn.waitFor({ state: "visible" });
            await addAppBtn.click();

            // AppForm is visible inside aside
            const urlInput = aside.locator("#app-url-input");
            await urlInput.waitFor({ state: "visible" });
            await urlInput.fill("https://example.com/base-url");
            const nameInput = aside.locator("#app-name-input");
            await nameInput.fill("Base App Copy");

            const submitBtn = aside.locator(
                'form.app-dialog-form button[type="submit"]',
            );
            let addRequests = 0;
            const addGate = Promise.withResolvers<void>();
            await page.route("**/api/webapps", async (route) => {
                if (route.request().method() === "POST") {
                    addRequests++;
                    await addGate.promise;
                }
                await route.continue();
            });

            // Submit triggers duplicate confirmation AlertDialog
            await submitBtn.click();
            const dupDialog = page.locator(
                '[role="alertdialog"]:has-text("该网站已存在")',
            );
            await dupDialog.waitFor({ state: "visible" });

            // Escape closes dialog with 0 mutations and restores focus
            await page.keyboard.press("Escape");
            await dupDialog.waitFor({ state: "hidden" });
            assertEquals(addRequests, 0);
            assertEquals(
                await submitBtn.evaluate((el) => el === document.activeElement),
                true,
            );

            // Cancel closes dialog with 0 mutations and restores focus
            await submitBtn.click();
            await dupDialog.waitFor({ state: "visible" });
            const cancelDupBtn = dupDialog.getByRole("button", {
                name: "取消",
            });
            await cancelDupBtn.click();
            await dupDialog.waitFor({ state: "hidden" });
            assertEquals(addRequests, 0);
            assertEquals(
                await submitBtn.evaluate((el) => el === document.activeElement),
                true,
            );

            // Confirm sends 1 mutation with pending disabled
            await submitBtn.click();
            await dupDialog.waitFor({ state: "visible" });
            const confirmDupBtn = dupDialog.getByRole("button", {
                name: "继续添加",
            });
            await confirmDupBtn.click();

            const pendingDupBtn = dupDialog.getByRole("button", {
                name: "正在添加…",
            });
            await pendingDupBtn.waitFor({ state: "visible" });
            assertEquals(await pendingDupBtn.isDisabled(), true);
            assertEquals(await cancelDupBtn.isDisabled(), true);

            addGate.resolve();
            await dupDialog.waitFor({ state: "hidden" });
            assertEquals(addRequests, 1);

            // Form closes and returns to apps root with the duplicate app
            const duplicateTile = aside.locator(
                ".launcher-tile:has-text('Base App Copy')",
            );
            await duplicateTile.waitFor({ state: "visible" });

            // 2. Icon overwrite confirmation dialog on URL change
            // Right click on Base App tile to open context menu and click 更换图标/编辑
            const baseTile = aside.locator(
                ".launcher-tile:has-text('Base App')",
            ).first();
            await baseTile.click({ button: "right" });
            const editMenuItem = page.locator(
                '[role="menuitem"]:has-text("更换图标")',
            );
            await editMenuItem.waitFor({ state: "visible" });
            await editMenuItem.click();

            // In edit mode, change URL
            await urlInput.waitFor({ state: "visible" });
            await urlInput.fill("https://example.com/changed-url");

            let updateRequests = 0;
            await page.route("**/api/webapps/**", async (route) => {
                if (
                    route.request().method() === "PATCH" ||
                    route.request().method() === "POST"
                ) {
                    updateRequests++;
                }
                await route.continue();
            });

            // Submit triggers icon update confirmation AlertDialog
            await submitBtn.click();
            const iconDialog = page.locator(
                '[role="alertdialog"]:has-text("网址已改变，是否重新获取网站图标？")',
            );
            await iconDialog.waitFor({ state: "visible" });

            // Escape closes dialog with 0 mutations
            await page.keyboard.press("Escape");
            await iconDialog.waitFor({ state: "hidden" });
            assertEquals(updateRequests, 0);
            assertEquals(
                await submitBtn.evaluate((el) => el === document.activeElement),
                true,
            );

            // Cancel closes dialog with 0 mutations
            await submitBtn.click();
            await iconDialog.waitFor({ state: "visible" });
            const cancelIconBtn = iconDialog.getByRole("button", {
                name: "取消",
            });
            await cancelIconBtn.click();
            await iconDialog.waitFor({ state: "hidden" });
            assertEquals(updateRequests, 0);
            assertEquals(
                await submitBtn.evaluate((el) => el === document.activeElement),
                true,
            );
            // Confirm a real server-side fetch rejection without external network IO.
            await urlInput.fill("https://127.0.0.1/icon-confirm");
            await Promise.all([
                page.waitForResponse((response) =>
                    response.url().endsWith("/api/webapp-icons/fetch")
                ),
                urlInput.press("Tab"),
            ]);
            const iconGate = Promise.withResolvers<void>();
            let iconFetchRequests = 0;
            await page.route("**/api/webapp-icons/fetch", async (route) => {
                iconFetchRequests++;
                await iconGate.promise;
                await route.continue();
            });
            await submitBtn.click();
            await iconDialog.waitFor({ state: "visible" });
            const refreshIcon = iconDialog.getByRole("button", {
                name: "重新获取并保存",
            });
            try {
                await refreshIcon.click();
                await page.waitForFunction(() => {
                    const action = document.querySelector<HTMLButtonElement>(
                        '[role="alertdialog"] [data-slot="alert-dialog-action"]',
                    );
                    return action?.disabled;
                });
                assertEquals(
                    await iconDialog.locator(
                        '[data-slot="alert-dialog-action"]',
                    ).isDisabled(),
                    true,
                );
                assertEquals(
                    await iconDialog.getByRole("button", { name: "取消" })
                        .isDisabled(),
                    true,
                );
            } finally {
                iconGate.resolve();
            }
            await iconDialog.waitFor({ state: "hidden" });
            await page.getByText(/保存失败/).waitFor({ state: "visible" });
            assertEquals(iconFetchRequests, 1);
            assertEquals(updateRequests, 0);
            const unchanged = await store.run(async (db) =>
                (await db.select().from(webapps).all()).find((row) =>
                    row.id === baseAppId
                )
            );
            assertEquals(unchanged?.url, "https://example.com/base-url");
            assertEquals(unchanged?.iconAssetId, "asset-123");
        },
    );
    await t.step(
        "UndoToast: Home app/note 删除撤销恢复与 Ask conversation 删除撤销恢复无需真实模型",
        async () => {
            const undoAppId = "app-undo-test-1";
            const undoNoteId = "note-undo-test-1";
            const undoConvId = "conv-undo-test-1";
            const now = Date.now();

            // Seed 1 app, 1 note, and 1 conversation for undo tests
            await store.run(async (db) => {
                await db.insert(webapps).values({
                    id: undoAppId,
                    userId: user.id,
                    name: "Undo Target WebApp",
                    url: "https://example.com/undo-target-app",
                    sortOrder: 20,
                    createdAt: now,
                    updatedAt: now,
                });
                await db.insert(notes).values({
                    id: undoNoteId,
                    userId: user.id,
                    title: "Undo Target Note",
                    currentBody: "Note text to be restored via UndoToast",
                    color: "sky",
                    createdAt: now,
                    updatedAt: now,
                });
                await db.insert(aiConversations).values({
                    id: undoConvId,
                    userId: user.id,
                    title: "Undo Target Conversation",
                    historyEnabled: true,
                    createdAt: now,
                    updatedAt: now,
                });
            });

            const { page, context } = await createTestPage({
                width: 1280,
                height: 800,
            });
            await authenticateContext(context);
            await visit("/", page);

            // 1. Home / Apps workspace: App delete and UndoToast restoration
            const appsBtn = page.locator(
                '.desktop-dock button[aria-label="应用工作区"], button[data-workspace="apps"], .workspace-dock button[aria-label="应用工作区"]',
            );
            await appsBtn.first().waitFor({ state: "visible" });
            await appsBtn.first().click();

            const aside = page.locator(
                '.desktop-window[data-window-id="apps"], .workspace-panel--mobile, aside.workspace-panel, .workspace-panel',
            );
            await aside.waitFor({ state: "visible" });

            const appTile = aside.locator(
                ".launcher-tile:has-text('Undo Target WebApp')",
            );
            await appTile.waitFor({ state: "visible" });

            // Intercept restore API
            let appRestored = false;
            await page.route("**/api/webapps/*/restore", async (route) => {
                appRestored = true;
                await route.continue();
            });

            // Delete app via context menu
            await appTile.click({ button: "right" });
            const deleteMenuItem = page.locator(
                '[role="menuitem"]:has-text("删除")',
            );
            await deleteMenuItem.waitFor({ state: "visible" });
            await deleteMenuItem.click();

            // UndoToast appears
            const appUndoToast = page.locator(
                ".undo-toast:has-text('应用已移至回收站')",
            );
            await appUndoToast.waitFor({ state: "visible" });
            await appTile.waitFor({ state: "hidden" });

            // Click 撤销
            const undoAppBtn = appUndoToast.getByRole("button", {
                name: "撤销",
                exact: true,
            });
            await undoAppBtn.click();
            assertEquals(appRestored, true);
            await appUndoToast.waitFor({ state: "hidden" });
            await appTile.waitFor({ state: "visible" });

            // 2. Home / Notes workspace: Note delete and UndoToast restoration
            const notesNavBtn = page.locator(
                '.desktop-dock button[aria-label="便签工作区"], aside button[aria-label="便签工作区"], .workspace-mobile-navigation button[aria-label="便签工作区"]',
            );
            await notesNavBtn.first().click();

            const notesAside = page.locator(
                '.desktop-window[data-window-id="notes"], .workspace-panel--mobile, aside.workspace-panel, .workspace-panel',
            );
            await notesAside.waitFor({ state: "visible" });

            const noteCard = notesAside.locator(
                ".note-card:has-text('Undo Target Note')",
            );
            await noteCard.waitFor({ state: "visible" });

            let noteRestored = false;
            await page.route("**/api/notes/*/restore", async (route) => {
                noteRestored = true;
                await route.continue();
            });

            // Open note more options and delete
            const noteMoreBtn = noteCard.locator(
                "button[aria-label='更多操作']",
            );
            await noteCard.hover();
            await noteMoreBtn.click({ force: true });
            const deleteNoteItem = page.locator(
                '[role="menuitem"]:has-text("移至回收站")',
            );
            await deleteNoteItem.waitFor({ state: "visible" });
            await deleteNoteItem.click();

            // UndoToast appears
            const noteUndoToast = page.locator(
                ".undo-toast:has-text('便签已移至回收站')",
            );
            await noteUndoToast.waitFor({ state: "visible" });
            await noteCard.waitFor({ state: "hidden" });

            // Click 撤销
            const undoNoteBtn = noteUndoToast.getByRole("button", {
                name: "撤销",
                exact: true,
            });
            await undoNoteBtn.click();
            assertEquals(noteRestored, true);
            await noteUndoToast.waitFor({ state: "hidden" });
            await noteCard.waitFor({ state: "visible" });

            // 3. Ask workspace: Conversation delete and UndoToast restoration (no real AI model needed)
            const { page: askPage, context: askContext } = await createTestPage(
                { width: 1280, height: 800 },
            );
            await authenticateContext(askContext);
            await visit("/ask", askPage);

            const convItem = askPage.locator(
                ".ask-sidebar__item:has-text('Undo Target Conversation')",
            );
            await convItem.waitFor({ state: "visible" });

            let convRestored = false;
            await askPage.route(
                "**/api/ai/conversations/*/restore",
                async (route) => {
                    convRestored = true;
                    await route.continue();
                },
            );

            // Click conversation actions menu and select 删除
            const convMenuBtn = convItem.locator("button[aria-label*='操作']");
            await convMenuBtn.click();
            const deleteConvItem = askPage.locator(
                '[role="menuitem"]:has-text("删除")',
            );
            await deleteConvItem.waitFor({ state: "visible" });
            await deleteConvItem.click();

            // UndoToast appears
            const convUndoToast = askPage.locator(
                ".undo-toast:has-text('已删除对话')",
            );
            await convUndoToast.waitFor({ state: "visible" });
            assertStringIncludes(
                await convUndoToast.textContent() ?? "",
                "Undo Target Conversation",
            );
            await convItem.waitFor({ state: "hidden" });

            // Click 撤销
            const undoConvBtn = convUndoToast.getByRole("button", {
                name: "撤销",
                exact: true,
            });
            await undoConvBtn.click();
            assertEquals(convRestored, true);
            await convUndoToast.waitFor({ state: "hidden" });
            await convItem.waitFor({ state: "visible" });
        },
    );

    await t.step(
        "Workspace: Apps/Notes initial loading, error, empty (首次空结果不闪空态) 及可读 warning",
        async () => {
            // Register a fresh clean user without apps or notes
            const emptyUsername = "empty_state_user_79";
            const emptyPassword = "Empty-Password-79!";
            const { page: emptyRegPage, context: _emptyContext } =
                await createTestPage({ width: 1280, height: 800 });
            await visit("/register", emptyRegPage);
            await emptyRegPage.locator("#auth-username").fill(emptyUsername);
            await emptyRegPage.locator("#auth-display-name").fill(
                "Empty State Tester",
            );
            await emptyRegPage.locator("#auth-password").fill(emptyPassword);
            await emptyRegPage.locator('form button[type="submit"]').click();
            await emptyRegPage.waitForURL(origin + "/");
            await emptyRegPage.locator("main").waitFor({ state: "visible" });

            // 1. Notes: initial loading gate -> ensure empty state does NOT flicker during load
            const { page: notesTestPage, context: notesContext } =
                await createTestPage({ width: 1280, height: 800 });
            const emptyUserRecord =
                (await store.run((db) => db.select().from(users).all())).find(
                    (u) => u.username === emptyUsername,
                );
            assertEquals(Boolean(emptyUserRecord), true);
            const { token: emptyToken } = await auth.createSession(
                emptyUserRecord!.id,
                emptyUserRecord!.authVersion,
            );
            await notesContext.addCookies([{
                name: "searcher_session",
                value: emptyToken,
                domain: "127.0.0.1",
                path: "/",
                httpOnly: true,
                sameSite: "Lax",
            }]);

            const notesGate = Promise.withResolvers<void>();
            await notesTestPage.route("**/api/notes", async (route) => {
                if (route.request().method() === "GET") {
                    await notesGate.promise;
                }
                await route.continue();
            });

            await visit("/", notesTestPage);
            const notesBtn = notesTestPage.locator(
                '.desktop-dock button[aria-label="便签工作区"], button[data-workspace="notes"], .workspace-dock button[aria-label="便签工作区"]',
            );
            await notesBtn.first().waitFor({ state: "visible" });
            await notesBtn.first().click();

            const notesAside = notesTestPage.locator(
                '.desktop-window[data-window-id="notes"], .workspace-panel--mobile, aside.workspace-panel, .workspace-panel',
            );
            await notesAside.waitFor({ state: "visible" });

            // While in flight: LoadingState is visible, EmptyState is NOT visible (no flicker!)
            const notesLoading = notesAside.locator(".loading-state");
            await notesLoading.waitFor({ state: "visible" });
            assertStringIncludes(
                await notesLoading.textContent() ?? "",
                "正在加载便签",
            );

            const notesEmpty = notesAside.locator(
                ".empty-state:has-text('还没有便签')",
            );
            assertEquals(await notesEmpty.isVisible(), false);

            // Release gate: LoadingState hides, EmptyState becomes visible
            notesGate.resolve();
            await notesLoading.waitFor({ state: "hidden" });
            await notesEmpty.waitFor({ state: "visible" });

            // Notes error state and readable warning
            await notesTestPage.route("**/api/notes", (route) => {
                if (route.request().method() === "GET") {
                    route.fulfill({
                        status: 500,
                        contentType: "application/json",
                        body: JSON.stringify({
                            message: "便签服务发生内部异常",
                        }),
                    });
                } else {
                    route.continue();
                }
            });

            // Reload page with 500 error route active
            await notesTestPage.reload();
            const notesReopenBtn = notesTestPage.locator(
                '.desktop-dock button[aria-label="便签工作区"], button[data-workspace="notes"], .workspace-dock button[aria-label="便签工作区"]',
            );
            await notesReopenBtn.first().waitFor({ state: "visible" });
            await notesReopenBtn.first().click();
            const notesErrorBanner = notesAside.locator(
                ".status-banner:has-text('便签服务发生内部异常')",
            );
            await notesErrorBanner.waitFor({ state: "visible" });
            const notesRetryBtn = notesErrorBanner.getByRole("button", {
                name: "重试",
            });
            assertEquals(await notesRetryBtn.isVisible(), true);

            // 2. Apps: initial loading and error states
            const { page: appsTestPage, context: appsContext } =
                await createTestPage({ width: 1280, height: 800 });
            const { token: appsToken } = await auth.createSession(
                emptyUserRecord!.id,
                emptyUserRecord!.authVersion,
            );
            await appsContext.addCookies([{
                name: "searcher_session",
                value: appsToken,
                domain: "127.0.0.1",
                path: "/",
                httpOnly: true,
                sameSite: "Lax",
            }]);

            const appsGate = Promise.withResolvers<void>();
            await appsTestPage.route("**/api/webapps", async (route) => {
                if (route.request().method() === "GET") {
                    await appsGate.promise;
                }
                await route.continue();
            });

            await visit("/", appsTestPage);
            const appsOpenBtn = appsTestPage.locator(
                '.desktop-dock button[aria-label="应用工作区"], button[data-workspace="apps"], .workspace-dock button[aria-label="应用工作区"]',
            );
            await appsOpenBtn.first().waitFor({ state: "visible" });
            await appsOpenBtn.first().click();

            const appsAside = appsTestPage.locator(
                '.desktop-window[data-window-id="apps"], .workspace-panel--mobile, aside.workspace-panel, .workspace-panel',
            );
            await appsAside.waitFor({ state: "visible" });

            // Loading state is visible in apps panel
            const appsLoading = appsAside.locator(".loading-state");
            await appsLoading.waitFor({ state: "visible" });
            assertStringIncludes(
                await appsLoading.textContent() ?? "",
                "正在加载网站",
            );

            appsGate.resolve();
            await appsLoading.waitFor({ state: "hidden" });

            // Apps error state and readable warning
            await appsTestPage.route("**/api/webapps", (route) => {
                if (route.request().method() === "GET") {
                    route.fulfill({
                        status: 500,
                        contentType: "application/json",
                        body: JSON.stringify({ message: "网站服务连接失败" }),
                    });
                } else {
                    route.continue();
                }
            });

            // Reload page with 500 error route active
            await appsTestPage.reload();
            const appsReopenBtn = appsTestPage.locator(
                '.desktop-dock button[aria-label="应用工作区"], button[data-workspace="apps"], .workspace-dock button[aria-label="应用工作区"]',
            );
            await appsReopenBtn.first().waitFor({ state: "visible" });
            await appsReopenBtn.first().click();
            const appsErrorBanner = appsAside.locator(
                ".status-banner:has-text('网站服务连接失败')",
            );
            await appsErrorBanner.waitFor({ state: "visible" });
            const appsRetryBtn = appsErrorBanner.getByRole("button", {
                name: "重试",
            });
            assertEquals(await appsRetryBtn.isVisible(), true);
        },
    );
});
