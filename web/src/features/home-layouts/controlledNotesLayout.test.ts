import { assertEquals } from "@std/assert";
import type { NoteItem } from "../../components/searcher/NoteCard.tsx";
import { selectHomeNotes } from "./controlledNotesLayout.ts";

function note(id: string, sortOrder = 0, isHomeFixed?: boolean): NoteItem {
    return {
        id,
        title: id,
        body: "",
        color: "paper",
        version: 1,
        sortOrder,
        isHomeFixed,
    };
}

Deno.test("Home notes: only explicit home-fixed notes occupy slots", () => {
    const notes = [
        note("a", 0, true),
        note("b", 0, false),
        note("c"),
        note("d", 1, true),
    ];
    assertEquals(selectHomeNotes(notes).map((item) => item.id), ["a", "d"]);
});
Deno.test("Home notes: five slots use sort order and id tie-break without mutating source", () => {
    const notes = [
        note("f", 4, true),
        note("b", 0, true),
        note("a", 0, true),
        note("e", 3, true),
        note("d", 2, true),
        note("c", 1, true),
    ];
    const original = notes.map((item) => item.id);
    assertEquals(selectHomeNotes(notes).map((item) => item.id), [
        "a",
        "b",
        "c",
        "d",
        "e",
    ]);
    assertEquals(notes.map((item) => item.id), original);
    assertEquals(selectHomeNotes([...notes].reverse()).map((item) => item.id), [
        "a",
        "b",
        "c",
        "d",
        "e",
    ]);
});
