import { assertEquals } from "@std/assert";
import sharp from "sharp";
import { normalizeIcon } from "./presentation.ts";

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
        const { data, info } = await sharp(result).removeAlpha().raw().toBuffer(
            { resolveWithObject: true },
        );
        assertEquals(info.width, 256);
        assertEquals(info.height, 256);
        assertEquals([...data.subarray(0, 3)], [...expectedEdge]);
        const centre = (128 * 256 + 128) * 3;
        assertEquals([...data.subarray(centre, centre + 3)], [220, 30, 40]);
    });
}
