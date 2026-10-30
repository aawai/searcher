import { assertEquals } from "@std/assert";
import {
    type DocumentsWorkspaceState,
    domainWorkspaceReducer,
    initialDocumentsWorkspaceState,
} from "./workspace-state.ts";

function reduce(
    state: DocumentsWorkspaceState,
    action: Parameters<typeof domainWorkspaceReducer>[1],
): DocumentsWorkspaceState {
    return domainWorkspaceReducer(state, action) as DocumentsWorkspaceState;
}

Deno.test("Workspace: documents/edit returns to documents/root on Back while preserving scope", () => {
    let state: DocumentsWorkspaceState = {
        ...initialDocumentsWorkspaceState,
        scope: { type: "notebook", notebookId: "nb-7" },
    };
    state = reduce(state, {
        type: "navigate",
        route: { view: "documents/edit", id: "doc-999" },
    });
    assertEquals(state.route, { view: "documents/edit", id: "doc-999" });
    assertEquals(state.stack.length, 1);
    state = reduce(state, { type: "back" });
    assertEquals(state.route, { view: "documents/root" });
    assertEquals(state.stack, []);
    assertEquals(state.scope, { type: "notebook", notebookId: "nb-7" });
});

Deno.test("Workspace: navigating to the root clears the stack while retaining query and scope", () => {
    let docs: DocumentsWorkspaceState = {
        ...initialDocumentsWorkspaceState,
        scope: { type: "favorite" },
    };
    docs = reduce(docs, { type: "query", value: "search-docs" });
    docs = reduce(docs, {
        type: "navigate",
        route: { view: "documents/edit", id: "doc-favorite-1" },
    });
    assertEquals(docs.stack.length, 1);
    docs = reduce(docs, {
        type: "navigate",
        route: { view: "documents/root" },
    });
    assertEquals(docs.route, { view: "documents/root" });
    assertEquals(docs.stack, []);
    assertEquals(docs.query, "search-docs");
    assertEquals(docs.scope, { type: "favorite" });
});

Deno.test("Workspace: navigating to an existing stack route unwinds the stack", () => {
    let state = reduce(initialDocumentsWorkspaceState, {
        type: "navigate",
        route: { view: "documents/edit", id: "d1" },
    });
    state = reduce(state, {
        type: "navigate",
        route: { view: "documents/edit", id: "d2" },
    });
    assertEquals(state.route, { view: "documents/edit", id: "d2" });
    assertEquals(state.stack.length, 2);
    state = reduce(state, {
        type: "navigate",
        route: { view: "documents/edit", id: "d1" },
    });
    assertEquals(state.route, { view: "documents/edit", id: "d1" });
    assertEquals(state.stack.length, 1);
});

Deno.test("Workspace: documents scope is preserved across query, navigate, and back operations", () => {
    let docs: DocumentsWorkspaceState = {
        ...initialDocumentsWorkspaceState,
        scope: { type: "notebook", notebookId: "nb-42" },
    };
    docs = reduce(docs, { type: "query", value: "my-query" });
    docs = reduce(docs, {
        type: "navigate",
        route: { view: "documents/edit", id: "d-0" },
    });
    docs = reduce(docs, {
        type: "navigate",
        route: { view: "documents/edit", id: "d-1" },
    });
    docs = reduce(docs, { type: "back" });
    assertEquals(docs.scope, { type: "notebook", notebookId: "nb-42" });
    assertEquals(docs.route, { view: "documents/edit", id: "d-0" });
    assertEquals(docs.query, "my-query");
});

Deno.test("Workspace: reset returns the documents domain to its initial state", () => {
    let docs: DocumentsWorkspaceState = {
        ...initialDocumentsWorkspaceState,
        scope: { type: "favorite" },
    };
    docs = reduce(docs, { type: "query", value: "docs-query" });
    docs = reduce(docs, {
        type: "navigate",
        route: { view: "documents/edit", id: "d1" },
    });
    docs = reduce(docs, { type: "reset" });
    assertEquals(docs, initialDocumentsWorkspaceState);
});
