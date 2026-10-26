import { assert, assertEquals } from "@std/assert";
import {
    assertNoIntersections,
    captureLayoutWrites,
    countLayoutPatches,
    createHomeNote,
    dragWithMouse,
    dragWithTouch,
    expectLayout,
    layoutPatch,
    measureHomeNotes,
    noteCard,
    openHomeNotesFixture,
    reloadHome,
    seedHomeApps,
    waitForNoteCards,
} from "./helpers/home-notes.ts";

const BODY = "拖动后吸附到最近的空闲单元，刷新页面仍然保持。";

Deno.test("mouse drag previews the target cell, snaps on drop and persists after reload", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        await seedHomeApps(page);
        const first = await createHomeNote(page, {
            title: "第一张",
            body: BODY,
            homeSortOrder: 0,
            band: "left",
            col: 0,
            row: 0,
        });
        await createHomeNote(page, {
            title: "第二张",
            body: BODY,
            homeSortOrder: 1,
            band: "right",
            col: 0,
            row: 0,
        });
        await reloadHome(page);
        await waitForNoteCards(page, 2);

        const card = noteCard(page, "第一张");
        const box = await card.boundingBox();
        assert(box);
        const saved = layoutPatch(page);
        await page.mouse.move(box.x + 8, box.y + box.height - 8);
        await page.mouse.down();
        await page.mouse.move(box.x + 8 + 6, box.y + box.height - 8 + 6);
        await page.locator('.home-note[data-dragging="true"]').waitFor();
        // Free cells appear as soon as the drag starts, before the preview.
        await page.locator(".home-note-slot").first().waitFor();
        await page.mouse.move(
            box.x + 8 + 844,
            box.y + box.height - 8 + 192,
            { steps: 8 },
        );
        await page.locator(".home-note-target").waitFor();
        const preview = await page.locator(".home-note-target").boundingBox();
        assert(preview);
        assertEquals(Math.round(preview.x), 1052);
        assertEquals(Math.round(preview.y), 506);
        await page.mouse.up();
        await saved;
        await expectLayout(page, first.id, {
            band: "right",
            col: 0,
            row: 1,
            size: "s",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 2);
        await page.waitForFunction((id) => {
            const rect = document.querySelector(
                `.home-note[data-note-id="${id}"]`,
            )?.getBoundingClientRect();
            return Math.round(rect?.x ?? 0) === 1052 &&
                Math.round(rect?.y ?? 0) === 506;
        }, first.id);
        const metrics = await measureHomeNotes(page);
        const placed = metrics.cards.find((entry) => entry.title === "第一张");
        assert(placed);
        assertEquals(Math.round(placed.x), 1052);
        assertEquals(Math.round(placed.y), 506);
    } finally {
        await fixture.close();
    }
});

Deno.test("dragging onto a full same-size cell swaps both notes in one atomic PATCH", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        await seedHomeApps(page);
        const first = await createHomeNote(page, {
            title: "第一张",
            body: BODY,
            band: "left",
            col: 0,
            row: 0,
        });
        const second = await createHomeNote(page, {
            title: "第二张",
            body: BODY,
            homeSortOrder: 1,
            band: "right",
            col: 0,
            row: 0,
        });
        await reloadHome(page);
        await waitForNoteCards(page, 2);

        const patches = countLayoutPatches(page);
        const writes = captureLayoutWrites(page);
        const saved = layoutPatch(page);
        await dragWithMouse(page, noteCard(page, "第一张"), 844, 0);
        await saved;

        assertEquals(patches.count(), 1, "a swap is exactly one request");
        assertEquals(writes.writes().length, 1);
        const [write] = writes.writes();
        assertEquals(write.items.length, 2, "the swap writes both notes");
        assertEquals(
            write.items.map((item) => item.id).sort(),
            [first.id, second.id].sort(),
        );
        assertEquals(
            write.items.find((item) => item.id === first.id),
            { id: first.id, band: "right", col: 0, row: 0, size: "s" },
        );
        assertEquals(
            write.items.find((item) => item.id === second.id),
            { id: second.id, band: "left", col: 0, row: 0, size: "s" },
        );

        await expectLayout(page, first.id, {
            band: "right",
            col: 0,
            row: 0,
            size: "s",
        });
        await expectLayout(page, second.id, {
            band: "left",
            col: 0,
            row: 0,
            size: "s",
        });

        await reloadHome(page);
        await waitForNoteCards(page, 2);
        await page.waitForFunction((id) => {
            const rect = document.querySelector(
                `.home-note[data-note-id="${id}"]`,
            )?.getBoundingClientRect();
            return Math.round(rect?.x ?? 0) === 1052;
        }, first.id);
        const metrics = await measureHomeNotes(page);
        assertNoIntersections(metrics);
        const byTitle = new Map(
            metrics.cards.map((card) => [card.title, card]),
        );
        const moved = byTitle.get("第一张");
        const swapped = byTitle.get("第二张");
        assert(moved && swapped);
        assert(moved.x > 1440 / 2, "the dragged note keeps the right cell");
        assert(swapped.x < 1440 / 2, "the swapped note keeps the left cell");
    } finally {
        await fixture.close();
    }
});

Deno.test("touch drag waits for the long-press sensor and snaps to a cell", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
        hasTouch: true,
    });
    const { page } = fixture;
    try {
        await seedHomeApps(page);
        const note = await createHomeNote(page, {
            title: "触屏笔记",
            body: BODY,
            band: "left",
            col: 0,
            row: 0,
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const saved = layoutPatch(page);
        await dragWithTouch(page, noteCard(page, "触屏笔记"), 852, 200);
        await saved;
        await expectLayout(page, note.id, {
            band: "right",
            col: 0,
            row: 1,
            size: "s",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        await page.waitForFunction((id) => {
            const rect = document.querySelector(
                `.home-note[data-note-id="${id}"]`,
            )?.getBoundingClientRect();
            return Math.round(rect?.x ?? 0) === 1052 &&
                Math.round(rect?.y ?? 0) === 514;
        }, note.id);
        const placed = (await measureHomeNotes(page)).cards[0];
        assertEquals(Math.round(placed.x), 1052);
        assertEquals(Math.round(placed.y), 514);
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
        await seedHomeApps(page);
        const note = await createHomeNote(page, {
            title: "尺寸笔记",
            body: BODY,
            band: "left",
            col: 0,
            row: 0,
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const card = noteCard(page, "尺寸笔记");
        assertEquals(Math.round((await card.boundingBox())!.width), 180);
        await card.hover();
        await card.locator('[aria-label="更多操作"]').click();
        const saved = layoutPatch(page);
        await page.getByRole("menuitemradio", { name: "宽", exact: true })
            .click();
        await saved;
        await expectLayout(page, note.id, {
            band: "left",
            col: 0,
            row: 0,
            size: "w",
        });
        await page.waitForFunction(() =>
            document.querySelector(".home-note-card")
                ?.getAttribute("data-size") === "w"
        );
        const wide = await card.boundingBox();
        assert(wide);
        assertEquals(Math.round(wide.width), 372);
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const reloaded = await card.boundingBox();
        assert(reloaded);
        assertEquals(Math.round(reloaded.width), 372);
    } finally {
        await fixture.close();
    }
});

Deno.test("a W drag lands on the centre shelf with two cells", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1920, height: 1080 },
    });
    const { page } = fixture;
    try {
        await seedHomeApps(page);
        const note = await createHomeNote(page, {
            title: "宽笔记",
            body: BODY,
            size: "w",
            band: "left",
            col: 0,
            row: 0,
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const card = noteCard(page, "宽笔记");
        assertEquals(Math.round((await card.boundingBox())!.width), 372);
        const plate = await page.locator(".launcher-plate").boundingBox();
        assert(plate);

        const box = await card.boundingBox();
        assert(box);
        const x = box.x + 8;
        const y = box.y + box.height - 8;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 6, y + 6);
        await page.locator('.home-note[data-dragging="true"]').waitFor();
        await page.locator(".home-note-slot").first().waitFor();
        const slots = await page.locator(".home-note-slot").evaluateAll(
            (
                elements,
                bounds: { x: number; y: number; width: number; height: number },
            ) => elements.map((element) => {
                const rect = element.getBoundingClientRect();
                return { x: rect.x, y: rect.y };
            }).filter((slot) =>
                slot.y > bounds.y + bounds.height + 8 &&
                slot.x >= bounds.x &&
                slot.x < bounds.x + bounds.width
            ),
            plate,
        );
        slots.sort((a, b) => a.y - b.y || a.x - b.x);
        const target = slots[0];
        assert(target, "the centre shelf exposes a free slot");

        const saved = layoutPatch(page);
        await page.mouse.move(
            x + (target.x - box.x),
            y + (target.y - box.y),
            { steps: 8 },
        );
        await page.locator(".home-note-target").waitFor();
        const preview = await page.locator(".home-note-target").boundingBox();
        assert(preview);
        assertEquals(Math.round(preview.x), Math.round(target.x));
        assertEquals(Math.round(preview.y), Math.round(target.y));
        await page.mouse.up();
        await saved;
        await expectLayout(page, note.id, {
            band: "center",
            col: 0,
            row: 0,
            size: "w",
        });

        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const settled = await page.locator(
            `.home-note[data-note-id="${note.id}"]`,
        ).boundingBox();
        assert(settled);
        assertEquals(Math.round(settled.x), Math.round(target.x));
        assertEquals(Math.round(settled.y), Math.round(target.y));
        assertEquals(Math.round(settled.width), 372);
        assert(settled.y >= plate.y + plate.height);
    } finally {
        await fixture.close();
    }
});
