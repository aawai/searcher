import { assert, assertEquals } from "@std/assert";
import {
    createHomeNote,
    homeNote,
    measureHomeNotes,
    openHomeNotesFixture,
    reloadHome,
    seedHomeApps,
    waitForNoteCards,
} from "./helpers/home-notes.ts";
import { libraryPanel } from "./helpers/library.ts";

const BODY = "首页顺序决定单元落点，不按创建时间排列。";

Deno.test("home notes follow homeSortOrder, alternate sides and leave the search usable", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        await seedHomeApps(page);
        for (
            const [title, order] of [
                ["顺序 3", 3],
                ["顺序 1", 1],
                ["顺序 0", 0],
                ["顺序 2", 2],
            ] as const
        ) {
            await createHomeNote(page, {
                title,
                body: BODY,
                homeSortOrder: order,
            });
        }
        await reloadHome(page);
        await waitForNoteCards(page, 4);
        const metrics = await measureHomeNotes(page);
        assertEquals(metrics.cards.map((card) => card.title), [
            "顺序 0",
            "顺序 1",
            "顺序 2",
            "顺序 3",
        ]);
        const midpoint = 1440 / 2;
        assertEquals(
            metrics.cards.map((card) => card.x < midpoint),
            [true, false, true, false],
        );

        // The note overlay is inert outside its cards: the search stays usable.
        await page.locator("#search-query").click();
        assertEquals(
            await page.evaluate(() =>
                document.activeElement?.id === "search-query"
            ),
            true,
        );

        // The whole card opens the note; the title stays the labelled control.
        const third = homeNote(page, "顺序 2");
        await third.locator(".home-note-body").click({
            position: { x: 10, y: 10 },
        });
        await libraryPanel(page).waitFor();
        await page.getByRole("button", { name: "关闭资料库", exact: true })
            .click();
        await libraryPanel(page).waitFor({ state: "detached" });
        await third.getByRole("button", { name: "顺序 2", exact: true })
            .click();
        await libraryPanel(page).waitFor();

        // Close the library and add three notes: the last one overflows.
        await page.getByRole("button", { name: "关闭资料库", exact: true })
            .click();
        await libraryPanel(page).waitFor({ state: "detached" });
        for (let index = 4; index < 7; index++) {
            await createHomeNote(page, {
                title: `顺序 ${index}`,
                body: BODY,
                homeSortOrder: index,
            });
        }
        await reloadHome(page);
        await waitForNoteCards(page, 6);
        const overflow = await measureHomeNotes(page);
        assertEquals(overflow.cards.length, 6);
        assertEquals(overflow.more.text, "更多笔记（1）");
        assert(
            await page.locator(".home-note-title", { hasText: "顺序 6" })
                .count() === 0,
        );
    } finally {
        await fixture.close();
    }
});
