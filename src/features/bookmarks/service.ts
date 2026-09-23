import { and, desc, eq } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { bookmarks } from "../../db/schema.ts";
import type { BookmarkDto } from "@shared/contracts.ts";
import { normalizeUrl } from "./url.ts";

export interface CreateBookmarkInput {
    title: string;
    url: string;
}

export interface UpdateBookmarkInput {
    title?: string;
    url?: string;
}

export class BookmarkConflictError extends Error {
    constructor(message = "该书签URL已存在") {
        super(message);
        this.name = "BookmarkConflictError";
    }
}

export class BookmarkNotFoundError extends Error {
    constructor(message = "书签不存在") {
        super(message);
        this.name = "BookmarkNotFoundError";
    }
}

export class BookmarksService {
    constructor(
        private readonly store: DatabaseStore,
        private readonly now: () => number = () => Date.now(),
    ) {}

    async list(userId: string): Promise<BookmarkDto[]> {
        return await this.store.run(async (db) => {
            const rows = await db
                .select({
                    id: bookmarks.id,
                    title: bookmarks.title,
                    url: bookmarks.url,
                    createdAt: bookmarks.createdAt,
                    updatedAt: bookmarks.updatedAt,
                })
                .from(bookmarks)
                .where(eq(bookmarks.userId, userId))
                .orderBy(desc(bookmarks.createdAt), desc(bookmarks.id))
                .all();

            return rows;
        });
    }

    async create(
        userId: string,
        input: CreateBookmarkInput,
    ): Promise<BookmarkDto> {
        const normalizedUrl = normalizeUrl(input.url);
        const title = input.title.trim();
        const currentTime = this.now();
        const id = crypto.randomUUID();

        return await this.store.run(async (db) => {
            // Check for existing duplicate (user_id, url)
            const existing = await db
                .select({ id: bookmarks.id })
                .from(bookmarks)
                .where(
                    and(
                        eq(bookmarks.userId, userId),
                        eq(bookmarks.url, normalizedUrl),
                    ),
                )
                .limit(1)
                .all();

            if (existing.length > 0) {
                throw new BookmarkConflictError();
            }

            try {
                await db.insert(bookmarks).values({
                    id,
                    userId,
                    title,
                    url: normalizedUrl,
                    createdAt: currentTime,
                    updatedAt: currentTime,
                }).run();
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message.includes("UNIQUE constraint failed")
                ) {
                    throw new BookmarkConflictError();
                }
                throw error;
            }

            return {
                id,
                title,
                url: normalizedUrl,
                createdAt: currentTime,
                updatedAt: currentTime,
            };
        });
    }

    async update(
        userId: string,
        bookmarkId: string,
        input: UpdateBookmarkInput,
    ): Promise<BookmarkDto> {
        const title = input.title !== undefined
            ? input.title.trim()
            : undefined;
        const normalizedUrl = input.url !== undefined
            ? normalizeUrl(input.url)
            : undefined;
        const currentTime = this.now();

        return await this.store.run(async (db) => {
            const existing = await db
                .select({
                    id: bookmarks.id,
                    title: bookmarks.title,
                    url: bookmarks.url,
                    createdAt: bookmarks.createdAt,
                    updatedAt: bookmarks.updatedAt,
                })
                .from(bookmarks)
                .where(
                    and(
                        eq(bookmarks.id, bookmarkId),
                        eq(bookmarks.userId, userId),
                    ),
                )
                .limit(1)
                .all();

            if (existing.length === 0) {
                throw new BookmarkNotFoundError();
            }

            const current = existing[0];
            const nextTitle = title ?? current.title;
            const nextUrl = normalizedUrl ?? current.url;

            // If url changed, check conflict
            if (nextUrl !== current.url) {
                const conflict = await db
                    .select({ id: bookmarks.id })
                    .from(bookmarks)
                    .where(
                        and(
                            eq(bookmarks.userId, userId),
                            eq(bookmarks.url, nextUrl),
                        ),
                    )
                    .limit(1)
                    .all();

                if (conflict.length > 0) {
                    throw new BookmarkConflictError();
                }
            }

            try {
                await db.update(bookmarks)
                    .set({
                        title: nextTitle,
                        url: nextUrl,
                        updatedAt: currentTime,
                    })
                    .where(
                        and(
                            eq(bookmarks.id, bookmarkId),
                            eq(bookmarks.userId, userId),
                        ),
                    )
                    .run();
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message.includes("UNIQUE constraint failed")
                ) {
                    throw new BookmarkConflictError();
                }
                throw error;
            }

            return {
                id: current.id,
                title: nextTitle,
                url: nextUrl,
                createdAt: current.createdAt,
                updatedAt: currentTime,
            };
        });
    }

    async delete(userId: string, bookmarkId: string): Promise<void> {
        return await this.store.run(async (db) => {
            const existing = await db
                .select({ id: bookmarks.id })
                .from(bookmarks)
                .where(
                    and(
                        eq(bookmarks.id, bookmarkId),
                        eq(bookmarks.userId, userId),
                    ),
                )
                .limit(1)
                .all();

            if (existing.length === 0) {
                throw new BookmarkNotFoundError();
            }

            await db.delete(bookmarks)
                .where(
                    and(
                        eq(bookmarks.id, bookmarkId),
                        eq(bookmarks.userId, userId),
                    ),
                )
                .run();
        });
    }
}
