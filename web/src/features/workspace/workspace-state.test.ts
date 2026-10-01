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
        route: { view: "apps/group", id: "folder" },
    });
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/create", groupId: "folder" },
    });
    state = workspaceReducer(state, { type: "back" });
    assertEquals(state.route, { view: "apps/group", id: "folder" });
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

Deno.test("Workspace: apps/all navigates from root and returns to apps/root on Back", () => {
    let state = workspaceReducer(initialWorkspaceState, {
        type: "navigate",
        route: { view: "apps/root" },
    });
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/all" },
    });
    assertEquals(state.route, { view: "apps/all" });
    state = workspaceReducer(state, { type: "back" });
    assertEquals(state.route, { view: "apps/root" });
});

Deno.test("Workspace: group (including ungrouped) returns entering root or all context", () => {
    // From root to named group and ungrouped
    for (const groupId of ["folder-1", "ungrouped"]) {
        let state = workspaceReducer(initialWorkspaceState, {
            type: "navigate",
            route: { view: "apps/root" },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/group", id: groupId },
        });
        assertEquals(state.route, { view: "apps/group", id: groupId });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/root" });
    }

    // From apps/all to named group and ungrouped
    for (const groupId of ["folder-1", "ungrouped"]) {
        let state = workspaceReducer(initialWorkspaceState, {
            type: "navigate",
            route: { view: "apps/root" },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/all" },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/group", id: groupId },
        });
        assertEquals(state.route, { view: "apps/group", id: groupId });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/all" });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/root" });
    }
});

Deno.test("Workspace: create returns entering context (root, all, group, ungrouped)", () => {
    // Create from root
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

    // Create from apps/all
    {
        let state = workspaceReducer(initialWorkspaceState, {
            type: "navigate",
            route: { view: "apps/root" },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/all" },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/create" },
        });
        assertEquals(state.route, { view: "apps/create" });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/all" });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/root" });
    }

    // Create from group (both folder and ungrouped), entered from root
    for (const groupId of ["folder-1", "ungrouped"]) {
        let state = workspaceReducer(initialWorkspaceState, {
            type: "navigate",
            route: { view: "apps/root" },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/group", id: groupId },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/create", groupId },
        });
        assertEquals(state.route, { view: "apps/create", groupId });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/group", id: groupId });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/root" });
    }

    // Create from group (both folder and ungrouped), entered from apps/all
    for (const groupId of ["folder-1", "ungrouped"]) {
        let state = workspaceReducer(initialWorkspaceState, {
            type: "navigate",
            route: { view: "apps/root" },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/all" },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/group", id: groupId },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/create", groupId },
        });
        assertEquals(state.route, { view: "apps/create", groupId });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/group", id: groupId });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/all" });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/root" });
    }
});

Deno.test("Workspace: edit returns entering context (root, all, group, ungrouped)", () => {
    // Edit from root
    {
        let state = workspaceReducer(initialWorkspaceState, {
            type: "navigate",
            route: { view: "apps/root" },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/edit", id: "app-1" },
        });
        assertEquals(state.route, { view: "apps/edit", id: "app-1" });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/root" });
    }

    // Edit from apps/all
    {
        let state = workspaceReducer(initialWorkspaceState, {
            type: "navigate",
            route: { view: "apps/root" },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/all" },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/edit", id: "app-1" },
        });
        assertEquals(state.route, { view: "apps/edit", id: "app-1" });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/all" });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/root" });
    }

    // Edit from group and ungrouped, entered from root
    for (const groupId of ["folder-1", "ungrouped"]) {
        let state = workspaceReducer(initialWorkspaceState, {
            type: "navigate",
            route: { view: "apps/root" },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/group", id: groupId },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/edit", id: "app-1" },
        });
        assertEquals(state.route, { view: "apps/edit", id: "app-1" });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/group", id: groupId });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/root" });
    }

    // Edit from group and ungrouped, entered from apps/all
    for (const groupId of ["folder-1", "ungrouped"]) {
        let state = workspaceReducer(initialWorkspaceState, {
            type: "navigate",
            route: { view: "apps/root" },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/all" },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/group", id: groupId },
        });
        state = workspaceReducer(state, {
            type: "navigate",
            route: { view: "apps/edit", id: "app-1" },
        });
        assertEquals(state.route, { view: "apps/edit", id: "app-1" });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/group", id: groupId });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/all" });
        state = workspaceReducer(state, { type: "back" });
        assertEquals(state.route, { view: "apps/root" });
    }
});

Deno.test("Workspace: parentWorkspaceRoute safe fallback provides correct defaults", () => {
    // Apps routes fallback
    assertEquals(parentWorkspaceRoute({ view: "apps/all" }), {
        view: "apps/root",
    });
    assertEquals(parentWorkspaceRoute({ view: "apps/group", id: "work" }), {
        view: "apps/root",
    });
    assertEquals(
        parentWorkspaceRoute({ view: "apps/group", id: "ungrouped" }),
        {
            view: "apps/root",
        },
    );
    assertEquals(parentWorkspaceRoute({ view: "apps/groups" }), {
        view: "apps/root",
    });
    assertEquals(
        parentWorkspaceRoute({ view: "apps/create", groupId: "work" }),
        { view: "apps/group", id: "work" },
    );
    assertEquals(parentWorkspaceRoute({ view: "apps/create" }), {
        view: "apps/root",
    });
    assertEquals(parentWorkspaceRoute({ view: "apps/edit", id: "app-1" }), {
        view: "apps/root",
    });
    assertEquals(parentWorkspaceRoute({ view: "apps/root" }), {
        view: "apps/root",
    });

    // Notes routes fallback
    assertEquals(parentWorkspaceRoute({ view: "notes/edit", id: "note-1" }), {
        view: "notes/root",
    });
    assertEquals(parentWorkspaceRoute({ view: "notes/root" }), {
        view: "notes/root",
    });
    assertEquals(parentWorkspaceRoute({ view: "closed" }), { view: "closed" });
});

Deno.test("Workspace: switching roots or closing clears the navigation stack while queries remain independent", () => {
    // Deep navigation in apps
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
        route: { view: "apps/all" },
    });
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/group", id: "folder-1" },
    });
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/create", groupId: "folder-1" },
    });
    assertEquals(state.stack.length, 3);

    // Switching to notes root clears stack
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "notes/root" },
    });
    assertEquals(state.route, { view: "notes/root" });
    assertEquals(state.stack, []);
    assertEquals(state.queries.apps, "search-apps");
    assertEquals(state.queries.notes, "");

    // Deep navigation in notes
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
    // Both queries preserved independently
    assertEquals(state.queries, {
        apps: "search-apps",
        notes: "search-notes",
    });

    // Navigate deep into apps again and close
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/all" },
    });
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/group", id: "ungrouped" },
    });
    assertEquals(state.stack.length, 2);

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
    // Simulates AppsWorkspace calling navigate(parentWorkspaceRoute(state))
    let state = workspaceReducer(initialWorkspaceState, {
        type: "navigate",
        route: { view: "apps/root" },
    });
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/all" },
    });
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/group", id: "folder-1" },
    });
    state = workspaceReducer(state, {
        type: "navigate",
        route: { view: "apps/create", groupId: "folder-1" },
    });

    // Fallback navigate to parent group
    state = workspaceReducer(state, {
        type: "navigate",
        route: parentWorkspaceRoute(state.route),
    });
    assertEquals(state.route, { view: "apps/group", id: "folder-1" });
    // Stack unwound correctly so subsequent Back goes to apps/all then apps/root
    state = workspaceReducer(state, { type: "back" });
    assertEquals(state.route, { view: "apps/all" });
    state = workspaceReducer(state, { type: "back" });
    assertEquals(state.route, { view: "apps/root" });
});
