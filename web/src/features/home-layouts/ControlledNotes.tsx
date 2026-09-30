import { useMemo, useState } from "react";
import type { NoteItem } from "../../components/searcher/NoteCard.tsx";
import { NoteCard } from "../../components/searcher/NoteCard.tsx";
import { selectHomeNotes } from "./controlledNotesLayout.ts";

export interface ControlledNotesProps {
    notes: NoteItem[];
    onOpen: (note: NoteItem) => void;
    onTogglePin?: (note: NoteItem) => Promise<void> | void;
    onToggleHomeFixed?: (note: NoteItem) => Promise<void> | void;
    onChangeColor?: (note: NoteItem, color: string) => Promise<void> | void;
    onDelete?: (note: NoteItem) => Promise<void> | void;
}

function resolveNoteMode(
    isExplicitlyExpanded: boolean | undefined,
    layoutExpanded: boolean | undefined,
): "compact" | "full" {
    if (isExplicitlyExpanded !== undefined) {
        return isExplicitlyExpanded ? "full" : "compact";
    }
    return layoutExpanded === false ? "compact" : "full";
}

export function ControlledNotes({
    notes,
    onOpen,
    onTogglePin,
    onToggleHomeFixed,
    onChangeColor,
    onDelete,
}: ControlledNotesProps) {
    const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

    const homeNotes = useMemo(() => selectHomeNotes(notes), [notes]);

    if (homeNotes.length === 0) {
        return null;
    }

    return (
        <div
            className="controlled-notes-board"
            data-note-count={homeNotes.length}
        >
            {homeNotes.map((note, index) => {
                const mode = resolveNoteMode(
                    expandedMap[note.id],
                    note.layout?.expanded,
                );
                return (
                    <div
                        key={note.id}
                        className="controlled-note-slot"
                        data-slot-index={index}
                    >
                        <NoteCard
                            note={note}
                            mode={mode}
                            onOpen={() => onOpen(note)}
                            onToggleMode={() =>
                                setExpandedMap((prev) => ({
                                    ...prev,
                                    [note.id]: !(mode === "full"),
                                }))}
                            onTogglePin={onTogglePin
                                ? () => void onTogglePin(note)
                                : undefined}
                            onToggleHomeFixed={onToggleHomeFixed
                                ? () => void onToggleHomeFixed(note)
                                : undefined}
                            onChangeColor={onChangeColor
                                ? (color) => void onChangeColor(note, color)
                                : undefined}
                            onDelete={onDelete
                                ? () => void onDelete(note)
                                : undefined}
                        />
                    </div>
                );
            })}
        </div>
    );
}
