import { assertEquals, assertStringIncludes } from "@std/assert";
import ReactDOMServer from "react-dom/server";
import { routes, settingsTab } from "../../app/routes.ts";
import {
    commandTakesQuery,
    KEYBOARD_SHORTCUTS,
    SEARCH_QUICK_COMMANDS,
} from "./shortcut-catalog.ts";
import { ShortcutsSettings } from "./ShortcutsSettings.tsx";

Deno.test("routes: shortcuts settings tab routes and resolution contract", () => {
    assertEquals(routes.settings("shortcuts"), "/settings/shortcuts");
    assertEquals(settingsTab("/settings/shortcuts"), "shortcuts");
    assertEquals(settingsTab("/settings/shortcuts/extra"), null);
    assertEquals(settingsTab("/settings/unknown"), null);
});

Deno.test("ShortcutsSettings: renders every catalog shortcut action and quick command", () => {
    const html = ReactDOMServer.renderToString(
        <ShortcutsSettings platform="other" />,
    );

    for (const item of KEYBOARD_SHORTCUTS) {
        assertStringIncludes(html, item.action);
        assertStringIncludes(html, item.context);
        if (item.description) {
            assertStringIncludes(html, item.description);
        }
    }

    for (const cmd of SEARCH_QUICK_COMMANDS) {
        assertStringIncludes(html, cmd.action);
        assertStringIncludes(html, cmd.prefix);
        if (commandTakesQuery(cmd)) {
            assertStringIncludes(html, `${cmd.prefix} 关键词`);
        }
    }
});

Deno.test("ShortcutsSettings: macOS keycaps and screen reader text format correctly", () => {
    const html = ReactDOMServer.renderToString(
        <ShortcutsSettings platform="mac" />,
    );
    // On Mac, mod is ⌘, shift is ⇧
    assertStringIncludes(html, "⌘ K");
    assertStringIncludes(html, "⌘ ⇧ X");
    assertStringIncludes(html, "⌘ Enter");

    // Screen reader accessible text uses full words
    assertStringIncludes(html, "Command K");
    assertStringIncludes(html, "Command Shift X");
    assertStringIncludes(html, "Command Enter");
    assertStringIncludes(html, 'data-platform="mac"');
});

Deno.test("ShortcutsSettings: screen reader accessible text is provided for every entry", () => {
    const html = ReactDOMServer.renderToString(
        <ShortcutsSettings platform="mac" />,
    );
    // Ensure sr-only span exists for every keyboard shortcut
    const srMatches = html.match(/class="sr-only"[^>]*>快捷键：/g) ?? [];
    assertEquals(srMatches.length, KEYBOARD_SHORTCUTS.length);

    // Ensure sr-only span exists for every quick command
    const cmdMatches = html.match(/class="sr-only"[^>]*>快捷命令：/g) ?? [];
    assertEquals(cmdMatches.length, SEARCH_QUICK_COMMANDS.length);
});
