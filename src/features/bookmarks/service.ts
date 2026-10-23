import { and, asc, desc, eq, isNull, max, sql } from "drizzle-orm";
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
    sortOrder: number;
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
    sortOrder?: number;
    openMode?: WebAppOpenMode;
}

export interface UpdateWebAppInput {
    name?: string;
    url?: string;
    groupId?: string | null;
    iconAssetId?: string | null;
    iconSource?: WebAppIconSource;
    sortOrder?: number;
    openMode?: WebAppOpenMode;
}

export class WebAppNotFoundError extends Error {
    constructor(message = "应用不存在") {
        super(message);
        this.name = "WebAppNotFoundError";
    }
}

export class WebAppGroupNotFoundError extends Error {
    constructor(message = "应用文件夹不存在") {
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
            sortOrder: row.sortOrder,
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
            groupId?: string | null;
        } = {},
    ): Promise<WebAppDto[]> {
        return await this.store.run(async (db) => {
            const conditions = [eq(webapps.userId, userId)];
            if (!options.includeDeleted) {
                conditions.push(isNull(webapps.deletedAt));
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
                    desc(webapps.sortOrder),
                    desc(webapps.createdAt),
                )
                .all();

            return rows.map((r) => this.toWebAppDto(r));
        });
    }

    /**
     * Live apps whose name or URL contains every whitespace-separated term (case-insensitive,
     * literal substrings, no wildcard syntax). Ranked: name starts with the whole query, then name
     * contains every term, then URL-only matches; ties keep home order (sort_order, created_at, id).
     */
    async searchWebApps(
        userId: string,
        query: string,
        limit: number,
    ): Promise<WebAppDto[]> {
        const terms = query.split(/\s+/).filter((term) => term.length > 0);
        if (terms.length === 0) return [];
        const nameHas = (term: string) =>
            sql`instr(lower(${webapps.name}), lower(${term})) > 0`;
        const urlHas = (term: string) =>
            sql`instr(lower(${webapps.url}), lower(${term})) > 0`;
        const whole = terms.join(" ");
        return await this.store.run(async (db) => {
            const rows = await db
                .select()
                .from(webapps)
                .where(and(
                    eq(webapps.userId, userId),
                    isNull(webapps.deletedAt),
                    ...terms.map((term) =>
                        sql`(${nameHas(term)} OR ${urlHas(term)})`
                    ),
                ))
                .orderBy(
                    sql`CASE
                        WHEN instr(lower(${webapps.name}), lower(${whole})) = 1 THEN 0
                        WHEN ${sql.join(terms.map(nameHas), sql` AND `)} THEN 1
                        ELSE 2
                    END`,
                    asc(webapps.sortOrder),
                    asc(webapps.createdAt),
                    asc(webapps.id),
                )
                .limit(limit)
                .all();
            return rows.map((row) => this.toWebAppDto(row));
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
                sortOrder: input.sortOrder ?? 0,
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
                    sortOrder: nextSortOrder,
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
                sortOrder: nextSortOrder,
                openMode: nextOpenMode,
                updatedAt: currentTime,
            });
        });
    }

    async applyFetchedIcon(
        userId: string,
        snapshot: WebAppDto,
        iconAssetId: string,
    ): Promise<WebAppDto> {
        return await this.store.run(async (db) => {
            const rows = await db.select().from(webapps).where(and(
                eq(webapps.id, snapshot.id),
                eq(webapps.userId, userId),
                isNull(webapps.deletedAt),
            )).limit(1).all();
            const current = rows[0];
            if (!current) throw new WebAppNotFoundError();
            // Compare the icon and URL after the external request, within the queue.
            if (
                current.url !== snapshot.url ||
                current.iconAssetId !== snapshot.iconAssetId ||
                current.iconSource !== snapshot.iconSource
            ) return this.toWebAppDto(current);
            const updatedAt = this.now();
            await db.update(webapps).set({
                iconAssetId,
                iconSource: "website",
                updatedAt,
            }).where(and(
                eq(webapps.id, snapshot.id),
                eq(webapps.userId, userId),
            )).run();
            return this.toWebAppDto({
                ...current,
                iconAssetId,
                iconSource: "website",
                updatedAt,
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
            { id: string; sortOrder?: number }
        >,
        groups: Array<{ id: string; sortOrder: number }> = [],
    ): Promise<void> {
        await this.store.run((db) =>
            db.transaction(async (tx) => {
                const currentTime = this.now();
                for (const item of items) {
                    const updateFields: {
                        sortOrder?: number;
                        updatedAt: number;
                    } = { updatedAt: currentTime };
                    if (item.sortOrder !== undefined) {
                        updateFields.sortOrder = item.sortOrder;
                    }
                    const updated = await tx.update(webapps).set(updateFields)
                        .where(and(
                            eq(webapps.id, item.id),
                            eq(webapps.userId, userId),
                            isNull(webapps.deletedAt),
                        )).returning({ id: webapps.id }).all();
                    if (updated.length === 0) throw new WebAppNotFoundError();
                }
                for (const group of groups) {
                    const updated = await tx.update(webappGroups).set({
                        sortOrder: group.sortOrder,
                        updatedAt: currentTime,
                    }).where(and(
                        eq(webappGroups.id, group.id),
                        eq(webappGroups.userId, userId),
                    )).returning({ id: webappGroups.id }).all();
                    if (updated.length === 0) {
                        throw new WebAppGroupNotFoundError();
                    }
                }
            })
        );
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
