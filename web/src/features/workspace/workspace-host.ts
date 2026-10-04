import {
    initialWorkspaceState,
    type WorkspaceAction,
    type WorkspaceKind,
    type WorkspaceModel,
    workspaceReducer,
} from "./workspace-state.ts";

export interface WorkspaceHostState {
    models: Record<WorkspaceKind, WorkspaceModel>;
    activeKind: WorkspaceKind | null;
}
export const initialWorkspaceHost: WorkspaceHostState = {
    models: { apps: initialWorkspaceState, notes: initialWorkspaceState },
    activeKind: null,
};
export type WorkspaceHostAction =
    | { type: "domain"; kind: WorkspaceKind; action: WorkspaceAction }
    | { type: "activate"; kind: WorkspaceKind | null }
    | { type: "reset" };

/** Business routes are independent; window geometry belongs to the desktop reducer. */
export function workspaceHostReducer(
    state: WorkspaceHostState,
    action: WorkspaceHostAction,
): WorkspaceHostState {
    if (action.type === "reset") return initialWorkspaceHost;
    if (action.type === "activate") {
        return { ...state, activeKind: action.kind };
    }
    const model = workspaceReducer(state.models[action.kind], action.action);
    const other = action.kind === "apps" ? "notes" : "apps";
    const activeKind = action.action.type === "query"
        ? state.activeKind
        : model.route.view !== "closed"
        ? action.kind
        : state.activeKind !== action.kind
        ? state.activeKind
        : state.models[other].route.view !== "closed"
        ? other
        : null;
    return { models: { ...state.models, [action.kind]: model }, activeKind };
}
