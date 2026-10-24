import { assertEquals } from "@std/assert";
import type { DocumentNotebookDto } from "@shared/documents.ts";
import { documentNotebookTree } from "./document-notebooks.ts";

function notebook(
    id: string,
    name: string,
    sortOrder: number,
    parentId: string | null = null,
): DocumentNotebookDto {
    return { id, name, sortOrder, parentId, createdAt: 0, updatedAt: 0 };
}

Deno.test("Notebook tree lists roots and their children in picker order", () => {
    const tree = documentNotebookTree([
        notebook("b", "读书", 2),
        notebook("a", "工作", 1),
        notebook("b-child", "摘录", 2, "b"),
        notebook("a-child", "周报", 3, "a"),
        notebook("a-child-2", "纪要", 1, "a"),
    ]);

    assertEquals(tree.roots.map((root) => root.name), ["工作", "读书"]);
    assertEquals(tree.nodes.map((node) => node.notebook.name), [
        "工作",
        "纪要",
        "周报",
        "读书",
        "摘录",
    ]);
    assertEquals(tree.nodes.map((node) => node.depth), [0, 1, 1, 0, 1]);
    assertEquals(tree.options, [
        { id: "a", label: "工作" },
        { id: "a-child-2", label: "工作 › 纪要" },
        { id: "a-child", label: "工作 › 周报" },
        { id: "b", label: "读书" },
        { id: "b-child", label: "读书 › 摘录" },
    ]);
});

Deno.test("Notebook tree exposes sibling order and child presence", () => {
    const tree = documentNotebookTree([
        notebook("root-a", "工作", 1),
        notebook("root-b", "读书", 2),
        notebook("child-w", "周报", 1, "root-a"),
        notebook("child-b", "摘录", 2, "root-b"),
        notebook("child-a", "笔记", 1, "root-b"),
    ]);

    const working = tree.nodes[0];
    assertEquals(working.hasChildren, true);
    assertEquals(working.siblings.map((sibling) => sibling.id), [
        "root-a",
        "root-b",
    ]);
    assertEquals(working.siblingIndex, 0);

    const firstChild = tree.nodes.find((node) =>
        node.notebook.id === "child-a"
    )!;
    assertEquals(firstChild.hasChildren, false);
    assertEquals(firstChild.parentName, "读书");
    assertEquals(firstChild.siblings.map((sibling) => sibling.id), [
        "child-a",
        "child-b",
    ]);
    assertEquals(firstChild.siblingIndex, 0);
});

Deno.test("Notebook tree ties equal sort orders by id and tolerates emptiness", () => {
    const tree = documentNotebookTree([
        notebook("z", "乙", 0),
        notebook("a", "甲", 0),
    ]);
    assertEquals(tree.options.map((option) => option.id), ["a", "z"]);
    assertEquals(documentNotebookTree([]), {
        roots: [],
        nodes: [],
        options: [],
    });
});
