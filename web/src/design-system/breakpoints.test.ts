import { assertEquals } from "@std/assert";
import { loadVisualRegistry } from "../../../scripts/ui-guard/registry.ts";
import { BREAKPOINTS, MEDIA_QUERIES } from "./breakpoints.ts";

Deno.test("JS media queries track the documented exclusive width boundaries", async () => {
    const registry = await loadVisualRegistry();
    assertEquals([...registry.breakpoints], [0, ...Object.values(BREAKPOINTS)]);
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
