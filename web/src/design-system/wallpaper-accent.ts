/**
 * Wallpaper-derived accent: pick the dominant hue of the full wallpaper with
 * gentle centre weighting (decoupled from wallpaper composition focal point),
 * then solve a light and a dark accent palette in OKLCH whose lightness meets
 * the same contrast pairs as the nine preset accents, plus a high contrast
 * pair that holds the high contrast themes' 7:1 accent floor.
 *
 * Pure and deterministic: identical pixels give an identical palette, so every
 * device that can read the wallpaper derives the same colour.
 */

export interface WallpaperPixels {
    readonly width: number;
    readonly height: number;
    /** RGBA, row-major, as `ImageData.data`. */
    readonly data: ArrayLike<number>;
}

/** OKLCH seed; `chroma` 0 means the wallpaper is neutral. */
export interface AccentSeed {
    readonly hue: number;
    readonly chroma: number;
}

/** Accent tokens for one theme, as `#rrggbb`. */
export interface AccentPalette {
    readonly accent: string;
    readonly hover: string;
    readonly active: string;
    readonly foreground: string;
    readonly masthead: string;
}

/** Accent fills for a high contrast theme; text on them is the theme's fixed foreground. */
export interface HighContrastAccent {
    readonly accent: string;
    readonly hover: string;
    readonly active: string;
}

export interface WallpaperDarkTone {
    /** Mean OKLab perceptual lightness (0 = black, 1 = white) across opaque pixels. */
    readonly lightness: number;
    /** Primary deep ambient glow hex for dark `ambient` mode. */
    readonly ambientPrimary: string;
    /** Secondary contrasting/harmonic ambient glow hex for dark `ambient` mode. */
    readonly ambientSecondary: string;
}

export interface MastheadBandTone {
    /** Mean OKLab perceptual lightness (0 = black, 1 = white) across opaque pixels in the band. */
    readonly lightness: number;
    /** Standard deviation of OKLab lightness across opaque pixels in the band (texture clutter). */
    readonly spread: number;
}

export interface MastheadBands {
    readonly left: MastheadBandTone;
    readonly right: MastheadBandTone;
}

export type BackdropPolarity = "light" | "dark";

export type MastheadBackdropTone = "clean" | "textured" | "contrast";

export interface MastheadBackdropClassification {
    readonly polarity: BackdropPolarity;
    readonly tone: MastheadBackdropTone;
}

export interface WallpaperAccent {
    readonly seed: AccentSeed;
    readonly light: AccentPalette;
    readonly dark: AccentPalette;
    readonly highContrast: {
        readonly light: HighContrastAccent;
        readonly dark: HighContrastAccent;
    };
    readonly darkTone: WallpaperDarkTone;
    readonly mastheadBands: MastheadBands;
    readonly topBand: MastheadBandTone;
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
        background: [0x07, 0x08, 0x0c],
        surface: [0x1a, 0x1a, 0x1f],
        surfaceSoft: [0x25, 0x25, 0x2b],
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

/**
 * High contrast surfaces, mirroring `[data-contrast="more"]` in `tokens.css`:
 * every opaque surface the accent is read on (`--background`, `--surface`,
 * `--surface-soft`, `--surface-highlight`, `--surface-grouped-canvas`), the
 * accent tints (`--accent-soft-mix` over `--surface`, `--accent-subtle-mix`
 * over `--surface-soft`) and the fixed `--accent-foreground`.
 */
const HIGH_CONTRAST_SURFACES = {
    light: {
        surfaces: [
            [0xff, 0xff, 0xff],
            [0xed, 0xed, 0xed],
            [0xe0, 0xe0, 0xe0],
            [0xf2, 0xf2, 0xf2],
        ],
        surface: [0xff, 0xff, 0xff],
        surfaceSoft: [0xed, 0xed, 0xed],
        softMix: 0.12,
        subtleMix: 0.18,
        foreground: [0xff, 0xff, 0xff],
    },
    dark: {
        surfaces: [
            [0x00, 0x00, 0x00],
            [0x1f, 0x1f, 0x1f],
            [0x33, 0x33, 0x33],
            [0x14, 0x14, 0x14],
        ],
        surface: [0x00, 0x00, 0x00],
        surfaceSoft: [0x1f, 0x1f, 0x1f],
        softMix: 0.18,
        subtleMix: 0.24,
        foreground: [0x00, 0x00, 0x00],
    },
} as const satisfies Record<
    "light" | "dark",
    {
        surfaces: readonly Rgb[];
        surface: Rgb;
        surfaceSoft: Rgb;
        softMix: number;
        subtleMix: number;
        foreground: Rgb;
    }
>;

/** WCAG AA text and non-text (focus ring) minimums. */
const TEXT_CONTRAST = 4.5;
const RING_CONTRAST = 3;
/** High contrast themes: accent text, links and rings hold WCAG AAA text (1.4.6). */
export const HIGH_CONTRAST_ACCENT_CONTRAST = 7;
/** The solver keeps this headroom for browser colour-mix rounding. */
const CONTRAST_MARGIN = 0.1;

/** Spatial weight floor at image corners; centre (0.5, 0.5) has weight 1.0. */
const EDGE_SPATIAL_WEIGHT = 0.45;
const CENTER_SPATIAL_SIGMA = 0.35;
const CENTER_SPATIAL_DENOM = 2 * CENTER_SPATIAL_SIGMA * CENTER_SPATIAL_SIGMA;
const CHROMA_EXPONENT = 0.75;
const HUE_BINS = 24;
/** Pixels below this OKLCH chroma read as grey and do not vote for a hue. */
const COLORFUL_CHROMA = 0.022;
/** A hue needs this share of the spatial weight; otherwise the wallpaper is neutral. */
const MIN_HUE_SHARE = 0.012;
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

/** Lightness weight: near-black and near-white pixels carry little hue. */
function lightnessWeight(lightness: number): number {
    return Math.min(1, Math.max(0, (lightness - 0.1) / 0.2)) *
        Math.min(1, Math.max(0, (0.98 - lightness) / 0.15));
}

interface HueBin {
    weight: number;
    spatialCount: number;
    x: number;
    y: number;
    chroma: number;
}

interface PixelSummary {
    bins: HueBin[];
    totalSpatial: number;
    meanL: number;
    opaqueCount: number;
    mastheadBands: MastheadBands;
    topBand: MastheadBandTone;
}

const MASTHEAD_BAND_SHARE = 0.34;
const TOP_BAND_SHARE = 0.16;
const DEFAULT_BAND_TONE: MastheadBandTone = { lightness: 0.5, spread: 0 };

function computeBandTone(
    sumL: number,
    sumL2: number,
    count: number,
    fallback: MastheadBandTone,
): MastheadBandTone {
    if (count <= 0) return fallback;
    const mean = sumL / count;
    const variance = Math.max(0, sumL2 / count - mean * mean);
    return {
        lightness: Math.round(mean * 1000) / 1000,
        spread: Math.round(Math.sqrt(variance) * 1000) / 1000,
    };
}

function summarizePixels(pixels: WallpaperPixels): PixelSummary {
    const bins: HueBin[] = Array.from({ length: HUE_BINS }, () => ({
        weight: 0,
        spatialCount: 0,
        x: 0,
        y: 0,
        chroma: 0,
    }));
    let totalSpatial = 0;
    let totalL = 0;
    let totalL2 = 0;
    let opaqueCount = 0;
    let leftL = 0;
    let leftL2 = 0;
    let leftCount = 0;
    let rightL = 0;
    let rightL2 = 0;
    let rightCount = 0;
    let topL = 0;
    let topL2 = 0;
    let topCount = 0;
    const leftEdge = pixels.width * MASTHEAD_BAND_SHARE;
    const rightEdge = pixels.width * (1 - MASTHEAD_BAND_SHARE);
    const topEdge = pixels.height * TOP_BAND_SHARE;
    for (let y = 0; y < pixels.height; y++) {
        const isTop = y < topEdge;
        for (let x = 0; x < pixels.width; x++) {
            const i = (y * pixels.width + x) * 4;
            if (pixels.data[i + 3] < 128) continue;
            const dx = (x + 0.5) / pixels.width - 0.5;
            const dy = (y + 0.5) / pixels.height - 0.5;
            const spatial = EDGE_SPATIAL_WEIGHT +
                (1 - EDGE_SPATIAL_WEIGHT) *
                    Math.exp(-(dx * dx + dy * dy) / CENTER_SPATIAL_DENOM);
            totalSpatial += spatial;
            const [l, a, b] = oklab(
                pixels.data[i],
                pixels.data[i + 1],
                pixels.data[i + 2],
            );
            const l2 = l * l;
            totalL += l;
            totalL2 += l2;
            opaqueCount++;
            if (x < leftEdge) {
                leftL += l;
                leftL2 += l2;
                leftCount++;
            }
            if (x >= rightEdge) {
                rightL += l;
                rightL2 += l2;
                rightCount++;
            }
            if (isTop) {
                topL += l;
                topL2 += l2;
                topCount++;
            }
            const chroma = Math.hypot(a, b);
            if (chroma < COLORFUL_CHROMA) continue;
            const lw = lightnessWeight(l);
            if (lw === 0) continue;
            const weight = spatial * (chroma ** CHROMA_EXPONENT) * lw;
            const hue = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
            const bin = bins[Math.floor(hue / (360 / HUE_BINS)) % HUE_BINS];
            bin.weight += weight;
            bin.spatialCount += spatial;
            bin.x += weight * a / chroma;
            bin.y += weight * b / chroma;
            bin.chroma += weight * chroma;
        }
    }
    const overallTone = computeBandTone(
        totalL,
        totalL2,
        opaqueCount,
        DEFAULT_BAND_TONE,
    );
    return {
        bins,
        totalSpatial,
        meanL: opaqueCount > 0 ? totalL / opaqueCount : 0.5,
        opaqueCount,
        mastheadBands: {
            left: computeBandTone(leftL, leftL2, leftCount, overallTone),
            right: computeBandTone(rightL, rightL2, rightCount, overallTone),
        },
        topBand: computeBandTone(topL, topL2, topCount, overallTone),
    };
}

/**
 * Resolves the foreground ink polarity (`"light"` = dark ink on bright art,
 * `"dark"` = light ink on dark art) for elements set directly on the wallpaper.
 */
export function resolveBackdropPolarity(input: {
    scheme: "light" | "dark";
    lightness?: number | null;
}): BackdropPolarity {
    const { scheme, lightness } = input;
    if (lightness == null || !Number.isFinite(lightness)) return scheme;
    if (scheme === "dark") {
        return lightness >= 0.58 ? "light" : "dark";
    }
    return lightness <= 0.50 ? "dark" : "light";
}

/**
 * Classifies the local wallpaper band behind the home masthead into foreground
 * ink polarity and adaptive backdrop cushion tier:
 * - `clean`: calm same-polarity backdrop -> zero cushion, zero text shadow,
 *   laser-crisp editorial ink;
 * - `textured`: mid-tone or gentle texture -> light same-polarity cushion;
 * - `contrast`: busy/high-clutter texture -> reinforced cushion & ink.
 */
export function resolveMastheadBackdrop(input: {
    scheme: "light" | "dark";
    band: MastheadBandTone | null;
}): MastheadBackdropClassification {
    const { scheme, band } = input;
    if (
        !band || !Number.isFinite(band.lightness) ||
        !Number.isFinite(band.spread)
    ) {
        return { polarity: scheme, tone: "textured" };
    }
    const polarity = resolveBackdropPolarity({
        scheme,
        lightness: band.lightness,
    });
    if (polarity === "light") {
        if (band.lightness >= 0.74 && band.spread <= 0.14) {
            return { polarity, tone: "clean" };
        }
        if (band.spread > 0.22 && band.lightness < 0.68) {
            return { polarity, tone: "contrast" };
        }
        return { polarity, tone: "textured" };
    }
    if (band.lightness <= 0.34 && band.spread <= 0.14) {
        return { polarity, tone: "clean" };
    }
    if (band.spread > 0.22 && band.lightness > 0.40) {
        return { polarity, tone: "contrast" };
    }
    return { polarity, tone: "textured" };
}

export function classifyMastheadBackdrop(input: {
    scheme: "light" | "dark";
    band: MastheadBandTone | null;
}): MastheadBackdropTone {
    return resolveMastheadBackdrop(input).tone;
}

function seedFromWindow(
    bins: HueBin[],
    centerIdx: number,
    totalSpatial: number,
): AccentSeed {
    const window = [centerIdx - 1, centerIdx, centerIdx + 1].map((i) =>
        bins[(i + HUE_BINS) % HUE_BINS]
    );
    const windowSpatial = window.reduce(
        (sum, bin) => sum + bin.spatialCount,
        0,
    );
    if (windowSpatial < totalSpatial * MIN_HUE_SHARE) {
        return { hue: 0, chroma: 0 };
    }
    const weight = window.reduce((sum, bin) => sum + bin.weight, 0);
    if (weight === 0) return { hue: 0, chroma: 0 };
    const hue = (Math.atan2(
                window.reduce((sum, bin) => sum + bin.y, 0),
                window.reduce((sum, bin) => sum + bin.x, 0),
            ) * 180 / Math.PI + 360) % 360;
    const chroma = window.reduce((sum, bin) => sum + bin.chroma, 0) / weight;
    return {
        hue: Math.round(hue) % 360,
        chroma: Math.round(chroma * 200) / 200,
    };
}

function resolveSeedFromSummary(
    summary: PixelSummary,
): { primary: AccentSeed; secondary: AccentSeed } {
    const { bins, totalSpatial } = summary;
    if (totalSpatial === 0) {
        return {
            primary: { hue: 0, chroma: 0 },
            secondary: { hue: 0, chroma: 0 },
        };
    }
    const scores = bins.map((bin, i) =>
        bin.weight +
        0.5 * (bins[(i + HUE_BINS - 1) % HUE_BINS].weight +
                bins[(i + 1) % HUE_BINS].weight)
    );
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < HUE_BINS; i++) {
        if (scores[i] > bestScore) {
            best = i;
            bestScore = scores[i];
        }
    }
    if (best < 0) {
        return {
            primary: { hue: 0, chroma: 0 },
            secondary: { hue: 0, chroma: 0 },
        };
    }
    const primary = seedFromWindow(bins, best, totalSpatial);
    if (primary.chroma === 0) {
        return { primary, secondary: { hue: 0, chroma: 0 } };
    }
    let secondBest = -1;
    let secondBestScore = 0;
    for (let i = 0; i < HUE_BINS; i++) {
        const binDeg = (i + 0.5) * (360 / HUE_BINS);
        const diff = Math.abs(((binDeg - primary.hue + 540) % 360) - 180);
        if (diff < 45) continue;
        if (scores[i] > secondBestScore) {
            secondBest = i;
            secondBestScore = scores[i];
        }
    }
    if (secondBest >= 0) {
        const candidate = seedFromWindow(bins, secondBest, totalSpatial);
        if (candidate.chroma > 0) {
            return { primary, secondary: candidate };
        }
    }
    return {
        primary,
        secondary: { hue: 0, chroma: 0 },
    };
}

/** Dominant hue of the full image with centre soft weighting; chroma 0 when neutral. */
export function wallpaperAccentSeed(pixels: WallpaperPixels): AccentSeed {
    return resolveSeedFromSummary(summarizePixels(pixels)).primary;
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
    // Worst sRGB composites of the balanced mask and masthead veil over
    // black (light) and dimmed white (dark), rounded conservatively.
    // Light: the 5th-percentile veil pixel measured over black at 1440
    // (wallpaper-readability), lighter than the flat composite.
    const backdrop: Rgb = theme === "light" ? [176, 176, 177] : [65, 65, 66];
    let mastheadLightness = theme === "light" ? 0.56 : 0.74;
    let masthead: string;
    for (;;) {
        masthead = hex(toSrgb(mastheadLightness, chroma, hue));
        if (
            contrast(rgb(masthead), backdrop) >=
                TEXT_CONTRAST + CONTRAST_MARGIN ||
            (theme === "light"
                ? mastheadLightness <= 0
                : mastheadLightness >= 1)
        ) break;
        mastheadLightness += direction * LIGHTNESS_STEP;
    }
    let lightness = theme === "light" ? 0.56 : 0.74;
    for (;;) {
        const [accent, hover, active] = [0, 1, 2].map((step) =>
            hex(toSrgb(lightness + direction * step * STATE_STEP, chroma, hue))
        );
        const palette = { accent, hover, active, foreground, masthead };
        const atLimit = theme === "light" ? lightness <= 0 : lightness >= 1;
        const holds = accentContrast(theme, palette).every((check) =>
            check.ratio >= check.minimum + CONTRAST_MARGIN
        );
        if (holds || atLimit) return palette;
        lightness += direction * LIGHTNESS_STEP;
    }
}

/**
 * The pairs a high contrast accent must hold: accent text on every opaque
 * neutral surface at 7:1, on its own tints (selected rows, drop targets) at
 * the AA 4.5:1 ordinary themes hold there, and the fixed foreground on the
 * accent fills at 4.5:1.
 */
export function highContrastAccentContrast(
    theme: "light" | "dark",
    palette: HighContrastAccent,
): AccentContrast[] {
    const { surfaces, surface, surfaceSoft, softMix, subtleMix, foreground } =
        HIGH_CONTRAST_SURFACES[theme];
    const accent = rgb(palette.accent);
    const pairs: [string, Rgb, Rgb, number][] = [
        ...surfaces.map((base): [string, Rgb, Rgb, number] => [
            `强调色文字 / ${hex(base)}`,
            accent,
            base,
            HIGH_CONTRAST_ACCENT_CONTRAST,
        ]),
        [
            "强调色文字 / 浅底",
            accent,
            mix(accent, softMix, surface),
            TEXT_CONTRAST,
        ],
        [
            "强调色文字 / 次浅底",
            accent,
            mix(accent, subtleMix, surfaceSoft),
            TEXT_CONTRAST,
        ],
        ...(["accent", "hover", "active"] as const).map((
            slot,
        ): [string, Rgb, Rgb, number] => [
            `前景 / ${slot}`,
            foreground,
            rgb(palette[slot]),
            TEXT_CONTRAST,
        ]),
    ];
    return pairs.map(([label, a, b, minimum]) => ({
        label,
        ratio: contrast(a, b),
        minimum,
    }));
}

/**
 * The high contrast accent keeps the seed's hue and chroma and moves only
 * lightness: light themes darken from L 0.56, dark themes lighten from
 * L 0.74, until every pair in `highContrastAccentContrast` holds. Hover and
 * active step further the same way, so text on them only gains contrast.
 * Terminates: black / white always pass.
 */
export function highContrastAccent(
    seed: AccentSeed,
    theme: "light" | "dark",
): HighContrastAccent {
    const chroma = seed.chroma === 0
        ? 0
        : Math.min(MAX_ACCENT_CHROMA, Math.max(MIN_ACCENT_CHROMA, seed.chroma));
    const direction = theme === "light" ? -1 : 1;
    let lightness = theme === "light" ? 0.56 : 0.74;
    for (;;) {
        const [accent, hover, active] = [0, 1, 2].map((step) =>
            hex(
                toSrgb(
                    Math.min(
                        1,
                        Math.max(0, lightness + direction * step * STATE_STEP),
                    ),
                    chroma,
                    seed.hue,
                ),
            )
        );
        const palette = { accent, hover, active };
        const atLimit = theme === "light" ? lightness <= 0 : lightness >= 1;
        const holds = highContrastAccentContrast(theme, palette).every((
            check,
        ) => check.ratio >= check.minimum + CONTRAST_MARGIN);
        if (holds || atLimit) return palette;
        lightness += direction * LIGHTNESS_STEP;
    }
}

const DEFAULT_DARK_TONE: WallpaperDarkTone = {
    lightness: 0.5,
    ambientPrimary: "#262d42",
    ambientSecondary: "#1b1d2e",
};

function solveAmbientGlowPair(
    primary: AccentSeed,
    secondary: AccentSeed,
): { ambientPrimary: string; ambientSecondary: string } {
    if (primary.chroma === 0) {
        return {
            ambientPrimary: "#262d42",
            ambientSecondary: "#1b1d2e",
        };
    }
    const pChroma = Math.min(0.145, Math.max(0.095, primary.chroma * 1.15));
    const isWarmRose = primary.hue < 38 || primary.hue >= 315;
    const secondaryIsWarmBrown = secondary.chroma > 0 &&
        secondary.hue >= 20 && secondary.hue <= 95;
    if (isWarmRose && (secondary.chroma === 0 || secondaryIsWarmBrown)) {
        const counterHue = (primary.hue + 228) % 360;
        const counterChroma = Math.min(
            0.11,
            Math.max(0.065, primary.chroma * 1.4),
        );
        return {
            ambientPrimary: hex(toSrgb(0.39, pChroma, primary.hue)),
            ambientSecondary: hex(toSrgb(0.30, counterChroma, counterHue)),
        };
    }
    const fallbackCounterHue = primary.hue >= 185 && primary.hue <= 285
        ? (primary.hue + 44) % 360
        : (primary.hue + 225) % 360;
    const sBase = secondary.chroma > 0 ? secondary : {
        hue: fallbackCounterHue,
        chroma: primary.chroma,
    };
    const sChroma = Math.min(0.135, Math.max(0.075, sBase.chroma * 0.92));
    return {
        ambientPrimary: hex(toSrgb(0.39, pChroma, primary.hue)),
        ambientSecondary: hex(toSrgb(0.32, sChroma, sBase.hue)),
    };
}

function darkToneFromSummary(summary: PixelSummary): WallpaperDarkTone {
    if (summary.opaqueCount === 0) return DEFAULT_DARK_TONE;

    const { meanL } = summary;
    const { primary, secondary } = resolveSeedFromSummary(summary);
    const glow = solveAmbientGlowPair(primary, secondary);

    return {
        lightness: Math.round(meanL * 1000) / 1000,
        ambientPrimary: glow.ambientPrimary,
        ambientSecondary: glow.ambientSecondary,
    };
}

/**
 * Derive wallpaper mean OKLab perceptual lightness and dual-tone ambient glow pair.
 */
export function wallpaperDarkTone(pixels: WallpaperPixels): WallpaperDarkTone {
    return darkToneFromSummary(summarizePixels(pixels));
}

export function deriveWallpaperAccent(
    pixels: WallpaperPixels,
): WallpaperAccent {
    const summary = summarizePixels(pixels);
    const { primary } = resolveSeedFromSummary(summary);
    return {
        seed: primary,
        light: accentPalette(primary, "light"),
        dark: accentPalette(primary, "dark"),
        highContrast: {
            light: highContrastAccent(primary, "light"),
            dark: highContrastAccent(primary, "dark"),
        },
        darkTone: darkToneFromSummary(summary),
        mastheadBands: summary.mastheadBands,
        topBand: summary.topBand,
    };
}
