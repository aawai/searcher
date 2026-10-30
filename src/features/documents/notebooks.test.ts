import { assertEquals, assertRejects } from "@std/assert";
import { eq } from "drizzle-orm";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { documents, users } from "../../db/schema.ts";
import { DocumentNotFoundError, DocumentValidationError } from "./errors.ts";
import { DocumentNotebooksService } from "./notebooks.ts";

async function setupTestDb() {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);

    const userA = "user_test_a";
    const userB = "user_test_b";
    const now = 1_700_000_000_000;

    await store.run(async (db) => {
        await db.insert(users).values([
            {
                id: userA,
                username: "usera",
                displayName: "User A",
                passwordHash: "hashA",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: userB,
                username: "userb",
                displayName: "User B",
                passwordHash: "hashB",
                createdAt: now,
                updatedAt: now,
            },
        ]);
    });

    const service = new DocumentNotebooksService(store, () => now);
    return { store, service, userA, userB, now };
}

Deno.test("notebooks depth: create root (0) and child (1) succeed, depth >= 2 rejected", async () => {
    const { store, service, userA } = await setupTestDb();
    try {
        const root = await service.create(userA, { name: "Root" });
        assertEquals(root.parentId, null);
        assertEquals(root.name, "Root");
        assertEquals(root.sortOrder, 0);

        const child = await service.create(userA, {
            name: "Child",
            parentId: root.id,
        });
        assertEquals(child.parentId, root.id);
        assertEquals(child.name, "Child");
        assertEquals(child.sortOrder, 0);

        // Attempt depth >= 2 by creating grandchild under child
        await assertRejects(
            async () => {
                await service.create(userA, {
                    name: "Grandchild",
                    parentId: child.id,
                });
            },
            DocumentValidationError,
            "不支持嵌套超过两层",
        );
    } finally {
        await store.close();
    }
});

Deno.test("notebooks depth: move rejecting depth >= 2 and moving root with children to non-root", async () => {
    const { store, service, userA } = await setupTestDb();
    try {
        const root1 = await service.create(userA, { name: "Root 1" });
        const child1 = await service.create(userA, {
            name: "Child 1",
            parentId: root1.id,
        });
        const root2 = await service.create(userA, { name: "Root 2" });
        const child2 = await service.create(userA, {
            name: "Child 2",
            parentId: root2.id,
        });

        // Moving child1 under child2 would create depth 2 -> rejected
        await assertRejects(
            async () => {
                await service.move(userA, child1.id, child2.id);
            },
            DocumentValidationError,
            "不支持嵌套超过两层",
        );

        // Moving root1 (which has child1) under root2 would make child1 depth 2 -> rejected
        await assertRejects(
            async () => {
                await service.move(userA, root1.id, root2.id);
            },
            DocumentValidationError,
            "含有子笔记本的根笔记本不能移动为子笔记本",
        );
    } finally {
        await store.close();
    }
});

Deno.test("notebooks cycle & self: moving notebook to itself rejected", async () => {
    const { store, service, userA } = await setupTestDb();
    try {
        const root = await service.create(userA, { name: "Root" });

        // Move to self
        await assertRejects(
            async () => {
                await service.move(userA, root.id, root.id);
            },
            DocumentValidationError,
            "不能将笔记本移动到自身",
        );
    } finally {
        await store.close();
    }
});

Deno.test("notebooks owner isolation: foreign parent, foreign notebook mutations hidden as 404", async () => {
    const { store, service, userA, userB } = await setupTestDb();
    try {
        const notebookB = await service.create(userB, {
            name: "User B Notebook",
        });

        // User A cannot use User B's notebook as parent in create -> 404
        await assertRejects(
            async () => {
                await service.create(userA, {
                    name: "User A Child",
                    parentId: notebookB.id,
                });
            },
            DocumentNotFoundError,
            "父笔记本不存在",
        );

        // User A cannot rename User B's notebook -> 404
        await assertRejects(
            async () => {
                await service.rename(userA, notebookB.id, "Hacked Name");
            },
            DocumentNotFoundError,
            "笔记本不存在",
        );

        // User A cannot delete User B's notebook -> 404
        await assertRejects(
            async () => {
                await service.delete(userA, notebookB.id);
            },
            DocumentNotFoundError,
            "笔记本不存在",
        );

        // User A cannot move User B's notebook -> 404
        await assertRejects(
            async () => {
                await service.move(userA, notebookB.id, null);
            },
            DocumentNotFoundError,
            "笔记本不存在",
        );

        // User A cannot move own notebook to User B's notebook -> 404
        const notebookA = await service.create(userA, {
            name: "User A Notebook",
        });
        await assertRejects(
            async () => {
                await service.move(userA, notebookA.id, notebookB.id);
            },
            DocumentNotFoundError,
            "父笔记本不存在",
        );

        // User A list only sees User A's notebooks
        const listA = await service.list(userA);
        assertEquals(listA.length, 1);
        assertEquals(listA[0].id, notebookA.id);

        // User A cannot reorder User B's scope -> 404
        await assertRejects(
            async () => {
                await service.reorder(userA, notebookB.id, []);
            },
            DocumentNotFoundError,
            "父笔记本不存在",
        );

        // User A cannot include User B's notebook in reorder list -> validation error
        await assertRejects(
            async () => {
                await service.reorder(userA, null, [notebookB.id]);
            },
            DocumentValidationError,
        );
    } finally {
        await store.close();
    }
});

Deno.test("notebooks name: trim nonempty and duplicate name allowed in same parent", async () => {
    const { store, service, userA } = await setupTestDb();
    try {
        // Empty / whitespace create rejected
        await assertRejects(
            async () => {
                await service.create(userA, { name: "   " });
            },
            DocumentValidationError,
            "笔记本名称不能为空",
        );

        // Empty / whitespace rename rejected
        const nb1 = await service.create(userA, { name: "  Original  " });
        assertEquals(nb1.name, "Original");

        await assertRejects(
            async () => {
                await service.rename(userA, nb1.id, "   ");
            },
            DocumentValidationError,
            "笔记本名称不能为空",
        );

        const renamed = await service.rename(userA, nb1.id, "  Updated  ");
        assertEquals(renamed.name, "Updated");

        // Duplicate name in same parent is allowed
        const nb2 = await service.create(userA, { name: "Updated" });
        assertEquals(nb2.name, "Updated");
        assertEquals(nb2.id !== nb1.id, true);

        const list = await service.list(userA);
        assertEquals(list.length, 2);
        assertEquals(list[0].name, "Updated");
        assertEquals(list[1].name, "Updated");
    } finally {
        await store.close();
    }
});

Deno.test("notebooks reorder: exact siblings coverage, rejects duplicate/missing/foreign/outscope", async () => {
    const { store, service, userA } = await setupTestDb();
    try {
        const root1 = await service.create(userA, { name: "Root 1" });
        const root2 = await service.create(userA, { name: "Root 2" });
        const root3 = await service.create(userA, { name: "Root 3" });
        const child1 = await service.create(userA, {
            name: "Child 1",
            parentId: root1.id,
        });

        // 1. Duplicate IDs rejected
        await assertRejects(
            async () => {
                await service.reorder(userA, null, [
                    root1.id,
                    root1.id,
                    root3.id,
                ]);
            },
            DocumentValidationError,
            "排序列表中存在重复笔记本 ID",
        );

        // 2. Missing ID rejected
        await assertRejects(
            async () => {
                await service.reorder(userA, null, [root1.id, root2.id]);
            },
            DocumentValidationError,
            "排序列表必须精确包含该层级的全部笔记本",
        );

        // 3. Foreign / nonexistent ID rejected
        await assertRejects(
            async () => {
                await service.reorder(userA, null, [
                    root1.id,
                    root2.id,
                    "non-existent-id",
                ]);
            },
            DocumentValidationError,
            "排序列表中包含不属于当前层级的笔记本 ID",
        );

        // 4. Out-of-scope ID (child under root1 passed in root scope) rejected (no implicit reparent)
        await assertRejects(
            async () => {
                await service.reorder(userA, null, [
                    root1.id,
                    root2.id,
                    child1.id,
                ]);
            },
            DocumentValidationError,
            "排序列表中包含不属于当前层级的笔记本 ID",
        );

        // 5. Valid reorder reverses root order
        const reordered = await service.reorder(userA, null, [
            root3.id,
            root2.id,
            root1.id,
        ]);
        assertEquals(reordered.map((r) => r.id), [
            root3.id,
            root2.id,
            root1.id,
        ]);
        assertEquals(reordered.map((r) => r.sortOrder), [0, 1, 2]);

        const list = await service.list(userA);
        // Root 3, Root 2, Root 1 (followed by Child 1 under Root 1)
        assertEquals(list.map((r) => r.id), [
            root3.id,
            root2.id,
            root1.id,
            child1.id,
        ]);
    } finally {
        await store.close();
    }
});

Deno.test("notebooks move: independent mutation, append to parent scope sortOrder, no-op same parent", async () => {
    const { store, service, userA } = await setupTestDb();
    try {
        const root1 = await service.create(userA, { name: "Root 1" });
        const root2 = await service.create(userA, { name: "Root 2" });
        const child1 = await service.create(userA, {
            name: "Child 1",
            parentId: root1.id,
        });
        const child2 = await service.create(userA, {
            name: "Child 2",
            parentId: root1.id,
        });

        // Move child1 to root2 -> appends in root2 scope (sortOrder 0)
        const movedToRoot2 = await service.move(userA, child1.id, root2.id);
        assertEquals(movedToRoot2.parentId, root2.id);
        assertEquals(movedToRoot2.sortOrder, 0);

        // Move child2 to root2 -> appends in root2 scope (sortOrder 1)
        const movedChild2 = await service.move(userA, child2.id, root2.id);
        assertEquals(movedChild2.parentId, root2.id);
        assertEquals(movedChild2.sortOrder, 1);

        // Move child2 to root (parentId null) -> appends in root scope
        // Existing roots: root1 (sortOrder 0), root2 (sortOrder 1) -> child2 gets sortOrder 2
        const promoted = await service.move(userA, child2.id, null);
        assertEquals(promoted.parentId, null);
        assertEquals(promoted.sortOrder, 2);

        // Move to same parent is no-op
        const noOp = await service.move(userA, child2.id, null);
        assertEquals(noOp.parentId, null);
        assertEquals(noOp.sortOrder, 2);

        // Root without children can move to become child
        const movedRoot = await service.move(userA, root1.id, root2.id);
        assertEquals(movedRoot.parentId, root2.id);
        assertEquals(movedRoot.sortOrder, 1); // child2 moved out of this scope
    } finally {
        await store.close();
    }
});

Deno.test("notebooks delete: detaches active and trash documents, promotes children, preserves sortOrder without deduplication", async () => {
    const { store, service, userA, now } = await setupTestDb();
    try {
        const otherRoot = await service.create(userA, {
            name: "Existing Root",
        }); // sortOrder 0
        const rootToDelete = await service.create(userA, {
            name: "Root To Delete",
        }); // sortOrder 1

        // Children under rootToDelete
        const child1 = await service.create(userA, {
            name: "Child 1",
            parentId: rootToDelete.id,
        }); // sortOrder 0
        const child2 = await service.create(userA, {
            name: "Existing Root", // duplicate name of existing root
            parentId: rootToDelete.id,
        }); // sortOrder 1

        // Insert documents:
        // doc1: active document in rootToDelete
        // doc2: soft-deleted (trash) document in rootToDelete
        // doc3: document in child1
        const doc1Id = crypto.randomUUID();
        const doc2Id = crypto.randomUUID();
        const doc3Id = crypto.randomUUID();

        await store.run(async (db) => {
            await db.insert(documents).values([
                {
                    id: doc1Id,
                    userId: userA,
                    notebookId: rootToDelete.id,
                    title: "Active in root",
                    currentBody: "body1",
                    createdAt: now,
                    updatedAt: now,
                    deletedAt: null,
                },
                {
                    id: doc2Id,
                    userId: userA,
                    notebookId: rootToDelete.id,
                    title: "Trash in root",
                    currentBody: "body2",
                    createdAt: now,
                    updatedAt: now,
                    deletedAt: now,
                },
                {
                    id: doc3Id,
                    userId: userA,
                    notebookId: child1.id,
                    title: "Doc in child",
                    currentBody: "body3",
                    createdAt: now,
                    updatedAt: now,
                    deletedAt: null,
                },
            ]);
        });

        // Delete rootToDelete
        await service.delete(userA, rootToDelete.id);

        // Verify rootToDelete is deleted
        const remainingNotebooks = await service.list(userA);
        assertEquals(
            remainingNotebooks.some((n) => n.id === rootToDelete.id),
            false,
        );
        assertEquals(
            remainingNotebooks.some((n) => n.id === otherRoot.id),
            true,
        );

        // Verify documents detachment:
        // doc1 and doc2 have notebookId = null
        // doc3 still has notebookId = child1.id
        await store.run(async (db) => {
            const [d1] = await db
                .select()
                .from(documents)
                .where(eq(documents.id, doc1Id))
                .all();
            const [d2] = await db
                .select()
                .from(documents)
                .where(eq(documents.id, doc2Id))
                .all();
            const [d3] = await db
                .select()
                .from(documents)
                .where(eq(documents.id, doc3Id))
                .all();

            assertEquals(d1.notebookId, null);
            assertEquals(d2.notebookId, null);
            assertEquals(d3.notebookId, child1.id);
        });

        // Verify child promotion:
        // child1 and child2 are promoted to root (parentId = null)
        // Their sortOrders are appended after otherRoot (which has sortOrder 0)
        // so child1 gets sortOrder 1, child2 gets sortOrder 2
        const promotedChild1 = remainingNotebooks.find((n) =>
            n.id === child1.id
        );
        const promotedChild2 = remainingNotebooks.find((n) =>
            n.id === child2.id
        );

        assertEquals(promotedChild1 !== undefined, true);
        assertEquals(promotedChild2 !== undefined, true);
        assertEquals(promotedChild1!.parentId, null);
        assertEquals(promotedChild2!.parentId, null);
        assertEquals(promotedChild1!.sortOrder, 1);
        assertEquals(promotedChild2!.sortOrder, 2);

        // Verify name is NOT deduplicated
        assertEquals(promotedChild2!.name, "Existing Root");
    } finally {
        await store.close();
    }
});

Deno.test("notebooks delete: non-existent notebook throws DocumentNotFoundError", async () => {
    const { store, service, userA } = await setupTestDb();
    try {
        await assertRejects(
            async () => {
                await service.delete(userA, "non-existent-id");
            },
            DocumentNotFoundError,
            "笔记本不存在",
        );
    } finally {
        await store.close();
    }
});
