import type { HomeContinueDto } from "@shared/contracts.ts";

export type ContinueEntry =
    | { kind: "document"; id: string; title: string }
    | { kind: "conversation"; id: string; title: string };

/**
 * The single 继续 line: the more recent of the last edited note and the last
 * unfinished AI conversation. Ties go to the note; an empty result renders
 * nothing.
 */
export function continueEntries(
    candidates: HomeContinueDto | null,
): ContinueEntry[] {
    if (!candidates) return [];
    const { document, conversation } = candidates;
    const entries: ContinueEntry[] = [];
    if (
        conversation &&
        (!document || conversation.updatedAt > document.updatedAt)
    ) {
        entries.push({
            kind: "conversation",
            id: conversation.id,
            title: conversation.title,
        });
    } else if (document) {
        entries.push({
            kind: "document",
            id: document.id,
            title: document.displayTitle,
        });
    }
    return entries;
}
