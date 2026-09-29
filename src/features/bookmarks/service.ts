import { and, desc, eq, isNull, max } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { webappGroups, webapps } from "../../db/schema.ts";

export type WebAppIconSource = "website" | "upload" | "url" | "ai" | "default";
export type WebAppOpenMode = "global" | "current" | "new_tab";

export interface WebAppDto {
    id: string;
    userId: string;
    name: string;
    url: string;
    groupId: string | null;
    iconAssetId: string | null;
    iconSource: WebAppIconSource;
    isPinned: boolean;
    sortOrder: number;
    pinnedSortOrder: number;
    openMode: WebAppOpenMode;
    deletedAt?: number | null;
    createdAt: number;
    updatedAt: number;
}

export type WebAppFolderSize = "small" | "large";

export interface WebAppGroupDto {
    id: string;
    userId: string;
    name: string;
    sortOrder: number;
    folderSize: WebAppFolderSize;
    createdAt: number;
    updatedAt: number;
}

export interface CreateWebAppInput {
    name: string;
    url: string;
    groupId?: string | null;
    iconAssetId?: string | null;
    iconSource?: WebAppIconSource;
    isPinned?: boolean;
    sortOrder?: number;
    pinnedSortOrder?: number;
    openMode?: WebAppOpenMode;
}

export interface UpdateWebAppInput {
    name?: string;
    url?: string;
    groupId?: string | null;
    iconAssetId?: string | null;
    iconSource?: WebAppIconSource;
    isPinned?: boolean;
    sortOrder?: number;
    pinnedSortOrder?: number;
    openMode?: WebAppOpenMode;
}

export class WebAppNotFoundError extends Error {
    constructor(message = "Web App不存在") {
        super(message);
        this.name = "WebAppNotFoundError";
    }
}

export class WebAppGroupNotFoundError extends Error {
    constructor(message = "Web App 文件夹不存在") {
        super(message);
        this.name = "WebAppGroupNotFoundError";
    }
}

export function normalizeWebAppUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim();
    const candidate = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;

    let parsed: URL;
    try {
        parsed = new URL(candidate);
    } catch {
        throw new Error("无效的URL格式");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("仅支持HTTP或HTTPS协议");
    }

    if (
        (parsed.protocol === "http:" && parsed.port === "80") ||
        (parsed.protocol === "https:" && parsed.port === "443")
    ) {
        parsed.port = "";
    }

    if (parsed.pathname === "") {
        parsed.pathname = "/";
    }

    return parsed.toString();
}

export class BookmarksService {
    constructor(
        private readonly store: DatabaseStore,
        private readonly now: () => number = () => Date.now(),
    ) {}

    private toWebAppDto(row: typeof webapps.$inferSelect): WebAppDto {
        return {
            id: row.id,
            userId: row.userId,
            name: row.name,
            url: row.url,
            groupId: row.groupId,
            iconAssetId: row.iconAssetId,
            iconSource: row.iconSource as WebAppIconSource,
            isPinned: Boolean(row.isPinned),
            sortOrder: row.sortOrder,
            pinnedSortOrder: row.pinnedSortOrder,
            openMode: row.openMode as WebAppOpenMode,
            deletedAt: row.deletedAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }

    async listWebApps(
        userId: string,
        options: {
            includeDeleted?: boolean;
            pinnedOnly?: boolean;
            groupId?: string | null;
        } = {},
    ): Promise<WebAppDto[]> {
        return await this.store.run(async (db) => {
            const conditions = [eq(webapps.userId, userId)];
            if (!options.includeDeleted) {
                conditions.push(isNull(webapps.deletedAt));
            }
            if (options.pinnedOnly) {
                conditions.push(eq(webapps.isPinned, true));
            }
            if (options.groupId !== undefined) {
                if (options.groupId === null) {
                    conditions.push(isNull(webapps.groupId));
                } else {
                    conditions.push(eq(webapps.groupId, options.groupId));
                }
            }

            const rows = await db
                .select()
                .from(webapps)
                .where(and(...conditions))
                .orderBy(
                    desc(webapps.isPinned),
                    desc(webapps.pinnedSortOrder),
                    desc(webapps.sortOrder),
                    desc(webapps.createdAt),
                )
                .all();

            return rows.map((r) => this.toWebAppDto(r));
        });
    }

    async getWebAppById(userId: string, id: string): Promise<WebAppDto> {
        return await this.store.run(async (db) => {
            const rows = await db
                .select()
                .from(webapps)
                .where(
                    and(
                        eq(webapps.id, id),
                        eq(webapps.userId, userId),
                        isNull(webapps.deletedAt),
                    ),
                )
                .limit(1)
                .all();

            if (rows.length === 0) {
                throw new WebAppNotFoundError();
            }

            return this.toWebAppDto(rows[0]);
        });
    }

    async createWebApp(
        userId: string,
        input: CreateWebAppInput,
    ): Promise<WebAppDto> {
        const normalizedUrl = normalizeWebAppUrl(input.url);
        const name = input.name.trim();
        const currentTime = this.now();
        const id = crypto.randomUUID();

        return await this.store.run(async (db) => {
            const row = {
                id,
                userId,
                name,
                url: normalizedUrl,
                groupId: input.groupId ?? null,
                iconAssetId: input.iconAssetId ?? null,
                iconSource: input.iconSource ?? "website",
                isPinned: input.isPinned ?? false,
                sortOrder: input.sortOrder ?? 0,
                pinnedSortOrder: input.pinnedSortOrder ?? 0,
                openMode: input.openMode ?? "global",
                deletedAt: null,
                createdAt: currentTime,
                updatedAt: currentTime,
            };

            await db.insert(webapps).values(row).run();

            return this.toWebAppDto(row);
        });
    }

    async updateWebApp(
        userId: string,
        id: string,
        input: UpdateWebAppInput,
    ): Promise<WebAppDto> {
        const currentTime = this.now();

        return await this.store.run(async (db) => {
            const existing = await db
                .select()
                .from(webapps)
                .where(
                    and(
                        eq(webapps.id, id),
                        eq(webapps.userId, userId),
                        isNull(webapps.deletedAt),
                    ),
                )
                .limit(1)
                .all();

            if (existing.length === 0) {
                throw new WebAppNotFoundError();
            }

            const current = existing[0];
            const nextName = input.name !== undefined
                ? input.name.trim()
                : current.name;
            const nextUrl = input.url !== undefined
                ? normalizeWebAppUrl(input.url)
                : current.url;
            const nextGroupId = input.groupId !== undefined
                ? input.groupId
                : current.groupId;
            const nextIconAssetId = input.iconAssetId !== undefined
                ? input.iconAssetId
                : current.iconAssetId;
            const nextIconSource = input.iconSource !== undefined
                ? input.iconSource
                : current.iconSource;
            const nextIsPinned = input.isPinned !== undefined
                ? input.isPinned
                : current.isPinned;
            let nextSortOrder = input.sortOrder !== undefined
                ? input.sortOrder
                : current.sortOrder;
            if (
                input.sortOrder === undefined &&
                current.groupId !== null &&
                input.groupId !== undefined &&
                nextGroupId !== current.groupId
            ) {
                const maxRow = await db
                    .select({ maxOrder: max(webapps.sortOrder) })
                    .from(webapps)
                    .where(
                        and(
                            eq(webapps.userId, userId),
                            isNull(webapps.deletedAt),
                        ),
                    )
                    .all();
                nextSortOrder = (maxRow[0]?.maxOrder ?? -1) + 1;
            }
            const nextPinnedSortOrder = input.pinnedSortOrder !== undefined
                ? input.pinnedSortOrder
                : current.pinnedSortOrder;
            const nextOpenMode = input.openMode !== undefined
                ? input.openMode
                : current.openMode;

            await db.update(webapps)
                .set({
                    name: nextName,
                    url: nextUrl,
                    groupId: nextGroupId,
                    iconAssetId: nextIconAssetId,
                    iconSource: nextIconSource,
                    isPinned: nextIsPinned,
                    sortOrder: nextSortOrder,
                    pinnedSortOrder: nextPinnedSortOrder,
                    openMode: nextOpenMode,
                    updatedAt: currentTime,
                })
                .where(and(eq(webapps.id, id), eq(webapps.userId, userId)))
                .run();

            return this.toWebAppDto({
                ...current,
                name: nextName,
                url: nextUrl,
                groupId: nextGroupId,
                iconAssetId: nextIconAssetId,
                iconSource: nextIconSource,
                isPinned: nextIsPinned,
                sortOrder: nextSortOrder,
                pinnedSortOrder: nextPinnedSortOrder,
                openMode: nextOpenMode,
                updatedAt: currentTime,
            });
        });
    }

    async softDeleteWebApp(userId: string, id: string): Promise<void> {
        return await this.store.run(async (db) => {
            const existing = await db
                .select({ id: webapps.id })
                .from(webapps)
                .where(
                    and(
                        eq(webapps.id, id),
                        eq(webapps.userId, userId),
                        isNull(webapps.deletedAt),
                    ),
                )
                .limit(1)
                .all();

            if (existing.length === 0) throw new WebAppNotFoundError();

            const currentTime = this.now();
            await db
                .update(webapps)
                .set({ deletedAt: currentTime })
                .where(and(eq(webapps.id, id), eq(webapps.userId, userId)))
                .run();
        });
    }

    async restoreWebApp(userId: string, id: string): Promise<WebAppDto> {
        return await this.store.run(async (db) => {
            const existing = await db
                .select()
                .from(webapps)
                .where(and(eq(webapps.id, id), eq(webapps.userId, userId)))
                .limit(1)
                .all();

            if (existing.length === 0) throw new WebAppNotFoundError();

            await db
                .update(webapps)
                .set({ deletedAt: null })
                .where(and(eq(webapps.id, id), eq(webapps.userId, userId)))
                .run();

            return this.toWebAppDto({ ...existing[0], deletedAt: null });
        });
    }

    async permanentDeleteWebApp(userId: string, id: string): Promise<void> {
        return await this.store.run(async (db) => {
            const existing = await db
                .select({ id: webapps.id })
                .from(webapps)
                .where(and(eq(webapps.id, id), eq(webapps.userId, userId)))
                .limit(1)
                .all();

            if (existing.length === 0) throw new WebAppNotFoundError();

            await db
                .delete(webapps)
                .where(and(eq(webapps.id, id), eq(webapps.userId, userId)))
                .run();
        });
    }

    async listTrashWebApps(userId: string): Promise<WebAppDto[]> {
        return await this.listWebApps(userId, { includeDeleted: true }).then((
            list,
        ) => list.filter((w) => w.deletedAt !== null));
    }

    async reorderWebApps(
        userId: string,
        items: Array<
            { id: string; sortOrder?: number; pinnedSortOrder?: number }
        >,
    ): Promise<void> {
        return await this.store.run(async (db) => {
            const currentTime = this.now();
            for (const item of items) {
                const updateFields: {
                    sortOrder?: number;
                    pinnedSortOrder?: number;
                    updatedAt: number;
                } = {
                    updatedAt: currentTime,
                };
                if (item.sortOrder !== undefined) {
                    updateFields.sortOrder = item.sortOrder;
                }
                if (item.pinnedSortOrder !== undefined) {
                    updateFields.pinnedSortOrder = item.pinnedSortOrder;
                }

                await db
                    .update(webapps)
                    .set(updateFields)
                    .where(
                        and(
                            eq(webapps.id, item.id),
                            eq(webapps.userId, userId),
                        ),
                    )
                    .run();
            }
        });
    }

    // --- WebApp Groups ---

    async listGroups(userId: string): Promise<WebAppGroupDto[]> {
        return await this.store.run(async (db) => {
            const rows = await db
                .select()
                .from(webappGroups)
                .where(eq(webappGroups.userId, userId))
                .orderBy(
                    desc(webappGroups.sortOrder),
                    desc(webappGroups.createdAt),
                )
                .all();

            return rows;
        });
    }

    async createGroup(
        userId: string,
        name: string,
        sortOrder = 0,
        folderSize: WebAppFolderSize = "small",
    ): Promise<WebAppGroupDto> {
        const id = crypto.randomUUID();
        const currentTime = this.now();

        return await this.store.run(async (db) => {
            const row = {
                id,
                userId,
                name: name.trim(),
                sortOrder,
                folderSize,
                createdAt: currentTime,
                updatedAt: currentTime,
            };

            await db.insert(webappGroups).values(row).run();

            return row;
        });
    }

    async updateGroup(
        userId: string,
        id: string,
        name?: string,
        sortOrder?: number,
        folderSize?: WebAppFolderSize,
    ): Promise<WebAppGroupDto> {
        const currentTime = this.now();

        return await this.store.run(async (db) => {
            const existing = await db
                .select()
                .from(webappGroups)
                .where(
                    and(
                        eq(webappGroups.id, id),
                        eq(webappGroups.userId, userId),
                    ),
                )
                .limit(1)
                .all();

            if (existing.length === 0) throw new WebAppGroupNotFoundError();

            const nextName = name !== undefined
                ? name.trim()
                : existing[0].name;
            const nextSortOrder = sortOrder !== undefined
                ? sortOrder
                : existing[0].sortOrder;
            const nextFolderSize = folderSize !== undefined
                ? folderSize
                : existing[0].folderSize;

            await db
                .update(webappGroups)
                .set({
                    name: nextName,
                    sortOrder: nextSortOrder,
                    folderSize: nextFolderSize,
                    updatedAt: currentTime,
                })
                .where(
                    and(
                        eq(webappGroups.id, id),
                        eq(webappGroups.userId, userId),
                    ),
                )
                .run();

            return {
                ...existing[0],
                name: nextName,
                sortOrder: nextSortOrder,
                folderSize: nextFolderSize,
                updatedAt: currentTime,
            };
        });
    }

    async deleteGroup(userId: string, id: string): Promise<void> {
        return await this.store.run(async (db) => {
            const existing = await db
                .select({ id: webappGroups.id })
                .from(webappGroups)
                .where(
                    and(
                        eq(webappGroups.id, id),
                        eq(webappGroups.userId, userId),
                    ),
                )
                .limit(1)
                .all();

            if (existing.length === 0) throw new WebAppGroupNotFoundError();

            // WebApps in this group migrate to ungrouped (groupId = null) and appended to end
            const maxRow = await db
                .select({ maxOrder: max(webapps.sortOrder) })
                .from(webapps)
                .where(
                    and(
                        eq(webapps.userId, userId),
                        isNull(webapps.deletedAt),
                    ),
                )
                .all();
            let baseSortOrder = (maxRow[0]?.maxOrder ?? -1) + 1;

            const groupApps = await db
                .select({ id: webapps.id })
                .from(webapps)
                .where(
                    and(
                        eq(webapps.groupId, id),
                        eq(webapps.userId, userId),
                        isNull(webapps.deletedAt),
                    ),
                )
                .orderBy(webapps.sortOrder, webapps.createdAt)
                .all();

            for (const app of groupApps) {
                await db
                    .update(webapps)
                    .set({ groupId: null, sortOrder: baseSortOrder++ })
                    .where(
                        and(eq(webapps.id, app.id), eq(webapps.userId, userId)),
                    )
                    .run();
            }
            await db
                .delete(webappGroups)
                .where(
                    and(
                        eq(webappGroups.id, id),
                        eq(webappGroups.userId, userId),
                    ),
                )
                .run();
        });
    }
}
