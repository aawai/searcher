import { assertEquals } from "@std/assert";
import { initialWorkspaceState, workspaceReducer } from "./workspace-state.ts";

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
