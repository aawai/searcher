import { and, eq, isNull, ne } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { documentLayouts, documents } from "../../db/schema.ts";
import {
    type DocumentLayoutDto,
    type DocumentNoteSize,
    HOME_NOTE_GRID_MAX_COL,
    HOME_NOTE_GRID_MAX_ROW,
    homeNoteCellsOverlap,
    type UpdateDocumentLayoutInput,
} from "../../shared/documents.ts";
import {
    DocumentLayoutConflictError,
    DocumentNotFoundError,
    DocumentValidationError,
} from "./errors.ts";

/** Layouts no longer vary by device; the column is legacy until cleanup. */
const DEVICE_CLASS = "desktop";

function toDto(row: typeof documentLayouts.$inferSelect): DocumentLayoutDto {
    return {
        col: row.col,
        row: row.row,
        size: row.size as DocumentNoteSize,
        updatedAt: row.updatedAt,
    };
}

function assertCell(
    col: number | null,
    row: number | null,
): void {
    if ((col === null) !== (row === null)) {
        throw new DocumentValidationError("col 与 row 必须同时设置");
    }
    if (col === null || row === null) return;
    if (
        !Number.isInteger(col) || col < 0 || col > HOME_NOTE_GRID_MAX_COL ||
        !Number.isInteger(row) || row < 0 || row > HOME_NOTE_GRID_MAX_ROW
    ) {
        throw new DocumentValidationError("首页笔记单元超出范围");
    }
}

export class DocumentLayoutsService {
    constructor(
        private readonly store: DatabaseStore,
        private readonly now: () => number = Date.now,
    ) {}

    async getLayout(
        userId: string,
        id: string,
    ): Promise<DocumentLayoutDto | null> {
        return await this.store.run(async (db) => {
            const owned = await db.select({ id: documents.id }).from(documents)
                .where(and(
                    eq(documents.id, id),
                    eq(documents.userId, userId),
                    isNull(documents.deletedAt),
                )).limit(1);
            if (owned.length === 0) throw new DocumentNotFoundError();
            const rows = await db.select().from(documentLayouts).where(and(
                eq(documentLayouts.documentId, id),
                eq(documentLayouts.userId, userId),
                eq(documentLayouts.deviceClass, DEVICE_CLASS),
            )).limit(1);
            return rows.length ? toDto(rows[0]) : null;
        });
    }

    async updateLayout(
        userId: string,
        id: string,
        input: UpdateDocumentLayoutInput,
    ): Promise<DocumentLayoutDto> {
        return await this.store.run(async (db) => {
            return await db.transaction(async (tx) => {
                const owned = await tx.select({
                    id: documents.id,
                    isHomeFixed: documents.isHomeFixed,
                }).from(documents)
                    .where(and(
                        eq(documents.id, id),
                        eq(documents.userId, userId),
                        isNull(documents.deletedAt),
                    )).limit(1);
                if (owned.length === 0) throw new DocumentNotFoundError();
                const rows = await tx.select().from(documentLayouts).where(and(
                    eq(documentLayouts.documentId, id),
                    eq(documentLayouts.userId, userId),
                    eq(documentLayouts.deviceClass, DEVICE_CLASS),
                )).limit(1);
                const current = rows[0];
                // A cell is one position: update both axes or neither.
                if (
                    (input.col === undefined) !== (input.row === undefined)
                ) {
                    throw new DocumentValidationError(
                        "col 与 row 必须同时提供",
                    );
                }
                const col = input.col !== undefined
                    ? input.col
                    : current?.col ?? null;
                const row = input.row !== undefined
                    ? input.row
                    : current?.row ?? null;
                const size = input.size ?? current?.size ?? "s";
                assertCell(col, row);

                // Only notes on the home surface share one lattice. Conflicts
                // usually resolve on the client; this guards concurrent tabs.
                if (col !== null && row !== null && owned[0].isHomeFixed) {
                    const others = await tx.select({
                        col: documentLayouts.col,
                        row: documentLayouts.row,
                        size: documentLayouts.size,
                    }).from(documentLayouts)
                        .innerJoin(
                            documents,
                            eq(documents.id, documentLayouts.documentId),
                        )
                        .where(and(
                            eq(documentLayouts.userId, userId),
                            eq(documentLayouts.deviceClass, DEVICE_CLASS),
                            ne(documentLayouts.documentId, id),
                            eq(documents.isHomeFixed, true),
                            isNull(documents.deletedAt),
                        ));
                    const candidate = { col, row, size };
                    for (const other of others) {
                        if (other.col === null || other.row === null) continue;
                        if (
                            homeNoteCellsOverlap(candidate, {
                                col: other.col,
                                row: other.row,
                                size: other.size as DocumentNoteSize,
                            })
                        ) {
                            throw new DocumentLayoutConflictError();
                        }
                    }
                }

                const layout = {
                    col,
                    row,
                    size,
                    updatedAt: this.now(),
                };
                if (current) {
                    await tx.update(documentLayouts).set(layout)
                        .where(eq(documentLayouts.id, current.id)).run();
                } else {
                    await tx.insert(documentLayouts).values({
                        id: crypto.randomUUID(),
                        documentId: id,
                        userId,
                        deviceClass: DEVICE_CLASS,
                        ...layout,
                    }).run();
                }
                return layout;
            });
        });
    }
}
