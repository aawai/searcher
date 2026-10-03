import { assertEquals } from "@std/assert";
import { runCheck } from "../check-ui.ts";
import {
    checkRuleA_GlobalFeaturePrefix,
    checkRuleB_PageLayout,
    checkRuleC_UndefinedCssTokens,
    checkRuleD_NativeConfirm,
    checkRuleE_ForbiddenLegacyUiClass,
    checkRuleF_CssPrefixOwnership,
    formatOwnershipReport,
    scanOwnership,
} from "./ownership.ts";

Deno.test("Rule A: feature-selector-in-global - denies feature prefix in global.css", () => {
    const invalidCss = `
.topbar { display: flex; }
.trash-header { display: flex; align-items: center; }
.ask-guest { min-height: 100vh; }
.settings-nav { margin: 0; }
`;

    const violations = checkRuleA_GlobalFeaturePrefix(
        "web/src/styles/global.css",
        invalidCss,
    );
    assertEquals(violations.length, 3);
    assertEquals(violations[0].rule, "feature-selector-in-global");
    assertEquals(violations[0].snippet, ".trash-header");
    assertEquals(violations[1].snippet, ".ask-guest");
    assertEquals(violations[2].snippet, ".settings-nav");
});

Deno.test("Rule A: feature-selector-in-global - ignores non-global css files", () => {
    const featureCss = `
.trash-header { display: flex; }
`;
    const violations = checkRuleA_GlobalFeaturePrefix(
        "web/src/app/trash.css",
        featureCss,
    );
    assertEquals(violations.length, 0);
});

Deno.test("Rule A: feature-selector-in-global - allows non-feature selectors and comments in global.css", () => {
    const validCss = `
/* .trash-old notes in comment should be ignored */
:root { --font-size: 14px; }
body { margin: 0; }
.topbar { display: flex; }
.app-shell { min-height: 100vh; }
.sr-only { position: absolute; }
`;
    const violations = checkRuleA_GlobalFeaturePrefix(
        "web/src/styles/global.css",
        validCss,
    );
    assertEquals(violations.length, 0);
});

Deno.test("Rule B: legacy-page-layout - denies PageShell using legacy 'page' class in TSX", () => {
    const invalidTsx1 = `
export function AccountPage() {
    return (
        <PageShell archetype="utility" className="page account-page">
            <PageHeader title="账户" />
        </PageShell>
    );
}
`;
    const invalidTsx2 = `
export function SettingsPage() {
    return (
        <PageShell archetype="utility" className="page">
            <PageHeader title="设置" />
        </PageShell>
    );
}
`;

    const v1 = checkRuleB_PageLayout(
        "web/src/app/AccountPage.tsx",
        invalidTsx1,
    );
    assertEquals(v1.length, 1);
    assertEquals(v1[0].rule, "legacy-page-layout");

    const v2 = checkRuleB_PageLayout(
        "web/src/app/SettingsPage.tsx",
        invalidTsx2,
    );
    assertEquals(v2.length, 1);
    assertEquals(v2[0].rule, "legacy-page-layout");
});

Deno.test("Rule B: legacy-page-layout - allows PageShell without 'page' class and non-PageShell elements in TSX", () => {
    const validTsx = `
export function AdminPage() {
    return (
        <PageShell archetype="management" className="admin-shell">
            <div className="page-content">
                <div className="page">Legacy inner wrapper allowed if needed</div>
            </div>
        </PageShell>
    );
}
`;
    const violations = checkRuleB_PageLayout(
        "web/src/app/AdminPage.tsx",
        validTsx,
    );
    assertEquals(violations.length, 0);
});

Deno.test("Rule B: legacy-page-layout - denies legacy .page geometry and simulated page geometry in CSS", () => {
    const legacyPageCss = `
.page {
    width: min(100% - 2 * var(--space-page-inline), var(--layout-page-max));
    margin: var(--space-page-block) auto var(--space-page-footer);
}
`;
    const v1 = checkRuleB_PageLayout(
        "web/src/styles/global.css",
        legacyPageCss,
    );
    assertEquals(v1.length, 1);
    assertEquals(v1[0].rule, "legacy-page-layout");

    const simulatedPageCss = `
.trash-page {
    max-width: var(--layout-page-max);
    margin: 0 auto;
}
`;
    const v2 = checkRuleB_PageLayout(
        "web/src/app/trash.css",
        simulatedPageCss,
    );
    assertEquals(v2.length, 1);
    assertEquals(v2[0].rule, "legacy-page-layout");
});

Deno.test("Rule B: legacy-page-layout - allows canonical PageShell CSS in semantic.css", () => {
    const canonicalCss = `
.page-shell[data-archetype] {
    width: calc(100% - 2 * var(--space-page-inline));
    max-width: var(--layout-page-max);
}
.card {
    max-width: 400px;
}
`;
    const violations = checkRuleB_PageLayout(
        "web/src/components/searcher/semantic.css",
        canonicalCss,
    );
    assertEquals(violations.length, 0);
});

Deno.test("Rule C: undefined-css-token - allows tokens defined in tokens.css, locally, or in runtime registry", () => {
    const tokensCss = `
:root {
    --accent: #3b82f6;
    --radius: 8px;
}
`;
    const appCss = `
.local-box {
    --local-gap: 16px;
    gap: var(--local-gap);
    color: var(--accent);
    border-radius: var(--radius);
    background-image: var(--wallpaper-image);
    filter: blur(var(--wallpaper-blur, 0px));
}
`;

    const violations = checkRuleC_UndefinedCssTokens(
        [{ file: "web/src/app/test.css", content: appCss }],
        tokensCss,
    );
    assertEquals(violations.length, 0);
});

Deno.test("Rule C: undefined-css-token - denies undefined tokens in CSS files", () => {
    const tokensCss = `
:root {
    --accent: #3b82f6;
}
`;
    const appCss = `
.chat-bubble {
    border-radius: var(--radius-card);
    color: var(--destructive);
    padding: var(--unknown-padding);
}
`;

    const violations = checkRuleC_UndefinedCssTokens(
        [{ file: "web/src/features/ask/ask-workspace.css", content: appCss }],
        tokensCss,
    );
    assertEquals(violations.length, 3);
    assertEquals(violations[0].rule, "undefined-css-token");
    assertEquals(violations[0].snippet, "var(--radius-card)");
    assertEquals(violations[1].snippet, "var(--destructive)");
    assertEquals(violations[2].snippet, "var(--unknown-padding)");
});

Deno.test("Rule D: native-destructive-confirm - denies confirm, globalThis.confirm, window.confirm in ts/tsx", () => {
    const code = `
export function handleDelete() {
    if (confirm("确定要删除吗？")) {
        doDelete();
    }
    if (!globalThis.confirm("彻底删除？")) return;
    if (window.confirm("Sure?")) return;
}
`;

    const violations = checkRuleD_NativeConfirm(
        "web/src/app/TrashPage.tsx",
        code,
    );
    assertEquals(violations.length, 3);
    assertEquals(violations[0].rule, "native-destructive-confirm");
    assertEquals(violations[0].snippet, "confirm(...)");
    assertEquals(violations[1].snippet, "globalThis.confirm(...)");
    assertEquals(violations[2].snippet, "window.confirm(...)");
});

Deno.test("Rule D: native-destructive-confirm - allows non-native confirm calls, properties and comments", () => {
    const code = `
// if (confirm("old comment")) return;
export function DialogExample() {
    const isConfirmed = true;
    const onConfirm = () => {};
    api.confirm();
    return <button onClick={onConfirm}>Confirm</button>;
}
`;

    const violations = checkRuleD_NativeConfirm(
        "web/src/components/MyDialog.tsx",
        code,
    );
    assertEquals(violations.length, 0);
});

Deno.test("Rule D: native-destructive-confirm - skips test files", () => {
    const testCode = `
if (confirm("test check")) {}
`;
    const violations = checkRuleD_NativeConfirm(
        "web/src/app/TrashPage.test.tsx",
        testCode,
    );
    assertEquals(violations.length, 0);
});

Deno.test("Rule E: forbidden-legacy-ui-class - denies forbidden legacy classes in TSX", () => {
    const tsxCode = `
export function LegacySample() {
    return (
        <div>
            <div className="webapp-undo-toast">Toast</div>
            <div className="trash-empty-card">Empty</div>
            <div className="trash-status-msg">Status</div>
            <div className="home-error-toast">Error</div>
            <span className="icon spin" />
            <div className="ask-layout" />
            <div className="ask-history" />
            <div className="ask-composer" />
        </div>
    );
}
`;

    const violations = checkRuleE_ForbiddenLegacyUiClass(
        "web/src/app/LegacySample.tsx",
        tsxCode,
    );
    assertEquals(violations.length, 8);
    for (const v of violations) {
        assertEquals(v.rule, "forbidden-legacy-ui-class");
    }
});

Deno.test("Rule E: forbidden-legacy-ui-class - denies forbidden legacy classes in CSS", () => {
    const cssCode = `
.webapp-undo-toast { position: fixed; }
.trash-empty-card { display: flex; }
.trash-status-msg { color: green; }
.home-error-toast { color: red; }
.spin { animation: spin 1s; }
.ask-main { display: flex; }
.ask-message { padding: 10px; }
`;

    const violations = checkRuleE_ForbiddenLegacyUiClass(
        "web/src/styles/test.css",
        cssCode,
    );
    assertEquals(violations.length, 7);
    for (const v of violations) {
        assertEquals(v.rule, "forbidden-legacy-ui-class");
    }
});

Deno.test("Rule E: forbidden-legacy-ui-class - allows modern classes and similar substrings", () => {
    const tsxCode = `
export function ModernSample() {
    return (
        <div>
            <span className="animate-spin" />
            <span className="spinner-icon" />
            <div className="ask-history-sheet" />
            <div className="ask-history-sheet__close" />
            <div className="ask-composer-surface" />
            <div className="ask-composer-container" />
            <div className="ask-composer__action-pill" />
        </div>
    );
}
`;

    const violations = checkRuleE_ForbiddenLegacyUiClass(
        "web/src/app/ModernSample.tsx",
        tsxCode,
    );
    assertEquals(violations.length, 0);

    const cssCode = `
.animate-spin { animation: spin 1s linear infinite; }
.ask-history-sheet { top: 0; }
.ask-composer-surface { background: #fff; }
`;
    const cssViolations = checkRuleE_ForbiddenLegacyUiClass(
        "web/src/app/modern.css",
        cssCode,
    );
    assertEquals(cssViolations.length, 0);
});

Deno.test("Rule F: css-prefix-ownership - allows prefixes in authorized owner files", () => {
    const settingsCss = `
.settings-layout { display: grid; }
.settings-nav { flex-direction: column; }
`;
    const violations = checkRuleF_CssPrefixOwnership(
        "web/src/app/settings.css",
        settingsCss,
    );
    assertEquals(violations.length, 0);

    const launcherCss = `
.launcher-grid { display: grid; }
.webapp-tile { border-radius: 8px; }
`;
    const launcherViolations = checkRuleF_CssPrefixOwnership(
        "web/src/components/searcher/launcher.css",
        launcherCss,
    );
    assertEquals(launcherViolations.length, 0);
});

Deno.test("Rule F: css-prefix-ownership - denies feature prefixes defined in unauthorized CSS files", () => {
    const unauthorizedCss = `
.settings-nav { display: flex; }
.settings-panel { padding: 12px; }
.trash-table { width: 100%; }
.ask-composer-container { max-width: 760px; }
`;

    const violations = checkRuleF_CssPrefixOwnership(
        "web/src/components/searcher/semantic.css",
        unauthorizedCss,
    );
    assertEquals(violations.length, 4);
    for (const v of violations) {
        assertEquals(v.rule, "css-prefix-ownership");
    }
    assertEquals(violations[0].snippet, ".settings-nav");
    assertEquals(violations[1].snippet, ".settings-panel");
    assertEquals(violations[2].snippet, ".trash-table");
    assertEquals(violations[3].snippet, ".ask-composer-container");
});

Deno.test("Rule F: css-prefix-ownership - allows non-prefixed semantic classes in semantic.css", () => {
    const semanticCss = `
.semantic-section { margin-bottom: 24px; }
.section-header { font-size: 18px; }
.status-banner { padding: 12px; }
.empty-state { text-align: center; }
`;
    const violations = checkRuleF_CssPrefixOwnership(
        "web/src/components/searcher/semantic.css",
        semanticCss,
    );
    assertEquals(violations.length, 0);
});

Deno.test("Rule F: css-prefix-ownership - allows canonical semantic classes like settings-card/row in semantic.css", () => {
    const canonicalSemanticCss = `
.settings-card { border: 1px solid var(--border); }
.settings-row { min-height: 40px; }
.settings-row-label { display: flex; }
.workspace-toolbar { display: flex; }
`;
    const violations = checkRuleF_CssPrefixOwnership(
        "web/src/components/searcher/semantic.css",
        canonicalSemanticCss,
    );
    assertEquals(violations.length, 0);
});

Deno.test("Ownership scanner - scanOwnership aggregates violations across files and ignores tests", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "ownership-scan-test-" });
    try {
        await Deno.mkdir(`${tempDir}/styles`, { recursive: true });
        await Deno.mkdir(`${tempDir}/app`, { recursive: true });
        await Deno.mkdir(`${tempDir}/design-system`, { recursive: true });

        // tokens.css
        await Deno.writeTextFile(
            `${tempDir}/design-system/tokens.css`,
            `:root { --accent: #333; --border: #ccc; }`,
        );

        // global.css with Rule A violation
        await Deno.writeTextFile(
            `${tempDir}/styles/global.css`,
            `.trash-header { display: flex; }`,
        );

        // TSX with Rule D violation
        await Deno.writeTextFile(
            `${tempDir}/app/MyPage.tsx`,
            `export function del() { if (confirm("Sure?")) {} }`,
        );

        // Test file with confirm (should be ignored)
        await Deno.writeTextFile(
            `${tempDir}/app/MyPage.test.tsx`,
            `export function testDel() { if (confirm("Test?")) {} }`,
        );

        const result = await scanOwnership(tempDir, tempDir);
        assertEquals(result.passed, false);
        assertEquals(result.violations.length, 3);
        assertEquals(result.byRule["feature-selector-in-global"].length, 1);
        assertEquals(result.byRule["css-prefix-ownership"].length, 1);
        assertEquals(result.byRule["native-destructive-confirm"].length, 1);
        const report = formatOwnershipReport(result);
        assertEquals(report.includes("[FAIL]"), true);
        assertEquals(report.includes("feature-selector-in-global"), true);
        assertEquals(report.includes("native-destructive-confirm"), true);
    } finally {
        await Deno.remove(tempDir, { recursive: true });
    }
});

Deno.test("Ownership scanner - clean directory passes with 0 violations", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "ownership-clean-test-" });
    try {
        await Deno.mkdir(`${tempDir}/design-system`, { recursive: true });
        await Deno.mkdir(`${tempDir}/components/ui`, { recursive: true });

        await Deno.writeTextFile(
            `${tempDir}/design-system/tokens.css`,
            `:root { --accent: #333; }`,
        );

        await Deno.writeTextFile(
            `${tempDir}/components/ui/button.tsx`,
            `export function Button() { return <button className="btn">Click</button>; }`,
        );

        const result = await scanOwnership(tempDir, tempDir);
        assertEquals(result.passed, true);
        assertEquals(result.violations.length, 0);

        const report = formatOwnershipReport(result);
        assertEquals(report.includes("[PASS]"), true);
    } finally {
        await Deno.remove(tempDir, { recursive: true });
    }
});

Deno.test("Ownership integration - runCheck fails when ownership violations exist", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "ownership-check-fail-" });
    const baselinePath = `${tempDir}/baseline.json`;
    const targetDir = `${tempDir}/web/src`;
    try {
        await Deno.mkdir(`${targetDir}/styles`, { recursive: true });
        await Deno.writeTextFile(
            `${targetDir}/styles/global.css`,
            `.trash-header { display: flex; }`,
        );

        // 1. Initial check fails
        const code = await runCheck([
            "--baseline",
            baselinePath,
            "--target",
            targetDir,
            "--base-dir",
            tempDir,
        ]);
        assertEquals(code, 1);

        // 2. --initialize CANNOT bypass ownership violations
        const initCode = await runCheck([
            "--initialize",
            "--baseline",
            baselinePath,
            "--target",
            targetDir,
            "--base-dir",
            tempDir,
        ]);
        assertEquals(initCode, 1);
    } finally {
        await Deno.remove(tempDir, { recursive: true });
    }
});

Deno.test("Ownership integration - runCheck passes when code has zero ownership and visual violations", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "ownership-check-pass-" });
    const baselinePath = `${tempDir}/baseline.json`;
    const targetDir = `${tempDir}/web/src`;
    try {
        await Deno.mkdir(`${targetDir}/components/ui`, { recursive: true });
        await Deno.writeTextFile(
            `${targetDir}/components/ui/button.tsx`,
            `export function Button() { return <button className="btn">Click</button>; }`,
        );

        const code = await runCheck([
            "--baseline",
            baselinePath,
            "--target",
            targetDir,
            "--base-dir",
            tempDir,
        ]);
        assertEquals(code, 0);
    } finally {
        await Deno.remove(tempDir, { recursive: true });
    }
});

Deno.test("ownership detects computed native confirm without matching strings", () => {
    const computed = checkRuleD_NativeConfirm(
        "web/src/app/Test.tsx",
        `window["confirm"]("delete"); globalThis['confirm']("delete");`,
    );
    assertEquals(computed.map((v) => v.snippet), [
        "window.confirm(...)",
        "globalThis.confirm(...)",
    ]);
    assertEquals(
        checkRuleD_NativeConfirm(
            "web/src/app/Test.tsx",
            `const example = "confirm("; api.confirm();`,
        ),
        [],
    );
});
Deno.test("canonical classes cannot acquire a second feature owner", () => {
    assertEquals(
        checkRuleF_CssPrefixOwnership(
            "web/src/app/settings.css",
            ".settings-card { padding: 0; }",
        ).map((v) => v.snippet),
        [".settings-card"],
    );
    assertEquals(
        checkRuleF_CssPrefixOwnership(
            "web/src/features/workspace/apps-workspace.css",
            ".workspace-root-controls { display: grid; }",
        ).map((v) => v.snippet),
        [".workspace-root-controls"],
    );
});
Deno.test("legacy classes are rejected in JSX expressions, not prose", () => {
    assertEquals(
        checkRuleE_ForbiddenLegacyUiClass(
            "web/src/app/Test.tsx",
            `export const Test = () => <div className={cn("spin", "icon")}>spin</div>;`,
        ).map((v) => v.snippet),
        ["spin"],
    );
    assertEquals(
        checkRuleE_ForbiddenLegacyUiClass(
            "web/src/app/Test.tsx",
            `const text = "spin"; export const Test = () => <p>{text}</p>;`,
        ),
        [],
    );
    assertEquals(
        checkRuleB_PageLayout(
            "web/src/app/Test.tsx",
            `export const Test = () => <PageShell className={cn("page", "content")} />;`,
        ).length,
        1,
    );
});

Deno.test("shared feedback cannot be redefined by a feature stylesheet", () => {
    const violations = checkRuleF_CssPrefixOwnership(
        "web/src/features/workspace/apps-workspace.css",
        ".status-banner { background: red; } .empty-state { border-radius: 2px; } .loading-state { color: orange; } .undo-toast { position: absolute; }",
    );
    assertEquals(violations.map((v) => v.snippet), [
        ".status-banner",
        ".empty-state",
        ".loading-state",
        ".undo-toast",
    ]);
});
