import { assertEquals } from "@std/assert";
import {
    shouldUseVisualViewportHeight,
    splitHighlightSegments,
} from "./ask-ui-helpers.ts";

Deno.test("splitHighlightSegments returns single unmatched segment for empty query", () => {
    assertEquals(
        splitHighlightSegments("Hello World", "   "),
        [{ text: "Hello World", match: false }],
    );
});

Deno.test("splitHighlightSegments splits case-insensitive matches preserving original case", () => {
    assertEquals(
        splitHighlightSegments("AI 问答与 Ai 模型", "ai"),
        [
            { text: "AI", match: true },
            { text: " 问答与 ", match: false },
            { text: "Ai", match: true },
            { text: " 模型", match: false },
        ],
    );
    assertEquals(
        splitHighlightSegments("讲一个笑话", "笑话"),
        [
            { text: "讲一个", match: false },
            { text: "笑话", match: true },
        ],
    );
});

Deno.test("shouldUseVisualViewportHeight disables inline maxHeight for desktop floating window at rest", () => {
    assertEquals(
        shouldUseVisualViewportHeight({
            inWindow: true,
            viewportHeight: 900,
            innerHeight: 900,
        }),
        false,
    );
    assertEquals(
        shouldUseVisualViewportHeight({
            inWindow: true,
            viewportHeight: 540,
            innerHeight: 900,
        }),
        true,
    );
    assertEquals(
        shouldUseVisualViewportHeight({
            inWindow: false,
            viewportHeight: 900,
            innerHeight: 900,
        }),
        true,
    );
});
