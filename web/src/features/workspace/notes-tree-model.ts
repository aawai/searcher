import type { DocumentNotebookDto, DocumentSummaryDto } from "@shared/documents.ts";
import type { DocumentNotebookNode, DocumentNotebookTree } from "./document-notebooks.ts";
import type { TreeKeyItem } from "./tree-keyboard.ts";

/** The one selected tree node: a notebook or 未分类 (after a click) or the open note. */
export type SidebarSelection =
    | { kind: "notebook"; id: string }
    | { kind: "uncategorized" }
    | { kind: "note"; id: string }
    | null;

export interface CreateTarget {
    notebookId: string | null;
    /** Notes are never pinned to home on creation. */
    isHomeFixed: false;
    notebookName: string | null;
}

/** Where 「新建笔记」 lands: the selected notebook, the selected note's notebook, else 未分类. */
export function resolveCreateTarget(input: {
    selection: SidebarSelection;
    /** False in list mode (最近 / 收藏 / search). */
    treeMode: boolean;
    notebooks: readonly DocumentNotebookDto[];
    /** Notebook of a known note; undefined when the note is not known. */
    noteNotebookId: (noteId: string) => string | null | undefined;
}): CreateTarget {
    const uncategorized: CreateTarget = { notebookId: null, isHomeFixed: false, notebookName: null };
    const { selection } = input;
    if (!input.treeMode || !selection || selection.kind === "uncategorized") return uncategorized;
    const notebookId = selection.kind === "notebook"
        ? selection.id
        : input.noteNotebookId(selection.id) ?? null;
    const notebook = notebookId === null
        ? undefined
        : input.notebooks.find((item) => item.id === notebookId);
    return notebook
        ? { notebookId: notebook.id, isHomeFixed: false, notebookName: notebook.name }
        : uncategorized;
}

export function createTargetTitle(target: CreateTarget): string {
    return target.notebookName === null
        ? "新建笔记（未分类）"
        : `新建笔记（在「${target.notebookName}」）`;
}

/** 「新建笔记本」: a child of the selected root notebook, otherwise a root; never a third level. */
export function resolveNewNotebookParent(
    selection: SidebarSelection,
    notebooks: readonly DocumentNotebookDto[],
): string | null {
    if (selection?.kind !== "notebook") return null;
    const notebook = notebooks.find((item) => item.id === selection.id);
    return notebook && notebook.parentId === null ? notebook.id : null;
}

export const UNCATEGORIZED_KEY = "uncat";
export const notebookKey = (id: string) => `nb:${id}`;
export const noteItemId = (id: string) => `note:${id}`;

/** Loaded state of the notes directly inside one notebook (or 未分类). */
export interface NodePage {
    items: DocumentSummaryDto[];
    nextCursor: string | null;
    status: "loading" | "loaded" | "error";
    error: string | null;
    loadingMore: boolean;
    loadMoreError: string | null;
}

export type TreeEntry =
    & TreeKeyItem
    & { level: number; setSize: number; posInSet: number }
    & (
        | { kind: "notebook"; nodeKey: string; node: DocumentNotebookNode }
        | { kind: "uncategorized"; nodeKey: string }
        | { kind: "note"; note: DocumentSummaryDto }
        | { kind: "more"; nodeKey: string; loading: boolean; error: string | null }
        | { kind: "status"; nodeKey: string; text: string; retry: boolean }
    );

type Draft = TreeKeyItem & { level: number } & (
    | { kind: "notebook"; nodeKey: string; node: DocumentNotebookNode }
    | { kind: "uncategorized"; nodeKey: string }
    | { kind: "note"; note: DocumentSummaryDto }
    | { kind: "more"; nodeKey: string; loading: boolean; error: string | null }
    | { kind: "status"; nodeKey: string; text: string; retry: boolean }
);

/** Flattens the visible tree: notebooks, their sub-notebooks, then their notes; 未分类 last. */
export function buildTreeEntries(
    tree: DocumentNotebookTree,
    expanded: ReadonlySet<string>,
    pages: ReadonlyMap<string, NodePage>,
): TreeEntry[] {
    const drafts: Draft[] = [];
    const children = (root: DocumentNotebookDto) =>
        tree.nodes.filter((node) => node.notebook.parentId === root.id);

    const contents = (nodeKey: string, parentId: string, level: number, hasChildNotebooks: boolean) => {
        const page = pages.get(nodeKey);
        if (!page || (page.status === "loading" && page.items.length === 0)) {
            drafts.push({ id: `status:${nodeKey}`, parentId, expandable: false, expanded: false, level, kind: "status", nodeKey, text: "正在加载…", retry: false });
            return;
        }
        if (page.status === "error" && page.items.length === 0) {
            drafts.push({ id: `status:${nodeKey}`, parentId, expandable: false, expanded: false, level, kind: "status", nodeKey, text: `${page.error ?? "加载失败"}，重试`, retry: true });
            return;
        }
        if (page.items.length === 0 && !hasChildNotebooks) {
            drafts.push({ id: `status:${nodeKey}`, parentId, expandable: false, expanded: false, level, kind: "status", nodeKey, text: "没有笔记", retry: false });
            return;
        }
        for (const note of page.items) {
            drafts.push({ id: noteItemId(note.id), parentId, expandable: false, expanded: false, level, kind: "note", note });
        }
        if (page.nextCursor !== null || page.loadMoreError !== null) {
            drafts.push({
                id: `more:${nodeKey}`, parentId, expandable: false, expanded: false, level, kind: "more", nodeKey,
                loading: page.loadingMore, error: page.loadMoreError,
            });
        }
    };

    const notebook = (node: DocumentNotebookNode, level: number, parentId: string | null) => {
        const nodeKey = notebookKey(node.notebook.id);
        const isOpen = expanded.has(nodeKey);
        drafts.push({ id: nodeKey, parentId, expandable: true, expanded: isOpen, level, kind: "notebook", nodeKey, node });
        if (!isOpen) return;
        const kids = node.depth === 0 ? children(node.notebook) : [];
        for (const child of kids) notebook(child, level + 1, nodeKey);
        contents(nodeKey, nodeKey, level + 1, kids.length > 0);
    };

    for (const root of tree.nodes.filter((node) => node.depth === 0)) notebook(root, 1, null);

    const uncategorizedOpen = expanded.has(UNCATEGORIZED_KEY);
    drafts.push({
        id: UNCATEGORIZED_KEY, parentId: null, expandable: true, expanded: uncategorizedOpen, level: 1,
        kind: "uncategorized", nodeKey: UNCATEGORIZED_KEY,
    });
    if (uncategorizedOpen) contents(UNCATEGORIZED_KEY, UNCATEGORIZED_KEY, 2, false);

    const sizes = new Map<string | null, number>();
    for (const draft of drafts) sizes.set(draft.parentId, (sizes.get(draft.parentId) ?? 0) + 1);
    const positions = new Map<string | null, number>();
    return drafts.map((draft) => {
        const posInSet = (positions.get(draft.parentId) ?? 0) + 1;
        positions.set(draft.parentId, posInSet);
        return { ...draft, setSize: sizes.get(draft.parentId) ?? 1, posInSet } as TreeEntry;
    });
}

/** Notebook of every loaded note, for selection and create-target lookups. */
export function indexNoteNotebooks(
    pages: ReadonlyMap<string, NodePage>,
): Map<string, string | null> {
    const index = new Map<string, string | null>();
    for (const [nodeKey, page] of pages) {
        const notebookId = nodeKey === UNCATEGORIZED_KEY ? null : nodeKey.slice("nb:".length);
        for (const note of page.items) index.set(note.id, notebookId);
    }
    return index;
}
