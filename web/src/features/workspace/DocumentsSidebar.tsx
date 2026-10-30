import {
    type MutableRefObject,
    type RefObject,
    useContext,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ArrowDown,
    ArrowUp,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    FolderInput,
    FolderPlus,
    PanelLeftClose,
    Pencil,
    Pin,
    Plus,
    Star,
    Trash2,
} from "lucide-react";
import {
    DOCUMENT_PAGE_MAX_LIMIT,
    type DocumentDto,
    type DocumentNotebookDto,
    type DocumentPageDto,
    type DocumentSummaryDto,
} from "@shared/documents.ts";
import { api, json } from "../../lib/api.ts";
import type { DocumentEventSubscriptions } from "../documents/document-event-subscriptions.ts";
import type { DocumentsRoute, DocumentsScope } from "./workspace-state.ts";
import { WorkspaceSearch } from "./WorkspaceSearch.tsx";
import {
    EmptyState,
    LoadingState,
    StatusBanner,
} from "../../components/searcher/semantic.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
    ContextMenuItem,
    ContextMenuSeparator,
} from "../../components/ui/context-menu.tsx";
import { useDocumentNotebookOperations } from "./document-notebook-operations.tsx";
import {
    DocumentActionMenuItems,
    DocumentLibraryActions,
    useDocumentActions,
} from "./DocumentLibraryActions.tsx";
import { documentNotebookTree } from "./document-notebooks.ts";
import { NotesTree, NotesTreeRow } from "./NotesTree.tsx";
import {
    buildTreeEntries,
    createTargetTitle,
    indexNoteNotebooks,
    type NodePage,
    notebookKey,
    noteItemId,
    resolveCreateTarget,
    resolveNewNotebookParent,
    ROOT_KEY,
    type SidebarSelection,
    type TreeEntry,
} from "./notes-tree-model.ts";
import { resolveActiveId } from "./tree-keyboard.ts";
import { noteListSnippet } from "./note-list-snippet.ts";
import {
    resolveTreeDrop,
    type TreeDropResult,
    type TreeDropZone,
} from "./notes-tree-drop.ts";
import { WorkspaceActivity } from "./WorkspaceActivity.ts";

/** Notes fetched per tree node request; further pages come from the node's own 加载更多. */
const TREE_PAGE_SIZE = 20;
/** Pages fetched at most while revealing a note that is not on a node's first page. */
const REVEAL_PAGE_LIMIT = 20;

export interface DocumentsSidebarProps {
    state: DocumentsRoute;
    userId: string;
    query: string;
    onQueryChange: (query: string) => void;
    scope: DocumentsScope;
    onScopeChange: (scope: DocumentsScope) => void;
    revision: number;
    eventSubscriptions?: DocumentEventSubscriptions;
    onOpenDocument: (id: string) => Promise<boolean>;
    onNewDocument: (
        target: { notebookId: string | null; isHomeFixed: boolean },
    ) => void;
    onDocumentTrashed: (id: string) => void;
    onOpenTrash: () => void;
    /** Notebook of notes the sidebar has not loaded, e.g. a note just created. */
    noteNotebooks: MutableRefObject<Map<string, string | null>>;
    /** Persistent sidebars carry their own collapse button; drawers dismiss through the scrim. */
    onCollapse?: () => void;
    dragDisabled?: boolean;
    collapseRef?: RefObject<HTMLButtonElement | null>;
}

const errorText = (cause: unknown, fallback: string) =>
    cause instanceof Error ? cause.message : fallback;

function DocumentSummaryRow(
    { item, notebooks, onChanged, onOpenDocument, selected, onTrashed }: {
        item: DocumentSummaryDto;
        notebooks: DocumentNotebookDto[];
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
                        <NoteMarkers item={item} />
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
                {item.notebookName && (
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

/** Favorite star and home pin trail the title of list rows and tree nodes alike. */
function NoteMarkers({ item }: { item: DocumentSummaryDto }) {
    return (
        <>
            {item.isFavorite && (
                <Star
                    className="icon-sm documents-favorite-icon"
                    data-favorite=""
                    aria-hidden="true"
                />
            )}
            {item.isHomeFixed && (
                <Pin
                    className="icon-sm documents-pin-icon"
                    data-pinned=""
                    aria-hidden="true"
                />
            )}
        </>
    );
}

export function DocumentsSidebar({
    state,
    userId,
    query,
    onQueryChange,
    scope,
    onScopeChange,
    revision,
    eventSubscriptions,
    onOpenDocument,
    onNewDocument,
    onDocumentTrashed,
    onOpenTrash,
    noteNotebooks,
    onCollapse,
    collapseRef,
    dragDisabled = false,
}: DocumentsSidebarProps) {
    const listHeadingId = useId();
    const trimmedQuery = query.trim();
    const isSearching = trimmedQuery.length > 0;
    const treeMode = !isSearching && scope.type === "tree";
    const routeNoteId = state.view === "documents/edit" ? state.id : null;

    const [retryCount, setRetryCount] = useState(0);
    const refresh = () => setRetryCount((count) => count + 1);
    const [notebooks, setNotebooks] = useState<DocumentNotebookDto[]>([]);
    const [notebooksLoaded, setNotebooksLoaded] = useState(false);
    const [notebookError, setNotebookError] = useState<string | null>(null);

    // The window stays mounted while another one has focus; returning to it
    // re-reads everything the sidebar shows.
    const active = useContext(WorkspaceActivity);
    const wasActive = useRef(active);
    useEffect(() => {
        if (active && !wasActive.current) refresh();
        wasActive.current = active;
    }, [active]);
    useEffect(() => eventSubscriptions?.subscribeAll(refresh), [
        eventSubscriptions,
    ]);
    useEffect(() => {
        refresh();
    }, [revision]);

    useEffect(() => {
        const controller = new AbortController();
        setNotebookError(null);
        api<DocumentNotebookDto[]>("/api/document-notebooks", {
            signal: controller.signal,
        })
            .then((data) => {
                if (controller.signal.aborted) return;
                setNotebooks(data);
                setNotebooksLoaded(true);
            })
            .catch((cause: unknown) => {
                if (!controller.signal.aborted) {
                    setNotebookError(errorText(cause, "加载笔记本失败"));
                }
            });
        return () => controller.abort();
    }, [userId, retryCount]);

    const tree = useMemo(() => documentNotebookTree(notebooks), [notebooks]);

    // ---- Selection: one node, single source for the create target.
    const [selection, setSelection] = useState<SidebarSelection>(null);
    useEffect(() => {
        if (routeNoteId !== null) {
            setSelection({ kind: "note", id: routeNoteId });
        } else if (state.view === "documents/root") {
            setSelection((current) =>
                current?.kind === "note" ? null : current
            );
        }
    }, [routeNoteId, state.view]);

    // ---- Tree data: lazily loaded pages per notebook, kept beside the expansion set.
    const [pages, setPages] = useState<Map<string, NodePage>>(() => new Map());
    const pagesRef = useRef(pages);
    const [expanded, setExpandedState] = useState<Set<string>>(() => new Set());
    const expandedRef = useRef(expanded);
    const alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);
    const commitPage = (key: string, page: NodePage | null) => {
        const next = new Map(pagesRef.current);
        if (page) next.set(key, page);
        else next.delete(key);
        pagesRef.current = next;
        if (alive.current) setPages(next);
    };
    const commitExpanded = (next: Set<string>) => {
        expandedRef.current = next;
        setExpandedState(next);
    };
    const queues = useRef(new Map<string, Promise<unknown>>());
    /** Operations on one node run in order, so each one sees the previous result. */
    const enqueue = (key: string, operation: () => Promise<void>) => {
        const next = (queues.current.get(key) ?? Promise.resolve()).then(
            operation,
        ).catch(() => {});
        queues.current.set(key, next);
        return next;
    };
    const fetchPage = (key: string, cursor: string | null, limit: number) => {
        const params = new URLSearchParams({ limit: String(limit) });
        if (key === ROOT_KEY) params.set("scope", "uncategorized");
        else {
            params.set("scope", "notebook");
            params.set("notebookId", key.slice("nb:".length));
        }
        if (cursor) params.set("cursor", cursor);
        return api<DocumentPageDto>(`/api/documents?${params}`);
    };
    const loadNode = (key: string) =>
        enqueue(key, async () => {
            const existing = pagesRef.current.get(key);
            if (existing?.status === "loaded") {
                // Re-read what is shown, keeping as many notes as were loaded.
                const wanted = existing.items.length;
                try {
                    const items: DocumentSummaryDto[] = [];
                    let cursor: string | null = null;
                    do {
                        const data = await fetchPage(
                            key,
                            cursor,
                            Math.min(
                                Math.max(wanted - items.length, TREE_PAGE_SIZE),
                                DOCUMENT_PAGE_MAX_LIMIT,
                            ),
                        );
                        items.push(...data.items);
                        cursor = data.nextCursor;
                    } while (cursor && items.length < wanted);
                    commitPage(key, {
                        items,
                        nextCursor: cursor,
                        status: "loaded",
                        error: null,
                        loadingMore: false,
                        loadMoreError: null,
                    });
                } catch { /* the stale page stays until the next refresh */ }
                return;
            }
            commitPage(key, {
                items: [],
                nextCursor: null,
                status: "loading",
                error: null,
                loadingMore: false,
                loadMoreError: null,
            });
            try {
                const data = await fetchPage(key, null, TREE_PAGE_SIZE);
                commitPage(key, {
                    items: data.items,
                    nextCursor: data.nextCursor,
                    status: "loaded",
                    error: null,
                    loadingMore: false,
                    loadMoreError: null,
                });
            } catch (cause) {
                commitPage(key, {
                    items: [],
                    nextCursor: null,
                    status: "error",
                    error: errorText(cause, "加载笔记失败"),
                    loadingMore: false,
                    loadMoreError: null,
                });
            }
        });
    const loadMoreNode = (key: string) =>
        enqueue(key, async () => {
            const page = pagesRef.current.get(key);
            if (
                !page || page.status !== "loaded" || page.nextCursor === null
            ) return;
            commitPage(key, {
                ...page,
                loadingMore: true,
                loadMoreError: null,
            });
            try {
                const data = await fetchPage(
                    key,
                    page.nextCursor,
                    TREE_PAGE_SIZE,
                );
                const current = pagesRef.current.get(key) ?? page;
                const known = new Set(current.items.map((item) => item.id));
                commitPage(key, {
                    ...current,
                    items: [
                        ...current.items,
                        ...data.items.filter((item) => !known.has(item.id)),
                    ],
                    nextCursor: data.nextCursor,
                    loadingMore: false,
                });
            } catch (cause) {
                const current = pagesRef.current.get(key) ?? page;
                commitPage(key, {
                    ...current,
                    loadingMore: false,
                    loadMoreError: errorText(cause, "加载更多失败"),
                });
            }
        });
    const setExpanded = (key: string, open: boolean) => {
        const next = new Set(expandedRef.current);
        if (open) next.add(key);
        else next.delete(key);
        commitExpanded(next);
        if (open) void loadNode(key);
    };
    // Every refresh re-reads the open nodes; closed ones reload when reopened.
    useEffect(() => {
        void loadNode(ROOT_KEY);
        for (const key of expandedRef.current) void loadNode(key);
    }, [retryCount]);

    // ---- Reveal: opening a note expands its notebook, selects it and scrolls it into view.
    const [scrollTarget, setScrollTarget] = useState<string | null>(null);
    const noteIndex = useMemo(() => indexNoteNotebooks(pages), [pages]);
    const noteNotebookId = (id: string) =>
        noteIndex.has(id) ? noteIndex.get(id) : noteNotebooks.current.get(id);
    const selectedNoteId = selection?.kind === "note" ? selection.id : null;
    useEffect(() => {
        if (!treeMode || !notebooksLoaded || selectedNoteId === null) return;
        let cancelled = false;
        (async () => {
            let notebookId = noteNotebookId(selectedNoteId);
            if (notebookId === undefined) {
                try {
                    notebookId = (await api<DocumentDto>(
                        `/api/documents/${selectedNoteId}`,
                    )).notebookId;
                    noteNotebooks.current.set(selectedNoteId, notebookId);
                } catch {
                    return;
                }
            }
            if (cancelled) return;
            const key = notebookId === null
                ? ROOT_KEY
                : notebookKey(notebookId);
            const parentId = notebooks.find((item) => item.id === notebookId)
                ?.parentId;
            for (
                const open of notebookId === null
                    ? []
                    : parentId
                    ? [notebookKey(parentId), key]
                    : [key]
            ) {
                if (!expandedRef.current.has(open)) setExpanded(open, true);
            }
            await loadNode(key);
            let refreshed = false;
            for (
                let attempt = 0;
                attempt < REVEAL_PAGE_LIMIT && !cancelled;
                attempt++
            ) {
                const page = pagesRef.current.get(key);
                if (
                    !page ||
                    page.items.some((item) => item.id === selectedNoteId)
                ) break;
                if (page.nextCursor !== null) await loadMoreNode(key);
                else if (!refreshed) {
                    refreshed = true;
                    await loadNode(key);
                } else break;
            }
            if (!cancelled) setScrollTarget(noteItemId(selectedNoteId));
        })();
        return () => {
            cancelled = true;
        };
    }, [treeMode, notebooksLoaded, selectedNoteId]);

    // ---- List mode: the flat list of a fixed entry or of the search results.
    const listKey = isSearching ? `search:${trimmedQuery}` : scope.type;
    const loadedListKey = useRef<string | null>(null);
    const [items, setItems] = useState<DocumentSummaryDto[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
    const activeRequestRef = useRef<AbortController | null>(null);
    useEffect(() => {
        if (treeMode) {
            activeRequestRef.current?.abort();
            loadedListKey.current = null;
            return;
        }
        let cancelled = false;
        const controller = new AbortController();
        activeRequestRef.current = controller;
        const changedList = loadedListKey.current !== `${userId}/${listKey}`;
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
            url = `/api/documents/search?${params}`;
        } else {
            params.set("scope", scope.type);
            url = `/api/documents?${params}`;
        }
        api<DocumentPageDto>(url, { signal: controller.signal })
            .then((data) => {
                if (cancelled || controller.signal.aborted) return;
                loadedListKey.current = `${userId}/${listKey}`;
                setItems(data.items ?? []);
                setNextCursor(data.nextCursor ?? null);
                setLoading(false);
            })
            .catch((cause: unknown) => {
                if (
                    cancelled || controller.signal.aborted ||
                    (cause instanceof DOMException &&
                        cause.name === "AbortError")
                ) return;
                setError(errorText(cause, "加载笔记失败"));
                setLoading(false);
            });
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [userId, treeMode, listKey, retryCount]);

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
        else params.set("scope", scope.type);
        try {
            const data = await api<DocumentPageDto>(
                `/api/documents${isSearching ? "/search" : ""}?${params}`,
                { signal: controller.signal },
            );
            if (controller.signal.aborted) return;
            setItems((previous) => [...previous, ...data.items]);
            setNextCursor(data.nextCursor);
        } catch (cause: unknown) {
            if (controller.signal.aborted) return;
            setLoadMoreError(errorText(cause, "加载更多失败"));
        } finally {
            if (!controller.signal.aborted) setLoadingMore(false);
        }
    };

    // ---- Commands
    const createTarget = resolveCreateTarget({
        selection,
        treeMode,
        notebooks,
        noteNotebookId,
    });
    const newNotebookParent = treeMode
        ? resolveNewNotebookParent(selection, notebooks)
        : null;
    const parentName = notebooks.find((item) => item.id === newNotebookParent)
        ?.name;
    const ops = useDocumentNotebookOperations({
        notebooks,
        onChanged: refresh,
        onNotebookDeleted: (id) => {
            const next = new Set(expandedRef.current);
            next.delete(notebookKey(id));
            commitExpanded(next);
            commitPage(notebookKey(id), null);
            setSelection((current) =>
                current?.kind === "notebook" && current.id === id
                    ? null
                    : current
            );
        },
        onNotebookCreated: (parentId) => {
            if (parentId !== null) setExpanded(notebookKey(parentId), true);
        },
    });
    const newNote = (notebookId: string | null) =>
        onNewDocument({ notebookId, isHomeFixed: false });
    const openNote = async (id: string) => {
        if (await onOpenDocument(id)) {
            setSelection({ kind: "note", id });
            if (treeMode) setScrollTarget(noteItemId(id));
        }
    };
    const showFixedEntry = (type: "recent" | "favorite") => {
        onScopeChange({ type });
        if (isSearching) onQueryChange("");
    };
    const showTree = () => {
        onScopeChange({ type: "tree" });
        if (isSearching) onQueryChange("");
    };

    // ---- Tree rendering state
    const entries = useMemo(() => buildTreeEntries(tree, expanded, pages), [
        tree,
        expanded,
        pages,
    ]);
    const [moveError, setMoveError] = useState<string | null>(null);
    const moveTreeItem = async (
        move: Extract<TreeDropResult, { valid: true }>,
    ) => {
        setMoveError(null);
        const oldPages = pagesRef.current;
        const oldNotebooks = notebooks;
        const oldIndex = new Map(noteNotebooks.current);
        if (move.kind === "note") {
            const next = new Map(oldPages);
            let moving: DocumentSummaryDto | undefined;
            for (const [key, page] of next) {
                const found = page.items.find((item) => item.id === move.id);
                if (found) moving = found;
                next.set(key, {
                    ...page,
                    items: page.items.filter((item) => item.id !== move.id),
                });
            }
            const key = move.notebookId === null
                ? ROOT_KEY
                : notebookKey(move.notebookId);
            const target = next.get(key);
            if (target && moving) {
                const items = [...target.items];
                const anchor = move.beforeId ?? move.afterId;
                const index = anchor
                    ? items.findIndex((item) => item.id === anchor)
                    : 0;
                items.splice(
                    index < 0 ? items.length : index + (move.afterId ? 1 : 0),
                    0,
                    { ...moving, notebookId: move.notebookId },
                );
                next.set(key, { ...target, items });
            }
            pagesRef.current = next;
            setPages(next);
            noteNotebooks.current.set(move.id, move.notebookId);
        } else {
            const moving = notebooks.find((item) => item.id === move.id);
            if (moving) {
                const siblings = notebooks.filter((item) =>
                    item.parentId === move.parentId && item.id !== move.id
                )
                    .sort((a, b) =>
                        a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
                    );
                const anchor = move.beforeId ?? move.afterId;
                const index = anchor
                    ? siblings.findIndex((item) => item.id === anchor)
                    : siblings.length;
                siblings.splice(
                    index < 0
                        ? siblings.length
                        : index + (move.afterId ? 1 : 0),
                    0,
                    { ...moving, parentId: move.parentId },
                );
                const updated = new Map(
                    siblings.map((
                        item,
                        sortOrder,
                    ) => [item.id, { ...item, sortOrder }]),
                );
                setNotebooks(
                    notebooks.map((item) => updated.get(item.id) ?? item),
                );
            }
        }
        try {
            if (move.kind === "note") {
                await api(
                    `/api/documents/${move.id}/position`,
                    json("POST", {
                        notebookId: move.notebookId,
                        beforeId: move.beforeId,
                        afterId: move.afterId,
                    }),
                );
            } else {
                await api(
                    `/api/document-notebooks/${move.id}/move`,
                    json("POST", {
                        parentId: move.parentId,
                        beforeId: move.beforeId,
                        afterId: move.afterId,
                    }),
                );
            }
            refresh();
        } catch (cause) {
            pagesRef.current = oldPages;
            setPages(oldPages);
            setNotebooks(oldNotebooks);
            noteNotebooks.current = oldIndex;
            setMoveError(errorText(cause, "移动失败"));
            refresh();
        }
    };
    const resolveDrop = (
        source: TreeEntry,
        target: TreeEntry,
        zone: TreeDropZone,
    ) => resolveTreeDrop({
        active: source,
        over: target,
        zone,
        entries,
        notebooks,
    });
    const selectedTreeId = selection === null
        ? null
        : selection.kind === "note"
        ? noteItemId(selection.id)
        : notebookKey(selection.id);
    const [activeId, setActiveId] = useState<string | null>(null);
    const rovingId = resolveActiveId(entries, activeId, selectedTreeId);
    const treeRoot = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scrollTarget === null) return;
        const element = treeRoot.current?.querySelector<HTMLElement>(
            `[data-tree-id="${CSS.escape(scrollTarget)}"]`,
        );
        if (!element) return;
        element.scrollIntoView({ block: "nearest" });
        setScrollTarget(null);
    }, [scrollTarget, entries]);

    const activateEntry = (entry: TreeEntry) => {
        if (entry.kind === "notebook") {
            setSelection({ kind: "notebook", id: entry.node.notebook.id });
            setExpanded(entry.nodeKey, !expandedRef.current.has(entry.nodeKey));
        } else if (entry.kind === "note") void openNote(entry.note.id);
        else if (entry.kind === "more") void loadMoreNode(entry.nodeKey);
        else if (entry.retry) void loadNode(entry.nodeKey);
    };

    const renderEntry = (entry: TreeEntry) => {
        switch (entry.kind) {
            case "notebook": {
                const { notebook, depth, hasChildren, siblingIndex, siblings } =
                    entry.node;
                return (
                    <NotesTreeRow
                        key={entry.id}
                        entry={entry}
                        label={notebook.name}
                        actionLabel={`笔记本操作：${notebook.name}`}
                        menu={
                            <>
                                <ContextMenuItem
                                    onClick={() => newNote(notebook.id)}
                                >
                                    <Plus className="icon-md" />
                                    <span>新建笔记</span>
                                </ContextMenuItem>
                                {depth === 0 && (
                                    <ContextMenuItem
                                        onClick={() =>
                                            ops.createNotebook(notebook.id)}
                                    >
                                        <FolderPlus className="icon-md" />
                                        <span>新建子笔记本</span>
                                    </ContextMenuItem>
                                )}
                                <ContextMenuItem
                                    onClick={() => ops.rename(notebook)}
                                >
                                    <Pencil className="icon-md" />
                                    <span>重命名</span>
                                </ContextMenuItem>
                                <ContextMenuItem
                                    disabled={hasChildren}
                                    onClick={() => ops.move(notebook)}
                                >
                                    <FolderInput className="icon-md" />
                                    <span>移动到…</span>
                                </ContextMenuItem>
                                <ContextMenuItem
                                    disabled={siblingIndex === 0}
                                    onClick={() =>
                                        ops.reorder(entry.node, "up")}
                                >
                                    <ArrowUp className="icon-md" />
                                    <span>上移</span>
                                </ContextMenuItem>
                                <ContextMenuItem
                                    disabled={siblingIndex ===
                                        siblings.length - 1}
                                    onClick={() =>
                                        ops.reorder(entry.node, "down")}
                                >
                                    <ArrowDown className="icon-md" />
                                    <span>下移</span>
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                    variant="destructive"
                                    onClick={() => ops.remove(notebook)}
                                >
                                    <Trash2 className="icon-md" />
                                    <span>删除笔记本</span>
                                </ContextMenuItem>
                            </>
                        }
                    >
                        <Chevron expanded={entry.expanded} />
                        <span className="documents-tree-label">
                            {notebook.name}
                        </span>
                    </NotesTreeRow>
                );
            }
            case "note": {
                const key = entry.note.notebookId === null
                    ? ROOT_KEY
                    : notebookKey(entry.note.notebookId);
                const siblings = pages.get(key)?.items ?? [];
                const index = siblings.findIndex((item) =>
                    item.id === entry.note.id
                );
                const up = index > 0 ? siblings[index - 1] : undefined;
                const down = index >= 0 ? siblings[index + 1] : undefined;
                return (
                    <TreeNoteRow
                        key={entry.id}
                        entry={entry}
                        notebooks={notebooks}
                        onMoveUp={up
                            ? () =>
                                void moveTreeItem({
                                    valid: true,
                                    kind: "note",
                                    id: entry.note.id,
                                    notebookId: entry.note.notebookId,
                                    beforeId: up.id,
                                })
                            : undefined}
                        onMoveDown={down
                            ? () =>
                                void moveTreeItem({
                                    valid: true,
                                    kind: "note",
                                    id: entry.note.id,
                                    notebookId: entry.note.notebookId,
                                    afterId: down.id,
                                })
                            : undefined}
                        onChanged={refresh}
                        onTrashed={(id) => {
                            if (
                                state.view === "documents/edit" &&
                                state.id === id
                            ) onDocumentTrashed(id);
                        }}
                    />
                );
            }
            case "more":
                return (
                    <NotesTreeRow key={entry.id} entry={entry} label="加载更多">
                        <span className="documents-tree-more">
                            {entry.loading
                                ? "正在加载更多…"
                                : entry.error
                                ? `${entry.error}，重试`
                                : "加载更多"}
                        </span>
                    </NotesTreeRow>
                );
            case "status":
                return (
                    <NotesTreeRow
                        key={entry.id}
                        entry={entry}
                        label={entry.text}
                    >
                        <span className="documents-tree-status">
                            {entry.text}
                        </span>
                    </NotesTreeRow>
                );
        }
    };

    // Only the tree's label is a heading; a list names itself through its own (hidden) heading.
    const HeadingTag = treeMode ? "h3" : "div";
    const listLabel = isSearching
        ? "搜索结果"
        : scope.type === "recent"
        ? "最近笔记"
        : "收藏笔记";
    const scopeName = isSearching
        ? "搜索结果"
        : scope.type === "recent"
        ? "最近"
        : "收藏";

    return (
        <div
            className="workspace-root documents-workspace"
            data-workspace-content="documents"
            data-sidebar-mode={treeMode ? "tree" : "list"}
        >
            <div className="documents-sidebar-header">
                <div className="documents-list-toolbar">
                    <WorkspaceSearch
                        ariaLabel="搜索笔记"
                        placeholder="搜索笔记"
                        value={query}
                        onChange={onQueryChange}
                    />
                </div>
                {onCollapse && (
                    <Button
                        ref={collapseRef}
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="documents-heading-action"
                        aria-label="笔记侧栏"
                        title="收起笔记侧栏"
                        aria-expanded
                        aria-pressed
                        aria-controls="notes-sidebar"
                        onClick={onCollapse}
                    >
                        <PanelLeftClose className="icon-md" />
                    </Button>
                )}
            </div>
            <div className="documents-sidebar-scroll">
                {notebookError && (
                    <StatusBanner tone="error" density="compact">
                        <div className="documents-status-row">
                            <span>{notebookError}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={refresh}
                            >
                                重试
                            </Button>
                        </div>
                    </StatusBanner>
                )}
                {moveError && (
                    <StatusBanner tone="error" density="compact">
                        {moveError}
                    </StatusBanner>
                )}
                <div
                    className="documents-fixed-entries"
                    role="group"
                    aria-label="固定入口"
                >
                    <Button
                        variant="ghost"
                        className="documents-entry"
                        aria-pressed={!isSearching && scope.type === "recent"}
                        onClick={() => showFixedEntry("recent")}
                    >
                        <Clock className="icon-md" aria-hidden="true" />
                        <span>最近</span>
                    </Button>
                    <Button
                        variant="ghost"
                        className="documents-entry"
                        aria-pressed={!isSearching && scope.type === "favorite"}
                        onClick={() => showFixedEntry("favorite")}
                    >
                        <Star className="icon-md" aria-hidden="true" />
                        <span>收藏</span>
                    </Button>
                </div>
                <section
                    className="documents-notebook-area"
                    aria-label="笔记本"
                >
                    <div className="documents-notebooks-row">
                        <HeadingTag className="documents-notebooks-heading">
                            <Button
                                variant="ghost"
                                className="documents-entry"
                                aria-current={treeMode ? "true" : undefined}
                                aria-label={treeMode
                                    ? undefined
                                    : `返回笔记本，当前：${scopeName}`}
                                title={treeMode ? undefined : "返回笔记本"}
                                onClick={showTree}
                            >
                                {treeMode ? "笔记本" : (
                                    <>
                                        <ChevronLeft
                                            className="icon-sm"
                                            aria-hidden="true"
                                        />
                                        <span>{scopeName}</span>
                                    </>
                                )}
                            </Button>
                        </HeadingTag>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="documents-heading-action"
                            aria-label="新建笔记"
                            title={createTargetTitle(createTarget)}
                            onClick={() => newNote(createTarget.notebookId)}
                        >
                            <Plus className="icon-md" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="documents-heading-action"
                            aria-label="新建笔记本"
                            title={parentName
                                ? `新建子笔记本（在「${parentName}」下）`
                                : "新建笔记本"}
                            disabled={ops.isPending}
                            onClick={() =>
                                ops.createNotebook(newNotebookParent ?? "")}
                        >
                            <FolderPlus className="icon-md" />
                        </Button>
                    </div>
                    {treeMode
                        ? (
                            <div ref={treeRoot}>
                                <NotesTree
                                    label="笔记本"
                                    entries={entries}
                                    activeId={rovingId}
                                    selectedId={selectedTreeId}
                                    onActiveChange={setActiveId}
                                    onToggle={(id, open) =>
                                        setExpanded(id, open)}
                                    onActivate={activateEntry}
                                    onClearSelection={() => setSelection(null)}
                                    resolveDrop={resolveDrop}
                                    disabled={dragDisabled}
                                    onDrop={(source, target, zone) => {
                                        const result = resolveDrop(
                                            source,
                                            target,
                                            zone,
                                        );
                                        if (result.valid) {
                                            void moveTreeItem(result);
                                        }
                                    }}
                                    onDragHoverExpand={(entry) => {
                                        if (
                                            entry.kind === "notebook" &&
                                            !entry.expanded
                                        ) setExpanded(entry.nodeKey, true);
                                    }}
                                >
                                    {renderEntry}
                                </NotesTree>
                            </div>
                        )
                        : (
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
                                    <StatusBanner
                                        tone="error"
                                        density="compact"
                                    >
                                        <div className="documents-status-row">
                                            <span>{error}</span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={refresh}
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
                                                        onClick={() =>
                                                            onQueryChange("")}
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
                                                    : "暂无收藏笔记"}
                                            />
                                        )
                                )}
                                {items.length > 0 && (
                                    <div className="documents-workspace-list">
                                        {items.map((item) => (
                                            <DocumentSummaryRow
                                                key={item.id}
                                                item={item}
                                                selected={state.view ===
                                                        "documents/edit" &&
                                                    state.id === item.id}
                                                notebooks={notebooks}
                                                onChanged={refresh}
                                                onOpenDocument={(id) =>
                                                    void openNote(id)}
                                                onTrashed={(id) => {
                                                    if (
                                                        state.view ===
                                                            "documents/edit" &&
                                                        state.id === id
                                                    ) onDocumentTrashed(id);
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}
                                {loadMoreError && (
                                    <StatusBanner
                                        tone="error"
                                        density="compact"
                                    >
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
                        )}
                </section>
            </div>
            <div className="documents-sidebar-footer">
                <Button
                    variant="ghost"
                    className="documents-entry"
                    onClick={onOpenTrash}
                >
                    <Trash2 className="icon-md" aria-hidden="true" />
                    <span>回收站</span>
                </Button>
            </div>
            {ops.dialogs}
        </div>
    );
}

function Chevron({ expanded }: { expanded: boolean }) {
    const Icon = expanded ? ChevronDown : ChevronRight;
    return (
        <Icon className="icon-sm documents-tree-chevron" aria-hidden="true" />
    );
}

/** A note node: its own row, the shared note menu and the dialogs those actions open. */
function TreeNoteRow(
    { entry, notebooks, onChanged, onTrashed, onMoveUp, onMoveDown }: {
        entry: Extract<TreeEntry, { kind: "note" }>;
        notebooks: DocumentNotebookDto[];
        onChanged: () => void;
        onTrashed: (id: string) => void;
        onMoveUp?: () => void;
        onMoveDown?: () => void;
    },
) {
    const item = entry.note;
    const actions = useDocumentActions({
        item,
        notebooks,
        onChanged,
        onTrashed,
        showReorderActions: true,
        onMoveUp,
        onMoveDown,
    });
    return (
        <NotesTreeRow
            entry={entry}
            label={`${item.displayTitle}${item.isFavorite ? "，已收藏" : ""}${
                item.isHomeFixed ? "，已固定到首页" : ""
            }`}
            actionLabel={`笔记操作：${item.displayTitle}`}
            menu={<DocumentActionMenuItems actions={actions} menu="context" />}
            after={actions.dialogs}
        >
            <span
                className="documents-color-dot"
                data-color={item.color}
                aria-hidden="true"
            />
            <span className="documents-tree-label">{item.displayTitle}</span>
            <NoteMarkers item={item} />
        </NotesTreeRow>
    );
}
