import { assertEquals, assertNotEquals } from "@std/assert";
import type { NoteItem } from "../../components/searcher/NoteCard.tsx";
import {
    createZenNoteSelectionState,
    reconcileZenNoteSelection,
    restoreZenNoteSelection,
    selectZenNoteIndex,
    sortZenHomeNotes,
    zenNoteSelectionKey,
} from "./zen-note-selection.ts";

function note(
    id: string,
    sortOrder: number,
    isHomeFixed = true,
    isPinned = false,
): NoteItem {
    return {
        id,
        body: `正文 ${id}`,
        version: 1,
        sortOrder,
        isHomeFixed,
        isPinned,
    };
}

Deno.test("Zen selection includes only fixed notes in canonical order", () => {
    const input = [
        note("ordinary-pin", 0, false, true),
        note("beta", 2),
        note("alpha", 2),
        note("first", 1),
    ];

    assertEquals(sortZenHomeNotes(input).map((item) => item.id), [
        "first",
        "alpha",
        "beta",
    ]);
    assertEquals(input.map((item) => item.id), [
        "ordinary-pin",
        "beta",
        "alpha",
        "first",
    ]);
});

Deno.test("Zen selection restores valid IDs and falls back to the first fixed note", () => {
    const notes = [note("later", 2), note("first", 1)];
    const initial = createZenNoteSelectionState("account-a", notes);

    assertEquals(restoreZenNoteSelection(initial, "later").currentId, "later");
    assertEquals(
        restoreZenNoteSelection(initial, "removed").currentId,
        "first",
    );
    assertEquals(
        restoreZenNoteSelection(initial, undefined).currentId,
        "first",
    );
});

Deno.test("Zen selection tracks the same note through edits and reordering", () => {
    const notes = [note("a", 1), note("b", 2), note("c", 3)];
    let state = createZenNoteSelectionState("account-a", notes);
    state = restoreZenNoteSelection(state, "b");

    const editedAndReordered = [
        { ...note("c", 0), title: "updated c" },
        { ...note("b", 2), title: "edited current note", body: "new body" },
        note("a", 4),
    ];
    state = reconcileZenNoteSelection(state, editedAndReordered);

    assertEquals(state.currentId, "b");
    assertEquals(state.noteIds, ["c", "b", "a"]);
});

Deno.test("removing the current note chooses its next original survivor, then its predecessor", () => {
    let state = createZenNoteSelectionState("account-a", [
        note("a", 1),
        note("b", 2),
        note("c", 3),
        note("d", 4),
    ]);
    state = restoreZenNoteSelection(state, "b");
    state = reconcileZenNoteSelection(state, [
        note("a", 1),
        note("d", 4),
    ]);
    assertEquals(state.currentId, "d");

    state = restoreZenNoteSelection(state, "d");
    state = reconcileZenNoteSelection(state, [note("a", 1)]);
    assertEquals(state.currentId, "a");
});

Deno.test("manual selection stops at the collection boundaries", () => {
    let state = createZenNoteSelectionState("account-a", [
        note("a", 1),
        note("b", 2),
        note("c", 3),
    ]);
    state = selectZenNoteIndex(state, 2);
    assertEquals(state.currentId, "c");
    assertEquals(selectZenNoteIndex(state, 3), state);
    assertEquals(selectZenNoteIndex(state, -1), state);
});

Deno.test("an empty collection has no active item and account keys are isolated", () => {
    let state = createZenNoteSelectionState("account-a", []);
    state = restoreZenNoteSelection(state, "stale-id");

    assertEquals(state.currentId, undefined);
    assertEquals(state.noteIds, []);
    assertEquals(selectZenNoteIndex(state, 0), state);
    assertNotEquals(
        zenNoteSelectionKey("account/a"),
        zenNoteSelectionKey("account-b"),
    );
});
