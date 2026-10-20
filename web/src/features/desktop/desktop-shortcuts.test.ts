import { assert, assertEquals } from "@std/assert";
import { matchesDesktopShortcut } from "./desktop-shortcuts.ts";

function shortcutEvent(key: string, overrides: Partial<KeyboardEvent> = {}) {
    return {
        key,
        ctrlKey: true,
        altKey: true,
        shiftKey: true,
        metaKey: false,
        ...overrides,
    };
}

Deno.test("desktop shortcut chords match menu, snap, and overview keys", () => {
    assert(matchesDesktopShortcut(shortcutEvent("M"), "menu"));
    assert(matchesDesktopShortcut(shortcutEvent("ArrowLeft"), "snapLeft"));
    assert(matchesDesktopShortcut(shortcutEvent("ArrowRight"), "snapRight"));
    assert(matchesDesktopShortcut(shortcutEvent("O"), "overview"));
});

Deno.test("desktop shortcuts require the full non-Meta modifier chord", () => {
    assertEquals(
        matchesDesktopShortcut(
            shortcutEvent("m", { shiftKey: false }),
            "menu",
        ),
        false,
    );
    assertEquals(
        matchesDesktopShortcut(
            shortcutEvent("m", { metaKey: true }),
            "menu",
        ),
        false,
    );
    assertEquals(
        matchesDesktopShortcut(
            shortcutEvent("m", { ctrlKey: false }),
            "menu",
        ),
        false,
    );
});
