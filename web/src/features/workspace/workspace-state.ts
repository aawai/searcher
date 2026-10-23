export type DocumentsRoute =
    | { view: "documents/root" }
    | { view: "documents/create" }
    | { view: "documents/edit"; id: string };

export type DocumentsScope =
    | { type: "all" }
    | { type: "home" }
    | { type: "recent" }
    | { type: "favorite" }
    | { type: "notebook"; notebookId: string };

export type WorkspaceRoute = DocumentsRoute;

export function isDocumentsWorkspaceView(
    state: WorkspaceRoute,
): state is DocumentsRoute {
    return state.view.startsWith("documents/");
}

/** Documents is the only workspace; apps live on the home page. */
export type WorkspaceKind = "documents";

export interface DomainWorkspaceState<
    Route extends WorkspaceRoute = WorkspaceRoute,
> {
    route: Route;
    stack: Route[];
    query: string;
}

export interface DocumentsWorkspaceState
    extends DomainWorkspaceState<DocumentsRoute> {
    scope: DocumentsScope;
}

export interface WorkspaceCoreState {
    documents: DocumentsWorkspaceState;
}

export const initialDocumentsWorkspaceState: DocumentsWorkspaceState = {
    route: { view: "documents/root" },
    stack: [],
    query: "",
    scope: { type: "all" },
};

export const initialWorkspaceCoreState: WorkspaceCoreState = {
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
    if (a.view === "documents/edit" && b.view === "documents/edit") {
        return a.id === b.id;
    }
    return true;
}

export function parentWorkspaceRoute(_route: WorkspaceRoute): WorkspaceRoute {
    return { view: "documents/root" };
}

export function domainWorkspaceReducer(
    state: DomainWorkspaceState,
    action: DomainWorkspaceAction,
): DomainWorkspaceState {
    switch (action.type) {
        case "reset":
            return initialDocumentsWorkspaceState;
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
                route: parentWorkspaceRoute(state.route),
                stack: [],
            };
        }
        case "navigate": {
            const nextRoute = action.route;
            if (areWorkspaceRoutesEqual(state.route, nextRoute)) {
                return state;
            }
            if (nextRoute.view === "documents/root") {
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
