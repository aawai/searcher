import { assertEquals } from "@std/assert";
import { type Geometry, presetRect } from "./window-geometry.ts";

// 1440×900 with a 72px bottom Dock and 16px margins on every side.
const g: Geometry = {
    area: { x: 16, y: 16, width: 1408, height: 780 },
    wide: true,
    margin: 16,
    step: 16,
    fine: 4,
    minWidth: 320,
    minHeight: 240,
    defaultWidth: 840,
    defaultHeight: 680,
    anchor: null,
};
const moved = { x: 500, y: 100, width: 600, height: 400 };

Deno.test("halves fill the work area height and leave the margin between them", () => {
    const left = presetRect("left", moved, g);
    const right = presetRect("right", moved, g);
    assertEquals(left, { x: 16, y: 16, width: 696, height: 780 });
    assertEquals(right, { x: 728, y: 16, width: 696, height: 780 });
    assertEquals(right.x - (left.x + left.width), g.margin);
});

Deno.test("halves keep the minimum window width in a narrow work area", () => {
    const narrow = { ...g, area: { x: 16, y: 16, width: 600, height: 500 } };
    assertEquals(presetRect("left", moved, narrow).width, 320);
    assertEquals(presetRect("right", moved, narrow).x, 16 + 600 - 320);
});

Deno.test("center keeps the current size and centers it in the work area", () => {
    assertEquals(presetRect("center", moved, g), {
        x: 16 + (1408 - 600) / 2,
        y: 16 + (780 - 400) / 2,
        width: 600,
        height: 400,
    });
});

Deno.test("center fits a rectangle larger than the work area", () => {
    const large = { x: 0, y: 0, width: 2000, height: 1000 };
    assertEquals(presetRect("center", large, g), g.area);
});

Deno.test("default size grows around the current center and stays inside the area", () => {
    assertEquals(presetRect("default", moved, g), {
        x: 380,
        y: 16,
        width: 840,
        height: 680,
    });
    const corner = { x: 16, y: 16, width: 400, height: 300 };
    assertEquals(presetRect("default", corner, g), {
        x: 16,
        y: 16,
        width: 840,
        height: 680,
    });
});
