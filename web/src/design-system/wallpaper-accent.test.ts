import { assert, assertEquals } from "@std/assert";
import {
    type AccentPalette,
    classifyMastheadBackdrop,
    deriveWallpaperAccent,
    type HighContrastAccent,
    oklchToSrgb,
    resolveBackdropPolarity,
    resolveMastheadBackdrop,
    srgbToOklch,
    wallpaperDarkTone,
    type WallpaperPixels,
} from "./wallpaper-accent.ts";

const css = await Deno.readTextFile(new URL("./tokens.css", import.meta.url));

type Rgb = readonly [number, number, number];
type Theme = "light" | "dark";

function declarations(selector: string): Map<string, string> {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const blocks = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "g");
    const result = new Map<string, string>();
    for (const block of css.matchAll(blocks)) {
        for (
            const declaration of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)
        ) result.set(declaration[1], declaration[2].trim());
    }
    return result;
}

function themeTokens(theme: Theme): Map<string, string> {
    const layers = [declarations(":root")];
    if (theme === "dark") layers.push(declarations('[data-theme="dark"]'));
    return new Map(layers.flatMap((layer) => [...layer]));
}

function hex(value: string): Rgb {
    const match = value.match(/^#([0-9a-f]{6})$/i);
    if (!match) throw new Error(`expected #RRGGBB, got ${value}`);
    const n = parseInt(match[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: Rgb): number {
    const lin = (v: number) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/** `color-mix(in srgb, accent p%, base)`, as `--accent-soft` is defined. */
function mix(accent: Rgb, percent: number, base: Rgb): Rgb {
    const p = percent / 100;
    return [0, 1, 2].map((i) =>
        accent[i] * p + base[i] * (1 - p)
    ) as unknown as Rgb;
}

function percent(tokens: Map<string, string>, name: string): number {
    const match = tokens.get(name)?.match(/^(\d+(?:\.\d+)?)%$/);
    if (!match) throw new Error(`${name} must be a percentage`);
    return Number(match[1]);
}

/** The same pairs `web/e2e/accent-contrast.test.ts` checks for the nine presets. */
function contrastFailures(theme: Theme, palette: AccentPalette): string[] {
    const tokens = themeTokens(theme);
    const surface = hex(tokens.get("--surface")!);
    const accent = hex(palette.accent);
    const soft = mix(accent, percent(tokens, "--accent-soft-mix"), surface);
    // Balanced readability mask followed by the unchanged masthead veil.
    // Black is the light theme's least favourable wallpaper; dimmed white
    // is the dark theme's least favourable wallpaper.
    const background = hex(tokens.get("--background")!);
    const wallpaper = theme === "light" ? 0 : 255 * 0.55;
    const veil = theme === "light" ? 0.66 : 0.5;
    const backdrop = background.map((channel) =>
        channel * veil + (1 - veil) * (channel * 0.24 + wallpaper * 0.76)
    ) as unknown as Rgb;
    const checks: [string, Rgb, Rgb, number][] = [
        ["masthead accent text on veil", hex(palette.masthead), backdrop, 4.5],
        ["accent text on surface", accent, surface, 4.5],
        ["foreground on accent", hex(palette.foreground), accent, 4.5],
        [
            "foreground on hover",
            hex(palette.foreground),
            hex(palette.hover),
            4.5,
        ],
        [
            "foreground on active",
            hex(palette.foreground),
            hex(palette.active),
            4.5,
        ],
        ["accent text on accent-soft", accent, soft, 4.5],
        [
            "focus ring on background",
            accent,
            hex(tokens.get("--background")!),
            3,
        ],
        ["focus ring on surface", accent, surface, 3],
        [
            "focus ring on soft surface",
            accent,
            hex(tokens.get("--surface-soft")!),
            3,
        ],
    ];
    return checks.flatMap(([label, a, b, minimum]) => {
        const ratio = contrast(a, b);
        return ratio >= minimum
            ? []
            : [`${theme} ${label}: ${ratio.toFixed(2)}:1 < ${minimum}:1`];
    });
}

/**
 * High contrast themes, against the live `[data-contrast="more"]` tokens:
 * accent text 7:1 on every neutral surface, 4.5:1 on its tints, and the
 * fixed foreground 4.5:1 on the three fills.
 */
function highContrastFailures(
    theme: Theme,
    palette: HighContrastAccent,
): string[] {
    const layers = [themeTokens(theme), declarations('[data-contrast="more"]')];
    if (theme === "dark") {
        layers.push(declarations('[data-theme="dark"][data-contrast="more"]'));
    }
    const tokens = new Map(layers.flatMap((layer) => [...layer]));
    const foreground = declarations(
        '[data-contrast="more"],\n[data-contrast="more"] [data-accent]',
    ).get("--accent-foreground")!.match(/^light-dark\(([^,]+), ([^)]+)\)$/)!;
    const color = (name: string) => {
        const value = tokens.get(name)!;
        const reference = value.match(/^var\((--[\w-]+)\)$/);
        return hex(reference ? tokens.get(reference[1])! : value);
    };
    const accent = hex(palette.accent);
    const checks: [string, Rgb, number][] = [
        ...[
            "--background",
            "--surface",
            "--surface-soft",
            "--surface-highlight",
            "--surface-grouped-canvas",
            "--surface-l3",
        ].map((name): [string, Rgb, number] => [name, color(name), 7]),
        [
            "--accent-soft",
            mix(
                accent,
                percent(tokens, "--accent-soft-mix"),
                color("--surface"),
            ),
            4.5,
        ],
        [
            "--accent-subtle",
            mix(
                accent,
                percent(tokens, "--accent-subtle-mix"),
                color("--surface-soft"),
            ),
            4.5,
        ],
    ];
    const fill = hex(foreground[theme === "light" ? 1 : 2]);
    return [
        ...checks.flatMap(([surface, rgb, minimum]) => {
            const ratio = contrast(accent, rgb);
            return ratio >= minimum ? [] : [
                `${theme} high contrast accent on ${surface}: ${
                    ratio.toFixed(2)
                }:1 < ${minimum}:1`,
            ];
        }),
        ...(["accent", "hover", "active"] as const).flatMap((slot) => {
            const ratio = contrast(fill, hex(palette[slot]));
            return ratio >= 4.5 ? [] : [
                `${theme} high contrast text on ${slot}: ${
                    ratio.toFixed(2)
                }:1 < 4.5:1`,
            ];
        }),
    ];
}

function solid(rgb: Rgb, width = 8, height = 8): WallpaperPixels {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        data.set([...rgb, 255], i * 4);
    }
    return { width, height, data };
}

/** Deterministic xorshift noise so "photo" fixtures are stable across runs. */
function noise(seed: number): () => number {
    let state = seed;
    return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return ((state >>> 0) % 1000) / 1000;
    };
}

/** Sky over grass: hue bands with per-pixel jitter, like a downsampled photo. */
function landscape(width = 48, height = 32): WallpaperPixels {
    const random = noise(7);
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const sky = y < height * 0.6;
            const base: Rgb = sky ? [110, 165, 225] : [70, 130, 55];
            const jitter = (random() - 0.5) * 40;
            data.set(
                [...base.map((v) => v + jitter), 255],
                (y * width + x) * 4,
            );
        }
    }
    return { width, height, data };
}

/** Left half `left`, right half `right`. */
function split(left: Rgb, right: Rgb, width = 16, height = 8): WallpaperPixels {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            data.set(
                [...(x < width / 2 ? left : right), 255],
                (y * width + x) * 4,
            );
        }
    }
    return { width, height, data };
}

/** OKLCH hue of an sRGB colour, in degrees. */
function hueOf(value: string): number {
    const [r, g, b] = hex(value).map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360;
}

function hueDistance(a: number, b: number): number {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

function isNeutral(value: string): boolean {
    const [r, g, b] = hex(value);
    return Math.max(r, g, b) - Math.min(r, g, b) <= 6;
}

const FIXTURES: readonly [string, WallpaperPixels][] = [
    ["pure black", solid([0, 0, 0])],
    ["pure white", solid([255, 255, 255])],
    ["mid grey", solid([128, 128, 128])],
    ["saturated red", solid([255, 0, 0])],
    ["saturated yellow", solid([255, 255, 0])],
    ["saturated green", solid([0, 255, 0])],
    ["saturated cyan", solid([0, 255, 255])],
    ["saturated blue", solid([0, 0, 255])],
    ["saturated magenta", solid([255, 0, 255])],
    ["neon orange", solid([255, 120, 0])],
    ["pastel lilac", solid([230, 220, 245])],
    ["deep navy", solid([8, 16, 60])],
    ["landscape photo", landscape()],
    ["red and blue halves", split([220, 30, 30], [30, 60, 220])],
];

for (const [name, pixels] of FIXTURES) {
    Deno.test(`wallpaper accent ${name}: light and dark palettes hold primary text 4.5:1 and focus ring 3:1`, () => {
        const derived = deriveWallpaperAccent(pixels);
        const failures = [
            ...contrastFailures("light", derived.light),
            ...contrastFailures("dark", derived.dark),
        ];
        assertEquals(failures, []);
    });
    Deno.test(`wallpaper accent ${name}: high contrast pair holds accent text 7:1 on high contrast surfaces`, () => {
        const { highContrast } = deriveWallpaperAccent(pixels);
        assertEquals([
            ...highContrastFailures("light", highContrast.light),
            ...highContrastFailures("dark", highContrast.dark),
        ], []);
    });
}

Deno.test("wallpaper accent: the same wallpaper always yields the same palette", () => {
    const first = deriveWallpaperAccent(landscape());
    const second = deriveWallpaperAccent(landscape());
    assertEquals(second, first);
});

Deno.test("wallpaper accent: the palette keeps the wallpaper's dominant hue", () => {
    for (
        const rgb of [
            [200, 40, 40],
            [40, 150, 60],
            [40, 80, 200],
            [230, 140, 30],
            [140, 60, 200],
        ] as const
    ) {
        const source = `#${
            rgb.map((v) => v.toString(16).padStart(2, "0")).join("")
        }`;
        const derived = deriveWallpaperAccent(solid(rgb));
        for (
            const [theme, accent] of [
                ["light", derived.light.accent],
                ["dark", derived.dark.accent],
                ["high contrast light", derived.highContrast.light.accent],
                ["high contrast dark", derived.highContrast.dark.accent],
            ]
        ) {
            const distance = hueDistance(hueOf(accent), hueOf(source));
            assert(
                distance <= 20,
                `${source} ${theme} accent ${accent} drifts ${
                    distance.toFixed(1)
                }°`,
            );
        }
    }
});

Deno.test("wallpaper accent: a mostly blue sky photo yields a blue accent", () => {
    const derived = deriveWallpaperAccent(landscape());
    assert(hueDistance(hueOf(derived.light.accent), hueOf("#6ea5e1")) <= 20);
});

Deno.test("wallpaper accent: centre-grey frame with coloured border still picks the border hue", () => {
    const width = 40;
    const height = 40;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const inCenter = x >= width * 0.25 && x < width * 0.75 &&
                y >= height * 0.25 && y < height * 0.75;
            data.set(
                inCenter ? [140, 140, 140, 255] : [40, 110, 210, 255],
                (y * width + x) * 4,
            );
        }
    }
    const derived = deriveWallpaperAccent({ width, height, data });
    assert(hueDistance(hueOf(derived.light.accent), hueOf("#286ed2")) <= 20);
});

Deno.test("wallpaper accent: mostly white wallpaper with small edge red accents picks red", () => {
    const width = 50;
    const height = 50;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // ~4% red accent along the top-right corner; rest is pure white.
            const isRed = x >= width - 10 && y < 10;
            data.set(
                isRed ? [220, 40, 40, 255] : [255, 255, 255, 255],
                (y * width + x) * 4,
            );
        }
    }
    const derived = deriveWallpaperAccent({ width, height, data });
    assert(hueDistance(hueOf(derived.light.accent), hueOf("#dc2828")) <= 20);
});

Deno.test("wallpaper accent: centre soft-weighting favours centre subject over equal-area border", () => {
    const width = 40;
    const height = 40;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Centre ~50% area (28x28 = 784px) is blue; outer ~50% (816px) is red.
            const inCenter = x >= 6 && x < 34 && y >= 6 && y < 34;
            data.set(
                inCenter ? [35, 90, 215, 255] : [215, 45, 45, 255],
                (y * width + x) * 4,
            );
        }
    }
    const derived = deriveWallpaperAccent({ width, height, data });
    assert(hueDistance(hueOf(derived.light.accent), hueOf("#235ad7")) <= 20);
});

Deno.test("wallpaper accent: large muted slate-blue backdrop resists small saturated red accent", () => {
    const width = 40;
    const height = 40;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        // 85% muted slate-blue (low chroma ~0.06), 15% saturated red noise.
        data.set(
            i % 20 < 3 ? [230, 30, 30, 255] : [115, 130, 155, 255],
            i * 4,
        );
    }
    const derived = deriveWallpaperAccent({ width, height, data });
    assert(hueDistance(hueOf(derived.light.accent), hueOf("#73829b")) <= 20);
});

Deno.test("wallpaper accent: black, white and grey wallpapers yield a neutral accent", () => {
    for (const rgb of [[0, 0, 0], [255, 255, 255], [128, 128, 128]] as const) {
        const derived = deriveWallpaperAccent(solid(rgb));
        for (const theme of ["light", "dark"] as const) {
            assert(isNeutral(derived[theme].accent), `${rgb} ${theme}`);
        }
    }
});

Deno.test("wallpaper accent: a small saturated subject on grey still sets the hue", () => {
    const width = 20;
    const height = 20;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        // 10% of the frame is orange; the rest is neutral grey.
        data.set(
            i % 10 === 0 ? [240, 130, 20, 255] : [120, 120, 120, 255],
            i * 4,
        );
    }
    const derived = deriveWallpaperAccent({ width, height, data });
    assert(hueDistance(hueOf(derived.light.accent), hueOf("#f08214")) <= 20);
});

Deno.test("wallpaper accent: transparent pixels do not vote", () => {
    const pixels = solid([30, 160, 60]);
    const data = new Uint8ClampedArray(pixels.data);
    // A fully transparent red pixel block must not pull the hue toward red.
    for (let i = 0; i < 40; i++) data.set([255, 0, 0, 0], i * 4);
    const derived = deriveWallpaperAccent({ ...pixels, data });
    assert(hueDistance(hueOf(derived.light.accent), hueOf("#1ea03c")) <= 20);
});

Deno.test("wallpaper darkTone: records perceptual lightness and ambient glow pair", () => {
    const bright = wallpaperDarkTone(solid([250, 250, 250]));
    const dark = wallpaperDarkTone(solid([18, 20, 24]));

    assert(bright.lightness > 0.9);
    assert(dark.lightness < 0.25);
});

Deno.test("wallpaper darkTone: fully transparent images fall back to balanced defaults and remain deterministic", () => {
    const empty = {
        width: 4,
        height: 4,
        data: new Uint8ClampedArray(4 * 4 * 4),
    };
    const tone = wallpaperDarkTone(empty);
    assertEquals(tone, {
        lightness: 0.5,
        ambientPrimary: "#262d42",
        ambientSecondary: "#1b1d2e",
    });
    assertEquals(
        deriveWallpaperAccent(landscape()).darkTone,
        deriveWallpaperAccent(landscape()).darkTone,
    );
});

Deno.test("wallpaper darkTone: dual-color wallpaper extracts distinct ambientPrimary and ambientSecondary hues", () => {
    const width = 12;
    const height = 8;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const left = x < width / 2;
            data[i] = left ? 225 : 42;
            data[i + 1] = left ? 58 : 112;
            data[i + 2] = left ? 82 : 228;
            data[i + 3] = 255;
        }
    }
    const tone = wallpaperDarkTone({ width, height, data });
    assert(/^#[0-9a-f]{6}$/.test(tone.ambientPrimary));
    assert(/^#[0-9a-f]{6}$/.test(tone.ambientSecondary));
    assert(tone.ambientPrimary !== tone.ambientSecondary);
});

Deno.test("wallpaper accent: pale white-backdrop illustration with ~2.5% pastel rose blush extracts rose hue instead of neutral grey", () => {
    const width = 40;
    const height = 40;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            // ~2.5% centered subtle rose blush ([245, 212, 216], OKLCH C ≈ 0.032)
            const inBlush = x >= 18 && x < 26 && y >= 18 && y < 23;
            data.set(
                inBlush ? [245, 212, 216, 255] : [252, 252, 252, 255],
                i,
            );
        }
    }
    const derived = deriveWallpaperAccent({ width, height, data });
    assert(
        derived.seed.chroma > 0,
        `expected pastel blush to avoid neutral collapse, got seed=${
            JSON.stringify(derived.seed)
        }`,
    );
    assert(
        hueDistance(hueOf(derived.dark.accent), hueOf("#f5d4d8")) <= 25,
        `expected rose hue near #f5d4d8, got ${derived.dark.accent}`,
    );
});

Deno.test("topBand: samples top 16% lightness independently from the bottom of the frame", () => {
    const width = 10;
    const height = 20;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        const v = y < 4 ? 248 : 16;
        for (let x = 0; x < width; x++) {
            data.set([v, v, v, 255], (y * width + x) * 4);
        }
    }
    const derived = deriveWallpaperAccent({ width, height, data });
    assert(derived.topBand.lightness > 0.95);
    assertEquals(derived.topBand.spread, 0);
});

Deno.test("resolveBackdropPolarity: switches ink polarity across light/dark schemes with hysteresis deadband", () => {
    assertEquals(
        resolveBackdropPolarity({ scheme: "dark", lightness: null }),
        "dark",
    );
    assertEquals(
        resolveBackdropPolarity({ scheme: "light", lightness: null }),
        "light",
    );
    assertEquals(
        resolveBackdropPolarity({ scheme: "dark", lightness: 0.58 }),
        "light",
    );
    assertEquals(
        resolveBackdropPolarity({ scheme: "dark", lightness: 0.57 }),
        "dark",
    );
    assertEquals(
        resolveBackdropPolarity({ scheme: "light", lightness: 0.50 }),
        "dark",
    );
    assertEquals(
        resolveBackdropPolarity({ scheme: "light", lightness: 0.51 }),
        "light",
    );
});

Deno.test("resolveMastheadBackdrop & classifyMastheadBackdrop: classifies polarity and clean/textured/contrast tiers", () => {
    // Missing/unreadable band defaults safely to scheme polarity + textured.
    assertEquals(
        resolveMastheadBackdrop({ scheme: "light", band: null }),
        { polarity: "light", tone: "textured" },
    );
    assertEquals(
        resolveMastheadBackdrop({ scheme: "dark", band: null }),
        { polarity: "dark", tone: "textured" },
    );

    // Bright clean background in dark scheme flips polarity to light + clean (zero dark cushion).
    assertEquals(
        resolveMastheadBackdrop({
            scheme: "dark",
            band: { lightness: 0.90, spread: 0.03 },
        }),
        { polarity: "light", tone: "clean" },
    );

    // Dark night sky in light scheme flips polarity to dark + clean (zero white cushion).
    assertEquals(
        resolveMastheadBackdrop({
            scheme: "light",
            band: { lightness: 0.20, spread: 0.05 },
        }),
        { polarity: "dark", tone: "clean" },
    );

    // Mid-tone grey -> textured.
    assertEquals(
        classifyMastheadBackdrop({
            scheme: "light",
            band: { lightness: 0.65, spread: 0.04 },
        }),
        "textured",
    );

    // Busy high-clutter texture -> contrast.
    assertEquals(
        classifyMastheadBackdrop({
            scheme: "dark",
            band: { lightness: 0.52, spread: 0.26 },
        }),
        "contrast",
    );
    assertEquals(
        classifyMastheadBackdrop({
            scheme: "light",
            band: { lightness: 0.60, spread: 0.25 },
        }),
        "contrast",
    );
});

Deno.test("srgbToOklch & oklchToSrgb: round-trips in-gamut colors and clamps out-of-gamut chroma", () => {
    const samples: Rgb[] = [
        [29, 29, 31],
        [190, 18, 60],
        [10, 102, 194],
        [244, 244, 245],
    ];
    for (const [r, g, b] of samples) {
        const [L, C, H] = srgbToOklch(r, g, b);
        const [rr, rg, rb] = oklchToSrgb(L, C, H);
        assert(Math.abs(rr - r) <= 1, `r mismatch: ${rr} vs ${r}`);
        assert(Math.abs(rg - g) <= 1, `g mismatch: ${rg} vs ${g}`);
        assert(Math.abs(rb - b) <= 1, `b mismatch: ${rb} vs ${b}`);
    }
    const clamped = oklchToSrgb(0.65, 0.5, 145);
    for (const ch of clamped) {
        assert(Number.isInteger(ch) && ch >= 0 && ch <= 255);
    }
});
