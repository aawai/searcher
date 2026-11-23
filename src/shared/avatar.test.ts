import { assert, assertEquals } from "@std/assert";
import {
    computePixelCropRect,
    defaultAvatarCrop,
    normalizeAvatarCrop,
} from "./avatar.ts";

Deno.test("defaultAvatarCrop centers largest square for landscape, portrait, and square", () => {
    const landscape = defaultAvatarCrop(800, 400);
    assertEquals(landscape, { x: 0.25, y: 0, size: 1 });

    const portrait = defaultAvatarCrop(400, 800);
    assertEquals(portrait, { x: 0, y: 0.25, size: 1 });

    const square = defaultAvatarCrop(512, 512);
    assertEquals(square, { x: 0, y: 0, size: 1 });
});

Deno.test("normalizeAvatarCrop clamps out-of-bounds crop and falls back on invalid inputs", () => {
    assertEquals(normalizeAvatarCrop(null, 800, 400), {
        x: 0.25,
        y: 0,
        size: 1,
    });

    // size = 0.5 on 800x400 -> side = 200px -> maxX = 600/800 = 0.75, maxY = 200/400 = 0.5
    const clamped = normalizeAvatarCrop(
        { x: 2, y: -0.5, size: 0.5 },
        800,
        400,
    );
    assertEquals(clamped, { x: 0.75, y: 0, size: 0.5 });

    // Extreme small size clamps to at least 1px
    const tiny = normalizeAvatarCrop({ x: 0, y: 0, size: -10 }, 200, 100);
    assertEquals(tiny.size, 1 / 100);
});

Deno.test("computePixelCropRect always stays within image bounds", () => {
    const rect1 = computePixelCropRect({ x: 0.25, y: 0, size: 1 }, 800, 400);
    assertEquals(rect1, { left: 200, top: 0, width: 400, height: 400 });

    // Even with rounding at the far edge, left+width <= W and top+height <= H
    const rect2 = computePixelCropRect(
        { x: 0.9999, y: 0.9999, size: 0.5 },
        333,
        555,
    );
    assert(rect2.left >= 0);
    assert(rect2.top >= 0);
    assert(rect2.width >= 1);
    assert(rect2.height >= 1);
    assertEquals(rect2.width, rect2.height);
    assert(rect2.left + rect2.width <= 333);
    assert(rect2.top + rect2.height <= 555);
});
