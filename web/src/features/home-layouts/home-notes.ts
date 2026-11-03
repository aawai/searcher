import type { DocumentDto } from "@shared/documents.ts";

/** A note pinned to home. */
export type HomeNoteItem = DocumentDto;

/** Mirrors the server home scope: homeSortOrder, createdAt, then id ascending. */
export function sortNotes(notes: readonly HomeNoteItem[]): HomeNoteItem[] {
    return notes.filter((note) => note.isHomeFixed).sort((a, b) =>
        a.homeSortOrder - b.homeSortOrder ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id)
    );
}

/** Refetch when the note is unknown locally or its version moved on. */
export function needsNoteRefresh(
    current: HomeNoteItem | undefined,
    version: number,
): boolean {
    return current?.version !== version;
}

/** A null note removes the document. A stale fetch never overwrites a newer local copy. */
export function setNote(
    notes: readonly HomeNoteItem[],
    documentId: string,
    note: HomeNoteItem | null,
): HomeNoteItem[] {
    const current = notes.find((item) => item.id === documentId);
    if (note && current && current.version > note.version) return [...notes];
    const rest = notes.filter((item) => item.id !== documentId);
    return note ? sortNotes([...rest, note]) : rest;
}
