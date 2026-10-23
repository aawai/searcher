import {
    type DocumentsRoute,
    type DocumentsScope,
    type DomainWorkspaceAction,
    domainWorkspaceReducer,
    initialDocumentsWorkspaceState,
    initialWorkspaceCoreState,
    type WorkspaceCoreState,
    type WorkspaceKind,
} from "./workspace-state.ts";

export interface WorkspaceHostState {
    models: WorkspaceCoreState;
    open: Record<WorkspaceKind, boolean>;
    activeKind: WorkspaceKind | null;
}

export const initialWorkspaceHost: WorkspaceHostState = {
    models: initialWorkspaceCoreState,
    open: { documents: false },
    activeKind: null,
};

export type DocumentsWorkspaceAction = DomainWorkspaceAction<DocumentsRoute> | {
    type: "scope";
    scope: DocumentsScope;
};

export type WorkspaceHostAction =
    | { type: "domain"; kind: "documents"; action: DocumentsWorkspaceAction }
    | { type: "open"; kind: WorkspaceKind }
    | { type: "close"; kind?: WorkspaceKind }
    | { type: "activate"; kind: WorkspaceKind | null }
    | { type: "reset" };

/** Host controls open/close/active visibility; Core models handle presenter-independent route/stack/query. */
export function workspaceHostReducer(
    state: WorkspaceHostState,
    action: WorkspaceHostAction,
): WorkspaceHostState {
    switch (action.type) {
        case "reset":
            return initialWorkspaceHost;

        case "open": {
            const kind = action.kind;
            if (state.open[kind]) {
                return {
                    ...state,
                    activeKind: kind,
                };
            }
            const current = state.models[kind];
            const updated = current.route.view === `${kind}/root` &&
                    current.stack.length === 0
                ? current
                : {
                    ...current,
                    route: { view: `${kind}/root` as const },
                    stack: [],
                };
            return {
                ...state,
                models: {
                    ...state.models,
                    [kind]: updated,
                },
                open: {
                    ...state.open,
                    [kind]: true,
                },
                activeKind: kind,
            };
        }

        case "close": {
            const kind = action.kind ?? state.activeKind;
            if (!kind) return state;
            const current = state.models[kind];
            // Normal close preserves root placement and query behavior
            const closed = {
                ...current,
                route: { view: `${kind}/root` as const },
                stack: [],
            };
            return {
                ...state,
                models: {
                    ...state.models,
                    [kind]: closed,
                },
                open: {
                    ...state.open,
                    [kind]: false,
                },
                activeKind: state.activeKind === kind ? null : state.activeKind,
            };
        }

        case "activate": {
            const kind = action.kind;
            return {
                ...state,
                open: kind ? { ...state.open, [kind]: true } : state.open,
                activeKind: kind,
            };
        }

        case "domain": {
            const current = state.models.documents;
            const model = action.action.type === "scope"
                ? { ...current, scope: action.action.scope }
                : action.action.type === "reset"
                ? initialDocumentsWorkspaceState
                : {
                    ...current,
                    ...domainWorkspaceReducer(current, action.action),
                };
            const models = { ...state.models, documents: model };
            if (
                action.action.type === "query" ||
                action.action.type === "scope" ||
                action.action.type === "reset"
            ) {
                return { ...state, models };
            }
            return {
                ...state,
                models,
                open: { ...state.open, documents: true },
                activeKind: "documents",
            };
        }
    }
}
