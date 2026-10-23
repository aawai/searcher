import type { DocumentDto, DocumentLayoutDto } from "@shared/documents.ts";

/** A document pinned to home, with this device's desktop layout attached. */
export type PaperItem = DocumentDto & { layout: DocumentLayoutDto };

/** Mirrors the server order for home scope: homeSortOrder ascending, then id descending. */
export function sortPapers(papers: readonly PaperItem[]): PaperItem[] {
    return papers.filter((paper) => paper.isHomeFixed).sort((a, b) => {
        const difference = a.homeSortOrder - b.homeSortOrder;
        return difference !== 0 ? difference : b.id.localeCompare(a.id);
    });
}

/** Refetch when the paper is unknown locally or its version moved on. */
export function needsPaperRefresh(
    current: PaperItem | undefined,
    version: number,
): boolean {
    return current?.version !== version;
}

/** A null paper removes the document. A stale fetch never overwrites a newer local copy. */
export function setPaper(
    papers: readonly PaperItem[],
    documentId: string,
    paper: PaperItem | null,
): PaperItem[] {
    const current = papers.find((item) => item.id === documentId);
    if (paper && current && current.version > paper.version) return [...papers];
    const rest = papers.filter((item) => item.id !== documentId);
    return paper ? sortPapers([...rest, paper]) : rest;
}

/** A paper that was never moved on this device has no stored layout (the API returns null). */
export function defaultPaperLayout(): DocumentLayoutDto {
    return {
        deviceClass: "desktop",
        x: null,
        y: null,
        width: null,
        zIndex: 0,
        expanded: true,
        sortOrder: null,
        updatedAt: 0,
    };
}

export function hasSavedDesktopPosition(paper: PaperItem): boolean {
    return paper.layout.x !== null && paper.layout.y !== null;
}
