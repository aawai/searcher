import { assertEquals, assertRejects } from "@std/assert";
import { eq } from "drizzle-orm";
import { DatabaseStore, openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { documents, documentSettings, users } from "../../db/schema.ts";
import type { UpdateDocumentSettingsInput } from "../../shared/documents.ts";
import { DocumentNotFoundError, DocumentValidationError } from "./errors.ts";
import { DocumentSettingsService } from "./settings.ts";

async function setupTestDb() {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    return store;
}

async function createTestUser(
    store: DatabaseStore,
    userId: string,
    username = userId,
) {
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
        deletedAt?: number | null;
    },
) {
    await store.run(async (db) => {
        await db.insert(documents).values({
            id: params.id,
            userId: params.userId,
            title: params.title ?? "Test Document",
            currentBody: "Initial document body",
            currentVersion: 1,
            deletedAt: params.deletedAt ?? null,
            createdAt: 1000,
            updatedAt: 1000,
        });
    });
}

Deno.test({
    name:
        "settings: owner active 404 guard (missing, foreign user, soft deleted)",
    async fn() {
        const store = await setupTestDb();
        try {
            await createTestUser(store, "user-1");
            await createTestUser(store, "user-2");
            await createTestDocument(store, {
                id: "doc-active",
                userId: "user-1",
            });
            await createTestDocument(store, {
                id: "doc-deleted",
                userId: "user-1",
                deletedAt: 2000,
            });

            const service = new DocumentSettingsService(store, () => 3000);

            // 1. Missing document throws DocumentNotFoundError
            await assertRejects(
                () => service.get("user-1", "doc-non-existent"),
                DocumentNotFoundError,
            );
            await assertRejects(
                () =>
                    service.update("user-1", "doc-non-existent", {
                        paperSize: "a4",
                        orientation: "portrait",
                        marginTopMm: 20,
                        marginRightMm: 20,
                        marginBottomMm: 20,
                        marginLeftMm: 20,
                    }),
                DocumentNotFoundError,
            );

            // 2. Foreign owner throws DocumentNotFoundError (hides existence)
            await assertRejects(
                () => service.get("user-2", "doc-active"),
                DocumentNotFoundError,
            );
            await assertRejects(
                () =>
                    service.update("user-2", "doc-active", {
                        paperSize: "letter",
                        orientation: "landscape",
                        marginTopMm: 25,
                        marginRightMm: 25,
                        marginBottomMm: 25,
                        marginLeftMm: 25,
                    }),
                DocumentNotFoundError,
            );

            // 3. Soft-deleted document throws DocumentNotFoundError
            await assertRejects(
                () => service.get("user-1", "doc-deleted"),
                DocumentNotFoundError,
            );
            await assertRejects(
                () =>
                    service.update("user-1", "doc-deleted", {
                        paperSize: "a4",
                        orientation: "portrait",
                        marginTopMm: 20,
                        marginRightMm: 20,
                        marginBottomMm: 20,
                        marginLeftMm: 20,
                    }),
                DocumentNotFoundError,
            );
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "settings: lazy insertion of defaults on get and persistent update upsert",
    async fn() {
        const store = await setupTestDb();
        try {
            await createTestUser(store, "user-1");
            await createTestDocument(store, { id: "doc-1", userId: "user-1" });

            const service = new DocumentSettingsService(store, () => 5000);

            // 1. Initial get lazily inserts defaults
            const defaults = await service.get("user-1", "doc-1");
            assertEquals(defaults, {
                paperSize: "a4",
                orientation: "portrait",
                marginTopMm: 20,
                marginRightMm: 20,
                marginBottomMm: 20,
                marginLeftMm: 20,
                updatedAt: 5000,
            });

            // Verify row exists in DB
            const inDb = await store.run(async (db) =>
                await db
                    .select()
                    .from(documentSettings)
                    .where(eq(documentSettings.documentId, "doc-1"))
            );
            assertEquals(inDb.length, 1);
            assertEquals(inDb[0].paperSize, "a4");

            // 2. Update existing settings
            const updated = await service.update("user-1", "doc-1", {
                paperSize: "letter",
                orientation: "landscape",
                marginTopMm: 15,
                marginRightMm: 25,
                marginBottomMm: 35,
                marginLeftMm: 45,
            });
            assertEquals(updated, {
                paperSize: "letter",
                orientation: "landscape",
                marginTopMm: 15,
                marginRightMm: 25,
                marginBottomMm: 35,
                marginLeftMm: 45,
                updatedAt: 5000,
            });

            // 3. Get returns updated settings
            const fetched = await service.get("user-1", "doc-1");
            assertEquals(fetched, updated);
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name: "settings: update upserts if row does not exist prior to update",
    async fn() {
        const store = await setupTestDb();
        try {
            await createTestUser(store, "user-1");
            await createTestDocument(store, {
                id: "doc-new",
                userId: "user-1",
            });

            const service = new DocumentSettingsService(store, () => 7000);

            // Update directly without calling get() first
            const updated = await service.update("user-1", "doc-new", {
                paperSize: "letter",
                orientation: "landscape",
                marginTopMm: 10,
                marginRightMm: 10,
                marginBottomMm: 10,
                marginLeftMm: 10,
            });

            assertEquals(updated.paperSize, "letter");
            assertEquals(updated.orientation, "landscape");
            assertEquals(updated.marginTopMm, 10);
            assertEquals(updated.updatedAt, 7000);

            const fetched = await service.get("user-1", "doc-new");
            assertEquals(fetched.paperSize, "letter");
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "settings: strict input validation (paperSize, orientation, margin 5..50 boundaries)",
    async fn() {
        const store = await setupTestDb();
        try {
            await createTestUser(store, "user-1");
            await createTestDocument(store, {
                id: "doc-val",
                userId: "user-1",
            });

            const service = new DocumentSettingsService(store, () => 8000);

            // Invalid paper size
            await assertRejects(
                () =>
                    service.update("user-1", "doc-val", {
                        paperSize:
                            "a3" as unknown as UpdateDocumentSettingsInput[
                                "paperSize"
                            ],
                        orientation: "portrait",
                        marginTopMm: 20,
                        marginRightMm: 20,
                        marginBottomMm: 20,
                        marginLeftMm: 20,
                    }),
                DocumentValidationError,
                "纸张大小仅支持 a4 或 letter",
            );

            // Invalid orientation
            await assertRejects(
                () =>
                    service.update("user-1", "doc-val", {
                        paperSize: "a4",
                        orientation:
                            "vertical" as unknown as UpdateDocumentSettingsInput[
                                "orientation"
                            ],
                        marginTopMm: 20,
                        marginRightMm: 20,
                        marginBottomMm: 20,
                        marginLeftMm: 20,
                    }),
                DocumentValidationError,
                "纸张方向仅支持 portrait 或 landscape",
            );

            // Margins < 5
            await assertRejects(
                () =>
                    service.update("user-1", "doc-val", {
                        paperSize: "a4",
                        orientation: "portrait",
                        marginTopMm: 4.9,
                        marginRightMm: 20,
                        marginBottomMm: 20,
                        marginLeftMm: 20,
                    }),
                DocumentValidationError,
                "页边距必须在 5mm 至 50mm 之间",
            );

            // Margins > 50
            await assertRejects(
                () =>
                    service.update("user-1", "doc-val", {
                        paperSize: "a4",
                        orientation: "portrait",
                        marginTopMm: 20,
                        marginRightMm: 50.1,
                        marginBottomMm: 20,
                        marginLeftMm: 20,
                    }),
                DocumentValidationError,
                "页边距必须在 5mm 至 50mm 之间",
            );

            // Non-finite margins (NaN, Infinity)
            await assertRejects(
                () =>
                    service.update("user-1", "doc-val", {
                        paperSize: "a4",
                        orientation: "portrait",
                        marginTopMm: Number.NaN,
                        marginRightMm: 20,
                        marginBottomMm: 20,
                        marginLeftMm: 20,
                    }),
                DocumentValidationError,
                "页边距必须在 5mm 至 50mm 之间",
            );
            await assertRejects(
                () =>
                    service.update("user-1", "doc-val", {
                        paperSize: "a4",
                        orientation: "portrait",
                        marginTopMm: 20,
                        marginRightMm: Number.POSITIVE_INFINITY,
                        marginBottomMm: 20,
                        marginLeftMm: 20,
                    }),
                DocumentValidationError,
                "页边距必须在 5mm 至 50mm 之间",
            );

            // Exact boundaries: 5 and 50 are accepted
            const lowerBound = await service.update("user-1", "doc-val", {
                paperSize: "a4",
                orientation: "portrait",
                marginTopMm: 5,
                marginRightMm: 5,
                marginBottomMm: 5,
                marginLeftMm: 5,
            });
            assertEquals(lowerBound.marginTopMm, 5);

            const upperBound = await service.update("user-1", "doc-val", {
                paperSize: "letter",
                orientation: "landscape",
                marginTopMm: 50,
                marginRightMm: 50,
                marginBottomMm: 50,
                marginLeftMm: 50,
            });
            assertEquals(upperBound.marginTopMm, 50);
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name: "settings: multi-user isolation (settings do not leak across users)",
    async fn() {
        const store = await setupTestDb();
        try {
            await createTestUser(store, "user-A");
            await createTestUser(store, "user-B");
            await createTestDocument(store, { id: "doc-A", userId: "user-A" });
            await createTestDocument(store, { id: "doc-B", userId: "user-B" });

            const service = new DocumentSettingsService(store, () => 9000);

            // User A updates doc-A
            await service.update("user-A", "doc-A", {
                paperSize: "a4",
                orientation: "portrait",
                marginTopMm: 12,
                marginRightMm: 12,
                marginBottomMm: 12,
                marginLeftMm: 12,
            });

            // User B updates doc-B
            await service.update("user-B", "doc-B", {
                paperSize: "letter",
                orientation: "landscape",
                marginTopMm: 38,
                marginRightMm: 38,
                marginBottomMm: 38,
                marginLeftMm: 38,
            });

            // User A cannot read doc-B
            await assertRejects(
                () => service.get("user-A", "doc-B"),
                DocumentNotFoundError,
            );

            // User B cannot read doc-A
            await assertRejects(
                () => service.get("user-B", "doc-A"),
                DocumentNotFoundError,
            );

            // Reads are strictly isolated
            const settingsA = await service.get("user-A", "doc-A");
            const settingsB = await service.get("user-B", "doc-B");
            assertEquals(settingsA.paperSize, "a4");
            assertEquals(settingsA.marginTopMm, 12);
            assertEquals(settingsB.paperSize, "letter");
            assertEquals(settingsB.marginTopMm, 38);
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name: "settings: permanent document deletion cascades to documentSettings",
    async fn() {
        const store = await setupTestDb();
        try {
            await createTestUser(store, "user-1");
            await createTestDocument(store, {
                id: "doc-cascade",
                userId: "user-1",
            });

            const service = new DocumentSettingsService(store, () => 10000);

            // Lazy create settings
            await service.get("user-1", "doc-cascade");

            const beforeCount = await store.run(async (db) =>
                await db
                    .select()
                    .from(documentSettings)
                    .where(eq(documentSettings.documentId, "doc-cascade"))
            );
            assertEquals(beforeCount.length, 1);

            // Permanent delete document
            await store.run(async (db) => {
                await db.delete(documents).where(
                    eq(documents.id, "doc-cascade"),
                );
            });

            // Cascaded row is removed
            const afterCount = await store.run(async (db) =>
                await db
                    .select()
                    .from(documentSettings)
                    .where(eq(documentSettings.documentId, "doc-cascade"))
            );
            assertEquals(afterCount.length, 0);
        } finally {
            await store.close();
        }
    },
});
