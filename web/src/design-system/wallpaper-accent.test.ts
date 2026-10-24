import { assert, assertEquals } from "@std/assert";
import {
    type AccentPalette,
    deriveWallpaperAccent,
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
    const checks: [string, Rgb, Rgb, number][] = [
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
        for (const theme of ["light", "dark"] as const) {
            const distance = hueDistance(
                hueOf(derived[theme].accent),
                hueOf(source),
            );
            assert(
                distance <= 20,
                `${source} ${theme} accent ${derived[theme].accent} drifts ${
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

Deno.test("wallpaper accent: the focal region decides between competing hues", () => {
    const pixels = split([220, 30, 30], [30, 60, 220]);
    const left = deriveWallpaperAccent(pixels, { focalX: 0, focalY: 0.5 });
    const right = deriveWallpaperAccent(pixels, { focalX: 1, focalY: 0.5 });
    assert(hueDistance(hueOf(left.light.accent), hueOf("#dc1e1e")) <= 20);
    assert(hueDistance(hueOf(right.light.accent), hueOf("#1e3cdc")) <= 20);
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
