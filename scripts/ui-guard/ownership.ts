/**
 * Searcher UI Guard - Ownership & Architectural Boundary Rules
 *
 * Implements Issue #79 P3 Ownership Rules A-F:
 * - Rule A: feature-selector-in-global
 * - Rule B: legacy-page-layout
 * - Rule C: undefined-css-token
 * - Rule D: native-destructive-confirm
 * - Rule E: forbidden-legacy-ui-class
 * - Rule F: css-prefix-ownership
 */

import ts from "typescript";

import { walk } from "@std/fs/walk";
import { relative } from "@std/path/relative";
import { join } from "@std/path/join";

export type OwnershipRuleId =
    | "feature-selector-in-global"
    | "legacy-page-layout"
    | "undefined-css-token"
    | "native-destructive-confirm"
    | "forbidden-legacy-ui-class"
    | "css-prefix-ownership"
    | "workspace-core-isolation"
    | "home-document-token"
    | "forbidden-legacy-path"
    | "primitive-feature-cascade-order";

export interface OwnershipViolation {
    rule: OwnershipRuleId;
    file: string;
    line: number;
    column: number;
    message: string;
    snippet: string;
}

export interface OwnershipCheckResult {
    passed: boolean;
    violations: OwnershipViolation[];
    byRule: Record<OwnershipRuleId, OwnershipViolation[]>;
    totalFilesScanned: number;
}

/**
 * Feature prefixes that represent isolated feature domains and must never be defined
 * in global stylesheet (web/src/styles/global.css).
 */
export const GLOBAL_FEATURE_PREFIXES: readonly string[] = [
    "trash-",
    "ask-",
    "account-",
    "admin-",
    "settings-",
    "workspace-",
    "apps-workspace-",
    "notes-workspace-",
    "webapp-",
    "launcher-",
    "widgets-",
    "zen-",
] as const;

/**
 * Whitelist of selectors in global.css with feature prefix.
 * Every entry MUST provide an explicit justification explaining why it is truly global semantic.
 * Baseline allowance is strictly forbidden.
 */
export const GLOBAL_FEATURE_SELECTOR_WHITELIST: Record<string, string> = {
    // Empty: currently no feature prefixes qualify as global semantics.
};

/**
 * Strict, narrow runtime registry for CSS variables dynamically set by JS at runtime.
 * Every entry MUST provide a clear rationale explaining why it is injected at runtime.
 */
export const RUNTIME_CSS_VARIABLE_REGISTRY: Record<string, string> = {
    "--wallpaper-image":
        "WallpaperSurface runtime owner: Validated source URL or CSS gradient",
    "--wallpaper-mask":
        "WallpaperSurface runtime owner: Shared resolver readability stage",
    "--wallpaper-position":
        "WallpaperSurface runtime owner: Normalized focal point",
    "--page-width":
        "DocumentPagination layout owner: physical paper metrics and measured vertical page flow; never visual styling",
    "--page-height":
        "DocumentPagination layout owner: physical paper metrics and measured vertical page flow; never visual styling",
    "--page-content-width":
        "DocumentPagination layout owner: physical paper metrics and measured vertical page flow; never visual styling",
    "--page-content-height":
        "DocumentPagination layout owner: physical paper metrics and measured vertical page flow; never visual styling",
    "--page-margin-top":
        "DocumentPagination layout owner: physical paper margins; never visual styling",
    "--page-margin-right":
        "DocumentPagination layout owner: physical paper margins; never visual styling",
    "--page-margin-bottom":
        "DocumentPagination layout owner: physical paper margins; never visual styling",
    "--page-margin-left":
        "DocumentPagination layout owner: physical paper margins; never visual styling",
    "--page-gap":
        "DocumentPagination layout owner: measured semantic page gap; never visual styling",
    "--page-pitch":
        "DocumentPagination layout owner: physical paper height plus measured semantic gap; never visual styling",
    "--transform-origin":
        "Base UI popup runtime owner: anchor-relative transform origin for menu open/close transitions",
};

/**
 * Forbidden legacy UI classes that must never be reintroduced.
 * These represent technical debt that has been migrated and cannot be bypassed via baseline.
 */
export const FORBIDDEN_LEGACY_UI_CLASSES: readonly string[] = [
    "webapp-undo-toast",
    "trash-empty-card",
    "trash-status-msg",
    "home-error-toast",
    "spin",
    // Legacy Ask root classes
    "ask-layout",
    "ask-history",
    "ask-main",
    "ask-model",
    "ask-messages",
    "ask-message",
    "ask-composer",
    "ask-guest",
    "ask-page",
    "ask-empty",
    // Legacy Workspace / Apps section & count clones (Issue #80 P1/P2)
    "apps-workspace-section",
    "apps-workspace-section-header",
    "apps-workspace-section-title",
    "apps-workspace-count-badge",
    "apps-workspace-section-count-badge",
    // Legacy Workspace / Apps banner clones & variants (Issue #80 P1/P6)
    "apps-workspace-banner",
    "apps-workspace-banner--offline",
    "apps-workspace-banner-offline",
    "apps-workspace-banner--error",
    "apps-workspace-banner-error",
    "apps-workspace-banner--loading",
    "apps-workspace-banner-loading",
    "apps-workspace-banner-actions",
    "apps-workspace-banner--actions",
    // Legacy Workspace empty state clones (Issue #80 P1/P2/P6)
    "apps-workspace-empty",
    "apps-workspace-empty-title",
    "workspace-empty",
    // Legacy fixed WorkspacePanel clones & dead presenter classes (Issue #92)
    "workspace-panel-fixed",
    "workspace-panel--fixed",
] as const;

/**
 * Exact canonical semantic class names that belong to components/searcher/semantic.css.
 * Takes precedence over feature prefix mappings to allow established shared primitives
 * (e.g. SettingsCard, SettingsRow, WorkspaceToolbar) without opening prefix wildcards.
 */
export const CANONICAL_SEMANTIC_CLASS_OWNERS: Record<
    string,
    readonly string[]
> = {
    "status-banner": ["web/src/components/searcher/semantic.css"],
    "empty-state": ["web/src/components/searcher/semantic.css"],
    "loading-state": ["web/src/components/searcher/semantic.css"],
    "undo-toast": ["web/src/components/searcher/semantic.css"],
    "page-shell": ["web/src/components/searcher/semantic.css"],
    "page-header": ["web/src/components/searcher/semantic.css"],
    "section-header": ["web/src/components/searcher/semantic.css"],
    "management-table": ["web/src/components/searcher/semantic.css"],
    "settings-card": [
        "web/src/components/searcher/semantic.css",
    ],
    "settings-row": [
        "web/src/components/searcher/semantic.css",
    ],
    "settings-row-label": [
        "web/src/components/searcher/semantic.css",
    ],
    "settings-row-title": [
        "web/src/components/searcher/semantic.css",
    ],
    "settings-row-desc": [
        "web/src/components/searcher/semantic.css",
    ],
    "settings-row-control": [
        "web/src/components/searcher/semantic.css",
    ],
    "settings-row--vertical": [
        "web/src/components/searcher/semantic.css",
    ],
    "settings-row--inline-mobile": [
        "web/src/components/searcher/semantic.css",
    ],
    "workspace-toolbar": [
        "web/src/components/searcher/semantic.css",
    ],
    "settings-group": ["web/src/components/searcher/semantic.css"],
    "settings-group-header": ["web/src/components/searcher/semantic.css"],
    "settings-group-title": ["web/src/components/searcher/semantic.css"],
    "settings-group-footer": ["web/src/components/searcher/semantic.css"],
    // Presenter single-owner classes (Issue #92)
    "workspace-surface": ["web/src/features/workspace/workspace.css"],
    "workspace-panel": ["web/src/features/workspace/workspace.css"],
    "workspace-sheet": ["web/src/features/workspace/workspace.css"],
    "workspace-shell": ["web/src/features/workspace/workspace.css"],
};
/**
 * Canonical mapping between CSS feature class prefixes and their authorized owner files.
 * Same prefix must never be declared outside its designated owner stylesheets.
 */
export const CSS_PREFIX_OWNER_MAP: Record<string, readonly string[]> = {
    "settings-": ["web/src/app/settings.css"],
    "admin-": ["web/src/app/admin.css"],
    "account-": ["web/src/app/account.css"],
    "ask-": [
        "web/src/features/ask/ask-workspace.css",
        "web/src/features/ask/ask-answer.css",
    ],
    "inline-ai-": ["web/src/features/inline-ai/inline-ai.css"],
    "workspace-": ["web/src/features/workspace/workspace.css"],
    "apps-workspace-": [],
    "notes-workspace-": ["web/src/features/workspace/notes-workspace.css"],
    "launcher-": ["web/src/components/searcher/launcher.css"],
    "webapp-": ["web/src/components/searcher/launcher.css"],
    "trash-": ["web/src/app/trash.css"],
    "widgets-": ["web/src/features/home-layouts/home-layouts.css"],
    "zen-": ["web/src/features/home-layouts/home-layouts.css"],
    "auth-": ["web/src/app/auth.css"],
    "design-lab-": ["web/src/design-lab/design-lab.css"],
};

/**
 * Forbidden legacy file paths that have been removed and must never be reintroduced.
 */
export const FORBIDDEN_LEGACY_PATHS: readonly string[] = [
    "web/src/features/workspace/WidgetsPanel.tsx",
] as const;

/**
 * Helper to strip CSS comments while preserving line breaks for accurate line numbers.
 */
function stripCssComments(cssText: string): string {
    return cssText.replace(/\/\*[\s\S]*?\*\//g, (match) => {
        return match.replace(/[^\n]/g, " ");
    });
}

/**
 * Rule A: feature-selector-in-global
 *
 * Scans web/src/styles/global.css: any feature selector prefix is forbidden.
 * Whitelist must be explicit in code with documented justification.
 */
export function checkRuleA_GlobalFeaturePrefix(
    file: string,
    content: string,
): OwnershipViolation[] {
    const normPath = file.replaceAll("\\", "/");
    if (!normPath.endsWith("styles/global.css") && normPath !== "global.css") {
        return [];
    }

    const violations: OwnershipViolation[] = [];
    const cleanContent = stripCssComments(content);
    const lines = cleanContent.split("\n");

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        const classMatches = line.matchAll(/\.([a-zA-Z0-9_-]+)/g);
        for (const match of classMatches) {
            const className = match[1];
            const selector = `.${className}`;

            for (const prefix of GLOBAL_FEATURE_PREFIXES) {
                if (className.startsWith(prefix)) {
                    if (GLOBAL_FEATURE_SELECTOR_WHITELIST[selector]) {
                        continue;
                    }

                    violations.push({
                        rule: "feature-selector-in-global",
                        file: normPath,
                        line: lineIdx + 1,
                        column: (match.index ?? 0) + 1,
                        message:
                            `Feature selector '${selector}' with prefix '${prefix}' is forbidden in global.css. It must belong to its designated feature owner stylesheet.`,
                        snippet: selector,
                    });
                }
            }
        }
    }

    return violations;
}

/**
 * Rule B: legacy-page-layout
 *
 * Enforces that PageShell is the exclusive owner of page-level geometry.
 * - In TSX: PageShell must never accept or pass legacy 'page' class in className.
 * - In CSS: Legacy '.page' layout geometry (width, max-width, margins) is forbidden.
 *           Feature stylesheets must not simulate PageShell via centering margin + layout max-width.
 */
export function checkRuleB_PageLayout(
    file: string,
    content: string,
): OwnershipViolation[] {
    const normPath = file.replaceAll("\\", "/");
    const violations: OwnershipViolation[] = [];

    if (normPath.endsWith(".tsx")) {
        const source = ts.createSourceFile(
            file,
            content,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX,
        );
        visitNodes(source, (node) => {
            if (
                !ts.isJsxAttribute(node) ||
                node.name.getText(source) !== "className" || !node.initializer
            ) return;
            const element = node.parent.parent;
            if (
                (!ts.isJsxOpeningElement(element) &&
                    !ts.isJsxSelfClosingElement(element)) ||
                element.tagName.getText(source) !== "PageShell"
            ) return;
            visitNodes(node.initializer, (literal) => {
                if (
                    ts.isStringLiteralLike(literal) &&
                    literal.text.split(/\s+/).includes("page")
                ) {
                    const { line, character } = source
                        .getLineAndCharacterOfPosition(
                            literal.getStart(source),
                        );
                    violations.push({
                        rule: "legacy-page-layout",
                        file: normPath,
                        line: line + 1,
                        column: character + 1,
                        message:
                            "PageShell must not use legacy 'page' class. Geometry belongs to its archetype.",
                        snippet: literal.getText(source),
                    });
                }
            });
        });
        return violations;
    }

    if (normPath.endsWith(".css")) {
        if (normPath.endsWith("components/searcher/semantic.css")) {
            return [];
        }

        const cleanContent = stripCssComments(content);
        const ruleBlockRegex = /([^{}]+)\{([^{}]+)\}/g;
        let ruleMatch: RegExpExecArray | null;

        while ((ruleMatch = ruleBlockRegex.exec(cleanContent)) !== null) {
            const selectorGroup = ruleMatch[1].trim();
            const declarations = ruleMatch[2];
            const blockIndex = ruleMatch.index;
            const preLines = cleanContent.slice(0, blockIndex).split("\n");
            const line = preLines.length;
            const column = preLines[preLines.length - 1].length + 1;

            // 1. Check legacy .page selector defining geometry
            const selectors = selectorGroup.split(",").map((s) => s.trim());
            const hasLegacyPageSelector = selectors.some((s) =>
                /(?<![\w-])\.page(?![\w-])/.test(s) &&
                !/\.page-shell|\.page-header|\.page-title|\.page-description|\.page-breadcrumb/
                    .test(s)
            );

            if (hasLegacyPageSelector) {
                const hasGeometryProps =
                    /\b(?:width|max-width|min-width|margin|margin-top|margin-bottom|margin-inline|margin-block)\s*:/i
                        .test(
                            declarations,
                        );
                if (hasGeometryProps) {
                    violations.push({
                        rule: "legacy-page-layout",
                        file: normPath,
                        line,
                        column,
                        message:
                            `Legacy '.page' geometry definition is forbidden in CSS. Page geometry belongs strictly to PageShell archetypes.`,
                        snippet: selectorGroup,
                    });
                    continue;
                }
            }

            // 2. Check feature page root simulating PageShell geometry via centering margin + layout max-width
            // Strictly targets page root container selectors (ending in -page, -shell, or matching .page)
            const isPageRootSelector = selectors.some((s) =>
                /(?:^|[\s.])(?:[a-z0-9_-]+(?:-page|-shell)|\bpage\b)(?:$|[\s[:])/i
                    .test(s)
            );
            const hasCenteringMargin = /\bmargin(?:-inline)?\s*:[^;]*\bauto\b/i
                .test(declarations);
            const hasLayoutMaxVar =
                /\bmax-width\s*:[^;]*var\(\s*--layout-[a-z0-9_-]*-max/i.test(
                    declarations,
                );
            if (isPageRootSelector && hasCenteringMargin && hasLayoutMaxVar) {
                violations.push({
                    rule: "legacy-page-layout",
                    file: normPath,
                    line,
                    column,
                    message:
                        `Feature page root selector '${selectorGroup}' simulates PageShell page geometry via centering margin and layout max-width. Page geometry must be handled by PageShell archetype.`,
                    snippet: selectorGroup,
                });
            }
        }
    }

    return violations;
}

/**
 * Rule C: undefined-css-token
 *
 * Scans all CSS files for var(--xxx) usages:
 * Every referenced CSS token must resolve to:
 * 1. Global token set defined in design-system/tokens.css
 * 2. Local scope / file definition
 * 3. Narrow, documented runtime-token registry (RUNTIME_CSS_VARIABLE_REGISTRY)
 */
export function checkRuleC_UndefinedCssTokens(
    cssFiles: { file: string; content: string }[],
    tokensCssContent: string,
): OwnershipViolation[] {
    const violations: OwnershipViolation[] = [];

    // 1. Collect global tokens from tokens.css
    const globalTokens = new Set<string>();
    const cleanTokensCss = stripCssComments(tokensCssContent);
    const globalTokenMatches = cleanTokensCss.matchAll(
        /--([a-zA-Z0-9_-]+)\s*:/g,
    );
    for (const match of globalTokenMatches) {
        globalTokens.add(`--${match[1]}`);
    }

    // 2. For each CSS file, collect local definitions and verify all var(--xxx) references
    for (const { file, content } of cssFiles) {
        const normPath = file.replaceAll("\\", "/");
        const cleanContent = stripCssComments(content);

        // Local definitions in this file
        const localTokens = new Set<string>();
        const localMatches = cleanContent.matchAll(/--([a-zA-Z0-9_-]+)\s*:/g);
        for (const match of localMatches) {
            localTokens.add(`--${match[1]}`);
        }

        // Var references
        const varRegex = /var\(\s*--([a-zA-Z0-9_-]+)/g;
        let varMatch: RegExpExecArray | null;
        while ((varMatch = varRegex.exec(cleanContent)) !== null) {
            const varName = `--${varMatch[1]}`;

            if (
                !globalTokens.has(varName) &&
                !localTokens.has(varName) &&
                !RUNTIME_CSS_VARIABLE_REGISTRY[varName]
            ) {
                const preLines = cleanContent.slice(0, varMatch.index).split(
                    "\n",
                );
                const line = preLines.length;
                const column = preLines[preLines.length - 1].length + 1;

                violations.push({
                    rule: "undefined-css-token",
                    file: normPath,
                    line,
                    column,
                    message:
                        `CSS variable '${varName}' is referenced but not defined in tokens.css, local scope, or runtime-token registry.`,
                    snippet: `var(${varName})`,
                });
            }
        }
    }

    return violations;
}

/**
 * Rule D: native-destructive-confirm
 *
 * Scans web/src ts/tsx files: Native confirm(...) / globalThis.confirm(...) / window.confirm(...)
 * is strictly forbidden for destructive actions.
 * All destructive confirmations must use accessible, canonical AlertDialog.
 */
function visitNodes(node: ts.Node, visitor: (node: ts.Node) => void): void {
    visitor(node);
    ts.forEachChild(node, (child) => visitNodes(child, visitor));
}

function isTestFile(file: string): boolean {
    return /\.(test|spec)\.tsx?$/.test(file) || file.includes("/__tests__/");
}

export function checkRuleD_NativeConfirm(
    file: string,
    content: string,
): OwnershipViolation[] {
    if (isTestFile(file) || !/\.tsx?$/.test(file)) return [];
    const source = ts.createSourceFile(
        file,
        content,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const violations: OwnershipViolation[] = [];
    visitNodes(source, (node) => {
        if (!ts.isCallExpression(node)) return;
        const callee = node.expression;
        let name: string | undefined;
        if (ts.isIdentifier(callee) && callee.text === "confirm") {
            name = "confirm";
        }
        if (
            ts.isPropertyAccessExpression(callee) ||
            ts.isElementAccessExpression(callee)
        ) {
            const target = callee.expression;
            const property = ts.isPropertyAccessExpression(callee)
                ? callee.name.text
                : callee.argumentExpression &&
                        ts.isStringLiteralLike(callee.argumentExpression)
                ? callee.argumentExpression.text
                : undefined;
            if (
                ts.isIdentifier(target) &&
                ["window", "globalThis"].includes(target.text) &&
                property === "confirm"
            ) name = target.text + ".confirm";
        }
        if (!name) return;
        const { line, character } = source.getLineAndCharacterOfPosition(
            node.getStart(source),
        );
        violations.push({
            rule: "native-destructive-confirm",
            file: file.replaceAll("\\", "/"),
            line: line + 1,
            column: character + 1,
            message:
                "Native confirm is forbidden; use the canonical AlertDialog.",
            snippet: name + "(...)",
        });
    });
    return violations;
}

/**
 * Rule E: forbidden-legacy-ui-class
 *
 * Prohibits legacy UI classes in TSX and CSS:
 * - webapp-undo-toast
 * - trash-empty-card
 * - trash-status-msg
 * - home-error-toast
 * - spin
 * - legacy Ask root classes (ask-layout, ask-history, etc.)
 * - legacy Workspace / Apps section & count clones (apps-workspace-section, apps-workspace-count-badge, etc.)
 * - legacy Workspace / Apps banner clones (apps-workspace-banner, --offline, --error, --loading, -actions, etc.)
 * - legacy Workspace empty clones (apps-workspace-empty, workspace-empty, etc.)
 */
export function checkRuleE_ForbiddenLegacyUiClass(
    file: string,
    content: string,
): OwnershipViolation[] {
    const normPath = file.replaceAll("\\", "/");
    if (
        normPath.endsWith(".test.ts") ||
        normPath.endsWith(".test.tsx") ||
        normPath.endsWith(".spec.ts") ||
        normPath.endsWith(".spec.tsx") ||
        normPath.includes("/__tests__/")
    ) {
        return [];
    }

    const violations: OwnershipViolation[] = [];

    if (normPath.endsWith(".css")) {
        const cleanContent = stripCssComments(content);
        const lines = cleanContent.split("\n");
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            for (const cls of FORBIDDEN_LEGACY_UI_CLASSES) {
                const regex = new RegExp(`(?<![\\w-])\\.${cls}(?![\\w-])`, "g");
                let match: RegExpExecArray | null;
                while ((match = regex.exec(line)) !== null) {
                    violations.push({
                        rule: "forbidden-legacy-ui-class",
                        file: normPath,
                        line: lineIdx + 1,
                        column: match.index + 1,
                        message:
                            `Forbidden legacy UI class '.${cls}' is used in CSS. It has been abolished and must be replaced by canonical semantic primitive.`,
                        snippet: `.${cls}`,
                    });
                }
            }
        }
        return violations;
    }

    if (normPath.endsWith(".tsx") || normPath.endsWith(".ts")) {
        const source = ts.createSourceFile(
            file,
            content,
            ts.ScriptTarget.Latest,
            true,
            normPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        );
        visitNodes(source, (node) => {
            if (
                !ts.isJsxAttribute(node) ||
                node.name.getText(source) !== "className" || !node.initializer
            ) return;
            visitNodes(node.initializer, (literal) => {
                if (!ts.isStringLiteralLike(literal)) return;
                for (const cls of literal.text.split(/\s+/)) {
                    if (!FORBIDDEN_LEGACY_UI_CLASSES.includes(cls)) continue;
                    const { line, character } = source
                        .getLineAndCharacterOfPosition(
                            literal.getStart(source),
                        );
                    violations.push({
                        rule: "forbidden-legacy-ui-class",
                        file: normPath,
                        line: line + 1,
                        column: character + 1,
                        message:
                            "Legacy UI class must be replaced by its canonical primitive.",
                        snippet: cls,
                    });
                }
            });
        });
    }

    return violations;
}

/**
 * Rule F: css-prefix-ownership
 *
 * Enforces that CSS feature class prefixes are only defined in their authorized owner stylesheets.
 * Global CSS or cross-cutting semantic sheets cannot host feature-prefixed selectors.
 */
export function checkRuleF_CssPrefixOwnership(
    file: string,
    content: string,
): OwnershipViolation[] {
    const normPath = file.replaceAll("\\", "/");
    if (!normPath.endsWith(".css")) {
        return [];
    }

    const violations: OwnershipViolation[] = [];
    const cleanContent = stripCssComments(content);
    const lines = cleanContent.split("\n");

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        const classMatches = line.matchAll(/\.([a-zA-Z0-9_-]+)/g);

        for (const match of classMatches) {
            const className = match[1];

            // 1. Check exact canonical semantic class owners (takes priority over prefix map)
            const canonicalOwners = CANONICAL_SEMANTIC_CLASS_OWNERS[className];
            if (canonicalOwners) {
                const isOwner = canonicalOwners.some(
                    (owner) => normPath.endsWith(owner) || normPath === owner,
                );
                if (!isOwner) {
                    violations.push({
                        rule: "css-prefix-ownership",
                        file: normPath,
                        line: lineIdx + 1,
                        column: (match.index ?? 0) + 1,
                        message:
                            `Canonical semantic class '.${className}' is defined in '${normPath}', but is only authorized in: ${
                                canonicalOwners.join(", ")
                            }.`,
                        snippet: `.${className}`,
                    });
                }
                continue;
            }

            // 2. Check feature prefix ownership
            for (
                const [prefix, allowedOwners] of Object.entries(
                    CSS_PREFIX_OWNER_MAP,
                )
            ) {
                if (className.startsWith(prefix)) {
                    const isOwner = allowedOwners.some(
                        (owner) =>
                            normPath.endsWith(owner) || normPath === owner,
                    );
                    if (!isOwner) {
                        violations.push({
                            rule: "css-prefix-ownership",
                            file: normPath,
                            line: lineIdx + 1,
                            column: (match.index ?? 0) + 1,
                            message:
                                `CSS selector '.${className}' with prefix '${prefix}' is defined in '${normPath}', but is only authorized in: ${
                                    allowedOwners.join(", ")
                                }.`,
                            snippet: `.${className}`,
                        });
                    }
                }
            }
        }
    }

    return violations;
}

/**
 * Rule G: workspace-core-isolation
 *
 * Enforces architectural boundaries for Workspace Core (web/src/features/workspace/):
 * 1. Core must never depend on home viewport geometry modules (home-viewport, geometry.ts, etc.)
 *    or spatial geometry types (SafeRect, HomeViewport).
 * 2. Core must not define or use 'closed' route view variant.
 *    Presenter visibility is owned by Host, not Core routes.
 */
export function checkRuleG_WorkspaceCoreIsolation(
    file: string,
    content: string,
): OwnershipViolation[] {
    const normPath = file.replaceAll("\\", "/");
    if (!normPath.includes("features/workspace/")) {
        return [];
    }
    if (
        isTestFile(normPath) ||
        (!normPath.endsWith(".ts") && !normPath.endsWith(".tsx"))
    ) {
        return [];
    }

    const violations: OwnershipViolation[] = [];
    const source = ts.createSourceFile(
        file,
        content,
        ts.ScriptTarget.Latest,
        true,
        normPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const GEOMETRY_MODULE_REGEX = /(home-viewport|\bgeometry(\.ts)?$)/i;
    const FORBIDDEN_GEOMETRY_SYMBOLS: Record<string, true> = {
        SafeRect: true,
        HomeViewport: true,
        homeViewport: true,
        useHomeViewport: true,
    };

    visitNodes(source, (node) => {
        // Check 1: Import declarations
        if (ts.isImportDeclaration(node)) {
            const specifier = node.moduleSpecifier;
            if (ts.isStringLiteral(specifier)) {
                if (GEOMETRY_MODULE_REGEX.test(specifier.text)) {
                    const { line, character } = source
                        .getLineAndCharacterOfPosition(
                            node.getStart(source),
                        );
                    violations.push({
                        rule: "workspace-core-isolation",
                        file: normPath,
                        line: line + 1,
                        column: character + 1,
                        message:
                            `Workspace Core must never depend on geometry module '${specifier.text}'. Core must remain presenter-agnostic domain state.`,
                        snippet: node.getText(source),
                    });
                }
            }

            // Named import bindings
            if (
                node.importClause?.namedBindings &&
                ts.isNamedImports(node.importClause.namedBindings)
            ) {
                for (
                    const element of node.importClause.namedBindings.elements
                ) {
                    const importedName = element.propertyName?.text ??
                        element.name.text;
                    if (FORBIDDEN_GEOMETRY_SYMBOLS[importedName]) {
                        const { line, character } = source
                            .getLineAndCharacterOfPosition(
                                element.getStart(source),
                            );
                        violations.push({
                            rule: "workspace-core-isolation",
                            file: normPath,
                            line: line + 1,
                            column: character + 1,
                            message:
                                `Workspace Core must never import geometry symbol '${importedName}'. Core must remain independent of spatial geometry.`,
                            snippet: element.getText(source),
                        });
                    }
                }
            }
        }

        // Check 2: 'closed' view in route types / objects
        if (ts.isPropertySignature(node) || ts.isPropertyAssignment(node)) {
            const propName = node.name.getText(source);
            if (propName === "view" || propName === '"view"') {
                let isClosedLiteral = false;
                if (
                    ts.isPropertySignature(node) && node.type &&
                    ts.isLiteralTypeNode(node.type)
                ) {
                    if (
                        ts.isStringLiteral(node.type.literal) &&
                        node.type.literal.text === "closed"
                    ) {
                        isClosedLiteral = true;
                    }
                } else if (
                    ts.isPropertyAssignment(node) &&
                    ts.isStringLiteral(node.initializer) &&
                    node.initializer.text === "closed"
                ) {
                    isClosedLiteral = true;
                }

                if (isClosedLiteral) {
                    const { line, character } = source
                        .getLineAndCharacterOfPosition(node.getStart(source));
                    violations.push({
                        rule: "workspace-core-isolation",
                        file: normPath,
                        line: line + 1,
                        column: character + 1,
                        message:
                            `Workspace Core must not define or use 'closed' route view. Presenter visibility is owned by Host.`,
                        snippet: node.getText(source),
                    });
                }
            }
        }
    });

    return violations;
}

/**
 * Rule J: home-document-token
 *
 * Enforces that Home layout styles and components do not pollute document-level visual tokens:
 * 1. Home stylesheets (web/src/features/home-layouts/ and launcher.css) must not declare or
 *    override document-level visual tokens (--background, --foreground, --surface*, --radius*, --border*,
 *    --accent*, --shadow-l*) on document root selectors (:root, html, body, [data-theme],
 *    and combinations like :root[data-theme='dark'], html[data-theme]).
 *    Global visual tokens are exclusively owned by web/src/design-system/tokens.css & global.css.
 * 2. Home TSX components must not directly mutate document.documentElement.style or document.body.style.
 */
export function checkRuleJ_HomeDocumentTokenPollution(
    file: string,
    content: string,
): OwnershipViolation[] {
    const normPath = file.replaceAll("\\", "/");
    const isHomeCss = normPath.endsWith(".css") && (
        normPath.includes("features/home-layouts/") ||
        normPath.endsWith("components/searcher/launcher.css")
    );
    const isHomeTsx = normPath.endsWith(".tsx") && (
        normPath.includes("features/home-layouts/") ||
        normPath.includes("components/searcher/")
    );

    if (!isHomeCss && !isHomeTsx) {
        return [];
    }
    if (isTestFile(normPath)) {
        return [];
    }

    const violations: OwnershipViolation[] = [];

    const PROTECTED_GLOBAL_TOKENS: Record<string, true> = {
        "--background": true,
        "--foreground": true,
        "--surface": true,
        "--surface-soft": true,
        "--surface-solid": true,
        "--surface-l0": true,
        "--surface-l1": true,
        "--surface-l2": true,
        "--surface-l3": true,
        "--surface-navigation": true,
        "--border": true,
        "--border-subtle": true,
        "--accent": true,
        "--accent-hover": true,
        "--accent-active": true,
        "--accent-foreground": true,
        "--accent-soft": true,
        "--radius": true,
        "--radius-sm": true,
        "--radius-md": true,
        "--radius-lg": true,
        "--radius-full": true,
        "--shadow-l1": true,
        "--shadow-l2": true,
        "--shadow-l3": true,
        "--shadow-navigation": true,
    };

    if (isHomeCss) {
        const cleanContent = stripCssComments(content);
        const ruleRegex = /([^{}]+)\{([^{}]+)\}/g;
        let match: RegExpExecArray | null = null;

        while ((match = ruleRegex.exec(cleanContent)) !== null) {
            const rawSelector = match[1].trim();
            const body = match[2];
            const selectorList = rawSelector.split(",").map((s) => s.trim());

            // Check if selector targets document-level root scope
            // Matches :root, html, body, and combinations like :root[data-theme='dark'], html[data-theme], body.dark
            // But does NOT match scoped descendant selectors like .zen-edge-btn, [data-theme="dark"] .zen-edge-btn
            const isDocLevel = selectorList.some((sel) => {
                const normalized = sel.replace(/\s+/g, " ").trim();
                // If it contains a descendant space before a class (e.g. "[data-theme='dark'] .zen-edge-btn"), it is scoped!
                if (/\s+\.[a-zA-Z0-9_-]+/.test(normalized)) {
                    return false;
                }
                return (
                    /^(:root|html|body)(\[[^\]]+\]|\.[a-zA-Z0-9_-]+|:[a-zA-Z0-9_-]+)*$/
                        .test(
                            normalized,
                        ) ||
                    /^\[data-theme(=[^\]]+)?\]$/.test(normalized)
                );
            });

            if (isDocLevel) {
                const declRegex = /(--[a-zA-Z0-9_-]+)\s*:/g;
                let declMatch: RegExpExecArray | null = null;
                while ((declMatch = declRegex.exec(body)) !== null) {
                    const tokenName = declMatch[1];
                    if (PROTECTED_GLOBAL_TOKENS[tokenName]) {
                        const preText = cleanContent.slice(0, match.index);
                        const line = preText.split("\n").length;
                        violations.push({
                            rule: "home-document-token",
                            file: normPath,
                            line,
                            column: 1,
                            message:
                                `Home stylesheet must not declare or override document-level global visual token '${tokenName}' in '${rawSelector}'. Document tokens are strictly owned by tokens.css / global.css.`,
                            snippet: `${rawSelector} { ${tokenName}: ... }`,
                        });
                    }
                }
            }
        }
    }

    if (isHomeTsx) {
        const source = ts.createSourceFile(
            file,
            content,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX,
        );

        visitNodes(source, (node) => {
            if (ts.isPropertyAccessExpression(node)) {
                const exprText = node.getText(source);
                if (
                    exprText === "document.documentElement.style" ||
                    exprText === "document.body.style"
                ) {
                    const { line, character } = source
                        .getLineAndCharacterOfPosition(node.getStart(source));
                    violations.push({
                        rule: "home-document-token",
                        file: normPath,
                        line: line + 1,
                        column: character + 1,
                        message:
                            "Home components must not directly mutate documentElement or document.body styles.",
                        snippet: exprText,
                    });
                }
            }
        });
    }

    return violations;
}

/**
 * Rule L: forbidden-legacy-path
 *
 * Enforces that removed legacy files and components do not reappear.
 */
export function checkRuleL_ForbiddenLegacyPaths(
    file: string,
): OwnershipViolation[] {
    const normPath = file.replaceAll("\\", "/");
    for (const legacyPath of FORBIDDEN_LEGACY_PATHS) {
        if (normPath.endsWith(legacyPath) || normPath === legacyPath) {
            return [{
                rule: "forbidden-legacy-path",
                file: normPath,
                line: 1,
                column: 1,
                message:
                    `Forbidden legacy presentation file '${legacyPath}' detected. Legacy presentation files have been abolished and must not be reintroduced.`,
                snippet: legacyPath,
            }];
        }
    }
    return [];
}

/**
 * Primitive component to data-slot mapping for Rule M.
 */
export const PRIMITIVE_COMPONENT_SLOTS: Record<string, string> = {
    RadioGroup: "radio-group",
    RadioGroupItem: "radio-group-item",
    Button: "button",
    NativeSelect: "native-select-wrapper",
    Slider: "slider",
    Tabs: "tabs",
    TabsList: "tabs-list",
    TabsTrigger: "tabs-trigger",
};

/**
 * Hard-gate properties for primitive-feature-cascade-order (Issue #120 / Spec Hardening v2).
 */
export function isHardGateProperty(prop: string): boolean {
    const p = prop.trim().toLowerCase();
    if (
        p.startsWith("font") ||
        p === "line-height" ||
        p === "letter-spacing" ||
        p.startsWith("text") ||
        p === "white-space" ||
        p === "cursor" ||
        p.startsWith("transition") ||
        p.startsWith("animation") ||
        p.startsWith("transform")
    ) {
        return false;
    }

    if (
        p === "display" ||
        p === "position" ||
        p === "inset" ||
        p === "top" ||
        p === "right" ||
        p === "bottom" ||
        p === "left" ||
        p === "float" ||
        p === "clear" ||
        p === "order" ||
        p.startsWith("flex") ||
        p.startsWith("align-") ||
        p.startsWith("justify-") ||
        p.startsWith("grid") ||
        p.startsWith("place-") ||
        p === "gap" ||
        p === "row-gap" ||
        p === "column-gap" ||
        p === "width" ||
        p === "height" ||
        p === "min-width" ||
        p === "min-height" ||
        p === "max-width" ||
        p === "max-height" ||
        p.startsWith("padding") ||
        p.startsWith("margin") ||
        p === "overflow" ||
        p === "overflow-x" ||
        p === "overflow-y"
    ) {
        return true;
    }

    if (
        p.startsWith("border") ||
        p.startsWith("background") ||
        p === "box-shadow" ||
        p === "color" ||
        p === "opacity"
    ) {
        return true;
    }

    return false;
}

interface CssRuleBlock {
    selector: string;
    body: string;
    startIndex: number;
}

function extractCssRules(cssText: string): CssRuleBlock[] {
    const rules: CssRuleBlock[] = [];
    let i = 0;
    while (i < cssText.length) {
        const openBrace = cssText.indexOf("{", i);
        if (openBrace === -1) break;
        const selector = cssText.slice(i, openBrace).trim();

        let depth = 1;
        let j = openBrace + 1;
        while (j < cssText.length && depth > 0) {
            if (cssText[j] === "{") depth++;
            else if (cssText[j] === "}") depth--;
            j++;
        }
        const inner = cssText.slice(openBrace + 1, j - 1);

        if (
            selector.startsWith("@media") ||
            selector.startsWith("@container") ||
            selector.startsWith("@supports")
        ) {
            const nested = extractCssRules(inner);
            for (const r of nested) {
                rules.push({
                    selector: r.selector,
                    body: r.body,
                    startIndex: openBrace + 1 + r.startIndex,
                });
            }
        } else if (!selector.startsWith("@") && selector.length > 0) {
            rules.push({
                selector,
                body: inner,
                startIndex: i,
            });
        }
        i = j;
    }
    return rules;
}

function isCascadeScopeFile(file: string, isCss: boolean): boolean {
    const norm = file.replaceAll("\\", "/");
    if (norm.includes("fixture")) return true;
    if (isCss) {
        return (
            norm.endsWith("web/src/app/settings.css") ||
            norm.endsWith("web/src/components/searcher/markdown.css") ||
            norm.includes("web/src/features/ask/")
        );
    } else {
        return (
            norm.endsWith("web/src/app/SettingsPage.tsx") ||
            norm.endsWith("web/src/app/AskPage.tsx") ||
            norm.includes("web/src/features/ask/")
        );
    }
}

/**
 * Rule M: primitive-feature-cascade-order (Issue #120)
 * Feature class directly applied to primitive root overriding structural/visual properties
 * must use slot-aware compound selector or data-variant.
 */
export function checkRuleM_PrimitiveFeatureCascadeOrder(
    tsxFiles: { file: string; content: string }[],
    cssFiles: { file: string; content: string }[],
): OwnershipViolation[] {
    const violations: OwnershipViolation[] = [];

    // 1. Gather all class names attached to primitive components in scoped TSX files
    const primitiveClasses = new Map<
        string,
        { component: string; slot: string; file: string }
    >();

    for (const tsx of tsxFiles) {
        if (!isCascadeScopeFile(tsx.file, false)) continue;

        const source = ts.createSourceFile(
            tsx.file,
            tsx.content,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX,
        );

        visitNodes(source, (node) => {
            if (
                ts.isJsxOpeningElement(node) ||
                ts.isJsxSelfClosingElement(node)
            ) {
                const tagName = node.tagName.getText(source);
                if (tagName in PRIMITIVE_COMPONENT_SLOTS) {
                    const slot = PRIMITIVE_COMPONENT_SLOTS[tagName];
                    for (const prop of node.attributes.properties) {
                        if (
                            ts.isJsxAttribute(prop) &&
                            (prop.name.getText(source) === "className" ||
                                prop.name.getText(source) === "class")
                        ) {
                            const init = prop.initializer;
                            const classNames: string[] = [];
                            if (init && ts.isStringLiteral(init)) {
                                classNames.push(
                                    ...init.text.split(/\s+/).filter(Boolean),
                                );
                            } else if (
                                init &&
                                ts.isJsxExpression(init) &&
                                init.expression
                            ) {
                                const expr = init.expression;
                                if (
                                    ts.isNoSubstitutionTemplateLiteral(expr)
                                ) {
                                    classNames.push(
                                        ...expr.text.split(/\s+/).filter(
                                            Boolean,
                                        ),
                                    );
                                } else if (ts.isTemplateExpression(expr)) {
                                    classNames.push(
                                        ...expr.head.text.split(/\s+/).filter(
                                            Boolean,
                                        ),
                                    );
                                    for (const span of expr.templateSpans) {
                                        classNames.push(
                                            ...span.literal.text.split(/\s+/)
                                                .filter(Boolean),
                                        );
                                    }
                                } else {
                                    const text = expr.getText(source);
                                    const strMatches = text.matchAll(
                                        /["']([a-zA-Z0-9_-]+)["']/g,
                                    );
                                    for (const m of strMatches) {
                                        classNames.push(m[1]);
                                    }
                                }
                            }
                            for (const cls of classNames) {
                                primitiveClasses.set(cls, {
                                    component: tagName,
                                    slot,
                                    file: tsx.file,
                                });
                            }
                        }
                    }
                }
            }
        });
    }

    // 2. Check scoped CSS files for rules targeting these classes without slot-aware compound selector
    for (const css of cssFiles) {
        if (!isCascadeScopeFile(css.file, true)) continue;

        const clean = stripCssComments(css.content);
        const rules = extractCssRules(clean);

        for (const rule of rules) {
            // Check if rule body contains hard-gated properties
            const decls = rule.body.split(";");
            let hasHardGate = false;
            let triggeredProp = "";
            for (const decl of decls) {
                const colonIdx = decl.indexOf(":");
                if (colonIdx > 0) {
                    const prop = decl.slice(0, colonIdx).trim();
                    if (isHardGateProperty(prop)) {
                        hasHardGate = true;
                        triggeredProp = prop;
                        break;
                    }
                }
            }

            if (!hasHardGate) continue;

            // Check if any selector targets a primitive class without slot awareness
            const selectorList = rule.selector.split(",").map((s) => s.trim());
            for (const sel of selectorList) {
                // If selector is slot-aware or variant-aware, it passes
                if (
                    sel.includes("[data-slot=") ||
                    sel.includes("[data-variant=")
                ) {
                    continue;
                }

                // Extract all class names in this selector
                const matches = sel.matchAll(/\.([a-zA-Z0-9_-]+)/g);
                for (const m of matches) {
                    const cls = m[1];
                    if (primitiveClasses.has(cls)) {
                        const target = primitiveClasses.get(cls)!;
                        // Calculate line & column
                        const line =
                            css.content.slice(0, rule.startIndex).split(
                                "\n",
                            ).length;
                        const column = 1;
                        violations.push({
                            rule: "primitive-feature-cascade-order",
                            file: css.file.replaceAll("\\", "/"),
                            line,
                            column,
                            message:
                                `Feature class '.${cls}' applied directly to <${target.component}> root overrides structural/visual property '${triggeredProp}' without slot-aware compound selector (e.g. [data-slot="${target.slot}"].${cls}) or variant`,
                            snippet: sel,
                        });
                        break; // one violation per rule is enough
                    }
                }
            }
        }
    }

    return violations;
}

/**
 * Recursively scans target directory and enforces all P3 & Issue #92 & #120 ownership rules (A-M).
 * Ownership violations are absolute: NOT subject to baseline, allowances, or exceptions.
 */
export async function scanOwnership(
    targetDir: string,
    baseDir = targetDir,
): Promise<OwnershipCheckResult> {
    const violations: OwnershipViolation[] = [];
    const cssFiles: { file: string; content: string }[] = [];
    const tsxFiles: { file: string; content: string }[] = [];
    let totalFilesScanned = 0;

    // Locate tokens.css content
    let tokensCssContent = "";
    const possibleTokensPaths = [
        join(targetDir, "design-system/tokens.css"),
        join(baseDir, "web/src/design-system/tokens.css"),
        join(baseDir, "design-system/tokens.css"),
    ];
    for (const p of possibleTokensPaths) {
        try {
            tokensCssContent = await Deno.readTextFile(p);
            break;
        } catch {
            // Try next
        }
    }

    for await (
        const entry of walk(targetDir, {
            includeDirs: false,
            exts: [".css", ".tsx", ".ts"],
            skip: [
                /\/node_modules\//,
                /\/\.git\//,
                /\/dist\//,
                /\/\.vite\//,
                /\/\.omp\//,
                /\/\.llm-wiki\//,
            ],
        })
    ) {
        const normPath = entry.path.replaceAll("\\", "/");
        if (
            normPath.endsWith(".test.ts") ||
            normPath.endsWith(".test.tsx") ||
            normPath.endsWith(".spec.ts") ||
            normPath.endsWith(".spec.tsx") ||
            normPath.includes("/__tests__/")
        ) {
            continue;
        }

        totalFilesScanned++;
        const relPath = relative(baseDir, entry.path).replaceAll("\\", "/");
        const content = await Deno.readTextFile(entry.path);

        violations.push(...checkRuleL_ForbiddenLegacyPaths(relPath));

        if (normPath.endsWith(".css")) {
            cssFiles.push({ file: relPath, content });
            violations.push(
                ...checkRuleA_GlobalFeaturePrefix(relPath, content),
            );
            violations.push(...checkRuleB_PageLayout(relPath, content));
            violations.push(
                ...checkRuleE_ForbiddenLegacyUiClass(relPath, content),
            );
            violations.push(...checkRuleF_CssPrefixOwnership(relPath, content));
            violations.push(
                ...checkRuleJ_HomeDocumentTokenPollution(relPath, content),
            );
        } else if (normPath.endsWith(".tsx")) {
            tsxFiles.push({ file: relPath, content });
            violations.push(...checkRuleB_PageLayout(relPath, content));
            violations.push(...checkRuleD_NativeConfirm(relPath, content));
            violations.push(
                ...checkRuleE_ForbiddenLegacyUiClass(relPath, content),
            );
            violations.push(
                ...checkRuleG_WorkspaceCoreIsolation(relPath, content),
            );
            violations.push(
                ...checkRuleJ_HomeDocumentTokenPollution(relPath, content),
            );
        } else if (normPath.endsWith(".ts")) {
            violations.push(...checkRuleD_NativeConfirm(relPath, content));
            violations.push(
                ...checkRuleE_ForbiddenLegacyUiClass(relPath, content),
            );
            violations.push(
                ...checkRuleG_WorkspaceCoreIsolation(relPath, content),
            );
        }
    }

    // Rule C: undefined-css-token across all CSS files
    if (tokensCssContent.length > 0 || cssFiles.length > 0) {
        violations.push(
            ...checkRuleC_UndefinedCssTokens(cssFiles, tokensCssContent),
        );
    }

    // Rule M: primitive-feature-cascade-order across scoped TSX and CSS
    violations.push(
        ...checkRuleM_PrimitiveFeatureCascadeOrder(tsxFiles, cssFiles),
    );
    // Sort violations deterministically by file, line, column
    violations.sort((a, b) => {
        const fileCmp = a.file.localeCompare(b.file);
        if (fileCmp !== 0) return fileCmp;
        if (a.line !== b.line) return a.line - b.line;
        return a.column - b.column;
    });

    const byRule: Record<OwnershipRuleId, OwnershipViolation[]> = {
        "feature-selector-in-global": [],
        "legacy-page-layout": [],
        "undefined-css-token": [],
        "native-destructive-confirm": [],
        "forbidden-legacy-ui-class": [],
        "css-prefix-ownership": [],
        "workspace-core-isolation": [],
        "home-document-token": [],
        "forbidden-legacy-path": [],
        "primitive-feature-cascade-order": [],
    };

    for (const v of violations) {
        byRule[v.rule].push(v);
    }

    return {
        passed: violations.length === 0,
        violations,
        byRule,
        totalFilesScanned,
    };
}

/**
 * Formats an ownership check result into a human-readable CLI report.
 */
export function formatOwnershipReport(result: OwnershipCheckResult): string {
    const lines: string[] = [];
    lines.push("============================================================");
    lines.push(
        "Searcher UI Guard - Ownership & Boundary Enforcement (Issue #79 & #92)",
    );
    lines.push("============================================================");
    lines.push(`Total scanned files: ${result.totalFilesScanned}`);
    lines.push(`Total violations:    ${result.violations.length}`);
    lines.push(
        `  Rule A (feature-selector-in-global):    ${
            result.byRule["feature-selector-in-global"].length
        }`,
    );
    lines.push(
        `  Rule B (legacy-page-layout):            ${
            result.byRule["legacy-page-layout"].length
        }`,
    );
    lines.push(
        `  Rule C (undefined-css-token):           ${
            result.byRule["undefined-css-token"].length
        }`,
    );
    lines.push(
        `  Rule D (native-destructive-confirm):    ${
            result.byRule["native-destructive-confirm"].length
        }`,
    );
    lines.push(
        `  Rule E (forbidden-legacy-ui-class):     ${
            result.byRule["forbidden-legacy-ui-class"].length
        }`,
    );
    lines.push(
        `  Rule F (css-prefix-ownership):          ${
            result.byRule["css-prefix-ownership"].length
        }`,
    );
    lines.push(
        `  Rule G (workspace-core-isolation):      ${
            result.byRule["workspace-core-isolation"].length
        }`,
    );
    lines.push(
        `  Rule J (home-document-token):           ${
            result.byRule["home-document-token"].length
        }`,
    );
    lines.push(
        `  Rule L (forbidden-legacy-path):         ${
            result.byRule["forbidden-legacy-path"].length
        }`,
    );
    lines.push(
        `  Rule M (primitive-feature-cascade-order): ${
            result.byRule["primitive-feature-cascade-order"].length
        }`,
    );
    lines.push("------------------------------------------------------------");

    if (result.violations.length > 0) {
        lines.push(
            "\n[FAIL] OWNERSHIP VIOLATIONS DETECTED (Absolute rules; no baseline bypass):\n",
        );
        for (const v of result.violations) {
            lines.push(`  [${v.rule}] ${v.file}:${v.line}:${v.column}`);
            lines.push(`    ${v.message}`);
            lines.push(`    Snippet: ${v.snippet}\n`);
        }
        lines.push(
            "============================================================",
        );
    } else {
        lines.push(
            "\n[PASS] All ownership rules verified! 0 architectural drift.",
        );
        lines.push(
            "============================================================",
        );
    }

    return lines.join("\n");
}

if (import.meta.main) {
    const targetDir = Deno.args[0] ?? "web/src";
    const baseDir = Deno.args[1] ?? Deno.cwd();
    const result = await scanOwnership(targetDir, baseDir);
    console.log(formatOwnershipReport(result));
    Deno.exit(result.passed ? 0 : 1);
}
