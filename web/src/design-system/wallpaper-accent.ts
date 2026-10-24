/**
 * Wallpaper-derived accent: pick the dominant hue of the wallpaper's focal
 * region, then solve a light and a dark accent palette in OKLCH whose
 * lightness meets the same contrast pairs as the nine preset accents.
 *
 * Pure and deterministic: identical pixels and focal point give an identical
 * palette, so every device that can read the wallpaper derives the same colour.
 */

export interface WallpaperPixels {
    readonly width: number;
    readonly height: number;
    /** RGBA, row-major, as `ImageData.data`. */
    readonly data: ArrayLike<number>;
}

export interface FocalPoint {
    readonly focalX: number;
    readonly focalY: number;
}

/** OKLCH seed; `chroma` 0 means the wallpaper is neutral. */
export interface AccentSeed {
    readonly hue: number;
    readonly chroma: number;
}

/** The four accent tokens for one theme, as `#rrggbb`. */
export interface AccentPalette {
    readonly accent: string;
    readonly hover: string;
    readonly active: string;
    readonly foreground: string;
}

export interface WallpaperAccent {
    readonly seed: AccentSeed;
    readonly light: AccentPalette;
    readonly dark: AccentPalette;
}

type Rgb = readonly [number, number, number];

/**
 * Surfaces the accent is checked against, mirroring `tokens.css`
 * (`--background`, `--surface`, `--surface-soft`, `--accent-soft-mix`).
 * `wallpaper-accent.test.ts` checks the palettes against the live tokens.
 */
const SURFACES = {
    light: {
        background: [0xf4, 0xf4, 0xf5],
        surface: [0xff, 0xff, 0xff],
        surfaceSoft: [0xeb, 0xeb, 0xee],
        softMix: 0.09,
    },
    dark: {
        background: [0x11, 0x11, 0x13],
        surface: [0x1c, 0x1c, 0x1f],
        surfaceSoft: [0x2a, 0x2a, 0x2e],
        softMix: 0.12,
    },
} as const satisfies Record<
    "light" | "dark",
    {
        background: Rgb;
        surface: Rgb;
        surfaceSoft: Rgb;
        softMix: number;
    }
>;

/** WCAG AA text and non-text (focus ring) minimums. */
const TEXT_CONTRAST = 4.5;
const RING_CONTRAST = 3;
/** The solver keeps this headroom for browser colour-mix rounding. */
const CONTRAST_MARGIN = 0.1;

/** Share of the focal window around the focal point, per axis. */
const FOCAL_WINDOW = 0.5;
const HUE_BINS = 24;
/** Pixels below this OKLCH chroma read as grey and do not vote for a hue. */
const COLORFUL_CHROMA = 0.04;
/** A hue needs this share of the counted pixels; otherwise the wallpaper is neutral. */
const MIN_HUE_SHARE = 0.04;
const MIN_ACCENT_CHROMA = 0.08;
const MAX_ACCENT_CHROMA = 0.2;
const STATE_STEP = 0.07;
const LIGHTNESS_STEP = 0.005;

function toLinear(channel: number): number {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
    const s = value <= 0.0031308
        ? value * 12.92
        : 1.055 * value ** (1 / 2.4) - 0.055;
    return s * 255;
}

/** sRGB (0–255) → OKLab. */
function oklab(r: number, g: number, b: number): [number, number, number] {
    const lr = toLinear(r);
    const lg = toLinear(g);
    const lb = toLinear(b);
    const l = Math.cbrt(
        0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
    );
    const m = Math.cbrt(
        0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
    );
    const s = Math.cbrt(
        0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
    );
    return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
}

/** OKLCH → linear sRGB, unclamped. */
function linearRgb(lightness: number, chroma: number, hue: number): Rgb {
    const radians = hue * Math.PI / 180;
    const a = chroma * Math.cos(radians);
    const b = chroma * Math.sin(radians);
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
}

function inGamut(rgb: Rgb): boolean {
    return rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
}

/** OKLCH → 8-bit sRGB, reducing chroma at fixed lightness and hue until in gamut. */
function toSrgb(lightness: number, chroma: number, hue: number): Rgb {
    const l = Math.min(1, Math.max(0, lightness));
    let low = 0;
    let high = chroma;
    if (!inGamut(linearRgb(l, high, hue))) {
        for (let i = 0; i < 24; i++) {
            const mid = (low + high) / 2;
            if (inGamut(linearRgb(l, mid, hue))) low = mid;
            else high = mid;
        }
        high = low;
    }
    return linearRgb(l, high, hue).map((v) =>
        Math.round(fromLinear(Math.min(1, Math.max(0, v))))
    ) as unknown as Rgb;
}

function relativeLuminance([r, g, b]: Rgb): number {
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrast(a: Rgb, b: Rgb): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(color: Rgb, share: number, base: Rgb): Rgb {
    return [0, 1, 2].map((i) =>
        color[i] * share + base[i] * (1 - share)
    ) as unknown as Rgb;
}

function hex(rgb: Rgb): string {
    return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Pixel bounds of the focal window, or the whole image without a focal point. */
function region(
    { width, height }: WallpaperPixels,
    focal: FocalPoint | undefined,
): { x0: number; y0: number; x1: number; y1: number } {
    if (!focal) return { x0: 0, y0: 0, x1: width, y1: height };
    const w = Math.max(1, Math.round(width * FOCAL_WINDOW));
    const h = Math.max(1, Math.round(height * FOCAL_WINDOW));
    const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
    const x0 = clamp(Math.round(focal.focalX * width - w / 2), width - w);
    const y0 = clamp(Math.round(focal.focalY * height - h / 2), height - h);
    return { x0, y0, x1: x0 + w, y1: y0 + h };
}

/** Lightness weight: near-black and near-white pixels carry little hue. */
function lightnessWeight(lightness: number): number {
    return Math.min(1, Math.max(0, (lightness - 0.1) / 0.2)) *
        Math.min(1, Math.max(0, (0.98 - lightness) / 0.15));
}

/** Dominant hue of the (focal) region, weighted by chroma; chroma 0 when neutral. */
export function wallpaperAccentSeed(
    pixels: WallpaperPixels,
    focal?: FocalPoint,
): AccentSeed {
    const bins = Array.from({ length: HUE_BINS }, () => ({
        weight: 0,
        count: 0,
        x: 0,
        y: 0,
        chroma: 0,
    }));
    let counted = 0;
    const { x0, y0, x1, y1 } = region(pixels, focal);
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = (y * pixels.width + x) * 4;
            if (pixels.data[i + 3] < 128) continue;
            counted++;
            const [l, a, b] = oklab(
                pixels.data[i],
                pixels.data[i + 1],
                pixels.data[i + 2],
            );
            const chroma = Math.hypot(a, b);
            if (chroma < COLORFUL_CHROMA) continue;
            const weight = chroma * lightnessWeight(l);
            if (weight === 0) continue;
            const hue = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
            const bin = bins[Math.floor(hue / (360 / HUE_BINS)) % HUE_BINS];
            bin.weight += weight;
            bin.count++;
            bin.x += weight * a / chroma;
            bin.y += weight * b / chroma;
            bin.chroma += weight * chroma;
        }
    }
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < HUE_BINS; i++) {
        const score = bins[i].weight +
            0.5 * (bins[(i + HUE_BINS - 1) % HUE_BINS].weight +
                    bins[(i + 1) % HUE_BINS].weight);
        if (score > bestScore) {
            best = i;
            bestScore = score;
        }
    }
    if (best < 0) return { hue: 0, chroma: 0 };
    const window = [best - 1, best, best + 1].map((i) =>
        bins[(i + HUE_BINS) % HUE_BINS]
    );
    const count = window.reduce((sum, bin) => sum + bin.count, 0);
    if (count < counted * MIN_HUE_SHARE) return { hue: 0, chroma: 0 };
    const weight = window.reduce((sum, bin) => sum + bin.weight, 0);
    const hue = (Math.atan2(
                window.reduce((sum, bin) => sum + bin.y, 0),
                window.reduce((sum, bin) => sum + bin.x, 0),
            ) * 180 / Math.PI + 360) % 360;
    const chroma = window.reduce((sum, bin) => sum + bin.chroma, 0) / weight;
    // Rounded so imperceptible decoding differences settle on one seed.
    return {
        hue: Math.round(hue) % 360,
        chroma: Math.round(chroma * 200) / 200,
    };
}

export interface AccentContrast {
    readonly label: string;
    readonly ratio: number;
    readonly minimum: number;
}

function rgb(value: string): Rgb {
    const n = parseInt(value.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The pairs every accent must hold, as `web/e2e/accent-contrast.test.ts` checks the presets. */
export function accentContrast(
    theme: "light" | "dark",
    palette: AccentPalette,
): AccentContrast[] {
    const { background, surface, surfaceSoft, softMix } = SURFACES[theme];
    const accent = rgb(palette.accent);
    const foreground = rgb(palette.foreground);
    const pairs: [string, Rgb, Rgb, number][] = [
        ["强调色文字 / 表面", accent, surface, TEXT_CONTRAST],
        [
            "强调色文字 / 浅底",
            accent,
            mix(accent, softMix, surface),
            TEXT_CONTRAST,
        ],
        ["前景 / 强调色", foreground, accent, TEXT_CONTRAST],
        ["前景 / 悬停", foreground, rgb(palette.hover), TEXT_CONTRAST],
        ["前景 / 按下", foreground, rgb(palette.active), TEXT_CONTRAST],
        ["焦点环 / 背景", accent, background, RING_CONTRAST],
        ["焦点环 / 表面", accent, surface, RING_CONTRAST],
        ["焦点环 / 次表面", accent, surfaceSoft, RING_CONTRAST],
    ];
    return pairs.map(([label, a, b, minimum]) => ({
        label,
        ratio: contrast(a, b),
        minimum,
    }));
}

/**
 * Light: the lightest accent from L 0.56 down that holds white text and reads
 * on light surfaces. Dark: the darkest accent from L 0.74 up that holds dark
 * text and reads on dark surfaces. Both terminate: black / white always pass.
 */
export function accentPalette(
    seed: AccentSeed,
    theme: "light" | "dark",
): AccentPalette {
    const chroma = seed.chroma === 0
        ? 0
        : Math.min(MAX_ACCENT_CHROMA, Math.max(MIN_ACCENT_CHROMA, seed.chroma));
    const { hue } = seed;
    const direction = theme === "light" ? -1 : 1;
    const foreground = hex(
        theme === "light"
            ? [255, 255, 255]
            : toSrgb(0.18, Math.min(chroma, 0.04), hue),
    );
    let lightness = theme === "light" ? 0.56 : 0.74;
    for (;;) {
        const [accent, hover, active] = [0, 1, 2].map((step) =>
            hex(toSrgb(lightness + direction * step * STATE_STEP, chroma, hue))
        );
        const palette = { accent, hover, active, foreground };
        const atLimit = theme === "light" ? lightness <= 0 : lightness >= 1;
        const holds = accentContrast(theme, palette).every((check) =>
            check.ratio >= check.minimum + CONTRAST_MARGIN
        );
        if (holds || atLimit) return palette;
        lightness += direction * LIGHTNESS_STEP;
    }
}

export function deriveWallpaperAccent(
    pixels: WallpaperPixels,
    focal?: FocalPoint,
): WallpaperAccent {
    const seed = wallpaperAccentSeed(pixels, focal);
    return {
        seed,
        light: accentPalette(seed, "light"),
        dark: accentPalette(seed, "dark"),
    };
}
