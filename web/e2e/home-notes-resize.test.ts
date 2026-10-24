import { assertEquals } from "@std/assert";
import {
    countLayoutPatches,
    createHomeNote,
    expectLayout,
    homeNote,
    measureHomeNotes,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";

Deno.test("resizing folds columns without losing notes or writing to the server", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1920, height: 1080 },
    });
    const { page } = fixture;
    try {
        const note = await createHomeNote(page, {
            title: "折回笔记",
            body: "窗口变窄时按列折回，不写回服务器。",
            col: 2,
            row: 0,
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const patches = countLayoutPatches(page);

        await page.setViewportSize({ width: 1440, height: 900 });
        await waitForNoteCards(page, 1);
        await page.waitForFunction(() =>
            document.querySelector(".home-note")?.getBoundingClientRect().x ===
                1052
        );
        let metrics = await measureHomeNotes(page);
        assertEquals(metrics.cards.length, 1);
        assertEquals(Math.round(metrics.cards[0].x), 1052);
        assertEquals(metrics.cards[0].title, "折回笔记");

        await page.setViewportSize({ width: 1024, height: 768 });
        await waitForNoteCards(page, 1);
        metrics = await measureHomeNotes(page);
        assertEquals(metrics.flow, "flow");
        assertEquals(metrics.cards.length, 1);

        await page.setViewportSize({ width: 768, height: 1024 });
        await waitForNoteCards(page, 1);
        metrics = await measureHomeNotes(page);
        assertEquals(metrics.flow, "flow");
        assertEquals(metrics.cards.length, 1);

        await page.setViewportSize({ width: 390, height: 844 });
        await waitForNoteCards(page, 1);
        metrics = await measureHomeNotes(page);
        assertEquals(metrics.flow, "stack");
        assertEquals(metrics.cards.length, 1);
        assertEquals(Math.round(metrics.cards[0].width), 358);

        await page.setViewportSize({ width: 1440, height: 900 });
        await waitForNoteCards(page, 1);
        await homeNote(page, "折回笔记").waitFor();
        metrics = await measureHomeNotes(page);
        assertEquals(metrics.cards.length, 1);
        assertEquals(Math.round(metrics.cards[0].x), 1052);

        assertEquals(patches.count(), 0);
        await expectLayout(page, note.id, { col: 2, row: 0, size: "s" });
    } finally {
        await fixture.close();
    }
});
