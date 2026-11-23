import { assert, assertEquals } from "@std/assert";
import { type Locator, type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";
import {
    ensureSidebarOpen,
    libraryPanel,
    libraryWindow,
    openNotes,
    openNotesByKeyboard,
    workspaceDock,
    workspaceNotesTrigger,
} from "./helpers/library.ts";

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
    const panel = libraryPanel(page);
    const search = () => panel.locator("input[data-workspace-search]:visible");
    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor();
    }
    const frame = libraryWindow(page, "notes");
    const closeButton = () =>
        frame.getByRole("button", { name: "关闭笔记", exact: true });
    /** Close destroys the window; a minimized one is restored first. */
    async function closeAllWorkspaces(target: Page = page) {
        if (await libraryPanel(target).count()) {
            if (!(await libraryWindow(target, "notes").isVisible())) {
                await workspaceNotesTrigger(target).click();
            }
            await libraryWindow(target, "notes").getByRole("button", {
                name: "关闭笔记",
                exact: true,
            }).click();
        }
        await libraryPanel(target).first().waitFor({ state: "detached" });
    }
    // Row contracts run in the flat 最近 list; the tree has its own e2e file.
    async function showRecent() {
        await ensureSidebarOpen(page);
        await panel.getByRole("button", { name: "最近", exact: true }).click();
        await panel.locator("[data-sidebar-mode='list']").waitFor();
    }
    async function openDocs() {
        await openNotes(page);
        await ensureSidebarOpen(page);
        await search().waitFor();
        await showRecent();
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
        "keyboard-only open/search/menu and editor; overlay Escape takes priority",
        async () => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await visit("/");
            await openNotesByKeyboard(page);
            await ensureSidebarOpen(page);
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
            await panel.getByRole("textbox", { name: "笔记标题", exact: true })
                .waitFor();
            assertEquals(await search().inputValue(), "Shell");
            await closeAllWorkspaces();
        },
    );

    await t.step(
        "Sidebar and drawer: overlay Escape precedence and opener restoration",
        async () => {
            for (
                const { width, height } of [
                    { width: 1440, height: 900 },
                    { width: 390, height: 844 },
                ] as const
            ) {
                await page.setViewportSize({ width, height });
                await visit("/");

                // Dock trigger restores focus when the window leaves.
                const trigger = workspaceNotesTrigger(page);
                await trigger.waitFor();
                const opener = await trigger.elementHandle();
                await openNotesByKeyboard(page);
                await panel.waitFor();
                await assertWindowInWorkArea(page, frame);
                await showRecent();

                // Selecting a note keeps the editor and sidebar in one window.
                const noteOpen = panel.getByRole("button", {
                    name: "打开笔记：Shell note",
                    exact: true,
                });
                await noteOpen.focus();
                await page.keyboard.press("Enter");
                await panel.locator("[data-workspace-editor]").waitFor();
                if (width < 768) {
                    await panel.getByRole("button", {
                        name: "笔记侧栏",
                        exact: true,
                    })
                        .click();
                }
                await search().waitFor();

                // Overlay Escape precedence inside the window
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
                // First Escape closes menu overlay, the window remains visible
                await page.keyboard.press("Escape");
                await page.getByRole("menu").waitFor({ state: "detached" });
                assertEquals(await panel.isVisible(), true);
                if (width < 768) {
                    await page.keyboard.press("Escape");
                    assertEquals(await panel.isVisible(), true);
                }
                // Escape now minimizes the window; content is kept.
                await page.keyboard.press("Escape");
                await frame.waitFor({ state: "hidden" });
                await page.waitForURL(origin + "/");
                assertEquals(
                    await trigger.getAttribute("data-window-status"),
                    "minimized",
                );
                assertEquals(await panel.count(), 1);
                await page.waitForFunction(
                    (element) =>
                        document.activeElement ===
                            (element?.isConnected
                                ? element
                                : document.querySelector(".wordmark-small")),
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
        "Escape minimizes the editor and reopening keeps selection and query",
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
                    await panel.getByRole("textbox", {
                        name: "笔记标题",
                        exact: true,
                    }).focus();
                    await page.keyboard.press("Escape");
                    await frame.waitFor({ state: "hidden" });
                    await page.waitForURL(origin + "/");
                    // Minimizing keeps the window mounted, only hidden.
                    assertEquals(await libraryPanel(page).count(), 1);
                    assertEquals(
                        await workspaceNotesTrigger(page).getAttribute(
                            "data-window-status",
                        ),
                        "minimized",
                    );
                    await page.waitForFunction(
                        (el) =>
                            document.activeElement ===
                                (el?.isConnected ? el : document.querySelector(
                                    ".wordmark-small",
                                )),
                        await workspaceNotesTrigger(page).elementHandle(),
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
                    // Restoring the minimized window keeps the editor and query.
                    await openNotes(page);
                    assertEquals(
                        await panel.locator("[data-workspace-editor]").count(),
                        1,
                    );
                    if (width < 768) {
                        await panel.getByRole("button", {
                            name: "笔记侧栏",
                            exact: true,
                        }).click();
                    }
                    assertEquals(await search().inputValue(), "Shell");
                    await closeAllWorkspaces();
                }
            }
            await page.emulateMedia({ reducedMotion: "reduce" });
        },
    );

    await t.step(
        "mobile window closes, detaches and restores its opener or home fallback",
        async () => {
            await page.setViewportSize({ width: 390, height: 844 });
            await visit("/");
            const trigger = workspaceNotesTrigger(page);
            await trigger.waitFor();
            const opener = await trigger.elementHandle();
            await openDocs();
            await assertWindowInWorkArea(page, frame);
            await closeButton().click();
            await panel.waitFor({ state: "detached" });
            await frame.waitFor({ state: "hidden" });
            await trigger.waitFor();
            await page.waitForFunction(
                (element) =>
                    document.activeElement ===
                        (element?.isConnected
                            ? element
                            : document.querySelector(".wordmark-small")),
                opener,
            ).catch(async (cause) => {
                throw new Error(
                    `Window close focus: ${await page.evaluate(() =>
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
        "window presentation changes preserve Core queries and nested Back; logout clears transient state",
        async () => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await visit("/");
            await openDocs();
            await search().fill("private documents query");
            for (const width of [390, 768, 1024, 1440]) {
                await page.setViewportSize({ width, height: 900 });
                await waitForWindowLayout(page);
                // The reopened window restored a note, so narrow widths keep
                // the drawer closed until it is opened.
                await ensureSidebarOpen(page);
                assertEquals(
                    await search().inputValue(),
                    "private documents query",
                );
                assertEquals(
                    await frame.locator(".window-frame__title").textContent(),
                    "笔记",
                );
                await assertWindowInWorkArea(page, frame);
                await assertChromeInWorkArea(page);
            }
            await search().fill("Shell");
            await panel.getByRole("button", {
                name: "打开笔记：Shell note",
                exact: true,
            }).click();
            await panel.locator("[data-workspace-editor]").waitFor();
            await page.setViewportSize({ width: 390, height: 900 });
            await waitForWindowLayout(page);
            await frame.locator("[data-workspace-editor]").waitFor();
            assertEquals(
                await panel.getByRole("textbox", {
                    name: "笔记标题",
                    exact: true,
                }).inputValue(),
                "Shell note",
            );
            const sidebarToggle = panel.getByRole("button", {
                name: "笔记侧栏",
                exact: true,
            });
            if (await sidebarToggle.getAttribute("aria-expanded") === "false") {
                await sidebarToggle.click();
            }
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
            await frame.waitFor({ state: "detached" });
            assertEquals(await page.locator("[data-window-id]").count(), 0);
            await page.goto(origin + "/login");
            await page.locator("#auth-username").fill("shell44");
            await page.locator("#auth-password").fill(
                "shell-contract-password",
            );
            await page.locator('form button[type="submit"]').click();
            await page.waitForURL(origin + "/");
            assertEquals(await panel.count(), 0);
            assertEquals(await libraryPanel(page).count(), 0);
            await openDocs();
            assertEquals(await search().inputValue(), "");
            await closeAllWorkspaces();
        },
    );
});

async function chromeBounds(page: Page) {
    return await page.locator('[data-window-id="notes"]').evaluate((el) => {
        const box = (target: Element | null) => {
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
            window: box(el),
            header: box(el.querySelector(".window-frame__titlebar")),
        };
    });
}

/** The window lies inside the viewport and clear of every Dock entry. */
async function assertWindowInWorkArea(page: Page, frame: Locator) {
    const viewport = page.viewportSize()!;
    const rect = await frame.boundingBox();
    assert(rect, "the window is laid out");
    assert(
        rect.x >= 0 && rect.y >= 0 &&
            rect.x + rect.width <= viewport.width + 1 &&
            rect.y + rect.height <= viewport.height + 1,
        `window outside viewport: ${JSON.stringify(rect)}`,
    );
    for (
        const item of await workspaceDock(page).locator("[data-dock-id]").all()
    ) {
        const dock = await item.boundingBox();
        if (!dock) continue;
        assert(
            !(rect.x < dock.x + dock.width && dock.x < rect.x + rect.width &&
                rect.y < dock.y + dock.height && dock.y < rect.y + rect.height),
            `window overlaps the Dock: ${JSON.stringify({ rect, dock })}`,
        );
    }
    if (viewport.width < 1024) {
        // Single active window filling the work area.
        assertEquals(await page.locator("[data-window-id]:visible").count(), 1);
        assert(
            rect.width >= viewport.width - 40,
            `narrow window must fill the work area: ${JSON.stringify(rect)}`,
        );
    }
}

/** Wait for a resize to be reflected by the window geometry. */
async function waitForWindowLayout(page: Page) {
    await page.waitForFunction(() => {
        const rect = document.querySelector('[data-window-id="notes"]')
            ?.getBoundingClientRect();
        return Boolean(rect) && rect!.right <= innerWidth + 1 &&
            rect!.bottom <= innerHeight + 1 &&
            (innerWidth >= 1024 || rect!.width >= innerWidth - 40);
    });
}

async function assertChromeInWorkArea(page: Page) {
    const bounds = await chromeBounds(page);
    const viewport = page.viewportSize()!;
    for (const rect of [bounds.window, bounds.header]) {
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
        await page.locator('[data-window-id="notes"] .workspace-body')
            .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        true,
    );
}
