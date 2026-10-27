import ts from "typescript";
import type { UiViolation } from "./types.ts";
import { checkFontSize, checkRadius, type VisualRegistry } from "./registry.ts";
import { staticExpressions } from "./static-expressions.ts";
import {
    hasDisallowedRawColor,
    isColorSemanticProperty,
    isSvgColorAttribute,
} from "./raw-color.ts";
import {
    isDesignSystemAllowed,
    isDomainValueException,
    isDragTransformException,
    isPrimitiveOwningGeometry,
    isRuntimeLayoutGeometryException,
    isWallpaperFilterException,
} from "./exceptions.ts";

const SPACING_PROPS: Record<string, true> = {
    margin: true,
    marginTop: true,
    marginBottom: true,
    marginLeft: true,
    marginRight: true,
    marginInline: true,
    marginBlock: true,
    padding: true,
    paddingTop: true,
    paddingBottom: true,
    paddingLeft: true,
    paddingRight: true,
    paddingInline: true,
    paddingBlock: true,
    gap: true,
    rowGap: true,
    columnGap: true,
};

const RADIUS_PROPS: Record<string, true> = {
    borderRadius: true,
    borderTopLeftRadius: true,
    borderTopRightRadius: true,
    borderBottomLeftRadius: true,
    borderBottomRightRadius: true,
};

function normalizeSnippet(s: string): string {
    return s.replaceAll(/\s+/g, " ").trim();
}

function isAllowedShadow(value: string): boolean {
    const v = value.trim();
    if (
        v === "none" || v === "'none'" || v === '"none"' || v === "inherit" ||
        v === "initial" || v === "undefined"
    ) {
        return true;
    }
    return v.includes("var(--shadow");
}

function stripQuotes(value: string): string {
    return value.trim().replaceAll(/^['"`]|['"`]$/g, "");
}

function isAllowedSpacing(value: string): boolean {
    const raw = value.replaceAll(/^['"`]|['"`]$/g, "").trim();
    if (raw === "inherit" || raw === "initial" || raw === "unset") {
        return true;
    }
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return true;
    return parts.every((p) => {
        if (p === "0" || p === "0px" || p === "auto") {
            return true;
        }
        return p.includes("var(--space-") || p.includes("var(--layout-");
    });
}

const TAILWIND_PALETTE_COLOR =
    /^(?:bg|text|border|ring|outline|fill|stroke|from|via|to|decoration|accent|caret|divide)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)(?:\/\d+)?$/;

function splitTailwindVariants(
    cls: string,
): { variants: string[]; base: string } {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < cls.length; i++) {
        const ch = cls[i];
        if (ch === "[" || ch === "(") depth++;
        else if (ch === "]" || ch === ")") depth = Math.max(0, depth - 1);
        else if (ch === ":" && depth === 0) {
            parts.push(cls.slice(start, i));
            start = i + 1;
        }
    }
    const rawBase = cls.slice(start);
    const base = rawBase.replace(/^!+|!+$/g, "");
    return { variants: parts, base };
}

function isUnregisteredResponsiveVariant(
    variant: string,
    registry: VisualRegistry,
): boolean {
    if (/^(?:[23]?xs|sm|md|lg|[2-9]?xl)$/.test(variant)) {
        return !registry.tailwindBreakpoints.has(variant);
    }
    return /^(?:max-(?:[23]?xs|sm|md|lg|[23]?xl|\[.+\])|min-\[.+\]|@[a-z0-9[\]-]+)$/
        .test(variant);
}

function isUnregisteredTailwindVisualBase(
    base: string,
    registry: VisualRegistry,
): boolean {
    if (registry.tailwindVisualUtilities.has(base)) {
        return false;
    }

    // 1. Typography: default font-size scale, arbitrary font-size tokens, line-height, tracking, weight/family
    if (/^text-(?:[23]?xs|sm|base|lg|[2-9]?xl)(?:\/.+)?$/.test(base)) {
        return true;
    }
    if (base.startsWith("text-[") && base.endsWith("]")) {
        const inner = base.slice("text-[".length, -1).trim();
        if (
            inner.startsWith("length:") || inner.startsWith("fontsize:") ||
            /^var\(\s*--font-/.test(inner)
        ) {
            return true;
        }
    }
    if (
        /^leading-(?:none|tight|snug|normal|relaxed|loose|\d+(?:\.\d+)?|\[.+\])$/
            .test(base)
    ) {
        return true;
    }
    if (
        /^-?tracking-(?:tighter|tight|normal|wide|wider|widest|\[.+\])$/.test(
            base,
        )
    ) {
        return true;
    }
    if (
        /^font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|serif|stretch-[a-z0-9%-]+|\[.+\])$/
            .test(base)
    ) {
        return true;
    }

    // 2. Spacing: padding, margin, gap, space-x/y (excluding *-auto alignment keywords)
    if (
        /^-?(?:p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y)-(?:px|\d+(?:\.\d+)?|\[.+\])$/
            .test(base)
    ) {
        return true;
    }

    // 3. Border radius: rounded and rounded-*
    if (/^rounded(?:-[a-z0-9]+)*(?:-\[.+\])?$/.test(base)) {
        return true;
    }

    // 4. Shadows & elevation
    if (
        /^(?:shadow|shadow-[a-z0-9-]+|inset-shadow(?:-[a-z0-9-]+|-\[.+\])?|drop-shadow(?:-[a-z0-9-]+|-\[.+\])?)$/
            .test(base)
    ) {
        return true;
    }
    if (/^-?z-/.test(base)) {
        if (
            base === "z-auto" ||
            /^z-\[var\(--elevation-[a-z0-9-]+\)\]$/.test(base)
        ) {
            return false;
        }
        return true;
    }

    // 5. Sizing & icon scale: unregistered icon-*, numeric spacing multipliers (> 0), named max-w-* scale, arbitrary size literals
    if (/^icon-(?:[23]?xs|sm|md|lg|[2-9]?xl|\d+|\[.+\])$/.test(base)) {
        return true;
    }
    const numericSize = /^(?:w|h|size|min-w|min-h|max-w|max-h)-(\d+(?:\.\d+)?)$/
        .exec(base);
    if (numericSize && Number(numericSize[1]) !== 0) {
        return true;
    }
    if (
        /^(?:min-w|max-w|w)-(?:[23]?xs|sm|md|lg|[2-7]?xl|prose|screen-[a-z0-9-]+)$/
            .test(base)
    ) {
        return true;
    }
    if (/^(?:w|h|size|min-w|min-h|max-w|max-h)-\[.+\]$/.test(base)) {
        return true;
    }

    // 6. Default Tailwind color palette scale (e.g. bg-red-500, text-slate-400)
    if (TAILWIND_PALETTE_COLOR.test(base)) {
        return true;
    }

    return false;
}

function checkTailwindClass(
    cls: string,
    file: string,
    line: number,
    col: number,
    registry: VisualRegistry,
): UiViolation | null {
    const { variants, base } = splitTailwindVariants(cls);

    // Arbitrary box shadow: shadow-[...]
    if (/^shadow-\[.+\]$/.test(base)) {
        return {
            file,
            rule: "raw-box-shadow",
            property: "className",
            value: cls,
            line,
            column: col,
            fingerprint: `raw-box-shadow:className:${cls}`,
        };
    }

    // Arbitrary font size: text-[14px], text-[0.875rem]
    if (/^text-\[[0-9]+(?:\.[0-9]+)?(?:px|rem|em|pt)\]$/.test(base)) {
        return {
            file,
            rule: "raw-font-size",
            property: "className",
            value: cls,
            line,
            column: col,
            fingerprint: `raw-font-size:className:${cls}`,
        };
    }

    // Arbitrary border radius: rounded-[10px], rounded-t-[8px]
    if (
        /^rounded(?:-[trblse]{1,2})?-\[[0-9]+(?:\.[0-9]+)?(?:px|rem)\]$/.test(
            base,
        )
    ) {
        return {
            file,
            rule: "raw-border-radius",
            property: "className",
            value: cls,
            line,
            column: col,
            fingerprint: `raw-border-radius:className:${cls}`,
        };
    }

    // Arbitrary spacing: p-[14px], mt-[18px], gap-[12px]
    if (
        /^-?(?:p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y)-\[[0-9]+(?:\.[0-9]+)?(?:px|rem)\]$/
            .test(base)
    ) {
        return {
            file,
            rule: "raw-spacing-literal",
            property: "className",
            value: cls,
            line,
            column: col,
            fingerprint: `raw-spacing-literal:className:${cls}`,
        };
    }
    // Static Tailwind stacking levels, including variants and negative utilities.
    if (/^-?z-(?:\d+|\[\d+\])$/.test(base)) {
        return {
            file,
            rule: "raw-z-index",
            property: "className",
            value: cls,
            line,
            column: col,
            fingerprint: `raw-z-index:className:${cls}`,
        };
    }

    // Arbitrary color/visual classes: bg-[#...], text-[#...], border-[#...]
    if (/^(?:bg|text|border|ring|outline)-\[(?:#|rgb|hsl).+\]$/.test(base)) {
        return {
            file,
            rule: "arbitrary-tailwind",
            property: "className",
            value: cls,
            line,
            column: col,
            fingerprint: `arbitrary-tailwind:className:${cls}`,
        };
    }

    // Accent fills as Tailwind utilities: bg-primary, fill-accent/50, data-[checked]:bg-accent.
    // A utility cannot be registered by CSS selector, so it is always rejected.
    if (
        /^(?:bg|fill|from|via|to)-(?:primary|accent)(?:\/\d+)?$/
            .test(base)
    ) {
        return {
            file,
            rule: "unregistered-accent-fill",
            property: "className",
            value: cls,
            line,
            column: col,
            fingerprint: `unregistered-accent-fill:className:${cls}`,
        };
    }

    if (
        variants.some((variant) =>
            isUnregisteredResponsiveVariant(variant, registry)
        ) ||
        isUnregisteredTailwindVisualBase(base, registry)
    ) {
        return {
            file,
            rule: "unregistered-tailwind-visual",
            property: "className",
            value: cls,
            line,
            column: col,
            fingerprint: `unregistered-tailwind-visual:className:${cls}`,
        };
    }

    return null;
}

function numericIconSizes(expression: ts.Expression): string[] {
    if (ts.isNumericLiteral(expression)) return [expression.text];
    if (ts.isStringLiteral(expression)) {
        return /^-?\d+(?:\.\d+)?(?:px)?$/.test(expression.text)
            ? [expression.text]
            : [];
    }
    if (
        ts.isParenthesizedExpression(expression) ||
        ts.isAsExpression(expression)
    ) {
        return numericIconSizes(expression.expression);
    }
    if (
        ts.isPrefixUnaryExpression(expression) &&
        ts.isNumericLiteral(expression.operand)
    ) {
        return [expression.getText()];
    }
    if (ts.isConditionalExpression(expression)) {
        return [
            ...numericIconSizes(expression.whenTrue),
            ...numericIconSizes(expression.whenFalse),
        ];
    }
    return [];
}

function geometryCssVariables(expression: ts.Expression): string[] {
    if (ts.isStringLiteralLike(expression)) {
        return expression.text.includes("var(") ? [expression.text] : [];
    }
    if (
        ts.isParenthesizedExpression(expression) ||
        ts.isAsExpression(expression)
    ) {
        return geometryCssVariables(expression.expression);
    }
    if (ts.isConditionalExpression(expression)) {
        return [
            ...geometryCssVariables(expression.whenTrue),
            ...geometryCssVariables(expression.whenFalse),
        ];
    }
    return [];
}

export function scanTsxCode(
    file: string,
    code: string,
    registry: VisualRegistry,
): UiViolation[] {
    const sourceFile = ts.createSourceFile(
        file,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
    );

    const violations: UiViolation[] = [];
    const expressions = staticExpressions(sourceFile);

    function checkColorString(property: string, value: ts.StringLiteralLike) {
        if (!hasDisallowedRawColor(file, property, value.text)) return;
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(
            value.getStart(),
        );
        const snippet = normalizeSnippet(
            `${property}: ${value.getText(sourceFile)}`,
        );
        violations.push({
            file,
            rule: "raw-color",
            property,
            value: snippet,
            line: line + 1,
            column: character + 1,
            fingerprint: `raw-color:${property}:${snippet}`,
        });
    }

    function visit(node: ts.Node) {
        if (
            file !== "web/src/design-system/breakpoints.ts" &&
            (ts.isStringLiteral(node) ||
                ts.isNoSubstitutionTemplateLiteral(node)) &&
            /\([^()]*\b(?:min-|max-)?width\s*(?::|[<>=])\s*\d/.test(node.text)
        ) {
            const { line, character } = sourceFile
                .getLineAndCharacterOfPosition(node.getStart());
            violations.push({
                file,
                rule: "scattered-media-query",
                property: "media-query",
                value: node.text,
                line: line + 1,
                column: character + 1,
                fingerprint: `scattered-media-query:media-query:${node.text}`,
            });
        }
        if (ts.isJsxAttribute(node)) {
            const attrName = node.name.getText(sourceFile);
            const element = node.parent.parent;
            if (
                (ts.isJsxOpeningElement(element) ||
                    ts.isJsxSelfClosingElement(element)) &&
                isSvgColorAttribute(
                    attrName,
                    element.tagName.getText(sourceFile),
                )
            ) {
                const initializer = node.initializer;
                const expression =
                    initializer && ts.isJsxExpression(initializer)
                        ? initializer.expression
                        : initializer;
                if (expression) {
                    for (const color of expressions.stringValues(expression)) {
                        checkColorString(attrName, color);
                    }
                }
            }
            if (["size", "width", "height"].includes(attrName)) {
                const element = node.parent.parent;
                if (
                    ts.isJsxOpeningElement(element) ||
                    ts.isJsxSelfClosingElement(element)
                ) {
                    const tag = element.tagName.getText(sourceFile);
                    const initializer = node.initializer;
                    const expression =
                        initializer && ts.isJsxExpression(initializer)
                            ? initializer.expression
                            : initializer;
                    if ((/^[A-Z]/.test(tag) || tag === "svg") && expression) {
                        for (const value of geometryCssVariables(expression)) {
                            const { line, character } = sourceFile
                                .getLineAndCharacterOfPosition(node.getStart());
                            violations.push({
                                file,
                                rule: "svg-attribute-css-variable",
                                property: attrName,
                                value,
                                line: line + 1,
                                column: character + 1,
                                fingerprint:
                                    `svg-attribute-css-variable:${attrName}:${value}`,
                            });
                        }
                    }
                    // Component size props are icon geometry; native input.size is character count.
                    if (
                        attrName === "size" && /^[A-Z]/.test(tag) && expression
                    ) {
                        for (const value of numericIconSizes(expression)) {
                            if (
                                [14, 16, 20].includes(Number.parseFloat(value))
                            ) continue;
                            const { line, character } = sourceFile
                                .getLineAndCharacterOfPosition(node.getStart());
                            violations.push({
                                file,
                                rule: "nonstandard-icon-size",
                                property: "size",
                                value,
                                line: line + 1,
                                column: character + 1,
                                fingerprint:
                                    `nonstandard-icon-size:size:${value}`,
                            });
                        }
                    }
                }
            }

            // 1. Inspect className attribute
            if (attrName === "className") {
                const init = node.initializer;
                const expression = init && ts.isJsxExpression(init)
                    ? init.expression
                    : init;
                if (expression) {
                    for (const value of expressions.classes(expression)) {
                        for (const match of value.text.matchAll(/\S+/g)) {
                            const { line, character } = sourceFile
                                .getLineAndCharacterOfPosition(
                                    value.node.getStart() + value.offset +
                                        match.index,
                                );
                            const violation = checkTailwindClass(
                                match[0],
                                file,
                                line + 1,
                                character + 1,
                                registry,
                            );
                            if (violation) violations.push(violation);
                            const { base } = splitTailwindVariants(match[0]);
                            const arbitraryColor =
                                /^(bg|text|border|ring|outline|fill|stroke|from|via|to|decoration|accent|caret|shadow)-\[(.*)\](?:\/\d+)?$/
                                    .exec(base);
                            if (
                                arbitraryColor &&
                                hasDisallowedRawColor(
                                    file,
                                    arbitraryColor[1] === "shadow"
                                        ? "box-shadow"
                                        : "color",
                                    arbitraryColor[2].replaceAll("_", " "),
                                )
                            ) {
                                violations.push({
                                    file,
                                    rule: "raw-color",
                                    property: "className",
                                    value: match[0],
                                    line: line + 1,
                                    column: character + 1,
                                    fingerprint: `raw-color:className:${
                                        match[0]
                                    }`,
                                });
                            }
                        }
                    }
                }
            }

            // 2. Inspect style attribute
            if (attrName === "style") {
                const init = node.initializer;
                if (init && ts.isJsxExpression(init) && init.expression) {
                    for (
                        const { name: propName, value } of expressions.styles(
                            init.expression,
                        )
                    ) {
                        const propValue = value.getText(sourceFile);
                        const { line, character } = sourceFile
                            .getLineAndCharacterOfPosition(value.getStart());
                        const posLine = line + 1;
                        const posCol = character + 1;

                        if (isColorSemanticProperty(propName)) {
                            for (
                                const color of expressions.stringValues(value)
                            ) {
                                checkColorString(propName, color);
                            }
                        }

                        // Runtime z-index expressions and elevation tokens are
                        // allowed; only literal numeric levels are forbidden.
                        if (
                            propName === "zIndex" ||
                            propName === "z-index"
                        ) {
                            if (
                                /^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|["'`][+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?["'`])$/
                                    .test(propValue.trim())
                            ) {
                                const snippet = normalizeSnippet(
                                    `${propName}: ${propValue}`,
                                );
                                violations.push({
                                    file,
                                    rule: "raw-z-index",
                                    property: propName,
                                    value: snippet,
                                    line: posLine,
                                    column: posCol,
                                    fingerprint:
                                        `raw-z-index:${propName}:${snippet}`,
                                });
                            }
                            continue;
                        }
                        // Check runtime exceptions
                        if (
                            isWallpaperFilterException(
                                file,
                                propName,
                                propValue,
                            ) ||
                            isDragTransformException(
                                file,
                                propName,
                                propValue,
                            ) ||
                            isRuntimeLayoutGeometryException(
                                file,
                                propName,
                                propValue,
                            ) ||
                            isDomainValueException(
                                file,
                                propName,
                                propValue,
                            ) ||
                            isPrimitiveOwningGeometry(
                                file,
                                propName,
                                propValue,
                            ) ||
                            isDesignSystemAllowed(
                                file,
                                propName,
                                propValue,
                            )
                        ) {
                            continue;
                        }

                        // Check raw box-shadow
                        if (propName === "boxShadow") {
                            if (!isAllowedShadow(propValue)) {
                                const snippet = normalizeSnippet(
                                    `${propName}: ${propValue}`,
                                );
                                violations.push({
                                    file,
                                    rule: "raw-box-shadow",
                                    property: propName,
                                    value: snippet,
                                    line: posLine,
                                    column: posCol,
                                    fingerprint:
                                        `raw-box-shadow:${propName}:${snippet}`,
                                });
                            }
                            continue;
                        }

                        // Check raw font-size
                        if (propName === "fontSize") {
                            const verdict = checkFontSize(
                                stripQuotes(propValue),
                                registry,
                            );
                            if (verdict !== "ok") {
                                const rule = verdict === "raw"
                                    ? "raw-font-size"
                                    : "unregistered-font-token";
                                const snippet = normalizeSnippet(
                                    `${propName}: ${propValue}`,
                                );
                                violations.push({
                                    file,
                                    rule,
                                    property: propName,
                                    value: snippet,
                                    line: posLine,
                                    column: posCol,
                                    fingerprint:
                                        `${rule}:${propName}:${snippet}`,
                                });
                            }
                            continue;
                        }

                        // Check raw border-radius
                        if (RADIUS_PROPS[propName]) {
                            const verdict = checkRadius(
                                stripQuotes(propValue),
                                registry,
                            );
                            if (verdict !== "ok") {
                                const rule = verdict === "raw"
                                    ? "raw-border-radius"
                                    : "unregistered-radius-token";
                                const snippet = normalizeSnippet(
                                    `${propName}: ${propValue}`,
                                );
                                violations.push({
                                    file,
                                    rule,
                                    property: propName,
                                    value: snippet,
                                    line: posLine,
                                    column: posCol,
                                    fingerprint:
                                        `${rule}:${propName}:${snippet}`,
                                });
                            }
                            continue;
                        }

                        // Check raw spacing literal
                        if (SPACING_PROPS[propName]) {
                            if (!isAllowedSpacing(propValue)) {
                                const snippet = normalizeSnippet(
                                    `${propName}: ${propValue}`,
                                );
                                violations.push({
                                    file,
                                    rule: "raw-spacing-literal",
                                    property: propName,
                                    value: snippet,
                                    line: posLine,
                                    column: posCol,
                                    fingerprint:
                                        `raw-spacing-literal:${propName}:${snippet}`,
                                });
                            }
                            continue;
                        }

                        // Any remaining unexcepted inline style property is an inline-visual-style violation
                        const snippet = normalizeSnippet(
                            `${propName}: ${propValue}`,
                        );
                        violations.push({
                            file,
                            rule: "inline-visual-style",
                            property: propName,
                            value: snippet,
                            line: posLine,
                            column: posCol,
                            fingerprint:
                                `inline-visual-style:${propName}:${snippet}`,
                        });
                    }
                }
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    // Shared constants can be reached from multiple attributes or branches.
    // Keep distinct source occurrences, but report each source/rule only once.
    const seen = new Set<string>();
    return violations.filter((violation) => {
        const key = JSON.stringify([
            violation.rule,
            violation.property,
            violation.line,
            violation.column,
            violation.value,
        ]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
