import {
    lazy,
    Suspense,
    useContext,
    useEffect,
    useId,
    useRef,
    useState,
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
import { Star } from "lucide-react";

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
    onOpenDocument: (id: string) => void;
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
    }: {
        item: DocumentSummaryDto;
        notebooks: DocumentNotebookDto[];
        scope: DocumentsScope;
        onChanged: () => void;
        onOpenDocument: (id: string) => void;
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
    if (props.state.view === "documents/edit") {
        return (
            <Suspense
                fallback={
                    <LoadingState density="compact">
                        正在加载编辑器…
                    </LoadingState>
                }
            >
                <DocumentEditor
                    key={props.state.id}
                    documentId={props.state.id}
                    userId={props.userId}
                    onOpenDocument={props.onOpenDocument}
                    onDirtyChange={props.onDirtyChange}
                    eventSubscriptions={props.eventSubscriptions}
                />
            </Suspense>
        );
    }
    return <DocumentsLibrary {...props} />;
}
function DocumentsLibrary({
    state,
    userId,
    query,
    onQueryChange,
    scope,
    onScopeChange,
    onOpenDocument,
}: DocumentsWorkspaceProps) {
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

    if (state.view !== "documents/root") return null;

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
                <div className="documents-list-toolbar">
                    <WorkspaceSearch
                        ariaLabel="搜索笔记"
                        placeholder="搜索笔记标题或内容"
                        value={query}
                        onChange={onQueryChange}
                    />
                    {!loading && !error && (
                        <span className="documents-list-count">
                            {items.length} 条
                        </span>
                    )}
                </div>
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
                                notebooks={notebooks}
                                scope={isSearching ? { type: "all" } : scope}
                                onChanged={refresh}
                                onOpenDocument={onOpenDocument}
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
