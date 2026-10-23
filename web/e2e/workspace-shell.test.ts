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
    const panel = page.locator(
        ".workspace-panel--mobile, aside.workspace-panel",
    );
    const docsTrigger = '.zen-edge-trigger button[data-workspace="documents"]';
    const search = () => panel.locator("input[data-workspace-search]");
    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor();
    }
    // A surface that is already exiting stays mounted but inert; only a
    // surface that is not ending counts as open.
    const openSelector =
        ".workspace-panel--mobile:not([data-ending-style]), aside.workspace-panel:not([data-ending-style])";
    async function closeAllWorkspaces(target: Page = page) {
        const everything = target.locator(
            ".workspace-panel--mobile, aside.workspace-panel",
        );
        const open = target.locator(openSelector);
        if (await open.first().isVisible()) {
            const closeBtn = open.locator(
                'button[aria-label="收起工作区"]',
            ).first();
            if (await closeBtn.isVisible()) {
                await closeBtn.click();
            }
        }
        await everything.first().waitFor({ state: "detached" });
    }
    const close = async () => {
        const btn = page.locator(openSelector).locator(
            'button[aria-label="收起工作区"]',
        ).first();
        if (await btn.isVisible()) {
            await btn.click();
        }
        await panel.first().waitFor({ state: "detached" });
    };
    // Narrow desktop layouts centre the search in the full remaining column;
    // at >=1496px the original home/search axis stays unchanged.
    async function assertHomeYields(
        hero: { x: number; y: number; width: number; height: number } | null,
        width: number,
    ) {
        await page.waitForFunction(() =>
            document.querySelector("aside.workspace-panel")?.getAnimations()
                .length === 0
        );
        const now = await page.locator(".hero").boundingBox();
        const panelBox = await page.locator(
            "aside.workspace-panel:not([data-ending-style])",
        ).boundingBox();
        const searchBox = await page.locator(".search-form").boundingBox();
        assert(hero && now && panelBox && searchBox);
        assertEquals(now.y, hero.y);
        assertEquals(now.height, hero.height);
        if (width >= 1496) {
            assertEquals(now, hero);
            assertNear(searchBox.x + searchBox.width / 2, width / 2, 1);
        } else {
            assertNear(now.width, width - 412, 1);
            assertNear(panelBox.x, width - 412, 1);
            assertNear(searchBox.x + searchBox.width / 2, (width - 412) / 2, 1);
            assertNear(
                searchBox.x,
                panelBox.x - searchBox.x - searchBox.width,
                1,
            );
        }
        assert(
            searchBox.x + searchBox.width <= panelBox.x - 16 + 1,
            "search must leave at least the layout gap before the panel",
        );
    }
    const homeSettled = () =>
        page.waitForFunction(() =>
            document.querySelector(".home")?.getAnimations().length === 0
        );
    async function openDocs() {
        await page.locator(docsTrigger).click();
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
                    const trigger = page.locator(docsTrigger);
                    await trigger.waitFor();
                    await page.locator(".hero").waitFor();
                    const hero = await page.locator(".hero").boundingBox();
                    await trigger.focus();
                    await page.keyboard.press("Enter");
                    await search().waitFor();
                    assertEquals(
                        await panel.getAttribute("data-presentation"),
                        viewport.width < 768 ? "sheet" : "panel",
                    );
                    await page.waitForFunction(() =>
                        document.activeElement?.getAttribute(
                            "aria-label",
                        ) ===
                            "收起工作区"
                    );
                    await page.keyboard.press("Tab");
                    assertEquals(
                        await panel.locator(".workspace-body").evaluate((el) =>
                            el.contains(document.activeElement)
                        ),
                        true,
                    );
                    assert(await search().getAttribute("aria-label"));
                    assertEquals(
                        await page.locator(
                            '.workspace-switcher button[aria-label="笔记工作区"]',
                        ).getAttribute("aria-selected"),
                        "true",
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
                        await homeSettled();
                        await assertHomeYields(hero, viewport.width);
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
                                        ".workspace-panel--mobile, .workspace-panel",
                                    )
                                ),
                                true,
                            );
                        }
                    }
                    await panel.getByRole("button", {
                        name: "收起工作区",
                        exact: true,
                    }).focus();
                    await page.keyboard.press("Enter");
                    await panel.first().waitFor({ state: "detached" });
                    await page.waitForFunction(() =>
                        document.activeElement?.getAttribute(
                            "data-workspace",
                        ) === "documents"
                    );
                    assertEquals(
                        await page.evaluate(() =>
                            document.activeElement?.closest(
                                    ".zen-edge-trigger",
                                ) !== null &&
                            document.activeElement?.getAttribute(
                                    "data-workspace",
                                ) === "documents"
                        ),
                        true,
                    );
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
            await page.locator(docsTrigger).focus();
            await page.keyboard.press("Enter");
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

                // Opener: Notes edge trigger
                const docsEdge = page.locator(docsTrigger);
                await docsEdge.waitFor();
                await docsEdge.focus();
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

                // Second Escape closes the Zen panel/sheet
                await page.keyboard.press("Escape");
                await panel.first().waitFor({ state: "detached" });

                // Proves actual opener restoration to the Notes edge trigger
                await page.waitForFunction(() =>
                    document.activeElement?.getAttribute("data-workspace") ===
                        "documents"
                );
                assertEquals(
                    await page.evaluate(() =>
                        document.activeElement?.closest(
                            ".zen-edge-trigger",
                        ) !== null
                    ),
                    true,
                );
                await closeAllWorkspaces();
            }
            await closeAllWorkspaces();
        },
    );

    await t.step(
        "issue #57 workspace layout contract: geometry, search alignment, create action hierarchy, stability",
        async () => {
            for (const theme of ["light", "dark"] as const) {
                await page.emulateMedia({ colorScheme: theme });
                for (const width of [375, 390, 768, 1024, 1440]) {
                    await page.setViewportSize({ width, height: 900 });
                    await visit("/");
                    await page.locator(".hero").waitFor();
                    const hero = await page.locator(".hero").boundingBox();
                    await openDocs();
                    await panel.locator(".documents-workspace").waitFor();
                    await assertChromeInViewport(page);
                    const noteInset = await measureBodyInset(panel);
                    assertNear(noteInset.searchLeftDiff, 0, 2);
                    assertNear(noteInset.searchRightDiff, 0, 2);
                    if (width >= 768) {
                        await homeSettled();
                        await assertHomeYields(hero, width);
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
                    "收起工作区"
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
        "panel and Sheet exits are inert, release Escape and preserve a nested view when reopened",
        async () => {
            for (const reducedMotion of ["no-preference", "reduce"] as const) {
                await page.emulateMedia({ reducedMotion });
                for (const width of [1440, 390]) {
                    try {
                        await page.setViewportSize({ width, height: 900 });
                        await visit("/");
                        await openDocs();
                        await panel.getByRole("button", {
                            name: "打开笔记：Shell note",
                            exact: true,
                        }).click();
                        const name = panel.getByRole("textbox", {
                            name: "笔记标题",
                            exact: true,
                        });
                        await name.waitFor();
                        await name.evaluate((element) =>
                            element.setAttribute(
                                "data-exit-instance",
                                "original",
                            )
                        );
                        await page.waitForFunction(() =>
                            document.querySelector(".workspace-panel")
                                ?.getAnimations().length === 0
                        );
                        const exit = await panel.evaluate((element) => {
                            const { promise, resolve, reject } = Promise
                                .withResolvers<{
                                    mounted: boolean;
                                    ending: boolean;
                                    inert: boolean;
                                    animations: number;
                                    dockAnimations: number;
                                    backdropInert: boolean;
                                }>();
                            // Failure deadline only; successful completion is
                            // driven by the actual exit mutation, never a sleep.
                            const timeout = setTimeout(
                                () =>
                                    reject(
                                        new Error(
                                            "Workspace did not start its held exit",
                                        ),
                                    ),
                                5000,
                            );
                            const observer = new MutationObserver(() => {
                                const ending = element.hasAttribute(
                                    "data-ending-style",
                                );
                                if (!ending && element.isConnected) return;
                                observer.disconnect();
                                const animations = element.getAnimations();
                                // Hold the real exit to exercise focus, Escape
                                // and reopen before its finished promise.
                                for (const animation of animations) {
                                    animation.pause();
                                }
                                const backdrop = document.querySelector<
                                    HTMLElement
                                >('[data-slot="sheet-backdrop"]');
                                resolve({
                                    mounted: element.isConnected,
                                    ending,
                                    inert: element.hasAttribute("inert"),
                                    animations: animations.length,
                                    dockAnimations: document.querySelector(
                                        ".zen-edge-trigger",
                                    )?.getAnimations().length ?? 0,
                                    backdropInert: !backdrop || backdrop.inert,
                                });
                            });
                            observer.observe(document.body, {
                                subtree: true,
                                childList: true,
                                attributes: true,
                                attributeFilter: ["data-ending-style", "inert"],
                            });
                            element.querySelector<HTMLButtonElement>(
                                'button[aria-label="收起工作区"]',
                            )!.click();
                            return promise.finally(() => {
                                clearTimeout(timeout);
                                observer.disconnect();
                            });
                        });
                        assertEquals(exit.mounted, true);
                        assertEquals(exit.ending, true);
                        assertEquals(exit.inert, true);
                        assertEquals(exit.backdropInert, true);
                        assert(
                            exit.animations > 0,
                            "exit must retain a real transition",
                        );
                        assert(
                            exit.dockAnimations > 0,
                            "the returning Dock must fade in",
                        );
                        // The Dock click below proves nothing in the exiting
                        // Sheet intercepts pointer input.
                        await page.waitForFunction(() =>
                            document.activeElement?.getAttribute(
                                "data-workspace",
                            ) === "documents"
                        );
                        assertEquals(
                            await name.evaluate((element) => {
                                element.focus();
                                return document.activeElement === element;
                            }),
                            false,
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
                            "an exiting workspace must no longer own Escape",
                        );
                        await page.locator(docsTrigger).click();
                        assertEquals(
                            await name.getAttribute("data-exit-instance"),
                            "original",
                            "reopening retains the nested editor instance",
                        );
                        // Base UI clears the exit state on its own commit after
                        // reopening; wait for that observable state change.
                        await page.waitForFunction(
                            (element) =>
                                element !== null &&
                                !element.hasAttribute("inert") &&
                                !element.hasAttribute("data-ending-style"),
                            await panel.elementHandle(),
                            { timeout: 5000 },
                        );
                        if (width < 768) {
                            await page.getByRole("button", {
                                name: "收起工作区",
                                exact: true,
                            }).focus();
                            for (let index = 0; index < 12; index++) {
                                await page.keyboard.press("Tab");
                                // Base UI's edge focus guard redirects on the
                                // next frame; the trap holds once focus settles.
                                await page.waitForFunction(
                                    (element) =>
                                        element?.contains(
                                            document.activeElement,
                                        ) ?? false,
                                    await panel.elementHandle(),
                                    { timeout: 2000 },
                                );
                            }
                        }
                        await panel.evaluate((element) => {
                            for (const animation of element.getAnimations()) {
                                if (animation.playState === "paused") {
                                    animation.play();
                                }
                            }
                        });
                        await page.waitForFunction(() =>
                            document.querySelector(".workspace-panel")
                                ?.getAnimations().length === 0
                        );
                        await close();
                        await page.locator('[data-slot="sheet-backdrop"]')
                            .waitFor({ state: "detached" });
                        await openDocs();
                        assertEquals(
                            await panel.locator("[data-workspace-editor]")
                                .count(),
                            0,
                        );
                        await close();
                    } finally {
                        await page.evaluate(() => {
                            for (const animation of document.getAnimations()) {
                                if (animation.playState === "paused") {
                                    animation.play();
                                }
                            }
                        });
                    }
                }
            }
            await page.emulateMedia({ reducedMotion: "reduce" });
        },
    );

    await t.step(
        "desktop panel never covers the search; Hero keeps its vertical box",
        async () => {
            for (const width of [768, 1024, 1280, 1440, 1495, 1496, 1600]) {
                await page.setViewportSize({ width, height: 900 });
                await visit("/");
                await page.locator(".hero").waitFor();
                const hero = await page.locator(".hero").boundingBox();
                const searchBefore = await page.locator(".search-form")
                    .boundingBox();
                await openDocs();
                await homeSettled();
                await assertHomeYields(hero, width);
                if (width >= 1496) {
                    assertEquals(
                        await page.locator(".search-form").boundingBox(),
                        searchBefore,
                    );
                }
                await closeAllWorkspaces();
                await homeSettled();
                assertEquals(await page.locator(".hero").boundingBox(), hero);
            }
        },
    );

    await t.step(
        "mobile Sheet detaches with its backdrop and returns focus to the Dock",
        async () => {
            await page.setViewportSize({ width: 390, height: 844 });
            await visit("/");
            await openDocs();
            await page.locator('[data-slot="sheet-backdrop"]').waitFor();
            await panel.getByRole("button", {
                name: "收起工作区",
                exact: true,
            }).click();
            await page.locator(".workspace-panel--mobile").waitFor({
                state: "detached",
            });
            await page.locator('[data-slot="sheet-backdrop"]').waitFor({
                state: "detached",
            });
            await page.locator(".zen-edge-trigger").waitFor();
            await page.waitForFunction(() =>
                document.activeElement?.closest(".zen-edge-trigger") !==
                    null &&
                document.activeElement?.getAttribute("data-workspace") ===
                    "documents"
            );
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
                await assertChromeInViewport(page);
            }
            await search().fill("Shell");
            await panel.getByRole("button", {
                name: "打开笔记：Shell note",
                exact: true,
            }).click();
            await panel.locator("[data-workspace-editor]").waitFor();
            await page.setViewportSize({ width: 390, height: 900 });
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
