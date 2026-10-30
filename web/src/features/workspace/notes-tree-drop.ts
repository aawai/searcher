import type { DocumentNotebookDto } from "@shared/documents.ts";
import type { TreeEntry } from "./notes-tree-model.ts";

export type TreeDropZone = "before" | "inside" | "after";

export type TreeDropResult =
    | { valid: false; reason: string }
    | {
        valid: true;
        kind: "note";
        id: string;
        notebookId: string | null;
        beforeId?: string;
        afterId?: string;
    }
    | {
        valid: true;
        kind: "notebook";
        id: string;
        parentId: string | null;
        beforeId?: string;
        afterId?: string;
    };

/** Resolve a visible row and pointer zone into a position API operation. */
export function resolveTreeDrop(input: {
    active: TreeEntry;
    over: TreeEntry | null;
    zone: TreeDropZone;
    entries: readonly TreeEntry[];
    notebooks: readonly DocumentNotebookDto[];
}): TreeDropResult {
    const { active, over, zone, entries, notebooks } = input;
    const invalid = (reason: string): TreeDropResult => ({
        valid: false,
        reason,
    });
    if (!over) return invalid("请选择放置位置");
    if (active.kind !== "note" && active.kind !== "notebook") {
        return invalid("此项目不能拖动");
    }
    if (active.id === over.id) return invalid("不能放置到自身");

    if (active.kind === "note") {
        if (over.kind === "notebook" && zone === "inside") {
            return {
                valid: true,
                kind: "note",
                id: active.note.id,
                notebookId: over.node.notebook.id,
            };
        }
        if (over.kind === "note" && zone !== "inside") {
            return {
                valid: true,
                kind: "note",
                id: active.note.id,
                notebookId: over.note.notebookId,
                ...(zone === "before"
                    ? { beforeId: over.note.id }
                    : { afterId: over.note.id }),
            };
        }
        return invalid("请放置在笔记前后或笔记本内");
    }

    const id = active.node.notebook.id;
    const hasChildren = notebooks.some((notebook) => notebook.parentId === id);
    if (over.kind === "notebook") {
        const target = over.node.notebook;
        if (zone === "inside") {
            if (target.parentId !== null) return invalid("笔记本最多两层");
            if (hasChildren) return invalid("含子笔记本的笔记本只能放在根级");
            return { valid: true, kind: "notebook", id, parentId: target.id };
        }
        if (target.parentId !== null && hasChildren) {
            return invalid("含子笔记本的笔记本只能放在根级");
        }
        return {
            valid: true,
            kind: "notebook",
            id,
            parentId: target.parentId,
            ...(zone === "before"
                ? { beforeId: target.id }
                : { afterId: target.id }),
        };
    }
    if (
        over.kind === "note" && over.note.notebookId === null &&
        zone === "before"
    ) {
        const firstRootNote = entries.find((entry) =>
            entry.kind === "note" && entry.note.notebookId === null
        );
        if (firstRootNote?.id === over.id) {
            return { valid: true, kind: "notebook", id, parentId: null };
        }
    }
    return invalid("请放置在笔记本前后或根笔记本内");
}
