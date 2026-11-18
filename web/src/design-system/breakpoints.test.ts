import { assertEquals } from "@std/assert";
import { loadVisualRegistry } from "../../../scripts/ui-guard/registry.ts";
import {
    BREAKPOINTS,
    hasPersistentNotesSidebar,
    MEDIA_QUERIES,
} from "./breakpoints.ts";

Deno.test("JS media queries track the documented exclusive width boundaries", async () => {
    const registry = await loadVisualRegistry();
    const { notesSidebar: _notesSidebar, ...registered } = BREAKPOINTS;
    assertEquals([...registry.breakpoints], [0, ...Object.values(registered)]);
    for (
        const [width, query] of [
            [BREAKPOINTS.small, MEDIA_QUERIES.belowSmall],
            [BREAKPOINTS.medium, MEDIA_QUERIES.belowMedium],
            [BREAKPOINTS.wide, MEDIA_QUERIES.belowWide],
        ] as const
    ) {
        assertEquals(query, `(max-width: ${width - 1}px)`);
    }
});

Deno.test("default notes host is persistent at the measured boundary", () => {
    assertEquals(hasPersistentNotesSidebar(958), true);
    assertEquals(
        hasPersistentNotesSidebar(BREAKPOINTS.notesSidebar - 1),
        false,
    );
    assertEquals(hasPersistentNotesSidebar(BREAKPOINTS.notesSidebar), true);
});

Deno.test("pointer touch queries and width layout queries stay strictly separated", () => {
    assertEquals(
        MEDIA_QUERIES.touchTarget,
        "(any-pointer: coarse), (hover: none)",
    );
    assertEquals(
        MEDIA_QUERIES.fineHoverPointer,
        "(hover: hover) and (pointer: fine)",
    );
    for (
        const widthQuery of [
            MEDIA_QUERIES.belowSmall,
            MEDIA_QUERIES.belowMedium,
            MEDIA_QUERIES.belowWide,
        ]
    ) {
        assertEquals(widthQuery.includes("pointer"), false);
        assertEquals(widthQuery.includes("hover"), false);
    }
    for (
        const pointerQuery of [
            MEDIA_QUERIES.coarsePointer,
            MEDIA_QUERIES.touchTarget,
            MEDIA_QUERIES.fineHoverPointer,
        ]
    ) {
        assertEquals(pointerQuery.includes("width"), false);
    }
});
