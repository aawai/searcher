import { assertEquals } from "@std/assert";
import {
    hasSavedDesktopPosition,
    needsPaperRefresh,
    type PaperItem,
    setPaper,
    sortPapers,
} from "./home-papers.ts";

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
        body: "",
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

Deno.test("home papers sort by homeSortOrder then id descending", () => {
    const input = [
        paper("beta", 2),
        paper("alpha", 2),
        paper("first", 1),
        paper("unpinned", 0, { isHomeFixed: false }),
    ];

    assertEquals(sortPapers(input).map((item) => item.id), [
        "first",
        "beta",
        "alpha",
    ]);
    assertEquals(input.map((item) => item.id), [
        "beta",
        "alpha",
        "first",
        "unpinned",
    ]);
});

Deno.test("refresh is required for unknown papers and moved versions only", () => {
    const current = paper("a", 1, { version: 3 });

    assertEquals(needsPaperRefresh(undefined, 1), true);
    assertEquals(needsPaperRefresh(current, 3), false);
    assertEquals(needsPaperRefresh(current, 4), true);
});

Deno.test("setPaper removes on null and keeps the newer local version on stale input", () => {
    const papers = [paper("a", 1, { version: 2 }), paper("b", 2)];

    assertEquals(
        setPaper(papers, "a", null).map((item) => item.id),
        ["b"],
    );
    assertEquals(
        setPaper(papers, "a", paper("a", 1, { version: 1 }))[0].version,
        2,
    );
    assertEquals(
        setPaper(papers, "a", paper("a", 1, { version: 3 }))[0].version,
        3,
    );
    assertEquals(
        setPaper(papers, "c", paper("c", 0)).map((item) => item.id),
        ["c", "a", "b"],
    );
});

Deno.test("desktop placement requires both saved coordinates", () => {
    const layout = paper("a", 1).layout;

    assertEquals(hasSavedDesktopPosition(paper("a", 1)), false);
    assertEquals(
        hasSavedDesktopPosition(paper("a", 1, { layout: { ...layout, x: 4 } })),
        false,
    );
    assertEquals(
        hasSavedDesktopPosition(
            paper("a", 1, { layout: { ...layout, x: 4, y: 8 } }),
        ),
        true,
    );
});
