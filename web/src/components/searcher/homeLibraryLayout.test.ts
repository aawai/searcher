import { assertEquals } from "@std/assert";
import {
    effectiveRows,
    moveInVisualOrder,
    planHomeLibrary,
} from "./homeLibraryLayout.ts";
import { type LauncherTile, pinnedRootTiles } from "./launcherTiles.ts";

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

Deno.test("home balances nineteen tiles into five columns without another row", () => {
    const plan = planHomeLibrary({ tiles: apps(19), columns: 6, rows: 4 });
    assertEquals(Math.max(...plan.visible.map((item) => item.col)), 4);
    assertEquals(Math.max(...plan.visible.map((item) => item.row)), 3);
    assertEquals(plan.visible.filter((item) => item.row === 3).length, 4);
    assertEquals(plan.overflow, []);
});

Deno.test("home keeps eight tiles spread across the available width when resizing", () => {
    for (const [columns, firstRow] of [[6, 6], [7, 6], [8, 8]]) {
        const plan = planHomeLibrary({
            tiles: [folder("small", false), ...apps(7)],
            columns,
            rows: 4,
        });
        assertEquals(
            plan.visible.filter((item) => item.row === 0).length,
            firstRow,
        );
        assertEquals(plan.overflow, []);
    }
});

Deno.test("home keeps the capacity unless the trailing row is a lone tile", () => {
    // 7 tiles in 5 columns = 5 + 2: the last row is not lonely, so the
    // responsive capacity is retained.
    const seven = planHomeLibrary({ tiles: apps(7), columns: 5, rows: 4 });
    assertEquals(Math.max(...seven.visible.map((item) => item.col)), 4);
    assertEquals(seven.visible.filter((item) => item.row === 1).length, 2);

    const full = planHomeLibrary({ tiles: apps(12), columns: 6, rows: 4 });
    assertEquals(Math.max(...full.visible.map((item) => item.col)), 5);
    const capped = planHomeLibrary({ tiles: apps(19), columns: 6, rows: 3 });
    assertEquals(capped.more, { col: 5, row: 2, count: 2 });
    assertEquals(Math.max(...capped.visible.map((item) => item.col)), 5);
});

Deno.test("large folders retain the six-column backfill rather than balancing", () => {
    const plan = planHomeLibrary({
        tiles: [folder("large"), ...apps(15)],
        columns: 6,
        rows: 4,
    });
    assertEquals(Math.max(...plan.visible.map((item) => item.col)), 5);
    assertEquals(plan.visible.filter((item) => item.row === 3).length, 1);
});

Deno.test("effective rows account for the bottom plate padding", () => {
    // 1440x900: search centre 38% -> 342; search bottom 370; 20px gap -> plate
    // top 390; 16px top padding -> grid top 406. 900 - 406 - 48 - 16 = 430;
    // four 76px rows with three 12px gaps are 340px tall -> 4 rows.
    assertEquals(
        effectiveRows({
            layoutViewportHeight: 900,
            gridTop: 406,
            rowPitch: 88,
            rowGap: 12,
            platePadding: 16,
        }),
        4,
    );
    // 1366x768: search bottom 319.84; plate top 339.84; grid top 355.84.
    // 768 - 355.84 - 48 - 16 = 348.16. Four 76px rows need 4 * 88 - 12 =
    // 340px, so the fourth row fits; the trailing gap must not be counted.
    assertEquals(
        effectiveRows({
            layoutViewportHeight: 768,
            gridTop: 355.84,
            rowPitch: 88,
            rowGap: 12,
            platePadding: 16,
        }),
        4,
    );
    // The same viewport with 84px rows needs 4 * 96 - 12 = 372px > 348.16.
    assertEquals(
        effectiveRows({
            layoutViewportHeight: 768,
            gridTop: 355.84,
            rowPitch: 96,
            rowGap: 12,
            platePadding: 16,
        }),
        3,
    );
    // Exactly filling the space still fits; one pixel less drops the row.
    assertEquals(
        effectiveRows({
            layoutViewportHeight: 340 + 48 + 16,
            gridTop: 0,
            rowPitch: 88,
            rowGap: 12,
            platePadding: 16,
        }),
        4,
    );
    assertEquals(
        effectiveRows({
            layoutViewportHeight: 339 + 48 + 16,
            gridTop: 0,
            rowPitch: 88,
            rowGap: 12,
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
    // With a 68px bottom dock (clearance = max(48, 68 + 12) = 80), 1440x900 still fits 4 rows
    // (900 - 406 - 80 - 16 = 398 >= 340), while 1366x768 drops to 3 rows (768 - 355.84 - 80 - 16 = 316.16 < 340).
    assertEquals(
        effectiveRows({
            layoutViewportHeight: 900,
            gridTop: 406,
            rowPitch: 88,
            rowGap: 12,
            platePadding: 16,
            dockInsetBottom: 68,
        }),
        4,
    );
    assertEquals(
        effectiveRows({
            layoutViewportHeight: 768,
            gridTop: 355.84,
            rowPitch: 88,
            rowGap: 12,
            platePadding: 16,
            dockInsetBottom: 68,
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
    });
    // 15 usable cells: folder (4) + 11 apps; 2 apps overflow.
    assertEquals(plan.visible.length, 12);
    assertEquals(ids(plan.overflow), ["a11", "a12"]);
    assertEquals(plan.more, { col: 3, row: 3, count: 2 });
    assertEquals(plan.visible.length, 12);
    for (const v of plan.visible) {
        assertEquals(v.row + v.rowSpan <= 4, true);
        assertEquals(v.col === 3 && v.row === 3, false);
    }
});

Deno.test("mobile 5 columns: tiles filling the capacity exactly need no more cell", () => {
    const plan = planHomeLibrary({ tiles: apps(20), columns: 5, rows: 4 });
    assertEquals(plan.more, null);
    assertEquals(plan.overflow, []);
    assertEquals(plan.visible.length, 20);
});

Deno.test("effective rows 3: a large folder crossing the limit goes to more", () => {
    const plan = planHomeLibrary({
        tiles: [...apps(6), folder("L"), app("z")],
        columns: 4,
        rows: 3,
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
    });
    // The folder is laid out first at (0,0); b lands on the reserved cell (3,0).
    assertEquals(ids(plan.overflow), ["folder:L", "b"]);
    assertEquals(plan.more, { col: 3, row: 0, count: 2 });
    assertEquals(ids(plan.visible.map((v) => v.tile)), ["a"]);

    const single = planHomeLibrary({
        tiles: [folder("L")],
        columns: 4,
        rows: 1,
    });
    assertEquals(ids(single.overflow), ["folder:L"]);
    assertEquals(single.visible, []);
});

Deno.test("columns are at least 2", () => {
    const plan = planHomeLibrary({
        tiles: [folder("L")],
        columns: 1,
        rows: 2,
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
    const plan = planHomeLibrary({ tiles, columns: 3, rows: 4 });
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

Deno.test("home plans pinned root tiles only and counts hidden pins in 更多", () => {
    const root = (id: string, isHomeFixed: boolean): LauncherTile => ({
        type: "app",
        id,
        app: {
            id,
            name: id,
            url: `https://example.com/${id}`,
            isHomeFixed,
        },
    });
    const pinned = Array.from(
        { length: 25 },
        (_, i) => root(`pinned${i}`, true),
    );
    const library = Array.from(
        { length: 4 },
        (_, i) => root(`library${i}`, false),
    );
    const plan = planHomeLibrary({
        tiles: pinnedRootTiles([...library, ...pinned]),
        columns: 6,
        rows: 4,
    });
    // 24 cells: 23 tiles and 更多; the 2 hidden pinned tiles are counted, the
    // unpinned library apps never are.
    assertEquals(plan.visible.length, 23);
    assertEquals(plan.more, { col: 5, row: 3, count: 2 });
    assertEquals(
        plan.visible.every((item) => item.tile.app?.isHomeFixed === true),
        true,
    );
});
