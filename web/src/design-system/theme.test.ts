import { assertEquals } from "@std/assert";
import type { ThemeId } from "@shared/contracts.ts";
import { nextThemeInCycle, resolveTheme } from "./theme.ts";

Deno.test("theme: the top-bar toggle visits all five themes in settings order and wraps", () => {
    const visited: ThemeId[] = ["system"];
    for (let step = 0; step < 5; step++) {
        visited.push(nextThemeInCycle(visited[visited.length - 1]));
    }
    assertEquals(visited, [
        "system",
        "light",
        "dark",
        "high-contrast-light",
        "high-contrast-dark",
        "system",
    ]);
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
