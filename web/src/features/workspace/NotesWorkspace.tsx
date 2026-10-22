import {
    lazy,
    type ReactNode,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { NoteSummaryAnalysis } from "./note-summary.ts";
import { GripVertical } from "lucide-react";
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
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

const NoteEditor = lazy(() =>
    import("../../components/searcher/NoteEditor.tsx").then((module) => ({
        default: module.NoteEditor,
    }))
);

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
                        {note.body.trim() && (
                            <p className="note-list-summary">
                                {preview.sourceOnly && <span>源码匹配：</span>}
                                {analysis?.highlight(preview.text, query).map((
                                    part,
                                    index,
                                ) => part.match
                                    ? <mark key={index}>{part.text}</mark>
                                    : part.text
                                )}
                            </p>
                        )}
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
                            <GripVertical size="1em" className="icon-sm" />
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

function WorkspaceNote(props: WorkspaceNoteProps) {
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
    return (
        <div
            ref={setNodeRef}
            data-note-id={props.note.id}
            data-dragging={isDragging || undefined}
            style={props.sortable
                ? { transform: CSS.Transform.toString(transform), transition }
                : undefined}
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
                        <GripVertical size="1em" className="icon-sm" />
                    </Button>
                }
            />
        </div>
    );
}

function WorkspaceNotesList({
    notes,
    renderNote,
}: {
    notes: NoteItem[];
    renderNote: (note: NoteItem) => ReactNode;
}) {
    return (
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
    },
) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
        new Set()
    );

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
                    <Suspense
                        fallback={
                            <LoadingState density="compact">
                                正在加载编辑器…
                            </LoadingState>
                        }
                    >
                        <NoteEditor
                            key={userId + ":" + editing.id}
                            note={editing}
                            onSaved={onSaved}
                        />
                    </Suspense>
                </div>
            )
            : (
                <StatusBanner tone="info" density="compact">
                    便签已被删除，请返回便签列表。
                </StatusBanner>
            );
    }

    function reorder(event: DragEndEvent) {
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
        const reorderedOther = arrayMove(otherNotes, from, overIndex);
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
    function renderNote(note: NoteItem, sortable = false) {
        return (
            <WorkspaceNote
                key={note.id}
                {...noteProps(note)}
                sortable={sortable}
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
                    <div className="notes-workspace-error">
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
                                title="已固定"
                                count={fixedNotes.length}
                            >
                                <WorkspaceNotesList
                                    notes={fixedNotes}
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
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={reorder}
                                >
                                    <SortableContext
                                        items={otherNotes.map((note) =>
                                            note.id
                                        )}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <WorkspaceNotesList
                                            notes={otherNotes}
                                            renderNote={(note) =>
                                                renderNote(note, true)}
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
                                renderNote={renderNote}
                            />
                        )}
                    </WorkspaceSection>
                )}
        </div>
    );
}
