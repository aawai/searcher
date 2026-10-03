import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { chromium, type Page } from "playwright";
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

interface SurfaceMetrics {
    radius: string;
    surface: string;
    shadow: string;
    cardBorderRadius?: string;
    cardBackground?: string;
    cardBoxShadow?: string;
}

Deno.test("UI Ownership and style scoping contracts", async (t) => {
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
        await target.locator("main").waitFor({ state: "visible" });
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

    async function getSurfaceMetrics(
        target: Page = page,
    ): Promise<SurfaceMetrics> {
        await target.getByRole("status").filter({ hasText: /加载/ }).waitFor({
            state: "hidden",
        });
        return await target.evaluate(() => {
            const main = document.querySelector("main") ||
                document.documentElement;
            const mainStyle = getComputedStyle(main);
            const card = document.querySelector(
                ".card, [data-slot='card'], .settings-card, .auth-surface, section",
            );
            const cardStyle = card ? getComputedStyle(card) : null;

            return {
                radius: mainStyle.getPropertyValue("--radius").trim(),
                surface: mainStyle.getPropertyValue("--surface").trim(),
                shadow: mainStyle.getPropertyValue("--shadow").trim(),
                cardBorderRadius: cardStyle?.borderRadius,
                cardBackground: cardStyle?.backgroundColor,
                cardBoxShadow: cardStyle?.boxShadow,
            };
        });
    }

    await t.step(
        "Admin login fixture establishes authenticated session",
        async () => {
            await visit("/admin");
            // Verify admin dashboard renders without '无权访问'
            await page.getByRole("heading", { name: "管理后台" }).first()
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
        "Home style zen vs widgets switching isolates Settings/Admin/Account/Trash/Ask",
        async () => {
            const monitoredPaths = [
                "/settings",
                "/admin",
                "/account",
                "/trash",
                "/ask",
            ];

            // 1. Set style to zen
            await visit("/settings/appearance");
            await updatePreferences({ style: "zen" });
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });

            // Record zen metrics for monitored pages
            const zenMetrics: Record<string, SurfaceMetrics> = {};
            for (const path of monitoredPaths) {
                await visit(path);

                zenMetrics[path] = await getSurfaceMetrics(page);
            }

            // Record zen Home metrics
            await visit("/");
            await page.waitForFunction(
                () =>
                    document.querySelector("main")?.classList.contains(
                        "home-zen",
                    ),
            );

            const zenHomeMetrics = await getSurfaceMetrics(page);

            // 2. Set style to widgets
            await visit("/settings/appearance");
            await updatePreferences({ style: "widgets" });
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });

            // Record widgets Home metrics
            await visit("/");
            await page.waitForFunction(
                () =>
                    document.querySelector("main")?.classList.contains(
                        "home-widgets",
                    ),
            );

            const widgetsHomeMetrics = await getSurfaceMetrics(page);

            // Verify Home root appearance actually changed
            assertNotEquals(
                zenHomeMetrics.radius,
                widgetsHomeMetrics.radius,
                "Home root radius must change between zen and widgets",
            );
            assertNotEquals(
                zenHomeMetrics.shadow,
                widgetsHomeMetrics.shadow,
                "Home root shadow must change between zen and widgets",
            );

            // 3. Verify monitored pages have identical surface/radius/shadow metrics
            for (const path of monitoredPaths) {
                await visit(path);

                const widgetsMetric = await getSurfaceMetrics(page);
                const zenMetric = zenMetrics[path];

                assertEquals(
                    widgetsMetric.radius,
                    zenMetric.radius,
                    `${path} radius must remain unchanged between zen and widgets`,
                );
                assertEquals(
                    widgetsMetric.surface,
                    zenMetric.surface,
                    `${path} surface must remain unchanged between zen and widgets`,
                );
                assertEquals(
                    widgetsMetric.shadow,
                    zenMetric.shadow,
                    `${path} shadow must remain unchanged between zen and widgets`,
                );
                assertEquals(
                    widgetsMetric.cardBorderRadius,
                    zenMetric.cardBorderRadius,
                    `${path} card border-radius must remain unchanged`,
                );
                assertEquals(
                    widgetsMetric.cardBackground,
                    zenMetric.cardBackground,
                    `${path} card background must remain unchanged`,
                );
                assertEquals(
                    widgetsMetric.cardBoxShadow,
                    zenMetric.cardBoxShadow,
                    `${path} card box-shadow must remain unchanged`,
                );
            }
        },
    );
    await t.step(
        "Global theme, accent, and search shape preferences remain effective globally",
        async () => {
            await visit("/settings/appearance");

            // 1. Theme global application via Appearance UI
            await page.getByRole("tab", { name: "深色", exact: true }).click();
            await page.waitForFunction(
                () => document.documentElement.dataset.theme === "dark",
            );
            assertEquals(
                await page.evaluate(() =>
                    document.documentElement.dataset.theme
                ),
                "dark",
            );

            await page.getByRole("tab", { name: "浅色", exact: true }).click();
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
            const violetAccent = await page.evaluate(() =>
                getComputedStyle(document.documentElement).getPropertyValue(
                    "--accent",
                ).trim()
            );
            assert(
                violetAccent === "#6d28d9" ||
                    violetAccent === "rgb(109, 40, 217)",
                `Expected violet accent token, got ${violetAccent}`,
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

            // Return to appearance
            await visit("/settings/appearance");

            // 3. Search shape global application via Appearance UI
            await page.getByRole("tab", { name: "胶囊", exact: true }).click();
            await page.waitForFunction(
                () =>
                    document.documentElement.dataset.shape === "pill" &&
                    getComputedStyle(document.documentElement).getPropertyValue(
                            "--search-radius",
                        ).trim() === "999px",
            );
            assertEquals(
                await page.evaluate(() =>
                    document.documentElement.dataset.shape
                ),
                "pill",
            );
            assertEquals(
                await page.evaluate(() =>
                    getComputedStyle(document.documentElement).getPropertyValue(
                        "--search-radius",
                    ).trim()
                ),
                "999px",
            );

            await page.getByRole("tab", { name: "默认", exact: true }).click();
            await page.waitForFunction(
                () =>
                    document.documentElement.dataset.shape === "rounded" &&
                    getComputedStyle(document.documentElement).getPropertyValue(
                            "--search-radius",
                        ).trim() === "16px",
            );
            assertEquals(
                await page.evaluate(() =>
                    document.documentElement.dataset.shape
                ),
                "rounded",
            );
            assertEquals(
                await page.evaluate(() =>
                    getComputedStyle(document.documentElement).getPropertyValue(
                        "--search-radius",
                    ).trim()
                ),
                "16px",
            );

            // Dataset style remains unpolluted
            assertEquals(
                await page.evaluate(() =>
                    document.documentElement.dataset.style
                ),
                undefined,
            );

            // Restore defaults for subsequent tests
            await page.getByRole("tab", { name: "跟随系统", exact: true })
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
            const currentPassInput = page.getByLabel("当前密码");
            const newPassInput = page.getByLabel("新密码 (至少 12 个字符)");
            const confirmPassInput = page.getByLabel("确认新密码");

            await currentPassInput.fill(password);
            await newPassInput.fill("New-valid-password-123!");
            await confirmPassInput.fill("Mismatch-different-password-456!");
            await page.getByRole("button", { name: "更新密码" }).click();
            await page.getByRole("alert").filter({
                hasText: "两次输入的新密码不一致",
            }).waitFor({ state: "visible" });

            // Trigger logout confirmation AlertDialog
            await page.getByRole("button", { name: "退出此设备" }).click();
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
            await page.getByRole("heading", { name: "回收站空空如也" }).waitFor(
                {
                    state: "visible",
                },
            );
            await page.getByText("没有已删除的网站快捷方式").waitFor({
                state: "visible",
            });

            // Switch to notes tab
            await page.getByRole("tab", { name: /^便签/ }).click();
            await page.getByRole("heading", { name: "回收站空空如也" }).waitFor(
                {
                    state: "visible",
                },
            );
            await page.getByText("没有已删除的便签记录").waitFor({
                state: "visible",
            });

            // 3. Admin user management table canonical rendering
            await visit("/admin/users", page);
            const table = page.getByRole("table");
            await table.waitFor({ state: "visible" });
            await page.locator("th").filter({ hasText: "用户" }).first()
                .waitFor({
                    state: "visible",
                });
            await page.getByRole("cell", { name: username }).waitFor({
                state: "visible",
            });

            // 4. Ask page workbench layout canonical rendering
            await visit("/ask", page);
            await page.getByRole("button", { name: "新对话" }).waitFor({
                state: "visible",
            });
            const chatInput = page.getByRole("textbox");
            await chatInput.first().waitFor({ state: "visible" });
        },
    );
});
