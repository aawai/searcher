import type { DocumentSummaryDto } from "./documents.ts";

export const PERSONAL_SEARCH_QUERY_MAX_LENGTH = 200;
export const PERSONAL_SEARCH_DEFAULT_LIMIT = 5;
export const PERSONAL_SEARCH_MAX_LIMIT = 20;

export type PersonalSearchAppIconSource =
    | "website"
    | "upload"
    | "url"
    | "ai"
    | "default";

export interface PersonalSearchAppDto {
    id: string;
    name: string;
    url: string;
    groupId: string | null;
    iconAssetId: string | null;
    iconSource: PersonalSearchAppIconSource;
    openMode: "global" | "current" | "new_tab";
}

/**
 * Result of GET /api/search/personal. Each group holds at most `limit` hits in a fixed order:
 * documents by relevance (>= 3 characters) or title hit then recency (shorter terms), apps by
 * name prefix, name substring, URL, then home order.
 */
export interface PersonalSearchDto {
    query: string;
    documents: DocumentSummaryDto[];
    apps: PersonalSearchAppDto[];
}
