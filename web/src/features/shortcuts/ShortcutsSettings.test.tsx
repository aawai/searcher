import { assertEquals, assertStringIncludes } from "@std/assert";
import ReactDOMServer from "react-dom/server";
import { routes, settingsTab } from "../../app/routes.ts";
import {
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

Deno.test("ShortcutsSettings: renders all 5 required sections with proper headings", () => {
    const html = ReactDOMServer.renderToString(
        <ShortcutsSettings platform="other" />,
    );
    assertStringIncludes(html, "全局");
    assertStringIncludes(html, "搜索");
    assertStringIncludes(html, "AI 问答");
    assertStringIncludes(html, "笔记编辑");
    assertStringIncludes(html, "快捷命令");

    // All keyboard shortcut actions from catalog are present
    for (const item of KEYBOARD_SHORTCUTS) {
        assertStringIncludes(html, item.action);
        assertStringIncludes(html, item.context);
        if (item.description) {
            assertStringIncludes(html, item.description);
        }
    }

    // All slash quick commands from catalog are present
    for (const cmd of SEARCH_QUICK_COMMANDS) {
        assertStringIncludes(html, cmd.action);
        assertStringIncludes(html, cmd.prefix);
        assertStringIncludes(html, `${cmd.prefix} 关键词`);
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

Deno.test("ShortcutsSettings: Non-macOS (other) keycaps and screen reader text format correctly", () => {
    const html = ReactDOMServer.renderToString(
        <ShortcutsSettings platform="other" />,
    );
    // On Non-Mac, mod is Ctrl, shift is Shift
    assertStringIncludes(html, "Ctrl + K");
    assertStringIncludes(html, "Ctrl + Shift + X");
    assertStringIncludes(html, "Ctrl + Enter");

    // Screen reader text
    assertStringIncludes(html, "Ctrl + K");
    assertStringIncludes(html, "Ctrl + Shift + X");
    assertStringIncludes(html, "Ctrl + Enter");
    assertStringIncludes(html, 'data-platform="other"');
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
