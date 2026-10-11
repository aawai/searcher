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
    const panel = page.locator(
        '.desktop-window[data-window-active="true"], .workspace-panel',
    );
    const appsTrigger =
        '.desktop-dock button[aria-label="应用工作区"], .workspace-mobile-navigation button[aria-label="应用工作区"]';
    const search = () => panel.locator("input[data-workspace-search]");
    async function resetPersistedLayout(target: Page = page) {
        await target.evaluate(async () => {
            const auth = (await (await fetch("/api/auth/me")).json()).data;
            if (!auth?.user) return;
            const { promise, resolve, reject } = Promise.withResolvers<void>();
            const request = indexedDB.open("searcher-client", 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains("state")) {
                    db.close();
                    resolve();
                    return;
                }
                const tx = db.transaction("state", "readwrite");
                tx.objectStore("state").delete(
                    `searcher:desktop-layout:v1:${auth.user.id}`,
                );
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => {
                    db.close();
                    reject(tx.error);
                };
            };
            await promise;
        });
    }
    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor();
        if (path === "/" && (target.viewportSize()?.width ?? 0) >= 1024) {
            const windowIds = await target.evaluate(async () => {
                const auth = (await (await fetch("/api/auth/me")).json()).data;
                if (!auth?.user) return [];
                const preferences =
                    (await (await fetch("/api/preferences")).json()).data;
                if (preferences.style !== "widgets") return [];
                const { promise, resolve, reject } = Promise.withResolvers<
                    string[]
                >();
                const request = indexedDB.open("searcher-client", 1);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains("state")) {
                        db.close();
                        resolve([]);
                        return;
                    }
                    const read = db.transaction("state", "readonly")
                        .objectStore("state").get(
                            `searcher:desktop-layout:v1:${auth.user.id}`,
                        );
                    read.onerror = () => {
                        db.close();
                        reject(read.error);
                    };
                    read.onsuccess = () => {
                        const layout = read.result as {
                            windows: Array<{ id: string }>;
                        } | undefined;
                        db.close();
                        resolve(
                            layout?.windows.map((window) => window.id) ??
                                [],
                        );
                    };
                };
                return await promise;
            });
            for (const id of windowIds) {
                await target.locator(`.desktop-window[data-window-id="${id}"]`)
                    .waitFor({ state: "attached" });
            }
        }
    }
    async function closeAllWorkspaces(target: Page = page) {
        const noteCloseBtns = target.locator(
            '.desktop-window[data-window-kind="note"] button[aria-label="关闭便签"]',
        );
        const count = await noteCloseBtns.count();
        for (let i = 0; i < count; i++) {
            const btn = noteCloseBtns.first();
            if (await btn.isVisible()) {
                await btn.click();
            }
        }
        const openWins = target.locator(".desktop-window");
        const winCount = await openWins.count();
        if (winCount > 0) {
            const openIds = await openWins.evaluateAll((windows) =>
                windows.sort((a, b) =>
                    Number((b as HTMLElement).style.zIndex || 0) -
                    Number((a as HTMLElement).style.zIndex || 0)
                ).map((w) => (w as HTMLElement).dataset.windowId).filter(
                    Boolean,
                ) as string[]
            );
            for (const id of openIds) {
                const win = target.locator(
                    `.desktop-window[data-window-id="${id}"]`,
                );
                if (await win.isVisible()) {
                    const btn = win.locator(
                        '.desktop-window-chrome-btn--close, button[aria-label="收起工作区"]',
                    ).first();
                    if (await btn.isVisible()) {
                        await btn.click();
                        await win.waitFor({ state: "detached" });
                    }
                }
            }
        }
        const panelOrSheet = target.locator(
            '.workspace-panel, [data-slot="sheet-portal"] .workspace-panel',
        );
        if (await panelOrSheet.first().isVisible()) {
            const closeBtn = panelOrSheet.locator(
                '.desktop-window-chrome-btn--close, button[aria-label="收起工作区"]',
            ).first();
            if (await closeBtn.isVisible()) {
                await closeBtn.click();
                await panelOrSheet.first().waitFor({ state: "detached" });
            }
        }
        await resetPersistedLayout(target);
    }
    const close = async () => {
        const btn = panel.locator(
            '.desktop-window-chrome-btn--close, button[aria-label="收起工作区"]',
        ).first();
        if (await btn.isVisible()) {
            await btn.click();
            await panel.waitFor({ state: "detached" });
        }
    };
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
                await visit("/");
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
                await panel.locator(".empty-state, .launcher-empty").first()
                    .waitFor();
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
            await closeAllWorkspaces();
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
                    for (
                        const viewport of [
                            { width: 390, height: 844 },
                            { width: 768, height: 1024 },
                            { width: 1024, height: 768 },
                            { width: 1440, height: 900 },
                        ] as const
                    ) {
                        await page.setViewportSize({
                            width: viewport.width,
                            height: viewport.height,
                        });
                        await visit("/");
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
                        assertEquals(
                            await panel.getAttribute("data-presentation"),
                            viewport.width < 768
                                ? "sheet"
                                : style === "zen"
                                ? "panel"
                                : "window",
                        );
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
                            await page.locator(
                                '.desktop-dock button[aria-label="应用工作区"], .workspace-switcher button[aria-label="应用工作区"]',
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
                        await panel.locator(".workspace-body").evaluate(
                            (el) => {
                                el.scrollTop = el.scrollHeight;
                            },
                        );
                        assertEquals(await chromeBounds(page), before);
                        if (viewport.width >= 768) {
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
                                            '.desktop-window[data-window-active="true"], .workspace-panel',
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
                        await page.locator(
                            '.desktop-dock button[aria-label="便签工作区"], .workspace-switcher button[aria-label="便签工作区"]',
                        ).focus();
                        await page.keyboard.press("Enter");
                        await panel.locator(".notes-workspace").waitFor();
                        await page.waitForFunction(() =>
                            document.activeElement?.getAttribute(
                                "aria-label",
                            ) === "收起工作区"
                        );
                        assertEquals(
                            await page.locator(
                                '.desktop-dock button[aria-label="便签工作区"], .workspace-switcher button[aria-label="便签工作区"]',
                            ).getAttribute("aria-pressed"),
                            "true",
                        );
                        await assertChromeInViewport(page);
                        if (viewport.width >= 768) {
                            assertEquals(
                                await page.locator(".hero").boundingBox(),
                                hero,
                            );
                        }
                        const closingId = await panel.getAttribute(
                            "data-window-id",
                        );
                        await panel.getByRole("button", {
                            name: "收起工作区",
                            exact: true,
                        }).focus();
                        await page.keyboard.press("Enter");
                        if (closingId) {
                            await page.locator(
                                '[data-window-id="' + closingId + '"]',
                            ).waitFor({ state: "detached" });
                        } else await panel.waitFor({ state: "detached" });
                        await page.waitForFunction(
                            (expected) =>
                                document.activeElement?.getAttribute(
                                    "data-workspace",
                                ) === expected,
                            style === "widgets" && viewport.width >= 768
                                ? "notes"
                                : "apps",
                        );
                        if (style === "zen") {
                            assertEquals(
                                await page.evaluate(() =>
                                    document.activeElement?.closest(
                                            ".zen-edge-trigger",
                                        ) !== null &&
                                    document.activeElement?.getAttribute(
                                            "data-workspace",
                                        ) === "apps"
                                ),
                                true,
                            );
                        } else {
                            assertEquals(
                                await page.evaluate(
                                    (sel) =>
                                        document.activeElement?.matches(sel) ===
                                            true,
                                    viewport.width >= 768
                                        ? '.desktop-dock button[data-workspace="notes"]'
                                        : appsTrigger,
                                ),
                                true,
                            );
                        }
                        assertEquals(
                            await page.locator(".hero").boundingBox(),
                            hero,
                        );
                        await closeAllWorkspaces();
                    }
                }
            }
            await closeAllWorkspaces();
        },
    );

    await t.step(
        "keyboard-only Dock/Switcher/expand/Back/Close; overlay Escape takes priority",
        async () => {
            await request("/api/preferences", "PATCH", { style: "widgets" });
            await page.setViewportSize({ width: 1440, height: 900 });
            await visit("/");
            await page.locator(appsTrigger).focus();
            await page.keyboard.press("Enter");
            await search().waitFor();
            await search().fill("State");
            await page.locator(
                '.desktop-dock button[aria-label="便签工作区"], .workspace-switcher button[aria-label="便签工作区"]',
            )
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
            assertEquals(
                await page.locator(
                    'input[aria-label="便签标题"], [id^="note-title-input"]',
                ).count(),
                0,
            );
            await panel.getByRole("button", { name: "折叠", exact: true })
                .focus();
            await page.keyboard.press("Enter");
            await panel.locator(".note-preview").waitFor({ state: "detached" });
            await page.locator(
                '.desktop-dock button[aria-label="应用工作区"], .workspace-switcher button[aria-label="应用工作区"]',
            )
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
            await page.waitForFunction(() =>
                document.activeElement?.getAttribute("aria-label") ===
                    "打开 Edited Alpha"
            );
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
                document.activeElement?.matches(".workspace-primary") === true
            );
            await page.locator(
                '.desktop-dock button[aria-label="便签工作区"], .workspace-switcher button[aria-label="便签工作区"]',
            )
                .focus();
            await page.keyboard.press("Enter");
            assertEquals(await search().inputValue(), "Shell");
            // Issue #91 contract: Desktop ordinary Escape does NOT close windows
            await page.keyboard.press("Escape");
            assertEquals(
                await page.locator('.desktop-window[data-window-id="notes"]')
                    .isVisible(),
                true,
            );
            // Tablet viewport preserves legacy Escape close behavior
            await page.setViewportSize({ width: 800, height: 900 });
            await page.waitForFunction(() => globalThis.innerWidth === 800);
            await page.keyboard.press("Escape");
            await page.locator('.desktop-window[data-window-id="notes"]')
                .waitFor({ state: "detached" });
            await page.waitForFunction(() =>
                document.activeElement?.getAttribute("data-workspace") ===
                    "notes"
            );
            assertEquals(
                await page.evaluate(
                    (sel) => document.activeElement?.matches(sel) === true,
                    '.desktop-dock button[data-workspace="notes"]',
                ),
                true,
            );
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.waitForFunction(() => globalThis.innerWidth === 1440);
            await closeAllWorkspaces();
        },
    );

    await t.step(
        "Zen panel and sheet: nested Back, overlay Escape precedence, and actual opener restoration",
        async () => {
            await request("/api/preferences", "PATCH", { style: "zen" });

            for (
                const { width, height, presentation: expectedPresentation } of [
                    { width: 1440, height: 900, presentation: "panel" },
                    { width: 390, height: 844, presentation: "sheet" },
                ] as const
            ) {
                await page.setViewportSize({ width, height });
                await visit("/");

                // Opener: Apps edge trigger
                const appsEdge = page.locator(
                    '.zen-edge-trigger button[data-workspace="apps"]',
                );
                await appsEdge.waitFor();
                await appsEdge.focus();
                await page.keyboard.press("Enter");
                await panel.waitFor();
                assertEquals(
                    await panel.getAttribute("data-presentation"),
                    expectedPresentation,
                );

                // Root Close button has initial focus
                await page.waitForFunction(() =>
                    document.activeElement?.getAttribute("aria-label") ===
                        "收起工作区"
                );

                // Nested Back behavior in Zen panel/sheet
                const createBtn = panel.locator(
                    ".workspace-footer .workspace-primary",
                );
                await createBtn.focus();
                await page.keyboard.press("Enter");
                await page.locator("#app-url-input").waitFor();
                // Nested view initial focus is on Back button
                await page.waitForFunction(() =>
                    document.activeElement?.getAttribute("aria-label") ===
                        "返回上一级"
                );
                // Trigger Back
                await page.keyboard.press("Enter");
                await search().waitFor();
                // Form Back restores the entry action, not unrelated chrome.
                await page.waitForFunction(() =>
                    document.activeElement?.matches(".workspace-primary") ===
                        true
                );

                // Overlay Escape precedence in Zen panel/sheet
                const appTile = panel.getByRole("button", {
                    name: "打开 Edited Alpha",
                    exact: true,
                });
                await appTile.focus();
                await page.keyboard.press("Shift+F10");
                await page.getByRole("menu").waitFor();
                await page.waitForFunction(() =>
                    document.querySelector(
                        '[role="menu"]',
                    )?.contains(document.activeElement)
                );
                // First Escape closes menu overlay, Zen surface remains visible
                await page.keyboard.press("Escape");
                await page.getByRole("menu").waitFor({ state: "detached" });
                assertEquals(await panel.isVisible(), true);

                // Switch Apps -> Notes
                await page.locator(
                    '.desktop-dock button[aria-label="便签工作区"], .workspace-switcher button[aria-label="便签工作区"]',
                ).focus();
                await page.keyboard.press("Enter");
                await panel.locator(".notes-workspace").waitFor();

                // Second Escape closes the Zen panel/sheet
                await page.keyboard.press("Escape");
                await panel.waitFor({ state: "detached" });

                // Proves actual opener restoration: restores Apps edge trigger, not Notes
                await page.waitForFunction(() =>
                    document.activeElement?.getAttribute("data-workspace") ===
                        "apps"
                );
                assertEquals(
                    await page.evaluate(() =>
                        document.activeElement?.closest(
                                ".zen-edge-trigger",
                            ) !== null &&
                        document.activeElement?.getAttribute(
                                "data-workspace",
                            ) === "apps"
                    ),
                    true,
                );
                await closeAllWorkspaces();
            }
            await closeAllWorkspaces();
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
                    await visit("/");
                    await page.locator(".hero").waitFor();
                    const hero = await page.locator(".hero").boundingBox();
                    await openApps();
                    await search().waitFor();
                    await assertChromeInViewport(page);
                    const appInset = await measureBodyInset(panel);
                    assertNear(appInset.searchLeftDiff, 0, 2);
                    assertNear(appInset.searchRightDiff, 0, 2);
                    const switcher = width >= 768
                        ? page.locator(
                            '.desktop-dock button[data-workspace="notes"]',
                        )
                        : panel.getByRole("button", {
                            name: "便签工作区",
                            exact: true,
                        });
                    await switcher.click();
                    await panel.locator(".notes-workspace").waitFor();
                    await assertChromeInViewport(page);
                    const noteInset = await measureBodyInset(panel);
                    assertNear(noteInset.searchLeftDiff, 0, 2);
                    assertNear(noteInset.searchRightDiff, 0, 2);
                    if (width >= 768) {
                        assertEquals(
                            await page.locator(".hero").boundingBox(),
                            hero,
                        );
                        assertEquals(
                            await page.locator("aside.workspace-panel").count(),
                            0,
                        );
                        assert(await page.locator(".desktop-dock").isVisible());
                    } else {
                        assertEquals(
                            await page.locator(".desktop-dock").count(),
                            0,
                        );
                        const closeBtn = panel.getByRole("button", {
                            name: "收起工作区",
                            exact: true,
                        });
                        if (await closeBtn.isVisible()) {
                            await closeBtn.click();
                            await panel.waitFor({ state: "detached" });
                        }
                        const mobileApps = page.locator(
                            '.workspace-mobile-navigation button[aria-label="应用工作区"]',
                        );
                        if (await mobileApps.isVisible()) {
                            await mobileApps.click();
                            await panel.waitFor();
                            const appsCloseBtn = panel.getByRole("button", {
                                name: "收起工作区",
                                exact: true,
                            });
                            if (await appsCloseBtn.isVisible()) {
                                await appsCloseBtn.click();
                                await panel.waitFor({ state: "detached" });
                            }
                        }
                    }
                    if (width >= 1024) {
                        assertEquals(
                            await page.locator(".desktop-window").count(),
                            2,
                        );
                    }
                    await closeAllWorkspaces();
                }
            }

            // Desktop viewport for interaction, focus/blur, arrange hierarchy, and chrome stability
            await page.setViewportSize({ width: 1440, height: 900 });
            await visit("/");
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
            await page.locator(
                '.desktop-dock button[aria-label="便签工作区"], .workspace-switcher button[aria-label="便签工作区"]',
            ).click();
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

            await page.locator(
                '.desktop-dock button[aria-label="应用工作区"], .workspace-switcher button[aria-label="应用工作区"]',
            ).click();
            await panel.locator(".apps-workspace .workspace-root").waitFor();
            await search().waitFor();
            assertEquals(await search().inputValue(), "AppsQueryPersisted");

            await page.locator(
                '.desktop-dock button[aria-label="便签工作区"], .workspace-switcher button[aria-label="便签工作区"]',
            ).click();
            await panel.locator(".notes-workspace").waitFor();
            await search().waitFor();
            assertEquals(await search().inputValue(), "NotesQueryPersisted");

            await search().fill("");
            await page.locator(
                '.desktop-dock button[aria-label="应用工作区"], .workspace-switcher button[aria-label="应用工作区"]',
            ).click();
            await panel.locator(".apps-workspace .workspace-root").waitFor();
            await search().fill("");

            // 3. Arrange mode: search disabled, footer create not primary
            const rightClickBlankSurface = async () => {
                const res = await page.evaluate(() => {
                    const panelEl = document.querySelector(
                        '.desktop-window[data-window-active="true"], .workspace-panel',
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
                    return {
                        foundPoint,
                        surfaceOrigin: {
                            x: surfaceRect.left,
                            y: surfaceRect.top,
                        },
                    };
                });
                if (!res.foundPoint) {
                    throw new Error("Blank point not found on surface");
                }
                await page.locator(".launcher-surface-wrap").click({
                    button: "right",
                    position: {
                        x: res.foundPoint.x - res.surfaceOrigin.x,
                        y: res.foundPoint.y - res.surfaceOrigin.y,
                    },
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
                1,
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
            await closeAllWorkspaces();
            await visit("/");
            await openApps();
            await search().waitFor();
            await panel.getByRole("button", {
                name: "打开 " + "A".repeat(80),
                exact: true,
            })
                .waitFor({ state: "attached" });
            await assertChromeInViewport(page);
            await page.locator(
                '.desktop-dock button[aria-label="便签工作区"], .workspace-switcher button[aria-label="便签工作区"]',
            )
                .click();
            await panel.locator(".notes-workspace").waitFor();
            await panel.locator(".note-card").filter({
                hasText: "T".repeat(200),
            })
                .waitFor({ state: "attached" });
            await assertChromeInViewport(page);

            await request(`/api/webapps/${longApp.id}`, "DELETE");
            await request(`/api/notes/${longNote.id}`, "DELETE");
            await closeAllWorkspaces();
        },
    );
    await t.step(
        "presentation changes preserve Core queries and nested Back; logout clears transient state",
        async () => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await visit("/");
            await openApps();
            await search().fill("State Alpha");
            await page.locator(
                '.desktop-dock button[aria-label="便签工作区"], .workspace-switcher button[aria-label="便签工作区"]',
            )
                .click();
            await search().fill("private notes query");
            for (const width of [390, 768, 1024, 1440]) {
                await page.setViewportSize({ width, height: 900 });
                await page.waitForFunction(
                    (expected) =>
                        document.querySelector(
                            '.desktop-window[data-window-active="true"], .workspace-panel',
                        )
                            ?.getAttribute("data-presentation") === expected,
                    width < 768 ? "sheet" : "window",
                );
                assertEquals(
                    await search().inputValue(),
                    "private notes query",
                );
                await assertChromeInViewport(page);
            }
            await page.locator(
                '.desktop-dock button[aria-label="应用工作区"], .workspace-switcher button[aria-label="应用工作区"]',
            )
                .click();
            assertEquals(await search().inputValue(), "State Alpha");
            await panel.getByRole("button", { name: "添加应用", exact: true })
                .click();
            await page.setViewportSize({ width: 390, height: 900 });
            await panel.getByRole("button", { name: "返回上一级", exact: true })
                .click();
            assertEquals(await search().inputValue(), "State Alpha");
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.getByRole("button", {
                name: "用户菜单：Shell contract",
                exact: true,
            }).click();
            await page.getByRole("menuitem", { name: "退出登录", exact: true })
                .click();
            await panel.waitFor({ state: "detached" });
            assertEquals(await page.locator("[data-workspace]").count(), 0);
            await page.goto(origin + "/login");
            await page.locator("#auth-username").fill("shell44");
            await page.locator("#auth-password").fill(
                "shell-contract-password",
            );
            await page.locator('form button[type="submit"]').click();
            await page.waitForURL(origin + "/");
            assertEquals(await panel.count(), 0);
            await openApps();
            assertEquals(await search().inputValue(), "");
            await page.locator(
                '.desktop-dock button[aria-label="便签工作区"], .workspace-switcher button[aria-label="便签工作区"]',
            )
                .click();
            assertEquals(await search().inputValue(), "");
            await closeAllWorkspaces();
        },
    );
    await t.step(
        "Issue #91: Snap edge drag preview pointer non-blocking, 7 release modes, restoreFrame threshold, resize, and reload persistence",
        async () => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await resetPersistedLayout();
            await visit("/");
            await openApps();
            const appsWin = page.locator(
                '.desktop-window[data-window-id="apps"]',
            );
            await appsWin.waitFor({ state: "visible" });
            const originalFrame = await measureBox(appsWin);
            let expectedRestoreFrame = originalFrame;
            const canvas = page.locator(".desktop-canvas");
            await canvas.waitFor({ state: "visible" });
            const canvasBox = await measureBox(canvas);
            const measuredBounds = await page.evaluate(() => {
                let chromeBottom = 0;
                for (
                    const element of document.querySelectorAll(
                        ".topbar, .connection-banner",
                    )
                ) {
                    const style = getComputedStyle(element);
                    const bounds = element.getBoundingClientRect();
                    if (
                        style.display !== "none" && bounds.width > 0 &&
                        bounds.height > 0 && bounds.bottom > 0
                    ) {
                        chromeBottom = Math.max(
                            chromeBottom,
                            bounds.bottom,
                        );
                    }
                }
                const dock = document.querySelector<HTMLElement>(
                    ".desktop-dock",
                );
                const dockStyle = dock ? getComputedStyle(dock) : null;
                const dockBounds = dock?.getBoundingClientRect();
                const dockTop = dock && dockBounds &&
                        dockStyle?.display !== "none" &&
                        dockBounds.width > 0 && dockBounds.height > 0
                    ? dockBounds.top
                    : globalThis.innerHeight;
                return { chromeBottom, dockTop };
            });
            const workBox = {
                x: canvasBox.x,
                y: measuredBounds.chromeBottom,
                width: canvasBox.width,
                height: Math.max(
                    0,
                    measuredBounds.dockTop - measuredBounds.chromeBottom,
                ),
            };

            async function dragTitleTo(
                toX: number,
                toY: number,
                release = true,
            ) {
                const titleEl = appsWin.locator(".desktop-window-chrome-title");
                await titleEl.waitFor({ state: "visible" });
                const titleBox = await measureBox(titleEl);
                const startX = titleBox.x + titleBox.width / 2;
                const startY = titleBox.y + titleBox.height / 2;
                await page.mouse.move(startX, startY);
                await page.mouse.down();
                await page.mouse.move(toX, toY, { steps: 10 });
                if (release) {
                    await page.mouse.up();
                }
            }

            async function waitForSnap(
                mode: string,
                snap: string,
                expectedWidth = halfW,
            ) {
                await page.waitForFunction(
                    ([expectedMode, expectedSnap, expectedW]) => {
                        const win = document.querySelector(
                            '.desktop-window[data-window-id="apps"]',
                        ) as HTMLElement | null;
                        if (!win) return false;
                        const modeMatches =
                            win.getAttribute("data-window-mode") ===
                                expectedMode;
                        const snapMatches =
                            win.getAttribute("data-window-snap") ===
                                expectedSnap;
                        if (!modeMatches || !snapMatches) return false;
                        if (expectedW !== undefined) {
                            const currentW = win.getBoundingClientRect().width;
                            if (
                                Math.abs(currentW - (expectedW as number)) > 4
                            ) {
                                return false;
                            }
                        }
                        return true;
                    },
                    [mode, snap, expectedWidth],
                );
            }
            async function waitForWindowFrame(
                expected: Pick<ElementBox, "x" | "y" | "width" | "height">,
            ) {
                await page.waitForFunction((frame) => {
                    const el = document.querySelector<HTMLElement>(
                        '.desktop-window[data-window-id="apps"]',
                    );
                    if (!el) return false;
                    const box = el.getBoundingClientRect();
                    return Math.abs(box.x - frame.x) <= 1 &&
                        Math.abs(box.y - frame.y) <= 1 &&
                        Math.abs(box.width - frame.width) <= 1 &&
                        Math.abs(box.height - frame.height) <= 1;
                }, expected);
            }

            const halfW = Math.floor(workBox.width / 2);
            const halfH = Math.floor(workBox.height / 2);
            // Pointer cancellation commits the last viewport-global drag frame.
            const cancelTitle = appsWin.locator(
                ".desktop-window-chrome-title",
            );
            const cancelTitleBox = await measureBox(cancelTitle);
            const cancelStartX = cancelTitleBox.x + cancelTitleBox.width / 2;
            const cancelStartY = cancelTitleBox.y + cancelTitleBox.height / 2;
            await page.mouse.move(cancelStartX, cancelStartY);
            await page.mouse.down();
            await page.mouse.move(cancelStartX + 30, cancelStartY + 20, {
                steps: 5,
            });
            await appsWin.locator(".desktop-window-chrome").evaluate((chrome) =>
                chrome.dispatchEvent(
                    new PointerEvent("pointercancel", {
                        bubbles: true,
                        pointerId: 1,
                        pointerType: "mouse",
                    }),
                )
            );
            await page.mouse.up();
            expectedRestoreFrame = {
                ...originalFrame,
                x: originalFrame.x + 30,
                y: originalFrame.y + 20,
            };
            await waitForWindowFrame(expectedRestoreFrame);

            // Shift+Arrow movement uses the same normal viewport bounds.
            const keyboardChrome = appsWin.locator(".desktop-window-chrome");
            await keyboardChrome.focus();
            await page.keyboard.press("Shift+ArrowRight");
            await waitForWindowFrame({
                ...expectedRestoreFrame,
                x: expectedRestoreFrame.x + 40,
            });
            await page.keyboard.press("Shift+ArrowLeft");
            await waitForWindowFrame(expectedRestoreFrame);
            await page.keyboard.press("Shift+ArrowDown");
            await waitForWindowFrame({
                ...expectedRestoreFrame,
                y: expectedRestoreFrame.y + 40,
            });
            await page.keyboard.press("Shift+ArrowUp");
            await waitForWindowFrame(expectedRestoreFrame);
            async function waitForTinyPresentation() {
                await page.waitForFunction(() => {
                    const win = document.querySelector<HTMLElement>(
                        '.desktop-window[data-window-id="apps"]',
                    );
                    const close = win?.querySelector<HTMLElement>(
                        ".desktop-window-chrome-btn--close",
                    );
                    if (
                        !win || !close || win.dataset.windowMode !== "normal"
                    ) return false;

                    const bounds = win.getBoundingClientRect();
                    const closeBounds = close.getBoundingClientRect();
                    let chromeBottom = 0;
                    for (
                        const element of document.querySelectorAll(
                            ".topbar, .connection-banner",
                        )
                    ) {
                        const style = getComputedStyle(element);
                        const header = element.getBoundingClientRect();
                        if (
                            style.display !== "none" && header.width > 0 &&
                            header.height > 0 && header.bottom > 0
                        ) {
                            chromeBottom = Math.max(
                                chromeBottom,
                                header.bottom,
                            );
                        }
                    }

                    const dock = document.querySelector<HTMLElement>(
                        ".desktop-dock",
                    );
                    const dockBounds = dock?.getBoundingClientRect();
                    const dockTop = dock && dockBounds &&
                            getComputedStyle(dock).display !== "none" &&
                            dockBounds.width > 0 && dockBounds.height > 0
                        ? dockBounds.top
                        : globalThis.innerHeight;
                    return bounds.x >= 0 &&
                        bounds.y >= chromeBottom &&
                        bounds.right <= globalThis.innerWidth &&
                        bounds.bottom <= globalThis.innerHeight &&
                        closeBounds.width > 0 && closeBounds.height > 0 &&
                        closeBounds.x >= 0 &&
                        closeBounds.right <= globalThis.innerWidth &&
                        closeBounds.bottom <= dockTop + 1;
                });
            }

            // Geometry changes cancel an in-flight drag without replacing the
            // semantic frame with its tiny-viewport presentation frame.
            const tinyTitleBox = await measureBox(
                appsWin.locator(".desktop-window-chrome-title"),
            );
            const tinyDragStart = {
                x: tinyTitleBox.x + tinyTitleBox.width / 2,
                y: tinyTitleBox.y + tinyTitleBox.height / 2,
            };
            await page.mouse.move(tinyDragStart.x, tinyDragStart.y);
            await page.mouse.down();
            await page.mouse.move(
                tinyDragStart.x + 30,
                tinyDragStart.y + 20,
                { steps: 4 },
            );
            await page.setViewportSize({ width: 1024, height: 200 });
            await waitForTinyPresentation();
            await appsWin.locator(".desktop-window-chrome").evaluate(
                (chrome) =>
                    chrome.dispatchEvent(
                        new PointerEvent("pointercancel", {
                            bubbles: true,
                            pointerId: 1,
                            pointerType: "mouse",
                        }),
                    ),
            );
            await page.mouse.up();
            await waitForTinyPresentation();
            assertEquals(
                await appsWin.getAttribute("data-window-mode"),
                "normal",
            );
            await page.setViewportSize({ width: 1440, height: 900 });
            await waitForWindowFrame(expectedRestoreFrame);

            // Resize cancellation follows the same presentation-only fallback.
            const tinyResize = appsWin.locator(
                ".desktop-window-resize-handle--se",
            );
            const tinyResizeBox = await measureBox(tinyResize);
            const tinyResizeStart = {
                x: tinyResizeBox.x + tinyResizeBox.width / 2,
                y: tinyResizeBox.y + tinyResizeBox.height / 2,
            };
            await page.mouse.move(tinyResizeStart.x, tinyResizeStart.y);
            await page.mouse.down();
            await page.mouse.move(
                tinyResizeStart.x + 30,
                tinyResizeStart.y + 20,
                { steps: 4 },
            );
            await page.setViewportSize({ width: 1024, height: 200 });
            await waitForTinyPresentation();
            await page.mouse.up();
            await waitForTinyPresentation();
            await page.setViewportSize({ width: 1440, height: 900 });
            await waitForWindowFrame(expectedRestoreFrame);

            await page.keyboard.press("Shift+ArrowRight");
            await waitForWindowFrame({
                ...expectedRestoreFrame,
                x: expectedRestoreFrame.x + 40,
            });
            await page.keyboard.press("Shift+ArrowLeft");
            await waitForWindowFrame(expectedRestoreFrame);
            // 1. Preview pointer-events: none and non-blocking during drag
            await dragTitleTo(
                workBox.x + 16,
                workBox.y + workBox.height / 2,
                false,
            );
            const preview = page.locator("[data-snap-preview]");
            await preview.waitFor({ state: "visible" });
            assertEquals(await preview.getAttribute("data-snap-mode"), "left");
            const pointerEvents = await preview.evaluate((el) =>
                getComputedStyle(el).pointerEvents
            );
            assertEquals(pointerEvents, "none");
            // Complete release into "left" snap mode
            await page.mouse.up();
            await preview.waitFor({ state: "detached" });
            await waitForSnap("snapped", "left", halfW);
            const leftBox = await measureBox(appsWin);
            assertNear(leftBox.x, workBox.x, 4);
            assertNear(leftBox.width, halfW, 4);
            assertNear(leftBox.height, workBox.height, 4);
            // Resize handles hidden while snapped
            assertEquals(
                await appsWin.locator(".desktop-window-resize-handle").count(),
                0,
            );

            // 2. RestoreFrame threshold: click without move (<4px) preserves snap
            const titleEl = appsWin.locator(".desktop-window-chrome-title");
            const titleBoxSnap = await measureBox(titleEl);
            await page.mouse.move(
                titleBoxSnap.x + titleBoxSnap.width / 2,
                titleBoxSnap.y + titleBoxSnap.height / 2,
            );
            await page.mouse.down();
            await page.mouse.up();
            assertEquals(
                await appsWin.getAttribute("data-window-mode"),
                "snapped",
            );
            assertEquals(
                await appsWin.getAttribute("data-window-snap"),
                "left",
            );

            // Restore via titlebar button
            const restoreBtn = appsWin.locator(
                ".desktop-window-chrome-btn--restore",
            );
            await restoreBtn.click();
            await page.waitForFunction((expected) => {
                const el = document.querySelector<HTMLElement>(
                    '.desktop-window[data-window-id="apps"]',
                );
                if (
                    !el || el.dataset.windowMode !== "normal" ||
                    el.hasAttribute("data-window-snap")
                ) return false;
                const box = el.getBoundingClientRect();
                return Math.abs(box.x - expected.x) <= 1 &&
                    Math.abs(box.y - expected.y) <= 1 &&
                    Math.abs(box.width - expected.width) <= 1 &&
                    Math.abs(box.height - expected.height) <= 1;
            }, expectedRestoreFrame);
            assert(
                (await appsWin.locator(".desktop-window-resize-handle")
                    .count()) > 0,
            );

            // 3. 7 release modes matrix
            // right
            const rightTargetX = workBox.x + workBox.width - 16;
            const rightTargetY = workBox.y + workBox.height / 2;
            await dragTitleTo(rightTargetX, rightTargetY, false);
            await page.mouse.up();
            await waitForSnap("snapped", "right", workBox.width - halfW);
            const rightBox = await measureBox(appsWin);
            assertNear(rightBox.x, workBox.x + halfW, 4);
            assertNear(rightBox.width, workBox.width - halfW, 4);
            assertNear(rightBox.height, workBox.height, 4);

            // top-left
            await dragTitleTo(workBox.x + 30, workBox.y + 16);
            await waitForSnap("snapped", "top-left");
            const tlBox = await measureBox(appsWin);
            assertNear(tlBox.x, workBox.x, 4);
            assertNear(tlBox.y, workBox.y, 4);
            assertNear(tlBox.width, halfW, 4);
            assertNear(tlBox.height, halfH, 4);

            // top-right
            await dragTitleTo(
                workBox.x + workBox.width - 30,
                workBox.y + 16,
            );
            await waitForSnap("snapped", "top-right");
            const trBox = await measureBox(appsWin);
            assertNear(trBox.x, workBox.x + halfW, 4);
            assertNear(trBox.y, workBox.y, 4);
            assertNear(trBox.width, workBox.width - halfW, 4);
            assertNear(trBox.height, halfH, 4);

            // bottom-left
            await dragTitleTo(
                workBox.x + 30,
                workBox.y + workBox.height - 16,
            );
            await waitForSnap("snapped", "bottom-left");
            const blBox = await measureBox(appsWin);
            assertNear(blBox.x, workBox.x, 4);
            assertNear(blBox.y, workBox.y + halfH, 4);
            assertNear(blBox.width, halfW, 4);
            assertNear(blBox.height, workBox.height - halfH, 4);

            // bottom-right
            await dragTitleTo(
                workBox.x + workBox.width - 30,
                workBox.y + workBox.height - 16,
            );
            await waitForSnap("snapped", "bottom-right");
            const brBox = await measureBox(appsWin);
            assertNear(brBox.x, workBox.x + halfW, 4);
            assertNear(brBox.y, workBox.y + halfH, 4);
            assertNear(brBox.width, workBox.width - halfW, 4);
            assertNear(brBox.height, workBox.height - halfH, 4);

            // maximize
            await dragTitleTo(
                workBox.x + workBox.width / 2,
                workBox.y + 16,
            );
            await waitForSnap("maximized", "maximize", workBox.width);
            const maxBox = await measureBox(appsWin);
            assertNear(maxBox.x, workBox.x, 4);
            assertNear(maxBox.y, workBox.y, 4);
            assertNear(maxBox.width, workBox.width, 4);
            assertNear(maxBox.height, workBox.height, 4);

            // 4. Drag away un-snaps to normal and restores frame
            await dragTitleTo(
                workBox.x + workBox.width / 2,
                workBox.y + workBox.height / 2,
            );
            await page.waitForFunction(() => {
                const el = document.querySelector(
                    '.desktop-window[data-window-id="apps"]',
                );
                return el?.getAttribute("data-window-mode") === "normal" &&
                    !el?.hasAttribute("data-window-snap");
            });

            // 5. 8-way resize handle active in normal mode
            const seHandle = appsWin.locator(
                ".desktop-window-resize-handle--se",
            );
            await seHandle.waitFor({ state: "visible" });
            const handleBox = await measureBox(seHandle);
            const boxBeforeResize = await measureBox(appsWin);
            await page.mouse.move(
                handleBox.x + handleBox.width / 2,
                handleBox.y + handleBox.height / 2,
            );
            await page.mouse.down();
            await page.mouse.move(
                handleBox.x + handleBox.width / 2 - 50,
                handleBox.y + handleBox.height / 2 - 40,
                { steps: 5 },
            );
            await page.mouse.up();
            await page.waitForFunction(
                (w) => {
                    const el = document.querySelector(
                        '.desktop-window[data-window-id="apps"]',
                    ) as HTMLElement | null;
                    return el &&
                        Math.abs(el.getBoundingClientRect().width - (w - 50)) <=
                            1;
                },
                boxBeforeResize.width,
            );
            await dragTitleTo(720, workBox.y + 150);
            await page.waitForFunction((dockTop) => {
                const element = document.querySelector(
                    '[data-window-id="apps"]',
                );
                return !!element &&
                    element.getBoundingClientRect().bottom < dockTop;
            }, measuredBounds.dockTop);
            for (
                const direction of ["n", "ne", "e", "se", "s", "sw", "w", "nw"]
            ) {
                const handle = appsWin.locator(
                    `[data-direction="${direction}"]`,
                );
                const before = await measureBox(appsWin);
                const handleBounds = await measureBox(handle);
                const dx = direction.includes("w")
                    ? 12
                    : direction.includes("e")
                    ? -12
                    : 0;
                const dy = direction.includes("n")
                    ? 12
                    : direction.includes("s")
                    ? -12
                    : 0;
                const pointer = {
                    x: direction === "s"
                        ? handleBounds.x + handleBounds.width - 12
                        : handleBounds.x +
                            (direction === "n" ? 12 : handleBounds.width / 2),
                    y: handleBounds.y + handleBounds.height / 2,
                };
                const expected = {
                    x: before.x + (direction.includes("w") ? 12 : 0),
                    y: before.y + (direction.includes("n") ? 12 : 0),
                    width: before.width - (dx ? 12 : 0),
                    height: before.height - (dy ? 12 : 0),
                };
                await page.mouse.move(pointer.x, pointer.y);
                await page.mouse.down();
                await page.mouse.move(pointer.x + dx, pointer.y + dy, {
                    steps: 4,
                });
                await page.mouse.up();
                await page.waitForFunction(
                    (expected) => {
                        const element = document.querySelector(
                            '[data-window-id="apps"]',
                        );
                        if (!element) return false;
                        const frame = element.getBoundingClientRect();
                        return Math.abs(frame.x - expected.x) <= 1 &&
                            Math.abs(frame.y - expected.y) <= 1 &&
                            Math.abs(frame.width - expected.width) <= 1 &&
                            Math.abs(frame.height - expected.height) <= 1;
                    },
                    expected,
                    { timeout: 5000 },
                ).catch(async (error: unknown) => {
                    throw new Error(
                        `${direction} resize: before=${
                            JSON.stringify(before)
                        } expected=${JSON.stringify(expected)} actual=${
                            JSON.stringify(await measureBox(appsWin))
                        }`,
                        { cause: error },
                    );
                });
                const after = await measureBox(appsWin);
                assertNear(after.x, expected.x, 1);
                assertNear(after.y, expected.y, 1);
                assertNear(after.width, expected.width, 1);
                assertNear(after.height, expected.height, 1);
            }

            // 6. Reload persistence of snapped state
            await dragTitleTo(
                workBox.x + 16,
                workBox.y + workBox.height / 2,
            );
            await waitForSnap("snapped", "left", halfW);
            await page.reload();
            await appsWin.waitFor({ state: "visible" });
            await waitForSnap("snapped", "left", halfW);

            await closeAllWorkspaces();
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
    return await page.locator(
        '.desktop-window[data-window-active="true"], .workspace-panel',
    ).evaluate((el) => {
        const box = (selector: string) => {
            const target = el.querySelector(selector);
            if (!target) return null;
            const rect = target.getBoundingClientRect();
            return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
            };
        };
        return {
            header: box(".desktop-window-chrome, .workspace-header"),
            footer: box(".workspace-footer"),
        };
    });
}

async function assertChromeInViewport(page: Page) {
    const bounds = await chromeBounds(page);
    const viewport = page.viewportSize()!;
    for (const rect of [bounds.header, bounds.footer]) {
        if (!rect) continue;
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
        await page.locator(
            '.desktop-window[data-window-active="true"] .workspace-body, .workspace-panel .workspace-body',
        ).evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        true,
    );
}
