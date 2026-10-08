import { remark } from "remark";
import remarkGfm from "remark-gfm";

interface ReadableNode {
    type: string;
    value?: string;
    alt?: string | null;
    children?: ReadableNode[];
}
export interface NotePreview {
    text: string;
    sourceOnly: boolean;
}
export interface NoteTextPart {
    text: string;
    match: boolean;
}
export interface NoteSummaryAnalysis {
    analyze: (body: string) => string;
    preview: (body: string, readable: string, query: string) => NotePreview;
    highlight: (text: string, query: string) => NoteTextPart[];
}
const parser = remark().use(remarkGfm);

export function analyzeNoteBody(body: string): string {
    function readable(node: ReadableNode): string {
        if (node.type === "html" || node.type === "definition") return "";
        if (node.type === "image" || node.type === "imageReference") {
            return node.alt ?? "";
        }
        if (node.value !== undefined) return node.value;
        const inline = node.type === "paragraph" || node.type === "heading" ||
            node.type === "strong" || node.type === "emphasis" ||
            node.type === "delete" ||
            node.type === "link" || node.type === "linkReference";
        return (node.children ?? []).map(readable).join(inline ? "" : " ");
    }
    return readable(parser.parse(body)).replace(/\s+/gu, " ").trim();
}

// Map lower-case offsets back to the original text, including case expansions.
function matchRange(
    text: string,
    query: string,
    from = 0,
): [number, number] | null {
    const lower = text.toLowerCase();
    const index = lower.indexOf(query.toLowerCase(), from);
    if (index < 0) return null;
    let original = 0;
    let lowered = 0;
    let start = 0;
    for (const point of text) {
        const next = lowered + point.toLowerCase().length;
        if (lowered <= index && index < next) start = original;
        original += point.length;
        lowered = next;
        if (lowered >= index + query.toLowerCase().length) {
            return [start, original];
        }
    }
    return null;
}

export function noteSearchPreview(
    body: string,
    readable: string,
    query: string,
): NotePreview {
    const normalized = query.trim().toLowerCase();
    const readableMatch = normalized ? matchRange(readable, normalized) : null;
    const sourceOnly = Boolean(
        normalized && !readableMatch && body.toLowerCase().includes(normalized),
    );
    const text = sourceOnly ? body : readable;
    const range = readableMatch ??
        (sourceOnly ? matchRange(body, normalized) : null);
    if (!range) return { text: readable || "空白便签", sourceOnly: false };
    const before = Array.from(text.slice(0, range[0]));
    const after = Array.from(text.slice(range[1]));
    return {
        text: (before.length > 20 ? "…" : "") + before.slice(-20).join("") +
            text.slice(range[0], range[1]) + after.slice(0, 60).join("") +
            (after.length > 60 ? "…" : ""),
        sourceOnly,
    };
}

export function highlightNoteText(text: string, query: string): NoteTextPart[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [{ text, match: false }];
    const parts: NoteTextPart[] = [];
    let offset = 0;
    while (offset < text.length) {
        const remaining = text.slice(offset);
        const range = matchRange(remaining, normalized);
        if (!range) {
            parts.push({ text: remaining, match: false });
            break;
        }
        if (range[0]) {
            parts.push({ text: remaining.slice(0, range[0]), match: false });
        }
        parts.push({ text: remaining.slice(range[0], range[1]), match: true });
        offset += range[1];
    }
    return parts;
}
