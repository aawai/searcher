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

        for (const surfaceToken of ["--background", "--surface", "--surface-soft"]) {
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
