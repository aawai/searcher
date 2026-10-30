import {
    lazy,
    Suspense,
    useContext,
    useEffect,
    useId,
    useRef,
    useState,
    type RefObject,
} from "react";
import type { DocumentsRoute, DocumentsScope } from "./workspace-state.ts";
import type {
    DocumentNotebookDto,
    DocumentPageDto,
    DocumentSummaryDto,
} from "@shared/documents.ts";
import { api } from "../../lib/api.ts";
import { WorkspaceSearch } from "./WorkspaceSearch.tsx";
import {
    EmptyState,
    LoadingState,
    StatusBanner,
} from "../../components/searcher/semantic.tsx";
import { Button } from "../../components/ui/button.tsx";
import { DocumentNotebookNavigation } from "./DocumentNotebookNavigation.tsx";
import { DocumentLibraryActions } from "./DocumentLibraryActions.tsx";
import { Plus, Star } from "lucide-react";
import { WindowOverlay } from "../../components/ui/window-overlay.tsx";

import type { DocumentEventSubscriptions } from "../documents/document-event-subscriptions.ts";
import { noteListSnippet } from "./note-list-snippet.ts";
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
    narrow: boolean;
    onDirtyChange?: (dirty: boolean) => void;
    eventSubscriptions?: DocumentEventSubscriptions;
}

function DocumentSummaryRow(
    {
        item,
        notebooks,
        scope,
        onChanged,
        onOpenDocument,
        selected,
        onTrashed,
    }: {
        item: DocumentSummaryDto;
        notebooks: DocumentNotebookDto[];
        scope: DocumentsScope;
        onChanged: () => void;
        onOpenDocument: (id: string) => void;
        selected: boolean;
        onTrashed: (id: string) => void;
    },
) {
    const displayTitle = item.displayTitle;
    const snippet = noteListSnippet(item);
    const timestamp = item.updatedAt || item.createdAt;
    const formattedDate = timestamp && !isNaN(timestamp)
        ? new Date(timestamp).toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        })
        : "";

    return (
        <article className="documents-summary-row" data-document-id={item.id}>
            <div className="documents-summary-header">
                <h4 className="documents-summary-title">
                    <Button
                        variant="ghost"
                        className="documents-summary-open"
                        onClick={() =>
                            onOpenDocument(item.id)}
                        aria-label={`打开笔记：${displayTitle}`}
                        aria-current={selected ? "page" : undefined}
                    >
                        <span
                            className="documents-color-dot"
                            data-color={item.color}
                            aria-hidden="true"
                        />
                        <span className="documents-summary-title-text">
                            {displayTitle}
                        </span>
                        {item.isFavorite && (
                            <Star
                                className="icon-sm documents-favorite-icon"
                                data-favorite=""
                                aria-hidden="true"
                            />
                        )}
                    </Button>
                </h4>
                <DocumentLibraryActions
                    item={item}
                    onTrashed={onTrashed}
                    notebooks={notebooks}
                    onChanged={onChanged}
                />
            </div>
            <div className="documents-summary-line">
                {item.notebookName && scope.type !== "notebook" && (
                    <span className="documents-summary-notebook">
                        {item.notebookName}
                    </span>
                )}
                {snippet
                    ? (
                        <span className="documents-summary-snippet">
                            {snippet}
                        </span>
                    )
                    : null}
                {formattedDate
                    ? (
                        <time
                            className="documents-summary-date"
                            dateTime={new Date(timestamp).toISOString()}
                        >
                            {formattedDate}
                        </time>
                    )
                    : null}
            </div>
        </article>
    );
}

export function DocumentsWorkspace(props: DocumentsWorkspaceProps) {
    const active = useContext(WorkspaceActivity);
    const [revision, setRevision] = useState(0);
    const [focusTitleSignal, setFocusTitleSignal] = useState(0);
    const [restoreDrawerFocus, setRestoreDrawerFocus] = useState(true);
    const [newSession, setNewSession] = useState(0);
    const createdId = useRef<string | null>(null);
    const refresh = () => setRevision((value) => value + 1);
    useEffect(() => {
        if (props.sidebarOpen) setRestoreDrawerFocus(true);
    }, [props.sidebarOpen]);
    const openDocument = async (id: string) => {
        if (await props.onOpenDocument(id)) {
            if (!props.sidebarPersistent) { setRestoreDrawerFocus(false); props.onSidebarOpenChange(false); }
            setFocusTitleSignal((value) => value + 1);
        }
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
        <div className="documents-layout" data-workspace-content="documents">
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
                    <DocumentsLibrary {...props} revision={revision} onOpenDocument={openDocument} onNewDocument={newDocument} />
                </nav>
                {!props.sidebarPersistent && <button type="button" className="documents-drawer-dismiss" aria-label="关闭笔记侧栏" onClick={() => { setRestoreDrawerFocus(true); props.onSidebarOpenChange(false); }} />}
            </WindowOverlay>
            <main className="documents-editor-pane">
                {props.state.view === "documents/root"
                    ? <EmptyState title="选择或新建笔记" />
                    : <Suspense fallback={<LoadingState density="compact">正在加载编辑器…</LoadingState>}>
                        <DocumentEditor
                            key={editorKey}
                            documentId={props.state.view === "documents/edit" ? props.state.id : undefined}
                            target={props.state.view === "documents/new" ? props.state.target : undefined}
                            onCreated={(id) => { createdId.current = id; props.onCreated(id); refresh(); }}
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
function DocumentsLibrary({
    revision,
    eventSubscriptions,
    onNewDocument,
    state,
    onDocumentTrashed,
    userId,
    query,
    onQueryChange,
    scope,
    onScopeChange,
    onOpenDocument,
}: Omit<DocumentsWorkspaceProps, "onOpenDocument" | "onNewDocument"> & {
    revision: number;
    onOpenDocument: (id: string) => void;
    onNewDocument: (target: { notebookId: string | null; isHomeFixed: boolean }) => void;
}) {
    const listHeadingId = useId();
    const loadedListKey = useRef<string | null>(null);
    const trimmedQuery = query.trim();
    const isSearching = trimmedQuery.length > 0;
    const scopeKey = scope.type === "notebook"
        ? `notebook:${scope.notebookId}`
        : scope.type;

    const [items, setItems] = useState<DocumentSummaryDto[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [notebooks, setNotebooks] = useState<DocumentNotebookDto[]>([]);
    const [notebookError, setNotebookError] = useState<string | null>(null);
    const refresh = () => setRetryCount((count) => count + 1);
    // The window stays mounted while another one has focus; returning to it
    // re-reads the list, keeping the query and scope.
    const active = useContext(WorkspaceActivity);
    const wasActive = useRef(active);
    useEffect(() => {
        if (active && !wasActive.current) refresh();
        wasActive.current = active;
    }, [active]);
    useEffect(() => eventSubscriptions?.subscribeAll(refresh), [eventSubscriptions]);
    useEffect(() => { refresh(); }, [revision]);
    useEffect(() => {
        const controller = new AbortController();
        setNotebookError(null);
        api<DocumentNotebookDto[]>("/api/document-notebooks", {
            signal: controller.signal,
        })
            .then((data) => {
                if (!controller.signal.aborted) setNotebooks(data);
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted) {
                    setNotebookError(
                        error instanceof Error
                            ? error.message
                            : "加载笔记本失败",
                    );
                }
            });
        return () => controller.abort();
    }, [userId, retryCount]);

    const activeRequestRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!userId) {
            setItems([]);
            setNextCursor(null);
            setError(null);
            setLoadMoreError(null);
            setLoading(false);
            return;
        }

        let cancelled = false;
        const controller = new AbortController();

        activeRequestRef.current = controller;

        const listKey = `${userId}/${scopeKey}/${trimmedQuery}`;
        const changedList = loadedListKey.current !== listKey;
        setLoading(changedList);
        setLoadingMore(false);
        setError(null);
        setLoadMoreError(null);
        if (changedList) setItems([]);
        setNextCursor(null);

        const params = new URLSearchParams();
        let url: string;
        if (isSearching) {
            params.set("q", trimmedQuery);
            url = `/api/documents/search?${params.toString()}`;
        } else {
            params.set("scope", scope.type);
            if (scope.type === "notebook" && scope.notebookId) {
                params.set("notebookId", scope.notebookId);
            }
            url = `/api/documents?${params.toString()}`;
        }

        api<DocumentPageDto>(url, { signal: controller.signal })
            .then((data) => {
                if (cancelled || controller.signal.aborted) {
                    return;
                }
                loadedListKey.current = listKey;
                setItems(data.items ?? []);
                setNextCursor(data.nextCursor ?? null);
                setLoading(false);
            })
            .catch((err: unknown) => {
                if (
                    cancelled ||
                    controller.signal.aborted ||
                    (err instanceof DOMException && err.name === "AbortError")
                ) {
                    return;
                }
                const message = err instanceof Error
                    ? err.message
                    : "加载笔记失败";
                setError(message);
                setLoading(false);
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [userId, trimmedQuery, scopeKey, retryCount]);

    const handleLoadMore = async () => {
        const controller = activeRequestRef.current;
        if (
            !nextCursor || loadingMore || !controller ||
            controller.signal.aborted
        ) return;
        setLoadingMore(true);
        setLoadMoreError(null);
        const params = new URLSearchParams({ cursor: nextCursor });
        if (isSearching) params.set("q", trimmedQuery);
        else {
            params.set("scope", scope.type);
            if (scope.type === "notebook") {
                params.set("notebookId", scope.notebookId);
            }
        }
        try {
            const data = await api<DocumentPageDto>(
                `/api/documents${isSearching ? "/search" : ""}?${params}`,
                { signal: controller.signal },
            );
            if (controller.signal.aborted) return;
            setItems((previous) => [...previous, ...data.items]);
            setNextCursor(data.nextCursor);
        } catch (error: unknown) {
            if (controller.signal.aborted) return;
            setLoadMoreError(
                error instanceof Error ? error.message : "加载更多失败",
            );
        } finally {
            if (!controller.signal.aborted) setLoadingMore(false);
        }
    };


    const listLabel = isSearching
        ? "搜索结果"
        : scope.type === "recent"
        ? "最近笔记"
        : scope.type === "favorite"
        ? "收藏笔记"
        : scope.type === "home"
        ? "首页笔记"
        : scope.type === "notebook"
        ? notebooks.find((notebook) => notebook.id === scope.notebookId)
            ?.name ??
            "笔记本内容"
        : "全部笔记";

    return (
        <div
            className="workspace-root documents-workspace"
            data-workspace-content="documents"
        >
            {notebookError && (
                <StatusBanner tone="error" density="compact">
                    <div className="documents-status-row">
                        <span>{notebookError}</span>
                        <Button variant="outline" size="sm" onClick={refresh}>
                            重试
                        </Button>
                    </div>
                </StatusBanner>
            )}
            <DocumentNotebookNavigation
                notebooks={notebooks}
                scope={scope}
                onScopeChange={onScopeChange}
                header={
                    <div className="documents-list-toolbar">
                        <WorkspaceSearch ariaLabel="搜索笔记" placeholder="搜索笔记" value={query} onChange={onQueryChange} />
                        <Button variant="ghost" size="icon" aria-label="新建笔记"
                            title={scope.type === "notebook" ? `新建笔记（在「${notebooks.find((item) => item.id === scope.notebookId)?.name ?? "笔记本"}」）` : scope.type === "home" ? "新建笔记（固定到首页）" : "新建笔记（未分类）"}
                            onClick={() => onNewDocument({ notebookId: scope.type === "notebook" ? scope.notebookId : null, isHomeFixed: scope.type === "home" })}>
                            <Plus className="icon-md" />
                        </Button>
                    </div>
                }
                onChanged={refresh}
            />
            {/* The segmented control already names the scope on screen. */}
            <section
                className="documents-list"
                aria-labelledby={listHeadingId}
            >
                <h3 id={listHeadingId} className="sr-only">
                    {listLabel}
                </h3>
                {loading && (
                    <LoadingState density="compact">
                        正在加载笔记…
                    </LoadingState>
                )}
                {error && (
                    <StatusBanner tone="error" density="compact">
                        <div className="documents-status-row">
                            <span>{error}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRetryCount((c) => c + 1)}
                            >
                                重试
                            </Button>
                        </div>
                    </StatusBanner>
                )}
                {!loading && !error && items.length === 0 && (
                    isSearching
                        ? (
                            <EmptyState
                                headingLevel={3}
                                density="compact"
                                title="没有匹配的笔记"
                                action={
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => onQueryChange("")}
                                    >
                                        清空搜索
                                    </Button>
                                }
                            />
                        )
                        : (
                            <EmptyState
                                headingLevel={3}
                                density="compact"
                                title={scope.type === "recent"
                                    ? "暂无最近笔记"
                                    : scope.type === "favorite"
                                    ? "暂无收藏笔记"
                                    : scope.type === "home"
                                    ? "暂无首页笔记"
                                    : scope.type === "notebook"
                                    ? "笔记本为空"
                                    : "还没有笔记"}
                            />
                        )
                )}
                {items.length > 0 && (
                    <div className="documents-workspace-list">
                        {items.map((item) => (
                            <DocumentSummaryRow
                                key={item.id}
                                item={item}
                                selected={state.view === "documents/edit" && state.id === item.id}
                                notebooks={notebooks}
                                scope={isSearching ? { type: "all" } : scope}
                                onChanged={refresh}
                                onOpenDocument={onOpenDocument}
                                onTrashed={(id) => {
                                    if (state.view === "documents/edit" && state.id === id) onDocumentTrashed(id);
                                }}
                            />
                        ))}
                    </div>
                )}
                {loadMoreError && (
                    <StatusBanner tone="error" density="compact">
                        <div className="documents-status-row">
                            <span>{loadMoreError}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleLoadMore}
                            >
                                重试
                            </Button>
                        </div>
                    </StatusBanner>
                )}
                {loadingMore && (
                    <LoadingState density="compact">
                        正在加载更多笔记…
                    </LoadingState>
                )}
                {!loading && !loadingMore && nextCursor && (
                    <div className="documents-workspace-more">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleLoadMore}
                        >
                            加载更多
                        </Button>
                    </div>
                )}
            </section>
        </div>
    );
}
