import type { PersonalSearchDto } from "@shared/personal-search.ts";
import type { BookmarksService } from "../bookmarks/service.ts";
import type { DocumentsService } from "../documents/service.ts";

/**
 * Searches everything the user owns for the unified search box. Each source runs in its own
 * DatabaseStore.run call, one after the other: store.run holds the queue, so they must not nest.
 */
export class PersonalSearchService {
    constructor(
        private readonly documents: DocumentsService,
        private readonly apps: BookmarksService,
    ) {}

    async search(
        userId: string,
        query: string,
        limit: number,
    ): Promise<PersonalSearchDto> {
        const trimmed = query.trim();
        if (trimmed.length === 0) {
            return { query: trimmed, documents: [], apps: [] };
        }
        const documents = await this.documents.search(userId, trimmed, {
            limit,
        });
        const apps = await this.apps.searchWebApps(userId, trimmed, limit);
        return {
            query: trimmed,
            documents: documents.items,
            apps: apps.map((app) => ({
                id: app.id,
                name: app.name,
                url: app.url,
                groupId: app.groupId,
                iconAssetId: app.iconAssetId,
                iconSource: app.iconSource,
                openMode: app.openMode,
            })),
        };
    }
}
