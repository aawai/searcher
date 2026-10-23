import { assertEquals } from "@std/assert";
import {
    areWorkspaceRoutesEqual,
    type DocumentsWorkspaceState,
    domainWorkspaceReducer,
    initialDocumentsWorkspaceState,
    parentWorkspaceRoute,
} from "./workspace-state.ts";

function reduce(
    state: DocumentsWorkspaceState,
    action: Parameters<typeof domainWorkspaceReducer>[1],
): DocumentsWorkspaceState {
    return domainWorkspaceReducer(state, action) as DocumentsWorkspaceState;
}

Deno.test("Workspace: documents/create returns to documents/root on Back", () => {
    let state = reduce(initialDocumentsWorkspaceState, {
        type: "navigate",
        route: { view: "documents/create" },
    });
    assertEquals(state.route, { view: "documents/create" });
    assertEquals(state.stack.length, 1);
    state = reduce(state, { type: "back" });
    assertEquals(state.route, { view: "documents/root" });
    assertEquals(state.stack, []);
    assertEquals(state.scope, { type: "all" });
});

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

Deno.test("Workspace: every documents route falls back to documents/root", () => {
    for (
        const route of [
            { view: "documents/create" },
            { view: "documents/edit", id: "doc-1" },
            { view: "documents/root" },
        ] as const
    ) {
        assertEquals(parentWorkspaceRoute(route), { view: "documents/root" });
    }
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
        route: { view: "documents/create" },
    });
    state = reduce(state, {
        type: "navigate",
        route: { view: "documents/edit", id: "d1" },
    });
    assertEquals(state.stack.length, 2);
    state = reduce(state, {
        type: "navigate",
        route: { view: "documents/create" },
    });
    assertEquals(state.route, { view: "documents/create" });
    assertEquals(state.stack.length, 1);
});

Deno.test("Workspace: areWorkspaceRoutesEqual discriminates documents routes", () => {
    assertEquals(
        areWorkspaceRoutesEqual(
            { view: "documents/edit", id: "doc-1" },
            { view: "documents/edit", id: "doc-1" },
        ),
        true,
    );
    assertEquals(
        areWorkspaceRoutesEqual(
            { view: "documents/edit", id: "doc-1" },
            { view: "documents/edit", id: "doc-2" },
        ),
        false,
    );
    assertEquals(
        areWorkspaceRoutesEqual(
            { view: "documents/root" },
            { view: "documents/create" },
        ),
        false,
    );
});

Deno.test("Workspace: documents scope is preserved across query, navigate, and back operations", () => {
    let docs: DocumentsWorkspaceState = {
        ...initialDocumentsWorkspaceState,
        scope: { type: "notebook", notebookId: "nb-42" },
    };
    docs = reduce(docs, { type: "query", value: "my-query" });
    docs = reduce(docs, {
        type: "navigate",
        route: { view: "documents/create" },
    });
    docs = reduce(docs, {
        type: "navigate",
        route: { view: "documents/edit", id: "d-1" },
    });
    docs = reduce(docs, { type: "back" });
    assertEquals(docs.scope, { type: "notebook", notebookId: "nb-42" });
    assertEquals(docs.route, { view: "documents/create" });
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
