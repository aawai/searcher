import { assertEquals } from "@std/assert";
import { scanCssCode as scanCssWithRegistry } from "./css-scanner.ts";
import { FIXTURE_REGISTRY } from "./test-registry.ts";

function scanCssCode(file: string, css: string) {
    return scanCssWithRegistry(file, css, FIXTURE_REGISTRY);
}

Deno.test("css-scanner - media widths use registered paired boundaries", () => {
    const css = `
        @media (max-width: 639px), (min-width: 640px) { .a { display: block; } }
        @media (min-width: 768px) and (max-width: 1023px) { .b { display: block; } }
        @media (any-pointer: coarse) { .c { display: block; } }
        @media (max-width: 640px) { .d { display: block; } }
        @media (min-width: 641px) { .e { display: block; } }
        @media (max-width: 900px) { .f { display: block; } }
        @media (width < 700px) { .g { display: block; } }
    `;
    assertEquals(
        scanCssCode("web/src/features/layout.css", css).map((v) => v.rule),
        Array(4).fill("unregistered-breakpoint"),
    );
});

Deno.test("css-scanner - detects raw box-shadow", () => {
    const css = `
        .card {
            box-shadow: 0 4px 16px -8px rgba(0, 0, 0, 0.10);
        }
        .valid-card {
            box-shadow: var(--shadow-l1);
        }
        .flat {
            box-shadow: none;
        }
    `;
    const violations = scanCssCode("web/src/features/card.css", css);
    const shadowViolations = violations.filter((v: { rule: string }) =>
        v.rule === "raw-box-shadow"
    );
    assertEquals(shadowViolations.length, 1);
    assertEquals(shadowViolations[0].property, "box-shadow");
});

Deno.test("css-scanner - detects raw spacing literals in presentation CSS", () => {
    const css = `
        .panel {
            padding: 16px 20px;
            margin: 0 auto 28px;
            gap: 15px;
        }
        .token-panel {
            padding: var(--space-4);
            margin: 0 auto;
            gap: var(--space-3);
        }
    `;
    const violations = scanCssCode("web/src/features/panel.css", css);
    const spacingViolations = violations.filter((v: { rule: string }) =>
        v.rule === "raw-spacing-literal"
    );
    assertEquals(spacingViolations.length, 3); // padding, margin, gap
});

Deno.test("css-scanner - respects documented rules for tokens.css and global reset", () => {
    const tokensCss = `
        :root {
            --radius: 12px;
            --font-body-size: 14px;
            --shadow-l1: 0 4px 16px -8px rgba(0, 0, 0, 0.10);
            --space-4: 16px;
            --elevation-modal: 71;
        }
    `;
    const tokenViolations = scanCssCode(
        "web/src/design-system/tokens.css",
        tokensCss,
    );
    assertEquals(tokenViolations.length, 0);

    const globalResetCss = `
        *, ::before, ::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
    `;
    const resetViolations = scanCssCode(
        "web/src/styles/global.css",
        globalResetCss,
    );
    assertEquals(resetViolations.length, 0);
});

Deno.test("css-scanner - rejects numeric z-index and allows tokens and runtime values", () => {
    const css = `
        .positive { z-index: 3; }
        .negative { z-index: -1; }
        .zero { z-index: 0; }
        .token { z-index: var(--elevation-modal); }
        .automatic { z-index: auto; }
        .runtime { z-index: calc(var(--elevation-base) + 1); }
    `;
    const violations = scanCssCode("web/src/features/layers.css", css);
    assertEquals(
        violations.map((violation) => [violation.rule, violation.value]),
        [
            ["raw-z-index", "z-index: 3"],
            ["raw-z-index", "z-index: -1"],
            ["raw-z-index", "z-index: 0"],
        ],
    );
});

function rulesAndValues(file: string, css: string) {
    return scanCssCode(file, css).map((v) => [v.rule, v.value]);
}

Deno.test("css-scanner - font-size only accepts registered Tokens", () => {
    const css = `
        .ok { font-size: var(--font-body-size); }
        .relative { font-size: 1em; }
        .unregistered { font-size: var(--font-launcher-glyph); }
        .raw { font-size: 15px; }
    `;
    assertEquals(rulesAndValues("web/src/features/a.css", css), [
        ["unregistered-font-token", "font-size: var(--font-launcher-glyph)"],
        ["raw-font-size", "font-size: 15px"],
    ]);
});

Deno.test("css-scanner - border-radius only accepts registered Tokens and Token insets", () => {
    const css = `
        .ok { border-radius: var(--radius); }
        .inset { border-radius: calc(var(--control-radius) - 2px); }
        .sides { border-radius: var(--radius) var(--radius) 0 0; }
        .circle { border-radius: 50%; }
        .unregistered { border-radius: var(--radius-card); }
        .scaled { border-radius: calc(56px * var(--radius)); }
        .raw { border-top-left-radius: 10px; }
    `;
    assertEquals(rulesAndValues("web/src/features/a.css", css), [
        ["unregistered-radius-token", "border-radius: var(--radius-card)"],
        ["raw-border-radius", "border-radius: calc(56px * var(--radius))"],
        ["raw-border-radius", "border-top-left-radius: 10px"],
    ]);
});

Deno.test("css-scanner - font and radius Token definitions must be registered, in tokens.css and feature CSS alike", () => {
    const tokens = `
        :root {
            --font-body-size: 14px;
            --font-brand-size: 19px;
            --font-body-weight: 400;
            --font-body-line-height: 22px;
            --font-sans: system-ui;
            --radius: 12px;
            --multiline-radius: 10px;
            --space-4: 16px;
        }
    `;
    assertEquals(rulesAndValues("web/src/design-system/tokens.css", tokens), [
        ["unregistered-token-definition", "--font-brand-size: 19px"],
        ["unregistered-token-definition", "--multiline-radius: 10px"],
    ]);
    const local =
        `.x { --radius-local: 5px; --font-local-size: 11px; --radius: 3px; }`;
    assertEquals(rulesAndValues("web/src/features/a.css", local), [
        ["unregistered-token-definition", "--radius-local: 5px"],
        ["unregistered-token-definition", "--font-local-size: 11px"],
    ]);
});

Deno.test("css-scanner - accent background and fill are limited to registered semantics", () => {
    const file = "web/src/components/ui/button.css";
    const css = `
        .button--primary { background: var(--accent); }
        .button--primary:hover { background: var(--accent-hover); }
        .button--primary:active:not(:disabled) { background: var(--accent-active); }
        .card--decor { background: var(--accent); }
        .card--glow { background-image: linear-gradient(var(--accent), transparent); }
        .icon--tinted { fill: var(--accent); }
        .card--tint { background: var(--accent-soft); }
        .card--outline { border-color: var(--accent); color: var(--accent); }
        @media (max-width: 767px) {
            .card--mobile { background-color: var(--accent); }
        }
    `;
    assertEquals(rulesAndValues(file, css), [
        [
            "unregistered-accent-fill",
            ".card--decor { background: var(--accent) }",
        ],
        [
            "unregistered-accent-fill",
            ".card--glow { background-image: linear-gradient(var(--accent), transparent) }",
        ],
        [
            "unregistered-accent-fill",
            ".icon--tinted { fill: var(--accent) }",
        ],
        [
            "unregistered-accent-fill",
            ".card--mobile { background-color: var(--accent) }",
        ],
    ]);
});

Deno.test("css-scanner - a registered accent selector is not registered for other files or other selectors in its list", () => {
    const css = `.button--primary { background: var(--accent); }`;
    assertEquals(rulesAndValues("web/src/features/other.css", css), [
        [
            "unregistered-accent-fill",
            ".button--primary { background: var(--accent) }",
        ],
    ]);
    const list =
        `.switch[data-checked], .switch--sneaky { background: var(--accent); }`;
    assertEquals(
        rulesAndValues("web/src/components/ui/switch.css", list).length,
        1,
    );
    const registered =
        `.switch[data-checked], .switch--on { background: var(--accent); }`;
    assertEquals(
        rulesAndValues("web/src/components/ui/switch.css", registered),
        [],
    );
});
