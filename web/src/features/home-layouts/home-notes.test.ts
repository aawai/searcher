import { assertEquals } from "@std/assert";
import {
    defaultNoteLayout,
    hasSavedCell,
    type HomeNoteItem,
    needsNoteRefresh,
    setNote,
    sortNotes,
} from "./home-notes.ts";

function note(
    id: string,
    homeSortOrder: number,
    overrides: Partial<HomeNoteItem> = {},
): HomeNoteItem {
    return {
        id,
        title: null,
        displayTitle: id,
        snippet: "",
        notebookId: "notebook",
        isFavorite: false,
        color: "paper",
        isHomeFixed: true,
        homeSortOrder,
        createdAt: 1,
        updatedAt: 1,
        body: "",
        version: 1,
        layout: {
            col: null,
            row: null,
            size: "s",
            updatedAt: 1,
        },
        ...overrides,
    };
}

Deno.test("home notes sort by homeSortOrder then createdAt then id", () => {
    const input = [
        note("beta", 2, { createdAt: 20 }),
        note("alpha", 2, { createdAt: 20 }),
        note("first", 1, { createdAt: 30 }),
        note("unpinned", 0, { isHomeFixed: false }),
    ];

    assertEquals(sortNotes(input).map((item) => item.id), [
        "first",
        "alpha",
        "beta",
    ]);
    assertEquals(input.map((item) => item.id), [
        "beta",
        "alpha",
        "first",
        "unpinned",
    ]);
});

Deno.test("refresh is required for unknown notes and moved versions only", () => {
    const current = note("a", 1, { version: 3 });

    assertEquals(needsNoteRefresh(undefined, 1), true);
    assertEquals(needsNoteRefresh(current, 3), false);
    assertEquals(needsNoteRefresh(current, 4), true);
});

Deno.test("setNote removes on null and keeps the newer local version on stale input", () => {
    const notes = [note("a", 1, { version: 2 }), note("b", 2)];

    assertEquals(
        setNote(notes, "a", null).map((item) => item.id),
        ["b"],
    );
    assertEquals(
        setNote(notes, "a", note("a", 1, { version: 1 }))[0].version,
        2,
    );
    assertEquals(
        setNote(notes, "a", note("a", 1, { version: 3 }))[0].version,
        3,
    );
    assertEquals(
        setNote(notes, "c", note("c", 0)).map((item) => item.id),
        ["c", "a", "b"],
    );
});

Deno.test("a note needs both a saved column and row to keep a cell", () => {
    const layout = note("a", 1).layout;

    assertEquals(hasSavedCell(note("a", 1)), false);
    assertEquals(
        hasSavedCell(note("a", 1, { layout: { ...layout, col: 4 } })),
        false,
    );
    assertEquals(
        hasSavedCell(note("a", 1, { layout: { ...layout, col: 4, row: 1 } })),
        true,
    );
    assertEquals(defaultNoteLayout(), {
        col: null,
        row: null,
        size: "s",
        updatedAt: 0,
    });
});
