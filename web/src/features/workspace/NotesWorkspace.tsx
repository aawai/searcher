import {
    type CSSProperties,
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import type { NoteSummaryAnalysis } from "./note-summary.ts";
import { GripVertical } from "lucide-react";
import {
    closestCenter,
    type CollisionDetection,
    DndContext,
    type DragEndEvent,
    DragOverlay,
    getClientRect,
    KeyboardSensor,
    PointerSensor,
    pointerWithin,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { HomeLayoutProps } from "../home-layouts/types.ts";
import {
    getNoteDisplayTitle,
    NoteCard,
    type NoteItem,
} from "../../components/searcher/NoteCard.tsx";
import { NoteEditor } from "../../components/searcher/NoteEditor.tsx";
import { useMasonryLayout } from "../../components/searcher/masonry.ts";
import { Button } from "../../components/ui/button.tsx";
import { WorkspaceSearch } from "./WorkspaceSearch.tsx";
import { WorkspaceSection } from "./WorkspaceSection.tsx";
import {
    EmptyState,
    LoadingState,
    StatusBanner,
} from "../../components/searcher/semantic.tsx";
import type { NotesRoute } from "./workspace-state.ts";
import "./notes-workspace.css";

type NoteActions = Pick<
    HomeLayoutProps,
    "editNote" | "updateNote" | "updateNoteLayout" | "deleteNote"
>;
type WorkspaceNoteProps = {
    note: NoteItem;
    actions: NoteActions;
    sortable?: boolean;
    disabled?: boolean;
    expanded?: boolean;
    onToggleExpand?: () => void;
    onDelete?: () => void;
    readable?: string;
    analysis?: NoteSummaryAnalysis | null;
    query?: string;
};

function WorkspaceNoteContent({
    note,
    actions,
    sortable = false,
    disabled = false,
    expanded = false,
    onToggleExpand,
    onDelete,
    readable,
    analysis,
    query = "",
    dragHandle,
}: WorkspaceNoteProps & { dragHandle?: ReactNode }) {
    const isInteractive = sortable && !disabled;
    const displayTitle = getNoteDisplayTitle(note.title, note.body);
    const titleMatches = displayTitle.toLowerCase().includes(
        query.trim().toLowerCase(),
    );
    const preview = analysis && readable !== undefined
        ? analysis.preview(
            note.body,
            readable,
            titleMatches &&
                !readable.toLowerCase().includes(query.trim().toLowerCase())
                ? ""
                : query,
        )
        : null;
    return (
        <>
            <NoteCard
                note={note}
                mode={expanded ? "full" : "compact"}
                onToggleMode={onToggleExpand}
                onOpen={() => actions.editNote(note)}
                titleContent={analysis?.highlight(displayTitle, query).map((
                    part,
                    index,
                ) => part.match
                    ? <mark key={index}>{part.text}</mark>
                    : part.text
                )}
                summary={preview && (
                    <div className="note-list-detail">
                        <p className="note-list-summary">
                            {preview.sourceOnly && (
                                <span>匹配Markdown源码：</span>
                            )}
                            {analysis?.highlight(preview.text, query).map((
                                part,
                                index,
                            ) => part.match
                                ? <mark key={index}>{part.text}</mark>
                                : part.text
                            )}
                        </p>
                        {note.updatedAt !== undefined && (
                            <time
                                dateTime={new Date(note.updatedAt)
                                    .toISOString()}
                            >
                                {new Date(note.updatedAt).toLocaleString(
                                    "zh-CN",
                                    { dateStyle: "short", timeStyle: "short" },
                                )}
                            </time>
                        )}
                    </div>
                )}
                dragHandle={dragHandle ??
                    (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={(isInteractive
                                ? "排序 "
                                : "不可排序 ") +
                                getNoteDisplayTitle(note.title, note.body)}
                            aria-disabled={!isInteractive ? "true" : undefined}
                            tabIndex={isInteractive ? 0 : -1}
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                            }}
                        >
                            <GripVertical size={14} />
                        </Button>
                    )}
                onTogglePin={() =>
                    void actions.updateNote(note, { isPinned: !note.isPinned })}
                onToggleHomeFixed={() => void actions.updateNote(note, {
                    isHomeFixed: !note.isHomeFixed,
                })}
                onChangeColor={(color) =>
                    void actions.updateNote(note, { color })}
                onDelete={() => {
                    onDelete?.();
                    void actions.deleteNote(note);
                }}
            />
        </>
    );
}

type MasonryNoteGeometry = {
    style: CSSProperties;
    registerCard: (id: string, el: HTMLElement | null) => void;
};

function WorkspaceNote(
    { geometry, ...props }: WorkspaceNoteProps & {
        geometry?: MasonryNoteGeometry;
    },
) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: props.note.id,
        disabled: !props.sortable || props.disabled,
    });
    const interactive = props.sortable && !props.disabled;
    const ref = useCallback((el: HTMLDivElement | null) => {
        setNodeRef(el);
        geometry?.registerCard(props.note.id, el);
    }, [setNodeRef, geometry?.registerCard, props.note.id]);
    return (
        <div
            ref={ref}
            className={geometry ? "notes-workspace-masonry-item" : undefined}
            data-note-id={props.note.id}
            data-dragging={isDragging || undefined}
            style={geometry?.style ?? (props.sortable
                ? { transform: CSS.Transform.toString(transform), transition }
                : undefined)}
        >
            <WorkspaceNoteContent
                {...props}
                dragHandle={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={(interactive ? "排序 " : "不可排序 ") +
                            getNoteDisplayTitle(
                                props.note.title,
                                props.note.body,
                            )}
                        aria-disabled={!interactive ? "true" : undefined}
                        tabIndex={interactive ? 0 : -1}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        {...(interactive ? attributes : {})}
                        {...(interactive ? listeners : {})}
                    >
                        <GripVertical size={14} />
                    </Button>
                }
            />
        </div>
    );
}

type NotesListLayout = "single-column" | "masonry";
const masonryCollision: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    return hits.length ? hits : closestCenter(args);
};
const masonrySortingStrategy = () => null;
// Masonry translations are layout coordinates, not drag offsets to discard.
const masonryMeasuring = {
    draggable: { measure: getClientRect },
    droppable: { measure: getClientRect },
};

function WorkspaceMasonryNotesList({
    notes,
    renderNote,
    activeId,
    renderOverlay,
}: {
    notes: NoteItem[];
    renderNote: (note: NoteItem, geometry?: MasonryNoteGeometry) => ReactNode;
    activeId?: string | null;
    renderOverlay?: (note: NoteItem) => ReactNode;
}) {
    const [gap, setGap] = useState<number>();
    const { containerRef, registerCard, layout, heights } = useMasonryLayout({
        items: notes,
        gap,
    });
    const measureContainer = useCallback((el: HTMLDivElement | null) => {
        containerRef(el);
        if (el) {
            setGap(Number.parseFloat(
                getComputedStyle(el).getPropertyValue("--space-row-gap"),
            ));
        }
    }, [containerRef]);
    const active = notes.find((note) => note.id === activeId);
    return (
        <>
            <div
                ref={measureContainer}
                className="notes-workspace-list notes-workspace-masonry"
                data-layout="masonry"
                data-columns={layout.columns}
                style={{ height: layout.containerHeight }}
            >
                {notes.map((note) => {
                    const placement = layout.placements.get(note.id);
                    return renderNote(note, {
                        registerCard,
                        style: {
                            width: placement?.width ?? "100%",
                            transform: placement
                                ? `translate3d(${placement.x}px, ${placement.y}px, 0)`
                                : undefined,
                            visibility: placement && heights.has(note.id)
                                ? undefined
                                : "hidden",
                        },
                    });
                })}
            </div>
            {renderOverlay && createPortal(
                <DragOverlay>
                    {active && (
                        <div
                            className="notes-workspace notes-workspace-masonry-overlay"
                            aria-hidden="true"
                            inert
                            style={{ width: layout.columnWidth }}
                        >
                            {renderOverlay(active)}
                        </div>
                    )}
                </DragOverlay>,
                document.body,
            )}
        </>
    );
}

function WorkspaceNotesList({
    notes,
    listLayout,
    renderNote,
    activeId,
    renderOverlay,
}: {
    notes: NoteItem[];
    listLayout: NotesListLayout;
    renderNote: (note: NoteItem, geometry?: MasonryNoteGeometry) => ReactNode;
    activeId?: string | null;
    renderOverlay?: (note: NoteItem) => ReactNode;
}) {
    return listLayout === "masonry"
        ? (
            <WorkspaceMasonryNotesList
                notes={notes}
                renderNote={renderNote}
                activeId={activeId}
                renderOverlay={renderOverlay}
            />
        )
        : (
            <div className="notes-workspace-list" data-layout="single-column">
                {notes.map((note) => renderNote(note))}
            </div>
        );
}
export function NotesWorkspace(
    {
        state,
        notes,
        userId,
        query,
        onQueryChange,
        onSaved,
        onReorder,
        actions,
        loading,
        error,
        onRetry,
        listLayout,
    }: {
        state: NotesRoute;
        notes: NoteItem[];
        userId: string;
        query: string;
        onQueryChange: (value: string) => void;
        onSaved: (note: NoteItem) => void;
        onReorder: (notes: NoteItem[]) => Promise<void>;
        actions: NoteActions;
        loading: boolean;
        error: string;
        onRetry: () => void;
        listLayout: NotesListLayout;
    },
) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
        new Set()
    );

    const [activeMasonryNoteId, setActiveMasonryNoteId] = useState<
        string | null
    >(null);
    const [analysis, setAnalysis] = useState<NoteSummaryAnalysis | null>(null);
    const summaryCache = useRef(
        new Map<string, { body: string; readable: string }>(),
    );
    useEffect(() => {
        if (state.view !== "notes/root" || analysis) return;
        let cancelled = false;
        void import("./note-summary.ts").then((module) => {
            if (!cancelled) {
                setAnalysis({
                    analyze: module.analyzeNoteBody,
                    preview: module.noteSearchPreview,
                    highlight: module.highlightNoteText,
                });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [state.view, analysis]);
    const summaries = useMemo(() => {
        const cache = summaryCache.current;
        const ids = new Set(notes.map((note) => note.id));
        for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
        if (analysis) {
            for (const note of notes) {
                if (cache.get(note.id)?.body !== note.body) {
                    cache.set(note.id, {
                        body: note.body,
                        readable: analysis.analyze(note.body),
                    });
                }
            }
        }
        return cache;
    }, [notes, analysis]);
    useEffect(() => {
        setExpandedIds((prev) => {
            if (prev.size === 0) return prev;
            const currentIds = new Set(notes.map((n) => n.id));
            let changed = false;
            const next = new Set<string>();
            for (const id of prev) {
                if (currentIds.has(id)) {
                    next.add(id);
                } else {
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [notes]);

    const toggleExpand = useCallback((id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const handleDelete = useCallback((id: string) => {
        setExpandedIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, []);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const isSearching = Boolean(query.trim());
    const queryTrimmed = query.trim().toLowerCase();

    const sortFn = (a: NoteItem, b: NoteItem) =>
        Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) ||
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        a.id.localeCompare(b.id);

    const fixedNotes = notes
        .filter((note) => note.isPinned || note.isHomeFixed)
        .sort(sortFn);

    const otherNotes = notes
        .filter((note) => !note.isPinned && !note.isHomeFixed)
        .sort(sortFn);

    const searchNotes = isSearching
        ? notes
            .filter((note) =>
                ((note.title ?? "") + "\n" + note.body).toLowerCase().includes(
                    queryTrimmed,
                )
            )
            .sort(sortFn)
        : [];

    const editing = state.view === "notes/edit"
        ? notes.find((note) => note.id === state.id)
        : undefined;

    if (state.view === "notes/edit") {
        return editing
            ? (
                <div className="notes-workspace-editor" data-workspace-editor>
                    <NoteEditor
                        key={userId + ":" + editing.id}
                        note={editing}
                        onSaved={onSaved}
                    />
                </div>
            )
            : (
                <StatusBanner tone="info" density="compact">
                    便签已被删除，请返回便签列表。
                </StatusBanner>
            );
    }

    function reorder(event: DragEndEvent) {
        setActiveMasonryNoteId(null);
        if (!event.over || event.active.id === event.over.id || isSearching) {
            return;
        }
        const from = otherNotes.findIndex((note) =>
            note.id === event.active.id
        );
        const overIndex = otherNotes.findIndex((note) =>
            note.id === event.over?.id
        );
        if (from < 0 || overIndex < 0) return;
        let to = overIndex;
        // Keyboard coordinates identify the destination slot, not a pointer insertion edge.
        if (
            listLayout === "masonry" && event.activatorEvent.type !== "keydown"
        ) {
            const translated = event.active.rect.current.translated;
            if (!translated) return;
            const after = translated.top + translated.height / 2 >
                event.over.rect.top + event.over.rect.height / 2;
            to = Math.max(
                0,
                Math.min(
                    otherNotes.length - 1,
                    overIndex + Number(after) - Number(from < overIndex),
                ),
            );
        }
        if (from === to) return;
        const reorderedOther = arrayMove(otherNotes, from, to);
        void onReorder([...fixedNotes, ...reorderedOther]);
    }

    function noteProps(note: NoteItem): WorkspaceNoteProps {
        return {
            note,
            actions,
            analysis,
            readable: summaries.get(note.id)?.readable,
            query: isSearching ? query : "",
            expanded: expandedIds.has(note.id),
            onToggleExpand: () => toggleExpand(note.id),
            onDelete: () => handleDelete(note.id),
        };
    }
    function renderNote(
        note: NoteItem,
        geometry?: MasonryNoteGeometry,
        sortable = false,
    ) {
        return (
            <WorkspaceNote
                key={note.id}
                {...noteProps(note)}
                sortable={sortable}
                geometry={geometry}
            />
        );
    }

    return (
        <div className="workspace-root notes-workspace">
            <WorkspaceSearch
                ariaLabel="搜索便签"
                placeholder="搜索标题或内容"
                value={query}
                onChange={onQueryChange}
            />
            {loading && (
                <LoadingState density="compact">正在加载便签…</LoadingState>
            )}
            {error && (
                <StatusBanner tone="error" density="compact">
                    <div className="flex items-center justify-between gap-3 w-full">
                        <span>{error}</span>
                        <Button variant="outline" size="sm" onClick={onRetry}>
                            重试
                        </Button>
                    </div>
                </StatusBanner>
            )}
            {!isSearching
                ? (
                    <>
                        {fixedNotes.length > 0 && (
                            <WorkspaceSection
                                title="置顶与首页固定"
                                count={fixedNotes.length}
                            >
                                <WorkspaceNotesList
                                    notes={fixedNotes}
                                    listLayout={listLayout}
                                    renderNote={renderNote}
                                />
                            </WorkspaceSection>
                        )}
                        <WorkspaceSection
                            title={fixedNotes.length > 0
                                ? "其他便签"
                                : "全部便签"}
                            count={fixedNotes.length > 0
                                ? otherNotes.length
                                : notes.length}
                        >
                            {!loading && !error && notes.length === 0 && (
                                <EmptyState
                                    headingLevel={3}
                                    density="compact"
                                    title="还没有便签"
                                    description="点击底部“新建便签”开始记录。"
                                />
                            )}
                            {!loading && !error && notes.length > 0 &&
                                otherNotes.length === 0 && (
                                <EmptyState
                                    headingLevel={3}
                                    density="compact"
                                    title="暂无其他便签"
                                />
                            )}
                            {otherNotes.length > 0 && (
                                <DndContext
                                    measuring={listLayout === "masonry"
                                        ? masonryMeasuring
                                        : undefined}
                                    sensors={sensors}
                                    collisionDetection={listLayout === "masonry"
                                        ? masonryCollision
                                        : closestCenter}
                                    onDragStart={(event) => {
                                        if (listLayout === "masonry") {
                                            setActiveMasonryNoteId(
                                                String(event.active.id),
                                            );
                                        }
                                    }}
                                    onDragCancel={() =>
                                        setActiveMasonryNoteId(null)}
                                    onDragEnd={reorder}
                                >
                                    <SortableContext
                                        items={otherNotes.map((note) =>
                                            note.id
                                        )}
                                        strategy={listLayout === "masonry"
                                            ? masonrySortingStrategy
                                            : verticalListSortingStrategy}
                                    >
                                        <WorkspaceNotesList
                                            notes={otherNotes}
                                            listLayout={listLayout}
                                            renderNote={(note, geometry) =>
                                                renderNote(
                                                    note,
                                                    geometry,
                                                    true,
                                                )}
                                            activeId={activeMasonryNoteId}
                                            renderOverlay={(note) => (
                                                <WorkspaceNoteContent
                                                    {...noteProps(note)}
                                                />
                                            )}
                                        />
                                    </SortableContext>
                                </DndContext>
                            )}
                        </WorkspaceSection>
                    </>
                )
                : (
                    <WorkspaceSection
                        title="搜索结果"
                        count={searchNotes.length}
                    >
                        {!loading && !error && !searchNotes.length && (
                            <EmptyState
                                headingLevel={3}
                                density="compact"
                                title="没有匹配的便签"
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
                        )}
                        {searchNotes.length > 0 && (
                            <WorkspaceNotesList
                                notes={searchNotes}
                                listLayout={listLayout}
                                renderNote={renderNote}
                            />
                        )}
                    </WorkspaceSection>
                )}
        </div>
    );
}
