import { assert, assertEquals } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

Deno.test("production Workspace state, keyboard and responsive contracts", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({ prefix: "searcher-shell-" });
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
    const app = createApp({
        store,
        auth: new AuthService({ store, origin }),
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
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(origin + "/register");
    await page.locator("#auth-username").fill("shell44");
    await page.locator("#auth-display-name").fill("Shell contract");
    await page.locator("#auth-password").fill("shell-contract-password");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    async function request<T>(
        path: string,
        method = "GET",
        body?: object,
    ): Promise<T> {
        return await page.evaluate(async ({ path, method, body }) => {
            const response = await fetch(path, {
                method,
                headers: { "Content-Type": "application/json" },
                body: body ? JSON.stringify(body) : undefined,
            });
            if (!response.ok) throw new Error(await response.text());
            return (await response.json()).data;
        }, { path, method, body }) as T;
    }
    await request("/api/preferences", "PATCH", { style: "widgets" });
    const panel = page.locator(".workspace-panel");
    const appsTrigger = '.workspace-dock button[aria-label="应用工作区"]';
    const search = () => panel.locator("input[data-workspace-search]");
    const close = () =>
        panel.getByRole("button", { name: "收起工作区", exact: true }).click();
    async function openApps() {
        await page.locator(appsTrigger).click();
        await search().waitFor();
    }
    const fail = {
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
            status: false,
            message: "Contract API unavailable",
            data: null,
        }),
    };

    await t.step(
        "loading remains bounded; retry recovers an empty Apps launcher",
        async () => {
            // Start without stale data so a failed GET exercises the API-error branch.
            await page.waitForFunction(() =>
                new Promise<boolean>((resolve, reject) => {
                    const open = indexedDB.open("searcher-client", 1);
                    open.onerror = () => reject(open.error);
                    open.onsuccess = () => {
                        const db = open.result;
                        const tx = db.transaction("state", "readwrite");
                        const keys = tx.objectStore("state").getAllKeys();
                        let found = false;
                        keys.onsuccess = () => {
                            for (const key of keys.result) {
                                if (String(key).startsWith("webapps:")) {
                                    found = true;
                                    tx.objectStore("state").delete(key);
                                }
                            }
                        };
                        tx.oncomplete = () => {
                            db.close();
                            resolve(found);
                        };
                        tx.onerror = () => reject(tx.error);
                    };
                })
            );
            const gate = Promise.withResolvers<void>();
            await page.route("**/api/webapps", async (route) => {
                await gate.promise;
                await route.fulfill(fail);
            });
            try {
                await page.goto(origin + "/");
                await openApps();
                await panel.getByText("正在加载", { exact: false }).waitFor();
                await assertChromeInViewport(page);
                gate.resolve();
                const retry = panel.getByRole("button", {
                    name: "重试",
                    exact: true,
                });
                await retry.waitFor();
                await panel.getByRole("alert").filter({
                    hasText: "Contract API unavailable",
                }).waitFor();
                await assertChromeInViewport(page);
                await page.unroute("**/api/webapps");
                const recovered = page.waitForResponse((response) =>
                    new URL(response.url()).pathname === "/api/webapps" &&
                    response.status() === 200
                );
                await retry.click();
                await recovered;
                await panel.locator(".launcher-empty").waitFor();
                assertEquals(await panel.locator(".webapp-icon").count(), 0);
                await close();
            } finally {
                gate.resolve();
                await page.unroute("**/api/webapps");
            }
        },
    );

    const first = await request<{ id: string }>("/api/webapps", "POST", {
        name: "State Alpha",
        url: "https://example.org/state-alpha",
        isPinned: true,
    });
    const second = await request<{ id: string }>("/api/webapps", "POST", {
        name: "State Beta",
        url: "https://example.org/state-beta",
    });
    await t.step(
        "offline stale Apps cache remains browsable and explicit retry refreshes it",
        async () => {
            await page.reload();
            await openApps();
            await panel.getByRole("button", {
                name: "打开 State Alpha",
                exact: true,
            }).waitFor();
            await page.waitForFunction(() =>
                new Promise<boolean>((resolve, reject) => {
                    const open = indexedDB.open("searcher-client", 1);
                    open.onerror = () => reject(open.error);
                    open.onsuccess = () => {
                        const db = open.result;
                        const tx = db.transaction("state", "readonly");
                        const keys = tx.objectStore("state").getAllKeys();
                        keys.onsuccess = () =>
                            resolve(
                                keys.result.some((key) =>
                                    String(key).startsWith("webapps:")
                                ),
                            );
                        tx.oncomplete = () => db.close();
                    };
                })
            );
            await page.route("**/api/webapps", (route) => route.abort());
            try {
                await page.reload();
                await openApps();
                const retry = panel.getByRole("button", {
                    name: "重试",
                    exact: true,
                });
                await retry.waitFor();
                await panel.getByRole("button", {
                    name: "打开 State Alpha",
                    exact: true,
                }).waitFor();
                await panel.getByRole("button", {
                    name: "打开 State Beta",
                    exact: true,
                }).waitFor();
                await assertChromeInViewport(page);
                const added = await context.request.post(
                    origin + "/api/webapps",
                    {
                        headers: { Origin: origin },
                        data: {
                            name: "Recovered App",
                            url: "https://example.org/recovered",
                        },
                    },
                );
                assertEquals(added.status(), 200);
                await page.unroute("**/api/webapps");
                await retry.click();
                await panel.getByRole("button", {
                    name: "打开 Recovered App",
                    exact: true,
                }).waitFor();
                await retry.waitFor({ state: "detached" });
                await search().fill("no-match-contract-44");
                await panel.getByRole("button", {
                    name: "清除搜索",
                    exact: true,
                }).waitFor();
                assertEquals(await panel.locator(".webapp-icon").count(), 0);
                await panel.getByRole("button", {
                    name: "清除搜索",
                    exact: true,
                }).click();
                await panel.getByRole("button", {
                    name: "打开 State Alpha",
                    exact: true,
                }).waitFor();
                await close();
            } finally {
                await page.unroute("**/api/webapps");
            }
        },
    );

    await t.step(
        "failed add/edit preserves draft and error; retry saves; delete/undo restores",
        async () => {
            await openApps();
            await panel.locator(".workspace-footer .workspace-primary").click();
            await page.locator("#app-url-input").fill(
                "https://example.org/draft",
            );
            await page.locator("#app-name-input").fill("Preserved draft");
            await page.route("**/api/webapps", async (route) => {
                if (route.request().method() === "POST") {
                    await route.fulfill(fail);
                } else await route.continue();
            });
            try {
                await page.locator('.app-dialog-footer button[type="submit"]')
                    .click();
                await page.getByRole("alert").filter({
                    hasText: "Contract API unavailable",
                }).waitFor();
                assertEquals(
                    await page.locator("#app-url-input").inputValue(),
                    "https://example.org/draft",
                );
                assertEquals(
                    await page.locator("#app-name-input").inputValue(),
                    "Preserved draft",
                );
                await assertChromeInViewport(page);
                await page.unroute("**/api/webapps");
                await page.locator('.app-dialog-footer button[type="submit"]')
                    .click();
                await panel.getByRole("button", {
                    name: "打开 Preserved draft",
                    exact: true,
                }).waitFor();
            } finally {
                await page.unroute("**/api/webapps");
            }
            await panel.getByRole("button", {
                name: "打开 State Alpha",
                exact: true,
            }).click({ button: "right" });
            await page.getByRole("menuitem", { name: "编辑", exact: true })
                .click();
            await page.locator("#app-name-input").fill("Edited Alpha");
            await page.route(
                `**/api/webapps/${first.id}`,
                (route) => route.fulfill(fail),
            );
            try {
                await page.locator('.app-dialog-footer button[type="submit"]')
                    .click();
                await page.getByRole("alert").filter({
                    hasText: "Contract API unavailable",
                }).waitFor();
                assertEquals(
                    await page.locator("#app-name-input").inputValue(),
                    "Edited Alpha",
                );
                await page.unroute(`**/api/webapps/${first.id}`);
                await page.locator('.app-dialog-footer button[type="submit"]')
                    .click();
                await panel.getByRole("button", {
                    name: "打开 Edited Alpha",
                    exact: true,
                }).waitFor();
            } finally {
                await page.unroute(`**/api/webapps/${first.id}`);
            }
            await panel.getByRole("button", {
                name: "打开 State Beta",
                exact: true,
            }).click({ button: "right" });
            await page.getByRole("menuitem", { name: "删除", exact: true })
                .click();
            const confirm = page.getByRole("alertdialog");
            if (await confirm.isVisible()) {
                await confirm.getByRole("button", { name: "删除", exact: true })
                    .click();
            }
            await panel.getByRole("button", {
                name: "打开 State Beta",
                exact: true,
            }).waitFor({ state: "detached" });
            assertEquals(
                (await request<Array<{ id: string }>>("/api/webapps")).some((
                    item,
                ) => item.id === second.id),
                false,
            );
            await page.getByRole("button", { name: "撤销", exact: true })
                .click();
            await panel.getByRole("button", {
                name: "打开 State Beta",
                exact: true,
            }).waitFor();
            assertEquals(
                (await request<Array<{ id: string }>>("/api/webapps")).some((
                    item,
                ) => item.id === second.id),
                true,
            );
            await close();
        },
    );

    for (let index = 0; index < 35; index++) {
        await request("/api/webapps", "POST", {
            name: (`Long App ${index} — ${"long name ".repeat(8)}`).slice(
                0,
                80,
            ),
            url: `https://example.org/many-${index}`,
        });
    }
    await request("/api/notes", "POST", {
        title: "Shell note",
        body: "Shell body",
    });
    await request("/api/preferences", "PATCH", { theme: "system" });
    await t.step(
        "viewport/theme/mode matrix keeps chrome bounded, scrolls only Body and restores focus",
        async () => {
            for (const style of ["widgets", "zen"] as const) {
                await request("/api/preferences", "PATCH", { style });
                for (const theme of ["light", "dark"] as const) {
                    await page.emulateMedia({ colorScheme: theme });
                    for (const width of [375, 390, 768, 1024, 1440, 1920]) {
                        await page.setViewportSize({ width, height: 900 });
                        await page.goto(origin + "/");
                        await page.waitForFunction(
                            (expected) =>
                                document.documentElement.dataset.theme ===
                                    expected,
                            theme,
                        );
                        const trigger = page.locator(
                            style === "widgets"
                                ? appsTrigger
                                : '.zen-edge-trigger button[data-workspace="apps"]',
                        );
                        await trigger.waitFor();
                        await page.locator(".hero").waitFor();
                        const hero = await page.locator(".hero").boundingBox();
                        await trigger.focus();
                        await page.keyboard.press("Enter");
                        await search().waitFor();
                        await page.waitForFunction(() =>
                            document.activeElement?.getAttribute(
                                "aria-label",
                            ) ===
                                "收起工作区"
                        );
                        await page.keyboard.press("Tab");
                        assertEquals(
                            await search().evaluate((el) =>
                                el === document.activeElement
                            ),
                            true,
                        );
                        assert(await search().getAttribute("aria-label"));
                        assertEquals(
                            await panel.locator(
                                '.workspace-switcher button[aria-label="应用工作区"]',
                            ).getAttribute("aria-pressed"),
                            "true",
                        );
                        assertEquals(
                            await panel.evaluate((el) =>
                                getComputedStyle(el).animationName
                            ),
                            "none",
                        );
                        await assertChromeInViewport(page);
                        const before = await chromeBounds(page);
                        await panel.locator(".workspace-body").evaluate((el) =>
                            el.scrollTop = el.scrollHeight
                        );
                        assert(
                            (await panel.locator(".workspace-body").evaluate((
                                el,
                            ) => el.scrollTop)) > 0,
                        );
                        assertEquals(await chromeBounds(page), before);
                        if (width >= 768) {
                            assertEquals(
                                await page.locator(
                                    '[data-slot="sheet-backdrop"]',
                                ).count(),
                                0,
                            );
                            assertEquals(
                                await page.locator(".hero").boundingBox(),
                                hero,
                            );
                            await page.locator("#search-query").focus();
                            assertEquals(
                                await page.locator("#search-query").evaluate((
                                    el,
                                ) => el === document.activeElement),
                                true,
                            );
                        } else {
                            assertEquals(
                                await page.locator(
                                    '[data-slot="sheet-backdrop"]',
                                ).isVisible(),
                                true,
                            );
                            await panel.getByRole("button", {
                                name: "收起工作区",
                                exact: true,
                            }).focus();
                            for (let tabIndex = 0; tabIndex < 12; tabIndex++) {
                                await page.keyboard.press("Tab");
                                assertEquals(
                                    await page.evaluate(() =>
                                        !!document.activeElement?.closest(
                                            ".workspace-panel",
                                        )
                                    ),
                                    true,
                                );
                            }
                            const footer = await panel.locator(
                                ".workspace-footer",
                            ).evaluate((el) => ({
                                padding: parseFloat(
                                    getComputedStyle(el).paddingBottom,
                                ),
                                min: parseFloat(
                                    getComputedStyle(el).getPropertyValue(
                                        "--space-4",
                                    ),
                                ),
                            }));
                            assert(footer.padding >= footer.min);
                        }
                        await panel.getByRole("button", {
                            name: "便签工作区",
                            exact: true,
                        }).focus();
                        await page.keyboard.press("Enter");
                        await panel.locator(".notes-workspace").waitFor();
                        await page.waitForFunction(() =>
                            document.activeElement?.getAttribute(
                                "aria-label",
                            ) === "收起工作区"
                        );
                        assertEquals(
                            await panel.locator(
                                '.workspace-switcher button[aria-label="便签工作区"]',
                            ).getAttribute("aria-pressed"),
                            "true",
                        );
                        await assertChromeInViewport(page);
                        if (width >= 768) {
                            assertEquals(
                                await page.locator(".hero").boundingBox(),
                                hero,
                            );
                        }
                        await panel.getByRole("button", {
                            name: "收起工作区",
                            exact: true,
                        }).focus();
                        await page.keyboard.press("Enter");
                        await panel.waitFor({ state: "detached" });
                        await page.waitForFunction(() =>
                            document.activeElement?.getAttribute(
                                "data-workspace",
                            ) === "notes"
                        );
                        assertEquals(
                            await page.locator(".hero").boundingBox(),
                            hero,
                        );
                    }
                }
            }
        },
    );

    await t.step(
        "keyboard-only Dock/Switcher/expand/Back/Close; overlay Escape takes priority",
        async () => {
            await request("/api/preferences", "PATCH", { style: "widgets" });
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.goto(origin + "/");
            await page.locator(appsTrigger).focus();
            await page.keyboard.press("Enter");
            await search().waitFor();
            await search().fill("State");
            await panel.getByRole("button", { name: "便签工作区", exact: true })
                .focus();
            await page.keyboard.press("Enter");
            await search().fill("Shell");
            const expand = panel.getByRole("button", {
                name: "展开",
                exact: true,
            });
            await expand.focus();
            await page.keyboard.press("Enter");
            await panel.locator(".note-preview").waitFor();
            assertEquals(await page.locator("#note-title-input").count(), 0);
            await panel.getByRole("button", { name: "折叠", exact: true })
                .focus();
            await page.keyboard.press("Enter");
            await panel.locator(".note-preview").waitFor({ state: "detached" });
            await panel.getByRole("button", { name: "应用工作区", exact: true })
                .focus();
            await page.keyboard.press("Enter");
            assertEquals(await search().inputValue(), "State");
            await search().fill("");
            await panel.getByRole("button", {
                name: "打开 Edited Alpha",
                exact: true,
            }).focus();
            await page.keyboard.press("Shift+F10");
            await page.getByRole("menu").waitFor();
            await page.keyboard.press("Escape");
            await page.getByRole("menu").waitFor({ state: "detached" });
            assertEquals(await panel.isVisible(), true);
            await panel.locator(".workspace-footer .workspace-primary").focus();
            await page.keyboard.press("Enter");
            await page.locator("#app-url-input").waitFor();
            await page.waitForFunction(() =>
                document.activeElement?.getAttribute("aria-label") ===
                    "返回上一级"
            );
            await page.keyboard.press("Enter");
            await search().waitFor();
            await page.waitForFunction(() =>
                document.activeElement?.getAttribute("aria-label") ===
                    "收起工作区"
            );
            await panel.getByRole("button", { name: "便签工作区", exact: true })
                .focus();
            await page.keyboard.press("Enter");
            assertEquals(await search().inputValue(), "Shell");
            await page.keyboard.press("Escape");
            await panel.waitFor({ state: "detached" });
            await page.waitForFunction(() =>
                document.activeElement?.getAttribute("data-workspace") ===
                    "notes"
            );
        },
    );

    await t.step(
        "issue #57 cross-workspace layout contract: geometry, search alignment, footer hierarchy, stability",
        async () => {
            await request("/api/preferences", "PATCH", {
                style: "widgets",
                theme: "system",
            });

            for (const theme of ["light", "dark"] as const) {
                await page.emulateMedia({ colorScheme: theme });
                for (const width of [375, 390, 768, 1024, 1440]) {
                    await page.setViewportSize({ width, height: 900 });
                    await page.goto(origin + "/");
                    await page.waitForFunction(
                        (expected) =>
                            document.documentElement.dataset.theme === expected,
                        theme,
                    );
                    await openApps();
                    await search().waitFor();
                    await page.waitForFunction(() =>
                        document.activeElement?.getAttribute("aria-label") ===
                            "收起工作区"
                    );
                    await panel.locator(".apps-workspace-banner--loading")
                        .waitFor({ state: "detached" });
                    await search().fill("");

                    const appsSearch = await measureBox(search());
                    const appsInset = await measureBodyInset(panel);
                    const appsFooter = await measureBox(
                        panel.locator(".workspace-footer"),
                    );
                    const appsSwitcher = await measureBox(
                        panel.locator(".workspace-switcher"),
                    );
                    const appsPanel = await measureBox(panel);
                    const appsBtn = await measureButtonProperties(
                        panel.locator(
                            ".workspace-footer button.button--primary",
                        ),
                    );

                    // WorkspaceBody sole page-level inline inset: search and content align with body padding
                    assertNear(appsInset.searchLeftDiff, 0, 2);
                    assertNear(appsInset.searchRightDiff, 0, 2);
                    assertNear(appsInset.contentLeftDiff, 0, 2);
                    assertNear(appsInset.contentRightDiff, 0, 2);

                    // Switch Apps -> Notes
                    await panel.getByRole("button", {
                        name: "便签工作区",
                        exact: true,
                    }).click();
                    await panel.locator(".notes-workspace").waitFor();
                    await search().waitFor();
                    await page.waitForFunction(() =>
                        document.activeElement?.getAttribute("aria-label") ===
                            "收起工作区"
                    );
                    await panel.locator('p[role="status"]', {
                        hasText: "正在加载",
                    }).waitFor({ state: "detached" });
                    await search().fill("");

                    const notesSearch = await measureBox(search());
                    const notesInset = await measureBodyInset(panel);
                    const notesFooter = await measureBox(
                        panel.locator(".workspace-footer"),
                    );
                    const notesSwitcher = await measureBox(
                        panel.locator(".workspace-switcher"),
                    );
                    const notesPanel = await measureBox(panel);
                    const notesBtn = await measureButtonProperties(
                        panel.locator(
                            ".workspace-footer button.button--primary",
                        ),
                    );

                    assertNear(notesInset.searchLeftDiff, 0, 2);
                    assertNear(notesInset.searchRightDiff, 0, 2);
                    assertNear(notesInset.contentLeftDiff, 0, 2);
                    assertNear(notesInset.contentRightDiff, 0, 2);

                    // Search geometry: x, right, width <= 2px and height <= 1px
                    assertNear(appsSearch.x, notesSearch.x, 2);
                    assertNear(appsSearch.right, notesSearch.right, 2);
                    assertNear(appsSearch.width, notesSearch.width, 2);
                    assertNear(appsSearch.height, notesSearch.height, 1);

                    // Panel, Footer, Switcher stability
                    assertBoxesNear(appsPanel, notesPanel, 1);
                    assertBoxesNear(appsFooter, notesFooter, 1);
                    assertBoxesNear(appsSwitcher, notesSwitcher, 1);

                    // Footer create action visual hierarchy identical
                    assertEquals(appsBtn.isPrimary, true);
                    assertEquals(notesBtn.isPrimary, true);
                    assertNear(appsBtn.width, notesBtn.width, 1);
                    assertNear(appsBtn.height, notesBtn.height, 1);
                    assertEquals(appsBtn.borderRadius, notesBtn.borderRadius);
                    assertEquals(
                        appsBtn.backgroundColor,
                        notesBtn.backgroundColor,
                    );
                    assertEquals(appsBtn.color, notesBtn.color);

                    // Switch Notes -> Apps
                    await panel.getByRole("button", {
                        name: "应用工作区",
                        exact: true,
                    }).click();
                    await panel.locator(".apps-workspace .workspace-root")
                        .waitFor();
                    await search().waitFor();
                    await page.waitForFunction(() =>
                        document.activeElement?.getAttribute("aria-label") ===
                            "收起工作区"
                    );
                    await assertChromeInViewport(page);
                }
            }

            // Desktop viewport for interaction, focus/blur, arrange hierarchy, and chrome stability
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.goto(origin + "/");
            await openApps();
            await search().waitFor();
            await page.waitForFunction(() =>
                document.activeElement?.getAttribute("aria-label") ===
                    "收起工作区"
            );

            // 1. Focus visibility and blur without shift
            await search().evaluate(async (el) => {
                await Promise.all(el.getAnimations().map((a) => a.finished));
            });
            const panelBaseline = await measureBox(panel);
            const bodyBaseline = await measureBox(
                panel.locator(".workspace-body"),
            );
            const searchBaseline = await measureBox(search());
            const blurStyle = await search().evaluate((el) => {
                const s = getComputedStyle(el);
                return { boxShadow: s.boxShadow, outline: s.outline };
            });

            // Focus search input
            await search().focus();
            await search().evaluate(async (el) => {
                await Promise.all(el.getAnimations().map((a) => a.finished));
            });
            const focusStyle = await search().evaluate((el) => {
                const s = getComputedStyle(el);
                return {
                    boxShadow: s.boxShadow,
                    outline: s.outline,
                    focusVisible: el.matches(":focus-visible"),
                };
            });
            assert(
                focusStyle.boxShadow !== blurStyle.boxShadow ||
                    focusStyle.outline !== blurStyle.outline,
                "Focus must visibly alter box-shadow or outline",
            );
            assertEquals(focusStyle.focusVisible, true);

            const panelFocused = await measureBox(panel);
            const bodyFocused = await measureBox(
                panel.locator(".workspace-body"),
            );
            const searchFocused = await measureBox(search());
            assertEquals(panelFocused, panelBaseline);
            assertEquals(bodyFocused, bodyBaseline);
            assertEquals(searchFocused, searchBaseline);

            await search().blur();
            await search().evaluate(async (el) => {
                await Promise.all(el.getAnimations().map((a) => a.finished));
            });
            const panelAfterBlur = await measureBox(panel);
            const bodyAfterBlur = await measureBox(
                panel.locator(".workspace-body"),
            );
            const searchAfterBlur = await measureBox(search());
            assertEquals(panelAfterBlur, panelBaseline);
            assertEquals(bodyAfterBlur, bodyBaseline);
            assertEquals(searchAfterBlur, searchBaseline);

            // 2. Clear action & independent search queries
            await search().fill("AlphaAppsQuery");
            const clearBtn = panel.locator(".workspace-search-clear");
            await clearBtn.waitFor({ state: "visible" });
            await clearBtn.focus();
            await page.keyboard.press("Enter");
            assertEquals(await search().inputValue(), "");
            assertEquals(await clearBtn.count(), 0);

            await page.waitForFunction(() =>
                document.activeElement?.matches("input[data-workspace-search]")
            );
            await page.keyboard.type("AppsQueryPersisted");
            await panel.getByRole("button", {
                name: "便签工作区",
                exact: true,
            }).click();
            await panel.locator(".notes-workspace").waitFor();
            await search().waitFor();
            assertEquals(await search().inputValue(), "");
            await search().fill("NotesQueryToClear");
            await clearBtn.focus();
            await page.keyboard.press("Enter");
            assertEquals(await search().inputValue(), "");
            await page.waitForFunction(() =>
                document.activeElement?.matches("input[data-workspace-search]")
            );
            await page.keyboard.type("NotesQueryPersisted");

            await panel.getByRole("button", {
                name: "应用工作区",
                exact: true,
            }).click();
            await panel.locator(".apps-workspace .workspace-root").waitFor();
            await search().waitFor();
            assertEquals(await search().inputValue(), "AppsQueryPersisted");

            await panel.getByRole("button", {
                name: "便签工作区",
                exact: true,
            }).click();
            await panel.locator(".notes-workspace").waitFor();
            await search().waitFor();
            assertEquals(await search().inputValue(), "NotesQueryPersisted");

            await search().fill("");
            await panel.getByRole("button", {
                name: "应用工作区",
                exact: true,
            }).click();
            await panel.locator(".apps-workspace .workspace-root").waitFor();
            await search().fill("");

            // 3. Arrange mode: search disabled, footer create not primary
            const rightClickBlankSurface = async () => {
                const res = await page.evaluate(() => {
                    const panelEl = document.querySelector(
                        "aside.workspace-panel, .workspace-panel",
                    ) as HTMLElement;
                    const bodyEl = panelEl.querySelector(
                        ".workspace-body",
                    ) as HTMLElement;
                    if (bodyEl) {
                        bodyEl.scrollTop = bodyEl.scrollHeight;
                    }
                    const surface = panelEl.querySelector(
                        ".launcher-surface-wrap",
                    ) as HTMLElement;
                    const surfaceRect = surface.getBoundingClientRect();
                    const tiles = Array.from(
                        panelEl.querySelectorAll<HTMLElement>(".launcher-tile"),
                    );
                    const tileRects = tiles.map((t) =>
                        t.getBoundingClientRect()
                    );
                    let foundPoint:
                        | { x: number; y: number; el: string }
                        | null = null;
                    for (
                        let py = surfaceRect.top + 10;
                        py < surfaceRect.bottom - 5;
                        py += 15
                    ) {
                        for (
                            let px = surfaceRect.left + 10;
                            px < surfaceRect.right - 10;
                            px += 20
                        ) {
                            const inTile = tileRects.some((tr) =>
                                px >= tr.left && px <= tr.right &&
                                py >= tr.top && py <= tr.bottom
                            );
                            if (!inTile) {
                                const el = document.elementFromPoint(px, py);
                                if (
                                    el &&
                                    (el === surface || surface.contains(el)) &&
                                    !el.closest(".launcher-tile")
                                ) {
                                    foundPoint = {
                                        x: px,
                                        y: py,
                                        el: `${el.tagName}.${el.className}`,
                                    };
                                    break;
                                }
                            }
                        }
                        if (foundPoint) break;
                    }
                    return { foundPoint, surfaceRect };
                });
                if (!res.foundPoint) {
                    throw new Error("Blank point not found on surface");
                }
                await page.mouse.click(res.foundPoint.x, res.foundPoint.y, {
                    button: "right",
                });
            };

            await rightClickBlankSurface();
            const contextMenu = page.locator(
                '[data-slot="context-menu-content"]',
            );
            await contextMenu.waitFor();
            const arrangeItem = contextMenu.locator(
                '[data-slot="context-menu-item"]',
                {
                    hasText: "整理布局",
                },
            );
            await arrangeItem.click();
            assertEquals(await search().isDisabled(), true);
            assertEquals(
                await panel.locator(".workspace-footer .button--primary")
                    .count(),
                0,
            );

            await rightClickBlankSurface();
            await contextMenu.waitFor();
            const doneArrangeItem = contextMenu.locator(
                '[data-slot="context-menu-item"]',
                {
                    hasText: "完成整理",
                },
            );
            await doneArrangeItem.click();
            assertEquals(await search().isDisabled(), false);
            assertEquals(
                await panel.locator(".workspace-footer .button--primary")
                    .count(),
                1,
            );

            // 4. Nested views: no Root create action, .app-dialog-body inset matches workspace-body
            await panel.locator(".workspace-footer .button--primary").click();
            await panel.locator(".app-dialog-form").waitFor();
            assertEquals(
                await panel.locator(".workspace-footer .button--primary")
                    .count(),
                0,
            );
            const appDialogBodyDiff = await panel.evaluate((panelEl) => {
                const body = panelEl.querySelector(
                    ".workspace-body",
                ) as HTMLElement;
                const dialogBody = panelEl.querySelector(
                    ".app-dialog-body",
                ) as HTMLElement;
                const bodyRect = body.getBoundingClientRect();
                const dialogRect = dialogBody.getBoundingClientRect();
                const bodyStyle = getComputedStyle(body);
                const padLeft = parseFloat(bodyStyle.paddingLeft);
                const padRight = parseFloat(bodyStyle.paddingRight);
                return {
                    leftDiff: Math.round(
                        (dialogRect.left - bodyRect.left) - padLeft,
                    ),
                    rightDiff: Math.round(
                        (bodyRect.right - dialogRect.right) - padRight,
                    ),
                };
            });
            assertNear(appDialogBodyDiff.leftDiff, 0, 2);
            assertNear(appDialogBodyDiff.rightDiff, 0, 2);

            await panel.getByRole("button", { name: "返回上一级", exact: true })
                .click();
            await search().waitFor();
            assertEquals(
                await panel.locator(".workspace-footer .button--primary")
                    .count(),
                1,
            );

            // 5. Long names / titles do not distort chrome
            const longApp = await request<{ id: string }>(
                "/api/webapps",
                "POST",
                {
                    name: "A".repeat(80),
                    url: "https://example.com/" + "u".repeat(120),
                },
            );
            const longNote = await request<{ id: string }>(
                "/api/notes",
                "POST",
                {
                    title: "T".repeat(200),
                    body: "B".repeat(500),
                },
            );
            await page.goto(origin + "/");
            await openApps();
            await search().waitFor();
            await panel.getByRole("button", {
                name: "打开 " + "A".repeat(80),
                exact: true,
            })
                .waitFor({ state: "attached" });
            await assertChromeInViewport(page);
            await panel.getByRole("button", { name: "便签工作区", exact: true })
                .click();
            await panel.locator(".notes-workspace").waitFor();
            await panel.locator(".note-card").filter({
                hasText: "T".repeat(200),
            })
                .waitFor({ state: "attached" });
            await assertChromeInViewport(page);

            await request(`/api/webapps/${longApp.id}`, "DELETE");
            await request(`/api/notes/${longNote.id}`, "DELETE");
            await close();
        },
    );
});

interface ElementBox {
    x: number;
    y: number;
    right: number;
    width: number;
    height: number;
}

async function measureBox(locator: {
    evaluate: <R>(pageFunction: (element: HTMLElement) => R) => Promise<R>;
}): Promise<ElementBox> {
    return await locator.evaluate((el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return {
            x: Math.round(r.x),
            y: Math.round(r.y),
            right: Math.round(r.right),
            width: Math.round(r.width),
            height: Math.round(r.height),
        };
    });
}

function assertNear(actual: number, expected: number, tolerance: number) {
    assert(
        Math.abs(actual - expected) <= tolerance,
        `Expected ${actual} to be within ${tolerance} of ${expected}`,
    );
}

function assertBoxesNear(a: ElementBox, b: ElementBox, tolerance = 1) {
    assertNear(a.x, b.x, tolerance);
    assertNear(a.y, b.y, tolerance);
    assertNear(a.width, b.width, tolerance);
    assertNear(a.height, b.height, tolerance);
}

interface ButtonProperties {
    width: number;
    height: number;
    borderRadius: string;
    backgroundColor: string;
    color: string;
    isPrimary: boolean;
}

async function measureButtonProperties(locator: {
    evaluate: <R>(pageFunction: (element: HTMLElement) => R) => Promise<R>;
}): Promise<ButtonProperties> {
    return await locator.evaluate((el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
            width: Math.round(r.width),
            height: Math.round(r.height),
            borderRadius: style.borderRadius,
            backgroundColor: style.backgroundColor,
            color: style.color,
            isPrimary: el.classList.contains("button--primary"),
        };
    });
}

interface InsetMetrics {
    searchLeftDiff: number;
    searchRightDiff: number;
    contentLeftDiff: number;
    contentRightDiff: number;
}

async function measureBodyInset(panelLocator: {
    evaluate: <R>(pageFunction: (element: HTMLElement) => R) => Promise<R>;
}): Promise<InsetMetrics> {
    return await panelLocator.evaluate((panelEl: HTMLElement) => {
        const body = panelEl.querySelector(".workspace-body") as HTMLElement;
        const contentRoot = body.firstElementChild as HTMLElement;
        const searchWrap = contentRoot.querySelector(
            ".workspace-search-wrap",
        ) as HTMLElement;
        const bodyRect = body.getBoundingClientRect();
        const contentRect = contentRoot.getBoundingClientRect();
        const searchRect = searchWrap.getBoundingClientRect();
        const bodyStyle = getComputedStyle(body);
        const padLeft = parseFloat(bodyStyle.paddingLeft);
        const padRight = parseFloat(bodyStyle.paddingRight);
        return {
            searchLeftDiff: Math.round(
                (searchRect.left - bodyRect.left) - padLeft,
            ),
            searchRightDiff: Math.round(
                (bodyRect.right - searchRect.right) - padRight,
            ),
            contentLeftDiff: Math.round(
                (contentRoot ? (contentRect.left - bodyRect.left) : 0) -
                    padLeft,
            ),
            contentRightDiff: Math.round(
                (contentRoot ? (bodyRect.right - contentRect.right) : 0) -
                    padRight,
            ),
        };
    });
}

async function chromeBounds(page: Page) {
    return await page.locator(".workspace-panel").evaluate((el) => {
        const box = (selector: string) => {
            const rect = el.querySelector(selector)!.getBoundingClientRect();
            return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
            };
        };
        return {
            header: box(".workspace-header"),
            footer: box(".workspace-footer"),
        };
    });
}

async function assertChromeInViewport(page: Page) {
    const bounds = await chromeBounds(page);
    const viewport = page.viewportSize()!;
    for (const rect of [bounds.header, bounds.footer]) {
        assert(
            rect.y >= 0 && rect.y + rect.height <= viewport.height + 1,
            JSON.stringify(rect),
        );
        assert(
            rect.x >= 0 && rect.x + rect.width <= viewport.width + 1,
            JSON.stringify(rect),
        );
    }
    assertEquals(
        await page.evaluate(() =>
            document.documentElement.scrollWidth <= innerWidth
        ),
        true,
    );
    assertEquals(
        await page.locator(".workspace-body").evaluate((el) =>
            el.scrollWidth <= el.clientWidth + 1
        ),
        true,
    );
}
