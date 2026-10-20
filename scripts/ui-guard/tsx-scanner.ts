import ts from "typescript";
import type { UiViolation } from "./types.ts";
import {
    isDesignSystemAllowed,
    isDomainValueException,
    isDragTransformException,
    isMasonryGeometryException,
    isPrimitiveOwningGeometry,
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

function isAllowedFontSize(value: string): boolean {
    const v = value.trim();
    if (
        v === "inherit" || v === "'inherit'" || v === '"inherit"' ||
        v === "1em" || v === "100%"
    ) {
        return true;
    }
    return v.includes("var(--font-");
}

function isAllowedRadius(value: string): boolean {
    const v = value.trim();
    if (
        v === "0" || v === "'0'" || v === '"0"' ||
        v === "'0px'" || v === '"0px"' ||
        v === "999px" || v === "'999px'" || v === '"999px"' ||
        v === "9999px" || v === "'9999px'" || v === '"9999px"' ||
        v === "50%" || v === "'50%'" || v === '"50%"' ||
        v === "inherit" || v === "'inherit'" || v === '"inherit"'
    ) {
        return true;
    }
    return v.includes("var(--radius") || v.includes("var(--control-radius)") ||
        v.includes("var(--search-radius)");
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

function checkTailwindClass(
    cls: string,
    file: string,
    line: number,
    col: number,
): UiViolation | null {
    // Arbitrary box shadow: shadow-[...]
    if (/^shadow-\[.+\]$/.test(cls)) {
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
    if (/^text-\[[0-9]+(?:\.[0-9]+)?(?:px|rem|em|pt)\]$/.test(cls)) {
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
    if (/^rounded(?:-[trblse])?-\[[0-9]+(?:\.[0-9]+)?(?:px|rem)\]$/.test(cls)) {
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
        /^(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-\[[0-9]+(?:\.[0-9]+)?(?:px|rem)\]$/
            .test(cls)
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
    if (/^(?:[^:]+:)*-?z-\d+$/.test(cls)) {
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
    if (/^(?:bg|text|border|ring|outline)-\[(?:#|rgb|hsl).+\]$/.test(cls)) {
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

export function scanTsxCode(file: string, code: string): UiViolation[] {
    const sourceFile = ts.createSourceFile(
        file,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
    );

    const violations: UiViolation[] = [];

    function visit(node: ts.Node) {
        if (ts.isJsxAttribute(node)) {
            const attrName = node.name.getText(sourceFile);
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
                if (init) {
                    let rawClasses = "";
                    if (ts.isStringLiteral(init)) {
                        rawClasses = init.text;
                    } else if (ts.isJsxExpression(init) && init.expression) {
                        const expr = init.expression;
                        if (
                            ts.isStringLiteral(expr) ||
                            ts.isNoSubstitutionTemplateLiteral(expr)
                        ) {
                            rawClasses = expr.text;
                        } else if (ts.isTemplateExpression(expr)) {
                            rawClasses = expr.head.text +
                                expr.templateSpans.map((s) => s.literal.text)
                                    .join(" ");
                        }
                    }

                    if (rawClasses) {
                        const tokens = rawClasses.split(/\s+/).filter(Boolean);
                        const { line, character } = sourceFile
                            .getLineAndCharacterOfPosition(node.getStart());
                        for (const token of tokens) {
                            const violation = checkTailwindClass(
                                token,
                                file,
                                line + 1,
                                character + 1,
                            );
                            if (violation) {
                                violations.push(violation);
                            }
                        }
                    }
                }
            }

            // 2. Inspect style attribute
            if (attrName === "style") {
                const init = node.initializer;
                if (init && ts.isJsxExpression(init) && init.expression) {
                    let objExpr: ts.ObjectLiteralExpression | null = null;
                    if (ts.isObjectLiteralExpression(init.expression)) {
                        objExpr = init.expression;
                    } else if (
                        ts.isAsExpression(init.expression) &&
                        ts.isObjectLiteralExpression(init.expression.expression)
                    ) {
                        objExpr = init.expression.expression;
                    }

                    if (objExpr) {
                        for (const prop of objExpr.properties) {
                            if (
                                ts.isPropertyAssignment(prop) ||
                                ts.isShorthandPropertyAssignment(prop)
                            ) {
                                const propName = prop.name.getText(sourceFile)
                                    .replaceAll(/^['"`]|['"`]$/g, "");
                                const propValue = ts.isPropertyAssignment(prop)
                                    ? prop.initializer.getText(sourceFile)
                                    : propName;

                                const { line, character } = sourceFile
                                    .getLineAndCharacterOfPosition(
                                        prop.getStart(),
                                    );
                                const posLine = line + 1;
                                const posCol = character + 1;

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
                                    isMasonryGeometryException(
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
                                    if (!isAllowedFontSize(propValue)) {
                                        const snippet = normalizeSnippet(
                                            `${propName}: ${propValue}`,
                                        );
                                        violations.push({
                                            file,
                                            rule: "raw-font-size",
                                            property: propName,
                                            value: snippet,
                                            line: posLine,
                                            column: posCol,
                                            fingerprint:
                                                `raw-font-size:${propName}:${snippet}`,
                                        });
                                    }
                                    continue;
                                }

                                // Check raw border-radius
                                if (RADIUS_PROPS[propName]) {
                                    if (!isAllowedRadius(propValue)) {
                                        const snippet = normalizeSnippet(
                                            `${propName}: ${propValue}`,
                                        );
                                        violations.push({
                                            file,
                                            rule: "raw-border-radius",
                                            property: propName,
                                            value: snippet,
                                            line: posLine,
                                            column: posCol,
                                            fingerprint:
                                                `raw-border-radius:${propName}:${snippet}`,
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
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return violations;
}
