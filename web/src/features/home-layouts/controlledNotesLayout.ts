import type { NoteItem } from "../../components/searcher/NoteCard.tsx";

// Geometry belongs to the CSS slots; this function selects their stable contents.
export function selectHomeNotes(notes: NoteItem[]): NoteItem[] {
    return notes.filter((note) => note.isHomeFixed === true)
        .sort((a, b) =>
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id)
        )
        .slice(0, 5);
}

export function buildToggledNoteLayout(
    layout?: NoteItem["layout"] | null,
    nextExpanded?: boolean,
): NonNullable<NoteItem["layout"]> {
    const currentExpanded = layout?.expanded ?? true;
    const targetExpanded = nextExpanded !== undefined
        ? nextExpanded
        : !currentExpanded;
    return {
        ...(layout ?? {
            deviceClass: "desktop" as const,
            zIndex: 1,
            expanded: true,
        }),
        expanded: targetExpanded,
    };
}
