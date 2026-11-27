import { assertEquals } from "@std/assert";
import {
    hasCustomGenerationOverrides,
    shouldUseVisualViewportHeight,
    splitHighlightSegments,
} from "./ask-ui-helpers.ts";

Deno.test("hasCustomGenerationOverrides returns false when config matches baseline", () => {
    assertEquals(
        hasCustomGenerationOverrides(
            { reasoningEffort: "medium" },
            { reasoningEffort: "medium" },
        ),
        false,
    );
    assertEquals(
        hasCustomGenerationOverrides({}, {}),
        false,
    );
});

Deno.test("hasCustomGenerationOverrides detects explicit sampling, length, and reasoning overrides", () => {
    assertEquals(
        hasCustomGenerationOverrides(
            { reasoningEffort: "high" },
            { reasoningEffort: "medium" },
        ),
        true,
    );
    assertEquals(
        hasCustomGenerationOverrides(
            { reasoningEffort: "medium", temperature: 0.3 },
            { reasoningEffort: "medium" },
        ),
        true,
    );
    assertEquals(
        hasCustomGenerationOverrides(
            { topP: 0.9 },
            {},
        ),
        true,
    );
    assertEquals(
        hasCustomGenerationOverrides(
            { maxTokens: 2048 },
            {},
        ),
        true,
    );
});

Deno.test("hasCustomGenerationOverrides ignores temperature and topP for strict reasoning models", () => {
    assertEquals(
        hasCustomGenerationOverrides(
            { reasoningEffort: "medium", temperature: 0.7, topP: 1 },
            { reasoningEffort: "medium" },
            true,
        ),
        false,
    );
    assertEquals(
        hasCustomGenerationOverrides(
            { reasoningEffort: "high", temperature: 0.7 },
            { reasoningEffort: "medium" },
            true,
        ),
        true,
    );
});

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
