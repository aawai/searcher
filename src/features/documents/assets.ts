import { Buffer } from "node:buffer";
import { and, eq } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { documentAssets, documents } from "../../db/schema.ts";
import {
    DOCUMENT_ASSET_MAX_BYTES,
    type DocumentAssetDto,
} from "../../shared/documents.ts";
import { validateRasterMagicBytes } from "../wallpaper/service.ts";
import { DocumentNotFoundError, DocumentValidationError } from "./errors.ts";
import { documentAssetReferences } from "./markdown.ts";

const ALLOWED_MIME_TYPES: Record<string, true> = {
    "image/png": true,
    "image/jpeg": true,
    "image/webp": true,
};

async function computeSha256(bytes: Uint8Array): Promise<string> {
    const input = bytes.buffer instanceof ArrayBuffer
        ? bytes as Uint8Array<ArrayBuffer>
        : new Uint8Array(bytes);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
    let hash = "";
    for (const byte of digest) {
        hash += byte.toString(16).padStart(2, "0");
    }
    return hash;
}

export interface UploadAssetInput {
    bytes: Uint8Array;
    mimeType: string;
    originalName: string;
}

export interface ReadAssetResult {
    asset: DocumentAssetDto;
    bytes: Uint8Array<ArrayBuffer>;
}

export class DocumentAssetsService {
    constructor(
        private readonly store: DatabaseStore,
        private readonly now: () => number = Date.now,
    ) {}

    async upload(
        userId: string,
        documentId: string,
        input: UploadAssetInput,
    ): Promise<DocumentAssetDto> {
        if (!input.bytes || !(input.bytes instanceof Uint8Array)) {
            throw new DocumentValidationError("无效的文件内容");
        }

        const byteSize = input.bytes.length;
        if (byteSize < 1 || byteSize > DOCUMENT_ASSET_MAX_BYTES) {
            throw new DocumentValidationError(
                `图片大小必须在 1 字节至 10 MiB 之间，当前为 ${byteSize} 字节`,
            );
        }

        if (!ALLOWED_MIME_TYPES[input.mimeType]) {
            throw new DocumentValidationError(
                "仅支持 PNG、JPEG 或 WebP 格式图片",
            );
        }

        const raster = validateRasterMagicBytes(input.bytes);
        if (!raster.valid) {
            throw new DocumentValidationError(
                `图片内容不是合法的栅格图片: ${raster.reason}`,
            );
        }

        if (raster.contentType !== input.mimeType) {
            throw new DocumentValidationError(
                `图片内容与声明的 MIME 类型不符: 声明为 ${input.mimeType}，实际为 ${raster.contentType}`,
            );
        }

        const originalName = (input.originalName ?? "").trim();
        if (!originalName) {
            throw new DocumentValidationError("文件名不能为空");
        }

        const sha256 = await computeSha256(input.bytes);

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

            const id = crypto.randomUUID();
            const now = this.now();
            const storageRef = `sqlite:${id}`;
            const dataBuffer = Buffer.isBuffer(input.bytes)
                ? input.bytes
                : Buffer.from(
                    input.bytes.buffer,
                    input.bytes.byteOffset,
                    input.bytes.byteLength,
                );

            const mimeType = input.mimeType as DocumentAssetDto["mimeType"];

            await db.insert(documentAssets).values({
                id,
                documentId,
                userId,
                mimeType,
                byteSize,
                sha256,
                originalName,
                storageRef,
                data: dataBuffer,
                createdAt: now,
            });

            return {
                assetId: id,
                documentId,
                mimeType,
                byteSize,
                sha256,
                originalName,
                createdAt: now,
            };
        });
    }

    async read(
        userId: string,
        documentId: string,
        assetId: string,
    ): Promise<ReadAssetResult> {
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

            const assetRows = await db
                .select()
                .from(documentAssets)
                .where(
                    and(
                        eq(documentAssets.id, assetId),
                        eq(documentAssets.documentId, documentId),
                        eq(documentAssets.userId, userId),
                    ),
                )
                .limit(1);

            if (assetRows.length === 0) {
                throw new DocumentNotFoundError("资产不存在");
            }

            const row = assetRows[0];
            if (!(row.data.buffer instanceof ArrayBuffer)) {
                throw new Error("SQLite asset buffer must be an ArrayBuffer");
            }
            const bytes = new Uint8Array(
                row.data.buffer,
                row.data.byteOffset,
                row.data.byteLength,
            );

            return {
                asset: {
                    assetId: row.id,
                    documentId: row.documentId,
                    mimeType: row.mimeType,
                    byteSize: row.byteSize,
                    sha256: row.sha256,
                    originalName: row.originalName,
                    createdAt: row.createdAt,
                },
                bytes,
            };
        });
    }

    async delete(
        userId: string,
        documentId: string,
        assetId: string,
    ): Promise<void> {
        await this.store.run(async (db) => {
            await db.transaction(async (tx) => {
                const docRows = await tx
                    .select({
                        id: documents.id,
                        currentBody: documents.currentBody,
                        deletedAt: documents.deletedAt,
                    })
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

                const doc = docRows[0];
                const references = documentAssetReferences(doc.currentBody);
                if (references.has(assetId)) {
                    throw new DocumentValidationError(
                        "无法删除正在被笔记引用的资产",
                    );
                }

                const assetRows = await tx
                    .select({ id: documentAssets.id })
                    .from(documentAssets)
                    .where(
                        and(
                            eq(documentAssets.id, assetId),
                            eq(documentAssets.documentId, documentId),
                            eq(documentAssets.userId, userId),
                        ),
                    )
                    .limit(1);

                if (assetRows.length === 0) {
                    throw new DocumentNotFoundError("资产不存在");
                }

                await tx
                    .delete(documentAssets)
                    .where(
                        and(
                            eq(documentAssets.id, assetId),
                            eq(documentAssets.documentId, documentId),
                            eq(documentAssets.userId, userId),
                        ),
                    );
            });
        });
    }
}
