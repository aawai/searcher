/**
 * Searcher UI Guard - Lightweight Hygiene Checks
 *
 * Enforces 3 bug-prevention hygiene rules:
 * - undefined-css-token: Prevents referencing undefined CSS custom properties.
 * - native-destructive-confirm: Prevents calling native confirm() in UI code.
 * - native-form-control: Prevents raw <input type="checkbox|radio|range"> outside UI primitives/markdown.
 */

import ts from "typescript";

import { walk } from "@std/fs/walk";
import { relative } from "@std/path/relative";
import { join } from "@std/path/join";

export type OwnershipRuleId =
    | "undefined-css-token"
    | "native-destructive-confirm"
    | "native-form-control";

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
 * Runtime CSS variables dynamically injected by JS/libraries at runtime.
 */
export const RUNTIME_CSS_VARIABLE_REGISTRY: Record<string, string> = {
    "--wallpaper-image":
        "WallpaperSurface runtime owner: Validated source URL or CSS gradient",
    "--wallpaper-position":
        "WallpaperSurface runtime owner: Normalized focal point",
    "--masthead-dock-shift":
        "ZenLayout runtime owner: measured vertical distance from the search box's anchor to its dock above the open narrow masthead sheet",
    "--page-width":
        "DocumentPagination layout owner: physical paper metrics and measured vertical page flow",
    "--page-height":
        "DocumentPagination layout owner: physical paper metrics and measured vertical page flow",
    "--page-content-width":
        "DocumentPagination layout owner: physical paper metrics and measured vertical page flow",
    "--page-content-height":
        "DocumentPagination layout owner: physical paper metrics and measured vertical page flow",
    "--page-margin-top":
        "DocumentPagination layout owner: physical paper margins",
    "--page-margin-right":
        "DocumentPagination layout owner: physical paper margins",
    "--page-margin-bottom":
        "DocumentPagination layout owner: physical paper margins",
    "--page-margin-left":
        "DocumentPagination layout owner: physical paper margins",
    "--page-gap":
        "DocumentPagination layout owner: measured semantic page gap",
    "--page-pitch":
        "DocumentPagination layout owner: physical paper height plus measured semantic gap",
    "--transform-origin":
        "Base UI popup runtime owner: anchor-relative transform origin for menu open/close transitions",
    "--available-height":
        "Base UI popover positioner runtime owner: viewport space available to the anchored popup",
    "--anchor-width":
        "Base UI select/popover positioner runtime owner: trigger width matched by the anchored popup",
};

function stripCssComments(cssText: string): string {
    return cssText.replace(/\/\*[\s\S]*?\*\//g, (match) => {
        return match.replace(/[^\n]/g, " ");
    });
}

function visitNodes(node: ts.Node, visitor: (node: ts.Node) => void): void {
    visitor(node);
    ts.forEachChild(node, (child) => visitNodes(child, visitor));
}

function isTestFile(file: string): boolean {
    const norm = file.replaceAll("\\", "/");
    return /\.(test|spec)\.tsx?$/.test(norm) || norm.includes("/__tests__/");
}

/**
 * Rule: undefined-css-token
 *
 * Scans CSS files and TSX style attributes for var(--xxx) usages:
 * Every referenced CSS token must resolve to:
 * 1. Global token set defined in design-system/tokens.css
 * 2. Local scope / file definition
 * 3. Runtime-token registry (RUNTIME_CSS_VARIABLE_REGISTRY)
 */
export function checkRuleC_UndefinedCssTokens(
    cssFiles: { file: string; content: string }[],
    tokensCssContent: string,
    tsxFiles: { file: string; content: string }[] = [],
): OwnershipViolation[] {
    const violations: OwnershipViolation[] = [];

    const globalTokens = new Set<string>();
    const cleanTokensCss = stripCssComments(tokensCssContent);
    const globalTokenMatches = cleanTokensCss.matchAll(
        /--([a-zA-Z0-9_-]+)\s*:/g,
    );
    for (const match of globalTokenMatches) {
        globalTokens.add(`--${match[1]}`);
    }

    const allCssTokens = new Set<string>(globalTokens);

    for (const { file, content } of cssFiles) {
        const normPath = file.replaceAll("\\", "/");
        const cleanContent = stripCssComments(content);

        const localTokens = new Set<string>();
        const localMatches = cleanContent.matchAll(/--([a-zA-Z0-9_-]+)\s*:/g);
        for (const match of localMatches) {
            const name = `--${match[1]}`;
            localTokens.add(name);
            allCssTokens.add(name);
        }

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

    for (const { file, content } of tsxFiles) {
        const normPath = file.replaceAll("\\", "/");
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
                node.name.getText(source) !== "style" || !node.initializer
            ) return;
            visitNodes(node.initializer, (lit) => {
                if (!ts.isStringLiteralLike(lit)) return;
                const varRegex = /var\(\s*--([a-zA-Z0-9_-]+)/g;
                let varMatch: RegExpExecArray | null;
                while ((varMatch = varRegex.exec(lit.text)) !== null) {
                    const varName = `--${varMatch[1]}`;
                    if (
                        !allCssTokens.has(varName) &&
                        !RUNTIME_CSS_VARIABLE_REGISTRY[varName]
                    ) {
                        const { line, character } = source
                            .getLineAndCharacterOfPosition(
                                lit.getStart(source),
                            );
                        violations.push({
                            rule: "undefined-css-token",
                            file: normPath,
                            line: line + 1,
                            column: character + 1,
                            message:
                                `CSS variable '${varName}' in TSX style is not defined in tokens.css, CSS scope, or runtime-token registry.`,
                            snippet: `var(${varName})`,
                        });
                    }
                }
            });
        });
    }

    return violations;
}

/**
 * Rule: native-destructive-confirm
 *
 * Native confirm(...) / globalThis.confirm(...) / window.confirm(...)
 * is forbidden in UI code; use accessible AlertDialog instead.
 */
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

/** Choice controls come from components/ui (Checkbox, RadioGroup, Switch, Slider), never a native input. */
const NATIVE_CHOICE_TYPES: Record<string, true> = {
    checkbox: true,
    radio: true,
    range: true,
};

/** Primitives own their markup; rendered Markdown task lists are document content, not UI controls. */
function isNativeFormControlOwner(file: string): boolean {
    const path = file.replaceAll("\\", "/");
    return path.includes("/components/ui/") ||
        path.endsWith("/components/searcher/NoteMarkdown.tsx");
}

/**
 * Rule: native-form-control
 *
 * Prevents raw <input type="checkbox|radio|range"> outside components/ui/ and NoteMarkdown.tsx.
 */
export function checkNativeFormControl(
    file: string,
    content: string,
): OwnershipViolation[] {
    if (isTestFile(file) || !file.endsWith(".tsx")) return [];
    if (isNativeFormControlOwner(file)) return [];

    const source = ts.createSourceFile(
        file,
        content,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
    );
    const violations: OwnershipViolation[] = [];

    visitNodes(source, (node) => {
        if (!ts.isJsxAttribute(node)) return;
        if (node.name.getText(source) !== "type") return;
        const element = node.parent.parent;
        if (
            (ts.isJsxOpeningElement(element) ||
                ts.isJsxSelfClosingElement(element)) &&
            element.tagName.getText(source) === "input" &&
            node.initializer && ts.isStringLiteral(node.initializer) &&
            Object.hasOwn(NATIVE_CHOICE_TYPES, node.initializer.text)
        ) {
            const { line, character } = source.getLineAndCharacterOfPosition(
                node.getStart(source),
            );
            violations.push({
                rule: "native-form-control",
                file: file.replaceAll("\\", "/"),
                line: line + 1,
                column: character + 1,
                message:
                    `Native <input type="${node.initializer.text}"> is forbidden; use components/ui primitives.`,
                snippet: `<input type="${node.initializer.text}" />`,
            });
        }
    });

    return violations;
}

export async function scanOwnership(
    targetDir: string,
    baseDir = targetDir,
): Promise<OwnershipCheckResult> {
    const violations: OwnershipViolation[] = [];
    const cssFiles: { file: string; content: string }[] = [];
    const tsxFiles: { file: string; content: string }[] = [];
    let tokensCssContent = "";
    let totalFilesScanned = 0;

    // Try loading tokens.css from known locations relative to baseDir or targetDir
    for (
        const candidate of [
            join(baseDir, "web/src/design-system/tokens.css"),
            join(targetDir, "design-system/tokens.css"),
            join(targetDir, "tokens.css"),
        ]
    ) {
        try {
            tokensCssContent = await Deno.readTextFile(candidate);
            if (tokensCssContent.length > 0) break;
        } catch {
            // Ignore missing candidate
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
        if (isTestFile(entry.path)) continue;

        totalFilesScanned++;
        const relPath = relative(baseDir, entry.path).replaceAll("\\", "/");
        const content = await Deno.readTextFile(entry.path);
        const normPath = entry.path.replaceAll("\\", "/");

        if (normPath.endsWith(".css")) {
            cssFiles.push({ file: relPath, content });
        } else if (normPath.endsWith(".tsx")) {
            tsxFiles.push({ file: relPath, content });
            violations.push(...checkRuleD_NativeConfirm(relPath, content));
            violations.push(...checkNativeFormControl(relPath, content));
        } else if (normPath.endsWith(".ts")) {
            violations.push(...checkRuleD_NativeConfirm(relPath, content));
        }
    }

    if (tokensCssContent.length > 0 || cssFiles.length > 0) {
        violations.push(
            ...checkRuleC_UndefinedCssTokens(
                cssFiles,
                tokensCssContent,
                tsxFiles,
            ),
        );
    }

    violations.sort((a, b) => {
        const fileCmp = a.file.localeCompare(b.file);
        if (fileCmp !== 0) return fileCmp;
        if (a.line !== b.line) return a.line - b.line;
        return a.column - b.column;
    });

    const byRule: Record<OwnershipRuleId, OwnershipViolation[]> = {
        "undefined-css-token": [],
        "native-destructive-confirm": [],
        "native-form-control": [],
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

export function formatOwnershipReport(result: OwnershipCheckResult): string {
    const lines: string[] = [];
    lines.push("============================================================");
    lines.push("Searcher UI Guard - Hygiene Verification");
    lines.push("============================================================");
    lines.push(`Total scanned files: ${result.totalFilesScanned}`);
    lines.push(`Total violations:    ${result.violations.length}`);
    lines.push(
        `  undefined-css-token:        ${
            result.byRule["undefined-css-token"].length
        }`,
    );
    lines.push(
        `  native-destructive-confirm: ${
            result.byRule["native-destructive-confirm"].length
        }`,
    );
    lines.push(
        `  native-form-control:        ${
            result.byRule["native-form-control"].length
        }`,
    );
    lines.push("------------------------------------------------------------");

    if (result.violations.length > 0) {
        lines.push("\n[FAIL] UI HYGIENE VIOLATIONS DETECTED:\n");
        for (const v of result.violations) {
            lines.push(`  [${v.rule}] ${v.file}:${v.line}:${v.column}`);
            lines.push(`    ${v.message}`);
            lines.push(`    Snippet: ${v.snippet}\n`);
        }
        lines.push(
            "============================================================",
        );
    } else {
        lines.push("\n[PASS] All UI hygiene checks passed.");
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
