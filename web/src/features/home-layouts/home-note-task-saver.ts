import type { DocumentDto } from "@shared/documents.ts";
import { ApiError } from "../../lib/api.ts";
import {
    replayTaskToggles,
    taskRowText,
    type TaskToggle,
} from "./note-tasks.ts";

/** Checkbox changes on one note inside this window are saved as one PATCH. */
export const TASK_SAVE_DEBOUNCE_MS = 1500;

export interface HomeNoteTaskSaverDeps {
    /** Rejects with ApiError; a 409 carries the latest DocumentDto in `data`. */
    save(paper: DocumentDto, body: string): Promise<DocumentDto>;
    /** Replaces the card with a server state: success, conflict or rollback. */
    render(paper: DocumentDto): void;
    /** Shows an optimistic body that the server has not acknowledged yet. */
    show(id: string, body: string): void;
    conflict(latest: DocumentDto): void;
    failed(error: unknown): void;
    schedule(run: () => void, delayMs: number): () => void;
}

export interface HomeNoteTaskSaver {
    /** Returns false when `index` is not a task of the card's current body. */
    toggle(paper: DocumentDto, index: number, checked: boolean): boolean;
    /**
     * Hands unacknowledged checkbox toggles for `id` over to an opening editor
     * session, cancelling any debounce timer and awaiting any in-flight PATCH
     * so the editor loads the settled version and applies remaining toggles.
     */
    takePending(id: string): Promise<TaskToggle[]>;
    /**
     * Returns handed-off toggles back to the saver if the editor failed to load
     * the document and was destroyed before adopting them.
     */
    restorePending(id: string, toggles: readonly TaskToggle[]): void;
}

interface NoteState {
    id: string;
    /** Last server state of the note. */
    base: DocumentDto;
    /** Every checkbox change not yet acknowledged, in order. */
    unacked: TaskToggle[];
    /** How many leading `unacked` toggles the in-flight PATCH carries; 0 when idle. */
    sent: number;
    /** True after one 409 retry on the current conflict cycle. */
    retried: boolean;
    cancelTimer: (() => void) | null;
    inFlight: Promise<void> | null;
    handedOff: boolean;
}

function conflictNote(error: unknown): DocumentDto | null {
    if (!(error instanceof ApiError) || error.code !== 409 || !error.data) {
        return null;
    }
    return error.data as DocumentDto;
}

/**
 * Optimistic, coalesced saver for checkbox toggles on home cards. State is held
 * per note inside the returned saver, so each home surface owns its own queue.
 */
export function createHomeNoteTaskSaver(
    deps: HomeNoteTaskSaverDeps,
): HomeNoteTaskSaver {
    const notes = new Map<string, NoteState>();
    const handedOffBases = new Map<string, DocumentDto>();

    function forget(note: NoteState) {
        note.cancelTimer?.();
        note.cancelTimer = null;
        if (notes.get(note.id) === note) notes.delete(note.id);
    }

    function rollback(note: NoteState, paper: DocumentDto) {
        forget(note);
        deps.render(paper);
    }

    function flush(note: NoteState) {
        if (note.sent > 0 || note.unacked.length === 0) return;
        const body = replayTaskToggles(note.base.body, note.unacked);
        if (body === null) return rollback(note, note.base);
        note.sent = note.unacked.length;
        const request = deps.save(note.base, body).then(
            (paper) => saved(note, paper),
            (error: unknown) => failed(note, error),
        ).finally(() => {
            if (note.inFlight === request) note.inFlight = null;
        });
        note.inFlight = request;
    }

    function saved(note: NoteState, paper: DocumentDto) {
        note.base = paper;
        note.unacked = note.unacked.slice(note.sent);
        note.sent = 0;
        note.retried = false;
        if (note.handedOff) {
            const body = note.unacked.length > 0
                ? replayTaskToggles(paper.body, note.unacked)
                : null;
            forget(note);
            deps.render(body !== null ? { ...paper, body } : paper);
            return;
        }
        if (note.unacked.length === 0) return rollback(note, paper);
        const body = replayTaskToggles(paper.body, note.unacked);
        if (body === null) return rollback(note, paper);
        deps.render(paper);
        deps.show(note.id, body);
        flush(note);
    }

    function failed(note: NoteState, error: unknown) {
        note.sent = 0;
        if (note.handedOff) {
            forget(note);
            return;
        }
        const latest = conflictNote(error);
        if (latest === null) {
            rollback(note, note.base);
            deps.failed(error);
            return;
        }
        if (!note.retried) {
            const body = replayTaskToggles(latest.body, note.unacked);
            if (body !== null) {
                note.base = latest;
                note.retried = true;
                deps.show(note.id, body);
                flush(note);
                return;
            }
        }
        rollback(note, latest);
        deps.conflict(latest);
    }

    return {
        toggle(paper, index, checked) {
            const existing = notes.get(paper.id);
            const base = existing?.base ?? paper;
            const unacked = existing?.unacked ?? [];
            const current = replayTaskToggles(base.body, unacked);
            if (current === null) return false;
            const text = taskRowText(current, index);
            if (text === null) return false;
            const next = [...unacked, { index, text, checked }];
            const body = replayTaskToggles(base.body, next);
            if (body === null) return false;

            const note: NoteState = existing ?? {
                id: paper.id,
                base,
                unacked: [],
                sent: 0,
                retried: false,
                cancelTimer: null,
                inFlight: null,
                handedOff: false,
            };
            note.unacked = next;
            notes.set(note.id, note);
            deps.show(note.id, body);
            if (!note.handedOff) {
                note.cancelTimer?.();
                note.cancelTimer = deps.schedule(() => {
                    note.cancelTimer = null;
                    if (notes.get(note.id) === note) flush(note);
                }, TASK_SAVE_DEBOUNCE_MS);
            }
            return true;
        },
        async takePending(id) {
            const note = notes.get(id);
            if (!note) return [];
            note.cancelTimer?.();
            note.cancelTimer = null;
            if (note.sent === 0 && !note.inFlight) {
                handedOffBases.set(id, note.base);
                notes.delete(id);
                return note.unacked;
            }
            note.handedOff = true;
            while (note.inFlight) {
                await note.inFlight;
            }
            handedOffBases.set(id, note.base);
            forget(note);
            return note.unacked;
        },
        restorePending(id, toggles) {
            if (toggles.length === 0) return;
            const existing = notes.get(id);
            const base = existing?.base ?? handedOffBases.get(id);
            if (!base) return;
            const combined = [...toggles, ...(existing?.unacked ?? [])];
            const body = replayTaskToggles(base.body, combined);
            if (body === null) return;
            const note: NoteState = existing ?? {
                id,
                base,
                unacked: [],
                sent: 0,
                retried: false,
                cancelTimer: null,
                inFlight: null,
                handedOff: false,
            };
            note.handedOff = false;
            note.unacked = combined;
            notes.set(id, note);
            deps.show(id, body);
            note.cancelTimer?.();
            note.cancelTimer = deps.schedule(() => {
                note.cancelTimer = null;
                if (notes.get(note.id) === note) flush(note);
            }, TASK_SAVE_DEBOUNCE_MS);
        },
    };
}
