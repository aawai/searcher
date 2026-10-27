export type RawColorKind = "hex" | "function" | "named";

export interface RawColorMatch {
    kind: RawColorKind;
    token: string;
    index: number;
}

const COLOR_SEMANTIC_PROPS: Record<string, true> = {
    color: true,
    background: true,
    "background-color": true,
    "background-image": true,
    border: true,
    "border-color": true,
    "border-top": true,
    "border-right": true,
    "border-bottom": true,
    "border-left": true,
    "border-top-color": true,
    "border-right-color": true,
    "border-bottom-color": true,
    "border-left-color": true,
    "border-block": true,
    "border-block-start": true,
    "border-block-end": true,
    "border-block-color": true,
    "border-block-start-color": true,
    "border-block-end-color": true,
    "border-inline": true,
    "border-inline-start": true,
    "border-inline-end": true,
    "border-inline-color": true,
    "border-inline-start-color": true,
    "border-inline-end-color": true,
    "border-image": true,
    "border-image-source": true,
    outline: true,
    "outline-color": true,
    "box-shadow": true,
    "text-shadow": true,
    "text-decoration": true,
    "text-decoration-color": true,
    "text-emphasis": true,
    "text-emphasis-color": true,
    "-webkit-text-emphasis": true,
    "-webkit-text-emphasis-color": true,
    "text-fill-color": true,
    "-webkit-text-fill-color": true,
    "text-stroke": true,
    "-webkit-text-stroke": true,
    "text-stroke-color": true,
    "-webkit-text-stroke-color": true,
    "column-rule": true,
    "column-rule-color": true,
    "caret-color": true,
    "accent-color": true,
    "scrollbar-color": true,
    fill: true,
    stroke: true,
    "stop-color": true,
    "flood-color": true,
    "lighting-color": true,
    filter: true,
    "-webkit-filter": true,
    "backdrop-filter": true,
    "-webkit-backdrop-filter": true,
    mask: true,
    "mask-image": true,
    "-webkit-mask": true,
    "-webkit-mask-image": true,
    "list-style-image": true,
};

const SVG_COLOR_ATTRIBUTES: Record<string, true> = {
    fill: true,
    stroke: true,
    color: true,
    stopColor: true,
    "stop-color": true,
    floodColor: true,
    "flood-color": true,
    lightingColor: true,
    "lighting-color": true,
};

const RAW_COLOR_FUNCTIONS: Record<string, true> = {
    rgb: true,
    rgba: true,
    hsl: true,
    hsla: true,
    hwb: true,
    lab: true,
    lch: true,
    oklab: true,
    oklch: true,
    color: true,
    "device-cmyk": true,
};

/**
 * Standard CSS Color 4 named colors (excluding `transparent` and `currentcolor`,
 * which are semantic keywords allowed by the Visual Language contract).
 */
const CSS_NAMED_COLORS: Record<string, true> = {
    aliceblue: true,
    antiquewhite: true,
    aqua: true,
    aquamarine: true,
    azure: true,
    beige: true,
    bisque: true,
    black: true,
    blanchedalmond: true,
    blue: true,
    blueviolet: true,
    brown: true,
    burlywood: true,
    cadetblue: true,
    chartreuse: true,
    chocolate: true,
    coral: true,
    cornflowerblue: true,
    cornsilk: true,
    crimson: true,
    cyan: true,
    darkblue: true,
    darkcyan: true,
    darkgoldenrod: true,
    darkgray: true,
    darkgreen: true,
    darkgrey: true,
    darkkhaki: true,
    darkmagenta: true,
    darkolivegreen: true,
    darkorange: true,
    darkorchid: true,
    darkred: true,
    darksalmon: true,
    darkseagreen: true,
    darkslateblue: true,
    darkslategray: true,
    darkslategrey: true,
    darkturquoise: true,
    darkviolet: true,
    deeppink: true,
    deepskyblue: true,
    dimgray: true,
    dimgrey: true,
    dodgerblue: true,
    firebrick: true,
    floralwhite: true,
    forestgreen: true,
    fuchsia: true,
    gainsboro: true,
    ghostwhite: true,
    gold: true,
    goldenrod: true,
    gray: true,
    green: true,
    greenyellow: true,
    grey: true,
    honeydew: true,
    hotpink: true,
    indianred: true,
    indigo: true,
    ivory: true,
    khaki: true,
    lavender: true,
    lavenderblush: true,
    lawngreen: true,
    lemonchiffon: true,
    lightblue: true,
    lightcoral: true,
    lightcyan: true,
    lightgoldenrodyellow: true,
    lightgray: true,
    lightgreen: true,
    lightgrey: true,
    lightpink: true,
    lightsalmon: true,
    lightseagreen: true,
    lightskyblue: true,
    lightslategray: true,
    lightslategrey: true,
    lightsteelblue: true,
    lightyellow: true,
    lime: true,
    limegreen: true,
    linen: true,
    magenta: true,
    maroon: true,
    mediumaquamarine: true,
    mediumblue: true,
    mediumorchid: true,
    mediumpurple: true,
    mediumseagreen: true,
    mediumslateblue: true,
    mediumspringgreen: true,
    mediumturquoise: true,
    mediumvioletred: true,
    midnightblue: true,
    mintcream: true,
    mistyrose: true,
    moccasin: true,
    navajowhite: true,
    navy: true,
    oldlace: true,
    olive: true,
    olivedrab: true,
    orange: true,
    orangered: true,
    orchid: true,
    palegoldenrod: true,
    palegreen: true,
    paleturquoise: true,
    palevioletred: true,
    papayawhip: true,
    peachpuff: true,
    peru: true,
    pink: true,
    plum: true,
    powderblue: true,
    purple: true,
    rebeccapurple: true,
    red: true,
    rosybrown: true,
    royalblue: true,
    saddlebrown: true,
    salmon: true,
    sandybrown: true,
    seagreen: true,
    seashell: true,
    sienna: true,
    silver: true,
    skyblue: true,
    slateblue: true,
    slategray: true,
    slategrey: true,
    snow: true,
    springgreen: true,
    steelblue: true,
    tan: true,
    teal: true,
    thistle: true,
    tomato: true,
    turquoise: true,
    violet: true,
    wheat: true,
    white: true,
    whitesmoke: true,
    yellow: true,
    yellowgreen: true,
};

const DOCUMENT_COLOR_LIGHT_SELECTOR =
    ":where(.note-quick-dot, .documents-color-dot)";
const DOCUMENT_COLOR_DARK_SELECTOR =
    '[data-theme="dark"] :where(.note-quick-dot, .documents-color-dot)';

const DOCUMENT_COLOR_LIGHT_PALETTE: Record<string, string> = {
    "--note-dot-amber": "#724E00",
    "--note-dot-rose": "#7F3B58",
    "--note-dot-sage": "#2C6330",
    "--note-dot-sky": "#085B87",
    "--note-dot-paper": "#5A5A60",
};

const DOCUMENT_COLOR_DARK_PALETTE: Record<string, string> = {
    "--note-dot-amber": "#E6C183",
    "--note-dot-rose": "#F7AFCA",
    "--note-dot-sage": "#A3D7A3",
    "--note-dot-sky": "#91D0FC",
    "--note-dot-paper": "#BEBEC4",
};

const ENGINE_BRAND_FILL_HEXES: Record<string, true> = {
    // Google
    "#4285F4": true,
    "#34A853": true,
    "#FBBC05": true,
    "#EA4335": true,
    // Bing
    "#258FFA": true,
    // Baidu
    "#2932E1": true,
    // DuckDuckGo
    "#DE5833": true,
    "#FFFFFF": true,
    "#222222": true,
    "#F6A838": true,
    "#65BC46": true,
};

const DESIGN_LAB_GLASS_FIXTURE_BG =
    "radial-gradient(40% 60% at 15% 30%, #E5322D, transparent), radial-gradient(40% 60% at 85% 70%, #1F6FEB, transparent), repeating-linear-gradient(90deg, #111 0 14px, #F5F5F5 14px 28px)";

const HEX_LITERAL_BODY =
    /^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function stripOuterQuotes(value: string): string {
    const trimmed = value.trim();
    if (
        trimmed.length >= 2 &&
        ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
            (trimmed.startsWith("`") && trimmed.endsWith("`") &&
                !trimmed.includes("${")))
    ) {
        return trimmed.slice(1, -1).trim();
    }
    return trimmed;
}

/**
 * Normalizes a CSS kebab-case or TSX camelCase style property name.
 */
export function normalizeColorProperty(property: string): string {
    const trimmed = property.trim();
    if (trimmed.startsWith("--")) {
        return trimmed;
    }
    const kebab = trimmed.replaceAll(
        /[A-Z]/g,
        (match) => `-${match.toLowerCase()}`,
    ).toLowerCase();
    if (kebab.startsWith("webkit-")) {
        return `-${kebab}`;
    }
    return kebab;
}

/**
 * Returns whether a CSS property or TSX style property is in a color semantic position.
 */
export function isColorSemanticProperty(property: string): boolean {
    const norm = normalizeColorProperty(property);
    if (norm.startsWith("--")) {
        return /(?:^|[-])(?:color|colour|accent|surface|foreground|background|border|ring|fill|stroke|shadow|scrim|muted|danger|success|warning|brand|dot|ink|tint|bg|fg|wallpaper)(?:-|$)/
            .test(norm);
    }
    return Object.hasOwn(COLOR_SEMANTIC_PROPS, norm);
}

/**
 * Returns whether a JSX attribute is an SVG/presentation color attribute on a native element.
 */
export function isSvgColorAttribute(
    attribute: string,
    tagName?: string,
): boolean {
    if (!Object.hasOwn(SVG_COLOR_ATTRIBUTES, attribute)) {
        return false;
    }
    if (tagName !== undefined && /^[A-Z]/.test(tagName)) {
        return false;
    }
    return true;
}

function isIdentStart(ch: string): boolean {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") ||
        ch === "_" || ch === "-";
}

function isIdentChar(ch: string): boolean {
    return isIdentStart(ch) || (ch >= "0" && ch <= "9");
}

function findMatchingParen(text: string, openIndex: number): number {
    let depth = 0;
    let quote: '"' | "'" | null = null;
    for (let i = openIndex; i < text.length; i++) {
        const ch = text[i];
        if (quote !== null) {
            if (ch === "\\") {
                i++;
                continue;
            }
            if (ch === quote) {
                quote = null;
            }
            continue;
        }
        if (ch === "/" && text[i + 1] === "*") {
            i += 2;
            while (
                i < text.length && !(text[i] === "*" && text[i + 1] === "/")
            ) {
                i++;
            }
            i++;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }
        if (ch === "(") {
            depth++;
        } else if (ch === ")") {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return text.length;
}

function findTopLevelComma(text: string): number {
    let depth = 0;
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quote !== null) {
            if (ch === "\\") {
                i++;
                continue;
            }
            if (ch === quote) {
                quote = null;
            }
            continue;
        }
        if (ch === "/" && text[i + 1] === "*") {
            i += 2;
            while (
                i < text.length && !(text[i] === "*" && text[i + 1] === "/")
            ) {
                i++;
            }
            i++;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }
        if (ch === "(") {
            depth++;
        } else if (ch === ")") {
            depth = Math.max(0, depth - 1);
        } else if (ch === "," && depth === 0) {
            return i;
        }
    }
    return -1;
}

function scanCssValueSlice(
    text: string,
    baseOffset: number,
    out: RawColorMatch[],
): void {
    let i = 0;
    while (i < text.length) {
        const ch = text[i];

        // Skip CSS comments
        if (ch === "/" && text[i + 1] === "*") {
            i += 2;
            while (
                i < text.length && !(text[i] === "*" && text[i + 1] === "/")
            ) {
                i++;
            }
            i += 2;
            continue;
        }

        // Skip quoted strings so string content or data URLs never trigger false positives
        if (ch === '"' || ch === "'") {
            const quote = ch;
            i++;
            while (i < text.length) {
                if (text[i] === "\\") {
                    i += 2;
                    continue;
                }
                if (text[i] === quote) {
                    i++;
                    break;
                }
                i++;
            }
            continue;
        }

        // Hex color literal: #rgb, #rgba, #rrggbb, #rrggbbaa at token boundary
        if (ch === "#") {
            const prev = i > 0 ? text[i - 1] : "";
            let j = i + 1;
            while (j < text.length && isIdentChar(text[j])) {
                j++;
            }
            const body = text.slice(i + 1, j);
            if (!isIdentChar(prev) && HEX_LITERAL_BODY.test(body)) {
                out.push({
                    kind: "hex",
                    token: text.slice(i, j),
                    index: baseOffset + i,
                });
            }
            i = j;
            continue;
        }

        // Identifiers and functional notations
        if (isIdentStart(ch)) {
            const prev = i > 0 ? text[i - 1] : "";
            let j = i + 1;
            while (j < text.length && isIdentChar(text[j])) {
                j++;
            }
            if (isIdentChar(prev)) {
                i = j;
                continue;
            }
            const ident = text.slice(i, j);
            const lower = ident.toLowerCase();

            if (text[j] === "(") {
                const closeIdx = findMatchingParen(text, j);
                if (lower === "url") {
                    // Skip url(...) completely (both quoted and unquoted URLs/fragments)
                    i = closeIdx + 1;
                    continue;
                }
                if (lower === "var") {
                    const inner = text.slice(j + 1, closeIdx);
                    const commaIdx = findTopLevelComma(inner);
                    if (commaIdx !== -1) {
                        const fallback = inner.slice(commaIdx + 1);
                        scanCssValueSlice(
                            fallback,
                            baseOffset + j + 1 + commaIdx + 1,
                            out,
                        );
                    }
                    i = closeIdx + 1;
                    continue;
                }
                if (Object.hasOwn(RAW_COLOR_FUNCTIONS, lower)) {
                    const end = Math.min(closeIdx + 1, text.length);
                    out.push({
                        kind: "function",
                        token: text.slice(i, end),
                        index: baseOffset + i,
                    });
                    i = closeIdx + 1;
                    continue;
                }
                // Container / compositional functions (gradients, color-mix, light-dark, drop-shadow, calc, etc.)
                const inner = text.slice(j + 1, closeIdx);
                scanCssValueSlice(inner, baseOffset + j + 1, out);
                i = closeIdx + 1;
                continue;
            }

            if (
                !ident.startsWith("--") &&
                Object.hasOwn(CSS_NAMED_COLORS, lower)
            ) {
                out.push({
                    kind: "named",
                    token: ident,
                    index: baseOffset + i,
                });
            }
            i = j;
            continue;
        }

        i++;
    }
}

/**
 * Extracts all raw color occurrences in a CSS value string.
 * When `property` is provided, non-color properties are ignored.
 */
export function findRawColors(
    value: string,
    property?: string,
): RawColorMatch[] {
    if (property !== undefined && !isColorSemanticProperty(property)) {
        return [];
    }
    const matches: RawColorMatch[] = [];
    scanCssValueSlice(value, 0, matches);
    return matches;
}

/**
 * Returns true when `value` contains at least one raw color in a color semantic position.
 */
export function hasRawColor(value: string, property?: string): boolean {
    if (property !== undefined && !isColorSemanticProperty(property)) {
        return false;
    }
    const matches: RawColorMatch[] = [];
    scanCssValueSlice(value, 0, matches);
    return matches.length > 0;
}

/**
 * Narrow, exact domain color exceptions registered in Visual Language:
 * 1. Note color dots in `web/src/components/searcher/document-colors.css`
 * 2. Search engine brand SVG fills in `web/src/components/searcher/EngineSelector.tsx`
 * 3. High-contrast glass comparison fixture in `web/src/design-lab/design-lab.css`
 */
export function isDomainColorException(
    file: string,
    property: string,
    value: string,
    selector?: string,
): boolean {
    const normFile = file.replaceAll("\\", "/");
    const normProp = normalizeColorProperty(property);
    const cleanValue = stripOuterQuotes(
        value.replace(/\s*!important$/i, "").trim(),
    );
    const normSelector = selector !== undefined
        ? selector.replaceAll(/\s+/g, " ").trim()
        : undefined;

    // 1. Note color dots: exact owner, selector, custom property, and hex value.
    if (normFile === "web/src/components/searcher/document-colors.css") {
        if (
            normSelector === undefined ||
            normSelector === DOCUMENT_COLOR_LIGHT_SELECTOR
        ) {
            const expectedLight = DOCUMENT_COLOR_LIGHT_PALETTE[normProp];
            if (
                expectedLight &&
                cleanValue.toUpperCase() === expectedLight.toUpperCase()
            ) {
                return true;
            }
        }
        if (
            normSelector === undefined ||
            normSelector === DOCUMENT_COLOR_DARK_SELECTOR
        ) {
            const expectedDark = DOCUMENT_COLOR_DARK_PALETTE[normProp];
            if (
                expectedDark &&
                cleanValue.toUpperCase() === expectedDark.toUpperCase()
            ) {
                return true;
            }
        }
        return false;
    }

    // 2. Search engine brand marks: exact owner, `fill` attribute/property, and registered brand hex.
    if (normFile === "web/src/components/searcher/EngineSelector.tsx") {
        if (normProp === "fill" && !normSelector) {
            return Boolean(ENGINE_BRAND_FILL_HEXES[cleanValue.toUpperCase()]);
        }
        return false;
    }

    // 3. Design Lab glass material contrast fixture: exact file, selector, property, and value.
    if (normFile === "web/src/design-lab/design-lab.css") {
        if (
            normProp === "background" &&
            (normSelector === undefined ||
                normSelector === ".design-lab-wallpaper")
        ) {
            return cleanValue.replaceAll(/\s+/g, " ").trim() ===
                DESIGN_LAB_GLASS_FIXTURE_BG;
        }
        return false;
    }

    return false;
}

/**
 * Checks whether a CSS declaration or static style string contains an unexcepted raw color.
 */
export function hasDisallowedRawColor(
    file: string,
    property: string,
    value: string,
    selector?: string,
): boolean {
    if (!isColorSemanticProperty(property)) {
        return false;
    }
    if (isDomainColorException(file, property, value, selector)) {
        return false;
    }
    return hasRawColor(value, property);
}
