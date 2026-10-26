import { and, eq, inArray, isNull, ne, notInArray } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { documentLayouts, documents } from "../../db/schema.ts";
import {
    type DocumentLayoutDto,
    type DocumentLayoutsDto,
    type DocumentNoteSize,
    HOME_NOTE_BANDS,
    HOME_NOTE_GRID_MAX_COL,
    HOME_NOTE_GRID_MAX_ROW,
    type HomeNoteBand,
    homeNoteCellsOverlap,
    homeNoteMinRow,
    type UpdateDocumentLayoutInput,
    type UpdateDocumentLayoutsInput,
} from "../../shared/documents.ts";
import {
    DocumentLayoutConflictError,
    DocumentNotFoundError,
    DocumentValidationError,
} from "./errors.ts";

/** Layouts no longer vary by device; the column is legacy until cleanup. */
const DEVICE_CLASS = "desktop";

interface CellLayout {
    band: HomeNoteBand | null;
    col: number | null;
    row: number | null;
    size: DocumentNoteSize;
}

interface PlacedCell {
    band: HomeNoteBand;
    col: number;
    row: number;
    size: DocumentNoteSize;
}

function toDto(row: typeof documentLayouts.$inferSelect): DocumentLayoutDto {
    return {
        band: row.band,
        col: row.col,
        row: row.row,
        size: row.size,
        updatedAt: row.updatedAt,
    };
}

/** A layout only participates in the lattice when the position is complete. */
function placedCell(layout: CellLayout): PlacedCell | null {
    if (layout.band === null || layout.col === null || layout.row === null) {
        return null;
    }
    return {
        band: layout.band,
        col: layout.col,
        row: layout.row,
        size: layout.size,
    };
}

function assertCell(
    band: HomeNoteBand | null,
    col: number | null,
    row: number | null,
): void {
    const present = [band, col, row].filter((value) => value !== null).length;
    if (present !== 0 && present !== 3) {
        throw new DocumentValidationError("band、col 与 row 必须同时设置");
    }
    if (band === null || col === null || row === null) return;
    if (!HOME_NOTE_BANDS.includes(band)) {
        throw new DocumentValidationError("无效的首页笔记分区");
    }
    if (
        !Number.isInteger(col) || col < 0 || col > HOME_NOTE_GRID_MAX_COL ||
        !Number.isInteger(row) || row < homeNoteMinRow(band) ||
        row > HOME_NOTE_GRID_MAX_ROW
    ) {
        throw new DocumentValidationError("首页笔记单元超出范围");
    }
}

/** Applies one item's fields over its current layout and validates the cell. */
function resolveLayout(
    current: CellLayout | undefined,
    input: UpdateDocumentLayoutInput,
): CellLayout {
    const hasPosition = input.band !== undefined ||
        input.col !== undefined ||
        input.row !== undefined;
    if (
        hasPosition &&
        (input.band === undefined || input.col === undefined ||
            input.row === undefined)
    ) {
        throw new DocumentValidationError("band、col 与 row 必须同时提供");
    }
    const band = input.band === undefined ? current?.band ?? null : input.band;
    const col = input.col === undefined ? current?.col ?? null : input.col;
    const row = input.row === undefined ? current?.row ?? null : input.row;
    assertCell(band, col, row);
    return {
        band,
        col,
        row,
        size: input.size ?? current?.size ?? "s",
    };
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
                const layout = resolveLayout(current, input);

                // Only notes on the home surface share one lattice. Conflicts
                // usually resolve on the client; this guards concurrent tabs.
                const candidate = placedCell(layout);
                if (candidate && owned[0].isHomeFixed) {
                    const others = await tx.select({
                        band: documentLayouts.band,
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
                    for (const other of others) {
                        const otherCell = placedCell(other);
                        if (
                            otherCell &&
                            homeNoteCellsOverlap(candidate, otherCell)
                        ) {
                            throw new DocumentLayoutConflictError();
                        }
                    }
                }

                const updatedAt = this.now();
                if (current) {
                    await tx.update(documentLayouts).set({
                        ...layout,
                        updatedAt,
                    }).where(eq(documentLayouts.id, current.id)).run();
                } else {
                    await tx.insert(documentLayouts).values({
                        id: crypto.randomUUID(),
                        documentId: id,
                        userId,
                        deviceClass: DEVICE_CLASS,
                        ...layout,
                        updatedAt,
                    }).run();
                }
                return { ...layout, updatedAt };
            });
        });
    }

    /**
     * One atomic layout write for several notes (e.g. a drag swap). Every id
     * must be an owned note; resulting home cells may not overlap each other or
     * any other placed home note of the account.
     */
    async updateLayouts(
        userId: string,
        input: UpdateDocumentLayoutsInput,
    ): Promise<DocumentLayoutsDto> {
        if (input.items.length === 0) return { items: [] };
        const ids = input.items.map((item) => item.id);
        if (new Set(ids).size !== ids.length) {
            throw new DocumentValidationError("笔记 ID 不能重复");
        }
        return await this.store.run(async (db) => {
            return await db.transaction(async (tx) => {
                const owned = await tx.select({
                    id: documents.id,
                    isHomeFixed: documents.isHomeFixed,
                }).from(documents)
                    .where(and(
                        eq(documents.userId, userId),
                        isNull(documents.deletedAt),
                        inArray(documents.id, ids),
                    ));
                if (owned.length !== ids.length) {
                    throw new DocumentNotFoundError();
                }
                const homeFixed = new Set(
                    owned.filter((row) => row.isHomeFixed).map((row) => row.id),
                );
                const currentRows = await tx.select().from(documentLayouts)
                    .where(and(
                        eq(documentLayouts.userId, userId),
                        eq(documentLayouts.deviceClass, DEVICE_CLASS),
                        inArray(documentLayouts.documentId, ids),
                    ));
                const currentById = new Map(
                    currentRows.map((row) => [row.documentId, row]),
                );
                const layouts = input.items.map((item) =>
                    resolveLayout(currentById.get(item.id), item)
                );
                const placed: Array<{ id: string; cell: PlacedCell }> = [];
                layouts.forEach((layout, index) => {
                    const cell = placedCell(layout);
                    const id = input.items[index].id;
                    if (cell && homeFixed.has(id)) {
                        placed.push({ id, cell });
                    }
                });
                for (let a = 0; a < placed.length; a++) {
                    for (let b = a + 1; b < placed.length; b++) {
                        if (
                            homeNoteCellsOverlap(placed[a].cell, placed[b].cell)
                        ) {
                            throw new DocumentLayoutConflictError();
                        }
                    }
                }
                const others = await tx.select({
                    band: documentLayouts.band,
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
                        eq(documents.isHomeFixed, true),
                        isNull(documents.deletedAt),
                        notInArray(documentLayouts.documentId, ids),
                    ));
                for (const other of others) {
                    const otherCell = placedCell(other);
                    if (!otherCell) continue;
                    if (
                        placed.some((entry) =>
                            homeNoteCellsOverlap(entry.cell, otherCell)
                        )
                    ) {
                        throw new DocumentLayoutConflictError();
                    }
                }

                const updatedAt = this.now();
                for (let index = 0; index < input.items.length; index++) {
                    const id = input.items[index].id;
                    const layout = layouts[index];
                    const current = currentById.get(id);
                    if (current) {
                        await tx.update(documentLayouts).set({
                            ...layout,
                            updatedAt,
                        }).where(eq(documentLayouts.id, current.id)).run();
                    } else {
                        await tx.insert(documentLayouts).values({
                            id: crypto.randomUUID(),
                            documentId: id,
                            userId,
                            deviceClass: DEVICE_CLASS,
                            ...layout,
                            updatedAt,
                        }).run();
                    }
                }
                return {
                    items: layouts.map((layout, index) => ({
                        id: input.items[index].id,
                        layout: { ...layout, updatedAt },
                    })),
                };
            });
        });
    }
}
