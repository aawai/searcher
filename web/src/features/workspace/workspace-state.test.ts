import { assertEquals } from "@std/assert";
import {
    initialWorkspaceState,
    parentWorkspaceRoute,
    workspaceReducer,
} from "./workspace-state.ts";

Deno.test("Workspace: independent queries survive switching; nested Back and Close have distinct destinations", () => {
    let state = workspaceReducer(initialWorkspaceState, {
        type: "navigate",
        route: { view: "apps/root" },
    });
    state = workspaceReducer(state, {
        type: "query",
        workspace: "apps",
        value: "work",
    });
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/create", groupId: "folder-1" },
    });
    assertEquals(state.route, { view: "apps/create", groupId: "folder-1" });
    state = workspaceReducer(state, { type: "back" });
    assertEquals(state.route, { view: "apps/root" });

    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "notes/root" },
    });
    state = workspaceReducer(state, {
        type: "query",
        workspace: "notes",
        value: "draft",
    });
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "notes/edit", id: "note" },
    });
    state = workspaceReducer(state, { type: "close" });
    assertEquals(state.route, { view: "closed" });
    assertEquals(state.queries, { apps: "work", notes: "draft" });
    state = workspaceReducer(state, { type: "reset" });
    assertEquals(state, initialWorkspaceState);
});

Deno.test("Workspace: apps/create returns to apps/root on Back", () => {
    // Without groupId
    {
        let state = workspaceReducer(initialWorkspaceState, {
            type: "navigate",
            route: { view: "apps/root" },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/create" },
        });
        assertEquals(state.route, { view: "apps/create" });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/root" });
    }

    // With groupId
    {
        let state = workspaceReducer(initialWorkspaceState, {
            type: "navigate",
            route: { view: "apps/root" },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/create", groupId: "folder-dev" },
        });
        assertEquals(state.route, {
            view: "apps/create",
            groupId: "folder-dev",
        });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/root" });
    }
});

Deno.test("Workspace: apps/edit returns to apps/root on Back", () => {
    let state = workspaceReducer(initialWorkspaceState, {
        type: "navigate",
        route: { view: "apps/root" },
    });
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/edit", id: "app-123" },
    });
    assertEquals(state.route, { view: "apps/edit", id: "app-123" });
    state = workspaceReducer(state, { type: "back" });
    assertEquals(state.route, { view: "apps/root" });
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

    // Closed fallback
    assertEquals(parentWorkspaceRoute({ view: "closed" }), { view: "closed" });
});

Deno.test("Workspace: switching roots or closing clears the navigation stack while queries remain independent", () => {
    // Navigate in apps
    let state = workspaceReducer(initialWorkspaceState, {
        type: "navigate",
        route: { view: "apps/root" },
    });
    state = workspaceReducer(state, {
        type: "query",
        workspace: "apps",
        value: "search-apps",
    });
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/create", groupId: "folder-1" },
    });
    assertEquals(state.stack.length, 1);

    // Switching to notes root clears stack
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "notes/root" },
    });
    assertEquals(state.route, { view: "notes/root" });
    assertEquals(state.stack, []);
    assertEquals(state.queries.apps, "search-apps");
    assertEquals(state.queries.notes, "");

    // Navigate in notes
    state = workspaceReducer(state, {
        type: "query",
        workspace: "notes",
        value: "search-notes",
    });
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "notes/edit", id: "note-1" },
    });
    assertEquals(state.stack.length, 1);

    // Switching back to apps root clears stack
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/root" },
    });
    assertEquals(state.route, { view: "apps/root" });
    assertEquals(state.stack, []);
    assertEquals(state.queries, {
        apps: "search-apps",
        notes: "search-notes",
    });

    // Navigate in apps again and close
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/edit", id: "app-2" },
    });
    assertEquals(state.stack.length, 1);

    state = workspaceReducer(state, { type: "close" });
    assertEquals(state.route, { view: "closed" });
    assertEquals(state.stack, []);
    assertEquals(state.queries, {
        apps: "search-apps",
        notes: "search-notes",
    });

    // Reset clears queries as well
    state = workspaceReducer(state, { type: "reset" });
    assertEquals(state, initialWorkspaceState);
});

Deno.test("Workspace: navigating to an existing stack route safely unwinds the stack", () => {
    let state = workspaceReducer(initialWorkspaceState, {
        type: "navigate",
        route: { view: "apps/root" },
    });
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/create", groupId: "folder-1" },
    });

    // Unwinds back to root
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/root" },
    });
    assertEquals(state.route, { view: "apps/root" });
    assertEquals(state.stack, []);
});
