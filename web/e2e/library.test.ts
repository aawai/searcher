import { assert, assertEquals } from "@std/assert";
import type { Locator, Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import {
    assertInteractiveHome,
    closeLibrary,
    libraryEntry,
    libraryMenuTrigger,
    libraryPanel,
    libraryView,
    openLibrary,
} from "./helpers/library.ts";

async function assertFocus(target: Locator) {
    await target.page().waitForFunction(
        (element) => document.activeElement === element,
        await target.elementHandle(),
    );
}

async function assertHeaderFocus(page: Page) {
    // Query on every poll: the header may remount while the view settles,
    // so a captured element handle can go stale.
    await page.waitForFunction(() =>
        document.querySelector("[data-library] .workspace-header")
            ?.contains(document.activeElement) === true
    );
}

Deno.test("Library: seven home entries, responsive presentation, unchanged home and focus #285", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const browser = await chromium.launch({ headless: true });
    cleanup.defer(() => browser.close());

    await t.step("guests cannot open the library", async () => {
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
            username: `library_entries_${width}`,
            password: "Library-entries-password-285!",
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
                        title: `资料库入口 ${width}`,
                        body: "入口回归正文",
                        isHomeFixed: true,
                    },
                },
            );
            assert(created.ok(), await created.text());
            const title = `资料库入口 ${width}`;
            const search = page.locator("#search-query");
            const entries: {
                name: string;
                view: "root" | "notes";
                open: () => Promise<unknown>;
                focus: () => Locator;
            }[] = [
                {
                    name: "avatar menu",
                    view: "root",
                    open: () => openLibrary(page),
                    focus: () => libraryMenuTrigger(page),
                },
                {
                    name: "empty search shortcut",
                    view: "root",
                    open: async () => {
                        await search.focus();
                        await page.getByRole("option", {
                            name: "资料库",
                            exact: true,
                        }).click();
                    },
                    focus: () => search,
                },
                {
                    name: "Mod+.",
                    view: "root",
                    open: async () => {
                        await search.focus();
                        await search.press("Control+.");
                    },
                    focus: () => search,
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
                    await assertHeaderFocus(page);
                    assertEquals(
                        await libraryPanel(page).getAttribute(
                            "data-presentation",
                        ),
                        width < 768 ? "sheet" : "panel",
                    );
                    if (
                        entry.name === "home note" ||
                        entry.name === "continue" ||
                        entry.name === "note suggestion"
                    ) {
                        await libraryPanel(page).getByRole("textbox", {
                            name: "笔记标题",
                            exact: true,
                        }).waitFor();
                        assertEquals(
                            await libraryPanel(page).getByRole("textbox", {
                                name: "笔记标题",
                                exact: true,
                            }).inputValue(),
                            title,
                        );
                    }
                    if (width >= 768) {
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
                    } else {
                        await libraryPanel(page).and(page.getByRole("dialog"))
                            .waitFor();
                    }
                    await closeLibrary(page);
                    await assertFocus(entry.focus());
                });
            }
            await t.step(
                `${width}: Escape unwinds nested views and root; restores opener`,
                async () => {
                    await page.goto(app.origin + "/");
                    await openLibrary(page);
                    for (
                        const view of [
                            "notes",
                            "conversations",
                            "apps",
                        ] as const
                    ) {
                        await libraryEntry(page, view).click();
                        await libraryView(page, view).waitFor();
                        await libraryPanel(page).getByRole("button", {
                            name: "返回资料库",
                            exact: true,
                        }).focus();
                        await page.keyboard.press("Escape");
                        await libraryView(page, "root").waitFor();
                    }
                    await page.keyboard.press("Escape");
                    await libraryPanel(page).waitFor({ state: "detached" });
                    await assertFocus(libraryMenuTrigger(page));
                },
            );
            assertEquals(errors, []);
        } finally {
            await context.close();
        }
    }
});
