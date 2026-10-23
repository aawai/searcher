import { assertEquals, assertNotEquals } from "@std/assert";
import { type PaperItem, sortPapers } from "./home-papers.ts";
import {
    createZenPaperSelectionState,
    reconcileZenPaperSelection,
    restoreZenPaperSelection,
    selectZenPaperIndex,
    zenPaperSelectionKey,
} from "./zen-paper-selection.ts";

function paper(
    id: string,
    homeSortOrder: number,
    overrides: Partial<PaperItem> = {},
): PaperItem {
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
        body: `正文 ${id}`,
        version: 1,
        layout: {
            deviceClass: "desktop",
            x: null,
            y: null,
            width: null,
            zIndex: 0,
            expanded: true,
            sortOrder: null,
            updatedAt: 1,
        },
        ...overrides,
    };
}

Deno.test("Zen selection includes only fixed papers in canonical order", () => {
    const input = [
        paper("unpinned", 0, { isHomeFixed: false }),
        paper("beta", 2),
        paper("alpha", 2),
        paper("first", 1),
    ];

    assertEquals(
        createZenPaperSelectionState("account-a", input).paperIds,
        sortPapers(input).map((item) => item.id),
    );
    assertEquals(
        createZenPaperSelectionState("account-a", input).paperIds,
        ["first", "beta", "alpha"],
    );
    assertEquals(input.map((item) => item.id), [
        "unpinned",
        "beta",
        "alpha",
        "first",
    ]);
});

Deno.test("Zen selection restores valid IDs and falls back to the first fixed paper", () => {
    const papers = [paper("later", 2), paper("first", 1)];
    const initial = createZenPaperSelectionState("account-a", papers);

    assertEquals(restoreZenPaperSelection(initial, "later").currentId, "later");
    assertEquals(
        restoreZenPaperSelection(initial, "removed").currentId,
        "first",
    );
    assertEquals(
        restoreZenPaperSelection(initial, undefined).currentId,
        "first",
    );
});

Deno.test("Zen selection tracks the same paper through edits and reordering", () => {
    const papers = [paper("a", 1), paper("b", 2), paper("c", 3)];
    let state = createZenPaperSelectionState("account-a", papers);
    state = restoreZenPaperSelection(state, "b");

    const editedAndReordered = [
        paper("c", 0, { displayTitle: "updated c" }),
        paper("b", 2, {
            displayTitle: "edited current paper",
            body: "new body",
        }),
        paper("a", 4),
    ];
    state = reconcileZenPaperSelection(state, editedAndReordered);

    assertEquals(state.currentId, "b");
    assertEquals(state.paperIds, ["c", "b", "a"]);
});

Deno.test("removing the current paper chooses its next original survivor, then its predecessor", () => {
    let state = createZenPaperSelectionState("account-a", [
        paper("a", 1),
        paper("b", 2),
        paper("c", 3),
        paper("d", 4),
    ]);
    state = restoreZenPaperSelection(state, "b");
    state = reconcileZenPaperSelection(state, [
        paper("a", 1),
        paper("d", 4),
    ]);
    assertEquals(state.currentId, "d");

    state = restoreZenPaperSelection(state, "d");
    state = reconcileZenPaperSelection(state, [paper("a", 1)]);
    assertEquals(state.currentId, "a");
});

Deno.test("manual selection stops at the collection boundaries", () => {
    let state = createZenPaperSelectionState("account-a", [
        paper("a", 1),
        paper("b", 2),
        paper("c", 3),
    ]);
    state = selectZenPaperIndex(state, 2);
    assertEquals(state.currentId, "c");
    assertEquals(selectZenPaperIndex(state, 3), state);
    assertEquals(selectZenPaperIndex(state, -1), state);
});

Deno.test("an empty collection has no active item and account keys are isolated", () => {
    let state = createZenPaperSelectionState("account-a", []);
    state = restoreZenPaperSelection(state, "stale-id");

    assertEquals(state.currentId, undefined);
    assertEquals(state.paperIds, []);
    assertEquals(selectZenPaperIndex(state, 0), state);
    assertNotEquals(
        zenPaperSelectionKey("account/a"),
        zenPaperSelectionKey("account-b"),
    );
});
