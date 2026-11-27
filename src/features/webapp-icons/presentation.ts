import sharp from "sharp";
import { parseICO } from "icojs";

/** Only entirely opaque square artwork fills the tile; antialiased/transparent
 * edges need the white brand canvas and proportional breathing room.
 * Tolerates minor 1-bit alpha compression noise (alpha >= 250). */
export function isFullBleed(
    rgba: Uint8Array,
    width: number,
    height: number,
): boolean {
    if (width !== height || width < 1) return false;
    for (let i = 3; i < rgba.length; i += 4) {
        if (rgba[i] < 250) return false;
    }
    return true;
}

export function trimTransparentBounds(
    rgba: Uint8Array,
    width: number,
    height: number,
): { left: number; top: number; width: number; height: number } | null {
    if (width < 1 || height < 1) return null;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = rgba[(y * width + x) * 4 + 3];
            if (alpha > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < minX || maxY < minY) return null;
    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    if (cropWidth === width && cropHeight === height) return null;
    return { left: minX, top: minY, width: cropWidth, height: cropHeight };
}

export const ICON_OUTPUT_SIZE = 160;
const ICON_INNER_SIZE = 96; // 60% of 160px
const ICON_PAD_SIZE = 32; // (160 - 96) / 2 = 20% margin on each side

/** Store a ready-to-display 160px WebP tile once, not a client-side pixel heuristic.
 * Covers up to 48px @ 3x DPR (144px) while keeping files compact.
 * The decoder limits uncompressed work and rejects malformed/oversized inputs. */
export async function normalizeIcon(
    bytes: Uint8Array,
    contentType: string,
    options?: { forceFullBleed?: boolean },
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
    const fullBleed = options?.forceFullBleed === true ||
        isFullBleed(data, info.width, info.height);
    // 20% on each side leaves 60% for a transparent mark.
    const edge = fullBleed ? ICON_OUTPUT_SIZE : ICON_INNER_SIZE;
    let image = sharp(data, {
        raw: { width: info.width, height: info.height, channels: 4 },
    });
    if (!fullBleed) {
        const bounds = trimTransparentBounds(data, info.width, info.height);
        if (bounds) {
            image = image.extract(bounds);
        }
    }
    image = image.resize(edge, edge, {
        fit: fullBleed ? "cover" : "contain",
        background: fullBleed
            ? "#ffffff"
            : { r: 255, g: 255, b: 255, alpha: 0 },
    }).flatten({ background: "#ffffff" });
    if (!fullBleed) {
        image = image.extend({
            top: ICON_PAD_SIZE,
            bottom: ICON_PAD_SIZE,
            left: ICON_PAD_SIZE,
            right: ICON_PAD_SIZE,
            background: "#ffffff",
        });
    }
    return await image.webp({ quality: 88, effort: 4 }).toBuffer();
}
