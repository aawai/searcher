import { assert, assertEquals } from "@std/assert";
import { iconFallback } from "./iconFallback.ts";

function linearChannel(value: number): number {
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(r: number, g: number, b: number): number {
    return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) +
        0.0722 * linearChannel(b);
}

function parseLightDark(value: string): readonly [string, string] {
    const match = /^light-dark\(([^,]+),\s*(.+)\)$/.exec(value);
    assert(match, `expected light-dark(...), got ${value}`);
    return [match[1], match[2]];
}

function parseHslBounds(value: string): {
    hue: number;
    minChannel: number;
    maxChannel: number;
} {
    const match = /^hsl\((\d+) (\d+)% (\d+)%\)$/.exec(value);
    assert(match, `expected hsl(...), got ${value}`);
    const hue = Number(match[1]);
    const saturation = Number(match[2]) / 100;
    const lightness = Number(match[3]) / 100;
    const halfChroma = ((1 - Math.abs(2 * lightness - 1)) * saturation) / 2;
    return {
        hue,
        minChannel: lightness - halfChroma,
        maxChannel: lightness + halfChroma,
    };
}

Deno.test("fallback hue is domain-stable and keeps AA contrast in both themes", () => {
    const a = iconFallback("https://Example.com/one");
    assertEquals(a, iconFallback("https://example.com/two"));
    assert(a.background !== iconFallback("https://other.example").background);

    const [lightBg, darkBg] = parseLightDark(a.background);
    const [lightInk, darkInk] = parseLightDark(a.color);

    // Light pair: worst-case (darkest) canvas channel against fixed dark ink.
    const lightCanvas = parseHslBounds(lightBg);
    const lightCanvasLuminance = linearChannel(lightCanvas.minChannel);
    const ink = {
        r: Number.parseInt(lightInk.slice(1, 3), 16) / 255,
        g: Number.parseInt(lightInk.slice(3, 5), 16) / 255,
        b: Number.parseInt(lightInk.slice(5, 7), 16) / 255,
    };
    const lightInkLuminance = relativeLuminance(ink.r, ink.g, ink.b);
    const lightRatio = (lightCanvasLuminance + 0.05) /
        (lightInkLuminance + 0.05);
    assert(lightRatio >= 4.5, `light contrast ${lightRatio} below WCAG AA`);

    // Dark pair: worst-case (lightest) canvas channel against darkest ink channel.
    const darkCanvas = parseHslBounds(darkBg);
    const darkText = parseHslBounds(darkInk);
    assertEquals(darkCanvas.hue, lightCanvas.hue);
    assertEquals(darkText.hue, lightCanvas.hue);
    const darkCanvasLuminance = linearChannel(darkCanvas.maxChannel);
    const darkInkLuminance = linearChannel(darkText.minChannel);
    const darkRatio = (darkInkLuminance + 0.05) / (darkCanvasLuminance + 0.05);
    assert(darkRatio >= 4.5, `dark contrast ${darkRatio} below WCAG AA`);
});
