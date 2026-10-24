import { assert, assertEquals } from "@std/assert";
import {
    cellCapacity,
    type CellGrid,
    type CellRect,
    cellToPixels,
    composeBlockTop,
    fits,
    foldColumns,
    freeCells,
    homeGridFromBlock,
    intersects,
    isFree,
    nearestFreeCell,
    pitch,
    pixelsToCell,
    placeHomeNotes,
} from "./home-grid-cells.ts";

/**
 * Synthetic 84px lattice for the generic conversions. Twelve columns keep the
 * span, collision and fold cases independent of the note footprint.
 */
const grid: CellGrid = {
    columns: [
        { x: 84, band: "left" },
        { x: 180, band: "left" },
        { x: 276, band: "left" },
        { x: 1024, band: "right" },
        { x: 1120, band: "right" },
        { x: 1216, band: "right" },
    ],
    top: 264,
    rows: 4,
    cell: 84,
    gap: 12,
};

const block = { x: 372, y: 264, width: 640, height: 380 };

const cell = (overrides: Partial<CellRect> = {}): CellRect => ({
    col: 0,
    row: 0,
    cols: 1,
    rows: 1,
    ...overrides,
});

/** Home geometry with the 180px note cell (2 app cells + one gap). */
function contentWidth(viewportWidth: number): number {
    return Math.max(640, Math.min(880, viewportWidth * 0.4));
}

function noteGrid(
    viewportWidth: number,
    viewportHeight: number,
    top: number,
    width = contentWidth(viewportWidth),
): CellGrid {
    return homeGridFromBlock({
        left: (viewportWidth - width) / 2,
        width,
        top,
        viewportWidth,
        viewportHeight,
        cell: 180,
        gap: 12,
        inset: 32,
    });
}

Deno.test("cell spans convert to pixels from their column and row origins", () => {
    assertEquals(pitch(grid), 96);
    assertEquals(cellToPixels(cell({ col: 1, row: 2 }), grid), {
        x: 180,
        y: 456,
        width: 84,
        height: 84,
    });
    assertEquals(cellToPixels(cell({ col: 2, cols: 2 }), grid), {
        x: 276,
        y: 264,
        width: 180,
        height: 84,
    });
    assertEquals(cellToPixels(cell({ row: 3, rows: 2 }), grid), {
        x: 84,
        y: 552,
        width: 84,
        height: 180,
    });
});

Deno.test("out-of-range origins clamp so a preview never leaves the lattice", () => {
    assertEquals(cellToPixels(cell({ col: 99, row: 99 }), grid), {
        x: 1216,
        y: 552,
        width: 84,
        height: 84,
    });
    assertEquals(cellToPixels(cell({ col: -3, row: -1 }), grid), {
        x: 84,
        y: 264,
        width: 84,
        height: 84,
    });
});

Deno.test("pixel points resolve to the nearest column centre and rounded row", () => {
    assertEquals(pixelsToCell({ x: 300, y: 270 }, grid), { col: 2, row: 0 });
    assertEquals(pixelsToCell({ x: 998, y: 360 }, grid), { col: 3, row: 1 });
    assertEquals(pixelsToCell({ x: 10, y: 900 }, grid), { col: 0, row: 3 });
    assertEquals(pixelsToCell({ x: 5000, y: -80 }, grid), { col: 5, row: 0 });
});

Deno.test("collision uses half-open bounds", () => {
    const a = { x: 0, y: 0, width: 84, height: 84 };
    assertEquals(intersects(a, { x: 84, y: 0, width: 84, height: 84 }), false);
    assertEquals(intersects(a, { x: 83, y: 40, width: 10, height: 10 }), true);
    assertEquals(intersects(a, { x: 0, y: 84, width: 84, height: 8 }), false);
});

Deno.test("a span only fits inside one band and inside the row bounds", () => {
    assertEquals(fits(cell({ col: 1, cols: 2 }), grid), true);
    assertEquals(fits(cell({ col: 2, cols: 2 }), grid), false);
    assertEquals(fits(cell({ col: 0, row: 3, rows: 2 }), grid), false);
    assertEquals(fits(cell({ cols: 0 }), grid), false);
    assertEquals(fits(cell({ col: -1 }), grid), false);
});

Deno.test("occupancy and pixel obstacles both exclude a cell", () => {
    assertEquals(isFree(cell({ col: 2 }), grid, [], [block]), true);
    assertEquals(isFree(cell({ col: 3 }), grid, [], [block]), true);
    assertEquals(
        isFree(cell({ col: 2 }), grid, [], [
            { x: 300, y: 300, width: 40, height: 40 },
        ]),
        false,
    );
    assertEquals(isFree(cell({ col: 0 }), grid, [cell({ col: 0 })], []), false);
});

Deno.test("nearest free cell resolves collisions by Euclidean distance", () => {
    const occupied = [cell({ col: 1, row: 0 }), cell({ col: 1, row: 1 })];
    assertEquals(
        nearestFreeCell(cell({ col: 1, row: 0 }), grid, occupied, []),
        cell({ col: 0, row: 0 }),
    );
    // Distance 0 at the target's own cell wins over reading order.
    assertEquals(
        nearestFreeCell(cell({ col: 2, row: 2 }), grid, occupied, []),
        cell({ col: 2, row: 2 }),
    );
    // A 2x1 span cannot start at the last column of a band, but the adjacent
    // column inside the same band still fits it one cell away.
    assertEquals(
        nearestFreeCell(cell({ col: 2, cols: 2 }), grid, [], []),
        cell({ col: 1, cols: 2 }),
    );
    // A 1x2 span asked for the last row folds back to the nearest full span.
    assertEquals(
        nearestFreeCell(cell({ col: 0, row: 3, rows: 2 }), grid, [], []),
        cell({ col: 0, row: 2, rows: 2 }),
    );
    assertEquals(
        nearestFreeCell(
            cell({ col: 0, row: 3, rows: 2 }),
            { ...grid, rows: 1 },
            [],
            [],
        ),
        null,
    );

    const singleColumnBand: CellGrid = {
        ...grid,
        columns: [
            { x: 276, band: "left" },
            { x: 1024, band: "right" },
        ],
    };
    assertEquals(
        nearestFreeCell(cell({ col: 0, cols: 2 }), singleColumnBand, [], []),
        null,
    );
});

Deno.test("resize folding keeps the band and clamps the rows", () => {
    const narrower: CellGrid = {
        ...grid,
        columns: [
            { x: 180, band: "left" },
            { x: 1024, band: "right" },
            { x: 1120, band: "right" },
        ],
        rows: 2,
    };
    const notes = [
        cell({ col: 0, row: 3 }),
        cell({ col: 2, row: 2 }),
        cell({ col: 5, row: 1 }),
    ];
    const folded = foldColumns(notes, grid, narrower, []);
    assertEquals(
        folded.placed.map(({ col, row }) => [col, row]),
        [[0, 1], [0, 0], [2, 1]],
    );
    assertEquals(folded.overflow, []);
});

Deno.test("folding resolves collisions and reports what no longer fits", () => {
    const tiny: CellGrid = {
        ...grid,
        columns: [{ x: 276, band: "left" }, { x: 1024, band: "right" }],
        rows: 1,
    };
    const notes = [cell({ col: 0 }), cell({ col: 1 }), cell({ col: 5 })];
    const folded = foldColumns(notes, grid, tiny, []);
    assertEquals(folded.placed.map(({ col }) => col), [0, 1]);
    assertEquals(folded.overflow.map(({ col }) => col), [5]);
});

Deno.test("folding onto the same grid is a no-op when nothing collides", () => {
    const notes = [cell({ col: 0 }), cell({ col: 5, row: 3 })];
    const folded = foldColumns(notes, grid, grid, []);
    assertEquals(folded.placed, notes);
});

Deno.test("the note cell is two app cells plus one gap and anchors at the block edge", () => {
    const compact = noteGrid(1366, 768, 264);
    assertEquals(compact.cell, 180);
    assertEquals(compact.columns, [
        { x: 171, band: "left" },
        { x: 1015, band: "right" },
    ]);
    assertEquals(compact.rows, 2);

    const roomy = noteGrid(1440, 900, 314);
    // With the 32px page inset only one column fits beside the block.
    assertEquals(roomy.columns, [
        { x: 208, band: "left" },
        { x: 1052, band: "right" },
    ]);
    assertEquals(roomy.rows, 2);

    const wide = noteGrid(1920, 1080, 382);
    assertEquals(wide.columns, [
        { x: 192, band: "left" },
        { x: 384, band: "left" },
        { x: 1356, band: "right" },
        { x: 1548, band: "right" },
    ]);
    // A width tier spans both columns of a band, from its outer edge.
    assertEquals(cellToPixels({ col: 0, row: 0, cols: 2, rows: 1 }, wide), {
        x: 192,
        y: 382,
        width: 372,
        height: 180,
    });
});

Deno.test("rows end at the viewport clearance independent of the plate height", () => {
    const cases = [
        [1366, 768, 264, 2, 4],
        [1440, 900, 314, 2, 4],
        [1920, 1080, 382, 3, 12],
        [2560, 1440, 519, 4, 32],
    ] as const;
    for (const [width, height, top, rows, capacity] of cases) {
        const lattice = noteGrid(width, height, top);
        assertEquals(lattice.rows, rows, `${width}x${height}`);
        const bottom = top + rows * 192 - 12;
        assertEquals(bottom <= height - 48, true, `${width}x${height}`);
        assertEquals(
            cellCapacity(lattice, { cols: 1, rows: 1 }),
            capacity,
            `${width}x${height}`,
        );
        // An empty (+ only), short and tall plate all occupy the same central
        // block; none of them can reduce the side lattice.
        const blockWidth = contentWidth(width);
        for (const plateHeight of [116, 308, 380, 600]) {
            const plate = {
                x: (width - blockWidth) / 2,
                y: top,
                width: blockWidth,
                height: plateHeight,
            };
            assertEquals(
                freeCells(lattice, [], [plate]).length,
                capacity,
                `${width}x${height} plate ${plateHeight}`,
            );
        }
    }
});

Deno.test("capacity counts non-overlapping spans per band", () => {
    const cases = [
        [1366, 768, 264, 4, 0],
        [1440, 900, 314, 4, 0],
        [1920, 1080, 382, 12, 6],
        [2560, 1440, 519, 32, 16],
    ] as const;
    for (const [width, height, top, small, wide] of cases) {
        const noteLattice = noteGrid(width, height, top);
        assertEquals(
            cellCapacity(noteLattice, { cols: 1, rows: 1 }),
            small,
            `${width}x${height} S`,
        );
        assertEquals(
            cellCapacity(noteLattice, { cols: 2, rows: 1 }),
            wide,
            `${width}x${height} W`,
        );
    }
    // A three-column band keeps one wide slot per row; the leftover column is
    // not a second slot.
    const threeColumns: CellGrid = {
        ...grid,
        columns: [
            { x: 0, band: "left" },
            { x: 192, band: "left" },
            { x: 384, band: "left" },
        ],
        rows: 3,
    };
    assertEquals(cellCapacity(threeColumns, { cols: 2, rows: 1 }), 3);
    assertEquals(cellCapacity(threeColumns, { cols: 1, rows: 1 }), 9);
});

Deno.test("free cells list in reading order and exclude taken spans", () => {
    const wide = noteGrid(1920, 1080, 382);
    const all = freeCells(wide, [], [], { cols: 2, rows: 1 });
    assertEquals(all.length, 6);
    assertEquals(all[all.length - 1], { col: 2, row: 2, cols: 2, rows: 1 });
    const oneWide = [{ col: 0, row: 0, cols: 2, rows: 1 }];
    assertEquals(freeCells(wide, oneWide, [], { cols: 2, rows: 1 }).length, 5);
    const singles = freeCells(wide, [], []);
    assertEquals(singles.length, 12);
    // The last free position is the bottom-right cell in reading order.
    assertEquals(singles[singles.length - 1], {
        col: 3,
        row: 2,
        cols: 1,
        rows: 1,
    });

    // With one column per side a width tier has no free origin at all.
    const narrow = noteGrid(1440, 900, 314);
    assertEquals(freeCells(narrow, [], [], { cols: 2, rows: 1 }), []);
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
    // A block taller than the viewport stops at minTop and reports overflow
    // through the caller's clearance measurement instead of going off-screen.
    assertEquals(
        composeBlockTop({ ...base, blockHeight: 900, minTop: 72 }),
        72,
    );
});

const homeNote = (
    id: string,
    overrides: Partial<{
        size: "s" | "w";
        col: number | null;
        row: number | null;
    }> = {},
) => ({ id, size: "s" as const, col: null, row: null, ...overrides });

const referenceGrid = noteGrid(1440, 900, 314);
// The folding case uses the 640px block to keep three columns per side; the
// production 1920 block is wider, so capacity is covered separately.
const wideGrid = noteGrid(1920, 1080, 382, 640);

Deno.test("default home notes alternate sides and fill each band from the plate outward", () => {
    const notes = ["a", "b", "c", "d"].map((id) => homeNote(id));
    const { placed, overflow } = placeHomeNotes(notes, referenceGrid);
    assertEquals(overflow, []);
    assertEquals(
        placed.map((item) => [item.note.id, item.col, item.row]),
        [["a", 0, 0], ["b", 1, 0], ["c", 0, 1], ["d", 1, 1]],
    );
});

Deno.test("a W note renders as S when that side has one column but keeps its tier", () => {
    const notes = [homeNote("wide", { size: "w" })];
    const { placed } = placeHomeNotes(notes, referenceGrid);
    assertEquals(placed.length, 1);
    assertEquals(
        [placed[0].note.size, placed[0].cols, placed[0].rows],
        ["w", 1, 1],
    );
});

Deno.test("saved cells keep their order and conflicts shift to the nearest free cell", () => {
    const notes = [
        homeNote("first", { col: 0, row: 0 }),
        homeNote("second", { col: 0, row: 0 }),
        homeNote("third", { col: 99, row: 99 }),
    ];
    const { placed, overflow } = placeHomeNotes(notes, referenceGrid);
    assertEquals(overflow, []);
    assertEquals(
        placed.map((item) => [item.note.id, item.col, item.row]),
        [["first", 0, 0], ["second", 1, 0], ["third", 1, 1]],
    );
});

Deno.test("resizing folds columns back into their band and never drops a note", () => {
    const notes = [
        homeNote("inner", { col: 3, row: 0 }),
        homeNote("outer", { col: 4, row: 1 }),
    ];
    // Both notes are on the right in the wide grid (three columns per side).
    assertEquals(wideGrid.columns.map((column) => column.band), [
        "left",
        "left",
        "left",
        "right",
        "right",
        "right",
    ]);
    const { placed, overflow } = placeHomeNotes(notes, referenceGrid, {
        from: wideGrid,
    });
    assertEquals(overflow, []);
    assertEquals(
        placed.map((item) => [item.note.id, item.col, item.row]),
        [["inner", 1, 0], ["outer", 1, 1]],
    );
});

Deno.test("notes beyond the free cells are reported as overflow", () => {
    const notes = ["a", "b", "c", "d", "e"].map((id) => homeNote(id));
    const { placed, overflow } = placeHomeNotes(notes, referenceGrid);
    assertEquals(placed.length, 4);
    assertEquals(overflow.map((note) => note.id), ["e"]);
});

Deno.test("default notes never intersect the measured block", () => {
    const blockRect = { x: 400, y: 314, width: 640, height: 480 };
    const notes = ["a", "b", "c", "d"].map((id) => homeNote(id));
    const { placed } = placeHomeNotes(notes, referenceGrid, {
        obstacles: [blockRect],
    });
    assertEquals(placed.length, 4);
    for (const item of placed) {
        assert(
            !intersects(cellToPixels(item, referenceGrid), blockRect),
            item.note.id,
        );
    }
});
