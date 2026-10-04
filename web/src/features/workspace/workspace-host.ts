import {
    type AppsRoute,
    type DomainWorkspaceAction,
    domainWorkspaceReducer,
    initialWorkspaceCoreState,
    type NotesRoute,
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
    open: { apps: false, notes: false },
    activeKind: null,
};

export type WorkspaceHostAction =
    | {
        type: "domain";
        kind: "apps";
        action: DomainWorkspaceAction<AppsRoute>;
    }
    | {
        type: "domain";
        kind: "notes";
        action: DomainWorkspaceAction<NotesRoute>;
    }
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
            if (action.kind === "apps") {
                const model = domainWorkspaceReducer(
                    state.models.apps,
                    action.action,
                );
                const nextModels = { ...state.models, apps: model };
                if (
                    action.action.type === "query" ||
                    action.action.type === "reset"
                ) {
                    return { ...state, models: nextModels };
                }
                return {
                    ...state,
                    models: nextModels,
                    open: { ...state.open, apps: true },
                    activeKind: "apps",
                };
            }
            const model = domainWorkspaceReducer(
                state.models.notes,
                action.action,
            );
            const nextModels = { ...state.models, notes: model };
            if (
                action.action.type === "query" ||
                action.action.type === "reset"
            ) {
                return { ...state, models: nextModels };
            }
            return {
                ...state,
                models: nextModels,
                open: { ...state.open, notes: true },
                activeKind: "notes",
            };
        }
    }
}
