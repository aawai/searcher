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
import { NoteEditor } from "../../components/searcher/NoteEditor.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import type { WorkspaceState } from "./workspace-state.ts";
import "./notes-workspace.css";

type NoteActions = Pick<
    HomeLayoutProps,
    "editNote" | "updateNote" | "updateNoteLayout" | "deleteNote"
>;
function WorkspaceNote({ note, actions, sortable = false, disabled = false }: {
    note: NoteItem;
    actions: NoteActions;
    sortable?: boolean;
    disabled?: boolean;
}) {
    const { attributes, listeners, setNodeRef, transform, transition } =
        useSortable({ id: note.id, disabled: !sortable || disabled });
    return (
        <div
            ref={sortable ? setNodeRef : undefined}
            style={sortable
                ? { transform: CSS.Transform.toString(transform), transition }
                : undefined}
        >
            <NoteCard
                note={note}
                mode="compact"
                onOpen={() => actions.editNote(note)}
                dragHandle={sortable
                    ? (
                        <Button
                            variant="ghost"
                            size="icon"
                            disabled={disabled}
                            aria-label={"排序 " +
                                getNoteDisplayTitle(note.title, note.body)}
                            {...attributes}
                            {...listeners}
                        >
                            <GripVertical size={14} />
                        </Button>
                    )
                    : undefined}
                onTogglePin={() =>
                    void actions.updateNote(note, { isPinned: !note.isPinned })}
                onToggleHomeFixed={() =>
                    void actions.updateNote(note, {
                        isHomeFixed: !note.isHomeFixed,
                    })}
                onChangeColor={(color) =>
                    void actions.updateNote(note, { color })}
                onDelete={() => void actions.deleteNote(note)}
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
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );
    const ordered = notes.filter((note) =>
        ((note.title ?? "") + "\n" + note.body).toLowerCase().includes(
            query.toLowerCase(),
        )
    )
        .sort((a, b) =>
            Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) ||
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id)
        );
    const fixed = ordered.filter((note) => note.isPinned || note.isHomeFixed);
    const editing = state.view === "notes/edit"
        ? notes.find((note) => note.id === state.id)
        : undefined;
    if (state.view === "notes/edit") {
        return editing
            ? (
                <NoteEditor
                    key={userId + ":" + editing.id}
                    note={editing}
                    onSaved={onSaved}
                />
            )
            : <p role="status">便签已被删除，请返回便签列表。</p>;
    }
    function reorder(event: DragEndEvent) {
        if (!event.over || event.active.id === event.over.id || query.trim()) {
            return;
        }
        const from = ordered.findIndex((note) => note.id === event.active.id);
        const to = ordered.findIndex((note) => note.id === event.over?.id);
        if (
            from < 0 || to < 0 ||
            Boolean(ordered[from].isPinned) !== Boolean(ordered[to].isPinned)
        ) return;
        void onReorder(arrayMove(ordered, from, to));
    }
    return (
        <div className="notes-workspace">
            <Input
                data-workspace-search
                aria-label="搜索便签"
                placeholder="搜索标题或内容"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
            />
            {loading && <p role="status">正在加载便签…</p>}
            {error && (
                <div role="alert">
                    {error}
                    <Button variant="outline" onClick={onRetry}>重试</Button>
                </div>
            )}
            {fixed.length > 0 && (
                <section aria-labelledby="notes-fixed-heading">
                    <h3 id="notes-fixed-heading">置顶与首页固定</h3>
                    <div className="workspace-notes-list">
                        {fixed.map((note) => (
                            <WorkspaceNote
                                key={note.id}
                                note={note}
                                actions={actions}
                            />
                        ))}
                    </div>
                </section>
            )}
            <section aria-labelledby="notes-all-heading">
                <h3 id="notes-all-heading">全部便签</h3>
                {!ordered.length && !loading && (
                    <p className="workspace-empty" role="status">
                        {query
                            ? "没有匹配的便签，清空搜索可查看全部。"
                            : "还没有便签，点击底部“新建便签”开始记录。"}
                    </p>
                )}
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={reorder}
                >
                    <SortableContext
                        items={ordered.map((note) => note.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="workspace-notes-list">
                            {ordered.map((note) => (
                                <WorkspaceNote
                                    key={note.id}
                                    note={note}
                                    actions={actions}
                                    sortable
                                    disabled={Boolean(query.trim())}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </section>
        </div>
    );
}
