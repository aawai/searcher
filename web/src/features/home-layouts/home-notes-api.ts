import {
    DOCUMENT_PAGE_MAX_LIMIT,
    type DocumentDto,
    type DocumentLayoutDto,
    type DocumentLayoutsDto,
    type DocumentPageDto,
    type DocumentSummaryDto,
    type UpdateDocumentInput,
} from "@shared/documents.ts";
import { api, ApiError, json } from "../../lib/api.ts";
import { defaultNoteLayout, type HomeNoteItem } from "./home-notes.ts";

const DOCUMENTS = "/api/documents";

function documentPath(id: string, suffix = ""): string {
    return `${DOCUMENTS}/${encodeURIComponent(id)}${suffix}`;
}

async function fetchHomeSummaries(): Promise<DocumentSummaryDto[]> {
    const items: DocumentSummaryDto[] = [];
    let cursor: string | null = null;
    do {
        const query = new URLSearchParams({
            scope: "home",
            limit: String(DOCUMENT_PAGE_MAX_LIMIT),
        });
        if (cursor) query.set("cursor", cursor);
        const page = await api<DocumentPageDto>(`${DOCUMENTS}?${query}`);
        items.push(...page.items);
        cursor = page.nextCursor;
    } while (cursor);
    return items;
}

/** Returns null when the document is gone or no longer pinned to home. */
export async function fetchHomeNote(id: string): Promise<HomeNoteItem | null> {
    try {
        const document = await api<DocumentDto>(documentPath(id));
        if (!document.isHomeFixed) return null;
        const layout = await api<DocumentLayoutDto | null>(
            documentPath(id, "/layout"),
        );
        return { ...document, layout: layout ?? defaultNoteLayout() };
    } catch (cause) {
        if (cause instanceof ApiError && cause.code === 404) return null;
        throw cause;
    }
}

export async function fetchHomeNotes(): Promise<HomeNoteItem[]> {
    const summaries = await fetchHomeSummaries();
    const notes = await Promise.all(
        summaries.map((summary) => fetchHomeNote(summary.id)),
    );
    return notes.filter((note): note is HomeNoteItem => note !== null);
}

export function patchNote(
    note: Pick<DocumentDto, "id" | "version">,
    patch: Omit<UpdateDocumentInput, "version">,
): Promise<DocumentDto> {
    return api<DocumentDto>(
        documentPath(note.id),
        json("PATCH", { ...patch, version: note.version }),
    );
}

/**
 * One atomic layout write for several notes (a swap moves two). The server
 * applies every item or none, and answers in request order.
 */
export async function patchNoteLayouts(
    items: ReadonlyArray<{ id: string; layout: DocumentLayoutDto }>,
): Promise<Array<{ id: string; layout: DocumentLayoutDto }>> {
    const response = await api<DocumentLayoutsDto>(
        `${DOCUMENTS}/layouts`,
        json("PATCH", {
            items: items.map(({ id, layout }) => ({
                id,
                band: layout.band,
                col: layout.col,
                row: layout.row,
                size: layout.size,
            })),
        }),
    );
    return response.items;
}

export async function trashNote(
    note: Pick<DocumentDto, "id" | "version">,
): Promise<void> {
    await api(
        `${documentPath(note.id)}?version=${note.version}`,
        { method: "DELETE" },
    );
}

/** Restores a trashed document; null when it is no longer pinned to home. */
export async function restoreNote(id: string): Promise<HomeNoteItem | null> {
    await api(documentPath(id, "/restore"), { method: "POST" });
    return fetchHomeNote(id);
}
