export const DOCUMENT_TITLE_MAX_LENGTH = 200;
export const DOCUMENT_BODY_MAX_LENGTH = 1_000_000;
export const DOCUMENT_JSON_MAX_BYTES = 8 * 1024 * 1024;
export const DOCUMENT_ASSET_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_PAGE_DEFAULT_LIMIT = 50;
export const DOCUMENT_PAGE_MAX_LIMIT = 100;
export const DOCUMENT_SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
export const DOCUMENT_SNAPSHOT_RETENTION = 100;

export type DocumentColor = "paper" | "amber" | "rose" | "sage" | "sky";

/** Home note tiers: S is one cell, W spans two cells in one band. */
export type DocumentNoteSize = "s" | "w";
export const HOME_NOTE_SPANS: Record<
    DocumentNoteSize,
    { readonly cols: number; readonly rows: number }
> = {
    s: { cols: 1, rows: 1 },
    w: { cols: 2, rows: 1 },
};
// The server cannot know the viewport, so it only rejects absurd cells; the
// client resolves the real lattice and conflicts before writing.
export const HOME_NOTE_GRID_MAX_COL = 63;
export const HOME_NOTE_GRID_MAX_ROW = 31;

/** Half-open cell overlap; touching edges are not a conflict. */
export function homeNoteCellsOverlap(
    a: { col: number; row: number; size: DocumentNoteSize },
    b: { col: number; row: number; size: DocumentNoteSize },
): boolean {
    const first = HOME_NOTE_SPANS[a.size];
    const second = HOME_NOTE_SPANS[b.size];
    return a.col < b.col + second.cols && a.col + first.cols > b.col &&
        a.row < b.row + second.rows && a.row + first.rows > b.row;
}

export interface DocumentLayoutDto {
    col: number | null;
    row: number | null;
    size: DocumentNoteSize;
    updatedAt: number;
}
export type UpdateDocumentLayoutInput = Partial<
    Omit<DocumentLayoutDto, "updatedAt">
>;
export interface DocumentUpdatedEvent {
    documentId: string;
    version: number;
    updatedAt: number;
}

export type DocumentScope =
    | { readonly type: "all" | "recent" | "favorite" | "home" }
    | { readonly type: "notebook"; readonly notebookId: string };
export interface DocumentSummaryDto {
    id: string;
    title: string | null;
    displayTitle: string;
    snippet: string;
    notebookId: string | null;
    notebookName?: string;
    isFavorite: boolean;
    color: DocumentColor;
    isHomeFixed: boolean;
    homeSortOrder: number;
    createdAt: number;
    updatedAt: number;
}
export interface DocumentDto extends DocumentSummaryDto {
    body: string;
    version: number;
}
export interface DocumentPageDto {
    items: DocumentSummaryDto[];
    nextCursor: string | null;
}
export interface DocumentListInput {
    scope?: DocumentScope;
    limit?: number;
    cursor?: string;
}
export interface CreateDocumentInput {
    title?: string | null;
    body?: string;
    notebookId?: string | null;
    color?: DocumentColor;
    isHomeFixed?: boolean;
    homeSortOrder?: number;
    isFavorite?: boolean;
}
export interface UpdateDocumentInput {
    version: number;
    title?: string | null;
    body?: string;
    notebookId?: string | null;
    isFavorite?: boolean;
    color?: DocumentColor;
    isHomeFixed?: boolean;
    homeSortOrder?: number;
    origin?: "autosave" | "manual" | "conflict_resolution" | "restore";
}
export type DocumentVersionReason =
    | "snapshot"
    | "manual"
    | "conflict_resolution"
    | "restore"
    | "system";
export interface DocumentVersionDto {
    id: string;
    documentId: string;
    version: number;
    title: string | null;
    body: string;
    reason: DocumentVersionReason;
    createdAt: number;
}
export interface DocumentNotebookDto {
    id: string;
    parentId: string | null;
    name: string;
    sortOrder: number;
    createdAt: number;
    updatedAt: number;
}
export interface DocumentSettingsDto {
    paperSize: "a4" | "letter";
    orientation: "portrait" | "landscape";
    marginTopMm: number;
    marginRightMm: number;
    marginBottomMm: number;
    marginLeftMm: number;
    updatedAt: number;
}
export type UpdateDocumentSettingsInput = Omit<
    DocumentSettingsDto,
    "updatedAt"
>;
export interface DocumentAssetDto {
    assetId: string;
    documentId: string;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
    byteSize: number;
    sha256: string;
    originalName: string;
    createdAt: number;
}
