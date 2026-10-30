import { assert } from "@std/assert";

const css = await Deno.readTextFile(new URL("./tokens.css", import.meta.url));
const markdownCss = await Deno.readTextFile(
    new URL("../components/searcher/markdown.css", import.meta.url),
);

type Rgb = readonly [number, number, number];
type Theme = "light" | "dark";
const TIERS = ["off", "soft", "regular", "clear"] as const;
/** Tiers whose Material keeps the readability floor; `clear` is see-through by choice. */
const MATERIAL_FLOOR_TIERS = ["off", "soft", "regular"] as const;
const WCAG_AA_TEXT = 4.5;
const SECONDARY_TEXT = 3;

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

/** Tokens for one theme and tier: theme colours, then the tier block (equal specificity: later rule wins). */
function cascade(theme: Theme, tier: string): Map<string, string> {
    const layers = [declarations(":root")];
    if (theme === "dark") layers.push(declarations('[data-theme="dark"]'));
    layers.push(declarations(`[data-glass="${tier}"]`));
    return new Map(layers.flatMap((layer) => [...layer]));
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

for (const theme of ["light", "dark"] as const) {
    for (const tier of TIERS) {
        Deno.test(`glass ${theme}/${tier}: body text holds AA and --muted 3:1 on the worst backdrop`, () => {
            const tokens = cascade(theme, tier);
            const text = hex(resolve(tokens, "--foreground"));
            const muted = hex(resolve(tokens, "--muted"));
            // Material is mixed over --material-solid, Floating over --surface-l3.
            // Floating keeps the floor in every tier; the see-through `clear` Material does not.
            const floating = [
                `--glass-thick-${theme}`,
                "--surface-l3",
            ] as const;
            const surfaces = tier === "clear" ? [floating] : [
                [`--glass-regular-${theme}`, "--material-solid"] as const,
                floating,
            ];
            // The sheen fades linearly to 0 at 55% of the height; text starts no higher than 25% down.
            const sheen = fillPercent(tokens, "--glass-sheen-peak") / 100 *
                Number(resolve(tokens, "--glass-sheen-scale")) *
                (1 - 0.25 / 0.55);
            for (const [fillToken, baseToken] of surfaces) {
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
                    worst(muted) >= SECONDARY_TEXT,
                    `${fillToken} ${alpha * 100}% gives muted ${
                        worst(muted).toFixed(2)
                    }:1`,
                );
            }
        });
    }

    Deno.test(`glass ${theme}: tiers get more transparent from off to clear, thick never below regular`, () => {
        const fills = TIERS.map((tier) => {
            const tokens = cascade(theme, tier);
            return {
                regular: fillPercent(tokens, `--glass-regular-${theme}`),
                thick: fillPercent(tokens, `--glass-thick-${theme}`),
            };
        });
        for (let i = 1; i < fills.length; i++) {
            assert(fills[i].regular < fills[i - 1].regular, `tier ${TIERS[i]}`);
        }
        for (const fill of fills) assert(fill.thick >= fill.regular);
    });
}

for (const theme of ["light", "dark"] as const) {
    Deno.test(`mini icon ${theme}: fallback letter holds AA on opaque --surface-solid`, () => {
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

for (const theme of ["light", "dark"] as const) {
    Deno.test(`derived canvas ${theme}: body and --muted text set on it hold AA on the worst backdrop`, () => {
        // The veil does not depend on the glass tier; `regular` is the default scope.
        const tokens = cascade(theme, "regular");
        const alpha = fillPercent(tokens, `--canvas-derived-${theme}`) / 100;
        const veil = hex(resolve(tokens, "--background"));
        for (const name of ["--foreground", "--muted"]) {
            const color = hex(resolve(tokens, name));
            const worst = Math.min(
                ...BACKDROPS.map((backdrop) =>
                    contrast(color, over(veil, alpha, backdrop))
                ),
            );
            assert(
                worst >= WCAG_AA_TEXT,
                `${name} on --canvas-derived-${theme} ${alpha * 100}% gives ${
                    worst.toFixed(2)
                }:1`,
            );
        }
    });
}

for (const theme of ["light", "dark"] as const) {
    for (const tier of MATERIAL_FLOOR_TIERS) {
        for (const fixture of WALLPAPER_FIXTURES) {
            Deno.test(`home glyph ${theme}/${tier}/${fixture.name}: white tile edge holds 3:1 against light wallpaper`, () => {
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
                const alpha = fillPercent(tokens, `--glass-regular-${theme}`) /
                    100;
                const peak = fillPercent(tokens, "--glass-sheen-peak") / 100 *
                    Number(resolve(tokens, "--glass-sheen-scale"));
                for (const backdrop of fixture.samples) {
                    // Only the fixture's bright regions exercise the reported
                    // white-on-light failure; dark regions test other concerns.
                    if (luminance(backdrop) < 0.7) continue;
                    const ratio = contrast(paintedEdge, backdrop);
                    assert(
                        ratio >= SECONDARY_TEXT,
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
                        const boundary = theme === "dark"
                            ? [255, 255, 255] as const
                            : paintedEdge;
                        const plateRatio = contrast(boundary, plate);
                        assert(
                            plateRatio >= SECONDARY_TEXT,
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

for (const theme of ["light", "dark"] as const) {
    Deno.test(`home note ${theme}: task box border holds 3:1 on neutral Material`, () => {
        // Task box is checked at the default regular tier, at the sheen level
        // just below the label baseline (0.1 of the height), where sheen is strongest.
        const tokens = cascade(theme, "regular");
        const alpha = fillPercent(tokens, `--glass-regular-${theme}`) / 100;
        const peak = fillPercent(tokens, "--glass-sheen-peak") / 100 *
            Number(resolve(tokens, "--glass-sheen-scale"));
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
                box >= SECONDARY_TEXT,
                `task box border ${box.toFixed(2)}:1 on ${backdrop}`,
            );
        }
    });
}
