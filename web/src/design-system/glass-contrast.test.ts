import { assert } from "@std/assert";

const css = await Deno.readTextFile(new URL("./tokens.css", import.meta.url));

type Rgb = readonly [number, number, number];
type Scheme = "light" | "dark";

const SCHEMES: readonly Scheme[] = ["light", "dark"];
const WCAG_AA_TEXT = 4.5;

function declarations(selector: string): Map<string, string> {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const blocks = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "g");
    const result = new Map<string, string>();
    for (const block of css.matchAll(blocks)) {
        for (
            const declaration of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)
        ) {
            result.set(declaration[1], declaration[2].trim());
        }
    }
    return result;
}

function cascadeScheme(scheme: Scheme): Map<string, string> {
    const layers = [declarations(":root")];
    if (scheme === "dark") {
        layers.push(declarations('[data-theme="dark"]'));
    }
    return new Map(
        layers.flatMap((layer) => [...layer]).map(([name, value]) => {
            const pair = value.match(/^light-dark\(([^,]+), ([^)]+)\)$/);
            return [
                name,
                pair ? pair[scheme === "light" ? 1 : 2] : value,
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

for (const scheme of SCHEMES) {
    Deno.test(`base ${scheme}: --foreground and --muted hold WCAG AA (4.5:1) on opaque surfaces`, () => {
        const tokens = cascadeScheme(scheme);
        const fg = hex(resolve(tokens, "--foreground"));
        const muted = hex(resolve(tokens, "--muted"));

        for (
            const surfaceToken of [
                "--background",
                "--surface",
                "--surface-soft",
            ]
        ) {
            const bg = hex(resolve(tokens, surfaceToken));
            const fgRatio = contrast(fg, bg);
            const mutedRatio = contrast(muted, bg);

            assert(
                fgRatio >= WCAG_AA_TEXT,
                `${scheme} --foreground on ${surfaceToken} contrast ${
                    fgRatio.toFixed(2)
                }:1 < ${WCAG_AA_TEXT}`,
            );
            assert(
                mutedRatio >= WCAG_AA_TEXT,
                `${scheme} --muted on ${surfaceToken} contrast ${
                    mutedRatio.toFixed(2)
                }:1 < ${WCAG_AA_TEXT}`,
            );
        }
    });
}

function parsePercentage(value: string): number {
    const match = value.match(/^(-?\d+(?:\.\d+)?)%$/);
    if (!match) throw new Error(`expected percentage, got ${value}`);
    return Number(match[1]);
}

function parseBlurPx(value: string): number {
    if (value === "none") return 0;
    const match = value.match(/blur\((\d+(?:\.\d+)?)px\)/);
    if (!match) throw new Error(`expected blur(Npx), got ${value}`);
    return Number(match[1]);
}

Deno.test("glass tiers form a monotonic, clearly separated progression with translucent clear material and readable floating", () => {
    const rootTokens = declarations(":root");
    const lightSheenPeak = parsePercentage(
        resolve(rootTokens, "--glass-sheen-peak"),
    ) / 100;

    const order = ["off", "soft", "regular", "clear"] as const;
    const tiers = Object.fromEntries(
        order.map((tier) => {
            const d = declarations(`[data-glass="${tier}"]`);
            const regularLight = parsePercentage(
                d.get("--glass-regular-light")!,
            );
            const regularDark = parsePercentage(d.get("--glass-regular-dark")!);
            const thickLight = parsePercentage(d.get("--glass-thick-light")!);
            const thickDark = parsePercentage(d.get("--glass-thick-dark")!);
            const sheenScale = Number(
                d.get("--material-regular-sheen-scale")!,
            );
            const blurLight = parseBlurPx(
                d.get("--glass-regular-filter-light")!,
            );
            const blurDark = parseBlurPx(
                d.get("--glass-regular-filter-dark")!,
            );
            // Composite white opacity at top edge: 1 - (1 - sheen) * (1 - fill)
            const topWhiteLightPct = (1 -
                (1 - lightSheenPeak * sheenScale) * (1 - regularLight / 100)) *
                100;
            return [
                tier,
                {
                    regularLight,
                    regularDark,
                    thickLight,
                    thickDark,
                    blurLight,
                    blurDark,
                    topWhiteLightPct,
                },
            ];
        }),
    ) as Record<
        (typeof order)[number],
        {
            regularLight: number;
            regularDark: number;
            thickLight: number;
            thickDark: number;
            blurLight: number;
            blurDark: number;
            topWhiteLightPct: number;
        }
    >;

    for (let i = 0; i < order.length - 1; i++) {
        const hi = tiers[order[i]];
        const lo = tiers[order[i + 1]];
        assert(
            hi.regularLight > lo.regularLight,
            `expected ${order[i]} light fill (${hi.regularLight}%) > ${
                order[i + 1]
            } (${lo.regularLight}%)`,
        );
        assert(
            hi.regularDark > lo.regularDark,
            `expected ${order[i]} dark fill (${hi.regularDark}%) > ${
                order[i + 1]
            } (${lo.regularDark}%)`,
        );
        assert(
            hi.topWhiteLightPct - lo.topWhiteLightPct >= 10,
            `expected >=10pp light top-edge gap between ${order[i]} (${
                hi.topWhiteLightPct.toFixed(1)
            }%) and ${order[i + 1]} (${lo.topWhiteLightPct.toFixed(1)}%)`,
        );
    }

    assert(tiers.clear.regularLight <= 20);
    assert(tiers.clear.regularDark <= 25);
    assert(tiers.clear.topWhiteLightPct <= 30);

    assert(tiers.off.blurLight === 0 && tiers.off.blurDark === 0);
    assert(
        tiers.soft.blurLight > tiers.regular.blurLight &&
            tiers.regular.blurLight > tiers.clear.blurLight,
    );
    assert(
        tiers.soft.blurDark > tiers.regular.blurDark &&
            tiers.regular.blurDark > tiers.clear.blurDark,
    );
    assert(tiers.clear.blurLight <= 8 && tiers.clear.blurDark <= 8);

    for (const tier of order) {
        assert(
            tiers[tier].thickLight >= 85 && tiers[tier].thickDark >= 85,
            `floating tier ${tier} must stay >=85% opaque`,
        );
    }
});
