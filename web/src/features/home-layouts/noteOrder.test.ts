import { assertEquals, assertNotStrictEquals } from "@std/assert";
import type { NoteItem } from "../../components/searcher/NoteCard.tsx";
import { mergeNoteOrder } from "./noteOrder.ts";

function note(
    id: string,
    sortOrder = 0,
    isHomeFixed = false,
    version = 1,
): NoteItem {
    return {
        id,
        title: id,
        body: `body-${id}`,
        color: "paper",
        version,
        sortOrder,
        isHomeFixed,
    };
}

Deno.test("mergeNoteOrder: interleaved regular and fixed notes preserve regular relative order and positions", () => {
    // 3 regular notes interleaved with 3 fixed notes
    const notes: NoteItem[] = [
        note("reg-1", 0, false),
        note("fix-1", 1, true),
        note("reg-2", 2, false),
        note("fix-2", 3, true),
        note("reg-3", 4, false),
        note("fix-3", 5, true),
    ];

    // User reverses the visible fixed notes
    const reordered: NoteItem[] = [
        note("fix-3", 5, true),
        note("fix-2", 3, true),
        note("fix-1", 1, true),
    ];

    const result = mergeNoteOrder(notes, reordered);

    // Regular note positions (indices 0, 2, 4) and relative sequence are preserved
    // Fixed note slots (indices 1, 3, 5) receive the reordered notes
    assertEquals(result.map((n) => n.id), [
        "reg-1",
        "fix-3",
        "reg-2",
        "fix-2",
        "reg-3",
        "fix-1",
    ]);
});

Deno.test("mergeNoteOrder: >5 fixed hidden tail notes are retained in stable canonical positions", () => {
    // 7 fixed notes total: first 5 are visible on home, 6th and 7th are hidden tail
    const notes: NoteItem[] = [
        note("fix-a", 0, true),
        note("fix-b", 1, true),
        note("fix-c", 2, true),
        note("fix-d", 3, true),
        note("fix-e", 4, true),
        note("fix-f", 5, true),
        note("fix-g", 6, true),
    ];

    // Reorder visible subset (5 items): move fix-e to top
    const reorderedVisible: NoteItem[] = [
        note("fix-e", 4, true),
        note("fix-a", 0, true),
        note("fix-b", 1, true),
        note("fix-c", 2, true),
        note("fix-d", 3, true),
    ];

    const result = mergeNoteOrder(notes, reorderedVisible);

    // Visible slots 0-4 reordered; hidden 6th (fix-f) and 7th (fix-g) remain untouched at indices 5 and 6
    assertEquals(result.map((n) => n.id), [
        "fix-e",
        "fix-a",
        "fix-b",
        "fix-c",
        "fix-d",
        "fix-f",
        "fix-g",
    ]);
});

Deno.test("mergeNoteOrder: ties in sortOrder are stable via id ASC tie-breaking", () => {
    // Tied sortOrder with scrambled array insertion order
    const notes: NoteItem[] = [
        note("charlie", 0, true),
        note("alice", 0, true),
        note("bob", 0, true),
        note("delta", 0, false),
    ];

    // Canonical order by sortOrder ASC, id ASC is: alice, bob, charlie, delta
    // Reorder visible subset (alice, bob, charlie) -> [bob, charlie, alice]
    const reordered: NoteItem[] = [
        note("bob", 0, true),
        note("charlie", 0, true),
        note("alice", 0, true),
    ];

    const result = mergeNoteOrder(notes, reordered);

    assertEquals(result.map((n) => n.id), [
        "bob",
        "charlie",
        "alice",
        "delta",
    ]);

    // Ties with null or undefined sortOrder treat them as 0 and break ties by id ASC
    const notesWithNulls: NoteItem[] = [
        { ...note("c", 0, true), sortOrder: null },
        { ...note("a", 0, true), sortOrder: undefined },
        { ...note("b", 0, true), sortOrder: 0 },
    ];
    // Canonical order is [a, b, c]
    const reorderedNulls = [notesWithNulls[0], notesWithNulls[1]]; // [c, a]
    const resultNulls = mergeNoteOrder(notesWithNulls, reorderedNulls);
    // Slot 0 (a) gets c, slot 1 (b) is untouched, slot 2 (c) gets a -> [c, b, a]
    assertEquals(resultNulls.map((n) => n.id), ["c", "b", "a"]);
});

Deno.test("mergeNoteOrder: pure helper never mutates input arrays or note objects", () => {
    const notes: NoteItem[] = [
        note("b", 1, true),
        note("a", 0, true),
        note("c", 2, false),
    ];
    const notesSnapshot = structuredClone(notes);

    const reordered: NoteItem[] = [
        note("b", 1, true),
        note("a", 0, true),
    ];
    const reorderedSnapshot = structuredClone(reordered);

    const result = mergeNoteOrder(notes, reordered);

    // Inputs remain strictly unmodified
    assertEquals(notes, notesSnapshot);
    assertEquals(reordered, reorderedSnapshot);

    // Returns a fresh array reference
    assertNotStrictEquals(result, notes);
    assertNotStrictEquals(result, reordered);
});

Deno.test("mergeNoteOrder: stale, unknown, or duplicate subset safely yields canonical order", () => {
    const notes: NoteItem[] = [
        note("n1", 0, true, 2),
        note("n2", 1, true, 1),
        note("n3", 2, true, 1),
    ];
    const canonicalIds = ["n1", "n2", "n3"];

    // 1. Unknown subset: contains an id not present in notes
    const withUnknown: NoteItem[] = [
        note("ghost", 0, true, 1),
        note("n1", 0, true, 2),
    ];
    assertEquals(
        mergeNoteOrder(notes, withUnknown).map((n) => n.id),
        canonicalIds,
    );

    // 2. Duplicate subset: contains repeated id
    const withDuplicate: NoteItem[] = [
        note("n1", 0, true, 2),
        note("n1", 0, true, 2),
    ];
    assertEquals(
        mergeNoteOrder(notes, withDuplicate).map((n) => n.id),
        canonicalIds,
    );

    // 3. Stale version subset: note version mismatch against canonical note
    const withStaleVersion: NoteItem[] = [
        note("n2", 1, true, 1),
        note("n1", 0, true, 1), // stale: canonical n1 is version 2
    ];
    assertEquals(
        mergeNoteOrder(notes, withStaleVersion).map((n) => n.id),
        canonicalIds,
    );

    // 4. Stale subset with deleted note (id previously known, now absent)
    const withDeletedNote: NoteItem[] = [
        note("n2", 1, true, 1),
        note("deleted-note-id", 99, true, 1),
    ];
    assertEquals(
        mergeNoteOrder(notes, withDeletedNote).map((n) => n.id),
        canonicalIds,
    );

    // 5. Empty reordered subset returns canonical order without data loss
    assertEquals(
        mergeNoteOrder(notes, []).map((n) => n.id),
        canonicalIds,
    );

    // 6. Empty notes returns empty array
    assertEquals(mergeNoteOrder([], [note("n1", 0)]), []);
});
