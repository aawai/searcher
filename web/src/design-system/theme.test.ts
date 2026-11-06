import { assertEquals } from "@std/assert";
import { resolveTheme } from "./theme.ts";

Deno.test("theme: only 跟随系统 follows the system scheme; chosen themes ignore it", () => {
    for (const prefersDark of [false, true]) {
        assertEquals(resolveTheme("system", prefersDark), {
            scheme: prefersDark ? "dark" : "light",
            highContrast: false,
        });
        assertEquals(resolveTheme("light", prefersDark), {
            scheme: "light",
            highContrast: false,
        });
        assertEquals(resolveTheme("dark", prefersDark), {
            scheme: "dark",
            highContrast: false,
        });
        assertEquals(resolveTheme("high-contrast-light", prefersDark), {
            scheme: "light",
            highContrast: true,
        });
        assertEquals(resolveTheme("high-contrast-dark", prefersDark), {
            scheme: "dark",
            highContrast: true,
        });
    }
});
