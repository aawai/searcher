export type WorkspaceState =
    | { view: "closed" }
    | { view: "apps/root" }
    | { view: "apps/group"; id: string }
    | { view: "apps/groups" }
    | { view: "apps/create"; groupId?: string }
    | { view: "apps/edit"; id: string }
    | { view: "notes/root" }
    | { view: "notes/edit"; id: string };

export function isAppsWorkspaceView(state: WorkspaceState): boolean {
    return state.view.startsWith("apps/");
}

export function isNotesWorkspaceView(state: WorkspaceState): boolean {
    return state.view.startsWith("notes/");
}
export type WorkspaceKind = "apps" | "notes";
export interface WorkspaceModel {
    route: WorkspaceState;
    queries: Record<WorkspaceKind, string>;
}
export const initialWorkspaceState: WorkspaceModel = {
    route: { view: "closed" },
    queries: { apps: "", notes: "" },
};
export type WorkspaceAction =
    | { type: "navigate"; route: WorkspaceState }
    | { type: "query"; workspace: WorkspaceKind; value: string }
    | { type: "back" }
    | { type: "close" }
    | { type: "reset" };

export function parentWorkspaceRoute(route: WorkspaceState): WorkspaceState {
    if (route.view === "apps/create" && route.groupId) {
        return { view: "apps/group", id: route.groupId };
    }
    if (isAppsWorkspaceView(route)) return { view: "apps/root" };
    if (isNotesWorkspaceView(route)) return { view: "notes/root" };
    return { view: "closed" };
}
export function workspaceReducer(
    state: WorkspaceModel,
    action: WorkspaceAction,
): WorkspaceModel {
    switch (action.type) {
        case "reset":
            return initialWorkspaceState;
        case "close":
            return { ...state, route: { view: "closed" } };
        case "back":
            return { ...state, route: parentWorkspaceRoute(state.route) };
        case "navigate":
            return { ...state, route: action.route };
        case "query":
            return {
                ...state,
                queries: { ...state.queries, [action.workspace]: action.value },
            };
    }
}
