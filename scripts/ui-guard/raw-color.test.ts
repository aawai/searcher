import { assertEquals } from "@std/assert";
import { scanCssCode } from "./css-scanner.ts";
import {
    isDomainValueException,
    isWallpaperFilterException,
} from "./exceptions.ts";
import { findRawColors, hasRawColor } from "./raw-color.ts";
import { FIXTURE_REGISTRY } from "./test-registry.ts";

function scanCss(file: string, css: string) {
    return scanCssCode(file, css, FIXTURE_REGISTRY);
}

Deno.test("raw-color - reports raw colors with exact file, line, and column locations", () => {
    const violations = scanCss(
        "web/src/app/audit-probe.css",
        ".audit{color:#ff00ff;background:#00ff00}",
    );
    assertEquals(violations, [
        {
            file: "web/src/app/audit-probe.css",
            rule: "raw-color",
            property: "color",
            value: "color: #ff00ff",
            line: 1,
            column: 8,
            fingerprint: "raw-color:color:color: #ff00ff",
        },
        {
            file: "web/src/app/audit-probe.css",
            rule: "raw-color",
            property: "background",
            value: "background: #00ff00",
            line: 1,
            column: 22,
            fingerprint: "raw-color:background:background: #00ff00",
        },
    ]);
});

Deno.test("raw-color - detects hex, rgb/hsl/modern color functions, named colors, gradients, shadows, and var fallbacks", () => {
    const css = `
        .probe {
            color: #f0f;
            background-color: #00ff0080;
            border: 1px solid rgb(0 0 0 / 0.12);
            outline: 2px solid hsl(210 50% 40%);
            caret-color: oklch(0.62 0.19 250);
            fill: rebeccapurple;
            stroke: crimson;
            background-image: linear-gradient(135deg, var(--surface), #ff00ff);
            mask-image: radial-gradient(circle, rgba(0, 0, 0, 0.4), transparent);
            box-shadow: 0 0 0 2px #ff0000, var(--shadow-l2);
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
            filter: drop-shadow(0 2px 4px black);
            border-color: var(--border, #bbbbbb);
            accent-color: var(--accent, dodgerblue);
            background: color-mix(in srgb, #ff0000 12%, transparent);
            --local-surface: #ffffff;
        }
    `;
    const violations = scanCss("web/src/features/probe.css", css);
    assertEquals(
        violations.map((v) => [v.rule, v.property, v.line]),
        [
            ["raw-color", "color", 3],
            ["raw-color", "background-color", 4],
            ["raw-color", "border", 5],
            ["raw-color", "outline", 6],
            ["raw-color", "caret-color", 7],
            ["raw-color", "fill", 8],
            ["raw-color", "stroke", 9],
            ["raw-color", "background-image", 10],
            ["raw-color", "mask-image", 11],
            ["raw-color", "box-shadow", 12],
            ["raw-color", "text-shadow", 13],
            ["raw-color", "filter", 14],
            ["raw-color", "border-color", 15],
            ["raw-color", "accent-color", 16],
            ["raw-color", "background", 17],
            ["raw-color", "--local-surface", 18],
        ],
    );
});

Deno.test("raw-color - registered accent-fill selector still rejects mixed raw color literals", () => {
    const css = `
        .button--primary {
            background: linear-gradient(var(--accent), #ff0000);
        }
    `;
    assertEquals(
        scanCss("web/src/components/ui/button.css", css).map((v) => [
            v.rule,
            v.property,
        ]),
        [["raw-color", "background"]],
    );
});

Deno.test("raw-color - allows valid Tokens, currentColor, transparent, and token-only color-mix/gradients/shadows", () => {
    const css = `
        .valid {
            color: var(--foreground);
            background: transparent;
            border: 1px solid currentColor;
            outline: 2px solid var(--ring);
            fill: currentcolor;
            stroke: none;
            background-image: linear-gradient(
                to bottom,
                color-mix(in srgb, var(--foreground) 8%, transparent),
                transparent
            );
            mask-image: linear-gradient(
                to right,
                transparent,
                var(--foreground) var(--dock-apps-fade-start, 0px),
                transparent
            );
            box-shadow: 0 0 0 2px var(--ring), var(--shadow-material-edge), var(--shadow-l2);
            text-shadow: var(--wallpaper-text-halo);
            filter: blur(16px) saturate(1.6);
            background-color: var(--surface-document-paper, var(--surface-solid));
            scrollbar-color: var(--border-control) transparent;
            --local-alias: var(--surface-soft);
        }
    `;
    assertEquals(scanCss("web/src/features/valid.css", css), []);
});

Deno.test("raw-color - strings, URLs (including data URLs with semicolons/braces), and non-color properties do not false-positive", () => {
    const css = `
        .non-color {
            content: "color: #ff00ff; background: rgb(0, 255, 0); { fill: red } /* not a comment */";
            background-image: url("https://example.com/assets/#ff00ff/red.png?a=1;b=2");
            mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' style='fill:#ff00ff'>{stroke:red;color:black}</svg>");
            --task-box-checked: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cmask id='t'%3E%3Crect fill='white' stroke='black'/%3E%3C/mask%3E%3Crect mask='url(%23t)'/%3E%3C/svg%3E");
            filter: url(#blur-stage);
            mask: url(#clip-path);
            font-family: Coral, Gold, Georgia, sans-serif;
            --local-surface: "red #fff";
            --icon-name: coral;
            --animation-name: salmon;
            animation-name: salmon;
            grid-area: crimson;
            view-transition-name: indigo;
            white-space: nowrap;
            color: var(--color-red);
        }
    `;
    assertEquals(scanCss("web/src/features/non-color.css", css), []);

    // Mixed URL + gradient: URL interior is ignored, but raw color in gradient alongside it is caught
    const mixedCss = `
        .mixed {
            background-image:
                url("data:image/svg+xml;utf8,<svg style='fill:#ff00ff'>{color:red}</svg>"),
                linear-gradient(180deg, #123456, transparent);
        }
    `;
    const mixedViolations = scanCss("web/src/features/mixed.css", mixedCss);
    assertEquals(mixedViolations.length, 1);
    assertEquals(mixedViolations[0].rule, "raw-color");
    assertEquals(mixedViolations[0].property, "background-image");
    assertEquals(
        findRawColors(
            `url("data:image/svg+xml;utf8,<svg style='fill:#ff00ff'/>"), linear-gradient(180deg, #123456, transparent)`,
            "background-image",
        ).map((m) => m.token),
        ["#123456"],
    );
});

Deno.test("raw-color - rejects non-hex # tokens while catching valid 3/4/6/8-digit hex", () => {
    assertEquals(
        findRawColors("#1 #12 #12345 #1234567 #123456789 #xyz #main", "color"),
        [],
    );
    assertEquals(hasRawColor("#ff00ff", "color"), true);
    assertEquals(hasRawColor("var(--foreground)", "color"), false);
    assertEquals(hasRawColor("#ff00ff", "padding"), false);
    assertEquals(
        findRawColors("#abc #abcd #a1b2c3 #a1b2c3d4", "color").map(
            (m) => m.token,
        ),
        ["#abc", "#abcd", "#a1b2c3", "#a1b2c3d4"],
    );
});

Deno.test("raw-color - domain exception: note dot palette is restricted to exact owner, selector, property, and value", () => {
    const owner = "web/src/components/searcher/document-colors.css";
    const validCss = `
        :where(.note-quick-dot, .documents-color-dot) {
            --note-dot-amber: #724E00;
            --note-dot-rose: #7F3B58;
            --note-dot-sage: #2C6330;
            --note-dot-sky: #085B87;
            --note-dot-paper: #5A5A60;
        }
        [data-theme="dark"] :where(.note-quick-dot, .documents-color-dot) {
            --note-dot-amber: #E6C183;
            --note-dot-rose: #F7AFCA;
            --note-dot-sage: #A3D7A3;
            --note-dot-sky: #91D0FC;
            --note-dot-paper: #BEBEC4;
        }
    `;
    assertEquals(scanCss(owner, validCss), []);

    // Wrong owner with identical CSS is rejected
    assertEquals(
        scanCss("web/src/features/home-layouts/home-notes.css", validCss)
            .length,
        10,
    );

    // Wrong selector, wrong property, or wrong hex value inside owner is rejected
    const invalidInOwner = `
        .note-quick-dot {
            --note-dot-amber: #724E00;
        }
        :where(.note-quick-dot, .documents-color-dot) {
            --note-dot-amber: #E6C183;
            --note-dot-extra: #724E00;
            background: #724E00;
            color: #5A5A60;
        }
    `;
    assertEquals(
        scanCss(owner, invalidInOwner).map((v) => [v.rule, v.property, v.line]),
        [
            ["raw-color", "--note-dot-amber", 3],
            ["raw-color", "--note-dot-amber", 6],
            ["raw-color", "--note-dot-extra", 7],
            ["raw-color", "background", 8],
            ["raw-color", "color", 9],
        ],
    );
});

Deno.test("raw-color - domain exception: Design Lab glass fixture is restricted to exact selector and value", () => {
    const labOwner = "web/src/design-lab/design-lab.css";
    const validCss = `
        .design-lab-wallpaper {
            background:
                radial-gradient(40% 60% at 15% 30%, #E5322D, transparent),
                radial-gradient(40% 60% at 85% 70%, #1F6FEB, transparent),
                repeating-linear-gradient(90deg, #111 0 14px, #F5F5F5 14px 28px);
        }
    `;
    assertEquals(scanCss(labOwner, validCss), []);

    // Same gradient on another selector or in another file is rejected
    assertEquals(
        scanCss(
            labOwner,
            validCss.replace(".design-lab-wallpaper", ".design-lab-material"),
        ).map((v) => v.rule),
        ["raw-color"],
    );
    assertEquals(
        scanCss("web/src/styles/global.css", validCss).map((v) => v.rule),
        ["raw-color"],
    );
    // Other raw colors on .design-lab-wallpaper are rejected
    assertEquals(
        scanCss(
            labOwner,
            `.design-lab-wallpaper { background: #E5322D; color: #1F6FEB; }`,
        ).map((v) => [v.rule, v.property]),
        [
            ["raw-color", "background"],
            ["raw-color", "color"],
        ],
    );
});

Deno.test("raw-color - legacy runtime exceptions do not allow static raw colors to bypass checks", () => {
    assertEquals(
        isDomainValueException(
            "web/src/app/SettingsPage.tsx",
            "--item-accent",
            '"#1d4ed8"',
        ),
        false,
    );
    assertEquals(
        isDomainValueException(
            "web/src/app/SettingsPage.tsx",
            "--item-accent",
            "'red'",
        ),
        false,
    );
    assertEquals(
        isDomainValueException(
            "web/src/app/SettingsPage.tsx",
            "background",
            'getAccentLight("#ff0000")',
        ),
        false,
    );
    assertEquals(
        isWallpaperFilterException(
            "web/src/components/wallpaper/WallpaperSurface.tsx",
            "--wallpaper-image",
            '"linear-gradient(#ff0000, #00ff00)"',
        ),
        false,
    );
    assertEquals(
        isWallpaperFilterException(
            "web/src/styles/global.css",
            "filter",
            "var(--wallpaper-filter, drop-shadow(0 0 4px #ff0000))",
        ),
        false,
    );
});

Deno.test("raw-color diagnoses colors even when another rule rejects the declaration", () => {
    const css = `.probe {
        box-shadow: 0 2px 4px red;
        background: linear-gradient(var(--accent), #ff00ff);
    }`;
    const violations = scanCss("web/src/app/probe.css", css);
    assertEquals(violations.map(({ rule, property }) => [rule, property]), [
        ["raw-color", "box-shadow"],
        ["raw-box-shadow", "box-shadow"],
        ["raw-color", "background"],
        ["unregistered-accent-fill", "background"],
    ]);
});
