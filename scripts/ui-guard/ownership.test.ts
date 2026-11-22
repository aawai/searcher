import { assertEquals } from "@std/assert";
import {
    checkNativeFormControl,
    checkRuleC_UndefinedCssTokens,
    checkRuleD_NativeConfirm,
} from "./ownership.ts";

Deno.test("undefined-css-token: detects undefined vars and allows tokens.css, local, and runtime vars", () => {
    const tokensCss = `:root { --surface: #fff; --space-2: 8px; }`;
    const cssFiles = [
        {
            file: "web/src/features/demo/demo.css",
            content: `
                .demo {
                    --local-pad: 12px;
                    background: var(--surface);
                    padding: var(--local-pad);
                    margin: var(--space-2);
                    background-image: var(--wallpaper-image);
                    color: var(--missing-color);
                }
            `,
        },
    ];
    const tsxFiles = [
        {
            file: "web/src/features/demo/Demo.tsx",
            content: `
                export function Demo() {
                    return <div style={{ color: "var(--missing-tsx-token)", margin: "var(--space-2)" }} />;
                }
            `,
        },
    ];

    const violations = checkRuleC_UndefinedCssTokens(
        cssFiles,
        tokensCss,
        tsxFiles,
    );
    assertEquals(violations.length, 2);
    assertEquals(violations[0].rule, "undefined-css-token");
    assertEquals(violations[0].snippet, "var(--missing-color)");
    assertEquals(violations[1].rule, "undefined-css-token");
    assertEquals(violations[1].snippet, "var(--missing-tsx-token)");
});

Deno.test("native-destructive-confirm: blocks confirm(), window.confirm(), globalThis.confirm() in non-test files", () => {
    const code = `
        export function onDelete() {
            if (confirm("Sure?")) return true;
            if (window.confirm("Really?")) return true;
            if (globalThis.confirm("Final?")) return true;
            return false;
        }
    `;
    const violations = checkRuleD_NativeConfirm(
        "web/src/features/demo/Demo.tsx",
        code,
    );
    assertEquals(violations.length, 3);
    assertEquals(
        violations.map((v) => v.rule),
        [
            "native-destructive-confirm",
            "native-destructive-confirm",
            "native-destructive-confirm",
        ],
    );

    // Test files are exempt
    const testViolations = checkRuleD_NativeConfirm(
        "web/src/features/demo/Demo.test.tsx",
        code,
    );
    assertEquals(testViolations.length, 0);
});

Deno.test("native-form-control: blocks native checkbox/radio/range outside components/ui and NoteMarkdown", () => {
    const code = `
        export function Form() {
            return (
                <>
                    <input type="checkbox" />
                    <input type="radio" />
                    <input type="range" />
                    <input type="text" />
                </>
            );
        }
    `;
    const violations = checkNativeFormControl(
        "web/src/features/demo/Form.tsx",
        code,
    );
    assertEquals(violations.length, 3);
    assertEquals(
        violations.map((v) => v.rule),
        ["native-form-control", "native-form-control", "native-form-control"],
    );

    assertEquals(
        checkNativeFormControl("web/src/components/ui/checkbox.tsx", code)
            .length,
        0,
    );
    assertEquals(
        checkNativeFormControl(
            "web/src/components/searcher/NoteMarkdown.tsx",
            code,
        ).length,
        0,
    );
});
