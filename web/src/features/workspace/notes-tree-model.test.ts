import { assertEquals } from "@std/assert";
import type { DocumentNotebookDto, DocumentSummaryDto } from "@shared/documents.ts";
import { documentNotebookTree } from "./document-notebooks.ts";
import {
    buildTreeEntries,
    createTargetTitle,
    indexNoteNotebooks,
    type NodePage,
    resolveCreateTarget,
    resolveNewNotebookParent,
    type SidebarSelection,
} from "./notes-tree-model.ts";

const notebook = (id: string, name: string, sortOrder: number, parentId: string | null = null): DocumentNotebookDto => ({
    id, name, sortOrder, parentId, createdAt: 0, updatedAt: 0,
});
const note = (id: string, notebookId: string | null): DocumentSummaryDto => ({
    id, title: id, displayTitle: id, snippet: "", notebookId, isFavorite: false, color: "paper",
    isHomeFixed: false, homeSortOrder: 0, createdAt: 0, updatedAt: 0,
});
const page = (items: DocumentSummaryDto[], extra: Partial<NodePage> = {}): NodePage => ({
    items, nextCursor: null, status: "loaded", error: null, loadingMore: false, loadMoreError: null, ...extra,
});

const notebooks = [notebook("w", "工作", 1), notebook("w1", "周报", 1, "w"), notebook("r", "读书", 2)];
const known = new Map<string, string | null>([["n-w", "w"], ["n-none", null]]);
const create = (selection: SidebarSelection, treeMode = true) =>
    resolveCreateTarget({ selection, treeMode, notebooks, noteNotebookId: (id) => known.get(id) });

Deno.test("create target: selected notebook, selected note's notebook, otherwise 未分类", () => {
    assertEquals(create({ kind: "notebook", id: "r" }), { notebookId: "r", isHomeFixed: false, notebookName: "读书" });
    assertEquals(create({ kind: "notebook", id: "w1" }).notebookId, "w1");
    assertEquals(create({ kind: "note", id: "n-w" }).notebookName, "工作");
    assertEquals(create({ kind: "note", id: "n-none" }).notebookId, null);
    assertEquals(create({ kind: "note", id: "unknown" }).notebookId, null);
    assertEquals(create(null).notebookId, null);
    assertEquals(create({ kind: "uncategorized" }).notebookId, null);
    assertEquals(create({ kind: "notebook", id: "deleted" }).notebookId, null);
});

Deno.test("create target: list mode ignores the selection and never pins to home", () => {
    assertEquals(create({ kind: "notebook", id: "w" }, false), { notebookId: null, isHomeFixed: false, notebookName: null });
    assertEquals(createTargetTitle(create({ kind: "notebook", id: "w" })), "新建笔记（在「工作」）");
    assertEquals(createTargetTitle(create(null)), "新建笔记（未分类）");
});

Deno.test("new notebook parent: only a selected root notebook, never a third level", () => {
    assertEquals(resolveNewNotebookParent({ kind: "notebook", id: "w" }, notebooks), "w");
    assertEquals(resolveNewNotebookParent({ kind: "notebook", id: "w1" }, notebooks), null);
    assertEquals(resolveNewNotebookParent({ kind: "note", id: "n-w" }, notebooks), null);
    assertEquals(resolveNewNotebookParent(null, notebooks), null);
    assertEquals(resolveNewNotebookParent({ kind: "uncategorized" }, notebooks), null);
    assertEquals(resolveNewNotebookParent({ kind: "notebook", id: "gone" }, notebooks), null);
});

Deno.test("tree entries: collapsed tree lists roots then 未分类 with levels and positions", () => {
    const entries = buildTreeEntries(documentNotebookTree(notebooks), new Set(), new Map());
    assertEquals(entries.map((entry) => [entry.id, entry.level, entry.posInSet, entry.setSize]), [
        ["nb:w", 1, 1, 3], ["nb:r", 1, 2, 3], ["uncat", 1, 3, 3],
    ]);
    assertEquals(entries.every((entry) => entry.expandable && !entry.expanded), true);
});

Deno.test("tree entries: expanded root shows sub-notebooks, then notes, then load-more", () => {
    const pages = new Map([
        ["nb:w", page([note("a", "w")], { nextCursor: "c" })],
        ["nb:w1", page([note("b", "w1")])],
    ]);
    const entries = buildTreeEntries(documentNotebookTree(notebooks), new Set(["nb:w", "nb:w1"]), pages);
    assertEquals(entries.map((entry) => `${entry.level}:${entry.id}`), [
        "1:nb:w", "2:nb:w1", "3:note:b", "2:note:a", "2:more:nb:w", "1:nb:r", "1:uncat",
    ]);
    assertEquals(entries.find((entry) => entry.id === "note:b")?.parentId, "nb:w1");
});

Deno.test("tree entries: loading, error, empty and load-more failures are rows", () => {
    const tree = documentNotebookTree(notebooks);
    const rows = (pages: Map<string, NodePage>) =>
        buildTreeEntries(tree, new Set(["nb:r"]), pages).filter((entry) => entry.parentId === "nb:r");
    assertEquals(rows(new Map()).map((entry) => entry.kind === "status" && entry.text), ["正在加载…"]);
    const failed = rows(new Map([["nb:r", page([], { status: "error", error: "网络错误" })]]))[0];
    assertEquals(failed.kind === "status" && failed.retry, true);
    assertEquals(rows(new Map([["nb:r", page([])]]))[0].kind === "status" && "没有笔记", "没有笔记");
    const more = rows(new Map([["nb:r", page([note("x", "r")], { loadMoreError: "失败" })]]));
    assertEquals(more.map((entry) => entry.kind), ["note", "more"]);
});

Deno.test("note index maps loaded notes to their notebook or 未分类", () => {
    const index = indexNoteNotebooks(new Map([["nb:w", page([note("a", "w")])], ["uncat", page([note("u", null)])]]));
    assertEquals(index.get("a"), "w");
    assertEquals(index.get("u"), null);
    assertEquals(index.has("zzz"), false);
});
