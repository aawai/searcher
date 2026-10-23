import { and, eq, isNull } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { documentLayouts, documents } from "../../db/schema.ts";
import type {
    DocumentLayoutDto,
    UpdateDocumentLayoutInput,
} from "../../shared/documents.ts";
import { DocumentNotFoundError } from "./errors.ts";

function toDto(row: typeof documentLayouts.$inferSelect): DocumentLayoutDto {
    return {
        deviceClass: row.deviceClass,
        x: row.x,
        y: row.y,
        width: row.width,
        zIndex: row.zIndex,
        expanded: Boolean(row.expanded),
        sortOrder: row.sortOrder,
        updatedAt: row.updatedAt,
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
        deviceClass: DocumentLayoutDto["deviceClass"] = "desktop",
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
                eq(documentLayouts.deviceClass, deviceClass),
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
                const owned = await tx.select({ id: documents.id }).from(
                    documents,
                )
                    .where(and(
                        eq(documents.id, id),
                        eq(documents.userId, userId),
                        isNull(documents.deletedAt),
                    )).limit(1);
                if (owned.length === 0) throw new DocumentNotFoundError();
                const deviceClass = input.deviceClass ?? "desktop";
                const rows = await tx.select().from(documentLayouts).where(and(
                    eq(documentLayouts.documentId, id),
                    eq(documentLayouts.userId, userId),
                    eq(documentLayouts.deviceClass, deviceClass),
                )).limit(1);
                const current = rows[0];
                const layout = {
                    deviceClass,
                    x: input.x !== undefined ? input.x : current?.x ?? null,
                    y: input.y !== undefined ? input.y : current?.y ?? null,
                    width: input.width !== undefined
                        ? input.width
                        : current?.width ?? null,
                    zIndex: input.zIndex ?? current?.zIndex ?? 0,
                    expanded: input.expanded ?? current?.expanded ?? false,
                    sortOrder: input.sortOrder !== undefined
                        ? input.sortOrder
                        : current?.sortOrder ?? null,
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
                        ...layout,
                    }).run();
                }
                return layout;
            });
        });
    }
}
