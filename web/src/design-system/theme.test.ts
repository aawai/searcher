import { assertEquals } from "@std/assert";
import { resolveTheme, toggleThemeScheme } from "./theme.ts";

Deno.test("theme: the top-bar toggle flips light and dark in one step and keeps the contrast level", () => {
    for (const prefersDark of [false, true]) {
        assertEquals(toggleThemeScheme("light", prefersDark), "dark");
        assertEquals(toggleThemeScheme("dark", prefersDark), "light");
        assertEquals(
            toggleThemeScheme("high-contrast-light", prefersDark),
            "high-contrast-dark",
        );
        assertEquals(
            toggleThemeScheme("high-contrast-dark", prefersDark),
            "high-contrast-light",
        );
    }
});

Deno.test("theme: from 跟随系统 the toggle picks the opposite of what the system shows", () => {
    assertEquals(toggleThemeScheme("system", false), "dark");
    assertEquals(toggleThemeScheme("system", true), "light");
});

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
