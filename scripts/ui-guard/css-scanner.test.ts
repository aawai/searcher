import { assertEquals } from "@std/assert";
import { scanCssCode } from "./css-scanner.ts";

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

Deno.test("css-scanner - detects raw font-size", () => {
    const css = `
        .title {
            font-size: 24px;
        }
        .subtitle {
            font-size: 1.25rem;
        }
        .valid-title {
            font-size: var(--font-page-title-size);
        }
        .inherited {
            font-size: inherit;
        }
    `;
    const violations = scanCssCode("web/src/features/title.css", css);
    const fontViolations = violations.filter((v: { rule: string }) =>
        v.rule === "raw-font-size"
    );
    assertEquals(fontViolations.length, 2);
});

Deno.test("css-scanner - detects raw border-radius", () => {
    const css = `
        .badge {
            border-radius: 8px;
        }
        .pill {
            border-radius: 999px;
        }
        .circle {
            border-radius: 50%;
        }
        .token-radius {
            border-radius: var(--radius);
        }
    `;
    const violations = scanCssCode("web/src/features/badge.css", css);
    const radiusViolations = violations.filter((v: { rule: string }) =>
        v.rule === "raw-border-radius"
    );
    assertEquals(radiusViolations.length, 1);
    assertEquals(radiusViolations[0].property, "border-radius");
});

Deno.test("css-scanner - detects raw spacing literals in presentation CSS", () => {
    const css = `
        .bento {
            padding: 16px 20px;
            margin: 0 auto 28px;
            gap: 15px;
        }
        .token-bento {
            padding: var(--space-4);
            margin: 0 auto;
            gap: var(--space-3);
        }
    `;
    const violations = scanCssCode("web/src/features/bento.css", css);
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
