import { and, asc, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import {
    documentNotebooks,
    documents,
    documentVersions,
} from "../../db/schema.ts";
import {
    type CreateDocumentInput,
    DOCUMENT_BODY_MAX_LENGTH,
    DOCUMENT_PAGE_DEFAULT_LIMIT,
    DOCUMENT_PAGE_MAX_LIMIT,
    DOCUMENT_SNAPSHOT_INTERVAL_MS,
    DOCUMENT_SNAPSHOT_RETENTION,
    DOCUMENT_TITLE_MAX_LENGTH,
    type DocumentColor,
    type DocumentDto,
    type DocumentListInput,
    type DocumentPageDto,
    type DocumentScope,
    type DocumentSummaryDto,
    type DocumentVersionDto,
    type DocumentVersionReason,
    type UpdateDocumentInput,
} from "../../shared/documents.ts";
import {
    DocumentConflictError,
    DocumentNotFoundError,
    DocumentValidationError,
} from "./errors.ts";
import { documentDisplayTitle, documentSnippet } from "./markdown.ts";
import { DocumentsEvents } from "./events.ts";

// SQLite trim defaults to ASCII space; match ECMAScript String.trim for titles.
const TITLE_WHITESPACE =
    "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

interface ListCursorPayload {
    readonly u: string;
    readonly s: string;
    readonly v: {
        readonly fav?: number;
        readonly home?: number;
        readonly created?: number;
        readonly upd: number;
        readonly id: string;
    };
}

interface SearchCursorPayload {
    readonly u: string;
    readonly q: string;
    readonly v: {
        readonly rank: number;
        readonly id: string;
    };
}

function encodeCursor(data: unknown): string {
    const json = JSON.stringify(data);
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function decodeCursor<T>(cursor: string): T {
    try {
        let base64 = cursor.replace(/-/g, "+").replace(/_/g, "/");
        while (base64.length % 4 !== 0) {
            base64 += "=";
        }
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const json = new TextDecoder().decode(bytes);
        return JSON.parse(json) as T;
    } catch {
        throw new DocumentValidationError("无效的游标");
    }
}

function scopeToKey(scope: DocumentScope): string {
    if (scope.type === "notebook") {
        return `notebook:${scope.notebookId}`;
    }
    return scope.type;
}

// documents_fts uses the trigram tokenizer: MATCH is a substring search for phrases of at least
// 3 characters and can never match a shorter one. Shorter terms are answered by scanning the
// owner's live documents instead. Every term is a literal; none of it reaches FTS5 as syntax.
const TRIGRAM_MIN_LENGTH = 3;
// Scan results have no bm25 score; ranking by recency keeps the cursor shape (rank, id) identical
// to MATCH results. A title hit sorts ahead of any body hit by this constant (> any epoch ms).
const SCAN_TITLE_HIT_BONUS = 10_000_000_000_000;

interface SearchTerms {
    /** Quoted FTS5 phrases for terms of >= 3 characters, ANDed. */
    readonly match: string | null;
    /** Raw terms of 1–2 characters, matched as case-insensitive substrings. */
    readonly scan: readonly string[];
}

function parseSearchTerms(raw: string): SearchTerms {
    const phrases: string[] = [];
    const scan: string[] = [];
    for (const term of raw.split(/\s+/)) {
        if (term.length === 0) continue;
        if ([...term].length >= TRIGRAM_MIN_LENGTH) {
            phrases.push(`"${term.replaceAll('"', '""')}"`);
        } else {
            scan.push(term);
        }
    }
    return {
        match: phrases.length > 0 ? phrases.join(" AND ") : null,
        scan,
    };
}

export class DocumentsService {
    readonly events = new DocumentsEvents();

    constructor(
        private readonly store: DatabaseStore,
        private readonly now: () => number = Date.now,
    ) {}

    private validateTitle(title: string | null | undefined): void {
        if (title !== undefined && title !== null) {
            if (typeof title !== "string") {
                throw new DocumentValidationError("标题必须是字符串");
            }
            if (title.length > DOCUMENT_TITLE_MAX_LENGTH) {
                throw new DocumentValidationError(
                    `笔记标题不能超过 ${DOCUMENT_TITLE_MAX_LENGTH} 个字符`,
                );
            }
        }
    }

    private validateBody(body: string | undefined): void {
        if (body !== undefined) {
            if (typeof body !== "string") {
                throw new DocumentValidationError("正文必须是字符串");
            }
            if (body.length > DOCUMENT_BODY_MAX_LENGTH) {
                throw new DocumentValidationError(
                    `笔记正文不能超过 ${DOCUMENT_BODY_MAX_LENGTH} 个字符`,
                );
            }
        }
    }

    private validateLimit(limit: number | undefined): number {
        if (limit === undefined) {
            return DOCUMENT_PAGE_DEFAULT_LIMIT;
        }
        if (
            typeof limit !== "number" ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > DOCUMENT_PAGE_MAX_LIMIT
        ) {
            throw new DocumentValidationError(
                `limit 必须为 1 到 ${DOCUMENT_PAGE_MAX_LIMIT} 之间的整数`,
            );
        }
        return limit;
    }

    private toSummaryDto(row: {
        id: string;
        title: string | null;
        notebookId: string | null;
        notebookName?: string | null;
        isFavorite: boolean;
        color: DocumentColor;
        isHomeFixed: boolean;
        homeSortOrder: number;
        createdAt: number;
        updatedAt: number;
        bodyPreview: string;
    }): DocumentSummaryDto {
        return {
            id: row.id,
            title: row.title,
            displayTitle: documentDisplayTitle(row.title, row.bodyPreview),
            snippet: documentSnippet(row.bodyPreview),
            notebookId: row.notebookId,
            ...(row.notebookName ? { notebookName: row.notebookName } : {}),
            isFavorite: Boolean(row.isFavorite),
            color: row.color,
            isHomeFixed: Boolean(row.isHomeFixed),
            homeSortOrder: row.homeSortOrder,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }

    private toDocumentDto(
        doc: typeof documents.$inferSelect,
        notebookName?: string | null,
    ): DocumentDto {
        return {
            id: doc.id,
            title: doc.title,
            displayTitle: documentDisplayTitle(doc.title, doc.currentBody),
            snippet: documentSnippet(doc.currentBody),
            body: doc.currentBody,
            version: doc.currentVersion,
            notebookId: doc.notebookId,
            ...(notebookName ? { notebookName } : {}),
            isFavorite: Boolean(doc.isFavorite),
            color: doc.color,
            isHomeFixed: Boolean(doc.isHomeFixed),
            homeSortOrder: doc.homeSortOrder,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
        };
    }

    async get(userId: string, id: string): Promise<DocumentDto> {
        return await this.store.run(async (db) => {
            const rows = await db
                .select({
                    doc: documents,
                    notebookName: documentNotebooks.name,
                })
                .from(documents)
                .leftJoin(
                    documentNotebooks,
                    eq(documents.notebookId, documentNotebooks.id),
                )
                .where(
                    and(
                        eq(documents.id, id),
                        eq(documents.userId, userId),
                    ),
                )
                .limit(1);

            if (rows.length === 0) {
                throw new DocumentNotFoundError();
            }

            return this.toDocumentDto(rows[0].doc, rows[0].notebookName);
        });
    }

    async create(
        userId: string,
        input: CreateDocumentInput,
    ): Promise<DocumentDto> {
        this.validateTitle(input.title);
        this.validateBody(input.body);

        const currentTime = this.now();
        const documentId = crypto.randomUUID();
        const versionId = crypto.randomUUID();
        const initialTitle = input.title ?? null;
        const initialBody = input.body ?? "";

        const result = await this.store.run(async (db) => {
            return await db.transaction(async (tx) => {
                let notebookName: string | null = null;
                if (
                    input.notebookId !== undefined && input.notebookId !== null
                ) {
                    const nbRows = await tx
                        .select({ name: documentNotebooks.name })
                        .from(documentNotebooks)
                        .where(
                            and(
                                eq(documentNotebooks.id, input.notebookId),
                                eq(documentNotebooks.userId, userId),
                            ),
                        )
                        .limit(1);
                    if (nbRows.length === 0) {
                        throw new DocumentNotFoundError(
                            "笔记本不存在或无权访问",
                        );
                    }
                    notebookName = nbRows[0].name;
                }

                const docRow: typeof documents.$inferInsert = {
                    id: documentId,
                    userId,
                    notebookId: input.notebookId ?? null,
                    title: initialTitle,
                    currentBody: initialBody,
                    currentVersion: 1,
                    isFavorite: input.isFavorite ?? false,
                    color: input.color ?? "paper",
                    isHomeFixed: input.isHomeFixed ?? false,
                    homeSortOrder: input.homeSortOrder ?? 0,
                    deletedAt: null,
                    createdAt: currentTime,
                    updatedAt: currentTime,
                };

                await tx.insert(documents).values(docRow).run();

                await tx.insert(documentVersions).values({
                    id: versionId,
                    documentId,
                    userId,
                    version: 1,
                    title: initialTitle,
                    body: initialBody,
                    reason: "snapshot",
                    createdAt: currentTime,
                }).run();

                return this.toDocumentDto(
                    {
                        id: documentId,
                        userId,
                        notebookId: input.notebookId ?? null,
                        title: initialTitle,
                        currentBody: initialBody,
                        currentVersion: 1,
                        isFavorite: input.isFavorite ?? false,
                        color: input.color ?? "paper",
                        isHomeFixed: input.isHomeFixed ?? false,
                        homeSortOrder: input.homeSortOrder ?? 0,
                        deletedAt: null,
                        createdAt: currentTime,
                        updatedAt: currentTime,
                    },
                    notebookName,
                );
            });
        });
        this.events.emit(userId, {
            documentId: result.id,
            version: result.version,
            updatedAt: result.updatedAt,
        });
        return result;
    }

    async update(
        userId: string,
        id: string,
        input: UpdateDocumentInput,
    ): Promise<DocumentDto> {
        if (
            typeof input.version !== "number" ||
            !Number.isInteger(input.version) ||
            input.version < 1
        ) {
            throw new DocumentValidationError("版本号必须是正整数");
        }
        this.validateTitle(input.title);
        this.validateBody(input.body);

        const result = await this.store.run(async (db) => {
            return await db.transaction(async (tx) => {
                const existingRows = await tx
                    .select({
                        doc: documents,
                        notebookName: documentNotebooks.name,
                    })
                    .from(documents)
                    .leftJoin(
                        documentNotebooks,
                        eq(documents.notebookId, documentNotebooks.id),
                    )
                    .where(
                        and(
                            eq(documents.id, id),
                            eq(documents.userId, userId),
                            sql`${documents.deletedAt} IS NULL`,
                        ),
                    )
                    .limit(1);

                if (existingRows.length === 0) {
                    throw new DocumentNotFoundError();
                }

                const current = existingRows[0].doc;
                const currentNotebookName = existingRows[0].notebookName;

                if (current.currentVersion !== input.version) {
                    throw new DocumentConflictError(
                        this.toDocumentDto(current, currentNotebookName),
                    );
                }

                let nextNotebookId = current.notebookId;
                let nextNotebookName = currentNotebookName;

                if (input.notebookId !== undefined) {
                    if (input.notebookId === null) {
                        nextNotebookId = null;
                        nextNotebookName = null;
                    } else if (input.notebookId !== current.notebookId) {
                        const nbRows = await tx
                            .select({ name: documentNotebooks.name })
                            .from(documentNotebooks)
                            .where(
                                and(
                                    eq(documentNotebooks.id, input.notebookId),
                                    eq(documentNotebooks.userId, userId),
                                ),
                            )
                            .limit(1);
                        if (nbRows.length === 0) {
                            throw new DocumentNotFoundError(
                                "笔记本不存在或无权访问",
                            );
                        }
                        nextNotebookId = input.notebookId;
                        nextNotebookName = nbRows[0].name;
                    }
                }

                const currentTime = this.now();
                const nextVersion = current.currentVersion + 1;
                const updatedTitle = input.title !== undefined
                    ? input.title
                    : current.title;
                const updatedBody = input.body !== undefined
                    ? input.body
                    : current.currentBody;
                const updatedIsFavorite = input.isFavorite !== undefined
                    ? input.isFavorite
                    : current.isFavorite;

                await tx
                    .update(documents)
                    .set({
                        title: updatedTitle,
                        currentBody: updatedBody,
                        notebookId: nextNotebookId,
                        isFavorite: updatedIsFavorite,
                        color: input.color ?? current.color,
                        isHomeFixed: input.isHomeFixed ?? current.isHomeFixed,
                        homeSortOrder: input.homeSortOrder ??
                            current.homeSortOrder,
                        currentVersion: nextVersion,
                        updatedAt: currentTime,
                    })
                    .where(
                        and(
                            eq(documents.id, id),
                            eq(documents.userId, userId),
                            eq(documents.currentVersion, input.version),
                            sql`${documents.deletedAt} IS NULL`,
                        ),
                    )
                    .run();

                const contentChanged = updatedTitle !== current.title ||
                    updatedBody !== current.currentBody;

                if (contentChanged) {
                    const origin = input.origin ?? "autosave";
                    let shouldSnapshot = origin !== "autosave";

                    if (origin === "autosave") {
                        const lastSnapshots = await tx
                            .select({ createdAt: documentVersions.createdAt })
                            .from(documentVersions)
                            .where(
                                and(
                                    eq(documentVersions.documentId, id),
                                    eq(documentVersions.userId, userId),
                                ),
                            )
                            .orderBy(desc(documentVersions.createdAt))
                            .limit(1);

                        const lastSnapshotAt = lastSnapshots[0]?.createdAt ?? 0;
                        if (
                            currentTime - lastSnapshotAt >=
                                DOCUMENT_SNAPSHOT_INTERVAL_MS
                        ) {
                            shouldSnapshot = true;
                        }
                    }

                    if (shouldSnapshot) {
                        const versionReason: DocumentVersionReason =
                            origin === "autosave" ? "snapshot" : origin;

                        await tx.insert(documentVersions).values({
                            id: crypto.randomUUID(),
                            documentId: id,
                            userId,
                            version: nextVersion,
                            title: updatedTitle,
                            body: updatedBody,
                            reason: versionReason,
                            createdAt: currentTime,
                        }).run();

                        if (versionReason === "snapshot") {
                            await tx.run(sql`
                                DELETE FROM document_versions
                                WHERE document_id = ${id}
                                  AND reason = 'snapshot'
                                  AND id NOT IN (
                                    SELECT id FROM document_versions
                                    WHERE document_id = ${id} AND reason = 'snapshot'
                                    ORDER BY created_at DESC, version DESC
                                    LIMIT ${DOCUMENT_SNAPSHOT_RETENTION}
                                  )
                            `);
                        }
                    }
                }

                return this.toDocumentDto(
                    {
                        ...current,
                        title: updatedTitle,
                        currentBody: updatedBody,
                        notebookId: nextNotebookId,
                        isFavorite: updatedIsFavorite,
                        color: input.color ?? current.color,
                        isHomeFixed: input.isHomeFixed ?? current.isHomeFixed,
                        homeSortOrder: input.homeSortOrder ??
                            current.homeSortOrder,
                        currentVersion: nextVersion,
                        updatedAt: currentTime,
                    },
                    nextNotebookName,
                );
            });
        });
        this.events.emit(userId, {
            documentId: id,
            version: result.version,
            updatedAt: result.updatedAt,
        });
        return result;
    }

    async softDelete(
        userId: string,
        id: string,
        version: number,
    ): Promise<void> {
        if (
            typeof version !== "number" ||
            !Number.isInteger(version) ||
            version < 1
        ) {
            throw new DocumentValidationError("版本号必须是正整数");
        }

        const event = await this.store.run(async (db) => {
            return await db.transaction(async (tx) => {
                const existingRows = await tx
                    .select({
                        doc: documents,
                        notebookName: documentNotebooks.name,
                    })
                    .from(documents)
                    .leftJoin(
                        documentNotebooks,
                        eq(documents.notebookId, documentNotebooks.id),
                    )
                    .where(
                        and(
                            eq(documents.id, id),
                            eq(documents.userId, userId),
                            sql`${documents.deletedAt} IS NULL`,
                        ),
                    )
                    .limit(1);

                if (existingRows.length === 0) {
                    throw new DocumentNotFoundError();
                }

                const current = existingRows[0].doc;
                if (current.currentVersion !== version) {
                    throw new DocumentConflictError(
                        this.toDocumentDto(
                            current,
                            existingRows[0].notebookName,
                        ),
                    );
                }

                const currentTime = this.now();
                await tx
                    .update(documents)
                    .set({
                        deletedAt: currentTime,
                        currentVersion: current.currentVersion + 1,
                        updatedAt: currentTime,
                    })
                    .where(
                        and(
                            eq(documents.id, id),
                            eq(documents.userId, userId),
                            eq(documents.currentVersion, version),
                            sql`${documents.deletedAt} IS NULL`,
                        ),
                    )
                    .run();
                return {
                    documentId: id,
                    version: current.currentVersion + 1,
                    updatedAt: currentTime,
                };
            });
        });
        this.events.emit(userId, event);
    }

    async restore(userId: string, id: string): Promise<DocumentDto> {
        const result = await this.store.run(async (db) => {
            return await db.transaction(async (tx) => {
                const existingRows = await tx
                    .select({
                        doc: documents,
                        notebookName: documentNotebooks.name,
                    })
                    .from(documents)
                    .leftJoin(
                        documentNotebooks,
                        eq(documents.notebookId, documentNotebooks.id),
                    )
                    .where(
                        and(
                            eq(documents.id, id),
                            eq(documents.userId, userId),
                        ),
                    )
                    .limit(1);

                if (existingRows.length === 0) {
                    throw new DocumentNotFoundError();
                }

                const current = existingRows[0].doc;
                let finalNotebookId = current.notebookId;
                let finalNotebookName = existingRows[0].notebookName;

                if (finalNotebookId !== null) {
                    const nbRows = await tx
                        .select({ name: documentNotebooks.name })
                        .from(documentNotebooks)
                        .where(
                            and(
                                eq(documentNotebooks.id, finalNotebookId),
                                eq(documentNotebooks.userId, userId),
                            ),
                        )
                        .limit(1);
                    if (nbRows.length === 0) {
                        finalNotebookId = null;
                        finalNotebookName = null;
                    } else {
                        finalNotebookName = nbRows[0].name;
                    }
                }

                const currentTime = this.now();
                await tx
                    .update(documents)
                    .set({
                        deletedAt: null,
                        notebookId: finalNotebookId,
                        updatedAt: currentTime,
                        currentVersion: current.currentVersion + 1,
                    })
                    .where(
                        and(
                            eq(documents.id, id),
                            eq(documents.userId, userId),
                        ),
                    )
                    .run();

                return this.toDocumentDto(
                    {
                        ...current,
                        deletedAt: null,
                        notebookId: finalNotebookId,
                        updatedAt: currentTime,
                        currentVersion: current.currentVersion + 1,
                    },
                    finalNotebookName,
                );
            });
        });
        this.events.emit(userId, {
            documentId: id,
            version: result.version,
            updatedAt: result.updatedAt,
        });
        return result;
    }

    async permanentDelete(
        userId: string,
        id: string,
        version?: number,
    ): Promise<void> {
        if (version !== undefined) {
            if (
                typeof version !== "number" ||
                !Number.isInteger(version) ||
                version < 1
            ) {
                throw new DocumentValidationError("版本号必须是正整数");
            }
        }

        const event = await this.store.run(async (db) => {
            return await db.transaction(async (tx) => {
                const existingRows = await tx
                    .select({
                        doc: documents,
                        notebookName: documentNotebooks.name,
                    })
                    .from(documents)
                    .leftJoin(
                        documentNotebooks,
                        eq(documents.notebookId, documentNotebooks.id),
                    )
                    .where(
                        and(
                            eq(documents.id, id),
                            eq(documents.userId, userId),
                        ),
                    )
                    .limit(1);

                if (existingRows.length === 0) {
                    throw new DocumentNotFoundError();
                }

                const current = existingRows[0].doc;
                if (
                    version !== undefined && current.currentVersion !== version
                ) {
                    throw new DocumentConflictError(
                        this.toDocumentDto(
                            current,
                            existingRows[0].notebookName,
                        ),
                    );
                }

                await tx
                    .delete(documents)
                    .where(
                        and(
                            eq(documents.id, id),
                            eq(documents.userId, userId),
                        ),
                    )
                    .run();
                return {
                    documentId: id,
                    version: current.currentVersion + 1,
                    updatedAt: this.now(),
                };
            });
        });
        this.events.emit(userId, event);
    }

    async versions(userId: string, id: string): Promise<DocumentVersionDto[]> {
        return await this.store.run(async (db) => {
            const docExists = await db
                .select({ id: documents.id })
                .from(documents)
                .where(
                    and(
                        eq(documents.id, id),
                        eq(documents.userId, userId),
                    ),
                )
                .limit(1);

            if (docExists.length === 0) {
                throw new DocumentNotFoundError();
            }

            const rows = await db
                .select()
                .from(documentVersions)
                .where(
                    and(
                        eq(documentVersions.documentId, id),
                        eq(documentVersions.userId, userId),
                    ),
                )
                .orderBy(desc(documentVersions.version));

            return rows.map((r) => ({
                id: r.id,
                documentId: r.documentId,
                version: r.version,
                title: r.title,
                body: r.body,
                reason: r.reason as DocumentVersionReason,
                createdAt: r.createdAt,
            }));
        });
    }

    async restoreVersion(
        userId: string,
        id: string,
        targetVersion: number,
        version: number,
    ): Promise<DocumentDto> {
        if (
            typeof version !== "number" ||
            !Number.isInteger(version) ||
            version < 1
        ) {
            throw new DocumentValidationError("版本号必须是正整数");
        }
        if (
            typeof targetVersion !== "number" ||
            !Number.isInteger(targetVersion) ||
            targetVersion < 1
        ) {
            throw new DocumentValidationError("目标版本号必须是正整数");
        }

        const result = await this.store.run(async (db) => {
            return await db.transaction(async (tx) => {
                const existingRows = await tx
                    .select({
                        doc: documents,
                        notebookName: documentNotebooks.name,
                    })
                    .from(documents)
                    .leftJoin(
                        documentNotebooks,
                        eq(documents.notebookId, documentNotebooks.id),
                    )
                    .where(
                        and(
                            eq(documents.id, id),
                            eq(documents.userId, userId),
                            sql`${documents.deletedAt} IS NULL`,
                        ),
                    )
                    .limit(1);

                if (existingRows.length === 0) {
                    throw new DocumentNotFoundError();
                }

                const current = existingRows[0].doc;
                const currentNotebookName = existingRows[0].notebookName;

                if (current.currentVersion !== version) {
                    throw new DocumentConflictError(
                        this.toDocumentDto(current, currentNotebookName),
                    );
                }

                const targetRows = await tx
                    .select()
                    .from(documentVersions)
                    .where(
                        and(
                            eq(documentVersions.documentId, id),
                            eq(documentVersions.userId, userId),
                            eq(documentVersions.version, targetVersion),
                        ),
                    )
                    .limit(1);

                if (targetRows.length === 0) {
                    throw new DocumentNotFoundError("指定历史版本不存在");
                }

                const target = targetRows[0];
                const currentTime = this.now();
                const nextVersion = current.currentVersion + 1;

                await tx
                    .update(documents)
                    .set({
                        title: target.title,
                        currentBody: target.body,
                        currentVersion: nextVersion,
                        updatedAt: currentTime,
                    })
                    .where(
                        and(
                            eq(documents.id, id),
                            eq(documents.userId, userId),
                            eq(documents.currentVersion, version),
                        ),
                    )
                    .run();

                await tx.insert(documentVersions).values({
                    id: crypto.randomUUID(),
                    documentId: id,
                    userId,
                    version: nextVersion,
                    title: target.title,
                    body: target.body,
                    reason: "restore",
                    createdAt: currentTime,
                }).run();

                return this.toDocumentDto(
                    {
                        ...current,
                        title: target.title,
                        currentBody: target.body,
                        currentVersion: nextVersion,
                        updatedAt: currentTime,
                    },
                    currentNotebookName,
                );
            });
        });
        this.events.emit(userId, {
            documentId: id,
            version: result.version,
            updatedAt: result.updatedAt,
        });
        return result;
    }

    async list(
        userId: string,
        input: DocumentListInput = {},
    ): Promise<DocumentPageDto> {
        const limit = this.validateLimit(input.limit);
        const scope = input.scope ?? { type: "all" };
        const scopeKey = scopeToKey(scope);

        let cursorPayload: ListCursorPayload | null = null;
        if (input.cursor) {
            cursorPayload = decodeCursor<ListCursorPayload>(input.cursor);
            if (
                !cursorPayload ||
                typeof cursorPayload !== "object" ||
                cursorPayload.u !== userId ||
                cursorPayload.s !== scopeKey ||
                !cursorPayload.v ||
                typeof cursorPayload.v.upd !== "number" ||
                typeof cursorPayload.v.id !== "string"
            ) {
                throw new DocumentValidationError("无效的游标");
            }
            if (
                scope.type === "all" &&
                typeof cursorPayload.v.fav !== "number"
            ) {
                throw new DocumentValidationError("无效的游标");
            }
            if (
                scope.type === "home" &&
                (typeof cursorPayload.v.home !== "number" ||
                    typeof cursorPayload.v.created !== "number")
            ) {
                throw new DocumentValidationError("无效的游标");
            }
        }

        return await this.store.run(async (db) => {
            const baseWhere = and(
                eq(documents.userId, userId),
                sql`${documents.deletedAt} IS NULL`,
                scope.type === "home"
                    ? eq(documents.isHomeFixed, true)
                    : undefined,
                scope.type === "favorite"
                    ? eq(documents.isFavorite, true)
                    : scope.type === "notebook"
                    ? eq(documents.notebookId, scope.notebookId)
                    : undefined,
            );

            let cursorCondition = undefined;
            if (cursorPayload) {
                const { fav, home, created, upd, id } = cursorPayload.v;
                if (
                    scope.type === "home" && home !== undefined &&
                    created !== undefined
                ) {
                    cursorCondition = or(
                        gt(documents.homeSortOrder, home),
                        and(
                            eq(documents.homeSortOrder, home),
                            or(
                                gt(documents.createdAt, created),
                                and(
                                    eq(documents.createdAt, created),
                                    gt(documents.id, id),
                                ),
                            ),
                        ),
                    );
                } else if (scope.type === "all" && fav !== undefined) {
                    cursorCondition = or(
                        lt(
                            sql<number>`CASE WHEN ${documents.isFavorite} THEN 1 ELSE 0 END`,
                            fav,
                        ),
                        and(
                            eq(
                                sql<number>`CASE WHEN ${documents.isFavorite} THEN 1 ELSE 0 END`,
                                fav,
                            ),
                            lt(documents.updatedAt, upd),
                        ),
                        and(
                            eq(
                                sql<number>`CASE WHEN ${documents.isFavorite} THEN 1 ELSE 0 END`,
                                fav,
                            ),
                            eq(documents.updatedAt, upd),
                            lt(documents.id, id),
                        ),
                    );
                } else {
                    cursorCondition = or(
                        lt(documents.updatedAt, upd),
                        and(
                            eq(documents.updatedAt, upd),
                            lt(documents.id, id),
                        ),
                    );
                }
            }

            const query = db
                .select({
                    id: documents.id,
                    title: documents.title,
                    notebookId: documents.notebookId,
                    notebookName: documentNotebooks.name,
                    isFavorite: documents.isFavorite,
                    color: documents.color,
                    isHomeFixed: documents.isHomeFixed,
                    homeSortOrder: documents.homeSortOrder,
                    createdAt: documents.createdAt,
                    updatedAt: documents.updatedAt,
                    bodyPreview: sql<
                        string
                    >`CASE WHEN length(trim(coalesce(${documents.title}, ''), ${TITLE_WHITESPACE})) = 0 THEN ${documents.currentBody} ELSE substr(${documents.currentBody}, 1, 300) END`
                        .as(
                            "body_preview",
                        ),
                })
                .from(documents)
                .leftJoin(
                    documentNotebooks,
                    eq(documents.notebookId, documentNotebooks.id),
                )
                .where(and(baseWhere, cursorCondition));

            const order = scope.type === "home"
                ? [
                    asc(documents.homeSortOrder),
                    asc(documents.createdAt),
                    asc(documents.id),
                ]
                : [
                    ...(scope.type === "all"
                        ? [desc(documents.isFavorite)]
                        : []),
                    desc(documents.updatedAt),
                    desc(documents.id),
                ];
            const orderedQuery = query.orderBy(...order);

            const rows = await orderedQuery.limit(limit + 1);

            const hasNextPage = rows.length > limit;
            const items = hasNextPage ? rows.slice(0, limit) : rows;

            let nextCursor: string | null = null;
            if (hasNextPage && items.length > 0) {
                const last = items[items.length - 1];
                const nextPayload: ListCursorPayload = {
                    u: userId,
                    s: scopeKey,
                    v: {
                        ...(scope.type === "all"
                            ? { fav: last.isFavorite ? 1 : 0 }
                            : {}),
                        ...(scope.type === "home"
                            ? {
                                home: last.homeSortOrder,
                                created: last.createdAt,
                            }
                            : {}),
                        upd: last.updatedAt,
                        id: last.id,
                    },
                };
                nextCursor = encodeCursor(nextPayload);
            }

            return {
                items: items.map((r) => this.toSummaryDto(r)),
                nextCursor,
            };
        });
    }

    async listTrash(
        userId: string,
        input: { limit?: number; cursor?: string } = {},
    ): Promise<DocumentPageDto> {
        const limit = this.validateLimit(input.limit);
        const scopeKey = "trash";

        let cursorPayload: ListCursorPayload | null = null;
        if (input.cursor) {
            cursorPayload = decodeCursor<ListCursorPayload>(input.cursor);
            if (
                !cursorPayload ||
                typeof cursorPayload !== "object" ||
                cursorPayload.u !== userId ||
                cursorPayload.s !== scopeKey ||
                !cursorPayload.v ||
                typeof cursorPayload.v.upd !== "number" ||
                typeof cursorPayload.v.id !== "string"
            ) {
                throw new DocumentValidationError("无效的游标");
            }
        }

        return await this.store.run(async (db) => {
            const baseWhere = and(
                eq(documents.userId, userId),
                sql`${documents.deletedAt} IS NOT NULL`,
            );

            let cursorCondition = undefined;
            if (cursorPayload) {
                const { upd, id } = cursorPayload.v;
                cursorCondition = or(
                    lt(documents.updatedAt, upd),
                    and(
                        eq(documents.updatedAt, upd),
                        lt(documents.id, id),
                    ),
                );
            }

            const rows = await db
                .select({
                    id: documents.id,
                    title: documents.title,
                    notebookId: documents.notebookId,
                    notebookName: documentNotebooks.name,
                    isFavorite: documents.isFavorite,
                    color: documents.color,
                    isHomeFixed: documents.isHomeFixed,
                    homeSortOrder: documents.homeSortOrder,
                    createdAt: documents.createdAt,
                    updatedAt: documents.updatedAt,
                    bodyPreview: sql<
                        string
                    >`CASE WHEN length(trim(coalesce(${documents.title}, ''), ${TITLE_WHITESPACE})) = 0 THEN ${documents.currentBody} ELSE substr(${documents.currentBody}, 1, 300) END`
                        .as(
                            "body_preview",
                        ),
                })
                .from(documents)
                .leftJoin(
                    documentNotebooks,
                    eq(documents.notebookId, documentNotebooks.id),
                )
                .where(and(baseWhere, cursorCondition))
                .orderBy(desc(documents.updatedAt), desc(documents.id))
                .limit(limit + 1);

            const hasNextPage = rows.length > limit;
            const items = hasNextPage ? rows.slice(0, limit) : rows;

            let nextCursor: string | null = null;
            if (hasNextPage && items.length > 0) {
                const last = items[items.length - 1];
                const nextPayload: ListCursorPayload = {
                    u: userId,
                    s: scopeKey,
                    v: {
                        upd: last.updatedAt,
                        id: last.id,
                    },
                };
                nextCursor = encodeCursor(nextPayload);
            }

            return {
                items: items.map((r) => this.toSummaryDto(r)),
                nextCursor,
            };
        });
    }

    async search(
        userId: string,
        q: string,
        input: { limit?: number; cursor?: string } = {},
    ): Promise<DocumentPageDto> {
        const limit = this.validateLimit(input.limit);
        const cleanQuery = q.trim();

        if (cleanQuery.length === 0) {
            return { items: [], nextCursor: null };
        }

        const terms = parseSearchTerms(cleanQuery);

        let cursorPayload: SearchCursorPayload | null = null;
        if (input.cursor) {
            cursorPayload = decodeCursor<SearchCursorPayload>(input.cursor);
            if (
                !cursorPayload ||
                typeof cursorPayload !== "object" ||
                cursorPayload.u !== userId ||
                cursorPayload.q !== cleanQuery ||
                !cursorPayload.v ||
                typeof cursorPayload.v.rank !== "number" ||
                typeof cursorPayload.v.id !== "string"
            ) {
                throw new DocumentValidationError("无效的游标");
            }
        }

        return await this.store.run(async (db) => {
            // MATCH results rank by bm25 (lower is better); scan-only results by recency.
            const scanTitleHit = (term: string) =>
                sql`instr(lower(coalesce(d.title, '')), lower(${term})) > 0`;
            const scanHit = (term: string) =>
                sql`(${
                    scanTitleHit(term)
                } OR instr(lower(d.current_body), lower(${term})) > 0)`;
            const scanTitleBonus = terms.scan.length > 0
                ? sql`CASE WHEN ${
                    sql.join(terms.scan.map(scanTitleHit), sql` AND `)
                } THEN ${SCAN_TITLE_HIT_BONUS} ELSE 0 END`
                : sql`0`;
            const rankExpr = terms.match !== null
                ? sql`documents_fts.rank`
                : sql`(-d.updated_at - ${scanTitleBonus})`;
            const scanSql = terms.scan.length > 0
                ? sql` AND ${sql.join(terms.scan.map(scanHit), sql` AND `)}`
                : sql``;
            const sourceSql = terms.match !== null
                ? sql`FROM documents_fts
                JOIN documents d ON d.id = documents_fts.document_id
                LEFT JOIN document_notebooks nb ON nb.id = d.notebook_id
                WHERE documents_fts MATCH ${terms.match}
                  AND documents_fts.user_id = ${userId}`
                : sql`FROM documents d
                LEFT JOIN document_notebooks nb ON nb.id = d.notebook_id
                WHERE d.user_id = ${userId}`;
            let cursorSql = sql``;
            if (cursorPayload) {
                const { rank, id } = cursorPayload.v;
                cursorSql = sql`
                    AND (${rankExpr} > ${rank} OR (${rankExpr} = ${rank} AND d.id < ${id}))
                `;
            }

            const querySql = sql`
                SELECT
                    d.id,
                    d.title,
                    d.notebook_id,
                    d.is_favorite,
                    d.color,
                    d.is_home_fixed,
                    d.home_sort_order,
                    d.created_at,
                    d.updated_at,
                    CASE WHEN length(trim(coalesce(d.title, ''), ${TITLE_WHITESPACE})) = 0 THEN d.current_body ELSE substr(d.current_body, 1, 300) END AS body_preview,
                    nb.name AS notebook_name,
                    ${rankExpr} AS rank
                ${sourceSql}
                  AND d.deleted_at IS NULL
                  ${scanSql}
                  ${cursorSql}
                ORDER BY rank ASC, d.id DESC
                LIMIT ${limit + 1}
            `;

            type RawRow = [
                string,
                string | null,
                string | null,
                number,
                DocumentColor,
                number,
                number,
                number,
                number,
                string,
                string | null,
                number,
            ];

            const rawRows = await db.all<RawRow>(querySql);
            const rows = rawRows.map((r) => ({
                id: String(r[0]),
                title: r[1] === null ? null : String(r[1]),
                notebookId: r[2] ? String(r[2]) : null,
                isFavorite: Boolean(r[3]),
                color: r[4],
                isHomeFixed: Boolean(r[5]),
                homeSortOrder: Number(r[6]),
                createdAt: Number(r[7]),
                updatedAt: Number(r[8]),
                bodyPreview: String(r[9] ?? ""),
                notebookName: r[10] ? String(r[10]) : null,
                rank: Number(r[11]),
            }));

            const hasNextPage = rows.length > limit;
            const items = hasNextPage ? rows.slice(0, limit) : rows;

            let nextCursor: string | null = null;
            if (hasNextPage && items.length > 0) {
                const last = items[items.length - 1];
                const nextPayload: SearchCursorPayload = {
                    u: userId,
                    q: cleanQuery,
                    v: {
                        rank: last.rank,
                        id: last.id,
                    },
                };
                nextCursor = encodeCursor(nextPayload);
            }

            return {
                items: items.map((r) => this.toSummaryDto(r)),
                nextCursor,
            };
        });
    }
}
