import { assertEquals } from "@std/assert";
import {
    formatShortcut,
    formatShortcutAccessible,
    KEYBOARD_SHORTCUTS,
    matchesShortcut,
    parseCommandPrefix,
    SEARCH_QUICK_COMMANDS,
    SHORTCUTS,
} from "./shortcut-catalog.ts";

Deno.test("catalog identifiers cannot hide shortcuts or ambiguous command prefixes", () => {
    assertEquals(
        new Set(KEYBOARD_SHORTCUTS.map((entry) => entry.id)).size,
        KEYBOARD_SHORTCUTS.length,
    );
    assertEquals(
        new Set(SEARCH_QUICK_COMMANDS.map((entry) => entry.prefix)).size,
        SEARCH_QUICK_COMMANDS.length,
    );
});

Deno.test("platform presentation keeps stable modifier order and readable accessible keys", () => {
    assertEquals(formatShortcut(SHORTCUTS.focusSearch.binding, "mac"), "⌘ K");
    assertEquals(
        formatShortcut(SHORTCUTS.focusSearch.binding, "other"),
        "Ctrl + K",
    );
    assertEquals(formatShortcut(SHORTCUTS.noteStrike.binding, "mac"), "⌘ ⇧ X");
    assertEquals(
        formatShortcut(SHORTCUTS.noteStrike.binding, "other"),
        "Ctrl + Shift + X",
    );
    assertEquals(
        formatShortcut(SHORTCUTS.searchNewTab.binding, "mac"),
        "⌘ Enter",
    );
    assertEquals(
        formatShortcut(
            { key: "x", modifiers: ["shift", "alt", "mod"] },
            "other",
        ),
        "Ctrl + Alt + Shift + X",
    );
    assertEquals(
        formatShortcutAccessible(SHORTCUTS.noteStrike.binding, "mac"),
        "Command Shift X",
    );
});

Deno.test("shortcut matching normalizes key case but excludes extra modifiers and handled/composing events", () => {
    const event = {
        key: "K",
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
    };
    assertEquals(matchesShortcut(event, SHORTCUTS.focusSearch.binding), true);
    assertEquals(
        matchesShortcut(
            { ...event, ctrlKey: false, metaKey: true },
            SHORTCUTS.noteLink.binding,
        ),
        true,
    );
    for (
        const extra of [
            { shiftKey: true },
            { altKey: true },
            { metaKey: true },
            { defaultPrevented: true },
            { isComposing: true },
            { ctrlKey: false },
        ]
    ) {
        assertEquals(
            matchesShortcut(
                { ...event, ...extra },
                SHORTCUTS.focusSearch.binding,
            ),
            false,
        );
    }
    assertEquals(
        matchesShortcut(
            { ...event, key: "X", shiftKey: true },
            SHORTCUTS.noteStrike.binding,
        ),
        true,
    );
    assertEquals(
        matchesShortcut(
            { ...event, key: "/", ctrlKey: false },
            SHORTCUTS.focusSearchSlash.binding,
        ),
        true,
    );
    assertEquals(
        matchesShortcut(
            { ...event, key: "/" },
            SHORTCUTS.focusSearchSlash.binding,
        ),
        false,
    );
});

Deno.test("command parsing preserves boundaries whitespace case and all canonical targets", () => {
    for (const entry of SEARCH_QUICK_COMMANDS) {
        const parsed = parseCommandPrefix(
            `  ${entry.prefix.toUpperCase()}\t query  `,
        );
        assertEquals(parsed?.rest, "query");
        assertEquals(parsed?.hasSpace, true);
        assertEquals(
            parsed?.targetEngine,
            entry.target.type === "engine" ? entry.target.engine : undefined,
        );
        assertEquals(parsed?.isAi, entry.target.type === "mode");
        assertEquals(parseCommandPrefix(`${entry.prefix}extra query`), null);
    }
    assertEquals(parseCommandPrefix("/unknown query"), null);
    assertEquals(parseCommandPrefix("query /g"), null);
    assertEquals(parseCommandPrefix("/ba")?.hasSpace, false);
});
