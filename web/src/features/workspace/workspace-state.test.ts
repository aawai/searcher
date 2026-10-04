import { assertEquals } from "@std/assert";
import {
    type AppsRoute,
    domainWorkspaceReducer,
    type DomainWorkspaceState,
    initialAppsWorkspaceState,
    initialNotesWorkspaceState,
    type NotesRoute,
    parentWorkspaceRoute,
} from "./workspace-state.ts";

Deno.test("Workspace: independent domains maintain routes, stacks and queries separately", () => {
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

    // Verify apps remains unaffected
    assertEquals(appsState.route, {
        view: "apps/create",
        groupId: "folder-1",
    });
    assertEquals(appsState.query, "work");

    // Back in apps returns to apps/root
    appsState = domainWorkspaceReducer(appsState, { type: "back" });
    assertEquals(appsState.route, { view: "apps/root" });
    assertEquals(appsState.stack, []);
    assertEquals(appsState.query, "work");

    // Notes is still in nested edit
    assertEquals(notesState.route, { view: "notes/edit", id: "note-1" });
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

Deno.test("Workspace: parentWorkspaceRoute safe fallback provides correct defaults", () => {
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
});

Deno.test("Workspace: navigating to domain root clears navigation stack while retaining query", () => {
    let state: DomainWorkspaceState<AppsRoute> = initialAppsWorkspaceState;
    state = domainWorkspaceReducer(state, {
        type: "query",
        value: "search-apps",
    });
    state = domainWorkspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/create", groupId: "folder-1" },
    });
    assertEquals(state.stack.length, 1);

    // Navigating back to root clears stack, preserves query
    state = domainWorkspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/root" },
    });
    assertEquals(state.route, { view: "apps/root" });
    assertEquals(state.stack, []);
    assertEquals(state.query, "search-apps");
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

Deno.test("Workspace: independent reset resets only the target domain to initial state", () => {
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

    // Reset apps only
    apps = domainWorkspaceReducer(apps, { type: "reset" });
    assertEquals(apps, initialAppsWorkspaceState);

    // Notes remains completely untouched
    assertEquals(notes.route, { view: "notes/edit", id: "n1" });
    assertEquals(notes.query, "notes-query");
    assertEquals(notes.stack.length, 1);
});
