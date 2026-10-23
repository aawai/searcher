import {
    DOCUMENT_PAGE_MAX_LIMIT,
    type DocumentDto,
    type DocumentLayoutDto,
    type DocumentPageDto,
    type DocumentSummaryDto,
    type UpdateDocumentInput,
} from "@shared/documents.ts";
import { api, ApiError, json } from "../../lib/api.ts";
import { defaultPaperLayout, type PaperItem } from "./home-papers.ts";

const DOCUMENTS = "/api/documents";
const DESKTOP = "desktop";

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
export async function fetchPaper(id: string): Promise<PaperItem | null> {
    try {
        const document = await api<DocumentDto>(documentPath(id));
        if (!document.isHomeFixed) return null;
        const layout = await api<DocumentLayoutDto | null>(
            `${documentPath(id, "/layout")}?deviceClass=${DESKTOP}`,
        );
        return { ...document, layout: layout ?? defaultPaperLayout() };
    } catch (cause) {
        if (cause instanceof ApiError && cause.code === 404) return null;
        throw cause;
    }
}

export async function fetchHomePapers(): Promise<PaperItem[]> {
    const summaries = await fetchHomeSummaries();
    const papers = await Promise.all(
        summaries.map((summary) => fetchPaper(summary.id)),
    );
    return papers.filter((paper): paper is PaperItem => paper !== null);
}

export function patchPaper(
    paper: Pick<DocumentDto, "id" | "version">,
    patch: Omit<UpdateDocumentInput, "version">,
): Promise<DocumentDto> {
    return api<DocumentDto>(
        documentPath(paper.id),
        json("PATCH", { ...patch, version: paper.version }),
    );
}

export function patchPaperLayout(
    id: string,
    layout: DocumentLayoutDto,
): Promise<DocumentLayoutDto> {
    return api<DocumentLayoutDto>(
        documentPath(id, "/layout"),
        json("PATCH", {
            deviceClass: DESKTOP,
            x: layout.x,
            y: layout.y,
            width: layout.width,
            zIndex: layout.zIndex,
            expanded: layout.expanded,
            sortOrder: layout.sortOrder,
        }),
    );
}

export async function trashPaper(
    paper: Pick<DocumentDto, "id" | "version">,
): Promise<void> {
    await api(
        `${documentPath(paper.id)}?version=${paper.version}`,
        { method: "DELETE" },
    );
}

/** Restores a trashed document; null when it is no longer pinned to home. */
export async function restorePaper(id: string): Promise<PaperItem | null> {
    await api(documentPath(id, "/restore"), { method: "POST" });
    return fetchPaper(id);
}
