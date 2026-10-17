import { assertEquals } from "@std/assert";
import {
    DEFAULT_DESKTOP_SCENE,
    DESKTOP_SCENE_IDS,
    normalizeDesktopScene,
} from "./desktop-scenes.ts";

Deno.test("desktop-scenes: registered ids survive normalization", () => {
    for (const id of DESKTOP_SCENE_IDS) {
        assertEquals(normalizeDesktopScene(id), id);
    }
});

Deno.test("desktop-scenes: missing, corrupted and unknown ids fall back to none", () => {
    assertEquals(DEFAULT_DESKTOP_SCENE, "none");
    for (
        const raw of [
            undefined,
            null,
            "",
            "undersea",
            "AMUSEMENT-PARK",
            0,
            {},
            ["amusement-park"],
        ]
    ) {
        assertEquals(normalizeDesktopScene(raw), "none");
    }
});
