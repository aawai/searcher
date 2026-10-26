import {
    type DocumentsRoute,
    type DocumentsScope,
    type DocumentsWorkspaceState,
    type DomainWorkspaceAction,
    domainWorkspaceReducer,
    initialDocumentsWorkspaceState,
} from "../workspace/workspace-state.ts";

export type LibrarySelection = { kind: "notes" | "apps" };
export interface LibraryState {
    open: boolean;
    selection: LibrarySelection | null;
    documents: DocumentsWorkspaceState;
}
export type DocumentsAction = DomainWorkspaceAction<DocumentsRoute> | {
    type: "scope";
    scope: DocumentsScope;
};
export type LibraryAction =
    | { type: "leave" | "reset" }
    | { type: "select"; selection: LibrarySelection; route?: DocumentsRoute }
    | { type: "documents"; action: DocumentsAction };
export const initialLibraryState: LibraryState = {
    open: false,
    selection: null,
    documents: initialDocumentsWorkspaceState,
};
function root(documents: DocumentsWorkspaceState): DocumentsWorkspaceState {
    return { ...documents, route: { view: "documents/root" }, stack: [] };
}
export function libraryReducer(
    state: LibraryState,
    action: LibraryAction,
): LibraryState {
    switch (action.type) {
        case "reset":
            return initialLibraryState;
        case "leave":
            return {
                ...state,
                open: false,
                selection: null,
                documents: root(state.documents),
            };
        case "select":
            return {
                ...state,
                open: true,
                selection: action.selection,
                documents:
                    action.route && action.route.view !== "documents/root"
                        ? {
                            ...state.documents,
                            route: action.route,
                            stack: [{ view: "documents/root" }],
                        }
                        : root(state.documents),
            };
        case "documents": {
            const inner = action.action;
            return {
                ...state,
                documents: inner.type === "scope"
                    ? { ...state.documents, scope: inner.scope }
                    : {
                        ...state.documents,
                        ...domainWorkspaceReducer(state.documents, inner),
                    },
            };
        }
    }
}
/** One guard owns every editor-leaving action, including library close. */
export function shouldConfirmLibraryAction(
    dirty: boolean,
    action: LibraryAction,
): boolean {
    return dirty && !(action.type === "documents" &&
        (action.action.type === "query" || action.action.type === "scope"));
}
/** Returning focus never targets a detached trigger. */
export function libraryFocusTarget<T extends { isConnected: boolean }>(
    opener: T | null,
    search: T | null,
): T | null {
    return opener?.isConnected ? opener : search;
}
