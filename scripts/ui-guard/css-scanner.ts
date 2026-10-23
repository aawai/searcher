import type { UiViolation } from "./types.ts";
import { isDesignSystemAllowed } from "./exceptions.ts";
import {
    checkFontSize,
    checkRadius,
    isFontTokenName,
    isRadiusTokenName,
    isRegisteredAccentFill,
    type VisualRegistry,
} from "./registry.ts";

const CSS_SPACING_PROPS: Record<string, true> = {
    margin: true,
    "margin-top": true,
    "margin-bottom": true,
    "margin-left": true,
    "margin-right": true,
    "margin-inline": true,
    "margin-block": true,
    padding: true,
    "padding-top": true,
    "padding-bottom": true,
    "padding-left": true,
    "padding-right": true,
    "padding-inline": true,
    "padding-block": true,
    gap: true,
    "row-gap": true,
    "column-gap": true,
};

const CSS_RADIUS_PROPS: Record<string, true> = {
    "border-radius": true,
    "border-top-left-radius": true,
    "border-top-right-radius": true,
    "border-bottom-left-radius": true,
    "border-bottom-right-radius": true,
};

function normalizeSnippet(s: string): string {
    return s.replaceAll(/\s+/g, " ").trim();
}

function isAllowedCssShadow(value: string): boolean {
    const v = value.trim();
    if (v === "none" || v === "inherit" || v === "initial" || v === "unset") {
        return true;
    }
    return v.includes("var(--shadow");
}

const ACCENT_FILL_PROPS: Record<string, true> = {
    background: true,
    "background-color": true,
    "background-image": true,
    fill: true,
};

/** `--accent`, `--accent-hover` and `--accent-active`; tints such as `--accent-soft` are not fills. */
const ACCENT_FAMILY_FILL = /var\(\s*--accent(?:-hover|-active)?\s*\)/;
export function isResponsiveCssMetric(value: string): boolean {
    const v = value.trim();
    if (v.includes("env(safe-area-inset-")) {
        return true;
    }
    if (
        v.startsWith("clamp(") ||
        v.startsWith("min(") ||
        v.startsWith("max(") ||
        v.startsWith("calc(")
    ) {
        return (
            v.includes("vw") ||
            v.includes("vh") ||
            v.includes("dvh") ||
            v.includes("dvw") ||
            v.includes("cq") ||
            v.includes("env(") ||
            v.includes("var(--") ||
            v.includes("%")
        );
    }
    return false;
}

function isAllowedCssSpacing(value: string): boolean {
    const v = value.trim();
    if (v === "inherit" || v === "initial" || v === "unset") {
        return true;
    }
    if (isResponsiveCssMetric(v)) {
        return true;
    }
    const parts = v.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return true;
    return parts.every((p) => {
        if (p === "0" || p === "0px" || p === "auto") {
            return true;
        }
        if (isResponsiveCssMetric(p)) {
            return true;
        }
        return p.includes("var(--space-") || p.includes("var(--layout-");
    });
}

/**
 * Parses CSS code and extracts violations according to documented visual guard rules.
 */
export function scanCssCode(
    file: string,
    cssText: string,
    registry: VisualRegistry,
): UiViolation[] {
    const violations: UiViolation[] = [];

    // Replace comment bodies with spaces so line numbers and offsets are preserved
    let inComment = false;
    const chars = Array.from(cssText);
    for (let i = 0; i < chars.length; i++) {
        if (!inComment && chars[i] === "/" && chars[i + 1] === "*") {
            inComment = true;
            chars[i] = " ";
            chars[i + 1] = " ";
            i++;
            continue;
        }
        if (inComment && chars[i] === "*" && chars[i + 1] === "/") {
            inComment = false;
            chars[i] = " ";
            chars[i + 1] = " ";
            i++;
            continue;
        }
        if (inComment) {
            if (chars[i] !== "\n") {
                chars[i] = " ";
            }
        }
    }
    const cleanCss = chars.join("");

    // Calculate line starts for line/column lookup
    const lineStarts: number[] = [0];
    for (let i = 0; i < cleanCss.length; i++) {
        if (cleanCss[i] === "\n") {
            lineStarts.push(i + 1);
        }
    }

    function getLineAndCol(pos: number): { line: number; col: number } {
        let low = 0;
        let high = lineStarts.length - 1;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (lineStarts[mid] <= pos) {
                if (
                    mid === lineStarts.length - 1 || lineStarts[mid + 1] > pos
                ) {
                    return { line: mid + 1, col: pos - lineStarts[mid] + 1 };
                }
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return { line: 1, col: pos + 1 };
    }

    // Parse blocks and declarations, tracking the enclosing rule prelude
    let depth = 0;
    let declStart = -1;
    let preludeStart = 0;
    const preludes: string[] = [];

    // The innermost style-rule selector; at-rules such as @media do not count.
    function currentSelector(): string {
        for (let i = preludes.length - 1; i >= 0; i--) {
            if (!preludes[i].startsWith("@")) return preludes[i];
        }
        return "";
    }

    for (let i = 0; i < cleanCss.length; i++) {
        const ch = cleanCss[i];

        if (ch === "{") {
            preludes.push(
                normalizeSnippet(cleanCss.slice(preludeStart, i)),
            );
            preludeStart = i + 1;
            depth++;
            declStart = i + 1;
        } else if (ch === "}") {
            if (declStart !== -1 && declStart < i) {
                processDeclaration(
                    cleanCss.slice(declStart, i),
                    declStart,
                    currentSelector(),
                );
            }
            preludes.pop();
            preludeStart = i + 1;
            depth--;
            declStart = -1;
        } else if (ch === ";") {
            if (depth > 0) {
                if (declStart !== -1 && declStart < i) {
                    processDeclaration(
                        cleanCss.slice(declStart, i),
                        declStart,
                        currentSelector(),
                    );
                }
                declStart = i + 1;
            }
            preludeStart = i + 1;
        }
    }

    function processDeclaration(
        rawDecl: string,
        offset: number,
        selector: string,
    ) {
        const colonIdx = rawDecl.indexOf(":");
        if (colonIdx === -1) {
            return;
        }

        const prop = rawDecl.slice(0, colonIdx).trim().toLowerCase();
        const value = rawDecl.slice(colonIdx + 1).trim();

        if (!prop || !value) {
            return;
        }

        const { line, col } = getLineAndCol(offset + rawDecl.indexOf(prop));

        function pushViolation(
            rule: UiViolation["rule"],
            property: string,
            text: string,
        ) {
            const snippet = normalizeSnippet(text);
            violations.push({
                file,
                rule,
                property,
                value: snippet,
                line,
                column: col,
                fingerprint: `${rule}:${property}:${snippet}`,
            });
        }

        // Font-size and radius Tokens must be registered wherever they are defined,
        // including tokens.css and feature-local aliases.
        if (prop.startsWith("--")) {
            if (
                (isFontTokenName(prop) && !registry.fontTokens.has(prop)) ||
                (isRadiusTokenName(prop) && !registry.radiusTokens.has(prop))
            ) {
                pushViolation(
                    "unregistered-token-definition",
                    prop,
                    `${prop}: ${value}`,
                );
            }
            if (isDesignSystemAllowed(file, prop, value)) {
                return;
            }
        }

        // Accent fills are limited to the semantics registered in Visual Language.
        if (
            ACCENT_FILL_PROPS[prop] && ACCENT_FAMILY_FILL.test(value)
        ) {
            if (!isRegisteredAccentFill(file, selector, registry)) {
                pushViolation(
                    "unregistered-accent-fill",
                    prop,
                    `${selector} { ${prop}: ${value} }`,
                );
            }
            return;
        }

        // Documented rules: check design-system permissions
        if (isDesignSystemAllowed(file, prop, value)) {
            return;
        }
        // Numeric z-index values must use an elevation token. Runtime token expressions
        // and `auto` remain valid because they do not encode a local static layer.
        if (prop === "z-index") {
            if (
                /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?(?:\s*!important)?$/i
                    .test(value)
            ) {
                const snippet = normalizeSnippet(`${prop}: ${value}`);
                violations.push({
                    file,
                    rule: "raw-z-index",
                    property: prop,
                    value: snippet,
                    line,
                    column: col,
                    fingerprint: `raw-z-index:${prop}:${snippet}`,
                });
            }
            return;
        }

        // Check raw box-shadow
        if (prop === "box-shadow") {
            if (!isAllowedCssShadow(value)) {
                const snippet = normalizeSnippet(`${prop}: ${value}`);
                violations.push({
                    file,
                    rule: "raw-box-shadow",
                    property: prop,
                    value: snippet,
                    line,
                    column: col,
                    fingerprint: `raw-box-shadow:${prop}:${snippet}`,
                });
            }
            return;
        }

        // font-size: only registered Tokens or relative keywords
        if (prop === "font-size") {
            const verdict = checkFontSize(value, registry);
            if (verdict !== "ok") {
                pushViolation(
                    verdict === "raw"
                        ? "raw-font-size"
                        : "unregistered-font-token",
                    prop,
                    `${prop}: ${value}`,
                );
            }
            return;
        }

        // border-radius: only registered Tokens, keywords or Token insets
        if (CSS_RADIUS_PROPS[prop]) {
            const verdict = checkRadius(value, registry);
            if (verdict !== "ok") {
                pushViolation(
                    verdict === "raw"
                        ? "raw-border-radius"
                        : "unregistered-radius-token",
                    prop,
                    `${prop}: ${value}`,
                );
            }
            return;
        }

        // Check raw spacing literals
        if (CSS_SPACING_PROPS[prop]) {
            if (!isAllowedCssSpacing(value)) {
                const snippet = normalizeSnippet(`${prop}: ${value}`);
                violations.push({
                    file,
                    rule: "raw-spacing-literal",
                    property: prop,
                    value: snippet,
                    line,
                    column: col,
                    fingerprint: `raw-spacing-literal:${prop}:${snippet}`,
                });
            }
            return;
        }
    }

    return violations;
}
