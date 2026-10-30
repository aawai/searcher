import { assertEquals } from "@std/assert";
import type {
    DocumentNotebookDto,
    DocumentSummaryDto,
} from "@shared/documents.ts";
import { documentNotebookTree } from "./document-notebooks.ts";
import { resolveTreeDrop, type TreeDropZone } from "./notes-tree-drop.ts";
import type { TreeEntry } from "./notes-tree-model.ts";

const notebook = (
    id: string,
    parentId: string | null = null,
): DocumentNotebookDto => ({
    id,
    parentId,
    name: id,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
});
const note = (id: string, notebookId: string | null): DocumentSummaryDto => ({
    id,
    notebookId,
    title: id,
    displayTitle: id,
    snippet: "",
    isFavorite: false,
    color: "paper",
    isHomeFixed: false,
    homeSortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
});
const notebooks = [
    notebook("root"),
    notebook("child", "root"),
    notebook("other"),
    notebook("other-child", "other"),
    notebook("empty"),
];
const tree = documentNotebookTree(notebooks);
const common = {
    expandable: false,
    expanded: false,
    level: 1,
    setSize: 1,
    posInSet: 1,
};
function notebookRow(id: string): TreeEntry {
    const node = tree.nodes.find((item) => item.notebook.id === id)!;
    return {
        ...common,
        id: `nb:${id}`,
        parentId: node.notebook.parentId,
        kind: "notebook",
        nodeKey: `nb:${id}`,
        node,
    };
}
function noteRow(id: string, notebookId: string | null): TreeEntry {
    return {
        ...common,
        id: `note:${id}`,
        parentId: notebookId,
        kind: "note",
        note: note(id, notebookId),
    };
}
const root = notebookRow("root");
const child = notebookRow("child");
const other = notebookRow("other");
const otherChild = notebookRow("other-child");
const empty = notebookRow("empty");
const rootNote = noteRow("root-note", null);
const rootNote2 = noteRow("root-note-2", null);
const childNote = noteRow("child-note", "child");
const status: TreeEntry = {
    ...common,
    id: "status:root",
    parentId: "nb:root",
    kind: "status",
    nodeKey: "nb:root",
    text: "empty",
    retry: false,
};
const more: TreeEntry = {
    ...common,
    id: "more:root",
    parentId: "nb:root",
    kind: "more",
    nodeKey: "nb:root",
    loading: false,
    error: null,
};
const entries = [
    root,
    child,
    childNote,
    other,
    otherChild,
    empty,
    rootNote,
    rootNote2,
    more,
    status,
];
const drop = (active: TreeEntry, over: TreeEntry | null, zone: TreeDropZone) =>
    resolveTreeDrop({ active, over, zone, entries, notebooks });

Deno.test("note drops follow the target note's scope and position", () => {
    assertEquals(drop(childNote, rootNote, "before"), {
        valid: true,
        kind: "note",
        id: "child-note",
        notebookId: null,
        beforeId: "root-note",
    });
    assertEquals(drop(rootNote, childNote, "after"), {
        valid: true,
        kind: "note",
        id: "root-note",
        notebookId: "child",
        afterId: "child-note",
    });
    assertEquals(drop(rootNote2, rootNote, "after"), {
        valid: true,
        kind: "note",
        id: "root-note-2",
        notebookId: null,
        afterId: "root-note",
    });
    assertEquals(drop(rootNote, root, "inside"), {
        valid: true,
        kind: "note",
        id: "root-note",
        notebookId: "root",
    });
    assertEquals(drop(rootNote, child, "inside"), {
        valid: true,
        kind: "note",
        id: "root-note",
        notebookId: "child",
    });
    for (
        const [target, zone] of [
            [root, "before"],
            [child, "after"],
            [childNote, "inside"],
            [status, "inside"],
            [more, "before"],
        ] as const
    ) {
        assertEquals(drop(rootNote, target, zone).valid, false);
    }
});

Deno.test("notebook edge drops preserve the target parent and sibling anchor", () => {
    assertEquals(drop(root, other, "before"), {
        valid: true,
        kind: "notebook",
        id: "root",
        parentId: null,
        beforeId: "other",
    });
    assertEquals(drop(child, other, "after"), {
        valid: true,
        kind: "notebook",
        id: "child",
        parentId: null,
        afterId: "other",
    });
    assertEquals(drop(empty, child, "before"), {
        valid: true,
        kind: "notebook",
        id: "empty",
        parentId: "root",
        beforeId: "child",
    });
    assertEquals(drop(child, otherChild, "after"), {
        valid: true,
        kind: "notebook",
        id: "child",
        parentId: "other",
        afterId: "other-child",
    });
    assertEquals(drop(root, otherChild, "before"), {
        valid: false,
        reason: "含子笔记本的笔记本只能放在根级",
    });
    assertEquals(drop(root, otherChild, "after").valid, false);
    assertEquals(drop(root, child, "before").valid, false);
});

Deno.test("only childless notebooks can enter a root, at the end", () => {
    assertEquals(drop(empty, root, "inside"), {
        valid: true,
        kind: "notebook",
        id: "empty",
        parentId: "root",
    });
    assertEquals(drop(child, other, "inside"), {
        valid: true,
        kind: "notebook",
        id: "child",
        parentId: "other",
    });
    assertEquals(drop(root, other, "inside"), {
        valid: false,
        reason: "含子笔记本的笔记本只能放在根级",
    });
    assertEquals(drop(empty, child, "inside"), {
        valid: false,
        reason: "笔记本最多两层",
    });
    assertEquals(drop(root, child, "inside").valid, false);
});

Deno.test("only the upper edge of the first root note appends a root notebook", () => {
    assertEquals(drop(child, rootNote, "before"), {
        valid: true,
        kind: "notebook",
        id: "child",
        parentId: null,
    });
    assertEquals(drop(root, rootNote, "before"), {
        valid: true,
        kind: "notebook",
        id: "root",
        parentId: null,
    });
    for (
        const [target, zone] of [
            [rootNote, "inside"],
            [rootNote, "after"],
            [rootNote2, "before"],
            [childNote, "before"],
            [status, "before"],
            [more, "before"],
        ] as const
    ) {
        assertEquals(drop(empty, target, zone).valid, false);
    }
});

Deno.test("missing, self and non-draggable rows are rejected with a reason", () => {
    for (
        const result of [
            drop(root, null, "before"),
            drop(root, root, "inside"),
            drop(rootNote, rootNote, "before"),
            drop(status, root, "inside"),
            drop(more, root, "inside"),
        ]
    ) {
        assertEquals(result.valid, false);
        if (!result.valid) assertEquals(result.reason.length > 0, true);
    }
});
