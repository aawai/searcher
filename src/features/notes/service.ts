import { and, desc, eq } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { notes } from "../../db/schema.ts";
import type { NoteDto } from "@shared/contracts.ts";

export interface CreateNoteInput {
    content?: string;
}

export interface UpdateNoteInput {
    content: string;
    version: number;
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

export class NotesService {
    constructor(
        private readonly store: DatabaseStore,
        private readonly now: () => number = () => Date.now(),
    ) {}

    async list(userId: string): Promise<NoteDto[]> {
        return await this.store.run(async (db) => {
            const rows = await db
                .select({
                    id: notes.id,
                    content: notes.content,
                    version: notes.version,
                    createdAt: notes.createdAt,
                    updatedAt: notes.updatedAt,
                })
                .from(notes)
                .where(eq(notes.userId, userId))
                .orderBy(desc(notes.createdAt), desc(notes.id))
                .all();

            return rows;
        });
    }

    async create(userId: string, input: CreateNoteInput): Promise<NoteDto> {
        const id = crypto.randomUUID();
        const content = input.content ?? "";
        const currentTime = this.now();
        const version = 1;

        return await this.store.run(async (db) => {
            await db.insert(notes).values({
                id,
                userId,
                content,
                version,
                createdAt: currentTime,
                updatedAt: currentTime,
            }).run();

            return {
                id,
                content,
                version,
                createdAt: currentTime,
                updatedAt: currentTime,
            };
        });
    }

    async update(
        userId: string,
        noteId: string,
        input: UpdateNoteInput,
    ): Promise<NoteDto> {
        const currentTime = this.now();

        return await this.store.run(async (db) => {
            const existing = await db
                .select({
                    id: notes.id,
                    content: notes.content,
                    version: notes.version,
                    createdAt: notes.createdAt,
                    updatedAt: notes.updatedAt,
                })
                .from(notes)
                .where(
                    and(
                        eq(notes.id, noteId),
                        eq(notes.userId, userId),
                    ),
                )
                .limit(1)
                .all();

            if (existing.length === 0) {
                throw new NoteNotFoundError();
            }

            const current = existing[0];
            if (current.version !== input.version) {
                throw new NoteConflictError(current);
            }

            const nextVersion = current.version + 1;
            await db.update(notes)
                .set({
                    content: input.content,
                    version: nextVersion,
                    updatedAt: currentTime,
                })
                .where(
                    and(
                        eq(notes.id, noteId),
                        eq(notes.userId, userId),
                        eq(notes.version, input.version),
                    ),
                )
                .run();

            return {
                id: current.id,
                content: input.content,
                version: nextVersion,
                createdAt: current.createdAt,
                updatedAt: currentTime,
            };
        });
    }

    async delete(
        userId: string,
        noteId: string,
        expectedVersion?: number,
    ): Promise<void> {
        return await this.store.run(async (db) => {
            const existing = await db
                .select({
                    id: notes.id,
                    content: notes.content,
                    version: notes.version,
                    createdAt: notes.createdAt,
                    updatedAt: notes.updatedAt,
                })
                .from(notes)
                .where(
                    and(
                        eq(notes.id, noteId),
                        eq(notes.userId, userId),
                    ),
                )
                .limit(1)
                .all();

            if (existing.length === 0) {
                throw new NoteNotFoundError();
            }

            const current = existing[0];
            if (
                expectedVersion !== undefined &&
                current.version !== expectedVersion
            ) {
                throw new NoteConflictError(current);
            }

            await db.delete(notes)
                .where(
                    and(
                        eq(notes.id, noteId),
                        eq(notes.userId, userId),
                        ...(expectedVersion !== undefined
                            ? [eq(notes.version, expectedVersion)]
                            : []),
                    ),
                )
                .run();
        });
    }
}
