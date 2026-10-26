import { parseNoteMarkdown } from "../workspace/note-summary.ts";

interface TaskNode {
    type: string;
    checked?: boolean | null;
    position?: { start: { offset?: number } };
    children?: TaskNode[];
}

function taskOffsets(node: TaskNode, offsets: number[]): number[] {
    if (node.type === "listItem" && typeof node.checked === "boolean") {
        const offset = node.position?.start.offset;
        if (offset !== undefined) offsets.push(offset);
    }
    for (const child of node.children ?? []) taskOffsets(child, offsets);
    return offsets;
}

const TASK_MARKER = /^(?:[-*+]|\d{1,9}[.)])[ \t]+\[([ xX])\]/u;

/**
 * Sets the `index`-th task list item (document order, code blocks excluded) to
 * `checked` in the Markdown source. Returns null when the source has no such task.
 */
export function setTaskChecked(
    body: string,
    index: number,
    checked: boolean,
): string | null {
    const task = taskAt(body, index);
    if (!task) return null;
    const mark = task.offset + task.marker[0].length - 2;
    return body.slice(0, mark) + (checked ? "x" : " ") + body.slice(mark + 1);
}

/** Returns the marker match and source offset of the `index`-th task, or null. */
function taskAt(
    body: string,
    index: number,
): { offset: number; marker: RegExpExecArray } | null {
    const offset = taskOffsets(parseNoteMarkdown(body), [])[index];
    if (offset === undefined) return null;
    const marker = TASK_MARKER.exec(body.slice(offset));
    if (!marker) return null;
    return { offset, marker };
}

function countTasks(
    node: TaskNode,
    progress: { done: number; total: number },
): { done: number; total: number } {
    if (node.type === "listItem" && typeof node.checked === "boolean") {
        progress.total++;
        if (node.checked) progress.done++;
    }
    for (const child of node.children ?? []) countTasks(child, progress);
    return progress;
}

/** Checked and total task list items (code blocks excluded); null without tasks. */
export function taskProgress(
    body: string,
): { done: number; total: number } | null {
    const progress = countTasks(parseNoteMarkdown(body), {
        done: 0,
        total: 0,
    });
    return progress.total > 0 ? progress : null;
}

/**
 * Returns the text of the `index`-th task row, without the list marker and
 * checkbox, so that a toggle can be matched against a newer body. Null when the
 * source has no such task.
 */
export function taskRowText(body: string, index: number): string | null {
    const task = taskAt(body, index);
    if (!task) return null;
    const start = task.offset + task.marker[0].length;
    const end = body.indexOf("\n", start);
    const line = body.slice(start, end === -1 ? undefined : end);
    return line.replace(/\r$/u, "").trim();
}

/** A checkbox change, identified by ordinal plus the row text it was made on. */
export interface TaskToggle {
    index: number;
    text: string;
    checked: boolean;
}

/**
 * Applies `toggles` in order to `body`. Returns null when any target task is
 * missing or its row text differs, so a stale toggle never lands on another row.
 */
export function replayTaskToggles(
    body: string,
    toggles: readonly TaskToggle[],
): string | null {
    let next: string | null = body;
    for (const toggle of toggles) {
        if (next === null) return null;
        if (taskRowText(next, toggle.index) !== toggle.text) return null;
        next = setTaskChecked(next, toggle.index, toggle.checked);
    }
    return next;
}
