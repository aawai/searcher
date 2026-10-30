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
import { PanelLeftOpen } from "lucide-react";
import {
    EmptyState,
    LoadingState,
} from "../../components/searcher/semantic.tsx";
import { Button } from "../../components/ui/button.tsx";
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
    onNewDocument: (
        target: { notebookId: string | null; isHomeFixed: boolean },
    ) => Promise<boolean>;
    onCreated: (id: string) => void;
    sidebarPersistent: boolean;
    sidebarOpen: boolean;
    onSidebarOpenChange: (open: boolean) => void;
    sidebarTriggerRef: RefObject<HTMLButtonElement | null>;
    /** Full screen hides the navigation and every control that opens it. */
    fullScreen?: boolean;
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
    const [outlineOpen, setOutlineOpen] = useState(false);
    const [outlineRestoreFocus, setOutlineRestoreFocus] = useState(true);
    const [outlineMount, setOutlineMount] = useState<HTMLDivElement | null>(
        null,
    );
    const outlineTriggerRef = useRef<HTMLButtonElement>(null);
    const [newSession, setNewSession] = useState(0);
    const createdId = useRef<string | null>(null);
    // Where notes the sidebar has not loaded live; a new note's notebook is known here.
    const noteNotebooks = useRef(new Map<string, string | null>());
    const refresh = () => setRevision((value) => value + 1);
    const collapseRef = useRef<HTMLButtonElement>(null);
    // The collapse and expand buttons replace each other; focus follows the toggle.
    const toggleFocus = useRef<"expand" | "collapse" | null>(null);
    useEffect(() => {
        if (!props.sidebarPersistent) return;
        const target = toggleFocus.current;
        toggleFocus.current = null;
        if (target === "expand" && props.sidebarOpen) {
            collapseRef.current?.focus();
        } else if (target === "collapse" && !props.sidebarOpen) {
            props.sidebarTriggerRef.current?.focus();
        }
    }, [props.sidebarOpen, props.sidebarPersistent, props.sidebarTriggerRef]);
    const sidebarToggle =
        props.fullScreen || (props.sidebarPersistent && props.sidebarOpen)
            ? null
            : (
                <Button
                    ref={props.sidebarTriggerRef}
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="笔记侧栏"
                    title="展开笔记侧栏"
                    aria-expanded={props.sidebarOpen}
                    aria-pressed={props.sidebarOpen}
                    aria-controls="notes-sidebar"
                    onClick={() => {
                        setRestoreDrawerFocus(true);
                        toggleFocus.current = "expand";
                        if (!props.sidebarOpen) {
                            setOutlineRestoreFocus(false);
                            setOutlineOpen(false);
                        }
                        props.onSidebarOpenChange(!props.sidebarOpen);
                    }}
                >
                    <PanelLeftOpen size="1em" className="icon-md" />
                </Button>
            );
    useEffect(() => {
        if (props.sidebarOpen) setRestoreDrawerFocus(true);
    }, [props.sidebarOpen]);
    useEffect(() => {
        if (props.sidebarOpen && !props.sidebarPersistent) {
            setOutlineRestoreFocus(false);
            setOutlineOpen(false);
        }
    }, [props.sidebarOpen, props.sidebarPersistent]);
    useEffect(() => {
        if (!props.narrow) setOutlineOpen(false);
    }, [props.narrow]);
    const openDocument = async (id: string) => {
        const opened = await props.onOpenDocument(id);
        if (opened) {
            if (!props.sidebarPersistent) {
                setRestoreDrawerFocus(false);
                props.onSidebarOpenChange(false);
            }
            setFocusTitleSignal((value) => value + 1);
        }
        return opened;
    };
    const newDocument = async (
        target: { notebookId: string | null; isHomeFixed: boolean },
    ) => {
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
            if (!props.sidebarPersistent) {
                setRestoreDrawerFocus(false);
                props.onSidebarOpenChange(false);
            }
            setFocusTitleSignal((value) => value + 1);
        }
    };
    const editorKey = props.state.view === "documents/new" ||
            (props.state.view === "documents/edit" &&
                props.state.id === createdId.current)
        ? `new:${newSession}`
        : props.state.view === "documents/edit"
        ? props.state.id
        : "root";
    useEffect(() => {
        setOutlineOpen(false);
    }, [editorKey]);
    return (
        <div
            className="documents-layout"
            data-workspace-content="documents"
            data-drawer={props.sidebarPersistent
                ? undefined
                : props.sidebarOpen
                ? "open"
                : "closed"}
            data-outline-drawer={props.narrow
                ? outlineOpen ? "open" : "closed"
                : undefined}
        >
            <WindowOverlay
                open={props.sidebarOpen}
                modal={!props.sidebarPersistent}
                active={active}
                role="region"
                onOpenChange={(open) => {
                    setRestoreDrawerFocus(true);
                    props.onSidebarOpenChange(open);
                }}
                restoreFocus={restoreDrawerFocus}
                restoreFocusRef={props.sidebarTriggerRef}
                label="笔记侧栏"
                className={props.sidebarPersistent
                    ? "documents-sidebar"
                    : "documents-sidebar documents-sidebar--drawer"}
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
                        onCollapse={props.sidebarPersistent
                            ? () => {
                                toggleFocus.current = "collapse";
                                props.onSidebarOpenChange(false);
                            }
                            : undefined}
                        collapseRef={collapseRef}
                    />
                </nav>
                {!props.sidebarPersistent && (
                    <button
                        type="button"
                        className="documents-drawer-dismiss"
                        aria-label="关闭笔记侧栏"
                        onClick={() => {
                            setRestoreDrawerFocus(true);
                            props.onSidebarOpenChange(false);
                        }}
                    />
                )}
            </WindowOverlay>
            <WindowOverlay
                open={props.narrow && outlineOpen}
                active={active}
                onOpenChange={(open) => {
                    setOutlineRestoreFocus(true);
                    setOutlineOpen(open);
                }}
                restoreFocus={outlineRestoreFocus}
                restoreFocusRef={outlineTriggerRef}
                label="笔记大纲"
                className="documents-outline-drawer"
            >
                <button
                    type="button"
                    className="documents-drawer-dismiss"
                    aria-label="关闭笔记大纲"
                    onClick={() => {
                        setOutlineRestoreFocus(true);
                        setOutlineOpen(false);
                    }}
                />
                <div
                    ref={setOutlineMount}
                    className="documents-outline-drawer-content"
                />
            </WindowOverlay>
            <main className="documents-editor-pane">
                {props.state.view === "documents/root"
                    ? (
                        <div className="documents-editor-empty">
                            {sidebarToggle && (
                                <div className="document-editor-header document-editor-header--bare">
                                    {sidebarToggle}
                                </div>
                            )}
                            <EmptyState
                                title="选择或新建笔记"
                                headingLevel={3}
                                density="compact"
                            />
                        </div>
                    )
                    : (
                        <Suspense
                            fallback={
                                <LoadingState density="compact">
                                    正在加载编辑器…
                                </LoadingState>
                            }
                        >
                            <DocumentEditor
                                key={editorKey}
                                leading={sidebarToggle}
                                documentId={props.state.view ===
                                        "documents/edit"
                                    ? props.state.id
                                    : undefined}
                                target={props.state.view === "documents/new"
                                    ? props.state.target
                                    : undefined}
                                onCreated={(id) => {
                                    createdId.current = id;
                                    if (props.state.view === "documents/new") {
                                        noteNotebooks.current.set(
                                            id,
                                            props.state.target.notebookId,
                                        );
                                    }
                                    props.onCreated(id);
                                    refresh();
                                }}
                                userId={props.userId}
                                onOpenDocument={(id) => {
                                    void openDocument(id);
                                }}
                                onDirtyChange={props.onDirtyChange}
                                onChanged={refresh}
                                narrow={props.narrow}
                                outlineDrawerOpen={outlineOpen}
                                outlineDrawerMount={outlineMount}
                                outlineButtonRef={outlineTriggerRef}
                                onOutlineDrawerChange={(
                                    open,
                                    restoreFocus = true,
                                ) => {
                                    setOutlineRestoreFocus(restoreFocus);
                                    if (open && !props.sidebarPersistent) {
                                        setRestoreDrawerFocus(false);
                                        props.onSidebarOpenChange(false);
                                    }
                                    setOutlineOpen(open);
                                }}
                                focusTitleSignal={focusTitleSignal}
                                eventSubscriptions={props.eventSubscriptions}
                            />
                        </Suspense>
                    )}
            </main>
        </div>
    );
}
