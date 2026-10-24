import { assert, assertEquals } from "@std/assert";
import {
    createHomeNote,
    measureHomeNotes,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";
import { libraryPanel, libraryView } from "./helpers/library.ts";

const BODY = "超出容量的笔记收进更多笔记，入口不得与搜索框或底板相交。";

Deno.test("overflow notes collapse into 更多笔记（N） and open the notes library", async (t) => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        for (let index = 0; index < 4; index++) {
            await createHomeNote(page, {
                title: `容量内 ${index}`,
                body: BODY,
                homeSortOrder: index,
            });
        }
        await reloadHome(page);
        await waitForNoteCards(page, 4);

        await t.step("four notes fit without an entry", async () => {
            const metrics = await measureHomeNotes(page);
            assertEquals(metrics.cards.length, 4);
            assertEquals(metrics.more.mode, null);
            assertEquals(metrics.more.text, null);
        });

        await t.step(
            "eight notes keep four notes and a 更多笔记 (4) pill",
            async () => {
                for (let index = 4; index < 8; index++) {
                    await createHomeNote(page, {
                        title: `溢出 ${index}`,
                        body: BODY,
                        homeSortOrder: index,
                    });
                }
                await reloadHome(page);
                await waitForNoteCards(page, 4);
                const metrics = await measureHomeNotes(page);
                assertEquals(metrics.cards.length, 4);
                assertEquals(metrics.more.mode, "pill");
                assertEquals(metrics.more.text, "更多笔记（4）");
                assert(metrics.plate, "plate is measurable");
                const more = await page.locator(".home-note-more")
                    .boundingBox();
                assert(more);
                assert(
                    more.y >= metrics.plate.y + metrics.plate.height,
                    "the pill sits below the plate",
                );
                const search = metrics.search;
                assert(
                    !(more.x < search.x + search.width &&
                        more.x + more.width > search.x &&
                        more.y < search.y + search.height &&
                        more.y + more.height > search.y),
                    "the pill clears the search box",
                );
                await page.locator(".home-note-more").click();
                await libraryPanel(page).waitFor();
                await libraryView(page, "notes").waitFor();
            },
        );

        await t.step(
            "the mobile stack shows every note without an entry",
            async () => {
                await page.setViewportSize({ width: 390, height: 844 });
                await reloadHome(page);
                await waitForNoteCards(page, 8);
                const metrics = await measureHomeNotes(page);
                assertEquals(metrics.flow, "stack");
                assertEquals(metrics.cards.length, 8);
                assertEquals(metrics.more.mode, null);
            },
        );
    } finally {
        await fixture.close();
    }
});
