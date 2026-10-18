import type { NoteItem } from "../../components/searcher/NoteCard.tsx";

export interface ZenNoteSelectionState {
    userId: string;
    noteIds: string[];
    currentId?: string;
}

export function sortZenHomeNotes(notes: NoteItem[]): NoteItem[] {
    return notes.filter((note) => note.isHomeFixed === true).sort((a, b) => {
        const difference = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        return difference !== 0 ? difference : a.id.localeCompare(b.id);
    });
}

export function createZenNoteSelectionState(
    userId: string,
    notes: NoteItem[],
): ZenNoteSelectionState {
    const noteIds = sortZenHomeNotes(notes).map((note) => note.id);
    return {
        userId,
        noteIds,
        currentId: noteIds[0],
    };
}

export function reconcileZenNoteSelection(
    state: ZenNoteSelectionState,
    notes: NoteItem[],
): ZenNoteSelectionState {
    const noteIds = sortZenHomeNotes(notes).map((note) => note.id);
    if (
        noteIds.length === state.noteIds.length &&
        noteIds.every((id, index) => id === state.noteIds[index])
    ) return state;

    const available = new Set(noteIds);
    let currentId = state.currentId;
    if (!currentId || !available.has(currentId)) {
        currentId = undefined;
        const oldIndex = state.currentId
            ? state.noteIds.indexOf(state.currentId)
            : -1;
        for (let index = oldIndex + 1; index < state.noteIds.length; index++) {
            const candidate = state.noteIds[index];
            if (available.has(candidate)) {
                currentId = candidate;
                break;
            }
        }
        if (currentId === undefined) {
            for (let index = oldIndex - 1; index >= 0; index--) {
                const candidate = state.noteIds[index];
                if (available.has(candidate)) {
                    currentId = candidate;
                    break;
                }
            }
        }
        currentId ??= noteIds[0];
    }

    return { ...state, noteIds, currentId };
}

export function restoreZenNoteSelection(
    state: ZenNoteSelectionState,
    savedId: string | undefined,
): ZenNoteSelectionState {
    const currentId = savedId !== undefined && state.noteIds.includes(savedId)
        ? savedId
        : state.noteIds[0];
    return { ...state, currentId };
}

export function selectZenNoteIndex(
    state: ZenNoteSelectionState,
    index: number,
): ZenNoteSelectionState {
    if (
        !Number.isInteger(index) || index < 0 || index >= state.noteIds.length
    ) {
        return state;
    }
    return {
        ...state,
        currentId: state.noteIds[index],
    };
}

export function zenNoteSelectionKey(userId: string): string {
    return `zen:home-note-selection:${encodeURIComponent(userId)}`;
}
