import type { HomeNoteItem } from "../home-layouts/home-notes.ts";
import { listTasks } from "../home-layouts/note-tasks.ts";
import { parseNoteMarkdown } from "../workspace/note-summary.ts";

interface MdastNode {
    type: string;
    value?: string;
    checked?: boolean | null;
    children?: MdastNode[];
}

export type MastheadEntrySummary =
    | {
        kind: "code";
        /** First non-empty line of the code block or inline code. */
        text: string;
        /** Full code string copied by "复制命令". */
        code: string;
    }
    | {
        kind: "tasks-only";
        text: string;
        total: number;
        done: number;
    }
    | {
        kind: "text";
        /** Readable text; inline code stays a separate monospace span. */
        segments: readonly MastheadTextSegment[];
    };

export interface MastheadTextSegment {
    text: string;
    code: boolean;
}

export interface MastheadTaskRow {
    key: string;
    note: HomeNoteItem;
    noteId: string;
    noteTitle: string;
    index: number;
    text: string;
    checked: boolean;
}

export interface MastheadTasksModel {
    done: number;
    total: number;
    open: number;
    items: MastheadTaskRow[];
}

export function mastheadTaskKey(noteId: string, index: number): string {
    return `${noteId}:${index}`;
}

function readableSegments(node: MdastNode): MastheadTextSegment[] {
    if (
        node.type === "html" ||
        node.type === "definition" ||
        node.type === "image" ||
        node.type === "imageReference" ||
        node.type === "thematicBreak"
    ) {
        return [];
    }
    if (node.value !== undefined) {
        return [{ text: node.value, code: node.type === "inlineCode" }];
    }
    const inline = node.type === "paragraph" ||
        node.type === "heading" ||
        node.type === "strong" ||
        node.type === "emphasis" ||
        node.type === "delete" ||
        node.type === "link" ||
        node.type === "linkReference";
    const parts = (node.children ?? []).map(readableSegments);
    if (inline) return parts.flat();
    return parts.flatMap((part, index) =>
        index === 0 ? part : [{ text: " ", code: false }, ...part]
    );
}

function readableNodeText(node: MdastNode): string {
    return readableSegments(node).map((segment) => segment.text).join("");
}

function normalizeWhitespace(text: string): string {
    return text.replace(/\s+/gu, " ").trim();
}

/** Collapses whitespace across segments, trims both ends and merges neighbours of one kind. */
function normalizeSegments(
    segments: readonly MastheadTextSegment[],
): MastheadTextSegment[] {
    const result: MastheadTextSegment[] = [];
    for (const segment of segments) {
        const previous = result.at(-1);
        let text = segment.text.replace(/\s+/gu, " ");
        if (!previous || previous.text.endsWith(" ")) {
            text = text.replace(/^ /u, "");
        }
        if (!text) continue;
        if (previous?.code === segment.code) previous.text += text;
        else result.push({ text, code: segment.code });
    }
    while (result.length > 0) {
        const last = result[result.length - 1];
        last.text = last.text.replace(/ $/u, "");
        if (last.text) break;
        result.pop();
    }
    return result;
}

/** Drops the first `count` characters of already normalized segments. */
function dropLeadingText(
    segments: readonly MastheadTextSegment[],
    count: number,
): MastheadTextSegment[] {
    let remaining = count;
    const rest: MastheadTextSegment[] = [];
    for (const segment of segments) {
        if (remaining >= segment.text.length) {
            remaining -= segment.text.length;
            continue;
        }
        rest.push({ text: segment.text.slice(remaining), code: segment.code });
        remaining = 0;
    }
    return normalizeSegments(rest);
}

function isMeaningfulBlock(node: MdastNode): boolean {
    if (
        node.type === "html" ||
        node.type === "definition" ||
        node.type === "thematicBreak"
    ) {
        return false;
    }
    if (node.type === "code") {
        return Boolean(node.value && node.value.trim().length > 0);
    }
    return normalizeWhitespace(readableNodeText(node)).length > 0 ||
        containsTaskItems(node);
}

function containsTaskItems(node: MdastNode): boolean {
    if (node.type === "listItem" && typeof node.checked === "boolean") {
        return true;
    }
    return (node.children ?? []).some(containsTaskItems);
}

function isOnlyTasksBlock(node: MdastNode): boolean {
    if (node.type === "list") {
        const items = node.children ?? [];
        return items.length > 0 && items.every(isOnlyTasksBlock);
    }
    if (node.type === "listItem") {
        if (typeof node.checked !== "boolean") return false;
        for (const child of node.children ?? []) {
            if (child.type === "list" && !isOnlyTasksBlock(child)) {
                return false;
            }
        }
        return true;
    }
    if (node.type === "blockquote") {
        const children = (node.children ?? []).filter(isMeaningfulBlock);
        return children.length > 0 && children.every(isOnlyTasksBlock);
    }
    return false;
}

function countTasksInBlocks(
    blocks: readonly MdastNode[],
): { done: number; total: number } {
    const progress = { done: 0, total: 0 };
    const walk = (node: MdastNode) => {
        if (node.type === "listItem" && typeof node.checked === "boolean") {
            progress.total++;
            if (node.checked) progress.done++;
        }
        for (const child of node.children ?? []) walk(child);
    };
    for (const block of blocks) walk(block);
    return progress;
}

function extractStandaloneCode(block: MdastNode): string | null {
    if (block.type === "code" && typeof block.value === "string") {
        const trimmed = block.value.replace(/\r\n/gu, "\n").trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    if (block.type === "paragraph") {
        const meaningful = (block.children ?? []).filter((child) =>
            !(child.type === "text" && (!child.value || !child.value.trim()))
        );
        if (
            meaningful.length === 1 &&
            meaningful[0].type === "inlineCode" &&
            typeof meaningful[0].value === "string"
        ) {
            const trimmed = meaningful[0].value.trim();
            return trimmed.length > 0 ? trimmed : null;
        }
    }
    return null;
}

function firstNonEmptyLine(code: string): string {
    for (const line of code.split(/\r?\n/u)) {
        const trimmed = line.trim();
        if (trimmed.length > 0) return trimmed;
    }
    return "";
}

/**
 * Derives the masthead entry summary for a pinned note:
 * - `code`: first content block is a code block or a whole-paragraph inline code
 * - `tasks-only`: content blocks consist solely of task list items
 * - `text`: readable plain text with Markdown syntax, images and HTML removed
 * Untitled notes skip their leading title block so the first line is not repeated.
 */
export function summarizeMastheadEntry(
    note: { title: string | null; displayTitle: string; body: string },
): MastheadEntrySummary {
    const root = parseNoteMarkdown(note.body) as MdastNode;
    let blocks = (root.children ?? []).filter(isMeaningfulBlock);

    const isUntitled = !note.title?.trim();
    if (isUntitled && blocks.length > 0) {
        const first = blocks[0];
        if (first.type === "heading" || first.type === "paragraph") {
            // If the first paragraph is a standalone inline-code command and the only block,
            // only skip it if there are subsequent blocks; wait: an untitled note whose only
            // line is `title` should not repeat that line as summary text unless it's a code command?
            // Spec: "无标题笔记：标题用 displayTitle（首行），摘要从下一块开始，不重复。"
            if (blocks.length > 1) {
                blocks = blocks.slice(1);
            } else {
                const segments = normalizeSegments(readableSegments(first));
                const fullText = segments.map((segment) => segment.text).join(
                    "",
                );
                const titleText = normalizeWhitespace(note.displayTitle);
                if (
                    titleText &&
                    fullText.startsWith(titleText) &&
                    fullText.length > titleText.length
                ) {
                    return {
                        kind: "text",
                        segments: dropLeadingText(segments, titleText.length),
                    };
                }
                return { kind: "text", segments: [] };
            }
        }
    }

    if (blocks.length === 0) {
        return { kind: "text", segments: [] };
    }

    const code = extractStandaloneCode(blocks[0]);
    if (code !== null) {
        return {
            kind: "code",
            text: firstNonEmptyLine(code),
            code,
        };
    }

    if (blocks.every(isOnlyTasksBlock)) {
        const { done, total } = countTasksInBlocks(blocks);
        if (total > 0) {
            return {
                kind: "tasks-only",
                text: `${total} 项任务 · ${done} 已完成`,
                total,
                done,
            };
        }
    }

    const segments = normalizeSegments(
        blocks.flatMap((block, index) =>
            index === 0
                ? readableSegments(block)
                : [{ text: " ", code: false }, ...readableSegments(block)]
        ),
    );
    return { kind: "text", segments };
}

/**
 * Aggregates tasks across all pinned home notes in home order, then document
 * order, including both open and completed tasks.
 */
export function aggregateMastheadTasks(
    notes: readonly HomeNoteItem[],
): MastheadTasksModel {
    let done = 0;
    let total = 0;
    const items: MastheadTaskRow[] = [];

    for (const note of notes) {
        const noteTasks = listTasks(note.body);
        for (const task of noteTasks) {
            total++;
            if (task.checked) done++;
            items.push({
                key: mastheadTaskKey(note.id, task.index),
                note,
                noteId: note.id,
                noteTitle: note.displayTitle,
                index: task.index,
                text: task.text,
                checked: task.checked,
            });
        }
    }

    return {
        done,
        total,
        open: Math.max(0, total - done),
        items,
    };
}
