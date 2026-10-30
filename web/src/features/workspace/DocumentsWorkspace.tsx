import {
    lazy,
    type RefObject,
    Suspense,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import type { DocumentsRoute, DocumentsScope } from "./workspace-state.ts";
import { EmptyState, LoadingState } from "../../components/searcher/semantic.tsx";
import { DocumentsSidebar } from "./DocumentsSidebar.tsx";
import { WindowOverlay } from "../../components/ui/window-overlay.tsx";

import type { DocumentEventSubscriptions } from "../documents/document-event-subscriptions.ts";
import { WorkspaceActivity } from "./WorkspaceActivity.ts";
const DocumentEditor = lazy(() => import("../documents/DocumentEditor.tsx"));
export interface DocumentsWorkspaceProps {
    state: DocumentsRoute;
    userId: string;
    query: string;
    onQueryChange: (query: string) => void;
    scope: DocumentsScope;
    onScopeChange: (scope: DocumentsScope) => void;
    onDocumentTrashed: (id: string) => void;
    onOpenDocument: (id: string) => Promise<boolean>;
    onNewDocument: (target: { notebookId: string | null; isHomeFixed: boolean }) => Promise<boolean>;
    onCreated: (id: string) => void;
    sidebarPersistent: boolean;
    sidebarOpen: boolean;
    onSidebarOpenChange: (open: boolean) => void;
    sidebarTriggerRef: RefObject<HTMLElement | null>;
    onOpenTrash: () => void;
    narrow: boolean;
    onDirtyChange?: (dirty: boolean) => void;
    eventSubscriptions?: DocumentEventSubscriptions;
}

export function DocumentsWorkspace(props: DocumentsWorkspaceProps) {
    const active = useContext(WorkspaceActivity);
    const [revision, setRevision] = useState(0);
    const [focusTitleSignal, setFocusTitleSignal] = useState(0);
    const [restoreDrawerFocus, setRestoreDrawerFocus] = useState(true);
    const [newSession, setNewSession] = useState(0);
    const createdId = useRef<string | null>(null);
    // Where notes the sidebar has not loaded live; a new note's notebook is known here.
    const noteNotebooks = useRef(new Map<string, string | null>());
    const refresh = () => setRevision((value) => value + 1);
    useEffect(() => {
        if (props.sidebarOpen) setRestoreDrawerFocus(true);
    }, [props.sidebarOpen]);
    const openDocument = async (id: string) => {
        const opened = await props.onOpenDocument(id);
        if (opened) {
            if (!props.sidebarPersistent) { setRestoreDrawerFocus(false); props.onSidebarOpenChange(false); }
            setFocusTitleSignal((value) => value + 1);
        }
        return opened;
    };
    const newDocument = async (target: { notebookId: string | null; isHomeFixed: boolean }) => {
        if (props.state.view === "documents/new") {
            if (!props.sidebarPersistent) {
                setRestoreDrawerFocus(false);
                props.onSidebarOpenChange(false);
            }
            setFocusTitleSignal((value) => value + 1);
            return;
        }
        if (await props.onNewDocument(target)) {
            setNewSession((value) => value + 1);
            if (!props.sidebarPersistent) { setRestoreDrawerFocus(false); props.onSidebarOpenChange(false); }
            setFocusTitleSignal((value) => value + 1);
        }
    };
    const editorKey = props.state.view === "documents/new" ||
            (props.state.view === "documents/edit" && props.state.id === createdId.current)
        ? `new:${newSession}`
        : props.state.view === "documents/edit" ? props.state.id : "root";
    return (
        <div className="documents-layout" data-workspace-content="documents" data-drawer={props.sidebarPersistent ? undefined : props.sidebarOpen ? "open" : "closed"}>
            <WindowOverlay
                open={props.sidebarOpen}
                modal={!props.sidebarPersistent}
                active={active}
                role="region"
                onOpenChange={(open) => { setRestoreDrawerFocus(true); props.onSidebarOpenChange(open); }}
                restoreFocus={restoreDrawerFocus}
                restoreFocusRef={props.sidebarTriggerRef}
                label="笔记侧栏"
                className={props.sidebarPersistent ? "documents-sidebar" : "documents-sidebar documents-sidebar--drawer"}
            >
                <nav aria-label="笔记侧栏" id="notes-sidebar">
                    <DocumentsSidebar
                        state={props.state}
                        userId={props.userId}
                        query={props.query}
                        onQueryChange={props.onQueryChange}
                        scope={props.scope}
                        onScopeChange={props.onScopeChange}
                        revision={revision}
                        eventSubscriptions={props.eventSubscriptions}
                        onOpenDocument={openDocument}
                        onNewDocument={(target) => void newDocument(target)}
                        onDocumentTrashed={props.onDocumentTrashed}
                        onOpenTrash={props.onOpenTrash}
                        noteNotebooks={noteNotebooks}
                    />
                </nav>
                {!props.sidebarPersistent && <button type="button" className="documents-drawer-dismiss" aria-label="关闭笔记侧栏" onClick={() => { setRestoreDrawerFocus(true); props.onSidebarOpenChange(false); }} />}
            </WindowOverlay>
            <main className="documents-editor-pane">
                {props.state.view === "documents/root"
                    ? <EmptyState title="选择或新建笔记" headingLevel={3} density="compact" />
                    : <Suspense fallback={<LoadingState density="compact">正在加载编辑器…</LoadingState>}>
                        <DocumentEditor
                            key={editorKey}
                            documentId={props.state.view === "documents/edit" ? props.state.id : undefined}
                            target={props.state.view === "documents/new" ? props.state.target : undefined}
                            onCreated={(id) => {
                                createdId.current = id;
                                if (props.state.view === "documents/new") {
                                    noteNotebooks.current.set(id, props.state.target.notebookId);
                                }
                                props.onCreated(id);
                                refresh();
                            }}
                            userId={props.userId}
                            onOpenDocument={(id) => { void openDocument(id); }}
                            onDirtyChange={props.onDirtyChange}
                            onChanged={refresh}
                            narrow={props.narrow}
                            focusTitleSignal={focusTitleSignal}
                            eventSubscriptions={props.eventSubscriptions}
                        />
                    </Suspense>}
            </main>
        </div>
    );
}
