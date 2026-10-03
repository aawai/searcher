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
    | "css-prefix-ownership";

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
        "Wallpaper presentation layer: dynamic background image URL injected by WallpaperSurface runtime",
    "--wallpaper-blur":
        "Wallpaper presentation layer: dynamic blur radius in px injected by WallpaperSurface runtime",
    "--wallpaper-grayscale":
        "Wallpaper presentation layer: dynamic grayscale intensity injected by WallpaperSurface runtime",
    "--wallpaper-mask":
        "Wallpaper presentation layer: dynamic dark/light surface mask opacity injected by WallpaperSurface runtime",
    "--wallpaper-position":
        "Wallpaper presentation layer: dynamic background positioning coordinates injected by WallpaperSurface runtime",
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
};
/**
 * Canonical mapping between CSS feature class prefixes and their authorized owner files.
 * Same prefix must never be declared outside its designated owner stylesheets.
 */
export const CSS_PREFIX_OWNER_MAP: Record<string, readonly string[]> = {
    "settings-": ["web/src/app/settings.css"],
    "admin-": ["web/src/app/admin.css"],
    "account-": ["web/src/app/account.css"],
    "ask-": ["web/src/features/ask/ask-workspace.css"],
    "workspace-": ["web/src/features/workspace/workspace.css"],
    "apps-workspace-": ["web/src/features/workspace/apps-workspace.css"],
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
 * Recursively scans target directory and enforces all P3 ownership rules (A-F).
 * Ownership violations are absolute: NOT subject to baseline, allowances, or exceptions.
 */
export async function scanOwnership(
    targetDir: string,
    baseDir = targetDir,
): Promise<OwnershipCheckResult> {
    const violations: OwnershipViolation[] = [];
    const cssFiles: { file: string; content: string }[] = [];
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
        } else if (normPath.endsWith(".tsx")) {
            violations.push(...checkRuleB_PageLayout(relPath, content));
            violations.push(...checkRuleD_NativeConfirm(relPath, content));
            violations.push(
                ...checkRuleE_ForbiddenLegacyUiClass(relPath, content),
            );
        } else if (normPath.endsWith(".ts")) {
            violations.push(...checkRuleD_NativeConfirm(relPath, content));
            violations.push(
                ...checkRuleE_ForbiddenLegacyUiClass(relPath, content),
            );
        }
    }

    // Rule C: undefined-css-token across all CSS files
    if (tokensCssContent.length > 0 || cssFiles.length > 0) {
        violations.push(
            ...checkRuleC_UndefinedCssTokens(cssFiles, tokensCssContent),
        );
    }

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
        "Searcher UI Guard - Ownership & Boundary Enforcement (Issue #79 P3)",
    );
    lines.push("============================================================");
    lines.push(`Total scanned files: ${result.totalFilesScanned}`);
    lines.push(`Total violations:    ${result.violations.length}`);
    lines.push(
        `  Rule A (feature-selector-in-global):  ${
            result.byRule["feature-selector-in-global"].length
        }`,
    );
    lines.push(
        `  Rule B (legacy-page-layout):          ${
            result.byRule["legacy-page-layout"].length
        }`,
    );
    lines.push(
        `  Rule C (undefined-css-token):         ${
            result.byRule["undefined-css-token"].length
        }`,
    );
    lines.push(
        `  Rule D (native-destructive-confirm):  ${
            result.byRule["native-destructive-confirm"].length
        }`,
    );
    lines.push(
        `  Rule E (forbidden-legacy-ui-class):   ${
            result.byRule["forbidden-legacy-ui-class"].length
        }`,
    );
    lines.push(
        `  Rule F (css-prefix-ownership):        ${
            result.byRule["css-prefix-ownership"].length
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
