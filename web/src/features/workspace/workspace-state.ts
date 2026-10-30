export type DocumentsRoute =
    | { view: "documents/root" }
    | { view: "documents/new"; target: { notebookId: string | null; isHomeFixed: boolean } }
    | { view: "documents/edit"; id: string };

/** What the notes sidebar shows: the notebook tree, or the flat list of a fixed entry. */
export type DocumentsScope =
    | { type: "tree" }
    | { type: "recent" }
    | { type: "favorite" };

export type WorkspaceRoute = DocumentsRoute;

export interface DomainWorkspaceState<
    Route extends WorkspaceRoute = WorkspaceRoute,
> {
    route: Route;
    query: string;
}

export interface DocumentsWorkspaceState
    extends DomainWorkspaceState<DocumentsRoute> {
    scope: DocumentsScope;
}

export const initialDocumentsWorkspaceState: DocumentsWorkspaceState = {
    route: { view: "documents/root" },
    query: "",
    scope: { type: "tree" },
};

export type DomainWorkspaceAction<Route = WorkspaceRoute> =
    | { type: "navigate"; route: Route }
    | { type: "created"; id: string }
    | { type: "query"; value: string }
    | { type: "reset" };

export function areWorkspaceRoutesEqual(
    a: WorkspaceRoute,
    b: WorkspaceRoute,
): boolean {
    if (a.view !== b.view) return false;
    if (a.view === "documents/edit" && b.view === "documents/edit") {
        return a.id === b.id;
    }
    if (a.view === "documents/new" && b.view === "documents/new") {
        return a.target.notebookId === b.target.notebookId &&
            a.target.isHomeFixed === b.target.isHomeFixed;
    }
    return true;
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
        case "created":
            return state.route.view === "documents/new"
                ? { ...state, route: { view: "documents/edit", id: action.id } }
                : state;
        case "navigate": {
            const nextRoute = action.route;
            if (areWorkspaceRoutesEqual(state.route, nextRoute)) {
                return state;
            }
            return { ...state, route: nextRoute };
        }
    }
}
