import { assertEquals } from "@std/assert";
import { computeConstrainedFrame } from "./constrained-geometry.ts";

Deno.test("constrained geometry: medium caps dimensions and returns viewport-global coordinates", () => {
    assertEquals(
        computeConstrainedFrame({
            preset: "medium",
            rect: { x: 16, y: 80, width: 1000, height: 1100 },
        }),
        { x: 176, y: 270, width: 680, height: 720 },
    );
    assertEquals(
        computeConstrainedFrame({
            preset: "medium",
            rect: { x: 0, y: 0, width: 800, height: 800 },
        }),
        { x: 88, y: 112, width: 624, height: 576 },
    );
});

Deno.test("constrained geometry: large preserves gap and caps width and height", () => {
    assertEquals(
        computeConstrainedFrame({
            preset: "large",
            rect: { x: 0, y: 0, width: 1000, height: 1000 },
            gap: 16,
        }),
        { x: 60, y: 90, width: 880, height: 820 },
    );
    assertEquals(
        computeConstrainedFrame({
            preset: "large",
            rect: { x: 0, y: 0, width: 900, height: 900 },
            gap: 16,
        }),
        { x: 16, y: 54, width: 868, height: 792 },
    );
});

Deno.test("constrained geometry: fullscreen fills the safe rect in viewport coordinates", () => {
    assertEquals(
        computeConstrainedFrame({
            preset: "fullscreen",
            rect: { x: 16, y: 80, width: 900, height: 750 },
        }),
        { x: 16, y: 80, width: 900, height: 750 },
    );
});

Deno.test("constrained geometry: tiny and zero safe rects remain bounded", () => {
    assertEquals(
        computeConstrainedFrame({
            preset: "large",
            rect: { x: 0, y: 0, width: 20, height: 10 },
        }),
        { x: 10, y: 0.5999999999999996, width: 0, height: 8.8 },
    );
    assertEquals(
        computeConstrainedFrame({
            preset: "medium",
            rect: { x: 0, y: 0, width: 0, height: 0 },
        }),
        { x: 0, y: 0, width: 0, height: 0 },
    );
});
