/**
 * The Visual Language registries that the semantic rules enforce.
 *
 * `docs/design/VISUAL_LANGUAGE.md` is the single source: the font-size ladder,
 * the radius ladder and the accent-fill table are parsed from it, so changing
 * a ladder means changing the contract first. Parsing fails closed: a missing
 * or malformed table throws instead of silently registering nothing.
 */

export interface AccentFillEntry {
    semantic: string;
    file: string;
    selector: string;
}

export interface VisualRegistry {
    fontTokens: ReadonlySet<string>;
    radiusTokens: ReadonlySet<string>;
    accentFills: readonly AccentFillEntry[];
    breakpoints: ReadonlySet<number>;
}

export const DEFAULT_REGISTRY_URL = new URL(
    "../../docs/design/VISUAL_LANGUAGE.md",
    import.meta.url,
);

const FONT_LADDER_MARKER = "**字号阶梯登记";
const RADIUS_LADDER_MARKER = "**圆角阶梯登记";
const ACCENT_FILL_MARKER = "**强调色填充登记";

/** `font-size` Tokens: every `--font-*` except families, weights and line heights. */
const FONT_TOKEN_NAME =
    /^--font-(?!sans$|mono$)(?!.*-(?:weight|line-height)$)[a-z0-9-]+$/;
/** Radius Tokens: `--radius`, `--radius-*` and `--*-radius`. */
const RADIUS_TOKEN_NAME = /^--(?:[a-z0-9-]+-)?radius(?:-[a-z0-9-]+)?$/;

export function isFontTokenName(name: string): boolean {
    return FONT_TOKEN_NAME.test(name);
}

export function isRadiusTokenName(name: string): boolean {
    return RADIUS_TOKEN_NAME.test(name);
}

function tableRowsAfter(lines: string[], marker: string): string[][] {
    const start = lines.findIndex((line) => line.includes(marker));
    if (start === -1) {
        throw new Error(`Visual Language registry marker not found: ${marker}`);
    }
    let first = start + 1;
    while (first < lines.length && !lines[first].trimStart().startsWith("|")) {
        if (first - start > 3) {
            throw new Error(`No registry table follows marker: ${marker}`);
        }
        first++;
    }
    const rows: string[][] = [];
    for (
        let i = first;
        i < lines.length && lines[i].trimStart().startsWith("|");
        i++
    ) {
        rows.push(
            lines[i].trim().replace(/^\||\|$/g, "").split("|").map((cell) =>
                cell.trim()
            ),
        );
    }
    // Header and separator rows.
    const body = rows.slice(2);
    if (body.length === 0) {
        throw new Error(`Registry table is empty: ${marker}`);
    }
    return body;
}

function unwrapCode(cell: string, context: string): string {
    const match = /^`([^`]+)`$/.exec(cell);
    if (!match) {
        throw new Error(
            `Registry cell must be a single code span (${context}): ${cell}`,
        );
    }
    return match[1];
}

function parseTokenTable(
    lines: string[],
    marker: string,
    isTokenName: (name: string) => boolean,
): Set<string> {
    const tokens = new Set<string>();
    for (const cells of tableRowsAfter(lines, marker)) {
        const token = unwrapCode(cells[0], marker);
        if (!isTokenName(token)) {
            throw new Error(
                `Registry row is not a valid Token (${marker}): ${token}`,
            );
        }
        tokens.add(token);
    }
    return tokens;
}

export function normalizeSelector(selector: string): string {
    return selector.replaceAll(/\s+/g, " ").trim();
}

export function parseVisualRegistry(markdown: string): VisualRegistry {
    const lines = markdown.split("\n");
    const accentFills = tableRowsAfter(lines, ACCENT_FILL_MARKER).map(
        (cells) => {
            if (cells.length < 3) {
                throw new Error(
                    `Accent-fill row needs semantic, file and selector: ${
                        cells.join(" | ")
                    }`,
                );
            }
            return {
                semantic: cells[0],
                file: unwrapCode(cells[1], "accent-fill file"),
                selector: normalizeSelector(
                    unwrapCode(cells[2], "accent-fill selector"),
                ),
            };
        },
    );
    const breakpoints = new Set<number>();
    let previous = -1;
    for (const cells of tableRowsAfter(lines, "**断点登记")) {
        const value = unwrapCode(cells[0], "breakpoint");
        const width = Number(value);
        if (
            !/^\d+$/.test(value) || width <= previous ||
            (previous === -1 && width !== 0) ||
            cells.length < 4 || cells.slice(1).some((cell) => !cell)
        ) {
            throw new Error(
                `Invalid breakpoint registry row: ${cells.join(" | ")}`,
            );
        }
        breakpoints.add(width);
        previous = width;
    }
    if (breakpoints.size < 2) {
        throw new Error("Breakpoint registry needs a boundary");
    }
    return {
        fontTokens: parseTokenTable(lines, FONT_LADDER_MARKER, isFontTokenName),
        radiusTokens: parseTokenTable(
            lines,
            RADIUS_LADDER_MARKER,
            isRadiusTokenName,
        ),
        accentFills,
        breakpoints,
    };
}

export async function loadVisualRegistry(
    source: string | URL = DEFAULT_REGISTRY_URL,
): Promise<VisualRegistry> {
    return parseVisualRegistry(await Deno.readTextFile(source));
}

/** Splits a selector list on top-level commas (outside `()` and `[]`). */
function splitSelectorList(selector: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < selector.length; i++) {
        const ch = selector[i];
        if (ch === "(" || ch === "[") depth++;
        else if (ch === ")" || ch === "]") depth--;
        else if (ch === "," && depth === 0) {
            parts.push(selector.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(selector.slice(start));
    return parts.map(normalizeSelector);
}

const STATE_PSEUDO =
    /:(?:hover|active|focus-visible|focus-within|focus|disabled|enabled)(?![\w-])|:not\((?:[^()]|\([^()]*\))*\)/g;

function withoutStatePseudo(part: string): string {
    return normalizeSelector(part.replaceAll(STATE_PSEUDO, ""));
}

/**
 * A `var(--accent)` fill is registered when every selector of the rule, after
 * dropping interaction-state pseudo-classes, is listed for the same file.
 */
export function isRegisteredAccentFill(
    file: string,
    selector: string,
    registry: VisualRegistry,
): boolean {
    const parts = splitSelectorList(selector).map(withoutStatePseudo);
    if (parts.length === 0 || parts.some((part) => part === "")) return false;
    const registered = new Set<string>();
    for (const entry of registry.accentFills) {
        if (entry.file !== file) continue;
        for (const part of splitSelectorList(entry.selector)) {
            registered.add(withoutStatePseudo(part));
        }
    }
    return parts.every((part) => registered.has(part));
}

const VAR_REFERENCE = /var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/g;

function variableReferences(value: string): string[] {
    return [...value.matchAll(VAR_REFERENCE)].map((match) => match[1]);
}

export type TokenCheck = "ok" | "raw" | "unregistered";

const FONT_SIZE_KEYWORDS: Record<string, true> = {
    inherit: true,
    initial: true,
    unset: true,
    "1em": true,
    "100%": true,
};

/** `font-size`: a registered Token or a relative keyword. */
export function checkFontSize(
    value: string,
    registry: VisualRegistry,
): TokenCheck {
    const v = value.replace(/\s*!important$/i, "").trim();
    if (Object.hasOwn(FONT_SIZE_KEYWORDS, v)) return "ok";
    const refs = variableReferences(v);
    if (refs.length === 0 || !/^var\([^()]+\)$/.test(v)) return "raw";
    return refs.every((ref) => registry.fontTokens.has(ref))
        ? "ok"
        : "unregistered";
}

const RADIUS_KEYWORDS: Record<string, true> = {
    "0": true,
    "0px": true,
    "999px": true,
    "9999px": true,
    "50%": true,
    inherit: true,
    initial: true,
    unset: true,
};

function splitTopLevelWords(value: string): string[] {
    const words: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of value) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (/\s/.test(ch) && depth === 0) {
            if (current) words.push(current);
            current = "";
        } else current += ch;
    }
    if (current) words.push(current);
    return words;
}

/** `border-radius`: registered Tokens, keywords, or `calc(<Token> ± Npx)` insets. */
export function checkRadius(
    value: string,
    registry: VisualRegistry,
): TokenCheck {
    const v = value.replace(/\s*!important$/i, "").trim();
    let result: TokenCheck = "ok";
    for (const word of splitTopLevelWords(v)) {
        if (Object.hasOwn(RADIUS_KEYWORDS, word)) continue;
        const refs = variableReferences(word);
        const isVar = /^var\([^()]+\)$/.test(word);
        const isCalc = /^calc\(\s*var\([^()]+\)\s*[+-]\s*\d+(?:\.\d+)?px\s*\)$/
            .test(word);
        if (!isVar && !isCalc) return "raw";
        if (refs.length === 0) return "raw";
        if (!refs.every((ref) => registry.radiusTokens.has(ref))) {
            result = "unregistered";
        }
    }
    return result;
}
