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
            ? "main.home"
            : path.startsWith("/settings") || path === "/account"
            ? '[data-window-id="settings"] .settings-layout'
            : path === "/trash"
            ? '[data-window-id="trash"] .trash-page'
            : path.startsWith("/ask")
            ? "main.ask-page-shell"
            : 'main[data-archetype="management"]';
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
            await page.getByRole("radio", { name: "胶囊", exact: true })
                .click();
            await page.waitForFunction(() =>
                document.documentElement.dataset.shape === "pill" &&
                getComputedStyle(document.documentElement).getPropertyValue(
                        "--search-radius",
                    ).trim() === "999px"
            );

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
                document.documentElement.dataset.glass === "clear" &&
                getComputedStyle(document.documentElement).getPropertyValue(
                    "--material-filter",
                ).includes("blur(8px)")
            );
            await page.getByText("通透会透出壁纸，首页文字可读性随壁纸变化", {
                exact: true,
            }).waitFor();
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

            await page.getByRole("radio", { name: "圆角", exact: true })
                .click();
            await page.waitForFunction(() =>
                document.documentElement.dataset.shape === "rounded" &&
                getComputedStyle(document.documentElement).getPropertyValue(
                        "--search-radius",
                    ).trim() === "16px"
            );
            await updatePreferences({
                searchShape: "rounded",
                glassIntensity: "regular",
                showAppLabels: true,
            });
            await page.reload();

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
        "Utility/Management/Workbench/Search geometry has no overflow across 390/768/1440 x light/dark",
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

            for (const colorScheme of ["light", "dark"] as const) {
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
            await passwordDialog.getByRole("alert").filter({
                hasText: "两次输入的新密码不一致",
            }).waitFor({ state: "visible" });
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
            await page.getByRole("heading", { name: "回收站" }).first().waitFor(
                {
                    state: "visible",
                },
            );
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
            await page.getByRole("link", { name: "前往模型配置" }).waitFor({
                state: "visible",
            });
        },
    );
});
