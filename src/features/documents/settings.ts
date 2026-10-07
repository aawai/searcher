import { and, eq } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { documents, documentSettings } from "../../db/schema.ts";
import type {
    DocumentSettingsDto,
    UpdateDocumentSettingsInput,
} from "../../shared/documents.ts";
import { DocumentNotFoundError, DocumentValidationError } from "./errors.ts";

const VALID_PAPER_SIZES: Record<DocumentSettingsDto["paperSize"], true> = {
    a4: true,
    letter: true,
};
const VALID_ORIENTATIONS: Record<DocumentSettingsDto["orientation"], true> = {
    portrait: true,
    landscape: true,
};

export function validateSettingsInput(
    input: UpdateDocumentSettingsInput,
): void {
    if (!VALID_PAPER_SIZES[input.paperSize]) {
        throw new DocumentValidationError("纸张大小仅支持 a4 或 letter");
    }
    if (!VALID_ORIENTATIONS[input.orientation]) {
        throw new DocumentValidationError(
            "纸张方向仅支持 portrait 或 landscape",
        );
    }

    const margins: Array<[string, number]> = [
        ["上边距", input.marginTopMm],
        ["右边距", input.marginRightMm],
        ["下边距", input.marginBottomMm],
        ["左边距", input.marginLeftMm],
    ];

    for (const [_name, val] of margins) {
        if (
            typeof val !== "number" || !Number.isFinite(val) || val < 5 ||
            val > 50
        ) {
            throw new DocumentValidationError("页边距必须在 5mm 至 50mm 之间");
        }
    }
}

export class DocumentSettingsService {
    constructor(
        private readonly store: DatabaseStore,
        private readonly now: () => number = Date.now,
    ) {}

    async get(
        userId: string,
        documentId: string,
    ): Promise<DocumentSettingsDto> {
        return await this.store.run(async (db) => {
            const docRows = await db
                .select({ id: documents.id, deletedAt: documents.deletedAt })
                .from(documents)
                .where(
                    and(
                        eq(documents.id, documentId),
                        eq(documents.userId, userId),
                    ),
                )
                .limit(1);

            if (docRows.length === 0 || docRows[0].deletedAt !== null) {
                throw new DocumentNotFoundError();
            }

            const rows = await db
                .select()
                .from(documentSettings)
                .where(
                    and(
                        eq(documentSettings.documentId, documentId),
                        eq(documentSettings.userId, userId),
                    ),
                )
                .limit(1);

            if (rows.length > 0) {
                const row = rows[0];
                return {
                    paperSize: row.paperSize,
                    orientation: row.orientation,
                    marginTopMm: row.marginTopMm,
                    marginRightMm: row.marginRightMm,
                    marginBottomMm: row.marginBottomMm,
                    marginLeftMm: row.marginLeftMm,
                    updatedAt: row.updatedAt,
                };
            }

            const now = this.now();
            const defaultValues = {
                documentId,
                userId,
                paperSize: "a4" as const,
                orientation: "portrait" as const,
                marginTopMm: 20,
                marginRightMm: 20,
                marginBottomMm: 20,
                marginLeftMm: 20,
                updatedAt: now,
            };

            await db
                .insert(documentSettings)
                .values(defaultValues)
                .onConflictDoNothing();

            const persisted = await db
                .select()
                .from(documentSettings)
                .where(
                    and(
                        eq(documentSettings.documentId, documentId),
                        eq(documentSettings.userId, userId),
                    ),
                )
                .limit(1);

            if (persisted.length > 0) {
                const row = persisted[0];
                return {
                    paperSize: row.paperSize,
                    orientation: row.orientation,
                    marginTopMm: row.marginTopMm,
                    marginRightMm: row.marginRightMm,
                    marginBottomMm: row.marginBottomMm,
                    marginLeftMm: row.marginLeftMm,
                    updatedAt: row.updatedAt,
                };
            }

            return {
                paperSize: defaultValues.paperSize,
                orientation: defaultValues.orientation,
                marginTopMm: defaultValues.marginTopMm,
                marginRightMm: defaultValues.marginRightMm,
                marginBottomMm: defaultValues.marginBottomMm,
                marginLeftMm: defaultValues.marginLeftMm,
                updatedAt: defaultValues.updatedAt,
            };
        });
    }

    async update(
        userId: string,
        documentId: string,
        input: UpdateDocumentSettingsInput,
    ): Promise<DocumentSettingsDto> {
        validateSettingsInput(input);

        return await this.store.run(async (db) => {
            const docRows = await db
                .select({ id: documents.id, deletedAt: documents.deletedAt })
                .from(documents)
                .where(
                    and(
                        eq(documents.id, documentId),
                        eq(documents.userId, userId),
                    ),
                )
                .limit(1);

            if (docRows.length === 0 || docRows[0].deletedAt !== null) {
                throw new DocumentNotFoundError();
            }

            const now = this.now();
            const values = {
                documentId,
                userId,
                paperSize: input.paperSize,
                orientation: input.orientation,
                marginTopMm: input.marginTopMm,
                marginRightMm: input.marginRightMm,
                marginBottomMm: input.marginBottomMm,
                marginLeftMm: input.marginLeftMm,
                updatedAt: now,
            };

            await db
                .insert(documentSettings)
                .values(values)
                .onConflictDoUpdate({
                    target: documentSettings.documentId,
                    set: {
                        paperSize: input.paperSize,
                        orientation: input.orientation,
                        marginTopMm: input.marginTopMm,
                        marginRightMm: input.marginRightMm,
                        marginBottomMm: input.marginBottomMm,
                        marginLeftMm: input.marginLeftMm,
                        updatedAt: now,
                    },
                });

            return {
                paperSize: input.paperSize,
                orientation: input.orientation,
                marginTopMm: input.marginTopMm,
                marginRightMm: input.marginRightMm,
                marginBottomMm: input.marginBottomMm,
                marginLeftMm: input.marginLeftMm,
                updatedAt: now,
            };
        });
    }
}
