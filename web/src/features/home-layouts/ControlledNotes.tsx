import { useMemo, useState } from "react";
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
    rectSortingStrategy,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import {
    getNoteDisplayTitle,
    NoteCard,
    type NoteItem,
} from "../../components/searcher/NoteCard.tsx";
import {
    buildToggledNoteLayout,
    selectHomeNotes,
} from "./controlledNotesLayout.ts";

export interface ControlledNotesProps {
    notes: NoteItem[];
    onOpen: (note: NoteItem) => void;
    onUpdateLayout: (
        note: NoteItem,
        layout: NonNullable<NoteItem["layout"]>,
    ) => Promise<void>;
    onReorder?: (notes: NoteItem[]) => Promise<void>;
    onTogglePin?: (note: NoteItem) => Promise<void> | void;
    onToggleHomeFixed?: (note: NoteItem) => Promise<void> | void;
    onChangeColor?: (note: NoteItem, color: string) => Promise<void> | void;
    onDelete?: (note: NoteItem) => Promise<void> | void;
}

function HomeNote({
    note,
    index,
    mode,
    sortable,
    saving,
    toggleDisabled,
    onToggleMode,
    ...actions
}: Omit<ControlledNotesProps, "notes" | "onReorder"> & {
    note: NoteItem;
    index: number;
    mode: "compact" | "full";
    sortable: boolean;
    saving: boolean;
    toggleDisabled: boolean;
    onToggleMode: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        isDragging,
    } = useSortable({ id: note.id, disabled: !sortable || saving });
    return (
        <div
            className="controlled-note-slot"
            data-slot-index={index}
            data-note-id={note.id}
            data-dragging={isDragging || undefined}
        >
            <div
                ref={setNodeRef}
                style={{
                    transform: CSS.Translate.toString(transform),
                }}
            >
                <NoteCard
                    note={note}
                    mode={mode}
                    toggleDisabled={toggleDisabled}
                    dragHandle={sortable
                        ? (
                            <Button
                                ref={setActivatorNodeRef}
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="controlled-note-handle"
                                {...attributes}
                                {...(saving ? {} : listeners)}
                                aria-label={"排序便签：" +
                                    getNoteDisplayTitle(note.title, note.body)}
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                }}
                            >
                                <GripVertical size={14} aria-hidden="true" />
                            </Button>
                        )
                        : undefined}
                    onOpen={() => actions.onOpen(note)}
                    onToggleMode={onToggleMode}
                    onTogglePin={actions.onTogglePin
                        ? () => void actions.onTogglePin?.(note)
                        : undefined}
                    onToggleHomeFixed={actions.onToggleHomeFixed
                        ? () => void actions.onToggleHomeFixed?.(note)
                        : undefined}
                    onChangeColor={actions.onChangeColor
                        ? (color) => void actions.onChangeColor?.(note, color)
                        : undefined}
                    onDelete={actions.onDelete
                        ? () => void actions.onDelete?.(note)
                        : undefined}
                />
            </div>
        </div>
    );
}

export function ControlledNotes({
    notes,
    onReorder,
    onUpdateLayout,
    ...actions
}: ControlledNotesProps) {
    const [pendingToggleIds, setPendingToggleIds] = useState<Set<string>>(
        () => new Set(),
    );
    const [saving, setSaving] = useState(false);
    const homeNotes = useMemo(() => selectHomeNotes(notes), [notes]);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );
    const sortable = Boolean(onReorder) && homeNotes.length > 1;

    function reorder(event: DragEndEvent) {
        if (
            !sortable || saving || !onReorder || !event.over ||
            event.active.id === event.over.id
        ) return;
        const from = homeNotes.findIndex((note) => note.id === event.active.id);
        const to = homeNotes.findIndex((note) => note.id === event.over?.id);
        if (from < 0 || to < 0) return;
        setSaving(true);
        void onReorder(arrayMove(homeNotes, from, to)).finally(() =>
            setSaving(false)
        );
    }
    if (homeNotes.length === 0) return null;

    async function handleToggle(note: NoteItem) {
        if (pendingToggleIds.has(note.id)) return;
        setPendingToggleIds((prev) => new Set(prev).add(note.id));
        const nextLayout = buildToggledNoteLayout(note.layout);
        try {
            await onUpdateLayout(note, nextLayout);
        } finally {
            setPendingToggleIds((prev) => {
                const next = new Set(prev);
                next.delete(note.id);
                return next;
            });
        }
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={reorder}
        >
            <SortableContext
                items={homeNotes.map((note) => note.id)}
                strategy={rectSortingStrategy}
            >
                <div
                    className="controlled-notes-board"
                    data-note-count={homeNotes.length}
                >
                    {homeNotes.map((note, index) => {
                        const expanded = note.layout?.expanded ?? true;
                        return (
                            <HomeNote
                                key={note.id}
                                note={note}
                                index={index}
                                mode={expanded ? "full" : "compact"}
                                sortable={sortable}
                                saving={saving}
                                toggleDisabled={pendingToggleIds.has(note.id)}
                                onToggleMode={() => void handleToggle(note)}
                                onUpdateLayout={onUpdateLayout}
                                {...actions}
                            />
                        );
                    })}
                </div>
            </SortableContext>
        </DndContext>
    );
}
