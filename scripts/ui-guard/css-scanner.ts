import type { UiViolation } from "./types.ts";
import { isDesignSystemAllowed } from "./exceptions.ts";

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
    return (
        v.includes("var(--shadow") ||
        v.includes("var(--card-shadow)") ||
        v.includes("var(--accent-glow)")
    );
}

function isAllowedCssFontSize(value: string): boolean {
    const v = value.trim();
    if (
        v === "inherit" ||
        v === "1em" ||
        v === "100%" ||
        v === "initial" ||
        v === "unset"
    ) {
        return true;
    }
    return v.includes("var(--font-");
}

function isAllowedCssRadius(value: string): boolean {
    const v = value.trim();
    if (
        v === "0" ||
        v === "0px" ||
        v === "999px" ||
        v === "9999px" ||
        v === "50%" ||
        v === "inherit" ||
        v === "initial" ||
        v === "unset"
    ) {
        return true;
    }
    return (
        v.includes("var(--radius") ||
        v.includes("var(--control-radius)") ||
        v.includes("var(--search-radius)")
    );
}
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
export function scanCssCode(file: string, cssText: string): UiViolation[] {
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

    // Parse blocks and declarations
    let depth = 0;
    let declStart = -1;

    for (let i = 0; i < cleanCss.length; i++) {
        const ch = cleanCss[i];

        if (ch === "{") {
            depth++;
            declStart = i + 1;
        } else if (ch === "}") {
            if (declStart !== -1 && declStart < i) {
                processDeclaration(cleanCss.slice(declStart, i), declStart);
            }
            depth--;
            declStart = -1;
        } else if (ch === ";" && depth > 0) {
            if (declStart !== -1 && declStart < i) {
                processDeclaration(cleanCss.slice(declStart, i), declStart);
            }
            declStart = i + 1;
        }
    }

    function processDeclaration(rawDecl: string, offset: number) {
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

        // Documented rules: check design-system permissions
        if (isDesignSystemAllowed(file, prop, value)) {
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

        // Check raw font-size
        if (prop === "font-size") {
            if (!isAllowedCssFontSize(value)) {
                const snippet = normalizeSnippet(`${prop}: ${value}`);
                violations.push({
                    file,
                    rule: "raw-font-size",
                    property: prop,
                    value: snippet,
                    line,
                    column: col,
                    fingerprint: `raw-font-size:${prop}:${snippet}`,
                });
            }
            return;
        }

        // Check raw border-radius
        if (CSS_RADIUS_PROPS[prop]) {
            if (!isAllowedCssRadius(value)) {
                const snippet = normalizeSnippet(`${prop}: ${value}`);
                violations.push({
                    file,
                    rule: "raw-border-radius",
                    property: prop,
                    value: snippet,
                    line,
                    column: col,
                    fingerprint: `raw-border-radius:${prop}:${snippet}`,
                });
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
