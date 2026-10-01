export type WorkspaceState =
    | { view: "closed" }
    | { view: "apps/root" }
    | { view: "apps/all" }
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
    stack: WorkspaceState[];
    queries: Record<WorkspaceKind, string>;
}
export const initialWorkspaceState: WorkspaceModel = {
    route: { view: "closed" },
    stack: [],
    queries: { apps: "", notes: "" },
};
export type WorkspaceAction =
    | { type: "navigate"; route: WorkspaceState }
    | { type: "query"; workspace: WorkspaceKind; value: string }
    | { type: "back" }
    | { type: "close" }
    | { type: "reset" };

export function areWorkspaceRoutesEqual(
    a: WorkspaceState,
    b: WorkspaceState,
): boolean {
    if (a.view !== b.view) return false;
    if (a.view === "apps/group" && b.view === "apps/group") {
        return a.id === b.id;
    }
    if (a.view === "apps/create" && b.view === "apps/create") {
        return a.groupId === b.groupId;
    }
    if (a.view === "apps/edit" && b.view === "apps/edit") {
        return a.id === b.id;
    }
    if (a.view === "notes/edit" && b.view === "notes/edit") {
        return a.id === b.id;
    }
    return true;
}

function getWorkspaceKind(route: WorkspaceState): WorkspaceKind | null {
    if (isAppsWorkspaceView(route)) return "apps";
    if (isNotesWorkspaceView(route)) return "notes";
    return null;
}

export function parentWorkspaceRoute(route: WorkspaceState): WorkspaceState {
    if (route.view === "apps/create" && route.groupId) {
        return { view: "apps/group", id: route.groupId };
    }
    if (route.view === "apps/all") return { view: "apps/root" };
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
            return { ...state, route: { view: "closed" }, stack: [] };
        case "back": {
            if (state.stack.length > 0) {
                const nextRoute = state.stack[state.stack.length - 1];
                const nextStack = state.stack.slice(0, -1);
                return { ...state, route: nextRoute, stack: nextStack };
            }
            return {
                ...state,
                route: parentWorkspaceRoute(state.route),
                stack: [],
            };
        }
        case "navigate": {
            const nextRoute = action.route;
            if (areWorkspaceRoutesEqual(state.route, nextRoute)) {
                return state;
            }
            if (nextRoute.view === "closed") {
                return { ...state, route: nextRoute, stack: [] };
            }
            const currentKind = getWorkspaceKind(state.route);
            const nextKind = getWorkspaceKind(nextRoute);
            const isSwitchingRoots = nextRoute.view === "apps/root" ||
                nextRoute.view === "notes/root" ||
                (currentKind !== null && nextKind !== null &&
                    currentKind !== nextKind);
            if (isSwitchingRoots) {
                return { ...state, route: nextRoute, stack: [] };
            }

            const existingIndex = state.stack.findLastIndex((item) =>
                areWorkspaceRoutesEqual(item, nextRoute)
            );
            if (existingIndex !== -1) {
                return {
                    ...state,
                    route: nextRoute,
                    stack: state.stack.slice(0, existingIndex),
                };
            }

            const nextStack = state.route.view === "closed"
                ? state.stack
                : [...state.stack, state.route];

            return {
                ...state,
                route: nextRoute,
                stack: nextStack,
            };
        }
        case "query":
            return {
                ...state,
                queries: { ...state.queries, [action.workspace]: action.value },
            };
    }
}
