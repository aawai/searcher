import { assert, assertMatch, assertNotEquals } from "@std/assert";

/*
 * Paper colours (home notes, desk papers, editor and colour dots) and the task
 * checkbox drawn on them. Every rendered Markdown context shares markdown.css,
 * so a failing ratio here is a task list that is hard to read on that paper.
 */
const read = (path: string) =>
    Deno.readTextFile(new URL(path, import.meta.url));
const tokensCss = await read("./tokens.css");
const colorsCss = await read("../components/searcher/document-colors.css");
const markdownCss = await read("../components/searcher/markdown.css");

type Rgb = readonly [number, number, number];
type Theme = "light" | "dark";
const WCAG_AA_TEXT = 4.5;
const NON_TEXT = 3;
const HUES = ["amber", "rose", "sage", "sky"] as const;

/** Custom properties declared in every block whose selector is exactly `selector`. */
function declarations(css: string, selector: string): Map<string, string> {
    const result = new Map<string, string>();
    for (const block of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const selectors = block[1].replace(/\/\*[\s\S]*?\*\//g, "").split(";")
            .at(-1)?.trim();
        if (selectors !== selector) continue;
        for (
            const declaration of block[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)
        ) {
            result.set(declaration[1], declaration[2].trim());
        }
    }
    return result;
}

const NOTE_SCOPE =
    ":where(.note-card, [data-note-color], .note-quick-dot, .documents-color-dot)";
const TASK_SCOPE = ".markdown,\n.markdown-editor";

function themeTokens(theme: Theme): Map<string, string> {
    const layers = [
        declarations(tokensCss, ":root"),
        declarations(colorsCss, NOTE_SCOPE),
        declarations(markdownCss, TASK_SCOPE),
    ];
    if (theme === "dark") {
        layers.push(
            declarations(tokensCss, '[data-theme="dark"]'),
            declarations(colorsCss, `[data-theme="dark"] ${NOTE_SCOPE}`),
        );
    }
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

const linear = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

function luminance([r, g, b]: Rgb): number {
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: Rgb, b: Rgb): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/** OKLab lightness, a, b. */
function oklab([r, g, b]: Rgb): [number, number, number] {
    const [lr, lg, lb] = [r, g, b].map(linear);
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
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

function papers(theme: Theme): Map<string, Rgb> {
    const tokens = themeTokens(theme);
    return new Map([
        ["paper", hex(resolve(tokens, "--paper-white"))],
        ...HUES.map((hue) =>
            [hue, hex(resolve(tokens, `--note-${hue}`))] as const
        ),
    ]);
}

Deno.test("dark default paper is its own colour, not a UI surface", () => {
    const tokens = themeTokens("dark");
    assertMatch(
        declarations(tokensCss, '[data-theme="dark"]').get("--paper-white") ??
            "",
        /^#[0-9a-f]{6}$/i,
    );
    for (const surface of ["--surface", "--surface-soft", "--surface-l3"]) {
        assertNotEquals(
            resolve(tokens, "--paper-white").toLowerCase(),
            resolve(tokens, surface).toLowerCase(),
            surface,
        );
    }
});

for (const theme of ["light", "dark"] as const) {
    for (const [name, paper] of papers(theme)) {
        Deno.test(`paper ${theme}/${name}: body text, task box and done text hold contrast`, () => {
            const tokens = themeTokens(theme);
            const color = (token: string) => hex(resolve(tokens, token));
            const checks = [
                ["body text", color("--foreground"), WCAG_AA_TEXT],
                ["unchecked box border", color("--task-box-border"), NON_TEXT],
                ["checked box fill", color("--task-box-fill"), NON_TEXT],
                ["done text", color("--task-done-text"), WCAG_AA_TEXT],
            ] as const;
            for (const [label, ink, minimum] of checks) {
                const ratio = contrast(ink, paper);
                assert(
                    ratio >= minimum,
                    `${label} ${ratio.toFixed(2)}:1 < ${minimum}:1`,
                );
            }
            // The tick is cut out of the fill, so it shows the paper itself.
            const tick = contrast(paper, color("--task-box-fill"));
            assert(tick >= NON_TEXT, `tick ${tick.toFixed(2)}:1`);
        });
    }
}

Deno.test("dark papers share one raised lightness and stay mutually distinguishable", () => {
    const sheets = [...papers("dark")].map(([name, rgb]) =>
        [name, oklab(rgb)] as const
    );
    const surface = oklab(hex(resolve(themeTokens("dark"), "--surface-soft")));
    for (const [name, [lightness, a, b]] of sheets) {
        assert(lightness > surface[0], `${name} must sit above --surface-soft`);
        assert(
            Math.abs(lightness - sheets[0][1][0]) <= 0.02,
            `${name} lightness ${lightness.toFixed(3)} drifts from paper`,
        );
        // Hued sheets keep visible chroma instead of collapsing into grey-brown.
        if (name !== "paper") {
            assert(Math.hypot(a, b) >= 0.025, `${name} is muddy`);
        }
    }
    for (let i = 0; i < sheets.length; i++) {
        for (let j = i + 1; j < sheets.length; j++) {
            const distance = Math.hypot(
                ...sheets[i][1].map((v, k) => v - sheets[j][1][k]),
            );
            assert(
                distance >= 0.03,
                `${sheets[i][0]} vs ${sheets[j][0]} ΔE ${distance.toFixed(3)}`,
            );
        }
    }
});
