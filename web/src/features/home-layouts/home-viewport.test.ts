import { assertEquals } from "@std/assert";
import { homeViewport } from "./home-viewport.ts";

Deno.test("home viewport: free rect sits below chrome inside the page margin", () => {
    assertEquals(homeViewport(1440, 900, 56, 32), {
        viewportWidth: 1440,
        chromeBottom: 56,
        availableRect: { x: 32, y: 56, width: 1376, height: 812 },
    });
});

Deno.test("home viewport: margins and chrome never produce negative sizes", () => {
    assertEquals(homeViewport(40, 60, 900, 32), {
        viewportWidth: 40,
        chromeBottom: 60,
        availableRect: { x: 32, y: 60, width: 0, height: 0 },
    });
    assertEquals(homeViewport(-1440, -900, -64, -16), {
        viewportWidth: 0,
        chromeBottom: 0,
        availableRect: { x: 0, y: 0, width: 0, height: 0 },
    });
});

Deno.test("home viewport: non-finite inputs fall back to zero", () => {
    assertEquals(homeViewport(1440, 900, NaN, NaN), {
        viewportWidth: 1440,
        chromeBottom: 0,
        availableRect: { x: 0, y: 0, width: 1440, height: 900 },
    });
});
