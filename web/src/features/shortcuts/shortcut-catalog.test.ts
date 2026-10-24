import { assertEquals } from "@std/assert";
import {
    commandTakesQuery,
    formatShortcut,
    formatShortcutAccessible,
    KEYBOARD_SHORTCUTS,
    matchesShortcut,
    matchSearchCommands,
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

Deno.test("executable commands cover theme, wallpaper, settings, shortcuts, trash and workspace entries", () => {
    const byId = new Map(
        SEARCH_QUICK_COMMANDS.map((entry) => [entry.id, entry]),
    );
    assertEquals(byId.get("theme-light")?.target, {
        type: "theme",
        theme: "light",
    });
    assertEquals(byId.get("theme-dark")?.target, {
        type: "theme",
        theme: "dark",
    });
    assertEquals(byId.get("theme-system")?.target, {
        type: "theme",
        theme: "system",
    });
    assertEquals(byId.get("wallpaper")?.target, {
        type: "route",
        to: "/settings/appearance",
    });
    assertEquals(byId.get("settings")?.target, {
        type: "route",
        to: "/settings",
    });
    assertEquals(byId.get("shortcuts")?.target, {
        type: "route",
        to: "/settings/shortcuts",
    });
    assertEquals(byId.get("trash")?.target, { type: "route", to: "/trash" });
    assertEquals(byId.get("notes")?.target, {
        type: "library",
        request: "notes",
    });
    assertEquals(byId.get("apps")?.target, { type: "apps" });
    for (const entry of SEARCH_QUICK_COMMANDS) {
        assertEquals(entry.prefix, entry.prefix.toLowerCase());
        assertEquals(/^\/[a-z]+$/.test(entry.prefix), true);
    }
});

Deno.test("matchSearchCommands lists by prefix or action, hides AI and personal commands by capability", () => {
    const all = { aiAvailable: true, signedIn: true };
    const ids = (raw: string, context = all) =>
        matchSearchCommands(raw, context).map((entry) => entry.id);

    assertEquals(ids("hello"), []);
    assertEquals(ids("/g rust"), []);
    assertEquals(ids("/g "), []);
    assertEquals(ids("/").length, SEARCH_QUICK_COMMANDS.length);
    assertEquals(ids("/b"), ["bing", "baidu"]);
    assertEquals(ids("  /DARK"), ["theme-dark"]);
    assertEquals(ids("/壁纸"), ["wallpaper"]);

    assertEquals(ids("/ai", all), ["ai"]);
    assertEquals(ids("/ai", { aiAvailable: false, signedIn: true }), []);
    const guest = ids("/", { aiAvailable: false, signedIn: false });
    for (const hidden of ["ai", "trash", "notes", "apps"]) {
        assertEquals(guest.includes(hidden), false);
    }
    for (
        const kept of [
            "google",
            "theme-dark",
            "wallpaper",
            "settings",
            "shortcuts",
        ]
    ) {
        assertEquals(guest.includes(kept), true);
    }
});

Deno.test("guests reach settings and the shortcut reference by command name", () => {
    const guest = { aiAvailable: false, signedIn: false };
    const ids = (raw: string) =>
        matchSearchCommands(raw, guest).map((entry) => entry.id);
    assertEquals(ids("/设置"), ["settings"]);
    assertEquals(ids("/快捷键"), ["shortcuts"]);
});

Deno.test("only engine and AI prefixes take a query argument", () => {
    for (const entry of SEARCH_QUICK_COMMANDS) {
        assertEquals(
            commandTakesQuery(entry),
            entry.target.type === "engine" || entry.target.type === "mode",
        );
    }
});

Deno.test("search shortcuts document Alt+Enter and Shift+Enter in the same catalog", () => {
    assertEquals(SHORTCUTS.searchAskAi.binding, {
        key: "Enter",
        modifiers: ["alt"],
    });
    assertEquals(SHORTCUTS.searchCapture.binding, {
        key: "Enter",
        modifiers: ["shift"],
    });
    assertEquals(SHORTCUTS.searchAskAi.section, "search");
    assertEquals(SHORTCUTS.searchCapture.section, "search");
});

Deno.test("parseCommandPrefix accurately extracts command, target engine, and rest query without pollution", () => {
    // 1. Regular query without command
    assertEquals(parseCommandPrefix("rust 教程"), null);
    assertEquals(parseCommandPrefix("https://example.com"), null);

    // 2. Command prefix without trailing space (user still typing the command itself)
    const cmdOnlyG = parseCommandPrefix("/g");
    assertEquals(cmdOnlyG, {
        command: "g",
        rest: "",
        isAi: false,
        targetEngine: "google",
        hasSpace: false,
        prefix: "/g",
    });

    const cmdOnlyBa = parseCommandPrefix("/ba");
    assertEquals(cmdOnlyBa, {
        command: "ba",
        rest: "",
        isAi: false,
        targetEngine: "baidu",
        hasSpace: false,
        prefix: "/ba",
    });

    // 3. Command prefix followed by space but no keywords yet
    const cmdSpaceEmpty = parseCommandPrefix("/b ");
    assertEquals(cmdSpaceEmpty, {
        command: "b",
        rest: "",
        isAi: false,
        targetEngine: "bing",
        hasSpace: true,
        prefix: "/b ",
    });

    // 4. Command prefix with actual keyword: rest must be stripped of command prefix
    const cmdWithQuery = parseCommandPrefix("/g rust language");
    assertEquals(cmdWithQuery, {
        command: "g",
        rest: "rust language",
        isAi: false,
        targetEngine: "google",
        hasSpace: true,
        prefix: "/g ",
    });
    // The query used for suggestion / engine search must be the rest, never polluted by /g
    assertEquals(cmdWithQuery?.rest.includes("/g"), false);

    // 5. DuckDuckGo command
    const ddg = parseCommandPrefix("/d deno 2.0");
    assertEquals(ddg, {
        command: "d",
        rest: "deno 2.0",
        isAi: false,
        targetEngine: "duckduckgo",
        hasSpace: true,
        prefix: "/d ",
    });

    // 6. AI command
    const aiCmd = parseCommandPrefix("/ai 今天天气怎么样");
    assertEquals(aiCmd, {
        command: "ai",
        rest: "今天天气怎么样",
        isAi: true,
        targetEngine: undefined,
        hasSpace: true,
        prefix: "/ai ",
    });
});
