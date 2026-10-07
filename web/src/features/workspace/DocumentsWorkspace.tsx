import { useEffect, useRef, useState } from "react";
import type { DocumentsRoute, DocumentsScope } from "./workspace-state.ts";
import type { DocumentPageDto, DocumentSummaryDto } from "@shared/documents.ts";
import { api } from "../../lib/api.ts";
import { WorkspaceSearch } from "./WorkspaceSearch.tsx";
import { WorkspaceSection } from "./WorkspaceSection.tsx";
import {
    EmptyState,
    LoadingState,
    StatusBanner,
} from "../../components/searcher/semantic.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Badge } from "../../components/ui/badge.tsx";

export interface DocumentsWorkspaceProps {
    state: DocumentsRoute;
    userId: string;
    query: string;
    onQueryChange: (query: string) => void;
    scope: DocumentsScope;
}

function DocumentSummaryRow({ item }: { item: DocumentSummaryDto }) {
    const displayTitle = item.title.trim() ||
        item.snippet.trim().slice(0, 100) || "无标题笔记";
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
                <h4 className="documents-summary-title">{displayTitle}</h4>
                <div className="documents-summary-badges">
                    {item.isFavorite && <Badge variant="secondary">收藏</Badge>}
                    {item.notebookName && (
                        <Badge variant="outline">{item.notebookName}</Badge>
                    )}
                </div>
            </div>
            {item.snippet
                ? <p className="documents-summary-snippet">{item.snippet}</p>
                : null}
            <div className="documents-summary-footer">
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

export function DocumentsWorkspace({
    state,
    userId,
    query,
    onQueryChange,
    scope,
}: DocumentsWorkspaceProps) {
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

        setLoading(true);
        setLoadingMore(false);
        setError(null);
        setLoadMoreError(null);
        setItems([]);
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

    return (
        <div
            className="workspace-root documents-workspace"
            data-workspace-content="documents"
        >
            <WorkspaceSearch
                ariaLabel="搜索笔记"
                placeholder="搜索笔记标题或内容"
                value={query}
                onChange={onQueryChange}
            />
            {loading && (
                <LoadingState density="compact">正在加载笔记…</LoadingState>
            )}
            {error && (
                <StatusBanner tone="error" density="compact">
                    <div className="flex items-center justify-between gap-3 w-full">
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
            <WorkspaceSection
                title={isSearching
                    ? "搜索结果"
                    : scope.type === "recent"
                    ? "最近笔记"
                    : scope.type === "favorite"
                    ? "收藏笔记"
                    : scope.type === "notebook"
                    ? "笔记本内容"
                    : "全部笔记"}
                count={items.length}
            >
                {!loading && !error && items.length === 0 && (
                    isSearching
                        ? (
                            <EmptyState
                                headingLevel={3}
                                density="compact"
                                title="没有匹配的笔记"
                                description="清空搜索可查看全部。"
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
                                title="暂无笔记"
                                description={scope.type === "recent"
                                    ? "暂无最近查看或编辑的笔记。"
                                    : scope.type === "favorite"
                                    ? "暂无收藏笔记。"
                                    : scope.type === "notebook"
                                    ? "该笔记本下暂无笔记。"
                                    : "还没有创建任何笔记。"}
                            />
                        )
                )}
                {items.length > 0 && (
                    <div className="documents-workspace-list">
                        {items.map((item) => (
                            <DocumentSummaryRow key={item.id} item={item} />
                        ))}
                    </div>
                )}
                {loadMoreError && (
                    <StatusBanner tone="error" density="compact">
                        <div className="flex items-center justify-between gap-3 w-full">
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
            </WorkspaceSection>
        </div>
    );
}
