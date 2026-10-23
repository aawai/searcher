import { assertEquals } from "@std/assert";
import { pixels, shouldRelayout } from "./library-viewport.ts";

const size = (width: number, height: number) => ({ width, height });

Deno.test("window resizes re-plan the grid", () => {
    assertEquals(shouldRelayout(size(1440, 900), size(1366, 768), false), true);
    assertEquals(shouldRelayout(size(1440, 900), size(1440, 768), false), true);
    assertEquals(
        shouldRelayout(size(1440, 900), size(1440, 900), false),
        false,
    );
});

Deno.test("a soft-keyboard height change with an editable focused does not re-plan", () => {
    assertEquals(shouldRelayout(size(390, 844), size(390, 520), true), false);
    // Rotation changes the width, so it still re-plans even while typing.
    assertEquals(shouldRelayout(size(390, 844), size(844, 390), true), true);
});

Deno.test("pixel lengths parse computed values", () => {
    assertEquals(pixels("84px"), 84);
    assertEquals(Number.isNaN(pixels("")), true);
});
