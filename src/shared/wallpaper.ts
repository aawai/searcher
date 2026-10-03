export interface WallpaperComposition {
    focalX: number;
    focalY: number;
}

export const DEFAULT_WALLPAPER_COMPOSITION: WallpaperComposition = Object
    .freeze(
        {
            focalX: 0.5,
            focalY: 0.5,
        },
    );

export type WallpaperSource = {
    type: "uploaded" | "remote" | "gradient";
    value: string;
};

const FORBIDDEN_GRADIENT_PATTERNS: readonly RegExp[] = [
    /url\s*\(/i,
    /var\s*\(/i,
    /image(?:-set)?\s*\(/i,
    /cross-fade\s*\(/i,
    /element\s*\(/i,
    /attr\s*\(/i,
    /expression\s*\(/i,
    /javascript\s*:/i,
    /data\s*:/i,
    /<[^>]*>/,
    /@import/i,
    /[;{}]/,
    /\/\*/,
    /\*\//,
    /\\/,
];

const CSS_NAMED_COLORS: Record<string, true> = {
    transparent: true,
    currentcolor: true,
    black: true,
    white: true,
    red: true,
    green: true,
    blue: true,
    yellow: true,
    purple: true,
    pink: true,
    orange: true,
    cyan: true,
    magenta: true,
    gray: true,
    grey: true,
    aliceblue: true,
    antiquewhite: true,
    aqua: true,
    aquamarine: true,
    azure: true,
    beige: true,
    bisque: true,
    blanchedalmond: true,
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
    greenyellow: true,
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
    orangered: true,
    orchid: true,
    palegoldenrod: true,
    palegreen: true,
    paleturquoise: true,
    palevioletred: true,
    papayawhip: true,
    peachpuff: true,
    peru: true,
    plum: true,
    powderblue: true,
    rebeccapurple: true,
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
    whitesmoke: true,
    yellowgreen: true,
};

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const STOP_POSITION_REGEX =
    /^[-+]?[0-9]+(?:\.[0-9]+)?(?:%|px|rem|em|vw|vh|vmin|vmax|deg|rad|grad|turn)?$/;
const LINEAR_HEADER_REGEX =
    /^(?:(?:to\s+(?:(?:(?:top|bottom)(?:\s+(?:left|right))?)|(?:(?:left|right)(?:\s+(?:top|bottom))?)))|(?:[-+]?[0-9]+(?:\.[0-9]+)?(?:deg|rad|grad|turn)))$/i;

function isValidPosition(str: string): boolean {
    const trimmed = str.trim();
    if (!trimmed) return false;
    const tokens = trimmed.split(/\s+/);
    if (tokens.length > 4) return false;
    const POSITION_KEYWORD_REGEX = /^(?:top|bottom|left|right|center)$/i;
    const LENGTH_PERCENTAGE_REGEX =
        /^[-+]?[0-9]+(?:\.[0-9]+)?(?:%|px|rem|em|vw|vh|vmin|vmax)?$/i;
    return tokens.every(
        (tok) =>
            POSITION_KEYWORD_REGEX.test(tok) ||
            LENGTH_PERCENTAGE_REGEX.test(tok),
    );
}

function isValidRadialHeader(str: string): boolean {
    const trimmed = str.trim();
    if (/^at\s+/i.test(trimmed)) {
        return isValidPosition(trimmed.slice(2));
    }
    if (/\s+at\s+/i.test(trimmed)) {
        const parts = trimmed.split(/\s+at\s+/i);
        if (parts.length !== 2) return false;
        const prefix = parts[0].trim();
        if (
            !/^(?:(?:circle|ellipse)?(?:\s+(?:closest-side|farthest-side|closest-corner|farthest-corner))?|(?:closest-side|farthest-side|closest-corner|farthest-corner))$/i
                .test(prefix)
        ) return false;
        return isValidPosition(parts[1]);
    }
    return /^(?:circle|ellipse|closest-side|farthest-side|closest-corner|farthest-corner)(?:\s+(?:closest-side|farthest-side|closest-corner|farthest-corner))?$/i
        .test(trimmed);
}

function isValidConicHeader(str: string): boolean {
    const trimmed = str.trim();
    if (/^at\s+/i.test(trimmed)) {
        return isValidPosition(trimmed.slice(2));
    }
    if (/^from\s+/i.test(trimmed)) {
        if (/\s+at\s+/i.test(trimmed)) {
            const parts = trimmed.split(/\s+at\s+/i);
            if (parts.length !== 2) return false;
            const fromAngle = parts[0].slice(4).trim();
            if (
                !/^[-+]?[0-9]+(?:\.[0-9]+)?(?:deg|rad|grad|turn)$/i.test(
                    fromAngle,
                )
            ) return false;
            return isValidPosition(parts[1]);
        }
        const fromAngle = trimmed.slice(4).trim();
        return /^[-+]?[0-9]+(?:\.[0-9]+)?(?:deg|rad|grad|turn)$/i.test(
            fromAngle,
        );
    }
    return false;
}

function isValidColorFunction(fnStr: string): boolean {
    const m = fnStr.trim().match(/^([a-zA-Z]+)\s*\(([\s\S]*)\)$/);
    if (!m) return false;
    const name = m[1].toLowerCase();
    const inner = m[2].trim();
    if (!inner) return false;

    const NUM_REGEX = /^[-+]?[0-9]+(?:\.[0-9]+)?%?$/;
    const ANGLE_OR_NUM_REGEX =
        /^[-+]?[0-9]+(?:\.[0-9]+)?(?:%|deg|rad|grad|turn)?$/;

    if (name === "rgb" || name === "rgba") {
        if (inner.includes(",")) {
            const parts = inner.split(",").map((p) => p.trim());
            if (parts.length !== 3 && parts.length !== 4) return false;
            return parts.every((p) => NUM_REGEX.test(p));
        }
        let colorParts: string[];
        let alphaPart: string | null = null;
        if (inner.includes("/")) {
            const slashParts = inner.split("/").map((p) => p.trim());
            if (slashParts.length !== 2) return false;
            alphaPart = slashParts[1];
            colorParts = slashParts[0].split(/\s+/).filter(Boolean);
        } else {
            colorParts = inner.split(/\s+/).filter(Boolean);
        }
        if (colorParts.length !== 3) return false;
        if (!colorParts.every((p) => NUM_REGEX.test(p))) return false;
        if (alphaPart !== null && !NUM_REGEX.test(alphaPart)) return false;
        return true;
    }

    if (name === "hsl" || name === "hsla") {
        if (inner.includes(",")) {
            const parts = inner.split(",").map((p) => p.trim());
            if (parts.length !== 3 && parts.length !== 4) return false;
            if (!ANGLE_OR_NUM_REGEX.test(parts[0])) return false;
            if (!NUM_REGEX.test(parts[1]) || !NUM_REGEX.test(parts[2])) {
                return false;
            }
            if (parts.length === 4 && !NUM_REGEX.test(parts[3])) return false;
            return true;
        }
        let colorParts: string[];
        let alphaPart: string | null = null;
        if (inner.includes("/")) {
            const slashParts = inner.split("/").map((p) => p.trim());
            if (slashParts.length !== 2) return false;
            alphaPart = slashParts[1];
            colorParts = slashParts[0].split(/\s+/).filter(Boolean);
        } else {
            colorParts = inner.split(/\s+/).filter(Boolean);
        }
        if (colorParts.length !== 3) return false;
        if (!ANGLE_OR_NUM_REGEX.test(colorParts[0])) return false;
        if (
            !NUM_REGEX.test(colorParts[1]) || !NUM_REGEX.test(colorParts[2])
        ) {
            return false;
        }
        if (alphaPart !== null && !NUM_REGEX.test(alphaPart)) return false;
        return true;
    }

    if (name === "oklab" || name === "oklch") {
        let colorParts: string[];
        let alphaPart: string | null = null;
        if (inner.includes("/")) {
            const slashParts = inner.split("/").map((p) => p.trim());
            if (slashParts.length !== 2) return false;
            alphaPart = slashParts[1];
            colorParts = slashParts[0].split(/\s+/).filter(Boolean);
        } else {
            colorParts = inner.split(/\s+/).filter(Boolean);
        }
        if (colorParts.length !== 3) return false;
        if (!colorParts.every((p) => ANGLE_OR_NUM_REGEX.test(p))) return false;
        if (alphaPart !== null && !NUM_REGEX.test(alphaPart)) return false;
        return true;
    }

    return false;
}

function splitTopLevelCommas(input: string): string[] | null {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        if (char === "(") {
            depth++;
            current += char;
        } else if (char === ")") {
            depth--;
            if (depth < 0) return null;
            current += char;
        } else if (char === "," && depth === 0) {
            const trimmed = current.trim();
            if (!trimmed) return null;
            parts.push(trimmed);
            current = "";
        } else {
            current += char;
        }
    }
    if (depth !== 0) return null;
    const trimmed = current.trim();
    if (!trimmed) return null;
    parts.push(trimmed);
    return parts;
}

function isValidColor(str: string): boolean {
    const s = str.trim().toLowerCase();
    if (CSS_NAMED_COLORS[s]) return true;
    if (HEX_COLOR_REGEX.test(s)) return true;
    if (isValidColorFunction(s)) return true;
    return false;
}

function isValidColorStop(part: string): boolean {
    const p = part.trim();
    if (!p) return false;

    const fnMatch = p.match(
        /^((?:rgb|rgba|hsl|hsla|oklab|oklch)\s*\([^()]+\))(.*)$/i,
    );
    if (fnMatch) {
        const colorPart = fnMatch[1];
        const rest = fnMatch[2].trim();
        if (!isValidColor(colorPart)) return false;
        if (!rest) return true;
        const positions = rest.split(/\s+/);
        if (positions.length > 2) return false;
        return positions.every((pos) => STOP_POSITION_REGEX.test(pos));
    }

    const tokens = p.split(/\s+/);
    if (tokens.length === 0) return false;
    const colorToken = tokens[0];
    if (!isValidColor(colorToken)) return false;
    const positions = tokens.slice(1);
    if (positions.length > 2) return false;
    return positions.every((pos) => STOP_POSITION_REGEX.test(pos));
}

export function isValidGradient(value: string): boolean {
    const trimmed = value.trim();
    const match = trimmed.match(
        /^(?:repeating-)?(linear|radial|conic)-gradient\s*\(([\s\S]*)\)$/i,
    );
    if (!match) return false;

    for (const pattern of FORBIDDEN_GRADIENT_PATTERNS) {
        if (pattern.test(trimmed)) {
            return false;
        }
    }

    if (!/^[a-zA-Z0-9\s,().#%/\-+]+$/.test(trimmed)) {
        return false;
    }

    const kind = match[1].toLowerCase();
    const inner = match[2].trim();
    if (!inner) return false;

    const parts = splitTopLevelCommas(inner);
    if (!parts || parts.length < 2) return false;

    let colorStops: string[];
    const first = parts[0].trim();
    let hasHeader = false;

    if (kind === "linear" && LINEAR_HEADER_REGEX.test(first)) {
        hasHeader = true;
    } else if (
        kind === "radial" && isValidRadialHeader(first) &&
        !isValidColorStop(first)
    ) {
        hasHeader = true;
    } else if (
        kind === "conic" && isValidConicHeader(first) &&
        !isValidColorStop(first)
    ) {
        hasHeader = true;
    }

    if (hasHeader) {
        colorStops = parts.slice(1);
    } else {
        colorStops = parts;
    }

    if (colorStops.length < 2) return false;
    return colorStops.every(isValidColorStop);
}

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseWallpaperSource(value: string): WallpaperSource | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 2048) return null;

    // 1. Uploaded wallpaper: /api/wallpaper/:uuid
    if (trimmed.startsWith("/api/wallpaper/")) {
        const id = trimmed.slice("/api/wallpaper/".length);
        if (UUID_REGEX.test(id)) {
            return {
                type: "uploaded",
                value: `/api/wallpaper/${id.toLowerCase()}`,
            };
        }
        return null;
    }

    // 2. Remote HTTPS URL
    if (trimmed.startsWith("https://")) {
        try {
            const url = new URL(trimmed);
            if (
                url.protocol === "https:" &&
                !url.username &&
                !url.password &&
                url.hostname &&
                !url.host.includes("@")
            ) {
                return {
                    type: "remote",
                    value: url.toString(),
                };
            }
        } catch {
            return null;
        }
        return null;
    }

    // 3. CSS Gradient whitelist
    if (isValidGradient(trimmed)) {
        return {
            type: "gradient",
            value: trimmed,
        };
    }

    return null;
}

export function normalizeWallpaperCompositions(
    raw: unknown,
): Record<string, WallpaperComposition> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {};
    }
    const result: Record<string, WallpaperComposition> = {};
    for (const [key, val] of Object.entries(raw)) {
        if (typeof key !== "string" || key.trim() === "") {
            continue;
        }
        if (!val || typeof val !== "object" || Array.isArray(val)) {
            continue;
        }
        const v = val as Record<string, unknown>;
        const rawX = v.focalX;
        const rawY = v.focalY;
        const focalX = typeof rawX === "number" && Number.isFinite(rawX)
            ? Math.max(0, Math.min(1, rawX))
            : 0.5;
        const focalY = typeof rawY === "number" && Number.isFinite(rawY)
            ? Math.max(0, Math.min(1, rawY))
            : 0.5;
        result[key] = { focalX, focalY };
    }
    return result;
}

export function wallpaperComposition(
    source: string | null | undefined,
    compositions: Record<string, WallpaperComposition> | null | undefined,
): WallpaperComposition {
    if (!source || !compositions) {
        return { ...DEFAULT_WALLPAPER_COMPOSITION };
    }
    const found = compositions[source];
    if (!found) {
        return { ...DEFAULT_WALLPAPER_COMPOSITION };
    }
    const focalX = typeof found.focalX === "number" &&
            Number.isFinite(found.focalX)
        ? Math.max(0, Math.min(1, found.focalX))
        : 0.5;
    const focalY = typeof found.focalY === "number" &&
            Number.isFinite(found.focalY)
        ? Math.max(0, Math.min(1, found.focalY))
        : 0.5;
    return { focalX, focalY };
}
