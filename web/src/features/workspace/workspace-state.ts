export type AppsRoute =
    | { view: "apps/root" }
    | { view: "apps/create"; groupId?: string }
    | { view: "apps/edit"; id: string; expandIcon?: boolean };

export type NotesRoute =
    | { view: "notes/root" }
    | { view: "notes/edit"; id: string };

export type DocumentsRoute =
    | { view: "documents/root" }
    | { view: "documents/create" }
    | { view: "documents/edit"; id: string };

export type DocumentsScope =
    | { type: "all" }
    | { type: "recent" }
    | { type: "favorite" }
    | { type: "notebook"; notebookId: string };

export type WorkspaceRoute = AppsRoute | NotesRoute | DocumentsRoute;

export function isAppsWorkspaceView(state: WorkspaceRoute): state is AppsRoute {
    return state.view.startsWith("apps/");
}

export function isNotesWorkspaceView(
    state: WorkspaceRoute,
): state is NotesRoute {
    return state.view.startsWith("notes/");
}

export function isDocumentsWorkspaceView(
    state: WorkspaceRoute,
): state is DocumentsRoute {
    return state.view.startsWith("documents/");
}

export type WorkspaceKind = "apps" | "notes" | "documents";

export interface DomainWorkspaceState<Route = WorkspaceRoute> {
    route: Route;
    stack: Route[];
    query: string;
}

export interface DocumentsWorkspaceState
    extends DomainWorkspaceState<DocumentsRoute> {
    scope: DocumentsScope;
}

export interface WorkspaceCoreState {
    apps: DomainWorkspaceState<AppsRoute>;
    notes: DomainWorkspaceState<NotesRoute>;
    documents: DocumentsWorkspaceState;
}

export const initialAppsWorkspaceState: DomainWorkspaceState<AppsRoute> = {
    route: { view: "apps/root" },
    stack: [],
    query: "",
};

export const initialNotesWorkspaceState: DomainWorkspaceState<NotesRoute> = {
    route: { view: "notes/root" },
    stack: [],
    query: "",
};

export const initialDocumentsWorkspaceState: DocumentsWorkspaceState = {
    route: { view: "documents/root" },
    stack: [],
    query: "",
    scope: { type: "all" },
};

export const initialWorkspaceCoreState: WorkspaceCoreState = {
    apps: initialAppsWorkspaceState,
    notes: initialNotesWorkspaceState,
    documents: initialDocumentsWorkspaceState,
};

export type DomainWorkspaceAction<Route = WorkspaceRoute> =
    | { type: "navigate"; route: Route }
    | { type: "query"; value: string }
    | { type: "back" }
    | { type: "reset" };
export function areWorkspaceRoutesEqual(
    a: WorkspaceRoute,
    b: WorkspaceRoute,
): boolean {
    if (a.view !== b.view) return false;
    if (a.view === "apps/create" && b.view === "apps/create") {
        return a.groupId === b.groupId;
    }
    if (a.view === "apps/edit" && b.view === "apps/edit") {
        return a.id === b.id;
    }
    if (a.view === "notes/edit" && b.view === "notes/edit") {
        return a.id === b.id;
    }
    if (a.view === "documents/edit" && b.view === "documents/edit") {
        return a.id === b.id;
    }
    return true;
}

export function parentWorkspaceRoute(route: WorkspaceRoute): WorkspaceRoute {
    if (isAppsWorkspaceView(route)) return { view: "apps/root" };
    if (isNotesWorkspaceView(route)) return { view: "notes/root" };
    return { view: "documents/root" };
}

export function domainWorkspaceReducer<Route extends WorkspaceRoute>(
    state: DomainWorkspaceState<Route>,
    action: DomainWorkspaceAction<Route>,
): DomainWorkspaceState<Route> {
    switch (action.type) {
        case "reset": {
            const initial = isAppsWorkspaceView(state.route)
                ? initialAppsWorkspaceState
                : isNotesWorkspaceView(state.route)
                ? initialNotesWorkspaceState
                : initialDocumentsWorkspaceState;
            return initial as DomainWorkspaceState<Route>;
        }
        case "query":
            return {
                ...state,
                query: action.value,
            };
        case "back": {
            if (state.stack.length > 0) {
                const nextRoute = state.stack[state.stack.length - 1];
                const nextStack = state.stack.slice(0, -1);
                return { ...state, route: nextRoute, stack: nextStack };
            }
            return {
                ...state,
                route: parentWorkspaceRoute(state.route) as Route,
                stack: [],
            };
        }
        case "navigate": {
            const nextRoute = action.route;
            if (areWorkspaceRoutesEqual(state.route, nextRoute)) {
                return state;
            }
            if (
                nextRoute.view === "apps/root" ||
                nextRoute.view === "notes/root" ||
                nextRoute.view === "documents/root"
            ) {
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
            return {
                ...state,
                route: nextRoute,
                stack: [...state.stack, state.route],
            };
        }
    }
}
