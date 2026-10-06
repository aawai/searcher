import { assertEquals } from "@std/assert";
import {
    isNoteCompact,
    type NoteItem,
    type NoteLayoutDto,
} from "../../components/searcher/NoteCard.tsx";
import {
    buildToggledNoteLayout,
    selectHomeNotes,
} from "./controlledNotesLayout.ts";

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

Deno.test("buildToggledNoteLayout: undefined layout yields desktop skeleton with expanded=false and zIndex=1 (compact)", () => {
    const nextLayout = buildToggledNoteLayout(undefined);
    assertEquals(nextLayout, {
        deviceClass: "desktop",
        zIndex: 1,
        expanded: false,
    });
    assertEquals(isNoteCompact(undefined, nextLayout.expanded), true);
});

Deno.test("buildToggledNoteLayout: existing layout strictly preserves x, y, width, zIndex, sortOrder, deviceClass, and updatedAt", () => {
    const existingLayout: NoteLayoutDto = {
        deviceClass: "desktop",
        x: 123,
        y: 456,
        width: 360,
        zIndex: 7,
        expanded: true,
        sortOrder: 2,
        updatedAt: 1728000000,
    };
    const nextLayout = buildToggledNoteLayout(existingLayout);
    assertEquals(nextLayout, {
        deviceClass: "desktop",
        x: 123,
        y: 456,
        width: 360,
        zIndex: 7,
        expanded: false,
        sortOrder: 2,
        updatedAt: 1728000000,
    });
    assertEquals(isNoteCompact(undefined, nextLayout.expanded), true);

    // Toggle back from compact to expanded
    const expandedAgain = buildToggledNoteLayout(nextLayout);
    assertEquals(expandedAgain, {
        deviceClass: "desktop",
        x: 123,
        y: 456,
        width: 360,
        zIndex: 7,
        expanded: true,
        sortOrder: 2,
        updatedAt: 1728000000,
    });
    assertEquals(isNoteCompact(undefined, expandedAgain.expanded), false);
});

Deno.test("buildToggledNoteLayout: explicit nextExpanded override is honored while preserving existing attributes", () => {
    const existingLayout: NoteLayoutDto = {
        deviceClass: "tablet",
        x: 10,
        y: 20,
        width: 280,
        zIndex: 3,
        expanded: true,
        sortOrder: 1,
    };
    const forcedCompact = buildToggledNoteLayout(existingLayout, false);
    assertEquals(forcedCompact.expanded, false);
    assertEquals(forcedCompact.deviceClass, "tablet");
    assertEquals(forcedCompact.width, 280);

    const forcedFull = buildToggledNoteLayout(forcedCompact, true);
    assertEquals(forcedFull.expanded, true);
    assertEquals(forcedFull.deviceClass, "tablet");
    assertEquals(forcedFull.width, 280);
});
