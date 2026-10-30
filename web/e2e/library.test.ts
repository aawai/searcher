import { assert, assertEquals } from "@std/assert";
import type { Locator, Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import {
    assertInteractiveHome,
    closeLibrary,
    libraryPanel,
    libraryView,
    libraryWindow,
    openApps,
    openNotes,
    workspaceAppsTrigger,
    workspaceNotesTrigger,
} from "./helpers/library.ts";

async function assertFocus(target: Locator) {
    await target.page().waitForFunction(
        (element) => document.activeElement === element,
        await target.elementHandle(),
    );
}

/** Opening a window moves focus inside its frame (title bar or content). */
async function assertWindowFocus(page: Page, view: "notes" | "apps") {
    await page.waitForFunction(
        (selector) =>
            document.querySelector(selector)?.contains(
                document.activeElement,
            ) === true,
        `[data-window-id="${view}"]`,
    );
}

function libraryBody(page: Page, view: "notes" | "apps"): Locator {
    return page.locator(`[data-library="${view}"]`);
}

Deno.test("Workspace entries, responsive presentation, history and focus contracts #285", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const browser = await chromium.launch({ headless: true });
    cleanup.defer(() => browser.close());

    await t.step("guests cannot open the workspace panel", async () => {
        const guest = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        try {
            await guest.goto(app.origin + "/");
            const search = guest.locator("#search-query");
            await search.waitFor();
            await search.press("Control+.");
            assertEquals(await libraryPanel(guest).count(), 0);
        } finally {
            await guest.close();
        }
    });

    for (const width of [390, 768, 1440]) {
        // Each width gets its own account so earlier widths' home notes cannot
        // consume the next viewport's note capacity.
        const credentials = await app.seedAskFixtureUser({
            username: `workspace_entries_${width}`,
            password: "Workspace-entries-password-285!",
        });
        const context = await browser.newContext({
            viewport: { width, height: width === 390 ? 844 : 1024 },
            reducedMotion: "reduce",
        });
        try {
            const page = await context.newPage();
            const errors: string[] = [];
            page.on("pageerror", (error) => errors.push(error.message));
            await loginAndVisit(page, app.origin, "/", credentials);
            const created = await page.request.post(
                app.origin + "/api/documents",
                {
                    headers: { Origin: app.origin },
                    data: {
                        title: `工作区入口 ${width}`,
                        body: "入口回归正文",
                        isHomeFixed: true,
                    },
                },
            );
            assert(created.ok(), await created.text());
            const title = `工作区入口 ${width}`;
            const search = page.locator("#search-query");
            const entries: {
                name: string;
                view: "notes" | "apps";
                open: () => Promise<unknown>;
                focus: () => Locator;
            }[] = [
                {
                    name: "dock notes button",
                    view: "notes",
                    open: () => openNotes(page),
                    focus: () => workspaceNotesTrigger(page),
                },
                {
                    name: "dock apps button",
                    view: "apps",
                    open: () => openApps(page),
                    focus: () => workspaceAppsTrigger(page),
                },
                {
                    name: "home note",
                    view: "notes",
                    open: () =>
                        page.getByRole("button", {
                            name: title,
                            exact: true,
                        }).click(),
                    focus: () =>
                        page.getByRole("button", {
                            name: title,
                            exact: true,
                        }),
                },
                {
                    name: "continue",
                    view: "notes",
                    open: () =>
                        page.getByRole("navigation", { name: "继续" })
                            .getByRole("button", {
                                name: `继续编辑 ${title}`,
                                exact: true,
                            }).click(),
                    focus: () =>
                        page.getByRole("navigation", { name: "继续" })
                            .getByRole("button", {
                                name: `继续编辑 ${title}`,
                                exact: true,
                            }),
                },
                {
                    name: "/notes",
                    view: "notes",
                    open: async () => {
                        await search.fill("/notes");
                        await page.getByRole("option", { name: /\/notes/ })
                            .click();
                    },
                    focus: () => search,
                },
                {
                    name: "note suggestion",
                    view: "notes",
                    open: async () => {
                        await search.fill(title);
                        await page.getByRole("group", {
                            name: "我的",
                            exact: true,
                        })
                            .getByRole("option").filter({ hasText: title })
                            .click();
                    },
                    focus: () => search,
                },
            ];

            for (const entry of entries) {
                await t.step(`${width}: ${entry.name}`, async () => {
                    await page.goto(app.origin + "/");
                    await search.waitFor();
                    const hero = await page.locator(".hero").boundingBox();
                    await entry.open();
                    await libraryView(page, entry.view).waitFor();
                    await assertWindowFocus(page, entry.view);
                    assertEquals(
                        await libraryBody(page, entry.view).count(),
                        1,
                    );
                    await libraryWindow(page, entry.view).waitFor({
                        state: "visible",
                    });
                    if (
                        entry.name === "home note" ||
                        entry.name === "continue" ||
                        entry.name === "note suggestion"
                    ) {
                        const noteTitle = libraryBody(page, entry.view)
                            .getByRole("textbox", {
                                name: "笔记标题",
                                exact: true,
                            });
                        await noteTitle.waitFor();
                        assertEquals(await noteTitle.inputValue(), title);
                    }
                    assertEquals(
                        await page.locator(".hero").boundingBox(),
                        hero,
                    );
                    assertEquals(
                        await page.locator('[data-slot="sheet-backdrop"]')
                            .count(),
                        0,
                    );
                    await assertInteractiveHome(page);
                    await closeLibrary(page);
                    await assertFocus(entry.focus());
                });
            }

            await t.step(
                `${width}: Escape minimizes the editor and restores opener`,
                async () => {
                    await page.goto(app.origin + "/");
                    await openNotes(page);
                    const notes = libraryWindow(page, "notes");
                    // Open document into editor
                    const noteCard = libraryPanel(page).locator(
                        `[data-document-id] h4 button`,
                    ).first();
                    if (await noteCard.isVisible()) {
                        await noteCard.click();
                        await libraryPanel(page).locator(
                            "[data-workspace-editor]",
                        )
                            .waitFor();
                        await libraryPanel(page).getByRole("textbox", {
                            name: "笔记标题",
                            exact: true,
                        }).focus();
                    }
                    const sidebar = notes.getByRole("button", {
                        name: "笔记侧栏",
                        exact: true,
                    });
                    if (await sidebar.getAttribute("aria-expanded") === "true" && width < 1024) {
                        await page.keyboard.press("Escape");
                        assertEquals(await sidebar.getAttribute("aria-expanded"), "false");
                    }
                    // Escape minimizes the window: hidden, content kept.
                    await page.keyboard.press("Escape");
                    await notes.waitFor({ state: "hidden" });
                    await page.waitForURL((url) =>
                        !url.searchParams.has("view")
                    );
                    assertEquals(await libraryPanel(page).count(), 1);
                    assertEquals(
                        await workspaceNotesTrigger(page).getAttribute(
                            "data-window-status",
                        ),
                        "minimized",
                    );
                    await assertFocus(workspaceNotesTrigger(page));
                },
            );

            await t.step(
                `${width}: URL navigation and history between notes, apps and home`,
                async () => {
                    await page.goto(app.origin + "/");
                    await openNotes(page);
                    await page.waitForURL((url) =>
                        url.searchParams.get("view") === "notes"
                    );
                    const drawerDismiss = page.getByRole("button", {
                        name: "关闭笔记侧栏",
                        exact: true,
                    });
                    if (await drawerDismiss.isVisible()) await drawerDismiss.click();

                    await openApps(page);
                    await page.waitForURL((url) =>
                        url.searchParams.get("view") === "apps"
                    );

                    await page.goBack();
                    await page.waitForURL((url) =>
                        url.searchParams.get("view") === "notes"
                    );
                    await libraryView(page, "notes").waitFor();

                    await page.goBack();
                    await page.waitForURL((url) =>
                        !url.searchParams.has("view")
                    );
                    await libraryWindow(page, "notes").waitFor({
                        state: "hidden",
                    });
                    await libraryWindow(page, "apps").waitFor({
                        state: "hidden",
                    });
                },
            );

            if (width === 1440) {
                await t.step(
                    "reactivating notes refreshes results without resetting its query",
                    async () => {
                        await page.goto(app.origin + "/");
                        await openNotes(page);
                        const notesBody = libraryBody(page, "notes");
                        const query = notesBody.getByRole(
                            "searchbox",
                            {
                                name: "搜索笔记",
                            },
                        );
                        await query.fill("Hidden pane refresh");
                        await notesBody.getByText("没有匹配的笔记", {
                            exact: true,
                        })
                            .waitFor();
                        await openApps(page);
                        const created = await page.request.post(
                            app.origin + "/api/documents",
                            {
                                headers: { Origin: app.origin },
                                data: {
                                    title: "Hidden pane refresh",
                                    body: "Created while apps is active",
                                },
                            },
                        );
                        assert(created.ok(), await created.text());
                        await openNotes(page);
                        assertEquals(
                            await query.inputValue(),
                            "Hidden pane refresh",
                        );
                        await notesBody.getByRole("button", {
                            name: "打开笔记：Hidden pane refresh",
                            exact: true,
                        }).waitFor();
                    },
                );
            }

            assertEquals(errors, []);
        } finally {
            await context.close();
        }
    }
});
