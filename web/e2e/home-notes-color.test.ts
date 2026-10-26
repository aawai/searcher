import { assertEquals } from "@std/assert";
import {
    createHomeNote,
    homeNote,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";

Deno.test("legacy note colours survive task edits and home size changes without a home colour menu", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        const note = await createHomeNote(page, {
            title: "保留原有颜色",
            body: "- [ ] 买咖啡豆",
            color: "sage",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const card = homeNote(page, "保留原有颜色");
        await Promise.all([
            page.waitForResponse((response) =>
                response.request().method() === "PATCH" &&
                response.url().endsWith(`/api/documents/${note.id}`) &&
                response.ok()
            ),
            card.getByRole("checkbox").click(),
        ]);
        await card.getByRole("button", { name: "更多操作" }).focus();
        await page.keyboard.press("Enter");
        assertEquals(
            await page.getByRole("menuitemradio").allTextContents(),
            ["小", "宽"],
        );
        const saved = page.waitForResponse((response) =>
            response.request().method() === "PATCH" &&
            response.url().endsWith("/api/documents/layouts") &&
            response.ok()
        );
        await page.getByRole("menuitemradio", { name: "宽", exact: true })
            .click();
        await saved;
        await reloadHome(page);
        const document = await page.evaluate(
            async (id) =>
                (await (await fetch(`/api/documents/${id}`)).json()).data,
            note.id,
        );
        assertEquals(document.color, "sage");
        assertEquals(document.body, "- [x] 买咖啡豆");
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
