import { assertEquals } from "jsr:@std/assert";
import {
    initialLibraryState,
    libraryFocusTarget,
    libraryReducer,
    shouldConfirmLibraryAction,
} from "./library-state.ts";

Deno.test("opening a note is an overlay, not a home scene change", () => {
    const opened = libraryReducer(initialLibraryState, {
        type: "select",
        selection: { kind: "notes" },
        route: { view: "documents/edit", id: "note" },
    });
    assertEquals(opened.open, true);
    assertEquals("stage" in opened, false);
    assertEquals(opened.documents.stack, [{ view: "documents/root" }]);
    assertEquals(libraryReducer(opened, { type: "close" }).open, false);
});

Deno.test("closing a dirty note requires confirmation, clean and filter actions do not", () => {
    assertEquals(shouldConfirmLibraryAction(true, { type: "close" }), true);
    assertEquals(shouldConfirmLibraryAction(true, { type: "list" }), true);
    assertEquals(shouldConfirmLibraryAction(false, { type: "close" }), false);
    assertEquals(
        shouldConfirmLibraryAction(true, {
            type: "documents",
            action: { type: "query", value: "query" },
        }),
        false,
    );
});

Deno.test("close returns to its trigger, detached trigger falls back to search", () => {
    const trigger = { isConnected: true };
    const search = { isConnected: true };
    assertEquals(libraryFocusTarget(trigger, search), trigger);
    trigger.isConnected = false;
    assertEquals(libraryFocusTarget(trigger, search), search);
    assertEquals(libraryFocusTarget(null, search), search);
});

Deno.test("logout clears selection, route stack, search and scopes", () => {
    const open = libraryReducer(initialLibraryState, {
        type: "select",
        selection: { kind: "notes" },
        route: { view: "documents/edit", id: "private" },
    });
    const searched = libraryReducer(open, {
        type: "documents",
        action: { type: "query", value: "private" },
    });
    assertEquals(
        libraryReducer(searched, { type: "reset" }),
        initialLibraryState,
    );
});
