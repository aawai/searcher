import { assert, assertEquals, assertThrows } from "@std/assert";
import {
    bandOf,
    canSaveHomeNoteCell,
    cellCapacity,
    type CellRect,
    cellsInDirection,
    cellToPixels,
    composeBlockTop,
    fits,
    freeCells,
    type HomeBlockGeometry,
    homeGridFromBlock,
    intersects,
    nearestFreeCell,
    placeHomeNotes,
    resolveHomeNoteCell,
} from "./home-grid-cells.ts";

/** Search + plate block at the production widths (640 → clamp(40vw) → 880). */
function contentWidth(viewportWidth: number): number {
    return Math.max(640, Math.min(880, viewportWidth * 0.4));
}

/** Home geometry with the 180px note cell, a 56px top bar and a 56px search box. */
function geometry(
    viewportWidth: number,
    viewportHeight: number,
    searchTop: number,
    plateHeight: number | null,
    overrides: Partial<HomeBlockGeometry> = {},
): HomeBlockGeometry {
    const width = contentWidth(viewportWidth);
    const searchBottom = searchTop + 56;
    return {
        left: (viewportWidth - width) / 2,
        width,
        searchTop,
        blockBottom: plateHeight === null
            ? searchBottom
            : searchBottom + 20 + plateHeight,
        topLimit: 56 + 12,
        shelfGap: 20,
        viewportWidth,
        viewportHeight,
        cell: 180,
        gap: 12,
        inset: 32,
        ...overrides,
    };
}

const reference = homeGridFromBlock(geometry(1440, 900, 314, 200));

const s = (band: CellRect["band"], col: number, row: number): CellRect => ({
    band,
    col,
    row,
    cols: 1,
    rows: 1,
});

Deno.test("1440×900 opens one row above the search box and a shelf below the plate", () => {
    assertEquals(reference.bands, [
        { band: "left", columns: [208], top: 314, minRow: -1, maxRow: 2 },
        { band: "right", columns: [1052], top: 314, minRow: -1, maxRow: 2 },
        // Three whole cells centred under the 640px plate, 20px below it.
        {
            band: "center",
            columns: [438, 630, 822],
            top: 610,
            minRow: 0,
            maxRow: 1,
        },
    ]);
    assertEquals(cellCapacity(reference, { cols: 1, rows: 1 }), 9);
    // Only the shelf is wide enough for a W at this width.
    assertEquals(cellCapacity(reference, { cols: 2, rows: 1 }), 1);
});

Deno.test("capacity per viewport: sides above and below the search line plus the shelf", () => {
    const cases = [
        // width, height, search top, plate height, S capacity, W capacity
        [1366, 768, 264, 116, 9, 1],
        [1440, 900, 314, 200, 9, 1],
        [1920, 1080, 382, 200, 20, 10],
    ] as const;
    for (const [width, height, top, plate, small, wide] of cases) {
        const lattice = homeGridFromBlock(
            geometry(width, height, top, plate),
        );
        const label = `${width}x${height}`;
        assertEquals(cellCapacity(lattice, { cols: 1, rows: 1 }), small, label);
        assertEquals(cellCapacity(lattice, { cols: 2, rows: 1 }), wide, label);
        for (const cell of freeCells(lattice, [], [])) {
            const pixels = cellToPixels(cell, lattice);
            assert(pixels.y >= 68, `${label} top bar`);
            assert(pixels.y + pixels.height <= height - 48, `${label} bottom`);
            assert(pixels.x >= 32, `${label} left inset`);
            assert(pixels.x + pixels.width <= width - 32, `${label} right`);
        }
    }
});

Deno.test("rows above the search box stop at the top limit", () => {
    const tight = homeGridFromBlock(
        geometry(1440, 900, 314, 200, { topLimit: 130 }),
    );
    // Row -1 would start at 122, above the 130px limit.
    assertEquals(bandOf(tight, "left")?.minRow, 0);
    const tall = homeGridFromBlock(geometry(1440, 1400, 600, 200));
    assertEquals(bandOf(tall, "left")?.minRow, -2);
});

Deno.test("the shelf follows the plate: a taller plate removes shelf rows", () => {
    const empty = homeGridFromBlock(geometry(1440, 900, 314, 116));
    assertEquals(bandOf(empty, "center")?.maxRow, 1);
    const tall = homeGridFromBlock(geometry(1440, 900, 314, 320));
    assertEquals(bandOf(tall, "center"), undefined);
    // Without a plate the shelf starts below the search box.
    const noPlate = homeGridFromBlock(geometry(1440, 900, 314, null));
    assertEquals(bandOf(noPlate, "center")?.top, 390);
    // The side bands never depend on the plate.
    assertEquals(bandOf(tall, "left"), bandOf(empty, "left"));
});

Deno.test("side spans grow away from the block; shelf spans grow rightward", () => {
    const wide = homeGridFromBlock(geometry(1920, 1080, 382, 200));
    assertEquals(cellToPixels({ ...s("left", 0, 0), cols: 2 }, wide), {
        x: 192,
        y: 382,
        width: 372,
        height: 180,
    });
    assertEquals(cellToPixels({ ...s("right", 0, -1), cols: 2 }, wide), {
        x: 1356,
        y: 190,
        width: 372,
        height: 180,
    });
    assertEquals(cellToPixels({ ...s("center", 1, 0), cols: 2 }, wide), {
        x: 774,
        y: 678,
        width: 372,
        height: 180,
    });
    assertThrows(() => cellToPixels(s("left", 0, 5), wide), RangeError);
});

Deno.test("a span fits only inside one band and its row range", () => {
    assertEquals(fits(s("left", 0, -1), reference), true);
    assertEquals(fits({ ...s("left", 0, 0), cols: 2 }, reference), false);
    assertEquals(fits(s("center", 0, -1), reference), false);
    assertEquals(fits({ ...s("center", 1, 0), cols: 2 }, reference), true);
    assertEquals(fits({ ...s("center", 2, 0), cols: 2 }, reference), false);
    assertEquals(fits(s("right", 0, 2), reference), false);
});

Deno.test("nearest free cell crosses bands by pixel distance", () => {
    const occupied = [s("left", 0, 0), s("left", 0, 1), s("left", 0, -1)];
    // From the full left side the closest free S is the shelf's first cell.
    assertEquals(
        nearestFreeCell(
            { x: 208, y: 506 },
            { cols: 1, rows: 1 },
            reference,
            occupied,
            [],
        ),
        s("center", 0, 0),
    );
    // A W has only shelf origins at 1440; the nearer one wins.
    assertEquals(
        nearestFreeCell(
            { x: 1052, y: 122 },
            { cols: 2, rows: 1 },
            reference,
            [],
            [],
        ),
        { ...s("center", 1, 0), cols: 2 },
    );
    assertEquals(
        nearestFreeCell(
            { x: 0, y: 0 },
            { cols: 2, rows: 1 },
            reference,
            [s("center", 1, 0)],
            [],
        ),
        null,
    );
});

Deno.test("keyboard directions follow the screen, across the block and onto the shelf", () => {
    assertEquals(
        cellsInDirection(s("right", 0, 0), "left", reference)[0],
        s("left", 0, 0),
    );
    assertEquals(
        cellsInDirection(s("left", 0, 1), "up", reference).slice(0, 2),
        [
            s("left", 0, 0),
            s("left", 0, -1),
        ],
    );
    assertEquals(
        cellsInDirection(s("center", 0, 0), "right", reference).slice(0, 2),
        [
            s("center", 1, 0),
            s("center", 2, 0),
        ],
    );
    // At the last side row, Down reaches the shelf diagonally. Up returns
    // from the shelf to a side without entering the plate.
    assertEquals(
        cellsInDirection(s("left", 0, 1), "down", reference)[0],
        s("center", 0, 0),
    );
    assertEquals(
        cellsInDirection(s("center", 0, 0), "up", reference)[0],
        s("left", 0, 1),
    );
});

const homeNote = (
    id: string,
    overrides: Partial<{
        size: "s" | "w";
        band: CellRect["band"] | null;
        col: number | null;
        row: number | null;
    }> = {},
) => ({
    id,
    size: "s" as const,
    band: null,
    col: null,
    row: null,
    ...overrides,
});

const cells = (placed: Array<CellRect & { note: { id: string } }>) =>
    placed.map((
        item,
    ) => [item.note.id, item.band, item.col, item.row, item.cols]);

Deno.test("default notes alternate sides from the search line down, then above it, then the shelf", () => {
    const notes = ["a", "b", "c", "d", "e", "f", "g"].map((id) => homeNote(id));
    const { placed, overflow } = placeHomeNotes(notes, reference);
    assertEquals(overflow, []);
    assertEquals(cells(placed), [
        ["a", "left", 0, 0, 1],
        ["b", "right", 0, 0, 1],
        ["c", "left", 0, 1, 1],
        ["d", "right", 0, 1, 1],
        ["e", "left", 0, -1, 1],
        ["f", "right", 0, -1, 1],
        ["g", "center", 0, 0, 1],
    ]);
});

Deno.test("a W keeps its width on the shelf when neither side has two columns", () => {
    const { placed } = placeHomeNotes(
        [homeNote("w", { size: "w" })],
        reference,
    );
    assertEquals(cells(placed), [["w", "center", 0, 0, 2]]);
    // With the shelf full, it renders as S but keeps its stored tier.
    const crowded = placeHomeNotes([
        homeNote("x", { band: "center", col: 1, row: 0 }),
        homeNote("w", { size: "w" }),
    ], reference);
    assertEquals(cells(crowded.placed)[1], ["w", "left", 0, 0, 1]);
    assertEquals(crowded.placed[1].note.size, "w");
});

Deno.test("a downgraded W drop skips visible S gaps that conflict with its saved width", () => {
    const note = homeNote("wide", { size: "w", band: "left", col: 0, row: 0 });
    const saved = [
        note,
        homeNote("shelf-left", { band: "center", col: 0, row: 0 }),
        homeNote("shelf-right", { band: "center", col: 2, row: 0 }),
    ];
    assertEquals(cells(placeHomeNotes(saved, reference).placed), [
        ["wide", "left", 0, 0, 1],
        ["shelf-left", "center", 0, 0, 1],
        ["shelf-right", "center", 2, 0, 1],
    ]);
    const gap = s("center", 1, 0);
    // Visually one S fits between two S cards, but saving selected size W
    // there would overlap shelf-right and predictably receive server 409.
    assertEquals(canSaveHomeNoteCell(note, gap, saved), false);
    const target = resolveHomeNoteCell(
        note,
        cellToPixels(gap, reference),
        reference,
        [s("center", 0, 0), s("center", 2, 0)],
        [],
        (cell) => canSaveHomeNoteCell(note, cell, saved),
    );
    assert(target);
    assertEquals(target.band, "left");
    assertEquals(target.row, 1);
    assertEquals(canSaveHomeNoteCell(note, target, saved), true);
});

Deno.test("saved cells win over earlier unsaved notes and keep their band across viewports", () => {
    const notes = [
        homeNote("unsaved"),
        homeNote("saved", { band: "left", col: 0, row: 0 }),
        homeNote("outer", { band: "right", col: 1, row: 2 }),
    ];
    const { placed } = placeHomeNotes(notes, reference);
    assertEquals(cells(placed), [
        // The preferred left side is still searched first.
        ["unsaved", "left", 0, 1, 1],
        ["saved", "left", 0, 0, 1],
        // Saved at 1920 (second right column, third row): clamped into the
        // single 1440 column and its last row, still on the right.
        ["outer", "right", 0, 1, 1],
    ]);
});

Deno.test("a saved shelf cell falls back to the default order when the shelf is gone", () => {
    const tall = homeGridFromBlock(geometry(1440, 900, 314, 320));
    const { placed } = placeHomeNotes(
        [homeNote("shelf", { band: "center", col: 2, row: 0 })],
        tall,
    );
    assertEquals(cells(placed), [["shelf", "left", 0, 0, 1]]);
});

Deno.test("notes beyond the free cells are overflow and placed notes avoid obstacles", () => {
    const calm = { x: 400, y: 100, width: 640, height: 200 };
    const notes = Array.from(
        { length: 11 },
        (_, index) => homeNote(`n${index}`),
    );
    const { placed, overflow } = placeHomeNotes(notes, reference, {
        obstacles: [calm, { x: 1052, y: 120, width: 10, height: 10 }],
    });
    // Nine cells minus the right cell above the search box.
    assertEquals(placed.length, 8);
    assertEquals(overflow.map((note) => note.id), ["n8", "n9", "n10"]);
    for (const item of placed) {
        assert(!intersects(cellToPixels(item, reference), calm), item.note.id);
    }
});

Deno.test("composition keeps the 38% anchor unless the lower third is requested", () => {
    const base = {
        viewportHeight: 900,
        searchHeight: 56,
        blockHeight: 380,
    };
    assertEquals(composeBlockTop(base), 314);
    assertEquals(composeBlockTop({ ...base, lowerThird: true }), 472);
    assertEquals(
        composeBlockTop({ ...base, lowerThird: true, minTop: 300 }),
        472,
    );
    assertEquals(
        composeBlockTop({ ...base, blockHeight: 900, minTop: 72 }),
        72,
    );
});

Deno.test("asymmetric dock limits drop only the overlapping side band and preserve saved coordinates", () => {
    // 1096x900: 640px block is at x = 228..868; left col 0 is x = 36..216,
    // right col 0 is x = 880..1060. A 68px left dock sets leftLimit = 100.
    const leftDocked = homeGridFromBlock(
        geometry(1096, 900, 314, 200, {
            leftLimit: 32 + 68,
            rightLimit: 1096 - 32,
        }),
    );
    assertEquals(bandOf(leftDocked, "left"), undefined);
    assertEquals(bandOf(leftDocked, "right")?.columns, [880]);

    const rightDocked = homeGridFromBlock(
        geometry(1096, 900, 314, 200, {
            leftLimit: 32,
            rightLimit: 1096 - 32 - 68,
        }),
    );
    assertEquals(bandOf(rightDocked, "left")?.columns, [36]);
    assertEquals(bandOf(rightDocked, "right"), undefined);

    const savedLeft = homeNote("left-note", { band: "left", col: 0, row: 0 });
    const { placed } = placeHomeNotes([savedLeft], leftDocked);
    assertEquals(cells(placed), [["left-note", "right", 0, 0, 1]]);
    assertEquals(savedLeft.band, "left");
    assertEquals(savedLeft.col, 0);
    assertEquals(savedLeft.row, 0);
});
