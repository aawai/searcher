import { remark } from "remark";
import remarkGfm from "remark-gfm";

// Pre-create the processor for performance
const processor = remark().use(remarkGfm);

interface MdastNode {
    type: string;
    value?: string;
    alt?: string | null;
    url?: string;
    identifier?: string;
    label?: string | null;
    children?: MdastNode[];
}

const BLOCK_CONTAINERS: Record<string, true> = {
    root: true,
    blockquote: true,
    list: true,
    listItem: true,
    table: true,
    tableRow: true,
};

function extractNodeText(node: MdastNode): string {
    if (!node) return "";
    if (
        node.type === "text" ||
        node.type === "inlineCode" ||
        node.type === "code"
    ) {
        return node.value ?? "";
    }
    if (node.type === "html") {
        return (node.value ?? "")
            .replace(/<!--[\s\S]*?(-->|$)/g, "")
            .replace(/<style[\s\S]*?(<\/style>|$)/gi, "")
            .replace(/<script[\s\S]*?(<\/script>|$)/gi, "")
            .replace(/<[^>]*>?/g, "");
    }
    if (node.type === "image" || node.type === "imageReference") {
        return node.alt ?? "";
    }
    if (Array.isArray(node.children)) {
        const isBlockContainer = Boolean(BLOCK_CONTAINERS[node.type]);
        const childTexts = node.children
            .map(extractNodeText)
            .filter((t) => t.length > 0);
        if (isBlockContainer) {
            return childTexts.join("\n");
        }
        return childTexts.join("");
    }
    return "";
}

/**
 * Extracts plain text from Markdown content using remark + remark-gfm parser.
 * Strips HTML tags and markdown formatting syntax while preserving readable structure.
 */
export function documentPlainText(body: string): string {
    if (!body || typeof body !== "string") {
        return "";
    }

    const tree = processor.parse(body) as MdastNode;
    const raw = extractNodeText(tree);
    return raw
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join("\n");
}

/**
 * Derives a short plain-text snippet from Markdown content.
 * Guarantees no HTML tags, normalized single-space separation, and maximum length boundary.
 */
export function documentSnippet(body: string, maxLength = 160): string {
    const plain = documentPlainText(body);
    const singleLine = plain.replace(/\s+/g, " ").trim();
    if (singleLine.length <= maxLength) {
        return singleLine;
    }
    return singleLine.slice(0, maxLength).trim();
}

export function documentDisplayTitle(
    title: string | null,
    body: string,
): string {
    const explicit = title?.trim();
    if (explicit) return explicit;
    const firstReadable = (node: MdastNode): string => {
        if (node.type === "heading" || node.type === "paragraph") {
            return extractNodeText(node).replace(/\s+/g, " ").trim().slice(
                0,
                100,
            );
        }
        for (const child of node.children ?? []) {
            const text = firstReadable(child);
            if (text) return text;
        }
        return "";
    };
    return firstReadable(processor.parse(body) as MdastNode) || "无标题笔记";
}

function walkAstForAssets(
    node: MdastNode,
    definitions: Map<string, string>,
    imageRefs: string[],
    refs: Set<string>,
): void {
    if (!node) return;

    if (node.type === "definition") {
        if (node.identifier && node.url) {
            definitions.set(node.identifier.toLowerCase().trim(), node.url);
        }
    } else if (node.type === "image") {
        if (node.url && node.url.startsWith("asset://")) {
            const id = node.url.slice("asset://".length).trim();
            if (id.length > 0) {
                refs.add(id);
            }
        }
    } else if (node.type === "imageReference") {
        if (node.identifier) {
            imageRefs.push(node.identifier.toLowerCase().trim());
        }
    }

    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            walkAstForAssets(child, definitions, imageRefs, refs);
        }
    }
}

/**
 * Extracts asset IDs referenced as images from Markdown content.
 * Walks AST for direct `image` URLs and `imageReference` nodes resolved against definitions.
 * Ignores `asset://` occurrences inside code blocks, inline code, plain text, and non-image links.
 * Returns a Set of bare asset IDs (e.g. "uuid" without "asset://" prefix).
 */
export function documentAssetReferences(body: string): Set<string> {
    const refs = new Set<string>();
    if (!body || typeof body !== "string") {
        return refs;
    }

    const tree = processor.parse(body) as MdastNode;
    const definitions = new Map<string, string>();
    const imageRefs: string[] = [];

    walkAstForAssets(tree, definitions, imageRefs, refs);

    for (const refId of imageRefs) {
        const url = definitions.get(refId);
        if (url && url.startsWith("asset://")) {
            const id = url.slice("asset://".length).trim();
            if (id.length > 0) {
                refs.add(id);
            }
        }
    }

    return refs;
}
