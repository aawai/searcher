/**
 * An untitled note shows its first paragraph as the title; the list snippet
 * drops that leading text so the row does not say the same thing twice.
 */
export function noteListSnippet(
    note: { title: string | null; displayTitle: string; snippet: string },
): string {
    if (note.title?.trim()) return note.snippet;
    if (!note.snippet.startsWith(note.displayTitle)) return note.snippet;
    return note.snippet.slice(note.displayTitle.length).trim();
}
