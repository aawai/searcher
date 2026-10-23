import { assert, assertEquals } from "@std/assert";

const css = await Deno.readTextFile(new URL("./tokens.css", import.meta.url));

type Rgb = readonly [number, number, number];
type Theme = "light" | "dark";
const TIERS = ["off", "soft", "regular", "clear"] as const;
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

for (const theme of ["light", "dark"] as const) {
    for (const tier of TIERS) {
        Deno.test(`glass ${theme}/${tier}: body text holds AA and --muted 3:1 on the worst backdrop`, () => {
            const tokens = cascade(theme, tier);
            const text = hex(resolve(tokens, "--foreground"));
            const muted = hex(resolve(tokens, "--muted"));
            // Material is mixed over --material-solid, Floating over --surface-l3.
            const surfaces = [
                [`--glass-regular-${theme}`, "--material-solid"],
                [`--glass-thick-${theme}`, "--surface-l3"],
            ] as const;
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
        assertEquals(fills[0], { regular: 100, thick: 100 });
        for (let i = 1; i < fills.length; i++) {
            assert(fills[i].regular < fills[i - 1].regular, `tier ${TIERS[i]}`);
        }
        for (const fill of fills) assert(fill.thick >= fill.regular);
    });
}

for (const theme of ["light", "dark"] as const) {
    for (const tier of TIERS) {
        Deno.test(`glass ${theme}/${tier}: folder label, empty-folder icon and mini icons hold contrast on the folder Material`, () => {
            const tokens = cascade(theme, tier);
            const alpha = fillPercent(tokens, `--glass-regular-${theme}`) / 100;
            const base = hex(resolve(tokens, "--material-solid"));
            const sheen = fillPercent(tokens, "--glass-sheen-peak") / 100 *
                Number(resolve(tokens, "--glass-sheen-scale")) *
                (1 - 0.25 / 0.55);
            const worstOnFolder = (color: Rgb) =>
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
            // Folder name chip (photo wallpapers): --foreground text on the same Material.
            const label = worstOnFolder(hex(resolve(tokens, "--foreground")));
            assert(label >= WCAG_AA_TEXT, `folder label ${label.toFixed(2)}:1`);
            // The empty-folder glyph is a graphic: 3:1 against the folder.
            const empty = worstOnFolder(hex(resolve(tokens, "--muted")));
            assert(
                empty >= SECONDARY_TEXT,
                `empty folder icon ${empty.toFixed(2)}:1`,
            );
            // Mini icon tiles are opaque --surface-solid: their fallback letter is
            // --foreground on that plate, independent of the glass tier.
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
}
