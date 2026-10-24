import { assertEquals } from "@std/assert";
import {
    effectiveRows,
    moveInVisualOrder,
    planHomeLibrary,
} from "./homeLibraryLayout.ts";
import type { LauncherTile } from "./launcherTiles.ts";

const app = (id: string): LauncherTile => ({
    type: "app",
    id,
    app: { id, name: id, url: `https://example.com/${id}` },
});
const folder = (id: string, large = true): LauncherTile => ({
    type: "folder",
    id: `folder:${id}`,
    group: { id, name: id, folderSize: large ? "large" : "small" },
    apps: [],
});
const apps = (n: number, prefix = "a") =>
    Array.from({ length: n }, (_, i) => app(`${prefix}${i}`));
const ids = (tiles: LauncherTile[]) => tiles.map((t) => t.id);

Deno.test("home balances nineteen cells into five columns without another row", () => {
    const plan = planHomeLibrary({
        tiles: apps(18),
        columns: 6,
        rows: 4,
        showAdd: true,
    });
    assertEquals(plan.add, { col: 3, row: 3 });
    assertEquals(Math.max(...plan.visible.map((item) => item.col)), 4);
    assertEquals(Math.max(...plan.visible.map((item) => item.row)), 3);
    assertEquals(plan.overflow, []);
});

Deno.test("home keeps the capacity unless the trailing row is a lone cell", () => {
    // 7 cells in 5 columns = 5 + 2: the last row is not lonely, so the
    // responsive capacity is retained.
    const seven = planHomeLibrary({
        tiles: apps(6),
        columns: 5,
        rows: 4,
        showAdd: true,
    });
    assertEquals(Math.max(...seven.visible.map((item) => item.col)), 4);
    assertEquals(seven.add, { col: 1, row: 1 });

    const full = planHomeLibrary({
        tiles: apps(12),
        columns: 6,
        rows: 4,
        showAdd: false,
    });
    assertEquals(Math.max(...full.visible.map((item) => item.col)), 5);
    const capped = planHomeLibrary({
        tiles: apps(18),
        columns: 6,
        rows: 3,
        showAdd: true,
    });
    assertEquals(capped.more, { col: 5, row: 2, count: 1 });
    assertEquals(Math.max(...capped.visible.map((item) => item.col)), 5);
});

Deno.test("large folders retain the six-column backfill rather than balancing", () => {
    const plan = planHomeLibrary({
        tiles: [folder("large"), ...apps(14)],
        columns: 6,
        rows: 4,
        showAdd: true,
    });
    assertEquals(Math.max(...plan.visible.map((item) => item.col)), 5);
    assertEquals(plan.add, { col: 0, row: 3 });
});

Deno.test("effective rows account for the bottom plate padding", () => {
    // 1440x900: search centre 38% -> 342; search bottom 370; 20px gap -> plate
    // top 390; 16px top padding -> grid top 406. 900 - 406 - 48 - 16 = 430,
    // floor(430 / 96) = 4 rows.
    assertEquals(
        effectiveRows({
            layoutViewportHeight: 900,
            gridTop: 406,
            rowPitch: 96,
            platePadding: 16,
        }),
        4,
    );
    // 1366x768: search bottom 319.84; plate top 339.84; grid top 355.84.
    // 768 - 355.84 - 48 - 16 = 348.16, floor(348.16 / 96) = 3 rows.
    assertEquals(
        effectiveRows({
            layoutViewportHeight: 768,
            gridTop: 355.84,
            rowPitch: 96,
            platePadding: 16,
        }),
        3,
    );
    // The bottom padding can remove a row on its own.
    assertEquals(
        effectiveRows({
            layoutViewportHeight: 768,
            gridTop: 300,
            rowPitch: 96,
            platePadding: 32,
        }),
        4,
    );
    assertEquals(
        effectiveRows({
            layoutViewportHeight: 768,
            gridTop: 300,
            rowPitch: 96,
            platePadding: 40,
        }),
        3,
    );
});

Deno.test("large folder counts as 4 cells and 4 full rows fit exactly", () => {
    // 4 columns x 4 rows = 16 cells = large folder (4) + 12 apps.
    const plan = planHomeLibrary({
        tiles: [folder("L"), ...apps(12)],
        columns: 4,
        rows: 4,
        showAdd: false,
    });
    assertEquals(plan.overflow, []);
    assertEquals(plan.more, null);
    assertEquals(plan.visible.length, 13);
});

Deno.test("exceeding capacity by one tile reserves the last cell for more", () => {
    const plan = planHomeLibrary({
        tiles: [folder("L"), ...apps(13)],
        columns: 4,
        rows: 4,
        showAdd: false,
    });
    // 15 usable cells: folder (4) + 11 apps; 2 apps overflow.
    assertEquals(plan.visible.length, 12);
    assertEquals(ids(plan.overflow), ["a11", "a12"]);
    assertEquals(plan.more, { col: 3, row: 3, count: 2 });
    assertEquals(plan.add, null);
    assertEquals(plan.addInOverflow, false);
    for (const v of plan.visible) {
        assertEquals(v.row + v.rowSpan <= 4, true);
        assertEquals(v.col === 3 && v.row === 3, false);
    }
});

Deno.test("add cell is placed after tiles when it fits", () => {
    const plan = planHomeLibrary({
        tiles: apps(5),
        columns: 5,
        rows: 4,
        showAdd: true,
    });
    assertEquals(plan.add, { col: 2, row: 1 });
    assertEquals(plan.more, null);
    assertEquals(plan.addInOverflow, false);
});

Deno.test("mobile 5 columns: add goes to overflow when it does not fit", () => {
    // 5 columns x 4 rows = 20 cells, filled exactly by tiles; add has no cell.
    const plan = planHomeLibrary({
        tiles: apps(20),
        columns: 5,
        rows: 4,
        showAdd: true,
    });
    assertEquals(plan.addInOverflow, true);
    assertEquals(plan.add, null);
    assertEquals(plan.more, { col: 4, row: 3, count: 1 });
    assertEquals(ids(plan.overflow), ["a19"]);
    assertEquals(plan.visible.length, 19);
});

Deno.test("add is not counted in the more count", () => {
    const plan = planHomeLibrary({
        tiles: apps(25),
        columns: 5,
        rows: 4,
        showAdd: true,
    });
    assertEquals(plan.more?.count, 6);
    assertEquals(plan.overflow.length, 6);
    assertEquals(plan.addInOverflow, true);
});

Deno.test("effective rows 3: a large folder crossing the limit goes to more", () => {
    const plan = planHomeLibrary({
        tiles: [...apps(6), folder("L"), app("z")],
        columns: 4,
        rows: 3,
        showAdd: false,
    });
    // Row 0 a0..a3, row 1 a4 a5 then folder doesn't fit at row1 (cols 2-3 ok!)
    // folder placed at (2,1) rows 1-2; z backfills; last cell (3,2) reserved.
    const folderPlacement = plan.visible.find((v) => v.tile.id === "folder:L");
    assertEquals(folderPlacement?.row, 1);
    assertEquals(plan.overflow.length, 0);

    const tight = planHomeLibrary({
        tiles: [...apps(8), folder("L")],
        columns: 4,
        rows: 3,
        showAdd: false,
    });
    // Rows 0-1 full of apps; folder would occupy rows 2-3 and crosses limit.
    assertEquals(ids(tight.overflow), ["folder:L"]);
    assertEquals(tight.more, { col: 3, row: 2, count: 1 });
    assertEquals(tight.visible.length, 8);
});

Deno.test("rows = 1: a large folder always goes to more", () => {
    const plan = planHomeLibrary({
        tiles: [folder("L"), app("a"), app("b")],
        columns: 4,
        rows: 1,
        showAdd: false,
    });
    // The folder is laid out first at (0,0); b lands on the reserved cell (3,0).
    assertEquals(ids(plan.overflow), ["folder:L", "b"]);
    assertEquals(plan.more, { col: 3, row: 0, count: 2 });
    assertEquals(ids(plan.visible.map((v) => v.tile)), ["a"]);

    const single = planHomeLibrary({
        tiles: [folder("L")],
        columns: 4,
        rows: 1,
        showAdd: true,
    });
    assertEquals(ids(single.overflow), ["folder:L"]);
    assertEquals(single.addInOverflow, true);
    assertEquals(single.visible, []);
});

Deno.test("columns are at least 2", () => {
    const plan = planHomeLibrary({
        tiles: [folder("L")],
        columns: 1,
        rows: 2,
        showAdd: false,
    });
    assertEquals(plan.overflow, []);
    assertEquals(plan.visible[0].colSpan, 2);
});

Deno.test("effectiveRows from viewport numbers", () => {
    // 1440x900-like: (900 - 300 - 48) / 120 = 4.6 -> 4
    assertEquals(
        effectiveRows({
            layoutViewportHeight: 900,
            gridTop: 300,
            rowPitch: 120,
        }),
        4,
    );
    // 1366x768-like: (768 - 300 - 48) / 120 = 3.5 -> 3
    assertEquals(
        effectiveRows({
            layoutViewportHeight: 768,
            gridTop: 300,
            rowPitch: 120,
        }),
        3,
    );
    // Tall viewport is capped at 4.
    assertEquals(
        effectiveRows({
            layoutViewportHeight: 2000,
            gridTop: 100,
            rowPitch: 100,
        }),
        4,
    );
    // Minimum 1.
    assertEquals(
        effectiveRows({
            layoutViewportHeight: 300,
            gridTop: 280,
            rowPitch: 120,
        }),
        1,
    );
    assertEquals(
        effectiveRows({ layoutViewportHeight: 900, gridTop: 0, rowPitch: 0 }),
        1,
    );
    assertEquals(
        effectiveRows({
            layoutViewportHeight: 900,
            gridTop: 0,
            rowPitch: Number.NaN,
        }),
        1,
    );
});

Deno.test("visual order differs from canonical when a small tile backfills", () => {
    const tiles = [app("A"), app("B"), folder("L"), app("C")];
    const plan = planHomeLibrary({
        tiles,
        columns: 3,
        rows: 4,
        showAdd: false,
    });
    const visual = ids(plan.visible.map((v) => v.tile));
    const canonical = ids(tiles);
    assertEquals(canonical, ["A", "B", "folder:L", "C"]);
    // C backfills at (2,0) beside A, B; the folder wraps to row 1.
    assertEquals(visual, ["A", "B", "C", "folder:L"]);

    assertEquals(
        moveInVisualOrder(canonical, visual, "C", -1),
        ["A", "C", "B", "folder:L"],
    );
    assertEquals(
        moveInVisualOrder(canonical, visual, "B", 1),
        ["A", "folder:L", "C", "B"],
    );
    assertEquals(
        moveInVisualOrder(canonical, visual, "folder:L", -1),
        canonical,
    );
    // No-ops at the ends.
    assertEquals(moveInVisualOrder(canonical, visual, "A", -1), canonical);
    assertEquals(
        moveInVisualOrder(canonical, visual, "folder:L", 1),
        canonical,
    );
});

Deno.test("moveInVisualOrder ignores overflow tiles not in visual order", () => {
    assertEquals(
        moveInVisualOrder(["A", "B", "C", "D"], ["A", "B", "C"], "D", -1),
        ["A", "B", "C", "D"],
    );
    assertEquals(
        moveInVisualOrder(["A", "X", "B"], ["A", "B"], "A", 1),
        ["X", "B", "A"],
    );
});
