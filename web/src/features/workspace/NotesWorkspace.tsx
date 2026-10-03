import { lazy, Suspense, useCallback, useEffect, useState } from "react";
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
import type { WorkspaceState } from "./workspace-state.ts";
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
function WorkspaceNote({
    note,
    actions,
    sortable = false,
    disabled = false,
    expanded = false,
    onToggleExpand,
    onDelete,
}: {
    note: NoteItem;
    actions: NoteActions;
    sortable?: boolean;
    disabled?: boolean;
    expanded?: boolean;
    onToggleExpand?: () => void;
    onDelete?: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition } =
        useSortable({ id: note.id, disabled: !sortable || disabled });
    const isInteractive = sortable && !disabled;
    return (
        <div
            ref={sortable ? setNodeRef : undefined}
            style={sortable
                ? { transform: CSS.Transform.toString(transform), transition }
                : undefined}
        >
            <NoteCard
                note={note}
                mode={expanded ? "full" : "compact"}
                onToggleMode={onToggleExpand}
                onOpen={() => actions.editNote(note)}
                dragHandle={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={(isInteractive ? "排序 " : "不可排序 ") +
                            getNoteDisplayTitle(note.title, note.body)}
                        aria-disabled={!isInteractive ? "true" : undefined}
                        tabIndex={isInteractive ? 0 : -1}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        {...(isInteractive ? attributes : {})}
                        {...(isInteractive ? listeners : {})}
                    >
                        <GripVertical size={14} />
                    </Button>
                }
                onTogglePin={() =>
                    void actions.updateNote(note, { isPinned: !note.isPinned })}
                onToggleHomeFixed={() =>
                    void actions.updateNote(note, {
                        isHomeFixed: !note.isHomeFixed,
                    })}
                onChangeColor={(color) =>
                    void actions.updateNote(note, { color })}
                onDelete={() => {
                    onDelete?.();
                    void actions.deleteNote(note);
                }}
            />
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
        state: WorkspaceState;
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
                <Suspense
                    fallback={
                        <div
                            className="note-editor"
                            role="status"
                            aria-busy="true"
                        >
                            正在加载便签编辑器…
                        </div>
                    }
                >
                    <NoteEditor
                        key={userId + ":" + editing.id}
                        note={editing}
                        onSaved={onSaved}
                    />
                </Suspense>
            )
            : <p role="status">便签已被删除，请返回便签列表。</p>;
    }

    function reorder(event: DragEndEvent) {
        if (!event.over || event.active.id === event.over.id || isSearching) {
            return;
        }
        const from = otherNotes.findIndex((note) =>
            note.id === event.active.id
        );
        const to = otherNotes.findIndex((note) => note.id === event.over?.id);
        if (from < 0 || to < 0) return;
        const reorderedOther = arrayMove(otherNotes, from, to);
        void onReorder([...fixedNotes, ...reorderedOther]);
    }

    return (
        <div className="workspace-root notes-workspace">
            <WorkspaceSearch
                ariaLabel="搜索便签"
                placeholder="搜索标题或内容"
                value={query}
                onChange={onQueryChange}
            />
            {loading && <p role="status">正在加载便签…</p>}
            {error && (
                <div role="alert">
                    {error}
                    <Button variant="outline" onClick={onRetry}>重试</Button>
                </div>
            )}
            {!isSearching
                ? (
                    <>
                        {fixedNotes.length > 0 && (
                            <section aria-labelledby="notes-fixed-heading">
                                <h3 id="notes-fixed-heading">置顶与首页固定</h3>
                                <div className="workspace-notes-list">
                                    {fixedNotes.map((note) => (
                                        <WorkspaceNote
                                            key={note.id}
                                            note={note}
                                            actions={actions}
                                            expanded={expandedIds.has(note.id)}
                                            onToggleExpand={() =>
                                                toggleExpand(note.id)}
                                            onDelete={() =>
                                                handleDelete(note.id)}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}
                        <section
                            aria-labelledby={fixedNotes.length > 0
                                ? "notes-other-heading"
                                : "notes-all-heading"}
                        >
                            <h3
                                id={fixedNotes.length > 0
                                    ? "notes-other-heading"
                                    : "notes-all-heading"}
                            >
                                {fixedNotes.length > 0
                                    ? "其他便签"
                                    : "全部便签"}
                            </h3>
                            {notes.length === 0 && !loading && (
                                <p className="workspace-empty" role="status">
                                    还没有便签，点击底部“新建便签”开始记录。
                                </p>
                            )}
                            {notes.length > 0 && otherNotes.length === 0 && (
                                <p className="workspace-empty" role="status">
                                    暂无其他便签
                                </p>
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
                                        <div className="workspace-notes-list">
                                            {otherNotes.map((note) => (
                                                <WorkspaceNote
                                                    key={note.id}
                                                    note={note}
                                                    actions={actions}
                                                    sortable
                                                    expanded={expandedIds.has(
                                                        note.id,
                                                    )}
                                                    onToggleExpand={() =>
                                                        toggleExpand(note.id)}
                                                    onDelete={() =>
                                                        handleDelete(note.id)}
                                                />
                                            ))}
                                        </div>
                                    </SortableContext>
                                </DndContext>
                            )}
                        </section>
                    </>
                )
                : (
                    <section aria-labelledby="notes-all-heading">
                        <h3 id="notes-all-heading">全部便签</h3>
                        {!searchNotes.length && !loading && (
                            <p className="workspace-empty" role="status">
                                没有匹配的便签，清空搜索可查看全部。
                            </p>
                        )}
                        {searchNotes.length > 0 && (
                            <div className="workspace-notes-list">
                                {searchNotes.map((note) => (
                                    <WorkspaceNote
                                        key={note.id}
                                        note={note}
                                        actions={actions}
                                        sortable={false}
                                        expanded={expandedIds.has(note.id)}
                                        onToggleExpand={() =>
                                            toggleExpand(note.id)}
                                        onDelete={() => handleDelete(note.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                )}
        </div>
    );
}
