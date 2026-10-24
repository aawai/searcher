import { assert, assertEquals } from "@std/assert";
import {
    createHomeNote,
    dragWithMouse,
    dragWithTouch,
    expectLayout,
    homeNote,
    layoutPatch,
    measureHomeNotes,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";

const BODY = "拖动后吸附到最近的空闲单元，刷新页面仍然保持。";

Deno.test("mouse drag previews the target cell, snaps on drop and persists after reload", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        const first = await createHomeNote(page, {
            title: "第一张",
            body: BODY,
            homeSortOrder: 0,
            col: 0,
            row: 0,
        });
        await createHomeNote(page, {
            title: "第二张",
            body: BODY,
            homeSortOrder: 1,
            col: 1,
            row: 0,
        });
        await reloadHome(page);
        await waitForNoteCards(page, 2);

        await homeNote(page, "第一张").hover();
        const handle = homeNote(page, "第一张")
            .locator(".home-note-drag-handle");
        const box = await handle.boundingBox();
        assert(box);
        await page.mouse.move(
            box.x + box.width / 2,
            box.y + box.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(
            box.x + box.width / 2 + 844,
            box.y + box.height / 2 + 192,
            { steps: 8 },
        );
        await page.locator(".home-note-target").waitFor();
        const preview = await page.locator(".home-note-target").boundingBox();
        assert(preview);
        assertEquals(Math.round(preview.x), 1052);
        assertEquals(Math.round(preview.y), 506);
        const saved = layoutPatch(page);
        await page.mouse.up();
        await saved;
        await expectLayout(page, first.id, { col: 1, row: 1, size: "s" });
        await reloadHome(page);
        await waitForNoteCards(page, 2);
        const metrics = await measureHomeNotes(page);
        const placed = metrics.cards.find((card) => card.title === "第一张");
        assert(placed);
        assertEquals(Math.round(placed.x), 1052);
        assertEquals(Math.round(placed.y), 506);
    } finally {
        await fixture.close();
    }
});

Deno.test("dropping on an occupied cell shifts to the nearest free cell", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        const first = await createHomeNote(page, {
            title: "第一张",
            body: BODY,
            col: 0,
            row: 0,
        });
        await createHomeNote(page, {
            title: "第二张",
            body: BODY,
            homeSortOrder: 1,
            col: 1,
            row: 0,
        });
        await reloadHome(page);
        await waitForNoteCards(page, 2);
        await homeNote(page, "第一张").hover();
        const saved = layoutPatch(page);
        await dragWithMouse(
            page,
            homeNote(page, "第一张").locator(".home-note-drag-handle"),
            844,
            0,
        );
        await saved;
        await expectLayout(page, first.id, { col: 1, row: 1, size: "s" });
        const metrics = await measureHomeNotes(page);
        assertEquals(metrics.cards.length, 2);
        assertEquals(
            metrics.cards.map((card) => card.title).sort(),
            ["第一张", "第二张"],
        );
        const [a, b] = metrics.cards;
        assert(
            !(a.x < b.x + b.width && a.x + a.width > b.x &&
                a.y < b.y + b.height && a.y + a.height > b.y),
            "conflicting notes must not overlap",
        );
    } finally {
        await fixture.close();
    }
});

Deno.test("touch drag snaps to a cell", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
        hasTouch: true,
    });
    const { page } = fixture;
    try {
        const note = await createHomeNote(page, {
            title: "触屏笔记",
            body: BODY,
            col: 0,
            row: 0,
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const saved = layoutPatch(page);
        await dragWithTouch(
            page,
            homeNote(page, "触屏笔记").locator(".home-note-drag-handle"),
            844,
            192,
        );
        await saved;
        await expectLayout(page, note.id, { col: 1, row: 1, size: "s" });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const placed = (await measureHomeNotes(page)).cards[0];
        assertEquals(Math.round(placed.x), 1052);
        assertEquals(Math.round(placed.y), 506);
    } finally {
        await fixture.close();
    }
});

Deno.test("the note menu switches between S and W and persists the tier", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1920, height: 1080 },
    });
    const { page } = fixture;
    try {
        const note = await createHomeNote(page, {
            title: "尺寸笔记",
            body: BODY,
            col: 0,
            row: 0,
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const card = homeNote(page, "尺寸笔记").locator(".home-note-card");
        assertEquals(Math.round((await card.boundingBox())!.width), 180);
        await card.hover();
        await card.locator('[aria-label="更多操作"]').click();
        const saved = layoutPatch(page);
        await page.getByRole("menuitemradio", { name: "宽", exact: true })
            .click();
        await saved;
        await expectLayout(page, note.id, { col: 0, row: 0, size: "w" });
        await page.waitForFunction(() =>
            document.querySelector(".home-note-card")
                ?.getAttribute("data-size") === "w"
        );
        const wide = await homeNote(page, "尺寸笔记").boundingBox();
        assert(wide);
        assertEquals(Math.round(wide.width), 372);
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const reloaded = await homeNote(page, "尺寸笔记").boundingBox();
        assert(reloaded);
        assertEquals(Math.round(reloaded.width), 372);
    } finally {
        await fixture.close();
    }
});
