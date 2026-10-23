import { assertEquals } from "@std/assert";
import { decideOmniboxKey, type OmniboxKeyInput } from "./omnibox-keys.ts";

const base: OmniboxKeyInput = {
    key: "Enter",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    composing: false,
    open: true,
    optionCount: 3,
    aiAvailable: true,
    canCapture: true,
    hasText: true,
};
const press = (patch: Partial<OmniboxKeyInput>) =>
    decideOmniboxKey({ ...base, ...patch });

Deno.test("Enter submits (selection or default engine); Mod+Enter submits in a new tab", () => {
    assertEquals(press({}), { type: "submit", newTab: false });
    assertEquals(press({ open: false }), { type: "submit", newTab: false });
    assertEquals(press({ ctrlKey: true }), { type: "submit", newTab: true });
    assertEquals(press({ metaKey: true }), { type: "submit", newTab: true });
    assertEquals(press({ ctrlKey: true, metaKey: true }), { type: "ignore" });
});

Deno.test("Alt+Enter hands input to AI only when a model is usable", () => {
    assertEquals(press({ altKey: true }), { type: "ask-ai" });
    assertEquals(press({ altKey: true, aiAvailable: false }), {
        type: "ignore",
    });
    assertEquals(press({ altKey: true, hasText: false }), { type: "ignore" });
    assertEquals(press({ altKey: true, shiftKey: true }), { type: "ignore" });
});

Deno.test("Shift+Enter captures only for a signed-in user with text", () => {
    assertEquals(press({ shiftKey: true }), { type: "capture" });
    assertEquals(press({ shiftKey: true, canCapture: false }), {
        type: "ignore",
    });
    assertEquals(press({ shiftKey: true, hasText: false }), {
        type: "ignore",
    });
});

Deno.test("Tab is never captured and arrows only move through an open list", () => {
    assertEquals(press({ key: "Tab" }), { type: "ignore" });
    assertEquals(press({ key: "Tab", shiftKey: true }), { type: "ignore" });
    assertEquals(press({ key: "ArrowDown" }), { type: "move", step: 1 });
    assertEquals(press({ key: "ArrowUp" }), { type: "move", step: -1 });
    assertEquals(press({ key: "ArrowDown", open: false }), {
        type: "ignore",
    });
    assertEquals(press({ key: "ArrowDown", optionCount: 0 }), {
        type: "ignore",
    });
    assertEquals(press({ key: "ArrowDown", altKey: true }), {
        type: "ignore",
    });
});

Deno.test("Escape closes the suggestions first, then yields to outer layers", () => {
    assertEquals(press({ key: "Escape" }), { type: "close" });
    assertEquals(press({ key: "Escape", open: false }), { type: "ignore" });
});

Deno.test("IME composition: Enter variants are swallowed, every other key is left to the IME", () => {
    for (
        const patch of [
            {},
            { altKey: true },
            { shiftKey: true },
            { ctrlKey: true },
        ] satisfies Partial<OmniboxKeyInput>[]
    ) {
        assertEquals(press({ ...patch, composing: true }), { type: "swallow" });
    }
    for (const key of ["Escape", "ArrowDown", "ArrowUp", "Tab"]) {
        assertEquals(press({ key, composing: true }), { type: "ignore" });
    }
});
