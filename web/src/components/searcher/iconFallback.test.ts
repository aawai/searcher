import { assert, assertEquals } from "@std/assert";
import { iconFallback } from "./iconFallback.ts";

function linearChannel(value: number): number {
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(r: number, g: number, b: number): number {
    return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) +
        0.0722 * linearChannel(b);
}

Deno.test("fallback hue is domain-stable and keeps AA contrast with its ink", () => {
    const a = iconFallback("https://Example.com/one");
    assertEquals(a, iconFallback("https://example.com/two"));
    assert(a.background !== iconFallback("https://other.example").background);

    const match = /^hsl\(\d+ (\d+)% (\d+)%\)$/.exec(a.background);
    assert(match);
    const saturation = Number(match[1]) / 100;
    const lightness = Number(match[2]) / 100;
    // The lowest RGB channel of an HSL colour bounds its relative luminance
    // from below, so this is a worst-case canvas for any hue.
    const worstChannel = lightness -
        ((1 - Math.abs(2 * lightness - 1)) * saturation) / 2;
    const canvasLuminance = linearChannel(worstChannel);

    const ink = {
        r: Number.parseInt(a.color.slice(1, 3), 16) / 255,
        g: Number.parseInt(a.color.slice(3, 5), 16) / 255,
        b: Number.parseInt(a.color.slice(5, 7), 16) / 255,
    };
    const inkLuminance = relativeLuminance(ink.r, ink.g, ink.b);
    const ratio = (canvasLuminance + 0.05) / (inkLuminance + 0.05);
    assert(ratio >= 4.5, `contrast ${ratio} below WCAG AA`);
});
