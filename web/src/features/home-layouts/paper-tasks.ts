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
    const offset = taskOffsets(parseNoteMarkdown(body), [])[index];
    if (offset === undefined) return null;
    const marker = TASK_MARKER.exec(body.slice(offset));
    if (!marker) return null;
    const mark = offset + marker[0].length - 2;
    return body.slice(0, mark) + (checked ? "x" : " ") + body.slice(mark + 1);
}
