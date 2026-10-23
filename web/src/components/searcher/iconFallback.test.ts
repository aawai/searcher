import { assert, assertEquals } from "@std/assert";
import { iconFallback } from "./iconFallback.ts";

Deno.test("fallback hue is domain-stable and readable in both themes", () => {
    const a = iconFallback("https://Example.com/one");
    assertEquals(a, iconFallback("https://example.com/two"));
    assert(a.background !== iconFallback("https://other.example").background);
    for (const theme of ["light", "dark"]) {
        // Same independent brand canvas in either theme; worst possible channel
        // at HSL(45%,90%) is 0.855. Compare to fixed #1d1d1f ink.
        const channel = (v: number) =>
            v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        const ratio = (channel(0.855) + 0.05) / (channel(31 / 255) + 0.05);
        assert(ratio >= 4.5, theme);
        assertEquals(a.color, "#1d1d1f");
    }
});
