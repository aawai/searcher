import { assertEquals } from "@std/assert";
import {
    calculateDesktopLayout,
    type DesktopFootprint,
} from "./desktopLayout.ts";

const app = (id: string): DesktopFootprint => ({ id, cols: 1, rows: 1 });
const folder = (id: string, large = true): DesktopFootprint => ({
    id,
    cols: large ? 2 : 1,
    rows: large ? 2 : 1,
});

Deno.test("large folder leaves its second-row neighbors available to apps", () => {
    const layout = calculateDesktopLayout([
        folder("LF"),
        ..."ABCDEFGHIJKL".split("").map(app),
    ], 10);
    assertEquals(layout.find((item) => item.id === "LF"), {
        id: "LF",
        col: 0,
        row: 0,
        colSpan: 2,
        rowSpan: 2,
    });
    assertEquals(layout.find((item) => item.id === "H")?.col, 9);
    assertEquals(layout.find((item) => item.id === "I")?.row, 1);
    assertEquals(layout.find((item) => item.id === "I")?.col, 2);
});

Deno.test("mixed folders fit without overlap, overflow or persistent holes after resizing", () => {
    const items = [
        app("A"),
        folder("SF", false),
        app("B"),
        folder("LF1"),
        app("C"),
        app("D"),
        app("E"),
        folder("LF2"),
        app("F"),
    ];
    for (const columns of [2, 3, 6, 10]) {
        const layout = calculateDesktopLayout(items, columns);
        const cells = new Set<string>();
        for (const item of layout) {
            assertEquals(item.col + item.colSpan <= columns, true);
            for (let y = item.row; y < item.row + item.rowSpan; y++) {
                for (let x = item.col; x < item.col + item.colSpan; x++) {
                    const key = `${x}:${y}`;
                    assertEquals(cells.has(key), false, key);
                    cells.add(key);
                }
            }
        }
        assertEquals(layout.find((item) => item.id === "SF")?.colSpan, 1);
        assertEquals(layout.find((item) => item.id === "LF2")?.rowSpan, 2);
    }
    const large = calculateDesktopLayout([folder("F"), app("A"), app("B")], 3);
    const small = calculateDesktopLayout([
        folder("F", false),
        app("A"),
        app("B"),
    ], 3);
    assertEquals(large.find((item) => item.id === "A")?.col, 2);
    assertEquals(small.find((item) => item.id === "A")?.col, 1);
});
