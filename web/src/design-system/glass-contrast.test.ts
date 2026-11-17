import { assert } from "@std/assert";
import { ACCENT_IDS, type AccentId } from "@shared/contracts.ts";
import { WALLPAPER_READABILITY_MASKS } from "@shared/wallpaper-presentation.ts";

const css = await Deno.readTextFile(new URL("./tokens.css", import.meta.url));
const markdownCss = await Deno.readTextFile(
    new URL("../components/searcher/markdown.css", import.meta.url),
);

type Rgb = readonly [number, number, number];
type Scheme = "light" | "dark";
/** A theme preference as `<html>` renders it: base scheme plus `data-contrast`. */
interface Theme {
    readonly id: string;
    readonly scheme: Scheme;
    readonly highContrast: boolean;
}
const THEMES: readonly Theme[] = [
    { id: "light", scheme: "light", highContrast: false },
    { id: "dark", scheme: "dark", highContrast: false },
    { id: "high-contrast-light", scheme: "light", highContrast: true },
    { id: "high-contrast-dark", scheme: "dark", highContrast: true },
];
/** The high contrast opaque glass block: selector list as written in tokens.css. */
const HIGH_CONTRAST_GLASS =
    '[data-contrast="more"],\n[data-contrast="more"] [data-glass]';
/** The high contrast accent mapping onto the palette's `--accent-hc*` pair. */
const HIGH_CONTRAST_ACCENT =
    '[data-contrast="more"],\n[data-contrast="more"] [data-accent]';
const TIERS = ["off", "soft", "regular", "clear"] as const;
/** Tiers whose Material keeps the readability floor; `clear` is see-through by choice. */
const MATERIAL_FLOOR_TIERS = ["off", "soft", "regular"] as const;
/** WCAG 1.4.3: body and secondary information text. */
const WCAG_AA_TEXT = 4.5;
/** High contrast themes: accent text and links on neutral surfaces, WCAG 1.4.6 (AAA). */
const HIGH_CONTRAST_ACCENT_TEXT = 7;
/**
 * WCAG 1.4.3 large text: ≥24px, or ≥18.66px at weight ≥700. Searcher's
 * weights stop at 600, so only roles of ≥24px qualify (see LARGE_TEXT_ROLES).
 */
const WCAG_AA_LARGE_TEXT = 3;
const LARGE_TEXT_MIN_PX = 24;
/** WCAG 1.4.11: graphical objects needed to identify a control or its state. */
const WCAG_AA_NON_TEXT = 3;
/**
 * Synthetic regression probe for `--muted` over glass. The masthead has its
 * own AA text colours; glass still requires real-page measurement.
 */
const MUTED_GLASS_PROBE = 3;
/**
 * Icon tile edge: system grammar (VISUAL_LANGUAGE.md 应用图标), not WCAG
 * 1.4.11 — an app icon is identified by its image, not by its edge.
 */
const GLYPH_EDGE = 3;

/** Backdrops behind a glass surface: dark and bright photo extremes plus saturated hues. */
const BACKDROPS: readonly Rgb[] = [
    [32, 32, 32],
    [224, 224, 224],
    [200, 30, 30],
    [30, 30, 200],
    [30, 160, 30],
    [230, 210, 40],
    [40, 200, 210],
    [200, 40, 200],
    [128, 128, 128],
];

/**
 * Synthetic wallpaper colour fixtures, not samples of the user's private images.
 * Keep adjacent light/dark and saturated patches: averaging an illustration
 * would hide the local contrast failures that a Material plate must prevent.
 */
const WALLPAPER_FIXTURES: readonly {
    name: string;
    samples: readonly Rgb[];
}[] = [
    {
        name: "light-portrait",
        samples: [
            [255, 255, 255],
            [246, 242, 235],
            [224, 191, 169],
            [173, 132, 112],
            [42, 34, 31],
        ],
    },
    {
        name: "high-detail-illustration",
        samples: [
            [255, 255, 255],
            [245, 238, 204],
            [225, 241, 248],
            [250, 180, 45],
            [210, 45, 75],
            [40, 165, 180],
            [45, 55, 145],
            [15, 20, 30],
        ],
    },
];

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

function declarationsIn(
    source: string,
    selector: string,
): Map<string, string> {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const blocks = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "g");
    const result = new Map<string, string>();
    for (const block of source.matchAll(blocks)) {
        for (
            const declaration of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)
        ) result.set(declaration[1], declaration[2].trim());
    }
    return result;
}

/**
 * Tokens for one theme and tier in source order: base scheme, the accent
 * palette, high contrast colours (after the palettes) and their accent
 * mapping, the tier block, then the high contrast opaque glass block that
 * follows the tiers. `light-dark()` pairs resolve to the theme's scheme.
 */
function cascade(
    theme: Theme,
    tier: string,
    accent: AccentId = "blue",
): Map<string, string> {
    const layers = [declarations(":root")];
    if (theme.scheme === "dark") {
        layers.push(declarations('[data-theme="dark"]'));
    }
    layers.push(
        declarations(
            accent === "blue"
                ? ':root,\n[data-accent="blue"]'
                : `[data-accent="${accent}"]`,
        ),
    );
    if (theme.highContrast) {
        layers.push(declarations('[data-contrast="more"]'));
        if (theme.scheme === "dark") {
            layers.push(
                declarations('[data-theme="dark"][data-contrast="more"]'),
            );
        }
        layers.push(declarations(HIGH_CONTRAST_ACCENT));
    }
    layers.push(declarations(`[data-glass="${tier}"]`));
    if (theme.highContrast) layers.push(declarations(HIGH_CONTRAST_GLASS));
    return new Map(
        layers.flatMap((layer) => [...layer]).map(([name, value]) => {
            const pair = value.match(/^light-dark\(([^,]+), ([^)]+)\)$/);
            return [
                name,
                pair ? pair[theme.scheme === "light" ? 1 : 2] : value,
            ];
        }),
    );
}

function resolve(tokens: Map<string, string>, name: string): string {
    const value = tokens.get(name);
    if (value === undefined) throw new Error(`missing token ${name}`);
    const reference = value.match(/^var\((--[\w-]+)\)$/);
    return reference ? resolve(tokens, reference[1]) : value;
}

/** Resolves a two-colour `color-mix(in srgb, var(--a) N%, var(--b))` token. */
function mixedColor(tokens: Map<string, string>, name: string): Rgb {
    const value = resolve(tokens, name);
    const match = value.match(
        /^color-mix\(in srgb, var\((--[\w-]+)\) (\d+(?:\.\d+)?)%, var\((--[\w-]+)\)\)$/,
    );
    if (!match) return hex(value);
    const first = hex(resolve(tokens, match[1]));
    const second = hex(resolve(tokens, match[3]));
    const weight = Number(match[2]) / 100;
    return first.map((channel, index) =>
        Math.round(channel * weight + second[index] * (1 - weight))
    ) as unknown as Rgb;
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
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

function over(fill: Rgb, alpha: number, backdrop: Rgb): Rgb {
    return [0, 1, 2].map((i) =>
        alpha * fill[i] + (1 - alpha) * backdrop[i]
    ) as unknown as Rgb;
}

function fillPercent(tokens: Map<string, string>, name: string): number {
    const value = tokens.get(name);
    const match = value?.match(/^(\d+(?:\.\d+)?)%$/);
    if (!match) throw new Error(`${name} must be a percentage, got ${value}`);
    return Number(match[1]);
}

function rgbAlpha(tokens: Map<string, string>, name: string): {
    color: Rgb;
    alpha: number;
} {
    const value = resolve(tokens, name);
    const match = value.match(
        /^rgb\((\d+) (\d+) (\d+) \/ (0(?:\.\d+)?|1(?:\.0+)?)\)$/,
    );
    if (!match) throw new Error(`expected rgb(r g b / alpha), got ${value}`);
    return {
        color: [Number(match[1]), Number(match[2]), Number(match[3])],
        alpha: Number(match[4]),
    };
}

for (const theme of THEMES) {
    for (const tier of TIERS) {
        Deno.test(`glass ${theme.id}/${tier}: body text holds AA and --muted 3:1 on the worst backdrop`, () => {
            const tokens = cascade(theme, tier);
            const text = hex(resolve(tokens, "--foreground"));
            const muted = hex(resolve(tokens, "--muted"));
            // Material is mixed over --material-solid, Floating over --surface-l3.
            // Floating keeps the floor in every tier; the see-through `clear` Material does not.
            const floating = [
                `--glass-thick-${theme.scheme}`,
                "--surface-l3",
                "--material-thick-sheen-scale",
            ] as const;
            const surfaces = tier === "clear" ? [floating] : [
                [
                    `--glass-regular-${theme.scheme}`,
                    "--material-solid",
                    "--material-regular-sheen-scale",
                ] as const,
                floating,
            ];
            // The sheen fades linearly to 0 at 55% of the height; text starts no higher than 25% down.
            const sheenPeak = fillPercent(tokens, "--glass-sheen-peak") / 100 *
                (1 - 0.25 / 0.55);
            for (const [fillToken, baseToken, sheenScaleToken] of surfaces) {
                const sheen = sheenPeak *
                    Number(resolve(tokens, sheenScaleToken));
                const alpha = fillPercent(tokens, fillToken) / 100;
                const base = hex(resolve(tokens, baseToken));
                const worst = (color: Rgb) =>
                    Math.min(
                        ...BACKDROPS.map((backdrop) =>
                            contrast(
                                color,
                                over(
                                    [255, 255, 255],
                                    sheen,
                                    over(base, alpha, backdrop),
                                ),
                            )
                        ),
                    );
                assert(
                    worst(text) >= WCAG_AA_TEXT,
                    `${fillToken} ${alpha * 100}% gives ${
                        worst(text).toFixed(2)
                    }:1`,
                );
                assert(
                    worst(muted) >= MUTED_GLASS_PROBE,
                    `${fillToken} ${alpha * 100}% gives muted ${
                        worst(muted).toFixed(2)
                    }:1`,
                );
            }
        });
    }

    if (theme.highContrast) {
        Deno.test(`glass ${theme.id}: every tier renders solid, without blur or sheen`, () => {
            for (const tier of TIERS) {
                const tokens = cascade(theme, tier);
                for (const kind of ["regular", "thick"]) {
                    const fill = `--glass-${kind}-${theme.scheme}`;
                    assert(
                        fillPercent(tokens, fill) === 100,
                        `${tier} ${fill}`,
                    );
                    assert(
                        tokens.get(`--material-${kind}-filter`) === "none",
                        `${tier} --material-${kind}-filter`,
                    );
                    assert(
                        tokens.get(`--material-${kind}-sheen-scale`) === "0",
                        `${tier} --material-${kind}-sheen-scale`,
                    );
                }
                assert(
                    fillPercent(tokens, `--masthead-veil-${theme.scheme}`) ===
                        100,
                    tier,
                );
            }
        });
        continue;
    }

    Deno.test(`glass ${theme.id}: tiers get more transparent from off to clear, thick never below regular`, () => {
        const fills = TIERS.map((tier) => {
            const tokens = cascade(theme, tier);
            return {
                regular: fillPercent(tokens, `--glass-regular-${theme.scheme}`),
                thick: fillPercent(tokens, `--glass-thick-${theme.scheme}`),
            };
        });
        for (let i = 1; i < fills.length; i++) {
            assert(fills[i].regular < fills[i - 1].regular, `tier ${TIERS[i]}`);
        }
        for (const fill of fills) assert(fill.thick >= fill.regular);
    });
}

for (const theme of THEMES) {
    Deno.test(`mini icon ${theme.id}: fallback letter holds AA on opaque --surface-solid`, () => {
        // Mini icon tiles are opaque --surface-solid: their fallback letter is
        // --foreground on that plate, independent of the glass tier.
        const tokens = cascade(theme, "regular");
        const letter = contrast(
            hex(resolve(tokens, "--foreground")),
            hex(resolve(tokens, "--surface-solid")),
        );
        assert(
            letter >= WCAG_AA_TEXT,
            `mini icon letter ${letter.toFixed(2)}:1`,
        );
    });
}

/**
 * Inline StatusBanner (semantic.css): each tone's text colour on its own tint
 * of --surface. The tints are opaque, so the page behind does not matter.
 */
for (const theme of THEMES) {
    Deno.test(`status banner ${theme.id}: every tone's text holds AA on its tint`, () => {
        const tokens = cascade(theme, "regular");
        const color = (name: string) => hex(resolve(tokens, name));
        const tenPercentOfSurface = (name: string) =>
            over(color(name), 0.1, color("--surface"));
        const tones: readonly [string, Rgb, Rgb][] = [
            ["info", color("--foreground"), color("--surface-soft")],
            ["error", color("--danger"), tenPercentOfSurface("--danger")],
            ["success", color("--success"), tenPercentOfSurface("--success")],
            [
                "warning",
                color("--warning"),
                mixedColor(tokens, "--warning-soft"),
            ],
        ];
        for (const [tone, text, tint] of tones) {
            const ratio = contrast(text, tint);
            assert(
                ratio >= WCAG_AA_TEXT,
                `${tone} banner text ${ratio.toFixed(2)}:1`,
            );
        }
    });
}

/** The derived canvas veils the wallpaper with --background; it does not depend on the glass tier. */
function derivedCanvas(theme: Theme): Rgb[] {
    const tokens = cascade(theme, "regular");
    const alpha = fillPercent(tokens, `--canvas-derived-${theme.scheme}`) / 100;
    const veil = hex(resolve(tokens, "--background"));
    return BACKDROPS.map((backdrop) => over(veil, alpha, backdrop));
}

/** The home masthead veil over the default "均衡" readability mask. */
function mastheadVeil(theme: Theme): Rgb[] {
    const tokens = cascade(theme, "regular");
    const background = hex(resolve(tokens, "--background"));
    const veilAlpha = fillPercent(tokens, `--masthead-veil-${theme.scheme}`) /
        100;
    // Dark themes dim the wallpaper image with `--wallpaper-dim`
    // (`brightness()`), modelled as a per-channel scale (Chromium applies
    // the shorthand in sRGB). The light theme declares no dim.
    const brightness = Number(
        tokens.get("--wallpaper-dim")?.match(
            /brightness\((\d+(?:\.\d+)?)\)/,
        )?.[1] ?? 1,
    );
    // The wallpaper surface paints --background at the default "均衡"
    // readability stage over the dimmed image; the veil washes over the
    // blurred result.
    const maskAlpha = WALLPAPER_READABILITY_MASKS.balanced;
    return [
        ...BACKDROPS,
        [0, 0, 0] as Rgb,
        [255, 255, 255] as Rgb,
        [255, 0, 0] as Rgb,
        [0, 255, 0] as Rgb,
        [0, 0, 255] as Rgb,
    ].map((backdrop) => {
        const dimmed = backdrop.map((channel) =>
            channel * brightness
        ) as unknown as Rgb;
        const copy = over(background, maskAlpha, dimmed);
        return over(background, veilAlpha, copy);
    });
}

/** Opaque surfaces that carry page and window content. */
function solidSurfaces(theme: Theme): Rgb[] {
    const tokens = cascade(theme, "regular");
    return ["--background", "--surface", "--surface-l3"].map((name) =>
        hex(resolve(tokens, name))
    );
}

const LARGE_TEXT_BACKDROPS = {
    "solid surfaces": solidSurfaces,
    "derived canvas": derivedCanvas,
    "masthead veil": mastheadVeil,
} as const;

/**
 * Text roles whose every size is ≥24px, so WCAG 1.4.3 judges them at 3:1.
 * Mirrors the ≥24px rows of VISUAL_LANGUAGE.md 字号阶梯登记表; the registry
 * test below fails when a size token crosses 24px without updating this list.
 * The masthead day printed straight on the wallpaper (narrow collapsed state)
 * is measured in the browser by the A6 wallpaper readability check, not here.
 */
const LARGE_TEXT_ROLES: readonly {
    size: string;
    color: string;
    backdrops: readonly (keyof typeof LARGE_TEXT_BACKDROPS)[];
}[] = [
    {
        size: "--font-page-title-size",
        color: "--foreground",
        backdrops: ["solid surfaces", "derived canvas"],
    },
    {
        size: "--font-masthead-day-size",
        color: "--foreground",
        backdrops: ["masthead veil"],
    },
];

for (const theme of THEMES) {
    Deno.test(`derived canvas ${theme.id}: body and --muted text set on it hold AA on the worst backdrop`, () => {
        const tokens = cascade(theme, "regular");
        for (const name of ["--foreground", "--muted"]) {
            const color = hex(resolve(tokens, name));
            const worst = Math.min(
                ...derivedCanvas(theme).map((canvas) =>
                    contrast(color, canvas)
                ),
            );
            assert(
                worst >= WCAG_AA_TEXT,
                `${name} on --canvas-derived-${theme.scheme} gives ${
                    worst.toFixed(2)
                }:1`,
            );
        }
    });
}

for (const theme of THEMES) {
    Deno.test(`home masthead veil ${theme.id}: body, secondary and accent text hold AA over the default readability mask`, () => {
        const tokens = cascade(theme, "regular");
        const probes = [
            ["--foreground", WCAG_AA_TEXT],
            ["--masthead-muted", WCAG_AA_TEXT],
        ] as const;
        for (const [name, floor] of probes) {
            const color = hex(resolve(tokens, name));
            const worst = Math.min(
                ...mastheadVeil(theme).map((veil) => contrast(color, veil)),
            );
            assert(
                worst >= floor,
                `${name} on --masthead-veil-${theme.scheme} gives ${
                    worst.toFixed(2)
                }:1`,
            );
        }
        for (const preset of ACCENT_IDS) {
            const color = hex(
                resolve(
                    cascade(theme, "regular", preset),
                    "--masthead-accent-text",
                ),
            );
            const worst = Math.min(
                ...mastheadVeil(theme).map((veil) => contrast(color, veil)),
            );
            assert(
                worst >= WCAG_AA_TEXT,
                `${preset} on masthead veil: ${worst.toFixed(2)}:1`,
            );
        }
    });
}

Deno.test("large text roles: match the size tokens that reach 24px", () => {
    const sizes = new Map<string, number[]>();
    for (
        const [, name, px] of css.matchAll(
            /(--font-[\w-]+-size)\s*:\s*(\d+(?:\.\d+)?)px\s*;/g,
        )
    ) sizes.set(name, [...(sizes.get(name) ?? []), Number(px)]);
    const reachesLarge = [...sizes]
        .filter(([, values]) => values.some((px) => px >= LARGE_TEXT_MIN_PX))
        .map(([name]) => name)
        .sort();
    assert(
        JSON.stringify(reachesLarge) ===
            JSON.stringify(LARGE_TEXT_ROLES.map((role) => role.size).sort()),
        `size tokens reaching ${LARGE_TEXT_MIN_PX}px: ${
            reachesLarge.join(", ")
        }`,
    );
    for (const role of LARGE_TEXT_ROLES) {
        const values = sizes.get(role.size) ?? [];
        assert(
            values.every((px) => px >= LARGE_TEXT_MIN_PX),
            `${role.size} drops below ${LARGE_TEXT_MIN_PX}px (${values}); ` +
                "it must be judged as body text at 4.5:1",
        );
    }
});

for (const theme of THEMES) {
    for (const role of LARGE_TEXT_ROLES) {
        Deno.test(`large text ${theme.id}: ${role.size} holds 3:1 on its backdrops`, () => {
            const color = hex(resolve(cascade(theme, "regular"), role.color));
            for (const backdrop of role.backdrops) {
                const worst = Math.min(
                    ...LARGE_TEXT_BACKDROPS[backdrop](theme).map((surface) =>
                        contrast(color, surface)
                    ),
                );
                assert(
                    worst >= WCAG_AA_LARGE_TEXT,
                    `${role.color} on ${backdrop} gives ${worst.toFixed(2)}:1`,
                );
            }
        });
    }
}

for (const theme of THEMES) {
    for (const tier of MATERIAL_FLOOR_TIERS) {
        for (const fixture of WALLPAPER_FIXTURES) {
            Deno.test(`home glyph ${theme.id}/${tier}/${fixture.name}: white tile edge holds 3:1 against light wallpaper`, () => {
                const tokens = cascade(theme, tier);
                // The dedicated inset glyph edge is painted above the
                // server-normalized opaque white canvas, not behind the image.
                const edge = rgbAlpha(tokens, "--glyph-edge");
                const paintedEdge = over(
                    edge.color,
                    edge.alpha,
                    [255, 255, 255],
                );
                const base = hex(resolve(tokens, "--material-solid"));
                const alpha =
                    fillPercent(tokens, `--glass-regular-${theme.scheme}`) /
                    100;
                const peak = fillPercent(tokens, "--glass-sheen-peak") / 100 *
                    Number(resolve(tokens, "--material-regular-sheen-scale"));
                for (const backdrop of fixture.samples) {
                    // Only the fixture's bright regions exercise the reported
                    // white-on-light failure; dark regions test other concerns.
                    if (luminance(backdrop) < 0.7) continue;
                    const ratio = contrast(paintedEdge, backdrop);
                    assert(
                        ratio >= GLYPH_EDGE,
                        `white glyph edge against ${backdrop}: ${
                            ratio.toFixed(2)
                        }:1`,
                    );
                    for (const sheen of [0, peak]) {
                        const plate = over(
                            [255, 255, 255],
                            sheen,
                            over(base, alpha, backdrop),
                        );
                        // On dark Material, the white tile itself supplies the
                        // boundary; on light Material, its inset edge must do so.
                        const boundary = theme.scheme === "dark"
                            ? [255, 255, 255] as const
                            : paintedEdge;
                        const plateRatio = contrast(boundary, plate);
                        assert(
                            plateRatio >= GLYPH_EDGE,
                            `white glyph boundary on plate over ${backdrop}, sheen ${sheen}: ${
                                plateRatio.toFixed(2)
                            }:1`,
                        );
                    }
                }
            });
        }
    }
}

for (const theme of THEMES) {
    Deno.test(`home note ${theme.id}: task box border holds 3:1 on neutral Material`, () => {
        // Task box is checked at the default regular tier, at the sheen level
        // just below the label baseline (0.1 of the height), where sheen is strongest.
        const tokens = cascade(theme, "regular");
        const alpha = fillPercent(tokens, `--glass-regular-${theme.scheme}`) /
            100;
        const peak = fillPercent(tokens, "--glass-sheen-peak") / 100 *
            Number(resolve(tokens, "--material-regular-sheen-scale"));
        const taskTokens = new Map([
            ...tokens,
            ...declarationsIn(markdownCss, ".markdown,\n.markdown-editor"),
        ]);
        const border = mixedColor(taskTokens, "--task-box-border");
        const base = hex(resolve(tokens, "--material-solid"));
        const sheen = peak * Math.max(0, 1 - 0.1 / 0.55);
        for (const backdrop of BACKDROPS) {
            const note = over(
                [255, 255, 255],
                sheen,
                over(base, alpha, backdrop),
            );
            const box = contrast(border, note);
            assert(
                box >= WCAG_AA_NON_TEXT,
                `task box border ${box.toFixed(2)}:1 on ${backdrop}`,
            );
        }
    });
}

/**
 * High contrast themes (VISUAL_LANGUAGE.md「高对比主题」): for every accent
 * preset, every opaque surface holds text, the palette's high contrast
 * accent, boundaries and focus indicators at their floors; there is no
 * translucent layer to sample. The accent holds AAA text (1.4.6) on the
 * neutral surfaces and AA on its own tints.
 */
for (const theme of THEMES.filter((candidate) => candidate.highContrast)) {
    Deno.test(`high contrast ${theme.id}: text, accent, boundaries and focus hold their floors on every surface for every preset`, () => {
        for (const preset of ACCENT_IDS) {
            const tokens = cascade(theme, "regular", preset);
            const color = (name: string) => hex(resolve(tokens, name));
            const accent = color("--accent");
            const tint = (mix: string, base: string) =>
                over(accent, fillPercent(tokens, mix) / 100, color(base));
            const surfaces: readonly [string, Rgb][] = [
                ...[
                    "--background",
                    "--surface",
                    "--surface-soft",
                    "--surface-l3",
                    "--surface-grouped-canvas",
                    "--surface-highlight",
                    "--material-solid",
                ].map((name) => [name, color(name)] as [string, Rgb]),
                ["--accent-soft", tint("--accent-soft-mix", "--surface")],
                [
                    "--accent-subtle",
                    tint("--accent-subtle-mix", "--surface-soft"),
                ],
            ];
            const floors: readonly [string, number][] = [
                ["--foreground", WCAG_AA_TEXT],
                ["--muted", WCAG_AA_TEXT],
                // Links, accent text and the 2px focus ring (A1).
                ["--accent", HIGH_CONTRAST_ACCENT_TEXT],
                ["--danger", WCAG_AA_TEXT],
                ["--success", WCAG_AA_TEXT],
                ["--warning", WCAG_AA_TEXT],
                // Checkbox, radio and switch outlines; switch off thumb.
                ["--border-control", WCAG_AA_NON_TEXT],
                // Window frames, dividers and the slider track.
                ["--border", WCAG_AA_NON_TEXT],
            ];
            // Only text and the accent sit on the accent tints (selected rows,
            // the drop target), at AA; status colours and boundaries stay on
            // neutrals.
            const onTints = new Set(["--foreground", "--muted", "--accent"]);
            for (const [name, floor] of floors) {
                for (const [surface, rgb] of surfaces) {
                    const onTint = surface.startsWith("--accent");
                    if (onTint && !onTints.has(name)) continue;
                    const ratio = contrast(color(name), rgb);
                    const minimum = onTint ? WCAG_AA_TEXT : floor;
                    assert(
                        ratio >= minimum,
                        `${preset}: ${name} on ${surface} gives ${
                            ratio.toFixed(2)
                        }:1`,
                    );
                }
            }
            // Accent fills: the selected segment, tab and navigation item, the
            // checked switch and primary buttons. Their focus ring sits 2px
            // out, so it is judged against the surfaces above, not the fill.
            for (
                const name of ["--accent", "--accent-hover", "--accent-active"]
            ) {
                const text = contrast(
                    color("--accent-foreground"),
                    color(name),
                );
                assert(
                    text >= WCAG_AA_TEXT,
                    `${preset}: text on ${name}: ${text.toFixed(2)}:1`,
                );
            }
            // Switch: the off thumb (--foreground) on its track.
            const thumb = contrast(
                color("--foreground"),
                color("--surface-soft"),
            );
            assert(
                thumb >= WCAG_AA_NON_TEXT,
                `switch thumb ${thumb.toFixed(2)}:1`,
            );
        }
    });
}

for (const theme of THEMES) {
    Deno.test(`theme preview ${theme.id}: the settings tile repeats the theme's own colours`, () => {
        const tokens = cascade(theme, "regular");
        const preview = (part: string) =>
            resolve(tokens, `--theme-preview-${theme.id}-${part}`);
        assert(preview("canvas") === resolve(tokens, "--background"));
        assert(preview("surface") === resolve(tokens, "--surface"));
        assert(preview("line") === resolve(tokens, "--border-control"));
        assert(
            preview("edge") ===
                resolve(
                    tokens,
                    theme.highContrast ? "--border-control" : "--border",
                ),
        );
    });
}
