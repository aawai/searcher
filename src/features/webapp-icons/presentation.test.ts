import { assertEquals } from "@std/assert";
import sharp from "sharp";
import { normalizeIcon } from "./presentation.ts";

function assertColorNear(
    actual: number[],
    expected: readonly [number, number, number],
    tolerance = 6,
) {
    for (let i = 0; i < 3; i++) {
        assertEquals(
            Math.abs(actual[i] - expected[i]) <= tolerance,
            true,
            `Channel ${i}: expected ~${expected[i]}, got ${actual[i]}`,
        );
    }
}

for (
    const [name, alpha, expectedEdge] of [
        ["full-bleed", 1, [220, 30, 40]],
        ["transparent", 0, [255, 255, 255]],
        ["semi-transparent edges", 0.5, [255, 255, 255]],
    ] as const
) {
    Deno.test(`icon presentation: ${name}`, async () => {
        const rgba = new Uint8Array(32 * 32 * 4);
        for (let y = 0; y < 32; y++) {
            for (let x = 0; x < 32; x++) {
                const offset = (y * 32 + x) * 4;
                rgba.set([
                    220,
                    30,
                    40,
                    x === 0 || y === 0 || x === 31 || y === 31
                        ? Math.round(alpha * 255)
                        : 255,
                ], offset);
            }
        }
        const bytes = await sharp(rgba, {
            raw: { width: 32, height: 32, channels: 4 },
        }).png().toBuffer();
        const result = await normalizeIcon(bytes, "image/png");
        const meta = await sharp(result).metadata();
        assertEquals(meta.format, "webp");
        assertEquals(meta.width, 160);
        assertEquals(meta.height, 160);

        const { data, info } = await sharp(result).removeAlpha().raw().toBuffer(
            { resolveWithObject: true },
        );
        assertEquals(info.width, 160);
        assertEquals(info.height, 160);
        assertColorNear([...data.subarray(0, 3)], expectedEdge);
        const centre = (80 * 160 + 80) * 3;
        assertColorNear([...data.subarray(centre, centre + 3)], [220, 30, 40]);
    });
}

Deno.test("icon presentation: trims excess transparent padding and tolerates 254 alpha noise", async () => {
    // 1. Padded transparent icon (64x64 canvas with 16x16 centered mark)
    const padded = new Uint8Array(64 * 64 * 4);
    for (let y = 24; y < 40; y++) {
        for (let x = 24; x < 40; x++) {
            const offset = (y * 64 + x) * 4;
            padded.set([40, 120, 220, 255], offset);
        }
    }
    const paddedBytes = await sharp(padded, {
        raw: { width: 64, height: 64, channels: 4 },
    }).png().toBuffer();
    const trimmedResult = await normalizeIcon(paddedBytes, "image/png");
    const trimmedRaw = await sharp(trimmedResult).removeAlpha().raw().toBuffer(
        { resolveWithObject: true },
    );
    // At (40, 40) which is inside the 96x96 inner square (starts at 32, 32)
    const innerPixel = (40 * 160 + 40) * 3;
    assertColorNear(
        [...trimmedRaw.data.subarray(innerPixel, innerPixel + 3)],
        [40, 120, 220],
    );
    // Outer margin (10, 10) remains white
    const outerPixel = (10 * 160 + 10) * 3;
    assertColorNear(
        [...trimmedRaw.data.subarray(outerPixel, outerPixel + 3)],
        [255, 255, 255],
    );

    // 2. Near-opaque (alpha=254) square stays full-bleed
    const noisy = new Uint8Array(32 * 32 * 4);
    for (let i = 0; i < 32 * 32; i++) {
        noisy.set([20, 180, 90, i === 0 ? 254 : 255], i * 4);
    }
    const noisyBytes = await sharp(noisy, {
        raw: { width: 32, height: 32, channels: 4 },
    }).png().toBuffer();
    const fullBleedResult = await normalizeIcon(noisyBytes, "image/png");
    const fullBleedRaw = await sharp(fullBleedResult).removeAlpha().raw()
        .toBuffer({ resolveWithObject: true });
    assertColorNear([...fullBleedRaw.data.subarray(0, 3)], [20, 180, 90]);

    // 3. forceFullBleed fills canvas even with alpha=0 corners
    const rounded = new Uint8Array(32 * 32 * 4);
    for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
            const isCorner = (x === 0 || x === 31) && (y === 0 || y === 31);
            rounded.set([10, 80, 200, isCorner ? 0 : 255], (y * 32 + x) * 4);
        }
    }
    const roundedBytes = await sharp(rounded, {
        raw: { width: 32, height: 32, channels: 4 },
    }).png().toBuffer();
    const forcedResult = await normalizeIcon(roundedBytes, "image/png", {
        forceFullBleed: true,
    });
    const forcedRaw = await sharp(forcedResult).removeAlpha().raw().toBuffer(
        { resolveWithObject: true },
    );
    // Inside edge (2, 80) should be artwork color rather than 20% white border
    const topEdge = (2 * 160 + 80) * 3;
    assertColorNear(
        [...forcedRaw.data.subarray(topEdge, topEdge + 3)],
        [10, 80, 200],
    );
});
