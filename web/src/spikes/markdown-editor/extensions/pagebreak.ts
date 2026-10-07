import { $node, $remark } from "@milkdown/utils";

const EXACT_PAGEBREAK = "<!-- pagebreak -->";

interface MdastNode {
    type: string;
    value?: string;
    children?: MdastNode[];
}

function isMdastNode(value: unknown): value is MdastNode {
    return typeof value === "object" && value !== null && "type" in value;
}

/**
 * Remark plugin that transforms standalone `<!-- pagebreak -->` HTML comments
 * into semantic AST nodes of type "pagebreak".
 *
 * Per Issue #102 §20.1:
 * Fixed exact string `<!-- pagebreak -->` ONLY.
 * Trimmed, capitalized (PAGEBREAK), or hyphenated (page-break) variants
 * are NOT converted to pagebreak nodes; they remain raw HTML comments.
 */
export const remarkPageBreakPlugin = $remark(
    "remarkPageBreak",
    () => () => (tree: unknown) => {
        if (!isMdastNode(tree) || !Array.isArray(tree.children)) return;
        const transformed: MdastNode[] = [];
        for (const child of tree.children) {
            if (
                child.type === "paragraph" &&
                Array.isArray(child.children) &&
                child.children.length === 1 &&
                child.children[0].type === "html" &&
                child.children[0].value === EXACT_PAGEBREAK
            ) {
                transformed.push({ type: "pagebreak" });
            } else if (
                child.type === "html" &&
                child.value === EXACT_PAGEBREAK
            ) {
                transformed.push({ type: "pagebreak" });
            } else {
                transformed.push(child);
            }
        }
        tree.children = transformed;
    },
);

/**
 * Custom Milkdown/ProseMirror atomic block node for PageBreak.
 * - Atomic block node: selectable, deletable with Backspace/Delete.
 * - Non-editable presentation in continuous layout.
 * - Serializes strictly to canonical `<!-- pagebreak -->`.
 */
export const pagebreakNode = $node("pagebreak", () => ({
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,
    parseDOM: [
        {
            tag: "div[data-pagebreak]",
        },
    ],
    toDOM: () => [
        "div",
        {
            "data-pagebreak": "true",
            class: "milkdown-pagebreak",
            contenteditable: "false",
        },
        [
            "span",
            { class: "milkdown-pagebreak-separator" },
            "──────── 分页符 ────────",
        ],
    ],
    parseMarkdown: {
        match: ({ type }) => type === "pagebreak",
        runner: (state, _, type) => {
            state.addNode(type);
        },
    },
    toMarkdown: {
        match: (node) => node.type.name === "pagebreak",
        runner: (state) => {
            state.addNode("html", undefined, EXACT_PAGEBREAK);
        },
    },
}));
