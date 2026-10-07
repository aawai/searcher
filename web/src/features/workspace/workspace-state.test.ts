import { assertEquals } from "@std/assert";
import {
    type AppsRoute,
    areWorkspaceRoutesEqual,
    type DocumentsWorkspaceState,
    domainWorkspaceReducer,
    type DomainWorkspaceState,
    initialAppsWorkspaceState,
    initialDocumentsWorkspaceState,
    initialNotesWorkspaceState,
    type NotesRoute,
    parentWorkspaceRoute,
} from "./workspace-state.ts";

Deno.test("Workspace: independent domains maintain routes, stacks and queries separately across all three domains", () => {
    // Apps domain navigation & query
    let appsState: DomainWorkspaceState<AppsRoute> = initialAppsWorkspaceState;
    appsState = domainWorkspaceReducer(appsState, {
        type: "query",
        value: "work",
    });
    appsState = domainWorkspaceReducer(appsState, {
        type: "navigate",
        route: { view: "apps/create", groupId: "folder-1" },
    });
    assertEquals(appsState.route, {
        view: "apps/create",
        groupId: "folder-1",
    });
    assertEquals(appsState.query, "work");
    assertEquals(appsState.stack.length, 1);

    // Notes domain navigation & query - does not affect apps
    let notesState: DomainWorkspaceState<NotesRoute> =
        initialNotesWorkspaceState;
    notesState = domainWorkspaceReducer(notesState, {
        type: "query",
        value: "draft",
    });
    notesState = domainWorkspaceReducer(notesState, {
        type: "navigate",
        route: { view: "notes/edit", id: "note-1" },
    });
    assertEquals(notesState.route, { view: "notes/edit", id: "note-1" });
    assertEquals(notesState.query, "draft");
    assertEquals(notesState.stack.length, 1);

    // Documents domain navigation, query, and scope - does not affect apps or notes
    let docsState: DocumentsWorkspaceState = {
        ...initialDocumentsWorkspaceState,
        scope: { type: "recent" },
    };
    docsState = domainWorkspaceReducer(docsState, {
        type: "query",
        value: "specs",
    }) as DocumentsWorkspaceState;
    docsState = domainWorkspaceReducer(docsState, {
        type: "navigate",
        route: { view: "documents/edit", id: "doc-101" },
    }) as DocumentsWorkspaceState;
    assertEquals(docsState.route, { view: "documents/edit", id: "doc-101" });
    assertEquals(docsState.query, "specs");
    assertEquals(docsState.scope, { type: "recent" });
    assertEquals(docsState.stack.length, 1);

    // Verify apps and notes remain completely unaffected
    assertEquals(appsState.route, {
        view: "apps/create",
        groupId: "folder-1",
    });
    assertEquals(appsState.query, "work");
    assertEquals(notesState.route, { view: "notes/edit", id: "note-1" });
    assertEquals(notesState.query, "draft");

    // Back in documents returns to documents/root while retaining query and scope
    docsState = domainWorkspaceReducer(docsState, {
        type: "back",
    }) as DocumentsWorkspaceState;
    assertEquals(docsState.route, { view: "documents/root" });
    assertEquals(docsState.stack, []);
    assertEquals(docsState.query, "specs");
    assertEquals(docsState.scope, { type: "recent" });

    // Back in apps returns to apps/root
    appsState = domainWorkspaceReducer(appsState, { type: "back" });
    assertEquals(appsState.route, { view: "apps/root" });
    assertEquals(appsState.stack, []);
    assertEquals(appsState.query, "work");

    // Notes is still in nested edit; Docs is still at root with its scope & query preserved
    assertEquals(notesState.route, { view: "notes/edit", id: "note-1" });
    assertEquals(notesState.query, "draft");
    assertEquals(docsState.route, { view: "documents/root" });
    assertEquals(docsState.query, "specs");
    assertEquals(docsState.scope, { type: "recent" });

    // Back in notes returns to notes/root
    notesState = domainWorkspaceReducer(notesState, { type: "back" });
    assertEquals(notesState.route, { view: "notes/root" });
    assertEquals(notesState.stack, []);
    assertEquals(notesState.query, "draft");
});

Deno.test("Workspace: apps/create returns to apps/root on Back", () => {
    // Without groupId
    {
        let state: DomainWorkspaceState<AppsRoute> = initialAppsWorkspaceState;
        state = domainWorkspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/create" },
        });
        assertEquals(state.route, { view: "apps/create" });
        state = domainWorkspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/root" });
    }

    // With groupId
    {
        let state: DomainWorkspaceState<AppsRoute> = initialAppsWorkspaceState;
        state = domainWorkspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/create", groupId: "folder-dev" },
        });
        assertEquals(state.route, {
            view: "apps/create",
            groupId: "folder-dev",
        });
        state = domainWorkspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/root" });
    }
});

Deno.test("Workspace: apps/edit returns to apps/root on Back", () => {
    let state: DomainWorkspaceState<AppsRoute> = initialAppsWorkspaceState;
    state = domainWorkspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/edit", id: "app-123" },
    });
    assertEquals(state.route, { view: "apps/edit", id: "app-123" });
    state = domainWorkspaceReducer(state, { type: "back" });
    assertEquals(state.route, { view: "apps/root" });
});

Deno.test("Workspace: notes/edit returns to notes/root on Back", () => {
    let state: DomainWorkspaceState<NotesRoute> = initialNotesWorkspaceState;
    state = domainWorkspaceReducer(state, {
        type: "navigate",
        route: { view: "notes/edit", id: "note-abc" },
    });
    assertEquals(state.route, { view: "notes/edit", id: "note-abc" });
    state = domainWorkspaceReducer(state, { type: "back" });
    assertEquals(state.route, { view: "notes/root" });
});
Deno.test("Workspace: documents/create returns to documents/root on Back", () => {
    let state: DocumentsWorkspaceState = initialDocumentsWorkspaceState;
    state = domainWorkspaceReducer(state, {
        type: "navigate",
        route: { view: "documents/create" },
    }) as DocumentsWorkspaceState;
    assertEquals(state.route, { view: "documents/create" });
    assertEquals(state.stack.length, 1);
    state = domainWorkspaceReducer(state, {
        type: "back",
    }) as DocumentsWorkspaceState;
    assertEquals(state.route, { view: "documents/root" });
    assertEquals(state.stack, []);
    assertEquals(state.scope, { type: "all" });
});

Deno.test("Workspace: documents/edit returns to documents/root on Back while preserving scope", () => {
    let state: DocumentsWorkspaceState = {
        ...initialDocumentsWorkspaceState,
        scope: { type: "notebook", notebookId: "nb-7" },
    };
    state = domainWorkspaceReducer(state, {
        type: "navigate",
        route: { view: "documents/edit", id: "doc-999" },
    }) as DocumentsWorkspaceState;
    assertEquals(state.route, { view: "documents/edit", id: "doc-999" });
    assertEquals(state.stack.length, 1);
    state = domainWorkspaceReducer(state, {
        type: "back",
    }) as DocumentsWorkspaceState;
    assertEquals(state.route, { view: "documents/root" });
    assertEquals(state.stack, []);
    assertEquals(state.scope, { type: "notebook", notebookId: "nb-7" });
});

Deno.test("Workspace: parentWorkspaceRoute safe fallback provides correct defaults across all three domains", () => {
    // Apps routes fallback to apps/root
    assertEquals(parentWorkspaceRoute({ view: "apps/create" }), {
        view: "apps/root",
    });
    assertEquals(
        parentWorkspaceRoute({ view: "apps/create", groupId: "work" }),
        {
            view: "apps/root",
        },
    );
    assertEquals(parentWorkspaceRoute({ view: "apps/edit", id: "app-1" }), {
        view: "apps/root",
    });
    assertEquals(parentWorkspaceRoute({ view: "apps/root" }), {
        view: "apps/root",
    });

    // Notes routes fallback to notes/root
    assertEquals(parentWorkspaceRoute({ view: "notes/edit", id: "note-1" }), {
        view: "notes/root",
    });
    assertEquals(parentWorkspaceRoute({ view: "notes/root" }), {
        view: "notes/root",
    });

    // Documents routes fallback to documents/root
    assertEquals(parentWorkspaceRoute({ view: "documents/create" }), {
        view: "documents/root",
    });
    assertEquals(
        parentWorkspaceRoute({ view: "documents/edit", id: "doc-1" }),
        {
            view: "documents/root",
        },
    );
    assertEquals(parentWorkspaceRoute({ view: "documents/root" }), {
        view: "documents/root",
    });
});

Deno.test("Workspace: navigating to domain root clears navigation stack while retaining query and scope", () => {
    // Apps domain
    let appsState: DomainWorkspaceState<AppsRoute> = initialAppsWorkspaceState;
    appsState = domainWorkspaceReducer(appsState, {
        type: "query",
        value: "search-apps",
    });
    appsState = domainWorkspaceReducer(appsState, {
        type: "navigate",
        route: { view: "apps/create", groupId: "folder-1" },
    });
    assertEquals(appsState.stack.length, 1);
    appsState = domainWorkspaceReducer(appsState, {
        type: "navigate",
        route: { view: "apps/root" },
    });
    assertEquals(appsState.route, { view: "apps/root" });
    assertEquals(appsState.stack, []);
    assertEquals(appsState.query, "search-apps");

    // Documents domain with custom scope
    let docsState: DocumentsWorkspaceState = {
        ...initialDocumentsWorkspaceState,
        scope: { type: "favorite" },
    };
    docsState = domainWorkspaceReducer(docsState, {
        type: "query",
        value: "search-docs",
    }) as DocumentsWorkspaceState;
    docsState = domainWorkspaceReducer(docsState, {
        type: "navigate",
        route: { view: "documents/edit", id: "doc-favorite-1" },
    }) as DocumentsWorkspaceState;
    assertEquals(docsState.stack.length, 1);
    docsState = domainWorkspaceReducer(docsState, {
        type: "navigate",
        route: { view: "documents/root" },
    }) as DocumentsWorkspaceState;
    assertEquals(docsState.route, { view: "documents/root" });
    assertEquals(docsState.stack, []);
    assertEquals(docsState.query, "search-docs");
    assertEquals(docsState.scope, { type: "favorite" });
});

Deno.test("Workspace: navigating to an existing stack route safely unwinds the stack", () => {
    let state: DomainWorkspaceState<AppsRoute> = initialAppsWorkspaceState;
    state = domainWorkspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/create", groupId: "folder-1" },
    });
    assertEquals(state.stack.length, 1);

    // Unwinds back to root
    state = domainWorkspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/root" },
    });
    assertEquals(state.route, { view: "apps/root" });
    assertEquals(state.stack, []);
});
Deno.test("Workspace: areWorkspaceRoutesEqual discriminates routes accurately across domains", () => {
    // Documents routes
    assertEquals(
        areWorkspaceRoutesEqual(
            { view: "documents/root" },
            { view: "documents/root" },
        ),
        true,
    );
    assertEquals(
        areWorkspaceRoutesEqual(
            { view: "documents/create" },
            { view: "documents/create" },
        ),
        true,
    );
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
    assertEquals(
        areWorkspaceRoutesEqual(
            { view: "documents/root" },
            { view: "apps/root" },
        ),
        false,
    );
});

Deno.test("Workspace: documents scope is preserved across query, navigate, and back operations", () => {
    let docs: DocumentsWorkspaceState = {
        ...initialDocumentsWorkspaceState,
        scope: { type: "notebook", notebookId: "nb-42" },
    };

    // Query change preserves scope
    docs = domainWorkspaceReducer(docs, {
        type: "query",
        value: "my-query",
    }) as DocumentsWorkspaceState;
    assertEquals(docs.scope, { type: "notebook", notebookId: "nb-42" });
    assertEquals(docs.query, "my-query");

    // Navigate preserves scope
    docs = domainWorkspaceReducer(docs, {
        type: "navigate",
        route: { view: "documents/create" },
    }) as DocumentsWorkspaceState;
    assertEquals(docs.scope, { type: "notebook", notebookId: "nb-42" });
    assertEquals(docs.route, { view: "documents/create" });

    // Further navigate preserves scope
    docs = domainWorkspaceReducer(docs, {
        type: "navigate",
        route: { view: "documents/edit", id: "d-1" },
    }) as DocumentsWorkspaceState;
    assertEquals(docs.scope, { type: "notebook", notebookId: "nb-42" });
    assertEquals(docs.route, { view: "documents/edit", id: "d-1" });

    // Back preserves scope
    docs = domainWorkspaceReducer(docs, {
        type: "back",
    }) as DocumentsWorkspaceState;
    assertEquals(docs.scope, { type: "notebook", notebookId: "nb-42" });
    assertEquals(docs.route, { view: "documents/create" });
    assertEquals(docs.query, "my-query");
});

Deno.test("Workspace: independent reset resets only the target domain to initial state across all three domains", () => {
    let apps: DomainWorkspaceState<AppsRoute> = initialAppsWorkspaceState;
    apps = domainWorkspaceReducer(apps, { type: "query", value: "apps-query" });
    apps = domainWorkspaceReducer(apps, {
        type: "navigate",
        route: { view: "apps/edit", id: "a1" },
    });

    let notes: DomainWorkspaceState<NotesRoute> = initialNotesWorkspaceState;
    notes = domainWorkspaceReducer(notes, {
        type: "query",
        value: "notes-query",
    });
    notes = domainWorkspaceReducer(notes, {
        type: "navigate",
        route: { view: "notes/edit", id: "n1" },
    });

    let docs: DocumentsWorkspaceState = {
        ...initialDocumentsWorkspaceState,
        scope: { type: "favorite" },
    };
    docs = domainWorkspaceReducer(docs, {
        type: "query",
        value: "docs-query",
    }) as DocumentsWorkspaceState;
    docs = domainWorkspaceReducer(docs, {
        type: "navigate",
        route: { view: "documents/edit", id: "d1" },
    }) as DocumentsWorkspaceState;

    // Reset documents only
    docs = domainWorkspaceReducer(docs, {
        type: "reset",
    }) as DocumentsWorkspaceState;
    assertEquals(docs, initialDocumentsWorkspaceState);
    assertEquals(docs.scope, { type: "all" });

    // Apps and notes remain completely untouched
    assertEquals(apps.route, { view: "apps/edit", id: "a1" });
    assertEquals(apps.query, "apps-query");
    assertEquals(apps.stack.length, 1);
    assertEquals(notes.route, { view: "notes/edit", id: "n1" });
    assertEquals(notes.query, "notes-query");
    assertEquals(notes.stack.length, 1);

    // Reset apps only
    apps = domainWorkspaceReducer(apps, { type: "reset" });
    assertEquals(apps, initialAppsWorkspaceState);
    assertEquals(notes.route, { view: "notes/edit", id: "n1" });
    assertEquals(docs, initialDocumentsWorkspaceState);

    // Reset notes only
    notes = domainWorkspaceReducer(notes, { type: "reset" });
    assertEquals(notes, initialNotesWorkspaceState);
    assertEquals(apps, initialAppsWorkspaceState);
    assertEquals(docs, initialDocumentsWorkspaceState);
});
