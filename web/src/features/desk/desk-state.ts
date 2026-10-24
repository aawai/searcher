import {
    type DocumentsRoute,
    type DocumentsScope,
    type DocumentsWorkspaceState,
    type DomainWorkspaceAction,
    domainWorkspaceReducer,
    initialDocumentsWorkspaceState,
} from "../workspace/workspace-state.ts";

/** The object whose detail is open; `id` matches its `DeskObject` id. */
export type DeskSelection =
    | { kind: "notes" }
    | { kind: "paper"; id: string }
    | { kind: "apps" }
    | { kind: "folder"; id: string }
    | { kind: "conversations" };

export interface DeskState {
    /** 用 is search focus and lives in the DOM; only 静 and 览 are stored. */
    stage: "calm" | "overview";
    selection: DeskSelection | null;
    /** Closing the detail returns here: 静 when it was opened from 静. */
    origin: "calm" | "overview";
    /** The notes library route, filters and search, kept across objects. */
    documents: DocumentsWorkspaceState;
}

export type DocumentsAction =
    | DomainWorkspaceAction<DocumentsRoute>
    | { type: "scope"; scope: DocumentsScope };

export type DeskAction =
    | { type: "enter" }
    | { type: "leave" }
    /** Open an object's detail; a notes `route` opens a note over the library. */
    | { type: "select"; selection: DeskSelection; route?: DocumentsRoute }
    /** Close the detail (Escape, 关闭详情). */
    | { type: "close" }
    /** Back to the object list (<768px “返回桌面”); stays in 览. */
    | { type: "list" }
    | { type: "documents"; action: DocumentsAction }
    | { type: "reset" };

export const initialDeskState: DeskState = {
    stage: "calm",
    selection: null,
    origin: "overview",
    documents: initialDocumentsWorkspaceState,
};

export function deskObjectId(selection: DeskSelection): string {
    if (selection.kind === "paper") return `paper:${selection.id}`;
    if (selection.kind === "folder") return `folder:${selection.id}`;
    return selection.kind;
}

export function deskSelectionFor(objectId: string): DeskSelection | null {
    if (objectId.startsWith("paper:")) {
        return { kind: "paper", id: objectId.slice(6) };
    }
    if (objectId.startsWith("folder:")) {
        return { kind: "folder", id: objectId.slice(7) };
    }
    if (
        objectId === "notes" || objectId === "apps" ||
        objectId === "conversations"
    ) return { kind: objectId };
    return null;
}

/** Library root, keeping the filters and search the user left there. */
function libraryRoot(documents: DocumentsWorkspaceState) {
    return {
        ...documents,
        route: { view: "documents/root" } as const,
        stack: [],
    };
}

function documentsFor(
    documents: DocumentsWorkspaceState,
    selection: DeskSelection,
    route: DocumentsRoute | undefined,
): DocumentsWorkspaceState {
    if (selection.kind === "paper") {
        return {
            ...documents,
            route: { view: "documents/edit", id: selection.id },
            stack: [],
        };
    }
    if (
        selection.kind === "notes" && route && route.view !== "documents/root"
    ) {
        return { ...documents, route, stack: [{ view: "documents/root" }] };
    }
    return libraryRoot(documents);
}

export function deskReducer(state: DeskState, action: DeskAction): DeskState {
    switch (action.type) {
        case "reset":
            return initialDeskState;
        case "enter":
            return state.stage === "overview"
                ? state
                : { ...state, stage: "overview", origin: "overview" };
        case "leave":
            return {
                ...state,
                stage: "calm",
                selection: null,
                documents: libraryRoot(state.documents),
            };
        case "select":
            return {
                ...state,
                stage: "overview",
                selection: action.selection,
                origin: state.stage === "calm" ? "calm" : "overview",
                documents: documentsFor(
                    state.documents,
                    action.selection,
                    action.route,
                ),
            };
        case "close":
            return {
                ...state,
                stage: state.origin === "calm" ? "calm" : state.stage,
                selection: null,
                origin: "overview",
                documents: libraryRoot(state.documents),
            };
        case "list":
            return {
                ...state,
                selection: null,
                origin: "overview",
                documents: libraryRoot(state.documents),
            };
        case "documents": {
            const documents = state.documents;
            const inner = action.action;
            if (inner.type === "scope") {
                return {
                    ...state,
                    documents: { ...documents, scope: inner.scope },
                };
            }
            return {
                ...state,
                documents: {
                    ...documents,
                    ...domainWorkspaceReducer(documents, inner),
                },
            };
        }
    }
}
