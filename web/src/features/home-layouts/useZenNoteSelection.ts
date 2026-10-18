import { useLayoutEffect, useMemo, useState } from "react";
import type { NoteItem } from "../../components/searcher/NoteCard.tsx";
import type { ZenNoteSelectionState } from "./zen-note-selection.ts";
import {
    createZenNoteSelectionState,
    reconcileZenNoteSelection,
    restoreZenNoteSelection,
    selectZenNoteIndex,
    sortZenHomeNotes,
    zenNoteSelectionKey,
} from "./zen-note-selection.ts";

function restore(userId: string, notes: NoteItem[]): ZenNoteSelectionState {
    const initial = createZenNoteSelectionState(userId, notes);
    if (!userId) return initial;
    try {
        return restoreZenNoteSelection(
            initial,
            localStorage.getItem(zenNoteSelectionKey(userId)) ?? undefined,
        );
    } catch {
        return initial;
    }
}

function persist(state: ZenNoteSelectionState): void {
    if (!state.userId) return;
    try {
        const key = zenNoteSelectionKey(state.userId);
        if (state.currentId === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, state.currentId);
    } catch {
        // Device view state is optional; denied storage must not block reading.
    }
}

export interface ZenNoteSelection {
    notes: NoteItem[];
    current: NoteItem | undefined;
    index: number;
    select: (index: number) => void;
}

export function useZenNoteSelection(
    userId: string,
    notes: NoteItem[],
): ZenNoteSelection {
    const visibleNotes = useMemo(
        () => userId ? sortZenHomeNotes(notes) : [],
        [notes, userId],
    );
    const [selection, setSelection] = useState(() =>
        restore(userId, visibleNotes)
    );
    const stateForView = selection.userId === userId
        ? reconcileZenNoteSelection(selection, visibleNotes)
        : restore(userId, visibleNotes);

    useLayoutEffect(() => {
        if (selection !== stateForView) {
            setSelection(stateForView);
            persist(stateForView);
        } else if (stateForView.currentId === undefined) {
            persist(stateForView);
        }
    }, [selection, stateForView]);

    function select(index: number): void {
        const next = selectZenNoteIndex(stateForView, index);
        if (!userId || next === stateForView) return;
        // Commit this tiny scalar before publishing the view: an immediate reload
        // must not race a passive effect or an asynchronous storage transaction.
        persist(next);
        setSelection(next);
    }

    const index = stateForView.currentId === undefined
        ? -1
        : visibleNotes.findIndex((note) => note.id === stateForView.currentId);
    return {
        notes: visibleNotes,
        current: index < 0 ? undefined : visibleNotes[index],
        index,
        select,
    };
}
