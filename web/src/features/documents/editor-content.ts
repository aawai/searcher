import { remark } from "remark";
import remarkGfm from "remark-gfm";

export interface DocumentOutlineItem {
    /** Heading level from 1 (H1) to 6 (H6) */
    level: number;
    /** Plain text title of heading, or "未命名标题" if empty */
    text: string;
    /** 0-based sequential order of this heading within the document */
    index: number;
}

export interface DocumentAnalysis {
    /** Deterministic count of CJK characters + tokenized alphanumeric words, excluding Markdown syntax */
    wordCount: number;
    /** Derived estimated reading minutes (at ~300 words/min, 0 if empty, minimum 1 if non-empty) */
    readingMinutes: number;
    /** Outline items for all H1-H6 headings in document order */
    outline: DocumentOutlineItem[];
}

const remarkProcessor = remark().use(remarkGfm);

const CJK_REGEX =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const WORD_REGEX = /[a-zA-Z0-9]+(?:['\u2019][a-zA-Z0-9]+)?/g;
const MARKDOWN_SYNTAX_ONLY_REGEX = /^[*_~`#\-\s]*$/;

/**
 * Extracts plain text recursively from a Markdown AST node.
 */
function extractNodeText(node: unknown): string {
    if (!node || typeof node !== "object") return "";
    const n = node as Record<string, unknown>;
    if (typeof n.value === "string") {
        return n.value;
    }
    if (Array.isArray(n.children)) {
        return n.children.map(extractNodeText).join("");
    }
    return "";
}

/**
 * Extracts text content while ignoring non-readable / non-syntax elements
 * like raw HTML comments (<!-- pagebreak -->), YAML metadata, and images.
 */
function extractBodyText(node: unknown): string {
    if (!node || typeof node !== "object") return "";
    const n = node as Record<string, unknown>;
    const type = n.type;

    if (
        type === "html" ||
        type === "yaml" ||
        type === "image" ||
        type === "imageReference"
    ) {
        return "";
    }

    if (typeof n.value === "string") {
        return n.value;
    }

    if (Array.isArray(n.children)) {
        const separator = type === "paragraph" || type === "heading" ||
                type === "emphasis" || type === "strong" ||
                type === "delete" || type === "link" || type === "linkReference"
            ? ""
            : " ";
        return n.children.map(extractBodyText).join(separator);
    }

    return "";
}

/**
 * Deterministic word count algorithm:
 * - CJK characters: 1 character = 1 word
 * - English & alphanumeric words: whitespace/punctuation separated tokenized words
 */
export function countDocumentWords(text: string): number {
    if (!text || !text.trim()) {
        return 0;
    }
    const cjkMatches = text.match(CJK_REGEX);
    const cjkCount = cjkMatches ? cjkMatches.length : 0;

    const nonCjk = text.replace(CJK_REGEX, " ");
    const engMatches = nonCjk.match(WORD_REGEX);
    const engCount = engMatches ? engMatches.length : 0;

    return cjkCount + engCount;
}

/**
 * Calculates estimated reading time in minutes:
 * - 0 words -> 0 minutes
 * - >0 words -> ceil(wordCount / 300) with a minimum of 1 minute
 */
export function calculateReadingMinutes(wordCount: number): number {
    return wordCount <= 0 ? 0 : Math.max(1, Math.ceil(wordCount / 300));
}

/**
 * Comprehensive analysis of document markdown:
 * - Deterministic word count (syntax excluded, CJK chars + English words)
 * - Estimated reading minutes
 * - Outline items (H1-H6 with fallback "未命名标题" for empty headings)
 */
export function analyzeDocumentMarkdown(body: string): DocumentAnalysis {
    if (!body || typeof body !== "string" || !body.trim()) {
        return {
            wordCount: 0,
            readingMinutes: 0,
            outline: [],
        };
    }

    const tree = remarkProcessor.parse(body);
    const outline: DocumentOutlineItem[] = [];
    let headingIndex = 0;

    function walkHeadings(node: unknown): void {
        if (!node || typeof node !== "object") return;
        const n = node as Record<string, unknown>;

        if (
            n.type === "heading" &&
            typeof n.depth === "number" &&
            n.depth >= 1 &&
            n.depth <= 6
        ) {
            const raw = extractNodeText(n).trim();
            const isEmpty = raw.length === 0 ||
                MARKDOWN_SYNTAX_ONLY_REGEX.test(raw);
            outline.push({
                level: n.depth,
                text: isEmpty ? "未命名标题" : raw,
                index: headingIndex++,
            });
        }

        if (Array.isArray(n.children)) {
            for (const child of n.children) {
                walkHeadings(child);
            }
        }
    }

    walkHeadings(tree);

    const bodyText = extractBodyText(tree);
    const wordCount = countDocumentWords(bodyText);
    const readingMinutes = calculateReadingMinutes(wordCount);

    return {
        wordCount,
        readingMinutes,
        outline,
    };
}

export function extractDocumentOutline(body: string): DocumentOutlineItem[] {
    return analyzeDocumentMarkdown(body).outline;
}
