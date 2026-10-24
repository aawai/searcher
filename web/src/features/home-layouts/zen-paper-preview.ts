import { parseNoteMarkdown } from "../workspace/note-summary.ts";

type MarkdownNode = {
    type: string;
    value?: string;
    alt?: string | null;
    checked?: boolean | null;
    identifier?: string;
    label?: string | null;
    ordered?: boolean | null;
    start?: number | null;
    children?: MarkdownNode[];
};

const PREVIEW_TEXT_LIMIT = 10_000;

function plainParagraph(node: MarkdownNode): boolean {
    return node.type === "paragraph" &&
        (node.children ?? []).every((child) =>
            child.type === "text" || child.type === "break"
        );
}

function hasTaskItem(node: MarkdownNode): boolean {
    if (node.type === "listItem" && typeof node.checked === "boolean") {
        return true;
    }
    return (node.children ?? []).some(hasTaskItem);
}

function inlineText(node: MarkdownNode): string {
    switch (node.type) {
        case "html":
        case "definition":
            return "";
        case "text":
        case "inlineCode":
        case "code":
            return node.value ?? "";
        case "break":
            return "\n";
        case "image":
        case "imageReference":
            return node.alt ?? "";
        case "link":
        case "linkReference":
        case "emphasis":
        case "strong":
        case "delete":
            return (node.children ?? []).map(inlineText).join("");
        case "footnoteReference":
            return node.label ?? node.identifier ?? "";
        default:
            return (node.children ?? []).map(inlineText).join("");
    }
}

function listText(node: MarkdownNode, indent: string): string {
    const ordered = node.ordered === true;
    const start = typeof node.start === "number" ? node.start : 1;
    return (node.children ?? []).map((item, index) => {
        const marker = ordered ? `${start + index}. ` : "• ";
        let task = "";
        if (item.checked !== null && item.checked !== undefined) {
            task = item.checked ? "[x] " : "[ ] ";
        }
        const prefix = `${indent}${marker}${task}`;
        const continuation = indent + " ".repeat(marker.length + task.length);
        const lines: string[] = [];
        let firstContent = true;

        for (const child of item.children ?? []) {
            if (child.type === "list") {
                if (firstContent) {
                    lines.push(prefix.trimEnd());
                    firstContent = false;
                }
                lines.push(listText(child, continuation));
                continue;
            }
            const text = blockText(child);
            if (!text) continue;
            const contentLines = text.split("\n");
            lines.push(
                (firstContent ? prefix : continuation) + contentLines[0],
            );
            for (const line of contentLines.slice(1)) {
                lines.push(continuation + line);
            }
            firstContent = false;
        }

        if (firstContent) lines.push(prefix.trimEnd());
        return lines.join("\n");
    }).join("\n");
}

function blockText(node: MarkdownNode, indent = ""): string {
    switch (node.type) {
        case "root":
            return (node.children ?? []).map((child) =>
                blockText(child, indent)
            )
                .filter(Boolean).join("\n\n");
        case "paragraph":
        case "heading":
            return (node.children ?? []).map(inlineText).join("");
        case "code":
            return node.value ?? "";
        case "list":
            return listText(node, indent);
        case "listItem":
            return (node.children ?? []).map((child) =>
                blockText(child, indent)
            )
                .filter(Boolean).join("\n");
        case "blockquote":
            return (node.children ?? []).map((child) =>
                blockText(child, indent)
            )
                .filter(Boolean).join("\n\n").split("\n")
                .map((line) => line ? `${indent}> ${line}` : line).join("\n");
        case "table":
            return (node.children ?? []).map((row) =>
                (row.children ?? []).map(inlineText).join(" | ")
            ).join("\n");
        case "tableRow":
            return (node.children ?? []).map(inlineText).join(" | ");
        case "tableCell":
            return (node.children ?? []).map(inlineText).join("");
        case "thematicBreak":
            return "—";
        case "html":
        case "definition":
            return "";
        default:
            return node.children
                ? node.children.map((child) => blockText(child, indent))
                    .filter(Boolean).join("\n")
                : inlineText(node);
    }
}

function boundedText(text: string): string {
    const characters = Array.from(text);
    if (characters.length <= PREVIEW_TEXT_LIMIT) return text;
    return characters.slice(0, PREVIEW_TEXT_LIMIT - 1).join("") + "…";
}

export function analyzeZenPaperPreview(body: string): {
    text: string;
    structured: boolean;
    /** True when the note has task list rows (checked or unchecked). */
    hasTasks: boolean;
} {
    const tree: MarkdownNode = parseNoteMarkdown(body);
    const children = tree.children ?? [];
    const structured = children.some((child) => !plainParagraph(child));
    return {
        text: boundedText(blockText(tree)),
        structured,
        hasTasks: hasTaskItem(tree),
    };
}
