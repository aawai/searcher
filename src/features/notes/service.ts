import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { noteLayouts, notes, noteVersions } from "../../db/schema.ts";
import type { NoteColor } from "@shared/contracts.ts";

export interface NoteLayoutDto {
    deviceClass: "desktop" | "tablet" | "mobile";
    x?: number | null;
    y?: number | null;
    width?: number | null;
    zIndex: number;
    expanded: boolean;
    sortOrder?: number | null;
    updatedAt: number;
}

export interface NoteVersionDto {
    id: string;
    noteId: string;
    version: number;
    title: string | null;
    body: string;
    reason:
        | "snapshot"
        | "manual"
        | "conflict_resolution"
        | "restore"
        | "system";
    createdAt: number;
}

export interface NoteDto {
    id: string;
    title: string | null;
    body: string;
    content: string; // compatibility alias with body
    version: number;
    color: NoteColor;
    isPinned: boolean;
    pinned: boolean; // compatibility alias with isPinned
    isHomeFixed: boolean;
    sortOrder: number;
    deletedAt?: number | null;
    createdAt: number;
    updatedAt: number;
    layout?: NoteLayoutDto | null;
}

export interface CreateNoteInput {
    title?: string | null;
    body?: string;
    content?: string;
    color?: NoteColor;
    isPinned?: boolean;
    pinned?: boolean;
    isHomeFixed?: boolean;
    sortOrder?: number;
    layout?: Partial<NoteLayoutDto>;
}

export interface UpdateNoteInput {
    title?: string | null;
    body?: string;
    content?: string;
    color?: NoteColor;
    isPinned?: boolean;
    pinned?: boolean;
    isHomeFixed?: boolean;
    sortOrder?: number;
    version: number;
    layout?: Partial<NoteLayoutDto>;
    /** 保存来源：默认 autosave；manual/conflict_resolution/restore 强制写快照 */
    origin?: "autosave" | "manual" | "conflict_resolution" | "restore";
}

export interface SearchNotesResultDto {
    id: string;
    title: string | null;
    snippet: string;
    updatedAt: number;
}
export class NoteConflictError extends Error {
    constructor(
        public readonly currentNote: NoteDto,
        message = "便签版本冲突",
    ) {
        super(message);
        this.name = "NoteConflictError";
    }
}

export class NoteNotFoundError extends Error {
    constructor(message = "便签不存在") {
        super(message);
        this.name = "NoteNotFoundError";
    }
}

export interface NoteUpdatedEvent {
    noteId: string;
    version: number;
    updatedAt: number;
}

type NoteUpdatedListener = (event: NoteUpdatedEvent) => void;

/** Y-003 轻量实时总线：单进程同源部署内广播 note.updated。 */
export const noteEvents = {
    listeners: new Map<string, Set<NoteUpdatedListener>>(),
    on(userId: string, listener: NoteUpdatedListener): () => void {
        let set = this.listeners.get(userId);
        if (!set) {
            set = new Set();
            this.listeners.set(userId, set);
        }
        set.add(listener);
        return () => {
            set.delete(listener);
        };
    },
    emit(userId: string, event: NoteUpdatedEvent): void {
        this.listeners.get(userId)?.forEach((listener) => {
            try {
                listener(event);
            } catch {
                // 订阅者异常不影响保存主流程
            }
        });
    },
};

export class NotesService {
    constructor(
        private readonly store: DatabaseStore,
        private readonly now: () => number = () => Date.now(),
    ) {}

    private toDto(
        row: typeof notes.$inferSelect,
        layoutRow?: typeof noteLayouts.$inferSelect | null,
    ): NoteDto {
        return {
            id: row.id,
            title: row.title,
            body: row.currentBody,
            content: row.currentBody,
            version: row.currentVersion,
            color: row.color as NoteColor,
            isPinned: Boolean(row.isPinned),
            pinned: Boolean(row.isPinned),
            isHomeFixed: Boolean(row.isHomeFixed),
            sortOrder: row.sortOrder,
            deletedAt: row.deletedAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            layout: layoutRow
                ? {
                    deviceClass: layoutRow.deviceClass as
                        | "desktop"
                        | "tablet"
                        | "mobile",
                    x: layoutRow.x,
                    y: layoutRow.y,
                    width: layoutRow.width,
                    zIndex: layoutRow.zIndex,
                    expanded: Boolean(layoutRow.expanded),
                    sortOrder: layoutRow.sortOrder,
                    updatedAt: layoutRow.updatedAt,
                }
                : null,
        };
    }

    async list(
        userId: string,
        options: {
            includeDeleted?: boolean;
            homeFixedOnly?: boolean;
            pinnedOnly?: boolean;
        } = {},
    ): Promise<NoteDto[]> {
        return await this.store.run(async (db) => {
            const conditions = [eq(notes.userId, userId)];
            if (!options.includeDeleted) {
                conditions.push(isNull(notes.deletedAt));
            }
            if (options.homeFixedOnly) {
                conditions.push(eq(notes.isHomeFixed, true));
            }
            if (options.pinnedOnly) {
                conditions.push(eq(notes.isPinned, true));
            }

            const rows = await db
                .select()
                .from(notes)
                .where(and(...conditions))
                .orderBy(
                    desc(notes.isPinned),
                    desc(notes.isHomeFixed),
                    desc(notes.sortOrder),
                    desc(notes.updatedAt),
                    desc(notes.id),
                )
                .all();

            if (rows.length === 0) return [];

            // Get layouts for these notes
            const layoutRows = await db
                .select()
                .from(noteLayouts)
                .where(eq(noteLayouts.userId, userId))
                .all();

            const layoutMap = new Map(layoutRows.map((l) => [l.noteId, l]));

            return rows.map((r) => this.toDto(r, layoutMap.get(r.id)));
        });
    }

    async getById(userId: string, noteId: string): Promise<NoteDto> {
        return await this.store.run(async (db) => {
            const rows = await db
                .select()
                .from(notes)
                .where(
                    and(
                        eq(notes.id, noteId),
                        eq(notes.userId, userId),
                        isNull(notes.deletedAt),
                    ),
                )
                .limit(1)
                .all();

            if (rows.length === 0) {
                throw new NoteNotFoundError();
            }

            const layoutRows = await db
                .select()
                .from(noteLayouts)
                .where(
                    and(
                        eq(noteLayouts.noteId, noteId),
                        eq(noteLayouts.userId, userId),
                    ),
                )
                .limit(1)
                .all();

            return this.toDto(rows[0], layoutRows[0] ?? null);
        });
    }

    async create(userId: string, input: CreateNoteInput): Promise<NoteDto> {
        const id = crypto.randomUUID();
        const title = input.title !== undefined ? input.title : null;
        const body = input.body !== undefined
            ? input.body
            : (input.content ?? "");
        const isPinned = input.isPinned ?? input.pinned ?? false;
        const isHomeFixed = input.isHomeFixed ?? false;
        const color = input.color ?? "paper";
        const sortOrder = input.sortOrder ?? 0;
        const currentTime = this.now();
        const currentVersion = 1;

        return await this.store.run(async (db) => {
            const noteRow = {
                id,
                userId,
                title,
                currentBody: body,
                content: body,
                currentVersion,
                color,
                isPinned,
                isHomeFixed,
                sortOrder,
                deletedAt: null,
                createdAt: currentTime,
                updatedAt: currentTime,
            };

            await db.insert(notes).values(noteRow).run();

            // Save initial version snapshot
            await db.insert(noteVersions).values({
                id: crypto.randomUUID(),
                noteId: id,
                userId,
                version: currentVersion,
                title,
                body,
                reason: "snapshot",
                createdAt: currentTime,
            }).run();

            // Optional layout
            let savedLayout: typeof noteLayouts.$inferSelect | null = null;
            if (input.layout) {
                savedLayout = {
                    id: crypto.randomUUID(),
                    noteId: id,
                    userId,
                    deviceClass: input.layout.deviceClass ?? "desktop",
                    x: input.layout.x ?? null,
                    y: input.layout.y ?? null,
                    width: input.layout.width ?? null,
                    zIndex: input.layout.zIndex ?? 0,
                    expanded: input.layout.expanded ?? false,
                    sortOrder: input.layout.sortOrder ?? null,
                    updatedAt: currentTime,
                };
                await db.insert(noteLayouts).values(savedLayout).run();
            }

            return this.toDto(noteRow, savedLayout);
        });
    }

    async update(
        userId: string,
        noteId: string,
        input: UpdateNoteInput,
    ): Promise<NoteDto> {
        return await this.store.run(async (db) => {
            const existing = await db
                .select()
                .from(notes)
                .where(
                    and(
                        eq(notes.id, noteId),
                        eq(notes.userId, userId),
                        isNull(notes.deletedAt),
                    ),
                )
                .limit(1)
                .all();

            if (existing.length === 0) {
                throw new NoteNotFoundError();
            }

            const current = existing[0];

            if (current.currentVersion !== input.version) {
                const layoutRows = await db
                    .select()
                    .from(noteLayouts)
                    .where(
                        and(
                            eq(noteLayouts.noteId, noteId),
                            eq(noteLayouts.userId, userId),
                        ),
                    )
                    .limit(1)
                    .all();
                throw new NoteConflictError(
                    this.toDto(current, layoutRows[0] ?? null),
                );
            }

            const currentTime = this.now();
            const updatedTitle = input.title !== undefined
                ? input.title
                : current.title;
            const updatedBody = input.body !== undefined
                ? input.body
                : (input.content !== undefined
                    ? input.content
                    : current.currentBody);
            const updatedIsPinned = input.isPinned !== undefined
                ? input.isPinned
                : (input.pinned !== undefined
                    ? input.pinned
                    : current.isPinned);
            const updatedIsHomeFixed = input.isHomeFixed !== undefined
                ? input.isHomeFixed
                : current.isHomeFixed;
            const updatedColor = input.color !== undefined
                ? input.color
                : (current.color as NoteColor);
            const updatedSortOrder = input.sortOrder !== undefined
                ? input.sortOrder
                : current.sortOrder;
            const nextVersion = current.currentVersion + 1;

            await db
                .update(notes)
                .set({
                    title: updatedTitle,
                    currentBody: updatedBody,
                    content: updatedBody,
                    isPinned: updatedIsPinned,
                    isHomeFixed: updatedIsHomeFixed,
                    color: updatedColor,
                    sortOrder: updatedSortOrder,
                    currentVersion: nextVersion,
                    updatedAt: currentTime,
                })
                .where(
                    and(
                        eq(notes.id, noteId),
                        eq(notes.userId, userId),
                        eq(notes.currentVersion, input.version),
                        isNull(notes.deletedAt),
                    ),
                )
                .run();
            // R-006 快照节流：内容/标题变化才考虑快照；autosave 距上次快照不足
            // 10 分钟则只更新当前内容不插历史行；manual/冲突恢复/restore 强制快照。
            if (
                updatedBody !== current.currentBody ||
                updatedTitle !== current.title
            ) {
                const origin = input.origin ?? "autosave";
                let shouldSnapshot = origin !== "autosave";
                if (origin === "autosave") {
                    const last = await db
                        .select({ createdAt: noteVersions.createdAt })
                        .from(noteVersions)
                        .where(
                            and(
                                eq(noteVersions.noteId, noteId),
                                eq(noteVersions.userId, userId),
                            ),
                        )
                        .orderBy(desc(noteVersions.createdAt))
                        .limit(1)
                        .all();
                    const lastAt = last[0]?.createdAt ?? 0;
                    if (currentTime - lastAt >= 10 * 60 * 1000) {
                        shouldSnapshot = true;
                    }
                }
                if (shouldSnapshot) {
                    await db.insert(noteVersions).values({
                        id: crypto.randomUUID(),
                        noteId,
                        userId,
                        version: nextVersion,
                        title: updatedTitle,
                        body: updatedBody,
                        reason: origin === "autosave"
                            ? "snapshot"
                            : origin === "manual"
                            ? "manual"
                            : "conflict_resolution",
                        createdAt: currentTime,
                    }).run();
                }
            }

            // Update layout if specified
            let layoutRow: typeof noteLayouts.$inferSelect | null = null;
            if (input.layout) {
                const existingLayout = await db
                    .select()
                    .from(noteLayouts)
                    .where(
                        and(
                            eq(noteLayouts.noteId, noteId),
                            eq(noteLayouts.userId, userId),
                        ),
                    )
                    .limit(1)
                    .all();

                if (existingLayout.length > 0) {
                    await db
                        .update(noteLayouts)
                        .set({
                            deviceClass: input.layout.deviceClass ??
                                existingLayout[0].deviceClass,
                            x: input.layout.x !== undefined
                                ? input.layout.x
                                : existingLayout[0].x,
                            y: input.layout.y !== undefined
                                ? input.layout.y
                                : existingLayout[0].y,
                            width: input.layout.width !== undefined
                                ? input.layout.width
                                : existingLayout[0].width,
                            zIndex: input.layout.zIndex !== undefined
                                ? input.layout.zIndex
                                : existingLayout[0].zIndex,
                            expanded: input.layout.expanded !== undefined
                                ? input.layout.expanded
                                : existingLayout[0].expanded,
                            sortOrder: input.layout.sortOrder !== undefined
                                ? input.layout.sortOrder
                                : existingLayout[0].sortOrder,
                            updatedAt: currentTime,
                        })
                        .where(eq(noteLayouts.id, existingLayout[0].id))
                        .run();
                } else {
                    await db.insert(noteLayouts).values({
                        id: crypto.randomUUID(),
                        noteId,
                        userId,
                        deviceClass: input.layout.deviceClass ?? "desktop",
                        x: input.layout.x ?? null,
                        y: input.layout.y ?? null,
                        width: input.layout.width ?? null,
                        zIndex: input.layout.zIndex ?? 0,
                        expanded: input.layout.expanded ?? false,
                        sortOrder: input.layout.sortOrder ?? null,
                        updatedAt: currentTime,
                    }).run();
                }
            }

            const updatedLayout = await db
                .select()
                .from(noteLayouts)
                .where(
                    and(
                        eq(noteLayouts.noteId, noteId),
                        eq(noteLayouts.userId, userId),
                    ),
                )
                .limit(1)
                .all();

            layoutRow = updatedLayout[0] ?? null;

            const result = this.toDto(
                {
                    ...current,
                    title: updatedTitle,
                    currentBody: updatedBody,
                    isPinned: updatedIsPinned,
                    isHomeFixed: updatedIsHomeFixed,
                    color: updatedColor,
                    sortOrder: updatedSortOrder,
                    currentVersion: nextVersion,
                    updatedAt: currentTime,
                },
                layoutRow,
            );
            // Y-003 轻量实时事件：同进程广播，其他设备/标签页可订阅刷新
            noteEvents.emit(userId, {
                noteId,
                version: nextVersion,
                updatedAt: currentTime,
            });
            return result;
        });
    }

    async updateLayout(
        userId: string,
        noteId: string,
        layout: Partial<NoteLayoutDto>,
    ): Promise<NoteLayoutDto> {
        return await this.store.run(async (db) => {
            const noteExists = await db
                .select({ id: notes.id })
                .from(notes)
                .where(
                    and(
                        eq(notes.id, noteId),
                        eq(notes.userId, userId),
                        isNull(notes.deletedAt),
                    ),
                )
                .limit(1)
                .all();

            if (noteExists.length === 0) throw new NoteNotFoundError();

            const currentTime = this.now();
            const existingLayout = await db
                .select()
                .from(noteLayouts)
                .where(
                    and(
                        eq(noteLayouts.noteId, noteId),
                        eq(noteLayouts.userId, userId),
                    ),
                )
                .limit(1)
                .all();

            if (existingLayout.length > 0) {
                await db
                    .update(noteLayouts)
                    .set({
                        deviceClass: layout.deviceClass ??
                            existingLayout[0].deviceClass,
                        x: layout.x !== undefined
                            ? layout.x
                            : existingLayout[0].x,
                        y: layout.y !== undefined
                            ? layout.y
                            : existingLayout[0].y,
                        width: layout.width !== undefined
                            ? layout.width
                            : existingLayout[0].width,
                        zIndex: layout.zIndex !== undefined
                            ? layout.zIndex
                            : existingLayout[0].zIndex,
                        expanded: layout.expanded !== undefined
                            ? layout.expanded
                            : existingLayout[0].expanded,
                        sortOrder: layout.sortOrder !== undefined
                            ? layout.sortOrder
                            : existingLayout[0].sortOrder,
                        updatedAt: currentTime,
                    })
                    .where(eq(noteLayouts.id, existingLayout[0].id))
                    .run();
            } else {
                await db.insert(noteLayouts).values({
                    id: crypto.randomUUID(),
                    noteId,
                    userId,
                    deviceClass: layout.deviceClass ?? "desktop",
                    x: layout.x ?? null,
                    y: layout.y ?? null,
                    width: layout.width ?? null,
                    zIndex: layout.zIndex ?? 0,
                    expanded: layout.expanded ?? false,
                    sortOrder: layout.sortOrder ?? null,
                    updatedAt: currentTime,
                }).run();
            }

            const updated = await db
                .select()
                .from(noteLayouts)
                .where(
                    and(
                        eq(noteLayouts.noteId, noteId),
                        eq(noteLayouts.userId, userId),
                    ),
                )
                .limit(1)
                .all();

            const l = updated[0];
            return {
                deviceClass: l.deviceClass as "desktop" | "tablet" | "mobile",
                x: l.x,
                y: l.y,
                width: l.width,
                zIndex: l.zIndex,
                expanded: Boolean(l.expanded),
                sortOrder: l.sortOrder,
                updatedAt: l.updatedAt,
            };
        });
    }

    async softDelete(
        userId: string,
        noteId: string,
        expectedVersion?: number,
    ): Promise<void> {
        await this.store.run(async (db) => {
            const existing = await db
                .select()
                .from(notes)
                .where(
                    and(
                        eq(notes.id, noteId),
                        eq(notes.userId, userId),
                        isNull(notes.deletedAt),
                    ),
                )
                .limit(1)
                .all();

            if (existing.length === 0) throw new NoteNotFoundError();

            const current = existing[0];
            if (
                expectedVersion !== undefined &&
                current.currentVersion !== expectedVersion
            ) {
                throw new NoteConflictError(this.toDto(current));
            }

            const currentTime = this.now();
            await db
                .update(notes)
                .set({ deletedAt: currentTime })
                .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
                .run();
        });
    }

    async restore(userId: string, noteId: string): Promise<NoteDto> {
        return await this.store.run(async (db) => {
            const existing = await db
                .select()
                .from(notes)
                .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
                .limit(1)
                .all();

            if (existing.length === 0) throw new NoteNotFoundError();

            await db
                .update(notes)
                .set({ deletedAt: null })
                .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
                .run();

            return this.toDto({ ...existing[0], deletedAt: null });
        });
    }

    async permanentDelete(userId: string, noteId: string): Promise<void> {
        await this.store.run(async (db) => {
            const existing = await db
                .select({ id: notes.id })
                .from(notes)
                .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
                .limit(1)
                .all();

            if (existing.length === 0) throw new NoteNotFoundError();

            await db
                .delete(notes)
                .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
                .run();
        });
    }
    // Version history
    async listVersions(
        userId: string,
        noteId: string,
    ): Promise<NoteVersionDto[]> {
        return await this.store.run(async (db) => {
            const noteExists = await db
                .select({ id: notes.id })
                .from(notes)
                .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
                .limit(1)
                .all();

            if (noteExists.length === 0) throw new NoteNotFoundError();

            const rows = await db
                .select()
                .from(noteVersions)
                .where(
                    and(
                        eq(noteVersions.noteId, noteId),
                        eq(noteVersions.userId, userId),
                    ),
                )
                .orderBy(
                    desc(noteVersions.version),
                    desc(noteVersions.createdAt),
                )
                .all();

            return rows.map((r) => ({
                id: r.id,
                noteId: r.noteId,
                version: r.version,
                title: r.title,
                body: r.body,
                reason: r.reason as NoteVersionDto["reason"],
                createdAt: r.createdAt,
            }));
        });
    }

    async restoreVersion(
        userId: string,
        noteId: string,
        versionNumber: number,
    ): Promise<NoteDto> {
        return await this.store.run(async (db) => {
            const currentRows = await db
                .select()
                .from(notes)
                .where(
                    and(
                        eq(notes.id, noteId),
                        eq(notes.userId, userId),
                        isNull(notes.deletedAt),
                    ),
                )
                .limit(1)
                .all();

            if (currentRows.length === 0) throw new NoteNotFoundError();
            const current = currentRows[0];

            const targetVersionRows = await db
                .select()
                .from(noteVersions)
                .where(
                    and(
                        eq(noteVersions.noteId, noteId),
                        eq(noteVersions.userId, userId),
                        eq(noteVersions.version, versionNumber),
                    ),
                )
                .limit(1)
                .all();

            if (targetVersionRows.length === 0) {
                throw new Error("指定历史版本不存在");
            }

            const targetVersion = targetVersionRows[0];
            const currentTime = this.now();
            const nextVersion = current.currentVersion + 1;

            // Preserve current version first
            await db.insert(noteVersions).values({
                id: crypto.randomUUID(),
                noteId,
                userId,
                version: nextVersion,
                title: targetVersion.title,
                body: targetVersion.body,
                reason: "restore",
                createdAt: currentTime,
            }).run();

            await db
                .update(notes)
                .set({
                    title: targetVersion.title,
                    currentBody: targetVersion.body,
                    currentVersion: nextVersion,
                    updatedAt: currentTime,
                })
                .where(eq(notes.id, noteId))
                .run();

            return this.toDto({
                ...current,
                title: targetVersion.title,
                currentBody: targetVersion.body,
                currentVersion: nextVersion,
                updatedAt: currentTime,
            });
        });
    }

    // FTS5 Search
    async search(
        userId: string,
        query: string,
    ): Promise<SearchNotesResultDto[]> {
        const cleanQuery = query.trim().replace(/['"]/g, "");
        if (!cleanQuery) return [];

        return await this.store.run(async (db) => {
            const ftsSql = sql`
                SELECT notes_fts.note_id, notes.title, snippet(notes_fts, 3, '<b>', '</b>', '...', 20) as snippet, notes.updated_at
                FROM notes_fts
                JOIN notes ON notes.id = notes_fts.note_id
                WHERE notes_fts MATCH ${cleanQuery}
                  AND notes.user_id = ${userId}
                  AND notes.deleted_at IS NULL
                ORDER BY rank
                LIMIT 50
            `;

            type RawRow = [string, string | null, string, number];
            const rows = await db.all<RawRow>(ftsSql);

            const list: SearchNotesResultDto[] = [];
            for (const item of rows) {
                if (Array.isArray(item)) {
                    list.push({
                        id: String(item[0]),
                        title: item[1] ? String(item[1]) : null,
                        snippet: String(item[2]),
                        updatedAt: Number(item[3]),
                    });
                }
            }
            return list;
        });
    }

    // Trash management
    async listTrash(userId: string): Promise<NoteDto[]> {
        return await this.list(userId, { includeDeleted: true }).then((all) =>
            all.filter((n) => n.deletedAt !== null)
        );
    }
}
