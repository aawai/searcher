import { commandsCtx, editorViewCtx, schemaCtx } from "@milkdown/core";
import type { Ctx } from "@milkdown/ctx";
import {
    insertHrCommand,
    toggleEmphasisCommand,
    toggleInlineCodeCommand,
    toggleLinkCommand,
    toggleStrongCommand,
} from "@milkdown/preset-commonmark";
import {
    insertTableCommand,
    toggleStrikethroughCommand,
} from "@milkdown/preset-gfm";
import { lift, setBlockType, wrapIn } from "@milkdown/prose/commands";
import { closeHistory } from "@milkdown/prose/history";
import type { Mark, Node, NodeType } from "@milkdown/prose/model";
import { liftListItem, wrapInList } from "@milkdown/prose/schema-list";
import type { EditorState, Transaction } from "@milkdown/prose/state";

import type {
    MarkdownEditorCommand,
    MarkdownEditorCommandParams,
} from "./types.ts";

export type { MarkdownEditorCommand, MarkdownEditorCommandParams };

/**
 * Toggles a heading level or turns it back into a paragraph if all textblocks
 * in the current selection already match the target level.
 */
function toggleHeading(ctx: Ctx, level: 1 | 2 | 3): boolean {
    const view = ctx.get(editorViewCtx);
    const schema = ctx.get(schemaCtx);
    const headingType = schema.nodes.heading;
    const paragraphType = schema.nodes.paragraph;
    if (!headingType || !paragraphType) return false;

    const { state, dispatch } = view;
    const { from, to } = state.selection;
    let allMatch = true;
    let count = 0;

    state.doc.nodesBetween(from, to, (node: Node) => {
        if (node.isTextblock) {
            count++;
            if (node.type !== headingType || node.attrs.level !== level) {
                allMatch = false;
            }
        }
    });

    const targetType = count > 0 && allMatch ? paragraphType : headingType;
    const targetAttrs = count > 0 && allMatch ? {} : { level };
    return setBlockType(targetType, targetAttrs)(state, (tr: Transaction) => {
        closeHistory(tr);
        dispatch(tr);
    });
}

/**
 * Checks if every textblock in selection is inside a node of nodeType.
 */
function isInsideNodeType(state: EditorState, nodeType: NodeType): boolean {
    const { from, to } = state.selection;
    let allInside = true;
    let count = 0;

    state.doc.nodesBetween(from, to, (node: Node, pos: number) => {
        if (node.isTextblock) {
            count++;
            const $pos = state.doc.resolve(pos);
            let found = false;
            for (let d = $pos.depth; d > 0; d--) {
                if ($pos.node(d).type === nodeType) {
                    found = true;
                    break;
                }
            }
            if (!found) allInside = false;
        }
    });

    return count > 0 && allInside;
}

/**
 * Toggles blockquote wrapping or lifts content out if already inside blockquote.
 */
function toggleBlockquote(ctx: Ctx): boolean {
    const view = ctx.get(editorViewCtx);
    const schema = ctx.get(schemaCtx);
    const blockquoteType = schema.nodes.blockquote;
    if (!blockquoteType) return false;

    const { state, dispatch } = view;
    if (isInsideNodeType(state, blockquoteType)) {
        return lift(state, (tr: Transaction) => {
            closeHistory(tr);
            dispatch(tr);
        });
    }
    return wrapIn(blockquoteType)(state, (tr: Transaction) => {
        closeHistory(tr);
        dispatch(tr);
    });
}

/**
 * Retrieves all list item nodes covered by current selection.
 */
function getSelectedListItems(state: EditorState, listItemType: NodeType) {
    const { from, to } = state.selection;
    const items: Array<{ node: Node; pos: number }> = [];

    state.doc.nodesBetween(from, to, (node: Node, pos: number) => {
        if (node.type === listItemType) {
            items.push({ node, pos });
        }
    });

    if (items.length === 0) {
        const { $from } = state.selection;
        for (let d = $from.depth; d > 0; d--) {
            const ancestor = $from.node(d);
            if (ancestor.type === listItemType) {
                items.push({ node: ancestor, pos: $from.before(d) });
                break;
            }
        }
    }

    return items;
}

/**
 * Finds the nearest list ancestor (bullet_list or ordered_list) for an item position.
 */
function getParentList(
    state: EditorState,
    itemPos: number,
    bulletListType: NodeType,
    orderedListType: NodeType,
) {
    const $pos = state.doc.resolve(itemPos);
    for (let d = $pos.depth; d > 0; d--) {
        const node = $pos.node(d);
        if (node.type === bulletListType || node.type === orderedListType) {
            return { node, depth: d, pos: $pos.before(d) };
        }
    }
    return null;
}

/**
 * Toggles list item between bullet, ordered, task, or lifts out if already matching.
 */
function toggleList(
    ctx: Ctx,
    targetKind: "bullet" | "ordered" | "task",
): boolean {
    const view = ctx.get(editorViewCtx);
    const schema = ctx.get(schemaCtx);
    const bulletListType = schema.nodes.bullet_list;
    const orderedListType = schema.nodes.ordered_list;
    const listItemType = schema.nodes.list_item;
    if (!bulletListType || !orderedListType || !listItemType) return false;

    const { state, dispatch } = view;
    const items = getSelectedListItems(state, listItemType);

    if (items.length > 0) {
        const allSame = items.every(({ node, pos }) => {
            const parent = getParentList(
                state,
                pos,
                bulletListType,
                orderedListType,
            );
            if (!parent) return false;
            if (targetKind === "bullet") {
                return (
                    parent.node.type === bulletListType &&
                    (node.attrs.checked === null ||
                        node.attrs.checked === undefined)
                );
            } else if (targetKind === "ordered") {
                return parent.node.type === orderedListType;
            } else if (targetKind === "task") {
                return (
                    parent.node.type === bulletListType &&
                    node.attrs.checked !== null &&
                    node.attrs.checked !== undefined
                );
            }
            return false;
        });

        if (allSame) {
            return liftListItem(listItemType)(state, (tr: Transaction) => {
                closeHistory(tr);
                dispatch(tr);
            });
        }

        // Convert parents and items to targetKind
        const tr = state.tr;
        const parents = new Map<number, { node: Node; pos: number }>();
        for (const { pos } of items) {
            const p = getParentList(
                state,
                pos,
                bulletListType,
                orderedListType,
            );
            if (p) parents.set(p.pos, p);
        }

        for (const [pPos, p] of parents) {
            if (targetKind === "ordered" && p.node.type !== orderedListType) {
                tr.setNodeMarkup(pPos, orderedListType);
            } else if (
                (targetKind === "bullet" || targetKind === "task") &&
                p.node.type !== bulletListType
            ) {
                tr.setNodeMarkup(pPos, bulletListType);
            }
        }

        for (const { node, pos } of items) {
            const nextAttrs = { ...node.attrs };
            if (targetKind === "ordered") {
                nextAttrs.listType = "ordered";
                nextAttrs.checked = null;
            } else if (targetKind === "bullet") {
                nextAttrs.listType = "bullet";
                nextAttrs.checked = null;
            } else if (targetKind === "task") {
                nextAttrs.listType = "bullet";
                if (
                    nextAttrs.checked === null ||
                    nextAttrs.checked === undefined
                ) {
                    nextAttrs.checked = false;
                }
            }
            tr.setNodeMarkup(pos, undefined, nextAttrs);
        }

        closeHistory(tr);
        dispatch(tr);
        return true;
    }

    // Not in list: wrap in target list type
    if (targetKind === "ordered") {
        return wrapInList(orderedListType)(state, (tr: Transaction) => {
            closeHistory(tr);
            dispatch(tr);
        });
    } else if (targetKind === "bullet") {
        return wrapInList(bulletListType)(state, (tr: Transaction) => {
            closeHistory(tr);
            dispatch(tr);
        });
    } else if (targetKind === "task") {
        return wrapInList(bulletListType)(state, (tr: Transaction) => {
            tr.doc.descendants((node: Node, pos: number) => {
                if (
                    node.type === listItemType &&
                    (node.attrs.checked === null ||
                        node.attrs.checked === undefined)
                ) {
                    tr.setNodeMarkup(pos, undefined, {
                        ...node.attrs,
                        checked: false,
                    });
                }
            });
            closeHistory(tr);
            dispatch(tr);
        });
    }

    return false;
}

function linkRangeAtCursor(
    state: EditorState,
    mark: Mark,
): { from: number; to: number } | null {
    const { $from } = state.selection;
    let offset = $from.start();
    let start = -1;
    let end = offset;
    let result: { from: number; to: number } | null = null;
    $from.parent.forEach((node) => {
        const next = offset + node.nodeSize;
        if (node.marks.some((candidate) => candidate.eq(mark))) {
            if (start < 0) start = offset;
            end = next;
        } else {
            if (start >= 0 && start <= $from.pos && $from.pos <= end) {
                result = { from: start, to: end };
            }
            start = -1;
        }
        offset = next;
    });
    if (start >= 0 && start <= $from.pos && $from.pos <= end) {
        result = { from: start, to: end };
    }
    return result;
}

/**
 * Toggles a link mark on the selection or inserts a link if selection is collapsed.
 */
function toggleLink(
    ctx: Ctx,
    params?: { href?: string; title?: string },
): boolean {
    const view = ctx.get(editorViewCtx);
    const schema = ctx.get(schemaCtx);
    const commands = ctx.get(commandsCtx);
    const linkMarkType = schema.marks.link;
    if (!linkMarkType) return false;

    const { state, dispatch } = view;
    const { from, to, empty, $from } = state.selection;

    const hasLinkMarkInRange = state.doc.rangeHasMark(from, to, linkMarkType);
    const existingMarkAtCursor = $from.marks().find((m: Mark) =>
        m.type === linkMarkType
    );

    // If no params given, and we have an existing link: toggle off / remove link
    if (!params && (hasLinkMarkInRange || existingMarkAtCursor)) {
        if (existingMarkAtCursor && empty) {
            const range = linkRangeAtCursor(state, existingMarkAtCursor);
            if (!range) return false;
            const tr = state.tr.removeMark(range.from, range.to, linkMarkType);
            closeHistory(tr);
            dispatch(tr);
            return true;
        }
        return commands.call(toggleLinkCommand.key);
    }

    const href = params?.href ?? "https://";
    const title = params?.title ?? "";

    if (empty) {
        if (existingMarkAtCursor) {
            // Update existing link href/title across contiguous text nodes
            const range = linkRangeAtCursor(state, existingMarkAtCursor);
            if (!range) return false;
            const newMark = linkMarkType.create({ href, title });
            const tr = state.tr
                .removeMark(range.from, range.to, linkMarkType)
                .addMark(range.from, range.to, newMark);
            closeHistory(tr);
            dispatch(tr);
            return true;
        }

        // Insert link text with mark
        const text = title || href || "链接";
        const mark = linkMarkType.create({ href, title });
        const textNode = schema.text(text, [mark]);
        const tr = state.tr.replaceSelectionWith(textNode, false);
        closeHistory(tr);
        dispatch(tr);
        return true;
    }

    return commands.call(toggleLinkCommand.key, { href, title });
}

/**
 * Toggles a fenced code block or converts it back to a paragraph if already inside.
 */
function toggleCodeBlock(
    ctx: Ctx,
    params?: { language?: string },
): boolean {
    const view = ctx.get(editorViewCtx);
    const schema = ctx.get(schemaCtx);
    const codeBlockType = schema.nodes.code_block;
    const paragraphType = schema.nodes.paragraph;
    if (!codeBlockType || !paragraphType) return false;

    const { state, dispatch } = view;
    const { $from } = state.selection;

    if ($from.parent.type === codeBlockType) {
        return setBlockType(paragraphType)(state, (tr: Transaction) => {
            closeHistory(tr);
            dispatch(tr);
        });
    }

    const language = params?.language ?? "";
    return setBlockType(codeBlockType, { language })(
        state,
        (tr: Transaction) => {
            closeHistory(tr);
            dispatch(tr);
        },
    );
}

/**
 * Executes a shared markdown editor command within the Milkdown context.
 *
 * Honors ProseMirror IME composition state: commands return `false` during active composition
 * to prevent character corruption. Selection and history (undo/redo) are preserved.
 */
export function executeCommand<
    C extends MarkdownEditorCommand = MarkdownEditorCommand,
>(
    ctx: Ctx,
    command: C,
    params?: MarkdownEditorCommandParams[C],
): boolean {
    const view = ctx.get(editorViewCtx);
    if (view.composing) {
        return false;
    }

    const commands = ctx.get(commandsCtx);

    switch (command) {
        case "bold":
            return commands.call(toggleStrongCommand.key);
        case "italic":
            return commands.call(toggleEmphasisCommand.key);
        case "strike":
            return commands.call(toggleStrikethroughCommand.key);
        case "inlineCode":
            return commands.call(toggleInlineCodeCommand.key);
        case "heading1":
            return toggleHeading(ctx, 1);
        case "heading2":
            return toggleHeading(ctx, 2);
        case "heading3":
            return toggleHeading(ctx, 3);
        case "bulletList":
            return toggleList(ctx, "bullet");
        case "orderedList":
            return toggleList(ctx, "ordered");
        case "taskList":
            return toggleList(ctx, "task");
        case "blockquote":
            return toggleBlockquote(ctx);
        case "link":
            return toggleLink(
                ctx,
                params as { href?: string; title?: string } | undefined,
            );
        case "codeBlock":
            return toggleCodeBlock(
                ctx,
                params as { language?: string } | undefined,
            );
        case "horizontalRule":
            return commands.call(insertHrCommand.key);
        case "table":
            return commands.call(
                insertTableCommand.key,
                (params as { rows?: number; cols?: number }) ?? {
                    rows: 3,
                    cols: 3,
                },
            );
        default:
            return false;
    }
}
