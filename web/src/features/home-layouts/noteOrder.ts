import type { NoteItem } from "../../components/searcher/NoteCard.tsx";
import { mergeVisibleOrder } from "../../components/searcher/launcherTiles.ts";

/**
 * Pure helper merging a reordered visible subset of notes into the full note collection.
 * Sorts full notes canonically (sortOrder ASC, id ASC) then reorders only slots
 * belonging to the provided visible subset. Untouched notes positions and
 * hidden sixth+ tail stay stable.
 *
 * Stale, unknown, or duplicate subsets safely yield the canonical order
 * without mutating input data or dropping/duplicating notes.
 */
export function mergeNoteOrder(
    notes: NoteItem[],
    reordered: NoteItem[],
): NoteItem[] {
    const canonical = [...notes].sort((a, b) => {
        const diff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
    });

    if (reordered.length === 0) {
        return canonical;
    }

    const noteMap = new Map(notes.map((n) => [n.id, n]));
    const reorderedIds = reordered.map((n) => n.id);
    const visibleSet = new Set(reorderedIds);

    // Reject duplicate IDs in reordered subset
    if (visibleSet.size !== reorderedIds.length) {
        return canonical;
    }

    // Reject unknown note IDs or stale versions
    for (const item of reordered) {
        const canonicalItem = noteMap.get(item.id);
        if (!canonicalItem) {
            return canonical;
        }
        if (
            item.version !== undefined &&
            canonicalItem.version !== undefined &&
            item.version !== canonicalItem.version
        ) {
            return canonical;
        }
    }

    // Ensure all visible IDs correspond 1:1 to slots in canonical notes
    const allIds = canonical.map((n) => n.id);
    const matchingSlots = allIds.filter((id) => visibleSet.has(id)).length;
    if (matchingSlots !== reorderedIds.length) {
        return canonical;
    }

    const mergedIds = mergeVisibleOrder(allIds, reorderedIds);
    return mergedIds.map((id) => noteMap.get(id)!);
}
