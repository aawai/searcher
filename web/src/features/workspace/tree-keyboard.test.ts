import { assertEquals } from "@std/assert";
import { resolveActiveId, type TreeKeyItem, treeKeyAction } from "./tree-keyboard.ts";

const item = (id: string, parentId: string | null, expandable = false, expanded = false): TreeKeyItem => ({
    id, parentId, expandable, expanded,
});
const items = [
    item("a", null, true, true),
    item("a1", "a"),
    item("a2", "a"),
    item("b", null, true, false),
    item("c", null),
];

Deno.test("tree keys move through visible items and clamp at both ends", () => {
    assertEquals(treeKeyAction(items, "a", "ArrowDown"), { type: "focus", id: "a1" });
    assertEquals(treeKeyAction(items, "c", "ArrowDown"), { type: "focus", id: "c" });
    assertEquals(treeKeyAction(items, "a1", "ArrowUp"), { type: "focus", id: "a" });
    assertEquals(treeKeyAction(items, "a", "ArrowUp"), { type: "focus", id: "a" });
    assertEquals(treeKeyAction(items, "a2", "Home"), { type: "focus", id: "a" });
    assertEquals(treeKeyAction(items, "a2", "End"), { type: "focus", id: "c" });
});

Deno.test("ArrowRight expands, then enters the first child; leaves stay put", () => {
    assertEquals(treeKeyAction(items, "b", "ArrowRight"), { type: "expand", id: "b" });
    assertEquals(treeKeyAction(items, "a", "ArrowRight"), { type: "focus", id: "a1" });
    assertEquals(treeKeyAction(items, "c", "ArrowRight"), null);
    assertEquals(treeKeyAction([item("e", null, true, true)], "e", "ArrowRight"), null);
});

Deno.test("ArrowLeft collapses an open node, otherwise moves to the parent", () => {
    assertEquals(treeKeyAction(items, "a", "ArrowLeft"), { type: "collapse", id: "a" });
    assertEquals(treeKeyAction(items, "a2", "ArrowLeft"), { type: "focus", id: "a" });
    assertEquals(treeKeyAction(items, "b", "ArrowLeft"), null);
    assertEquals(treeKeyAction(items, "c", "ArrowLeft"), null);
});

Deno.test("Enter and Space activate the active item; other keys and empty trees are ignored", () => {
    assertEquals(treeKeyAction(items, "a2", "Enter"), { type: "activate", id: "a2" });
    assertEquals(treeKeyAction(items, "b", " "), { type: "activate", id: "b" });
    assertEquals(treeKeyAction(items, "b", "x"), null);
    assertEquals(treeKeyAction([], null, "ArrowDown"), null);
    assertEquals(treeKeyAction(items, "gone", "Enter"), null);
});

Deno.test("with no active item arrows start from the first item", () => {
    assertEquals(treeKeyAction(items, null, "ArrowDown"), { type: "focus", id: "a" });
    assertEquals(treeKeyAction(items, null, "ArrowUp"), { type: "focus", id: "a" });
});

Deno.test("the roving item survives changes and falls back predictably", () => {
    assertEquals(resolveActiveId(items, "a2", "c"), "a2");
    assertEquals(resolveActiveId(items, "gone", "c"), "c");
    assertEquals(resolveActiveId(items, "gone", "nope"), "a");
    assertEquals(resolveActiveId([], "a", null), null);
});
