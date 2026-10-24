import { assert, assertEquals } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";
import {
    deskDetail,
    deskMenuTrigger,
    deskObject,
    deskStage,
    openNotes,
    openNotesByKeyboard,
} from "./helpers/desk.ts";

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
        handleSIGTERM: false,
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
    const panel = deskDetail(page);
    const search = () => panel.locator("input[data-workspace-search]");
    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor();
    }
    const closeButton = (target: Page = page) =>
        deskDetail(target).getByRole("button", {
            name: /^(关闭详情|返回首页)$/,
        });
    async function closeAllWorkspaces(target: Page = page) {
        if (await deskDetail(target).first().isVisible()) {
            await closeButton(target).click();
        }
        await deskDetail(target).first().waitFor({ state: "detached" });
    }
    async function assertDeskLayout() {
        await page.waitForFunction(() => {
            const home = document.querySelector<HTMLElement>(".desk-home");
            const detail = document.querySelector("aside.workspace-panel");
            const objects = [
                ...document.querySelectorAll("[data-desk-object]"),
            ];
            if (
                !home?.inert || home.dataset.deskStage !== "overview" ||
                !detail || objects.length === 0
            ) return false;
            const left = detail.getBoundingClientRect().left;
            return getComputedStyle(home).opacity === "0" &&
                objects.every((object) =>
                    object.getBoundingClientRect().right <= left
                );
        });
        assertEquals(await deskStage(page), "overview");
    }
    const homeSettled = () =>
        page.waitForFunction(() =>
            document.querySelector(".home")?.getAnimations().length === 0
        );
    async function openDocs() {
        await openNotes(page);
        await search().waitFor();
    }

    for (let index = 0; index < 35; index++) {
        await request("/api/documents", "POST", {
            title: (`Long Note ${index} — ${"long name ".repeat(8)}`).slice(
                0,
                80,
            ),
            body: `Long note body ${index}`,
        });
    }
    await request("/api/documents", "POST", {
        title: "Shell note",
        body: "Shell body",
    });
    await request("/api/preferences", "PATCH", { theme: "system" });
    await t.step(
        "viewport/theme/mode matrix keeps chrome bounded, scrolls only Body and restores focus",
        async () => {
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
                            document.documentElement.dataset.theme === expected,
                        theme,
                    );
                    const trigger = deskMenuTrigger(page);
                    await trigger.waitFor();
                    const opener = await trigger.elementHandle();
                    await page.locator(".hero").waitFor();
                    const hero = await page.locator(".hero").boundingBox();
                    await openNotesByKeyboard(page);
                    await search().waitFor();
                    assertEquals(
                        await panel.getAttribute("data-presentation"),
                        viewport.width < 768 ? "sheet" : "panel",
                    );
                    await page.waitForFunction(
                        (expected) =>
                            document.activeElement?.getAttribute(
                                "aria-label",
                            ) ===
                                expected,
                        viewport.width < 768 ? "返回桌面" : "关闭详情",
                    );
                    assert(await search().getAttribute("aria-label"));
                    assertEquals(
                        await panel.getByRole("heading", {
                            name: "笔记",
                            exact: true,
                        }).isVisible(),
                        true,
                    );
                    // The open transition is one-shot (design rule 6); the shell
                    // must never loop an animation.
                    assert(
                        await panel.evaluate((el) =>
                            getComputedStyle(el).animationIterationCount !==
                                "infinite"
                        ),
                        "workspace panel must not loop an animation",
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
                        await assertDeskLayout();
                        await page.locator("#search-query").evaluate((el) =>
                            el.focus()
                        );
                        assertEquals(
                            await page.locator("#search-query").evaluate((el) =>
                                el === document.activeElement
                            ),
                            false,
                        );
                    } else {
                        assertEquals(
                            await page.locator(
                                '[data-slot="sheet-backdrop"]',
                            ).isVisible(),
                            true,
                        );
                        await closeButton().focus();
                        for (let tabIndex = 0; tabIndex < 12; tabIndex++) {
                            await page.keyboard.press("Tab");
                            assertEquals(
                                await page.evaluate(() =>
                                    !!document.activeElement?.closest(
                                        ".workspace-panel--mobile, .workspace-panel",
                                    )
                                ),
                                true,
                            );
                        }
                    }
                    await closeButton().focus();
                    await page.keyboard.press("Enter");
                    await panel.first().waitFor({ state: "detached" });
                    await page.waitForFunction(
                        (element) =>
                            document.activeElement ===
                                (element?.isConnected
                                    ? element
                                    : document.getElementById("search-query")),
                        opener,
                    ).catch(async (cause) => {
                        throw new Error(
                            `Close focus at ${viewport.width}px: ${await page
                                .evaluate(() =>
                                    document.activeElement?.outerHTML
                                )}; opener connected: ${await opener?.evaluate((
                                    el: Element,
                                ) => el.isConnected)}`,
                            { cause },
                        );
                    });
                    await homeSettled();
                    assertEquals(
                        await page.locator(".hero").boundingBox(),
                        hero,
                    );
                    await closeAllWorkspaces();
                }
            }
            await closeAllWorkspaces();
        },
    );

    await t.step(
        "keyboard-only open/search/menu/Back/Close; overlay Escape takes priority",
        async () => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await visit("/");
            await openNotesByKeyboard(page);
            const notesSearch = panel.getByRole("searchbox", {
                name: "搜索笔记",
                exact: true,
            });
            await notesSearch.fill("Shell");
            const actions = panel.getByRole("button", {
                name: "笔记操作：Shell note",
                exact: true,
            });
            await actions.focus();
            await page.keyboard.press("Enter");
            await page.getByRole("menu").waitFor();
            // A mounted popup can precede Base UI's keyboard focus handoff.
            await page.waitForFunction(() =>
                document.querySelector('[role="menu"]')?.contains(
                    document.activeElement,
                ) === true
            );
            await page.keyboard.press("Escape");
            await page.getByRole("menu").waitFor({ state: "detached" });
            await page.waitForFunction(() =>
                document.activeElement?.getAttribute("aria-label") ===
                    "笔记操作：Shell note"
            ).catch(async (cause) => {
                throw new Error(
                    `Menu Escape focus: ${await page.evaluate(() =>
                        document.activeElement?.outerHTML
                    )}`,
                    { cause },
                );
            });
            assertEquals(await panel.isVisible(), true);
            await panel.getByRole("button", {
                name: "打开笔记：Shell note",
                exact: true,
            }).focus();
            await page.keyboard.press("Enter");
            await panel.locator("[data-workspace-editor]").waitFor();
            await page.waitForFunction(() =>
                document.activeElement?.getAttribute("aria-label") ===
                    "返回上一级"
            );
            await page.keyboard.press("Enter");
            await search().waitFor();
            assertEquals(await search().inputValue(), "Shell");
            await closeAllWorkspaces();
        },
    );

    await t.step(
        "Zen panel and sheet: nested Back, overlay Escape precedence, and actual opener restoration",
        async () => {
            for (
                const { width, height, presentation: expectedPresentation } of [
                    { width: 1440, height: 900, presentation: "panel" },
                    { width: 390, height: 844, presentation: "sheet" },
                ] as const
            ) {
                await page.setViewportSize({ width, height });
                await visit("/");

                // Menu entries restore focus to the avatar trigger.
                const trigger = deskMenuTrigger(page);
                await trigger.waitFor();
                const opener = await trigger.elementHandle();
                await openNotesByKeyboard(page);
                await panel.waitFor();
                assertEquals(
                    await panel.getAttribute("data-presentation"),
                    expectedPresentation,
                );

                // Mobile notes are nested under the desk object list.
                await page.waitForFunction(
                    (expected) =>
                        document.activeElement?.getAttribute("aria-label") ===
                            expected,
                    width < 768 ? "返回桌面" : "关闭详情",
                );

                // Nested Back behavior in Zen panel/sheet
                const noteOpen = panel.getByRole("button", {
                    name: "打开笔记：Shell note",
                    exact: true,
                });
                await noteOpen.focus();
                await page.keyboard.press("Enter");
                await panel.locator("[data-workspace-editor]").waitFor();
                // Back returns to the library root
                await panel.getByRole("button", {
                    name: "返回上一级",
                    exact: true,
                }).click();
                await search().waitFor();

                // Overlay Escape precedence in Zen panel/sheet
                const actions = panel.getByRole("button", {
                    name: "笔记操作：Shell note",
                    exact: true,
                });
                await actions.focus();
                await page.keyboard.press("Enter");
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
                if (width < 768) {
                    await panel.getByRole("button", {
                        name: "返回桌面",
                        exact: true,
                    }).click();
                    await panel.getByRole("heading", {
                        name: "桌面",
                        exact: true,
                    }).waitFor();
                    await deskObject(page, "notes").click();
                    await search().waitFor();
                }

                // Closing a detail selected in 览 returns to the mobile object list.
                await page.keyboard.press("Escape");
                if (width < 768) {
                    await panel.getByRole("heading", {
                        name: "桌面",
                        exact: true,
                    }).waitFor();
                    await page.keyboard.press("Escape");
                }
                await panel.first().waitFor({ state: "detached" });
                await page.waitForFunction(
                    (element) =>
                        document.activeElement ===
                            (element?.isConnected
                                ? element
                                : document.getElementById("search-query")),
                    opener,
                ).catch(async (cause) => {
                    throw new Error(
                        `Escape focus at ${width}px: ${await page.evaluate(() =>
                            document.activeElement?.outerHTML
                        )}; opener connected: ${await opener?.evaluate(
                            (el: Element) => el.isConnected,
                        )}`,
                        { cause },
                    );
                });
                await closeAllWorkspaces();
            }
            await closeAllWorkspaces();
        },
    );

    await t.step(
        "desk detail keeps bounded chrome, search alignment and create action hierarchy",
        async () => {
            for (const theme of ["light", "dark"] as const) {
                await page.emulateMedia({ colorScheme: theme });
                for (const width of [375, 390, 768, 1024, 1440]) {
                    await page.setViewportSize({ width, height: 900 });
                    await visit("/");
                    await page.locator(".hero").waitFor();
                    await openDocs();
                    await panel.locator(".documents-workspace").waitFor();
                    await assertChromeInViewport(page);
                    const noteInset = await measureBodyInset(panel);
                    assertNear(noteInset.searchLeftDiff, 0, 2);
                    assertNear(noteInset.searchRightDiff, 0, 2);
                    if (width >= 768) {
                        await assertDeskLayout();
                        assertEquals(
                            await page.locator(
                                'aside.workspace-panel[data-presentation="panel"]',
                            ).count(),
                            1,
                        );
                    }
                    await closeAllWorkspaces();
                }
            }

            // Desktop viewport for interaction, focus/blur, and chrome stability
            await page.setViewportSize({ width: 1440, height: 900 });
            await visit("/");
            await openDocs();
            await page.waitForFunction(() =>
                document.activeElement?.getAttribute("aria-label") ===
                    "关闭详情"
            );

            // 1. Focus visibility and blur without shift
            await homeSettled();
            await page.waitForFunction(() =>
                document.querySelector("aside.workspace-panel")?.getAnimations()
                    .length === 0
            );
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

            // 2. Clear action returns focus to the search input
            await search().fill("DocumentsQueryToClear");
            const clearBtn = panel.locator(".workspace-search-clear");
            await clearBtn.waitFor({ state: "visible" });
            await clearBtn.focus();
            await page.keyboard.press("Enter");
            assertEquals(await search().inputValue(), "");
            assertEquals(await clearBtn.count(), 0);
            await page.waitForFunction(() =>
                document.activeElement?.matches("input[data-workspace-search]")
            );
            await page.keyboard.type("DocumentsQueryPersisted");
            assertEquals(
                await search().inputValue(),
                "DocumentsQueryPersisted",
            );
            await search().fill("");

            // 3. Nested views: no library create action; Back restores it
            assertEquals(
                await panel.getByRole("button", {
                    name: "新建笔记",
                    exact: true,
                })
                    .count(),
                1,
            );
            await panel.getByRole("button", {
                name: "打开笔记：Shell note",
                exact: true,
            }).click();
            await panel.locator("[data-workspace-editor]").waitFor();
            assertEquals(
                await panel.getByRole("button", {
                    name: "新建笔记",
                    exact: true,
                })
                    .count(),
                0,
            );
            await panel.getByRole("button", { name: "返回上一级", exact: true })
                .click();
            await search().waitFor();
            assertEquals(
                await panel.getByRole("button", {
                    name: "新建笔记",
                    exact: true,
                })
                    .count(),
                1,
            );

            // 4. Long titles do not distort chrome
            const longNote = await request<{ id: string; version: number }>(
                "/api/documents",
                "POST",
                {
                    title: "T".repeat(200),
                    body: "B".repeat(500),
                },
            );
            await closeAllWorkspaces();
            await visit("/");
            await openDocs();
            await panel.locator(".documents-workspace").waitFor();
            await panel.getByRole("button", {
                name: "打开笔记：" + "T".repeat(200),
                exact: true,
            })
                .waitFor({ state: "attached" });
            await assertChromeInViewport(page);

            await request(
                `/api/documents/${longNote.id}?version=${longNote.version}`,
                "DELETE",
            );
            await closeAllWorkspaces();
        },
    );

    await t.step(
        "closing nested detail releases Escape and reopening resets the route but keeps the query",
        async () => {
            for (const reducedMotion of ["no-preference", "reduce"] as const) {
                await page.emulateMedia({ reducedMotion });
                for (const width of [1440, 390]) {
                    await page.setViewportSize({ width, height: 900 });
                    await visit("/");
                    await openDocs();
                    await search().fill("Shell");
                    await panel.getByRole("button", {
                        name: "打开笔记：Shell note",
                        exact: true,
                    }).click();
                    await panel.locator("[data-workspace-editor]").waitFor();
                    const exit = await panel.evaluate((element) => {
                        const { promise, resolve, reject } = Promise
                            .withResolvers<
                                { mounted: boolean; inert: boolean }
                            >();
                        // Failure deadline only; the exit mutation resolves this.
                        const timeout = setTimeout(() => {
                            observer.disconnect();
                            reject(new Error("Detail did not start exiting"));
                        }, 5000);
                        const observer = new MutationObserver(() => {
                            if (
                                !element.hasAttribute("data-ending-style") &&
                                element.isConnected
                            ) return;
                            clearTimeout(timeout);
                            observer.disconnect();
                            resolve({
                                mounted: element.isConnected,
                                inert: element.hasAttribute("inert"),
                            });
                        });
                        observer.observe(document.body, {
                            subtree: true,
                            childList: true,
                            attributes: true,
                            attributeFilter: ["data-ending-style", "inert"],
                        });
                        document.activeElement?.dispatchEvent(
                            new KeyboardEvent("keydown", {
                                key: "Escape",
                                bubbles: true,
                                cancelable: true,
                            }),
                        );
                        return promise;
                    });
                    assertEquals(exit, { mounted: true, inert: true });
                    await panel.waitFor({ state: "detached" });
                    await page.locator('[data-slot="sheet-backdrop"]').waitFor({
                        state: "detached",
                    });
                    assertEquals(await deskStage(page), "calm");
                    await page.waitForFunction(() =>
                        document.activeElement?.matches(".user-avatar-trigger")
                    );
                    assertEquals(
                        await page.evaluate(() => {
                            const event = new KeyboardEvent("keydown", {
                                key: "Escape",
                                bubbles: true,
                                cancelable: true,
                            });
                            document.activeElement?.dispatchEvent(event);
                            return event.defaultPrevented;
                        }),
                        false,
                        "a closed detail must no longer own Escape",
                    );
                    await openDocs();
                    assertEquals(
                        await panel.locator("[data-workspace-editor]").count(),
                        0,
                    );
                    assertEquals(await search().inputValue(), "Shell");
                    await closeAllWorkspaces();
                }
            }
            await page.emulateMedia({ reducedMotion: "reduce" });
        },
    );

    await t.step(
        "desktop desk objects stay left of the detail bar while home is inert",
        async () => {
            for (const width of [768, 800, 1024, 1440, 1600]) {
                await page.setViewportSize({ width, height: 900 });
                await visit("/");
                await page.locator(".hero").waitFor();
                const hero = await page.locator(".hero").boundingBox();
                await openDocs();
                await assertDeskLayout();
                await closeAllWorkspaces();
                await homeSettled();
                assertEquals(await page.locator(".hero").boundingBox(), hero);
            }
        },
    );

    await t.step(
        "mobile Sheet detaches with its backdrop and restores its opener or search fallback",
        async () => {
            await page.setViewportSize({ width: 390, height: 844 });
            await visit("/");
            const opener = await deskMenuTrigger(page).elementHandle();
            await openDocs();
            await page.locator('[data-slot="sheet-backdrop"]').waitFor();
            await closeButton().click();
            await page.locator(".workspace-panel--mobile").waitFor({
                state: "detached",
            });
            await page.locator('[data-slot="sheet-backdrop"]').waitFor({
                state: "detached",
            });
            await deskMenuTrigger(page).waitFor();
            await page.waitForFunction(
                (element) =>
                    document.activeElement ===
                        (element?.isConnected
                            ? element
                            : document.getElementById("search-query")),
                opener,
            ).catch(async (cause) => {
                throw new Error(
                    `Sheet close focus: ${await page.evaluate(() =>
                        document.activeElement?.outerHTML
                    )}; opener connected: ${await opener?.evaluate(
                        (el: Element) => el.isConnected,
                    )}`,
                    { cause },
                );
            });
        },
    );
    await t.step(
        "presentation changes preserve Core queries and nested Back; logout clears transient state",
        async () => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await visit("/");
            await openDocs();
            await search().fill("private documents query");
            for (const width of [390, 768, 1024, 1440]) {
                await page.setViewportSize({ width, height: 900 });
                await page.waitForFunction(
                    (expected) =>
                        document.querySelector(
                            ".workspace-panel--mobile, aside.workspace-panel",
                        )
                            ?.getAttribute("data-presentation") === expected,
                    width < 768 ? "sheet" : "panel",
                );
                assertEquals(
                    await search().inputValue(),
                    "private documents query",
                );
                assertEquals(
                    await panel.getByRole("heading", {
                        name: "笔记",
                        exact: true,
                    }).isVisible(),
                    true,
                );
                await assertChromeInViewport(page);
            }
            await search().fill("Shell");
            await panel.getByRole("button", {
                name: "打开笔记：Shell note",
                exact: true,
            }).click();
            await panel.locator("[data-workspace-editor]").waitFor();
            await page.setViewportSize({ width: 390, height: 900 });
            await page.locator(
                '[data-presentation="sheet"] [data-workspace-editor]',
            ).waitFor();
            assertEquals(
                await panel.getByRole("textbox", {
                    name: "笔记标题",
                    exact: true,
                }).inputValue(),
                "Shell note",
            );
            await panel.getByRole("button", { name: "返回上一级", exact: true })
                .click();
            await search().waitFor();
            assertEquals(await search().inputValue(), "Shell");
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.getByRole("button", {
                name: "用户菜单：Shell contract",
                exact: true,
            }).click();
            await page.getByRole("menuitem", { name: "退出登录", exact: true })
                .click();
            await panel.waitFor({ state: "detached" });
            await page.locator("[data-workspace]").first().waitFor({
                state: "detached",
            });
            assertEquals(await page.locator("[data-workspace]").count(), 0);
            await page.goto(origin + "/login");
            await page.locator("#auth-username").fill("shell44");
            await page.locator("#auth-password").fill(
                "shell-contract-password",
            );
            await page.locator('form button[type="submit"]').click();
            await page.waitForURL(origin + "/");
            assertEquals(await panel.count(), 0);
            assertEquals(await deskStage(page), "calm");
            await openDocs();
            assertEquals(await search().inputValue(), "");
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
        ".workspace-panel--mobile, aside.workspace-panel",
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
            header: box(".workspace-header"),
        };
    });
}

async function assertChromeInViewport(page: Page) {
    const bounds = await chromeBounds(page);
    const viewport = page.viewportSize()!;
    for (const rect of [bounds.header]) {
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
            ".workspace-panel--mobile .workspace-body, aside.workspace-panel .workspace-body",
        ).evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        true,
    );
}
