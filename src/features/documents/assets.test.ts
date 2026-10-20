import { assertEquals, assertRejects } from "@std/assert";
import { eq } from "drizzle-orm";
import { DatabaseStore, openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { documentAssets, documents, users } from "../../db/schema.ts";
import { DOCUMENT_ASSET_MAX_BYTES } from "../../shared/documents.ts";
import { DocumentAssetsService } from "./assets.ts";
import { DocumentNotFoundError, DocumentValidationError } from "./errors.ts";

const VALID_PNG_HEADER = new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0x00,
    0x00,
    0x00,
    0x0d,
    0x49,
    0x48,
    0x44,
    0x52,
]);

const VALID_JPEG_HEADER = new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x01,
    0x00,
    0x48,
]);

const VALID_WEBP_HEADER = new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46,
    0x24,
    0x00,
    0x00,
    0x00,
    0x57,
    0x45,
    0x42,
    0x50,
    0x56,
    0x50,
    0x38,
    0x20,
]);

async function setupTestDb(): Promise<DatabaseStore> {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    return store;
}

async function createTestUser(
    store: DatabaseStore,
    userId: string,
    username = userId,
): Promise<void> {
    await store.run(async (db) => {
        await db.insert(users).values({
            id: userId,
            username,
            displayName: `User ${userId}`,
            passwordHash: "hash-value",
            createdAt: 1000,
            updatedAt: 1000,
        });
    });
}

async function createTestDocument(
    store: DatabaseStore,
    params: {
        id: string;
        userId: string;
        title?: string;
        body?: string;
        deletedAt?: number | null;
    },
): Promise<void> {
    await store.run(async (db) => {
        await db.insert(documents).values({
            id: params.id,
            userId: params.userId,
            title: params.title ?? "Test Document",
            currentBody: params.body ?? "Initial document body",
            currentVersion: 1,
            deletedAt: params.deletedAt ?? null,
            createdAt: 1000,
            updatedAt: 1000,
        });
    });
}

Deno.test({
    name:
        "assets: upload and read round-trip (opaque storageRef, sha256 and bytes)",
    async fn() {
        const store = await setupTestDb();
        try {
            await createTestUser(store, "user-1");
            await createTestDocument(store, { id: "doc-1", userId: "user-1" });

            const service = new DocumentAssetsService(store, () => 4000);
            const uploadDto = await service.upload("user-1", "doc-1", {
                bytes: VALID_PNG_HEADER,
                mimeType: "image/png",
                originalName: " diagram.png ",
            });

            // 1. DTO structure checks (does NOT expose storageRef or data)
            assertEquals(uploadDto.documentId, "doc-1");
            assertEquals(uploadDto.mimeType, "image/png");
            assertEquals(uploadDto.byteSize, VALID_PNG_HEADER.length);
            assertEquals(uploadDto.originalName, "diagram.png");
            assertEquals(uploadDto.createdAt, 4000);
            assertEquals(typeof uploadDto.sha256, "string");
            assertEquals(uploadDto.sha256.length, 64);
            // Verify storageRef is NOT a property of returned DTO
            assertEquals(
                "storageRef" in
                    (uploadDto as unknown as Record<string, unknown>),
                false,
            );
            assertEquals(
                "data" in (uploadDto as unknown as Record<string, unknown>),
                false,
            );

            // 2. Check internal DB storage
            const inDb = await store.run(async (db) =>
                await db
                    .select()
                    .from(documentAssets)
                    .where(eq(documentAssets.id, uploadDto.assetId))
            );
            assertEquals(inDb.length, 1);
            assertEquals(inDb[0].storageRef, `sqlite:${uploadDto.assetId}`);
            assertEquals(inDb[0].sha256, uploadDto.sha256);

            // 3. Read round-trip returns exact bytes and asset metadata
            const readResult = await service.read(
                "user-1",
                "doc-1",
                uploadDto.assetId,
            );
            assertEquals(readResult.asset, uploadDto);
            assertEquals(readResult.bytes, VALID_PNG_HEADER);
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "assets: owner and docbinding isolation (foreign user, cross-doc access, 404 hidden)",
    async fn() {
        const store = await setupTestDb();
        try {
            await createTestUser(store, "user-1");
            await createTestUser(store, "user-2");
            await createTestDocument(store, { id: "doc-A", userId: "user-1" });
            await createTestDocument(store, { id: "doc-B", userId: "user-1" });
            await createTestDocument(store, { id: "doc-C", userId: "user-2" });
            await createTestDocument(store, {
                id: "doc-trash",
                userId: "user-1",
                deletedAt: 3000,
            });

            const service = new DocumentAssetsService(store, () => 5000);
            const assetA = await service.upload("user-1", "doc-A", {
                bytes: VALID_PNG_HEADER,
                mimeType: "image/png",
                originalName: "a.png",
            });

            // 1. Upload to non-existent document -> 404
            await assertRejects(
                () =>
                    service.upload("user-1", "doc-non-existent", {
                        bytes: VALID_PNG_HEADER,
                        mimeType: "image/png",
                        originalName: "a.png",
                    }),
                DocumentNotFoundError,
            );

            // 2. Upload to foreign document -> 404
            await assertRejects(
                () =>
                    service.upload("user-1", "doc-C", {
                        bytes: VALID_PNG_HEADER,
                        mimeType: "image/png",
                        originalName: "a.png",
                    }),
                DocumentNotFoundError,
            );

            // 3. Upload to soft-deleted document -> 404
            await assertRejects(
                () =>
                    service.upload("user-1", "doc-trash", {
                        bytes: VALID_PNG_HEADER,
                        mimeType: "image/png",
                        originalName: "a.png",
                    }),
                DocumentNotFoundError,
            );

            // 4. Foreign user cannot read assetA
            await assertRejects(
                () => service.read("user-2", "doc-A", assetA.assetId),
                DocumentNotFoundError,
            );

            // 5. Cross-document access: asset belongs to doc-A, reading via doc-B -> 404
            await assertRejects(
                () => service.read("user-1", "doc-B", assetA.assetId),
                DocumentNotFoundError,
            );

            // 6. Foreign user cannot delete assetA
            await assertRejects(
                () => service.delete("user-2", "doc-A", assetA.assetId),
                DocumentNotFoundError,
            );

            // 7. Cross-document delete -> 404
            await assertRejects(
                () => service.delete("user-1", "doc-B", assetA.assetId),
                DocumentNotFoundError,
            );
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "assets: magic bytes validation (PNG, JPEG, WebP allowed; mismatch, SVG, GIF rejected)",
    async fn() {
        const store = await setupTestDb();
        try {
            await createTestUser(store, "user-1");
            await createTestDocument(store, {
                id: "doc-magic",
                userId: "user-1",
            });

            const service = new DocumentAssetsService(store, () => 6000);

            // 1. Valid JPEG
            const jpegAsset = await service.upload("user-1", "doc-magic", {
                bytes: VALID_JPEG_HEADER,
                mimeType: "image/jpeg",
                originalName: "photo.jpg",
            });
            assertEquals(jpegAsset.mimeType, "image/jpeg");

            // 2. Valid WebP
            const webpAsset = await service.upload("user-1", "doc-magic", {
                bytes: VALID_WEBP_HEADER,
                mimeType: "image/webp",
                originalName: "graphic.webp",
            });
            assertEquals(webpAsset.mimeType, "image/webp");

            // 3. MIME mismatch: JPEG bytes declared as image/png
            await assertRejects(
                () =>
                    service.upload("user-1", "doc-magic", {
                        bytes: VALID_JPEG_HEADER,
                        mimeType: "image/png",
                        originalName: "fake.png",
                    }),
                DocumentValidationError,
                "图片内容与声明的 MIME 类型不符",
            );

            // 4. SVG (XML text) rejected
            const svgBytes = new TextEncoder().encode(
                `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect/></svg>`,
            );
            await assertRejects(
                () =>
                    service.upload("user-1", "doc-magic", {
                        bytes: svgBytes,
                        mimeType: "image/png",
                        originalName: "vector.png",
                    }),
                DocumentValidationError,
            );

            // 5. GIF rejected (even if declared as png)
            const gifBytes = new Uint8Array([
                0x47,
                0x49,
                0x46,
                0x38,
                0x39,
                0x61,
                0x01,
                0x00,
                0x01,
                0x00,
                0x80,
                0x00,
            ]);
            await assertRejects(
                () =>
                    service.upload("user-1", "doc-magic", {
                        bytes: gifBytes,
                        mimeType: "image/png",
                        originalName: "anim.png",
                    }),
                DocumentValidationError,
            );

            // 6. Declared MIME unsupported (image/gif, image/svg+xml, image/avif)
            await assertRejects(
                () =>
                    service.upload("user-1", "doc-magic", {
                        bytes: gifBytes,
                        mimeType: "image/gif",
                        originalName: "anim.gif",
                    }),
                DocumentValidationError,
                "仅支持 PNG、JPEG 或 WebP 格式图片",
            );
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "assets: 10 MiB boundary checks (0 bytes, exact 10 MiB allowed, 10 MiB + 1 byte rejected)",
    async fn() {
        const store = await setupTestDb();
        try {
            await createTestUser(store, "user-1");
            await createTestDocument(store, {
                id: "doc-size",
                userId: "user-1",
            });

            const service = new DocumentAssetsService(store, () => 7000);

            // 1. 0 bytes rejected
            await assertRejects(
                () =>
                    service.upload("user-1", "doc-size", {
                        bytes: new Uint8Array(0),
                        mimeType: "image/png",
                        originalName: "empty.png",
                    }),
                DocumentValidationError,
                "图片大小必须在 1 字节至 10 MiB 之间",
            );

            // 2. Exactly 10 MiB (10485760 bytes) with PNG header allowed
            const exact10MiB = new Uint8Array(DOCUMENT_ASSET_MAX_BYTES);
            exact10MiB.set(VALID_PNG_HEADER, 0);

            const asset10MiB = await service.upload("user-1", "doc-size", {
                bytes: exact10MiB,
                mimeType: "image/png",
                originalName: "max-size.png",
            });
            assertEquals(asset10MiB.byteSize, DOCUMENT_ASSET_MAX_BYTES);

            // 3. 10 MiB + 1 byte rejected
            const oversized = new Uint8Array(DOCUMENT_ASSET_MAX_BYTES + 1);
            oversized.set(VALID_PNG_HEADER, 0);

            await assertRejects(
                () =>
                    service.upload("user-1", "doc-size", {
                        bytes: oversized,
                        mimeType: "image/png",
                        originalName: "too-large.png",
                    }),
                DocumentValidationError,
                "图片大小必须在 1 字节至 10 MiB 之间",
            );
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "assets: delete guards (inline image references block delete, code/text allowed, orphan allowed)",
    async fn() {
        const store = await setupTestDb();
        try {
            await createTestUser(store, "user-1");
            await createTestDocument(store, {
                id: "doc-ref",
                userId: "user-1",
                body: "Empty body initially",
            });

            const service = new DocumentAssetsService(store, () => 8000);

            // Upload 4 assets
            const assetInline = await service.upload("user-1", "doc-ref", {
                bytes: VALID_PNG_HEADER,
                mimeType: "image/png",
                originalName: "inline.png",
            });
            const assetDef = await service.upload("user-1", "doc-ref", {
                bytes: VALID_PNG_HEADER,
                mimeType: "image/png",
                originalName: "def.png",
            });
            const assetCode = await service.upload("user-1", "doc-ref", {
                bytes: VALID_PNG_HEADER,
                mimeType: "image/png",
                originalName: "code.png",
            });
            const assetOrphan = await service.upload("user-1", "doc-ref", {
                bytes: VALID_PNG_HEADER,
                mimeType: "image/png",
                originalName: "orphan.png",
            });

            // Update document body:
            // - assetInline is referenced via ![photo](asset://<id>)
            // - assetDef is referenced via ![ref][fig] and [fig]: asset://<id>
            // - assetCode is only mentioned inside code block and inline code and raw text
            // - assetOrphan is not mentioned at all
            const markdownBody = `
# Title

Here is an inline image:
![Inline Photo](asset://${assetInline.assetId})

Here is a reference image:
![Ref Photo][fig1]

[fig1]: asset://${assetDef.assetId}

\`\`\`markdown
asset://${assetCode.assetId}
![fake in code](asset://${assetCode.assetId})
\`\`\`

Here is inline code: \`asset://${assetCode.assetId}\`
And plain text: See asset://${assetCode.assetId} for details.
`;

            await store.run(async (db) => {
                await db
                    .update(documents)
                    .set({ currentBody: markdownBody })
                    .where(eq(documents.id, "doc-ref"));
            });

            // 1. Deleting assetInline is rejected with DocumentValidationError
            await assertRejects(
                () => service.delete("user-1", "doc-ref", assetInline.assetId),
                DocumentValidationError,
                "无法删除正在被笔记引用的资产",
            );

            // 2. Deleting assetDef is rejected with DocumentValidationError
            await assertRejects(
                () => service.delete("user-1", "doc-ref", assetDef.assetId),
                DocumentValidationError,
                "无法删除正在被笔记引用的资产",
            );

            // 3. Deleting assetCode SUCCEEDS because it is only in code / text, not an image reference!
            await service.delete("user-1", "doc-ref", assetCode.assetId);
            await assertRejects(
                () => service.read("user-1", "doc-ref", assetCode.assetId),
                DocumentNotFoundError,
            );

            // 4. Deleting assetOrphan SUCCEEDS
            await service.delete("user-1", "doc-ref", assetOrphan.assetId);
            await assertRejects(
                () => service.read("user-1", "doc-ref", assetOrphan.assetId),
                DocumentNotFoundError,
            );

            // 5. Remove assetInline from body, now deleting it SUCCEEDS
            await store.run(async (db) => {
                await db
                    .update(documents)
                    .set({ currentBody: "# No images now" })
                    .where(eq(documents.id, "doc-ref"));
            });

            await service.delete("user-1", "doc-ref", assetInline.assetId);
            await assertRejects(
                () => service.read("user-1", "doc-ref", assetInline.assetId),
                DocumentNotFoundError,
            );
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name: "assets: trash retention vs permanent deletion cascade",
    async fn() {
        const store = await setupTestDb();
        try {
            await createTestUser(store, "user-1");
            await createTestDocument(store, {
                id: "doc-trash-test",
                userId: "user-1",
            });

            const service = new DocumentAssetsService(store, () => 9000);
            const asset = await service.upload("user-1", "doc-trash-test", {
                bytes: VALID_PNG_HEADER,
                mimeType: "image/png",
                originalName: "trash-item.png",
            });

            // 1. Soft-delete the document (moving to trash)
            await store.run(async (db) => {
                await db
                    .update(documents)
                    .set({ deletedAt: 9500 })
                    .where(eq(documents.id, "doc-trash-test"));
            });

            // Active API hides asset (404)
            await assertRejects(
                () => service.read("user-1", "doc-trash-test", asset.assetId),
                DocumentNotFoundError,
            );

            // But database retains the asset rows and bytes!
            const inDbWhileTrash = await store.run(async (db) =>
                await db
                    .select()
                    .from(documentAssets)
                    .where(eq(documentAssets.id, asset.assetId))
            );
            assertEquals(inDbWhileTrash.length, 1);
            assertEquals(
                inDbWhileTrash[0].data.length,
                VALID_PNG_HEADER.length,
            );

            // 2. Permanent deletion of document cascades to delete asset metadata + bytes
            await store.run(async (db) => {
                await db
                    .delete(documents)
                    .where(eq(documents.id, "doc-trash-test"));
            });

            const inDbAfterPermanent = await store.run(async (db) =>
                await db
                    .select()
                    .from(documentAssets)
                    .where(eq(documentAssets.id, asset.assetId))
            );
            assertEquals(inDbAfterPermanent.length, 0);
        } finally {
            await store.close();
        }
    },
});
