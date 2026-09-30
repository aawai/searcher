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
    return v.includes("var(--shadow") || v.includes("var(--card-shadow)") ||
        v.includes("var(--accent-glow)");
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
