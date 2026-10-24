import type { HomeContinueDto } from "@shared/contracts.ts";

export type ContinueEntry =
    | { kind: "document"; id: string; title: string }
    | { kind: "conversation"; id: string; title: string }
    | { kind: "tasks"; documentId: string; open: number };

/**
 * The single 继续 line: the more recent of the last edited note and the last
 * unfinished AI conversation, then the open to-dos on home notes. Ties go to
 * the note; an empty result renders nothing.
 */
export function continueEntries(
    candidates: HomeContinueDto | null,
): ContinueEntry[] {
    if (!candidates) return [];
    const { document, conversation, homeTasks } = candidates;
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
    if (homeTasks && homeTasks.open > 0) {
        entries.push({
            kind: "tasks",
            documentId: homeTasks.documentId,
            open: homeTasks.open,
        });
    }
    return entries;
}
