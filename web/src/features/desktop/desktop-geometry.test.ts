import { assertEquals } from "@std/assert";
import {
    clampFrame,
    defaultFrame,
    type Frame,
    minimumSize,
    resizeFrame,
    type SafeRect,
} from "./desktop-geometry.ts";

Deno.test("desktop-geometry: minimumSize returns sensible documented minima bounded by safe rect", () => {
    // Sensible base minimums: apps (480x360), notes (400x320), note (320x240)
    const appsMin = minimumSize("apps");
    assertEquals(appsMin.width, 480);
    assertEquals(appsMin.height, 360);
    assertEquals(appsMin.minWidth, 480);
    assertEquals(appsMin.minHeight, 360);

    const notesMin = minimumSize("notes");
    assertEquals(notesMin.width, 400);
    assertEquals(notesMin.height, 320);

    const noteMin = minimumSize("note");
    assertEquals(noteMin.width, 320);
    assertEquals(noteMin.height, 240);

    // When safe rect is smaller than base minimum, min-size is bounded by available safe size
    const narrowRect: SafeRect = { x: 0, y: 0, width: 300, height: 200 };
    const boundedApps = minimumSize("apps", narrowRect);
    assertEquals(boundedApps.width, 300);
    assertEquals(boundedApps.height, 200);
});

Deno.test("desktop-geometry: clampFrame clamps position and size fully within safe rect", () => {
    const rect: SafeRect = { x: 100, y: 50, width: 1000, height: 700 };

    // Off-screen negative coordinates are clamped to 0
    const offLeftTop: Frame = { x: -50, y: -20, width: 500, height: 400 };
    const clampedLeftTop = clampFrame(offLeftTop, rect, "apps");
    assertEquals(clampedLeftTop.x, 0);
    assertEquals(clampedLeftTop.y, 0);
    assertEquals(clampedLeftTop.width, 500);
    assertEquals(clampedLeftTop.height, 400);

    // Frame extending past bottom-right is shifted into safe rect
    const offRightBottom: Frame = { x: 800, y: 500, width: 500, height: 400 };
    const clampedRightBottom = clampFrame(offRightBottom, rect, "apps");
    assertEquals(clampedRightBottom.x, 500); // 1000 - 500
    assertEquals(clampedRightBottom.y, 300); // 700 - 400
    assertEquals(clampedRightBottom.width, 500);
    assertEquals(clampedRightBottom.height, 400);

    // Undersized frame is expanded to minimum size
    const tinyFrame: Frame = { x: 10, y: 10, width: 100, height: 100 };
    const clampedTiny = clampFrame(tinyFrame, rect, "note");
    assertEquals(clampedTiny.width, 320);
    assertEquals(clampedTiny.height, 240);
});

Deno.test("desktop-geometry: defaultFrame sizes and centers correctly for each WindowKind", () => {
    const largeRect: SafeRect = { x: 0, y: 0, width: 1440, height: 900 };

    // Apps: min(760, 72% of 1440 = 1037) x min(720, 78% of 900 = 702) -> 760 x 702
    const appsFrame = defaultFrame("apps", largeRect, 0);
    assertEquals(appsFrame.width, 760);
    assertEquals(appsFrame.height, 702);
    assertEquals(appsFrame.x, Math.round((1440 - 760) / 2)); // 340
    assertEquals(appsFrame.y, Math.round((900 - 702) / 2)); // 99

    // Notes: min(640, 62% of 1440 = 893) x min(680, 74% of 900 = 666) -> 640 x 666
    const notesFrame = defaultFrame("notes", largeRect, 0);
    assertEquals(notesFrame.width, 640);
    assertEquals(notesFrame.height, 666);
    assertEquals(notesFrame.x, Math.round((1440 - 640) / 2)); // 400
    assertEquals(notesFrame.y, Math.round((900 - 666) / 2)); // 117

    // Note: min(560, 54% of 1440 = 778) x min(600, 68% of 900 = 612) -> 560 x 600
    const noteFrame = defaultFrame("note", largeRect, 0);
    assertEquals(noteFrame.width, 560);
    assertEquals(noteFrame.height, 600);
    assertEquals(noteFrame.x, Math.round((1440 - 560) / 2)); // 440
    assertEquals(noteFrame.y, Math.round((900 - 600) / 2)); // 150

    // Small viewport constraint: min(760, 72% of 800 = 576) x min(720, 78% of 600 = 468) -> 576 x 468
    const smallRect: SafeRect = { x: 0, y: 0, width: 800, height: 600 };
    const smallApps = defaultFrame("apps", smallRect, 0);
    assertEquals(smallApps.width, 576);
    assertEquals(smallApps.height, 468);
    assertEquals(smallApps.x, Math.round((800 - 576) / 2)); // 112
    assertEquals(smallApps.y, Math.round((600 - 468) / 2)); // 66
});

Deno.test("desktop-geometry: defaultFrame applies deterministic 24px cascade and resets at edges", () => {
    const rect: SafeRect = { x: 0, y: 0, width: 1000, height: 800 };
    // For note: 560 x 544 (bounded: 560x544, startX = 220, startY = 128)
    const f0 = defaultFrame("note", rect, 0);
    const f1 = defaultFrame("note", rect, 1);
    const f2 = defaultFrame("note", rect, 2);

    assertEquals(f1.x, f0.x + 24);
    assertEquals(f1.y, f0.y + 24);
    assertEquals(f2.x, f0.x + 48);
    assertEquals(f2.y, f0.y + 48);

    // Calculate max steps before hitting safe edge:
    // maxX = 1000 - 560 = 440; available space = 440 - 220 = 220px; 220 / 24 = 9 steps (216px)
    // maxY = 800 - 544 = 256; available space = 256 - 128 = 128px; 128 / 24 = 5 steps (120px)
    // maxSteps = min(floor(220/24), floor(128/24)) = 5
    // At cascadeIndex = 6, it must reset back to safe start origin (f0)
    const f5 = defaultFrame("note", rect, 5);
    assertEquals(f5.x, f0.x + 5 * 24);
    assertEquals(f5.y, f0.y + 5 * 24);

    const f6 = defaultFrame("note", rect, 6);
    assertEquals(f6.x, f0.x);
    assertEquals(f6.y, f0.y);
});

Deno.test("desktop-geometry: resizeFrame handles 8 directions, min-size, and safe-rect constraints", () => {
    const rect: SafeRect = { x: 0, y: 0, width: 1200, height: 800 };
    // Initial frame at (200, 200), size (400, 300). For note kind, min is (320, 240).
    const initial: Frame = { x: 200, y: 200, width: 400, height: 300 };

    // 1. East: expands right, keeps x fixed
    const resizedE = resizeFrame(initial, "e", 50, 0, rect, "note");
    assertEquals(resizedE, { x: 200, y: 200, width: 450, height: 300 });

    // 2. West: moves left edge, keeps right edge at (200 + 400 = 600)
    const resizedW = resizeFrame(initial, "w", -50, 0, rect, "note");
    assertEquals(resizedW, { x: 150, y: 200, width: 450, height: 300 });

    // 3. South: expands bottom, keeps y fixed
    const resizedS = resizeFrame(initial, "s", 0, 40, rect, "note");
    assertEquals(resizedS, { x: 200, y: 200, width: 400, height: 340 });

    // 4. North: moves top edge, keeps bottom edge at (200 + 300 = 500)
    const resizedN = resizeFrame(initial, "n", 0, -40, rect, "note");
    assertEquals(resizedN, { x: 200, y: 160, width: 400, height: 340 });

    // 5. Southeast: moves right and bottom
    const resizedSE = resizeFrame(initial, "se", 30, 30, rect, "note");
    assertEquals(resizedSE, { x: 200, y: 200, width: 430, height: 330 });

    // 6. Northwest: moves top and left, keeps bottom-right corner fixed at (600, 500)
    const resizedNW = resizeFrame(initial, "nw", -20, -20, rect, "note");
    assertEquals(resizedNW, { x: 180, y: 180, width: 420, height: 320 });

    // 7. Southwest: moves bottom and left, keeps top-right corner fixed at (600, 200)
    const resizedSW = resizeFrame(initial, "sw", -20, 20, rect, "note");
    assertEquals(resizedSW, { x: 180, y: 200, width: 420, height: 320 });

    // 8. Northeast: moves top and right, keeps bottom-left corner fixed at (200, 500)
    const resizedNE = resizeFrame(initial, "ne", 20, -20, rect, "note");
    assertEquals(resizedNE, { x: 200, y: 180, width: 420, height: 320 });

    // Minimum size constraint: attempt to shrink smaller than minimum (320x240 for note)
    const shrinkWestTooMuch = resizeFrame(initial, "w", 200, 0, rect, "note");
    // Right edge is 600, width capped at min 320 -> x = 600 - 320 = 280
    assertEquals(shrinkWestTooMuch, {
        x: 280,
        y: 200,
        width: 320,
        height: 300,
    });

    const shrinkNorthTooMuch = resizeFrame(initial, "n", 0, 200, rect, "note");
    // Bottom edge is 500, height capped at min 240 -> y = 500 - 240 = 260
    assertEquals(shrinkNorthTooMuch, {
        x: 200,
        y: 260,
        width: 400,
        height: 240,
    });

    // Safe rect boundary clamping: attempt to drag west past left edge (0)
    const expandPastLeft = resizeFrame(initial, "w", -500, 0, rect, "note");
    assertEquals(expandPastLeft.x, 0);
    assertEquals(expandPastLeft.width, 600); // 0 to 600

    // Safe rect boundary clamping: attempt to drag east past rect.width (1200)
    const expandPastRight = resizeFrame(initial, "e", 2000, 0, rect, "note");
    assertEquals(expandPastRight.x, 200);
    assertEquals(expandPastRight.width, 1000); // 1200 - 200
});

Deno.test("desktop-geometry: robust handling of degraded/zero safeRect dimensions", () => {
    const zeroRect: SafeRect = { x: 0, y: 0, width: 0, height: 0 };
    const f = defaultFrame("apps", zeroRect, 0);
    assertEquals(f.width, 0);
    assertEquals(f.height, 0);
    assertEquals(f.x, 0);
    assertEquals(f.y, 0);

    const clamped = clampFrame(
        { x: 50, y: 50, width: 200, height: 200 },
        zeroRect,
        "apps",
    );
    assertEquals(clamped.width, 0);
    assertEquals(clamped.height, 0);
    assertEquals(clamped.x, 0);
    assertEquals(clamped.y, 0);
});
