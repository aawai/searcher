import { assertEquals } from "@std/assert";
import {
    initialLibraryState,
    libraryFocusTarget,
    libraryReducer,
    shouldConfirmLibraryAction,
} from "./library-state.ts";

Deno.test("opening a note opens the library on a documents root stack and leave closes it", () => {
    const opened = libraryReducer(initialLibraryState, {
        type: "select",
        selection: { kind: "notes" },
        route: { view: "documents/edit", id: "note" },
    });
    assertEquals(opened.open, true);
    assertEquals(opened.documents.route, { view: "documents/edit", id: "note" });
    assertEquals(libraryReducer(opened, { type: "leave" }).open, false);
});

Deno.test("closing a dirty note requires confirmation, clean and filter actions do not", () => {
    assertEquals(shouldConfirmLibraryAction(true, { type: "leave" }), true);
    assertEquals(shouldConfirmLibraryAction(false, { type: "leave" }), false);
    assertEquals(
        shouldConfirmLibraryAction(true, {
            type: "documents",
            action: { type: "query", value: "query" },
        }),
        false,
    );
    assertEquals(
        shouldConfirmLibraryAction(true, {
            type: "documents",
            action: { type: "created", id: "note" },
        }),
        false,
    );
    assertEquals(
        shouldConfirmLibraryAction(true, {
            type: "documents",
            action: { type: "navigate", route: { view: "documents/edit", id: "other" } },
        }),
        true,
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

Deno.test("logout clears selection, route, search and scopes", () => {
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

Deno.test("new note creation replaces its route without adding to navigation history", () => {
    const route = {
        view: "documents/new" as const,
        target: { notebookId: "notebook", isHomeFixed: false },
    };
    const opened = libraryReducer(initialLibraryState, {
        type: "select",
        selection: { kind: "notes" },
        route,
    });
    const same = libraryReducer(opened, {
        type: "documents",
        action: { type: "navigate", route },
    });
    assertEquals(same.documents.route, route);
    const created = libraryReducer(same, {
        type: "documents",
        action: { type: "created", id: "new-note" },
    });
    assertEquals(created.documents.route, { view: "documents/edit", id: "new-note" });
    const different = libraryReducer(opened, {
        type: "documents",
        action: {
            type: "navigate",
            route: { view: "documents/new", target: { ...route.target, isHomeFixed: true } },
        },
    });
    assertEquals(different.documents.route, { view: "documents/new", target: { ...route.target, isHomeFixed: true } });
});
