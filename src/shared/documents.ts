export const DOCUMENT_TITLE_MAX_LENGTH = 200;
export const DOCUMENT_BODY_MAX_LENGTH = 1_000_000;
export const DOCUMENT_JSON_MAX_BYTES = 8 * 1024 * 1024;
export const DOCUMENT_ASSET_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_PAGE_DEFAULT_LIMIT = 50;
export const DOCUMENT_PAGE_MAX_LIMIT = 100;
export const DOCUMENT_SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
export const DOCUMENT_SNAPSHOT_RETENTION = 100;

export interface UpdateHomeOrderInput {
    ids: string[];
}
export interface HomeOrderDto {
    items: Array<{ id: string; homeSortOrder: number }>;
}
export interface DocumentUpdatedEvent {
    documentId: string;
    version: number;
    updatedAt: number;
}

export type DocumentScope =
    | {
        readonly type: "all" | "recent" | "favorite" | "home" | "uncategorized";
    }
    | { readonly type: "notebook"; readonly notebookId: string };
export interface DocumentSummaryDto {
    id: string;
    title: string | null;
    displayTitle: string;
    snippet: string;
    notebookId: string | null;
    notebookName?: string;
    isFavorite: boolean;
    isHomeFixed: boolean;
    homeSortOrder: number;
    createdAt: number;
    updatedAt: number;
}
export interface DocumentDto extends DocumentSummaryDto {
    body: string;
    version: number;
}
export type DocumentLastOpenedDto = { id: string } | null;
export interface PositionDocumentInput {
    notebookId: string | null;
    beforeId?: string;
    afterId?: string;
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
    isHomeFixed?: boolean;
    homeSortOrder?: number;
    isFavorite?: boolean;
}
export interface UpdateDocumentInput {
    version: number;
    title?: string | null;
    body?: string;
    isFavorite?: boolean;
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
