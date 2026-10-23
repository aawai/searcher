import sharp from "sharp";
import { parseICO } from "icojs";

/** Only entirely opaque square artwork fills the tile; antialiased/transparent
 * edges need the white brand canvas and proportional breathing room. */
export function isFullBleed(
    rgba: Uint8Array,
    width: number,
    height: number,
): boolean {
    if (width !== height || width < 1) return false;
    for (let i = 3; i < rgba.length; i += 4) {
        if (rgba[i] !== 255) return false;
    }
    return true;
}

/** Store a ready-to-display 256px tile once, not a client-side pixel heuristic.
 * The decoder limits uncompressed work and rejects malformed/oversized inputs. */
export async function normalizeIcon(
    bytes: Uint8Array,
    contentType: string,
): Promise<Uint8Array> {
    let input = bytes;
    if (contentType === "image/x-icon") {
        const images = await parseICO(
            new Uint8Array(bytes).buffer,
            "image/png",
        );
        const largest = images.sort((a, b) =>
            b.width * b.height - a.width * a.height
        )[0];
        if (!largest) throw new Error("ICO 未包含有效图像");
        input = new Uint8Array(largest.buffer);
    }
    const { data, info } = await sharp(input, {
        limitInputPixels: 4096 * 4096,
        density: 192,
    }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const fullBleed = isFullBleed(data, info.width, info.height);
    // 20% on each side leaves 60% for a transparent mark.
    const edge = fullBleed ? 256 : 154;
    let image = sharp(data, {
        raw: { width: info.width, height: info.height, channels: 4 },
    }).resize(edge, edge, {
        fit: fullBleed ? "cover" : "contain",
        background: "#ffffff",
    }).flatten({ background: "#ffffff" });
    if (!fullBleed) {
        image = image.extend({
            top: 51,
            bottom: 51,
            left: 51,
            right: 51,
            background: "#ffffff",
        });
    }
    return await image.png().toBuffer();
}
