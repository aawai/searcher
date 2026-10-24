import { assertEquals, assertRejects } from "@std/assert";
import { eq, sql } from "drizzle-orm";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import {
    documentNotebooks,
    documents,
    documentVersions,
    users,
} from "../../db/schema.ts";
import {
    DOCUMENT_BODY_MAX_LENGTH,
    DOCUMENT_PAGE_MAX_LIMIT,
    DOCUMENT_TITLE_MAX_LENGTH,
    HOME_NOTE_GRID_MAX_COL,
} from "../../shared/documents.ts";
import type {
    DocumentColor,
    DocumentUpdatedEvent,
} from "../../shared/documents.ts";
import { DocumentLayoutsService } from "./layouts.ts";
import {
    DocumentConflictError,
    DocumentLayoutConflictError,
    DocumentNotFoundError,
    DocumentValidationError,
} from "./errors.ts";
import { DocumentsService } from "./service.ts";
async function setupTestContext() {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);

    let currentTime = 1_000_000;
    const now = () => currentTime;
    const setTime = (t: number) => {
        currentTime = t;
    };
    const advanceTime = (ms: number) => {
        currentTime += ms;
    };

    // Seed test users
    await store.run(async (db) => {
        await db.insert(users).values([
            {
                id: "user-1",
                username: "user1",
                displayName: "User One",
                passwordHash: "h1",
                createdAt: 100,
                updatedAt: 100,
            },
            {
                id: "user-2",
                username: "user2",
                displayName: "User Two",
                passwordHash: "h2",
                createdAt: 100,
                updatedAt: 100,
            },
        ]);

        await db.insert(documentNotebooks).values([
            {
                id: "nb-u1-1",
                userId: "user-1",
                name: "Work Notebook",
                sortOrder: 0,
                createdAt: 100,
                updatedAt: 100,
            },
            {
                id: "nb-u2-1",
                userId: "user-2",
                name: "Private Notebook",
                sortOrder: 0,
                createdAt: 100,
                updatedAt: 100,
            },
        ]);
    });

    const service = new DocumentsService(store, now);

    return { store, service, now, setTime, advanceTime };
}

Deno.test("Documents summaries derive untitled display title from first readable block without changing canonical title", async () => {
    const { service, store } = await setupTestContext();
    try {
        const body = "```text\n" + "ignored code\n".repeat(100) +
            "```\n\n# **Readable** heading\n\nSecond paragraph";
        const title = " \t\n\u3000";
        const doc = await service.create("user-1", { title, body });
        for (
            const page of [
                await service.list("user-1"),
                await service.search("user-1", "Readable"),
            ]
        ) {
            const item = page.items.find((item) => item.id === doc.id);
            assertEquals(item?.title, title);
            assertEquals(item?.displayTitle, "Readable heading");
            assertEquals(item && "body" in item, false);
        }
        assertEquals((await service.get("user-1", doc.id)).title, title);
    } finally {
        store.close();
    }
});

Deno.test("DocumentsService - create: establishes version 1, isFavorite false, and initial snapshot", async () => {
    const { service } = await setupTestContext();

    const doc = await service.create("user-1", {
        title: "Initial Doc",
        body: "# Hello\n\nWorld text.",
        notebookId: "nb-u1-1",
    });

    assertEquals(doc.title, "Initial Doc");
    assertEquals(doc.body, "# Hello\n\nWorld text.");
    assertEquals(doc.version, 1);
    assertEquals(doc.isFavorite, false);
    assertEquals(doc.notebookId, "nb-u1-1");
    assertEquals(doc.notebookName, "Work Notebook");
    assertEquals(doc.snippet, "Hello World text.");

    const versions = await service.versions("user-1", doc.id);
    assertEquals(versions.length, 1);
    assertEquals(versions[0].version, 1);
    assertEquals(versions[0].reason, "snapshot");
    assertEquals(versions[0].title, "Initial Doc");
    assertEquals(versions[0].body, "# Hello\n\nWorld text.");
});

Deno.test("DocumentsService - create: title & body validation limits", async () => {
    const { service } = await setupTestContext();

    // Title exceeds 200 chars
    await assertRejects(
        () =>
            service.create("user-1", {
                title: "A".repeat(DOCUMENT_TITLE_MAX_LENGTH + 1),
            }),
        DocumentValidationError,
        "笔记标题不能超过",
    );

    // Body exceeds 1,000,000 chars
    await assertRejects(
        () =>
            service.create("user-1", {
                body: "B".repeat(DOCUMENT_BODY_MAX_LENGTH + 1),
            }),
        DocumentValidationError,
        "笔记正文不能超过",
    );
});

Deno.test("DocumentsService - create: validates notebook ownership", async () => {
    const { service } = await setupTestContext();

    // Foreign notebook (belongs to user-2) -> 404 owner hiding
    await assertRejects(
        () =>
            service.create("user-1", {
                title: "Doc",
                notebookId: "nb-u2-1",
            }),
        DocumentNotFoundError,
        "笔记本不存在或无权访问",
    );

    // Non-existent notebook -> 404 owner hiding
    await assertRejects(
        () =>
            service.create("user-1", {
                title: "Doc",
                notebookId: "non-existent",
            }),
        DocumentNotFoundError,
        "笔记本不存在或无权访问",
    );
});

Deno.test("DocumentsService - get: owner isolation, foreign document, and deleted document reading", async () => {
    const { service } = await setupTestContext();

    const doc = await service.create("user-1", {
        title: "User 1 Doc",
        body: "Secret info",
    });

    // Owner can get
    const fetched = await service.get("user-1", doc.id);
    assertEquals(fetched.id, doc.id);
    assertEquals(fetched.body, "Secret info");

    // Other user cannot get -> DocumentNotFoundError
    await assertRejects(
        () => service.get("user-2", doc.id),
        DocumentNotFoundError,
    );

    // Non-existent ID -> DocumentNotFoundError
    await assertRejects(
        () => service.get("user-1", "random-id"),
        DocumentNotFoundError,
    );

    // Soft delete document, get can still read it
    // Soft delete document, get can still read it
    await service.softDelete("user-1", doc.id, doc.version);
    const deletedRead = await service.get("user-1", doc.id);
    assertEquals(deletedRead.id, doc.id);
    assertEquals(deletedRead.title, "User 1 Doc");
});

Deno.test("DocumentsService - update: optimistic version conflict detection", async () => {
    const { service } = await setupTestContext();

    const doc = await service.create("user-1", {
        title: "Versioned Doc",
        body: "Version 1 content",
    });

    // Update with wrong version (expect 1, provide 99)
    const err = await assertRejects(
        () =>
            service.update("user-1", doc.id, {
                version: 99,
                title: "Updated",
            }),
        DocumentConflictError,
    );

    assertEquals(err instanceof DocumentConflictError, true);
    assertEquals((err as DocumentConflictError).currentDocument.version, 1);
    assertEquals(
        (err as DocumentConflictError).currentDocument.title,
        "Versioned Doc",
    );
});

Deno.test("DocumentsService - update: cannot update soft-deleted document", async () => {
    const { service } = await setupTestContext();

    const doc = await service.create("user-1", {
        title: "To Be Deleted",
        body: "Body",
    });

    await service.softDelete("user-1", doc.id, doc.version);

    await assertRejects(
        () =>
            service.update("user-1", doc.id, {
                version: 1,
                title: "Should Fail",
            }),
        DocumentNotFoundError,
    );
});

Deno.test("DocumentsService - update: notebook validation and unlinking", async () => {
    const { service } = await setupTestContext();

    const doc = await service.create("user-1", {
        title: "Doc with Notebook",
        notebookId: "nb-u1-1",
    });
    assertEquals(doc.notebookId, "nb-u1-1");

    // Try linking to user-2 notebook
    // Try linking to user-2 notebook -> 404 owner hiding
    await assertRejects(
        () =>
            service.update("user-1", doc.id, {
                version: 1,
                notebookId: "nb-u2-1",
            }),
        DocumentNotFoundError,
        "笔记本不存在或无权访问",
    );

    // Unlink notebook (notebookId: null)
    const updated = await service.update("user-1", doc.id, {
        version: 1,
        notebookId: null,
    });
    assertEquals(updated.notebookId, null);
    assertEquals(updated.notebookName, undefined);
    assertEquals(updated.version, 2);
});

Deno.test("DocumentsService - snapshot throttling: autosave < 10min skips, >= 10min inserts snapshot", async () => {
    const { service, advanceTime } = await setupTestContext();

    const doc = await service.create("user-1", {
        title: "Note 1",
        body: "Initial text",
    });

    // Initial snapshot at t=1_000_000
    let history = await service.versions("user-1", doc.id);
    assertEquals(history.length, 1);

    // Autosave after 3 minutes (180_000 ms) - content changed
    advanceTime(3 * 60 * 1000);
    const u1 = await service.update("user-1", doc.id, {
        version: 1,
        body: "Text edit after 3 mins",
        origin: "autosave",
    });
    assertEquals(u1.version, 2);

    // History count should STILL be 1 because < 10 minutes
    history = await service.versions("user-1", doc.id);
    assertEquals(history.length, 1);

    // Autosave after another 8 minutes (total 11 minutes from initial snapshot)
    advanceTime(8 * 60 * 1000);
    const u2 = await service.update("user-1", doc.id, {
        version: 2,
        body: "Text edit after 11 mins total",
        origin: "autosave",
    });
    assertEquals(u2.version, 3);

    // History count should now be 2
    history = await service.versions("user-1", doc.id);
    assertEquals(history.length, 2);
    assertEquals(history[0].version, 3);
    assertEquals(history[0].body, "Text edit after 11 mins total");
    assertEquals(history[0].reason, "snapshot");
});

Deno.test("DocumentsService - snapshot: unchanged title and body does not snapshot", async () => {
    const { service, advanceTime } = await setupTestContext();

    const doc = await service.create("user-1", {
        title: "Title",
        body: "Body",
    });

    // Advance 15 minutes, but only update isFavorite (body/title unchanged)
    advanceTime(15 * 60 * 1000);
    const u = await service.update("user-1", doc.id, {
        version: 1,
        isFavorite: true,
        origin: "autosave",
    });
    assertEquals(u.isFavorite, true);
    assertEquals(u.version, 2);

    const history = await service.versions("user-1", doc.id);
    assertEquals(history.length, 1);
});

Deno.test("DocumentsService - snapshot: manual and conflict_resolution force snapshot immediately", async () => {
    const { service, advanceTime } = await setupTestContext();

    const doc = await service.create("user-1", {
        title: "Title",
        body: "Body",
    });

    // Advance only 1 minute, but origin='manual'
    advanceTime(60 * 1000);
    const u1 = await service.update("user-1", doc.id, {
        version: 1,
        body: "Manual save edit",
        origin: "manual",
    });
    assertEquals(u1.version, 2);

    let history = await service.versions("user-1", doc.id);
    assertEquals(history.length, 2);
    assertEquals(history[0].version, 2);
    assertEquals(history[0].reason, "manual");

    // Advance 10 seconds, origin='conflict_resolution'
    advanceTime(10 * 1000);
    const u2 = await service.update("user-1", doc.id, {
        version: 2,
        body: "Conflict resolution save edit",
        origin: "conflict_resolution",
    });
    assertEquals(u2.version, 3);

    history = await service.versions("user-1", doc.id);
    assertEquals(history.length, 3);
    assertEquals(history[0].version, 3);
    assertEquals(history[0].reason, "conflict_resolution");
});

Deno.test("DocumentsService - snapshot retention: keeps newest 100 'snapshot' rows while preserving other reasons", async () => {
    const { store, service, setTime } = await setupTestContext();

    const doc = await service.create("user-1", {
        title: "Retention Doc",
        body: "Initial",
    });

    // Populate 105 snapshots directly to simulate extensive autosave history
    await store.run(async (db) => {
        // Add 105 snapshot rows
        for (let i = 2; i <= 106; i++) {
            await db.insert(documentVersions).values({
                id: `snap-${i}`,
                documentId: doc.id,
                userId: "user-1",
                version: i,
                title: "Retention Doc",
                body: `Body ${i}`,
                reason: "snapshot",
                createdAt: 1_000_000 + i * 1_000_000,
            });
        }

        // Add 3 manual snapshots
        await db.insert(documentVersions).values([
            {
                id: "manual-1",
                documentId: doc.id,
                userId: "user-1",
                version: 200,
                title: "Retention Doc",
                body: "Manual 1",
                reason: "manual",
                createdAt: 200_000_000,
            },
            {
                id: "restore-1",
                documentId: doc.id,
                userId: "user-1",
                version: 201,
                title: "Retention Doc",
                body: "Restore 1",
                reason: "restore",
                createdAt: 201_000_000,
            },
            {
                id: "conflict-1",
                documentId: doc.id,
                userId: "user-1",
                version: 202,
                title: "Retention Doc",
                body: "Conflict 1",
                reason: "conflict_resolution",
                createdAt: 202_000_000,
            },
        ]);

        await db.update(documents).set({ currentVersion: 202 }).where(
            eq(documents.id, doc.id),
        );
    });

    // Advance time well past the latest inserted snapshot time
    setTime(300_000_000);
    // Call update with next version 202
    await service.update("user-1", doc.id, {
        version: 202,
        body: "Newest body triggering prune",
        origin: "autosave",
    });

    const allVersions = await service.versions("user-1", doc.id);
    const snapshotVersions = allVersions.filter((v) => v.reason === "snapshot");
    const manualVersions = allVersions.filter((v) => v.reason === "manual");
    const restoreVersions = allVersions.filter((v) => v.reason === "restore");
    const conflictVersions = allVersions.filter((v) =>
        v.reason === "conflict_resolution"
    );

    // Exactly 100 snapshot rows retained
    assertEquals(snapshotVersions.length, 100);
    // Non-snapshot rows are never pruned
    assertEquals(manualVersions.length, 1);
    assertEquals(restoreVersions.length, 1);
    assertEquals(conflictVersions.length, 1);
});

Deno.test("DocumentsService - restoreVersion: version monotonically increments", async () => {
    const { service } = await setupTestContext();

    const doc = await service.create("user-1", {
        title: "Title v1",
        body: "Content v1",
    });

    // Update to v2
    await service.update("user-1", doc.id, {
        version: 1,
        title: "Title v2",
        body: "Content v2",
        origin: "manual",
    });

    // Update to v3 (manual snapshot)
    const v3 = await service.update("user-1", doc.id, {
        version: 2,
        title: "Title v3",
        body: "Content v3",
        origin: "manual",
    });
    assertEquals(v3.version, 3);

    const fetched = await service.get("user-1", doc.id);
    assertEquals(fetched.version, 3);

    // Try restoreVersion with wrong optimistic version -> conflict
    await assertRejects(
        () => service.restoreVersion("user-1", doc.id, 1, 999),
        DocumentConflictError,
    );

    // Restore to version 1 target, providing current version 3 -> increments to 4
    const restored = await service.restoreVersion("user-1", doc.id, 1, 3);
    assertEquals(restored.version, 4);
    assertEquals(restored.title, "Title v1");
    assertEquals(restored.body, "Content v1");

    const history = await service.versions("user-1", doc.id);
    assertEquals(history[0].version, 4);
    assertEquals(history[0].reason, "restore");
});

Deno.test("DocumentsService - softDelete, restore, and permanentDelete lifecycle", async () => {
    const { store, service } = await setupTestContext();

    const doc = await service.create("user-1", {
        title: "Lifecycle Doc",
        body: "Lifecycle content",
        notebookId: "nb-u1-1",
    });

    // Soft delete with wrong version -> conflict
    await assertRejects(
        () => service.softDelete("user-1", doc.id, 999),
        DocumentConflictError,
    );

    // Soft delete
    await service.softDelete("user-1", doc.id, 1);

    // Normal list excludes it
    const listNormal = await service.list("user-1");
    assertEquals(listNormal.items.some((i) => i.id === doc.id), false);

    // Trash list includes it
    const trash = await service.listTrash("user-1");
    assertEquals(trash.items.some((i) => i.id === doc.id), true);

    // Delete notebook nb-u1-1 while doc is in trash
    await store.run(async (db) => {
        await db.delete(documentNotebooks).where(
            eq(documentNotebooks.id, "nb-u1-1"),
        );
    });

    // Restore document -> since notebook was deleted, notebookId resets to null
    const restored = await service.restore("user-1", doc.id);
    assertEquals(restored.notebookId, null);
    assertEquals(restored.notebookName, undefined);

    // Now permanent delete
    await service.permanentDelete("user-1", doc.id, restored.version);

    // Not in trash or get
    await assertRejects(
        () => service.get("user-1", doc.id),
        DocumentNotFoundError,
    );
    const trashAfter = await service.listTrash("user-1");
    assertEquals(trashAfter.items.some((i) => i.id === doc.id), false);

    // Versions cascaded
    await assertRejects(
        () => service.versions("user-1", doc.id),
        DocumentNotFoundError,
    );
});

Deno.test("DocumentsService - list: deterministic ordering across scopes and no body in projection", async () => {
    const { service, setTime } = await setupTestContext();

    // Create 4 documents with specific timestamps and favorites
    setTime(100);
    const d1 = await service.create("user-1", {
        title: "Doc 1",
        body: "Very long body that should NOT be in summary",
        notebookId: "nb-u1-1",
    });

    setTime(200);
    const d2 = await service.create("user-1", {
        title: "Doc 2",
        body: "Second long body",
        notebookId: "nb-u1-1",
    });

    setTime(300);
    const d3 = await service.create("user-1", {
        title: "Doc 3",
        body: "Third long body",
    });

    // Favorite d1 at time 400
    setTime(400);
    await service.update("user-1", d1.id, {
        version: 1,
        isFavorite: true,
    });

    // Scope 'all': favorites first (d1 updatedAt=400), then by updatedAt DESC (d3=300, d2=200)
    const allPage = await service.list("user-1", { scope: { type: "all" } });
    assertEquals(allPage.items.map((i) => i.id), [d1.id, d3.id, d2.id]);
    // Ensure projection has snippet and NO body property
    assertEquals("body" in allPage.items[0], false);
    assertEquals(typeof allPage.items[0].snippet, "string");

    // Scope 'recent': updatedAt DESC (d1=400, d3=300, d2=200)
    const recentPage = await service.list("user-1", {
        scope: { type: "recent" },
    });
    assertEquals(recentPage.items.map((i) => i.id), [d1.id, d3.id, d2.id]);

    // Scope 'favorite': only d1
    const favPage = await service.list("user-1", {
        scope: { type: "favorite" },
    });
    assertEquals(favPage.items.map((i) => i.id), [d1.id]);

    // Scope 'notebook': nb-u1-1 only contains d1 and d2
    const nbPage = await service.list("user-1", {
        scope: { type: "notebook", notebookId: "nb-u1-1" },
    });
    assertEquals(nbPage.items.map((i) => i.id), [d1.id, d2.id]);
});

Deno.test("DocumentsService - list: opaque cursor pagination stability across pages", async () => {
    const { service, setTime } = await setupTestContext();

    // Insert 5 docs
    const createdIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
        setTime(100 * i);
        const d = await service.create("user-1", {
            title: `Item ${i}`,
            body: `Body ${i}`,
        });
        createdIds.push(d.id);
    }
    // Expected default sort order: Item 5, 4, 3, 2, 1
    const expectedIds = [...createdIds].reverse();

    // Page 1: limit 2
    const page1 = await service.list("user-1", { limit: 2 });
    assertEquals(page1.items.length, 2);
    assertEquals(page1.items.map((i) => i.id), expectedIds.slice(0, 2));
    assertEquals(Boolean(page1.nextCursor), true);

    // Page 2: limit 2 using nextCursor
    const page2 = await service.list("user-1", {
        limit: 2,
        cursor: page1.nextCursor!,
    });
    assertEquals(page2.items.length, 2);
    assertEquals(page2.items.map((i) => i.id), expectedIds.slice(2, 4));
    assertEquals(Boolean(page2.nextCursor), true);

    // Page 3: limit 2 using nextCursor -> last item
    const page3 = await service.list("user-1", {
        limit: 2,
        cursor: page2.nextCursor!,
    });
    assertEquals(page3.items.length, 1);
    assertEquals(page3.items.map((i) => i.id), expectedIds.slice(4, 5));
    assertEquals(page3.nextCursor, null);
});

Deno.test("DocumentsService - list: cursor validation & tamper resistance", async () => {
    const { service } = await setupTestContext();

    await service.create("user-1", { title: "D1", body: "B1" });
    await service.create("user-1", { title: "D2", body: "B2" });

    const page1 = await service.list("user-1", { limit: 1 });
    const cursor = page1.nextCursor!;

    // Malformed cursor
    await assertRejects(
        () => service.list("user-1", { cursor: "not-a-valid-base64-json" }),
        DocumentValidationError,
        "无效的游标",
    );

    // Tampered user (user-2 uses user-1 cursor)
    await assertRejects(
        () => service.list("user-2", { cursor }),
        DocumentValidationError,
        "无效的游标",
    );

    // Scope mismatch (cursor from 'all' used with scope 'favorite')
    await assertRejects(
        () =>
            service.list("user-1", {
                scope: { type: "favorite" },
                cursor,
            }),
        DocumentValidationError,
        "无效的游标",
    );

    // Invalid limit
    await assertRejects(
        () => service.list("user-1", { limit: 0 }),
        DocumentValidationError,
    );
    await assertRejects(
        () => service.list("user-1", { limit: DOCUMENT_PAGE_MAX_LIMIT + 1 }),
        DocumentValidationError,
    );
});

Deno.test("DocumentsService - search: FTS matches title & body, excludes trash, safe tokenization, and cursor", async () => {
    const { service } = await setupTestContext();

    const d1 = await service.create("user-1", {
        title: "Rust and SQLite Guide",
        body: "Full-text search engine concepts in database systems.",
    });

    const d2 = await service.create("user-1", {
        title: "Web Frontend Architecture",
        body: "Designing React apps with SQLite local-first storage.",
        notebookId: "nb-u1-1",
    });

    const d3 = await service.create("user-1", {
        title: "Deleted SQLite Document",
        body: "SQLite notes that are now soft-deleted.",
    });
    await service.softDelete("user-1", d3.id, 1);

    // User-2 creates doc matching search term
    await service.create("user-2", {
        title: "User 2 SQLite Document",
        body: "SQLite notes for user 2.",
    });

    // Blank query returns empty list
    const emptyResult = await service.search("user-1", "   ");
    assertEquals(emptyResult.items.length, 0);
    assertEquals(emptyResult.nextCursor, null);

    // Search "SQLite"
    const result = await service.search("user-1", "SQLite");
    // Should match d1 and d2 for user-1, but NOT soft-deleted d3, and NOT user-2 doc
    assertEquals(result.items.length, 2);
    const ids = result.items.map((i) => i.id);
    assertEquals(ids.includes(d1.id), true);
    assertEquals(ids.includes(d2.id), true);
    assertEquals(ids.includes(d3.id), false);

    // Search result includes notebook metadata if present
    const d2Result = result.items.find((i) => i.id === d2.id);
    assertEquals(d2Result?.notebookName, "Work Notebook");

    // Every whitespace-separated term is a literal phrase: punctuation is content, not FTS syntax.
    const specialResult = await service.search("user-1", "SQLite Guide");
    assertEquals(specialResult.items.map((i) => i.id), [d1.id]);
    assertEquals(
        (await service.search("user-1", "SQLite (Guide) [Engine]*:")).items
            .length,
        0,
    );

    // Search with symbols that have no match returns empty without throwing FTS errors
    const noMatchResult = await service.search(
        "user-1",
        "NonExistentWord $100 & foo=bar",
    );
    assertEquals(noMatchResult.items.length, 0);
    // Search pagination with cursor
    const p1 = await service.search("user-1", "SQLite", { limit: 1 });
    assertEquals(p1.items.length, 1);
    assertEquals(Boolean(p1.nextCursor), true);

    const p2 = await service.search("user-1", "SQLite", {
        limit: 1,
        cursor: p1.nextCursor!,
    });
    assertEquals(p2.items.length, 1);
    assertEquals(p2.items[0].id !== p1.items[0].id, true);

    // Query mismatch in search cursor
    await assertRejects(
        () =>
            service.search("user-1", "DifferentQuery", {
                cursor: p1.nextCursor!,
            }),
        DocumentValidationError,
        "无效的游标",
    );
});

Deno.test("DocumentsService - search matches CJK substrings and terms shorter than 3 characters", async () => {
    const { service, advanceTime } = await setupTestContext();
    const inspiration = await service.create("user-1", {
        title: "灵感",
        body: "今天的灵感来源是散步",
    });
    advanceTime(10);
    const coffee = await service.create("user-1", {
        title: null,
        body: "傍晚在咖啡馆写代码 AB-12",
    });
    const trashed = await service.create("user-1", {
        title: "灵感回收",
        body: "来源已删除",
    });
    await service.softDelete("user-1", trashed.id, 1);
    await service.create("user-2", { title: "灵感", body: "别人的来源" });

    const ids = async (q: string) =>
        (await service.search("user-1", q)).items.map((i) => i.id);

    // >= 3 characters: trigram MATCH, substring anywhere in the body.
    assertEquals(await ids("灵感来源"), [inspiration.id]);
    assertEquals(await ids("咖啡馆"), [coffee.id]);
    // 2 and 1 characters: fallback scan, substring in title or body.
    assertEquals(await ids("来源"), [inspiration.id]);
    assertEquals(await ids("灵感"), [inspiration.id]);
    assertEquals(await ids("咖"), [coffee.id]);
    // Case-insensitive, substring (no prefix-only semantics).
    assertEquals(await ids("ab-1"), [coffee.id]);
    assertEquals(await ids("ab"), [coffee.id]);
    // Terms are ANDed across the match and fallback paths.
    assertEquals(await ids("灵感来源 散步"), [inspiration.id]);
    assertEquals(await ids("来源 咖啡馆"), []);
    assertEquals(await ids("来源 咖"), []);
});

Deno.test("DocumentsService - short-term search ranks title hits before newer body hits", async () => {
    const { service, advanceTime } = await setupTestContext();
    const titled = await service.create("user-1", {
        title: "灵感",
        body: "空",
    });
    advanceTime(10);
    const mentioned = await service.create("user-1", {
        title: "周记",
        body: "今天的灵感来源是散步",
    });
    assertEquals(
        (await service.search("user-1", "灵感")).items.map((i) => i.id),
        [titled.id, mentioned.id],
    );
});

Deno.test("DocumentsService - search treats FTS syntax characters as literal text", async () => {
    const { service } = await setupTestContext();
    const dash = await service.create("user-1", {
        body: "release foo-bar done",
    });
    const or = await service.create("user-1", { body: "cats OR dogs" });
    const quoted = await service.create("user-1", {
        body: 'say "hello" loudly',
    });
    const paren = await service.create("user-1", { body: "call fn(a, b) now" });
    const star = await service.create("user-1", {
        body: "glob *.ts and NEAR/2",
    });

    const ids = async (q: string) =>
        (await service.search("user-1", q)).items.map((i) => i.id);

    assertEquals(await ids("foo-bar"), [dash.id]);
    assertEquals(await ids("-bar"), [dash.id]);
    assertEquals(await ids("cats OR dogs"), [or.id]);
    assertEquals(await ids("OR"), [or.id]);
    assertEquals(await ids('"hello"'), [quoted.id]);
    assertEquals(await ids('"'), [quoted.id]);
    assertEquals(await ids("fn(a,"), [paren.id]);
    assertEquals(await ids("("), [paren.id]);
    assertEquals(await ids("*.ts"), [star.id]);
    assertEquals(await ids("NEAR/2"), [star.id]);
    // Unbalanced / operator input never raises: AND matches the literal word, not an operator.
    assertEquals(await ids('foo-bar "'), []);
    assertEquals(await ids("AND"), [star.id]);
    assertEquals(await ids("NOT"), []);
    assertEquals(await ids("^"), []);
});

Deno.test("DocumentsService - short-term search honours cursor ownership and pagination", async () => {
    const { service, advanceTime } = await setupTestContext();
    const created: string[] = [];
    for (let i = 0; i < 3; i++) {
        advanceTime(10);
        created.push(
            (await service.create("user-1", { body: `第${i}条 来源记录` })).id,
        );
    }
    const p1 = await service.search("user-1", "来源", { limit: 2 });
    assertEquals(p1.items.map((i) => i.id), [created[2], created[1]]);
    const p2 = await service.search("user-1", "来源", {
        limit: 2,
        cursor: p1.nextCursor!,
    });
    assertEquals(p2.items.map((i) => i.id), [created[0]]);
    assertEquals(p2.nextCursor, null);
    await assertRejects(
        () =>
            service.search("user-1", "记录", {
                limit: 2,
                cursor: p1.nextCursor!,
            }),
        DocumentValidationError,
        "无效的游标",
    );
});

Deno.test("DocumentsService - rollback invariant: multi-mutation operations roll back completely on failure", async () => {
    const { store, service } = await setupTestContext();
    const events: DocumentUpdatedEvent[] = [];
    service.events.on("user-1", (event) => events.push(event));

    // 1. Rollback on create: if documentVersions insertion fails, document record must roll back
    await store.run(async (db) => {
        await db.run(sql`
            CREATE TRIGGER fail_create_version
            BEFORE INSERT ON document_versions
            WHEN NEW.title = 'TRIGGER_FAIL_CREATE'
            BEGIN
                SELECT RAISE(ABORT, 'forced create version failure');
            END;
        `);
    });

    await assertRejects(
        () =>
            service.create("user-1", {
                title: "TRIGGER_FAIL_CREATE",
                body: "Should be rolled back",
            }),
        Error,
    );
    assertEquals(events, []);

    const createdDocs = await store.run(async (db) => {
        return await db.select().from(documents).where(
            eq(documents.title, "TRIGGER_FAIL_CREATE"),
        );
    });
    assertEquals(createdDocs.length, 0);

    const createdVersions = await store.run(async (db) => {
        return await db.select().from(documentVersions).where(
            eq(documentVersions.title, "TRIGGER_FAIL_CREATE"),
        );
    });
    assertEquals(createdVersions.length, 0);

    // 2. Rollback on update: if snapshot insertion fails, document state must remain at previous version
    const stableDoc = await service.create("user-1", {
        title: "Stable Doc",
        body: "Stable Body",
    });
    assertEquals(stableDoc.version, 1);

    await store.run(async (db) => {
        await db.run(sql`
            CREATE TRIGGER fail_update_version
            BEFORE INSERT ON document_versions
            WHEN NEW.title = 'TRIGGER_FAIL_UPDATE'
            BEGIN
                SELECT RAISE(ABORT, 'forced update version failure');
            END;
        `);
    });

    await assertRejects(
        () =>
            service.update("user-1", stableDoc.id, {
                version: 1,
                title: "TRIGGER_FAIL_UPDATE",
                body: "Updated Body",
                origin: "manual",
            }),
        Error,
    );
    assertEquals(events.map((event) => event.version), [1]);

    const docAfterFailedUpdate = await service.get("user-1", stableDoc.id);
    assertEquals(docAfterFailedUpdate.version, 1);
    assertEquals(docAfterFailedUpdate.title, "Stable Doc");
    assertEquals(docAfterFailedUpdate.body, "Stable Body");

    // 3. Rollback on restoreVersion: if restore snapshot insertion fails, document must remain unchanged
    const updatedDoc = await service.update("user-1", stableDoc.id, {
        version: 1,
        title: "Version 2 Doc",
        body: "Version 2 Body",
        origin: "manual",
    });
    assertEquals(updatedDoc.version, 2);

    await store.run(async (db) => {
        await db.run(sql`
            CREATE TRIGGER fail_restore_version
            BEFORE INSERT ON document_versions
            WHEN NEW.reason = 'restore' AND NEW.title = 'Stable Doc'
            BEGIN
                SELECT RAISE(ABORT, 'forced restore version failure');
            END;
        `);
    });

    await assertRejects(
        () => service.restoreVersion("user-1", stableDoc.id, 1, 2),
        Error,
    );
    assertEquals(events.map((event) => event.version), [1, 2]);

    const docAfterFailedRestore = await service.get("user-1", stableDoc.id);
    assertEquals(docAfterFailedRestore.version, 2);
    assertEquals(docAfterFailedRestore.title, "Version 2 Doc");
    assertEquals(docAfterFailedRestore.body, "Version 2 Body");
});

Deno.test("Documents preserve nullable canonical titles across summaries, snapshots and restore", async () => {
    const { service, store } = await setupTestContext();
    try {
        const body = "```\n" + "skip\n".repeat(100) +
            "```\n\n# Readable fallback";
        const doc = await service.create("user-1", { title: null, body });
        assertEquals(doc.title, null);
        assertEquals(doc.displayTitle, "Readable fallback");
        assertEquals((await service.create("user-1", {})).title, null);
        assertEquals((await service.versions("user-1", doc.id))[0].title, null);
        for (
            const page of [
                await service.list("user-1"),
                await service.search("user-1", "Readable"),
            ]
        ) {
            const summary = page.items.find((item) => item.id === doc.id);
            assertEquals(summary?.title, null);
            assertEquals(summary?.displayTitle, "Readable fallback");
        }
        const named = await service.update("user-1", doc.id, {
            version: 1,
            title: "Named",
            origin: "manual",
        });
        const untitled = await service.update("user-1", doc.id, {
            version: named.version,
            title: null,
            origin: "manual",
        });
        assertEquals(untitled.title, null);
        const restored = await service.restoreVersion(
            "user-1",
            doc.id,
            1,
            untitled.version,
        );
        assertEquals(restored.title, null);
        await service.softDelete("user-1", doc.id, restored.version);
        const trash = await service.listTrash("user-1");
        assertEquals(trash.items[0].title, null);
        assertEquals(trash.items[0].displayTitle, "Readable fallback");
    } finally {
        store.close();
    }
});

Deno.test("Documents colors, favorites and home ordering persist with scope-bound keyset cursors", async () => {
    const { service, store, advanceTime } = await setupTestContext();
    try {
        const colors: DocumentColor[] = [
            "paper",
            "amber",
            "rose",
            "sage",
            "sky",
        ];
        const created = [];
        for (const [index, color] of colors.entries()) {
            advanceTime(1);
            created.push(
                await service.create("user-1", {
                    color,
                    isHomeFixed: true,
                    homeSortOrder: index === 0 ? 5 : 1,
                    isFavorite: index === 0,
                    body: "Searchable color",
                }),
            );
        }
        const ordinary = await service.create("user-1", {});
        assertEquals([
            ordinary.color,
            ordinary.isHomeFixed,
            ordinary.homeSortOrder,
            ordinary.isFavorite,
        ], ["paper", false, 0, false]);
        await service.create("user-2", {
            isHomeFixed: true,
            homeSortOrder: -1,
        });
        const expected = [...created].sort((a, b) =>
            a.homeSortOrder - b.homeSortOrder ||
            a.createdAt - b.createdAt ||
            a.id.localeCompare(b.id)
        );
        const actual = [];
        let cursor: string | undefined;
        do {
            const page = await service.list("user-1", {
                scope: { type: "home" },
                limit: 2,
                cursor,
            });
            actual.push(...page.items);
            cursor = page.nextCursor ?? undefined;
        } while (cursor);
        assertEquals(
            actual.map((item) => item.id),
            expected.map((item) => item.id),
        );
        for (const doc of created) {
            assertEquals(
                actual.find((item) => item.id === doc.id)?.color,
                doc.color,
            );
        }
        const first = await service.list("user-1", {
            scope: { type: "home" },
            limit: 1,
        });
        await assertRejects(() =>
            service.list("user-1", {
                scope: { type: "recent" },
                cursor: first.nextCursor!,
            }), DocumentValidationError);
        await assertRejects(() =>
            service.list("user-2", {
                scope: { type: "home" },
                cursor: first.nextCursor!,
            }), DocumentValidationError);
        assertEquals(
            (await service.list("user-1", { scope: { type: "favorite" } }))
                .items.map((item) => item.id),
            [created[0].id],
        );
        const updated = await service.update("user-1", created[0].id, {
            version: 1,
            color: "sky",
            isHomeFixed: false,
            homeSortOrder: -5,
            isFavorite: false,
        });
        assertEquals([
            updated.color,
            updated.isHomeFixed,
            updated.homeSortOrder,
            updated.isFavorite,
        ], ["sky", false, -5, false]);
        await assertRejects(() =>
            service.update("user-1", updated.id, {
                version: 1,
                color: "amber",
            }), DocumentConflictError);
        assertEquals(
            (await service.search("user-1", "Searchable")).items.find((item) =>
                item.id === updated.id
            )?.color,
            "sky",
        );
        assertEquals((await service.versions("user-1", updated.id)).length, 1);
    } finally {
        store.close();
    }
});

Deno.test("Document layouts store home note cells, reject overlaps and never version content", async () => {
    const { service, store, now, advanceTime } = await setupTestContext();
    const layouts = new DocumentLayoutsService(store, now);
    try {
        const doc = await service.create("user-1", { isHomeFixed: true });
        assertEquals(await layouts.getLayout("user-1", doc.id), null);
        await assertRejects(
            () => layouts.getLayout("user-2", doc.id),
            DocumentNotFoundError,
        );
        await assertRejects(
            () => layouts.updateLayout("user-2", doc.id, { col: 0, row: 0 }),
            DocumentNotFoundError,
        );
        // col and row are one position; a partial pair is invalid.
        await assertRejects(
            () => layouts.updateLayout("user-1", doc.id, { col: 3 }),
            DocumentValidationError,
        );
        const placed = await layouts.updateLayout("user-1", doc.id, {
            col: 0,
            row: 0,
            size: "w",
        });
        assertEquals(placed, { col: 0, row: 0, size: "w", updatedAt: now() });
        advanceTime(1);
        const changed = await layouts.updateLayout("user-1", doc.id, {
            col: 0,
            row: 1,
            size: "s",
        });
        assertEquals(changed, {
            ...placed,
            row: 1,
            size: "s",
            updatedAt: now(),
        });
        // W spans two columns: it overlaps a note at the same origin.
        const other = await service.create("user-1", { isHomeFixed: true });
        await assertRejects(
            () =>
                layouts.updateLayout("user-1", other.id, {
                    col: 0,
                    row: 1,
                    size: "w",
                }),
            DocumentLayoutConflictError,
        );
        const beside = await layouts.updateLayout("user-1", other.id, {
            col: 2,
            row: 1,
        });
        assertEquals(beside.col, 2);
        // Off-home notes do not occupy the home lattice.
        const hidden = await service.create("user-1", {});
        const hiddenLayout = await layouts.updateLayout("user-1", hidden.id, {
            col: 0,
            row: 1,
        });
        assertEquals(hiddenLayout.col, 0);
        await assertRejects(
            () =>
                layouts.updateLayout("user-1", doc.id, {
                    col: HOME_NOTE_GRID_MAX_COL + 1,
                    row: 0,
                }),
            DocumentValidationError,
        );
        assertEquals(await service.get("user-1", doc.id), doc);
        await service.softDelete("user-1", doc.id, doc.version);
        await assertRejects(
            () => layouts.getLayout("user-1", doc.id),
            DocumentNotFoundError,
        );
        await assertRejects(
            () => layouts.updateLayout("user-1", doc.id, { col: 1, row: 1 }),
            DocumentNotFoundError,
        );
        await service.restore("user-1", doc.id);
        assertEquals(await layouts.getLayout("user-1", doc.id), changed);
    } finally {
        store.close();
    }
});

Deno.test("Document events isolate users and service instances and publish committed lifecycle versions", async () => {
    const { service, store, now, advanceTime } = await setupTestContext();
    try {
        const events: DocumentUpdatedEvent[] = [];
        const otherUser: DocumentUpdatedEvent[] = [];
        const otherInstance: DocumentUpdatedEvent[] = [];
        const reads: Promise<unknown>[] = [];
        const unsubscribe = service.events.on("user-1", (event) => {
            events.push(event);
            reads.push(
                service.get("user-1", event.documentId).then(
                    (doc) => doc.version,
                    () => null,
                ),
            );
        });
        service.events.on("user-2", (event) => otherUser.push(event));
        new DocumentsService(store, now).events.on(
            "user-1",
            (event) => otherInstance.push(event),
        );
        service.events.on("user-1", () => {
            throw new Error("Disconnected subscriber");
        });
        const doc = await service.create("user-1", { body: "Original" });
        advanceTime(1);
        await service.update("user-1", doc.id, {
            version: 1,
            body: "Saved",
            origin: "manual",
        });
        await assertRejects(
            () =>
                service.update("user-1", doc.id, { version: 1, body: "Stale" }),
            DocumentConflictError,
        );
        advanceTime(1);
        await service.restoreVersion("user-1", doc.id, 1, 2);
        advanceTime(1);
        await service.softDelete("user-1", doc.id, 3);
        advanceTime(1);
        const restored = await service.restore("user-1", doc.id);
        advanceTime(1);
        await service.permanentDelete("user-1", doc.id, restored.version);
        assertEquals(
            events,
            [1, 2, 3, 4, 5, 6].map((version) => ({
                documentId: doc.id,
                version,
                updatedAt: 1_000_000 + version - 1,
            })),
        );
        assertEquals(await Promise.all(reads), [1, 2, 3, 4, 5, null]);
        assertEquals(otherUser, []);
        assertEquals(otherInstance, []);
        unsubscribe();
        unsubscribe();
        await service.create("user-1", {});
        assertEquals(events.length, 6);
    } finally {
        store.close();
    }
});
