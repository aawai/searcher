import { assertEquals } from "@std/assert";
import { calculateMasonryLayout } from "./masonry.ts";

Deno.test("calculateMasonryLayout: basic shortest column placement fills gaps below shorter cards", () => {
    // 3 columns when width is 800 (gap = 16, minWidth = 245)
    // colWidth = (800 - 32) / 3 = 256
    const heights = new Map<string, number>([
        ["A", 70],
        ["B", 220],
        ["C", 70],
        ["D", 100],
        ["E", 100],
        ["F", 100],
    ]);
    const items = [
        { id: "A" },
        { id: "B" },
        { id: "C" },
        { id: "D" },
        { id: "E" },
        { id: "F" },
    ];

    const result = calculateMasonryLayout({
        items,
        heights,
        containerWidth: 800,
        gap: 16,
    });

    assertEquals(result.columns, 3);
    assertEquals(Math.round(result.columnWidth), 256);

    // Initial placement:
    // A -> col 0, y = 0
    // B -> col 1, y = 0
    // C -> col 2, y = 0
    const posA = result.placements.get("A");
    const posB = result.placements.get("B");
    const posC = result.placements.get("C");
    assertEquals(posA?.column, 0);
    assertEquals(posA?.y, 0);
    assertEquals(posB?.column, 1);
    assertEquals(posB?.y, 0);
    assertEquals(posC?.column, 2);
    assertEquals(posC?.y, 0);

    // At this point:
    // col 0 height = 70 + 16 = 86
    // col 1 height = 220 + 16 = 236
    // col 2 height = 70 + 16 = 86
    // Shortest is col 0, so D must go to col 0 at y = 86!
    const posD = result.placements.get("D");
    assertEquals(posD?.column, 0);
    assertEquals(posD?.y, 86);

    // After D:
    // col 0 height = 86 + 100 + 16 = 202
    // col 1 height = 236
    // col 2 height = 86
    // Shortest is col 2, so E must go to col 2 at y = 86!
    const posE = result.placements.get("E");
    assertEquals(posE?.column, 2);
    assertEquals(posE?.y, 86);

    // After E:
    // col 0 height = 202
    // col 1 height = 236
    // col 2 height = 86 + 100 + 16 = 202
    // Shortest is col 0 (tied with col 2, first min is col 0), so F must go to col 0 at y = 202!
    // Notice y = 202 is STILL below card B's bottom (220), verifying it fills short column before B ends!
    const posF = result.placements.get("F");
    assertEquals(posF?.column, 0);
    assertEquals(posF?.y, 202);

    // Container height should be maxBottom:
    // col 0 bottom: 202 + 100 = 302
    // col 1 bottom: 220
    // col 2 bottom: 86 + 100 = 186
    assertEquals(result.containerHeight, 302);
});

Deno.test("calculateMasonryLayout: extreme height in one column does not block other columns", () => {
    const heights = new Map<string, number>([
        ["tall", 600],
        ["s1", 60],
        ["s2", 60],
        ["s3", 60],
        ["s4", 60],
        ["s5", 60],
    ]);
    const items = [
        { id: "tall" },
        { id: "s1" },
        { id: "s2" },
        { id: "s3" },
        { id: "s4" },
        { id: "s5" },
    ];

    const result = calculateMasonryLayout({
        items,
        heights,
        containerWidth: 800,
        gap: 16,
    });

    // tall -> col 0 (y = 0)
    // s1 -> col 1 (y = 0)
    // s2 -> col 2 (y = 0)
    // s3, s4, s5 should alternate in col 1 and col 2, NEVER blocked by tall (col 0)
    assertEquals(result.placements.get("tall")?.column, 0);
    assertEquals(result.placements.get("s1")?.column, 1);
    assertEquals(result.placements.get("s2")?.column, 2);
    assertEquals(result.placements.get("s3")?.column, 1);
    assertEquals(result.placements.get("s4")?.column, 2);
    assertEquals(result.placements.get("s5")?.column, 1);

    assertEquals(result.placements.get("s3")?.y, 76);
    assertEquals(result.placements.get("s4")?.y, 76);
    assertEquals(result.placements.get("s5")?.y, 152);
});

Deno.test("calculateMasonryLayout: responsive column calculation adapts to container width", () => {
    const items = [{ id: "1" }, { id: "2" }, { id: "3" }];
    const heights = new Map<string, number>();

    // Wide: >= 767px -> 3 cols
    const wide = calculateMasonryLayout({
        items,
        heights,
        containerWidth: 850,
        gap: 16,
        minColumnWidth: 245,
    });
    assertEquals(wide.columns, 3);

    // Medium: between 506px and 766px -> 2 cols
    const medium = calculateMasonryLayout({
        items,
        heights,
        containerWidth: 600,
        gap: 16,
        minColumnWidth: 245,
    });
    assertEquals(medium.columns, 2);
    assertEquals(medium.columnWidth, (600 - 16) / 2);

    // Narrow: < 506px -> 1 col
    const narrow = calculateMasonryLayout({
        items,
        heights,
        containerWidth: 400,
        gap: 16,
        minColumnWidth: 245,
    });
    assertEquals(narrow.columns, 1);
    assertEquals(narrow.columnWidth, 400);
});

Deno.test("calculateMasonryLayout: handles zero width or empty items gracefully", () => {
    const empty = calculateMasonryLayout({
        items: [],
        heights: new Map(),
        containerWidth: 800,
    });
    assertEquals(empty.containerHeight, 0);
    assertEquals(empty.placements.size, 0);

    const zeroWidth = calculateMasonryLayout({
        items: [{ id: "1" }],
        heights: new Map(),
        containerWidth: 0,
    });
    assertEquals(zeroWidth.containerHeight, 0);
    assertEquals(zeroWidth.placements.size, 0);
});
