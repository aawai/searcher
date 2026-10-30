import { assertEquals } from "@std/assert";
import { loadVisualRegistry } from "../../../scripts/ui-guard/registry.ts";
import { BREAKPOINTS } from "./breakpoints.ts";

Deno.test("JS breakpoints match the visual registry boundaries", async () => {
    const registry = await loadVisualRegistry();
    assertEquals([...registry.breakpoints], [0, ...Object.values(BREAKPOINTS)]);
});
