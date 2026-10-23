import { assert, assertEquals, assertThrows } from "@std/assert";
import {
    checkFontSize,
    checkRadius,
    isRegisteredAccentFill,
    loadVisualRegistry,
    parseVisualRegistry,
} from "./registry.ts";
import { FIXTURE_MARKDOWN, FIXTURE_REGISTRY } from "./test-registry.ts";

Deno.test("registry - parses the three tables of Visual Language", () => {
    assertEquals(
        [...FIXTURE_REGISTRY.fontTokens],
        ["--font-body-size", "--font-page-title-size"],
    );
    assertEquals(
        [...FIXTURE_REGISTRY.radiusTokens],
        ["--control-radius", "--radius"],
    );
    assertEquals(
        FIXTURE_REGISTRY.accentFills.map((e) => [e.file, e.selector]),
        [
            ["web/src/components/ui/button.css", ".button--primary"],
            [
                "web/src/components/ui/switch.css",
                ".switch[data-checked], .switch--on",
            ],
        ],
    );
});

Deno.test("registry - fails closed on a missing, empty or malformed table", () => {
    assertThrows(() => parseVisualRegistry("# no tables"), Error, "marker");
    assertThrows(
        () =>
            parseVisualRegistry(
                FIXTURE_MARKDOWN.replace(
                    "`--font-body-size`",
                    "--font-body-size",
                ),
            ),
        Error,
        "code span",
    );
    assertThrows(
        () =>
            parseVisualRegistry(
                FIXTURE_MARKDOWN.replace("`--radius`", "`--shadow-l2`"),
            ),
        Error,
        "valid Token",
    );
});

Deno.test("registry - the committed Visual Language document parses and registers the known Tokens", async () => {
    const registry = await loadVisualRegistry();
    for (
        const token of [
            "--font-metadata-size",
            "--font-input-touch-size",
            "--font-brand-size",
            "--font-launcher-micro",
        ]
    ) {
        assert(registry.fontTokens.has(token), token);
    }
    for (
        const token of [
            "--control-radius",
            "--multiline-radius",
            "--radius-note-card",
            "--radius-launcher-icon",
        ]
    ) {
        assert(registry.radiusTokens.has(token), token);
    }
    assert(registry.accentFills.length > 0);
});

Deno.test("registry - font-size accepts registered Tokens and relative keywords only", () => {
    assertEquals(
        checkFontSize("var(--font-body-size)", FIXTURE_REGISTRY),
        "ok",
    );
    assertEquals(checkFontSize("inherit", FIXTURE_REGISTRY), "ok");
    assertEquals(checkFontSize("1em", FIXTURE_REGISTRY), "ok");
    assertEquals(
        checkFontSize("var(--font-made-up-size)", FIXTURE_REGISTRY),
        "unregistered",
    );
    assertEquals(checkFontSize("15px", FIXTURE_REGISTRY), "raw");
    assertEquals(
        checkFontSize("calc(var(--font-body-size) * 1.1)", FIXTURE_REGISTRY),
        "raw",
    );
});

Deno.test("registry - border-radius accepts registered Tokens, keywords and Token insets", () => {
    assertEquals(checkRadius("var(--radius)", FIXTURE_REGISTRY), "ok");
    assertEquals(checkRadius("999px", FIXTURE_REGISTRY), "ok");
    assertEquals(
        checkRadius("var(--radius) var(--radius) 0 0", FIXTURE_REGISTRY),
        "ok",
    );
    assertEquals(
        checkRadius("calc(var(--control-radius) - 2px)", FIXTURE_REGISTRY),
        "ok",
    );
    assertEquals(
        checkRadius("var(--radius-card)", FIXTURE_REGISTRY),
        "unregistered",
    );
    assertEquals(
        checkRadius("var(--radius) var(--radius-card)", FIXTURE_REGISTRY),
        "unregistered",
    );
    assertEquals(checkRadius("10px", FIXTURE_REGISTRY), "raw");
    assertEquals(
        checkRadius("calc(56px * var(--radius))", FIXTURE_REGISTRY),
        "raw",
    );
});

Deno.test("registry - accent fill matches per file, ignoring interaction-state pseudo-classes", () => {
    const button = "web/src/components/ui/button.css";
    assert(
        isRegisteredAccentFill(button, ".button--primary", FIXTURE_REGISTRY),
    );
    assert(
        isRegisteredAccentFill(
            button,
            ".button--primary:hover",
            FIXTURE_REGISTRY,
        ),
    );
    assert(
        isRegisteredAccentFill(
            button,
            ".button--primary:hover:not(:disabled)",
            FIXTURE_REGISTRY,
        ),
    );
    assert(
        !isRegisteredAccentFill(button, ".button--secondary", FIXTURE_REGISTRY),
    );
    // Same selector, different file: not registered.
    assert(
        !isRegisteredAccentFill(
            "web/src/features/other.css",
            ".button--primary",
            FIXTURE_REGISTRY,
        ),
    );
    // Every selector of a list must be registered.
    const toggle = "web/src/components/ui/switch.css";
    assert(
        isRegisteredAccentFill(
            toggle,
            ".switch--on, .switch[data-checked]",
            FIXTURE_REGISTRY,
        ),
    );
    assert(
        !isRegisteredAccentFill(
            toggle,
            ".switch--on, .switch--sneaky",
            FIXTURE_REGISTRY,
        ),
    );
    assert(!isRegisteredAccentFill(toggle, "", FIXTURE_REGISTRY));
});
