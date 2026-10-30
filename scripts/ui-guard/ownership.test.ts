import { assertEquals } from "@std/assert";
import { runCheck } from "../check-ui.ts";
import {
    checkRuleA_GlobalFeaturePrefix,
    checkRuleB_PageLayout,
    checkRuleC_UndefinedCssTokens,
    checkRuleD_NativeConfirm,
    checkRuleE_ForbiddenLegacyUiClass,
    checkRuleF_CssPrefixOwnership,
    checkRuleG_WorkspaceCoreIsolation,
    checkRuleJ_HomeDocumentTokenPollution,
    checkRuleL_ForbiddenLegacyPaths,
    checkRuleM_PrimitiveFeatureCascadeOrder,
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
    background-position: var(--wallpaper-position);
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

Deno.test("Issue 80 negative fixtures: banned workspace selectors are flagged by their owning rule", () => {
    const cases = [
        {
            label: "Rule F: apps stylesheet defining workspace selectors",
            rule: "css-prefix-ownership",
            violations: checkRuleF_CssPrefixOwnership(
                "web/src/features/workspace/apps-workspace.css",
                ".workspace-foo { display: block; } .workspace-panel { padding: 8px; }",
            ),
            snippets: [".workspace-foo", ".workspace-panel"],
        },
        {
            label: "Rule F: notes stylesheet defining apps selectors",
            rule: "css-prefix-ownership",
            violations: checkRuleF_CssPrefixOwnership(
                "web/src/features/workspace/notes-workspace.css",
                ".apps-workspace-foo { display: block; } .apps-workspace-grid { margin: 0; }",
            ),
            snippets: [".apps-workspace-foo", ".apps-workspace-grid"],
        },
        {
            label: "Rule A: global.css defining workspace selectors",
            rule: "feature-selector-in-global",
            violations: checkRuleA_GlobalFeaturePrefix(
                "web/src/styles/global.css",
                ".workspace-foo { color: red; } .apps-workspace-bar { padding: 0; }",
            ),
            snippets: [".workspace-foo", ".apps-workspace-bar"],
        },
        {
            label: "Rule E: apps banner clones in TSX",
            rule: "forbidden-legacy-ui-class",
            violations: checkRuleE_ForbiddenLegacyUiClass(
                "web/src/features/workspace/AppsWorkspace.tsx",
                `
export function LegacyBannerSample() {
    return (
        <div className="apps-workspace-banner apps-workspace-banner--error">
            <div className="apps-workspace-banner-actions">
                <button>Retry</button>
            </div>
        </div>
    );
}
`,
            ),
            snippets: [
                "apps-workspace-banner",
                "apps-workspace-banner--error",
                "apps-workspace-banner-actions",
            ],
        },
        {
            label: "Rule E: empty-state clones in TSX",
            rule: "forbidden-legacy-ui-class",
            violations: checkRuleE_ForbiddenLegacyUiClass(
                "web/src/features/workspace/DocumentsWorkspace.tsx",
                `
export function NotesLegacyEmpty() {
    return (
        <div>
            <p className="workspace-empty" role="status">暂无便签</p>
            <div className="apps-workspace-empty">
                <div className="apps-workspace-empty-title">暂无应用</div>
            </div>
        </div>
    );
}
`,
            ),
            snippets: [
                "workspace-empty",
                "apps-workspace-empty",
                "apps-workspace-empty-title",
            ],
        },
        {
            label: "Rule E: section and count clones in TSX",
            rule: "forbidden-legacy-ui-class",
            violations: checkRuleE_ForbiddenLegacyUiClass(
                "web/src/features/workspace/AppsRootView.tsx",
                `
export function LegacySectionSample() {
    return (
        <div className="apps-workspace-section">
            <div className="apps-workspace-section-header">
                <h3 className="apps-workspace-section-title">
                    Title
                    <span className="apps-workspace-count-badge">12</span>
                    <span className="apps-workspace-section-count-badge">34</span>
                </h3>
            </div>
        </div>
    );
}
`,
            ),
            snippets: [
                "apps-workspace-section",
                "apps-workspace-section-header",
                "apps-workspace-section-title",
                "apps-workspace-count-badge",
                "apps-workspace-section-count-badge",
            ],
        },
    ];

    for (const c of cases) {
        assertEquals(c.violations.map((v) => v.snippet), c.snippets, c.label);
        for (const v of c.violations) {
            assertEquals(v.rule, c.rule, c.label);
        }
    }
});

Deno.test("Issue 80 P6 Integration: scanOwnership detects workspace negative fixtures and passes clean workspace", async () => {
    const dirtyDir = await Deno.makeTempDir({ prefix: "ownership-ws-dirty-" });
    try {
        await Deno.mkdir(`${dirtyDir}/styles`, { recursive: true });
        await Deno.mkdir(`${dirtyDir}/features/workspace`, { recursive: true });
        await Deno.mkdir(`${dirtyDir}/design-system`, { recursive: true });

        await Deno.writeTextFile(
            `${dirtyDir}/design-system/tokens.css`,
            `:root { --accent: #333; }`,
        );

        // 1. global.css defining .workspace-foo (Rule A)
        await Deno.writeTextFile(
            `${dirtyDir}/styles/global.css`,
            `.workspace-foo { display: block; }`,
        );

        // 2. apps-workspace.css defining .workspace-foo (Rule F) & .apps-workspace-banner--error (Rule E)
        await Deno.writeTextFile(
            `${dirtyDir}/features/workspace/apps-workspace.css`,
            `.workspace-foo { display: block; }\n.apps-workspace-banner--error { color: red; }`,
        );

        // 3. notes-workspace.css defining .apps-workspace-foo (Rule F)
        await Deno.writeTextFile(
            `${dirtyDir}/features/workspace/notes-workspace.css`,
            `.apps-workspace-foo { display: block; }`,
        );

        // 4. DocumentsWorkspace.tsx using workspace-empty (Rule E)
        await Deno.writeTextFile(
            `${dirtyDir}/features/workspace/DocumentsWorkspace.tsx`,
            `export function DocumentsWorkspace() { return <p className="workspace-empty">Empty</p>; }`,
        );

        const result = await scanOwnership(dirtyDir, dirtyDir);
        assertEquals(result.passed, false);
        assertEquals(result.byRule["feature-selector-in-global"].length, 1);
        assertEquals(result.byRule["css-prefix-ownership"].length >= 2, true);
        assertEquals(
            result.byRule["forbidden-legacy-ui-class"].length >= 2,
            true,
        );
    } finally {
        await Deno.remove(dirtyDir, { recursive: true });
    }

    const cleanDir = await Deno.makeTempDir({ prefix: "ownership-ws-clean-" });
    try {
        await Deno.mkdir(`${cleanDir}/web/src/features/workspace`, {
            recursive: true,
        });
        await Deno.mkdir(`${cleanDir}/web/src/design-system`, {
            recursive: true,
        });
        await Deno.mkdir(`${cleanDir}/web/src/components/searcher`, {
            recursive: true,
        });

        await Deno.writeTextFile(
            `${cleanDir}/web/src/design-system/tokens.css`,
            `:root { --space-2: 8px; }`,
        );

        await Deno.writeTextFile(
            `${cleanDir}/web/src/features/workspace/workspace.css`,
            `.workspace-panel { display: flex; }\n.workspace-section { display: flex; }`,
        );

        await Deno.writeTextFile(
            `${cleanDir}/web/src/features/workspace/notes-workspace.css`,
            `.notes-workspace-list { display: grid; }`,
        );

        await Deno.writeTextFile(
            `${cleanDir}/web/src/components/searcher/launcher.css`,
            `.launcher-grid { display: grid; }`,
        );

        const cleanResult = await scanOwnership(cleanDir, cleanDir);
        assertEquals(cleanResult.passed, true);
        assertEquals(cleanResult.violations.length, 0);
    } finally {
        await Deno.remove(cleanDir, { recursive: true });
    }
});

Deno.test("Rule G: workspace-core-isolation - denies home viewport geometry module imports in Core", () => {
    const code = `
import { homeViewport } from "../home-layouts/home-viewport.ts";
export function testCore() { return homeViewport; }
`;
    const violations = checkRuleG_WorkspaceCoreIsolation(
        "web/src/features/workspace/workspace-state.ts",
        code,
    );
    assertEquals(violations.length >= 1, true);
    assertEquals(violations[0].rule, "workspace-core-isolation");
    assertEquals(
        violations[0].message.includes("geometry module"),
        true,
    );
});

Deno.test("Rule G: workspace-core-isolation - denies spatial geometry symbols in Core", () => {
    const code = `
import type { SafeRect, HomeViewport } from "./types.ts";
export interface CoreProps { rect: SafeRect; viewport: HomeViewport; }
`;
    const violations = checkRuleG_WorkspaceCoreIsolation(
        "web/src/features/workspace/WorkspaceShell.tsx",
        code,
    );
    assertEquals(violations.length, 2);
    assertEquals(violations[0].rule, "workspace-core-isolation");
    assertEquals(violations[0].snippet, "SafeRect");
    assertEquals(violations[1].snippet, "HomeViewport");
});

Deno.test("Rule G: workspace-core-isolation - denies 'closed' route view definition in Core", () => {
    const code = `
export type WorkspaceState =
    | { view: "closed" }
    | { view: "apps/root" };
export const initialRoute = { view: "closed" };
`;
    const violations = checkRuleG_WorkspaceCoreIsolation(
        "web/src/features/workspace/workspace-state.ts",
        code,
    );
    assertEquals(violations.length >= 2, true);
    assertEquals(violations[0].rule, "workspace-core-isolation");
    assertEquals(violations[0].message.includes("'closed' route view"), true);
});

Deno.test("Rule G: workspace-core-isolation - allows independent domain routes without geometry or closed view", () => {
    const code = `
export type AppsRoute =
    | { view: "apps/root" }
    | { view: "apps/create"; groupId?: string }
    | { view: "apps/edit"; id: string };
export type DocumentsRoute =
    | { view: "documents/root" }
    | { view: "documents/edit"; id: string };
export interface DomainWorkspaceState<TRoute> {
    route: TRoute;
    stack: TRoute[];
    query: string;
}
`;
    const violations = checkRuleG_WorkspaceCoreIsolation(
        "web/src/features/workspace/workspace-state.ts",
        code,
    );
    assertEquals(violations.length, 0);
});

Deno.test("Rule J: home-document-token - denies Home CSS overriding protected global tokens on :root and combined root selectors", () => {
    const invalidCss = `
:root {
    --surface: #ffffff;
    --radius-lg: 12px;
}
:root[data-theme='dark'] {
    --background: #000000;
}
html[data-theme] {
    --border: #333333;
}
body.dark {
    --accent: #ff0000;
}
`;
    const violations = checkRuleJ_HomeDocumentTokenPollution(
        "web/src/features/home-layouts/home-layouts.css",
        invalidCss,
    );
    assertEquals(violations.length, 5);
    assertEquals(violations[0].rule, "home-document-token");
    assertEquals(violations[0].snippet.includes("--surface"), true);
    assertEquals(violations[1].snippet.includes("--radius-lg"), true);
    assertEquals(violations[2].snippet.includes("--background"), true);
    assertEquals(violations[3].snippet.includes("--border"), true);
    assertEquals(violations[4].snippet.includes("--accent"), true);
});

Deno.test("Rule J: home-document-token - denies Home TSX mutating documentElement style directly", () => {
    const invalidTsx = `
export function HomeDirty() {
    document.documentElement.style.background = "#000";
    return <div>Dirty</div>;
}
`;
    const violations = checkRuleJ_HomeDocumentTokenPollution(
        "web/src/features/home-layouts/ZenLayout.tsx",
        invalidTsx,
    );
    assertEquals(violations.length, 1);
    assertEquals(violations[0].rule, "home-document-token");
});

Deno.test("Rule J: home-document-token - allows scoped layout classes and feature semantic tokens", () => {
    const validCss = `
.zen-edge-btn {
    --radius: 22px;
    --surface: color-mix(in srgb, var(--background) 65%, transparent);
}
.zen-edge-btn[data-theme='dark'] {
    --shadow: 0 24px 64px -20px rgba(0, 0, 0, 0.7);
}
[data-theme="dark"] .zen-edge-btn {
    --shadow: 0 24px 64px -20px rgba(0, 0, 0, 0.7);
}
:root {
    --space-zen-padding: 10px;
    --font-zen-count: 11px;
}
`;
    const violations = checkRuleJ_HomeDocumentTokenPollution(
        "web/src/features/home-layouts/home-layouts.css",
        validCss,
    );
    assertEquals(violations.length, 0);
});

Deno.test("Rule L: forbidden-legacy-path - denies abolished panel file", () => {
    assertEquals(
        checkRuleL_ForbiddenLegacyPaths(
            "web/src/features/workspace/WidgetsPanel.tsx",
        ).length,
        1,
    );
    assertEquals(
        checkRuleL_ForbiddenLegacyPaths(
            "web/src/features/workspace/WorkspaceSurface.tsx",
        ).length,
        0,
    );
});

Deno.test("Rule E extension: denies legacy fixed workspace panel classes", () => {
    const invalidCss = `
.workspace-panel-fixed { position: fixed; }
`;
    const violations = checkRuleE_ForbiddenLegacyUiClass(
        "web/src/features/workspace/workspace.css",
        invalidCss,
    );
    assertEquals(violations.length, 1);
    assertEquals(violations[0].snippet, ".workspace-panel-fixed");
});

Deno.test("Issue 92 Full Integration: scanOwnership detects multiple Issue 92 violations and passes clean architecture", async () => {
    const dirtyDir = await Deno.makeTempDir({ prefix: "ownership-92-dirty-" });
    try {
        await Deno.mkdir(`${dirtyDir}/web/src/features/workspace`, {
            recursive: true,
        });
        await Deno.mkdir(`${dirtyDir}/web/src/features/home-layouts`, {
            recursive: true,
        });
        await Deno.mkdir(`${dirtyDir}/web/src/design-system`, {
            recursive: true,
        });

        await Deno.writeTextFile(
            `${dirtyDir}/web/src/design-system/tokens.css`,
            `:root { --surface: #fff; }`,
        );

        // 1. Workspace Core imports home viewport geometry (Rule G) & closed route (Rule G)
        await Deno.writeTextFile(
            `${dirtyDir}/web/src/features/workspace/workspace-state.ts`,
            `import { homeViewport } from "../home-layouts/home-viewport.ts";\nexport type Route = { view: "closed" };`,
        );

        // 2. Home CSS overrides document visual token (Rule J)
        await Deno.writeTextFile(
            `${dirtyDir}/web/src/features/home-layouts/home-layouts.css`,
            `:root { --surface: #000; }`,
        );

        // 3. Forbidden legacy path (Rule L)
        await Deno.writeTextFile(
            `${dirtyDir}/web/src/features/workspace/WidgetsPanel.tsx`,
            `export function WidgetsPanel() { return null; }`,
        );

        const result = await scanOwnership(dirtyDir, dirtyDir);
        assertEquals(result.passed, false);
        assertEquals(
            result.byRule["workspace-core-isolation"].length >= 2,
            true,
        );
        assertEquals(result.byRule["home-document-token"].length >= 1, true);
        assertEquals(result.byRule["forbidden-legacy-path"].length >= 1, true);
    } finally {
        await Deno.remove(dirtyDir, { recursive: true });
    }

    const cleanDir = await Deno.makeTempDir({ prefix: "ownership-92-clean-" });
    try {
        await Deno.mkdir(`${cleanDir}/web/src/features/workspace`, {
            recursive: true,
        });
        await Deno.mkdir(`${cleanDir}/web/src/features/home-layouts`, {
            recursive: true,
        });
        await Deno.mkdir(`${cleanDir}/web/src/design-system`, {
            recursive: true,
        });

        await Deno.writeTextFile(
            `${cleanDir}/web/src/design-system/tokens.css`,
            `:root { --surface: #fff; }`,
        );
        await Deno.writeTextFile(
            `${cleanDir}/web/src/features/workspace/workspace-state.ts`,
            `export type AppsRoute = { view: "apps/root" }; export type DocumentsRoute = { view: "documents/root" };`,
        );
        await Deno.writeTextFile(
            `${cleanDir}/web/src/features/workspace/workspace.css`,
            `.workspace-surface { display: flex; } .workspace-panel { position: fixed; }`,
        );
        await Deno.writeTextFile(
            `${cleanDir}/web/src/features/home-layouts/home-layouts.css`,
            `.zen-edge-btn { --radius: 22px; } :root { --space-zen-gap: 8px; }`,
        );

        const cleanResult = await scanOwnership(cleanDir, cleanDir);
        assertEquals(cleanResult.passed, true);
        assertEquals(cleanResult.violations.length, 0);
    } finally {
        await Deno.remove(cleanDir, { recursive: true });
    }
});

Deno.test("Rule M: primitive-feature-cascade-order - denies bare class overriding structural property on RadioGroup", () => {
    const tsx = [{
        file: "web/src/app/SettingsPage.tsx",
        content: `
export function Settings() {
    return <RadioGroup className="settings-example" />;
}
`,
    }];
    const css = [{
        file: "web/src/app/settings.css",
        content: `
.settings-example {
    display: grid;
}
`,
    }];

    const violations = checkRuleM_PrimitiveFeatureCascadeOrder(tsx, css);
    assertEquals(violations.length, 1);
    assertEquals(violations[0].rule, "primitive-feature-cascade-order");
    assertEquals(violations[0].snippet, ".settings-example");
});

Deno.test("Rule M: primitive-feature-cascade-order - allows slot-aware compound selector on RadioGroup", () => {
    const tsx = [{
        file: "web/src/app/SettingsPage.tsx",
        content: `
export function Settings() {
    return <RadioGroup className="settings-example" />;
}
`,
    }];
    const css = [{
        file: "web/src/app/settings.css",
        content: `
[data-slot="radio-group"].settings-example {
    display: grid;
}
`,
    }];

    const violations = checkRuleM_PrimitiveFeatureCascadeOrder(tsx, css);
    assertEquals(violations.length, 0);
});

Deno.test("Rule M: primitive-feature-cascade-order - denies bare class overriding button styles and allows slot-aware", () => {
    const tsx = [{
        file: "web/src/features/ask/SearcherComposer.tsx",
        content: `
export function Composer() {
    return (
        <div>
            <Button className="ask-btn-invalid" />
            <Button className="ask-btn-valid" />
        </div>
    );
}
`,
    }];
    const css = [{
        file: "web/src/features/ask/ask-workspace.css",
        content: `
.ask-btn-invalid {
    background: var(--surface);
    padding: 8px;
}
[data-slot="button"].ask-btn-valid {
    background: var(--surface);
    padding: 8px;
}
`,
    }];

    const violations = checkRuleM_PrimitiveFeatureCascadeOrder(tsx, css);
    assertEquals(violations.length, 1);
    assertEquals(violations[0].rule, "primitive-feature-cascade-order");
    assertEquals(violations[0].snippet, ".ask-btn-invalid");
});

Deno.test("Rule M: primitive-feature-cascade-order - ignores non-hard-gate properties like text/line-height/cursor", () => {
    const tsx = [{
        file: "web/src/features/ask/SearcherComposer.tsx",
        content: `
export function Composer() {
    return <Button className="ask-btn-typography" />;
}
`,
    }];
    const css = [{
        file: "web/src/features/ask/ask-workspace.css",
        content: `
.ask-btn-typography {
    cursor: pointer;
    line-height: 1.5;
    text-align: left;
}
`,
    }];

    const violations = checkRuleM_PrimitiveFeatureCascadeOrder(tsx, css);
    assertEquals(violations.length, 0);
});

Deno.test("Ownership integration: scanOwnership reports undefined CSS tokens (Rule C wiring)", async () => {
    const dir = await Deno.makeTempDir({ prefix: "ownership-rule-c-" });
    try {
        await Deno.mkdir(`${dir}/design-system`, { recursive: true });
        await Deno.mkdir(`${dir}/web/src/app`, { recursive: true });
        await Deno.writeTextFile(
            `${dir}/design-system/tokens.css`,
            `:root { --accent: #3b82f6; }`,
        );
        await Deno.writeTextFile(
            `${dir}/web/src/app/chat.css`,
            `.chat { color: var(--accent); padding: var(--missing-padding); }`,
        );

        const result = await scanOwnership(dir, dir);
        assertEquals(result.passed, false);
        assertEquals(
            result.byRule["undefined-css-token"].map((v) => v.snippet),
            ["var(--missing-padding)"],
        );
    } finally {
        await Deno.remove(dir, { recursive: true });
    }
});

Deno.test("Ownership integration: scanOwnership reports bare feature class overriding primitive structure (Rule M wiring)", async () => {
    const dir = await Deno.makeTempDir({ prefix: "ownership-rule-m-" });
    try {
        await Deno.mkdir(`${dir}/web/src/app`, { recursive: true });
        await Deno.writeTextFile(
            `${dir}/web/src/app/SettingsPage.tsx`,
            `export function Settings() {\n    return <RadioGroup className="settings-example" />;\n}\n`,
        );
        await Deno.writeTextFile(
            `${dir}/web/src/app/settings.css`,
            `.settings-example {\n    display: grid;\n}\n`,
        );

        const result = await scanOwnership(dir, dir);
        assertEquals(
            result.byRule["primitive-feature-cascade-order"].map((v) => v.snippet),
            [".settings-example"],
        );
    } finally {
        await Deno.remove(dir, { recursive: true });
    }
});
