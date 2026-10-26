import { assert, assertEquals } from "@std/assert";
import {
    createHomeNote,
    homeNote,
    openHomeNotesFixture,
    reloadHome,
    seedHomeApps,
    waitForNoteCards,
} from "./helpers/home-notes.ts";

for (const colorScheme of ["light", "dark"] as const) {
    Deno.test(`home note colour tints the card and persists in ${colorScheme}`, async () => {
        const fixture = await openHomeNotesFixture({
            viewport: { width: 1920, height: 1080 },
            colorScheme,
        });
        const { page } = fixture;
        try {
            await seedHomeApps(page);
            const colors = [
                ["paper", "纸白"],
                ["amber", "琥珀"],
                ["rose", "玫瑰"],
                ["sage", "鼠尾草"],
                ["sky", "天空"],
            ] as const;
            for (const [color] of colors) {
                await createHomeNote(page, {
                    title: `颜色 ${color}`,
                    body: "正文保持不变",
                    color,
                    homeSortOrder: colors.findIndex(([key]) => key === color),
                });
            }
            await reloadHome(page);
            await waitForNoteCards(page, 5);
            const backgrounds = new Map<string, string>();
            for (const [key, name] of colors) {
                const note = homeNote(page, `颜色 ${key}`);
                const background = await note.locator(".home-note-card")
                    .evaluate(
                        (element) => getComputedStyle(element).backgroundColor,
                    );
                assert(
                    ![...backgrounds.values()].includes(background),
                    `${key} must have its own card background in ${colorScheme}`,
                );
                backgrounds.set(key, background);
                const trigger = note.getByRole("button", {
                    name: "更多操作",
                    exact: true,
                });
                await trigger.focus();
                await trigger.press("Enter");
                assertEquals(
                    await page.getByRole("menuitemradio", {
                        name,
                        exact: true,
                    }).getAttribute("aria-checked"),
                    "true",
                );
                await page.keyboard.press("Escape");
                await page.getByRole("menu").waitFor({ state: "detached" });
                assertEquals(
                    await trigger.evaluate((el) =>
                        el === document.activeElement
                    ),
                    true,
                );
            }

            const target = homeNote(page, "颜色 paper");
            const trigger = target.getByRole("button", {
                name: "更多操作",
                exact: true,
            });
            await target.hover();
            await trigger.click();
            const saved = page.waitForResponse((response) =>
                response.request().method() === "PATCH" &&
                /\/api\/documents\/[^/]+$/.test(
                    new URL(response.url()).pathname,
                ) &&
                response.ok()
            );
            await page.getByRole("menuitemradio", {
                name: "鼠尾草",
                exact: true,
            })
                .click();
            await saved;
            await page.getByRole("menu").waitFor({ state: "detached" });
            assertEquals(
                await target.locator(".home-note-card").evaluate(
                    (element) => getComputedStyle(element).backgroundColor,
                ),
                backgrounds.get("sage"),
            );
            await reloadHome(page);
            await waitForNoteCards(page, 5);
            const reloaded = homeNote(page, "颜色 paper");
            assertEquals(
                await reloaded.locator(".home-note-card").evaluate(
                    (element) => getComputedStyle(element).backgroundColor,
                ),
                backgrounds.get("sage"),
            );
            await reloaded.getByRole("button", {
                name: "更多操作",
                exact: true,
            })
                .focus();
            await page.keyboard.press("Enter");
            const restored = page.waitForResponse((response) =>
                response.request().method() === "PATCH" &&
                /\/api\/documents\/[^/]+$/.test(
                    new URL(response.url()).pathname,
                ) &&
                response.ok()
            );
            await page.getByRole("menuitemradio", { name: "纸白", exact: true })
                .click();
            await restored;
            assertEquals(
                await reloaded.locator(".home-note-card").evaluate(
                    (element) => getComputedStyle(element).backgroundColor,
                ),
                backgrounds.get("paper"),
            );
        } finally {
            await fixture.close();
        }
    });
}

Deno.test("changing colour does not move a note or create a saved cell", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        const note = await createHomeNote(page, {
            title: "菜单不移动笔记",
            body: "保持默认落点",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const card = homeNote(page, "菜单不移动笔记");
        const before = await card.boundingBox();
        assert(before);
        await card.hover();
        await card.getByRole("button", { name: "更多操作", exact: true })
            .click();
        const changed = page.waitForResponse((response) =>
            response.request().method() === "PATCH" &&
            response.url().endsWith(`/api/documents/${note.id}`)
        );
        await page.getByRole("menuitemradio", { name: "鼠尾草", exact: true })
            .click();
        assertEquals((await changed).ok(), true);
        await page.getByRole("menu").waitFor({ state: "detached" });
        const saved = await page.evaluate(async (id) => {
            const document = (await (await fetch(`/api/documents/${id}`))
                .json()).data;
            const layout = (await (await fetch(`/api/documents/${id}/layout`))
                .json()).data;
            return {
                color: document.color,
                band: layout?.band ?? null,
                col: layout?.col ?? null,
                row: layout?.row ?? null,
            };
        }, note.id);
        assertEquals(saved, {
            color: "sage",
            band: null,
            col: null,
            row: null,
        });
        const after = await card.boundingBox();
        assert(after);
        assertEquals(Math.round(after.x), Math.round(before.x));
        assertEquals(Math.round(after.y), Math.round(before.y));
    } finally {
        await fixture.close();
    }
});

Deno.test("unpin removes the note from home", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        const note = await createHomeNote(page, {
            title: "取消固定的笔记",
            body: "移出首页后不再呈现。",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const card = homeNote(page, "取消固定的笔记");
        await card.hover();
        await card.getByRole("button", { name: "更多操作", exact: true })
            .click();
        const changed = page.waitForResponse((response) =>
            response.request().method() === "PATCH" &&
            response.url().endsWith(`/api/documents/${note.id}`)
        );
        await page.getByRole("menuitem", { name: "移出首页", exact: true })
            .click();
        assertEquals((await changed).ok(), true);
        await page.waitForFunction(() =>
            document.querySelectorAll(".home-note-card").length === 0
        );
        const pinned = await page.evaluate(async (id) => {
            const document = (await (await fetch(`/api/documents/${id}`))
                .json()).data;
            return document.isHomeFixed as boolean;
        }, note.id);
        assertEquals(pinned, false);
    } finally {
        await fixture.close();
    }
});
