import { assertEquals, assertRejects } from "@std/assert";
import { openDatabase } from "./database.ts";
import { migrateDatabase } from "./migrate.ts";
import { users } from "./schema.ts";

Deno.test({
    name:
        "database: openDatabase with :memory: and migrateDatabase is idempotent",
    async fn() {
        const store = openDatabase(":memory:");
        try {
            // First migration run
            await migrateDatabase(store);

            // Verify tables exist and can be queried
            const countBefore = await store.run(async (db) => {
                return await db.select().from(users).all();
            });
            assertEquals(countBefore.length, 0);

            // Second migration run should be idempotent and succeed without error
            await migrateDatabase(store);

            const countAfter = await store.run(async (db) => {
                return await db.select().from(users).all();
            });
            assertEquals(countAfter.length, 0);
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "database: run queue executes in FIFO order with promise coordination",
    async fn() {
        const store = openDatabase(":memory:");
        try {
            await migrateDatabase(store);

            const log: number[] = [];
            const gate1 = Promise.withResolvers<void>();
            const gate2 = Promise.withResolvers<void>();

            const p1 = store.run(async () => {
                await gate1.promise;
                log.push(1);
                return 1;
            });

            const p2 = store.run(async () => {
                await gate2.promise;
                log.push(2);
                return 2;
            });

            const p3 = store.run(() => {
                log.push(3);
                return Promise.resolve(3);
            });

            // Even if gate2 is resolved first, p2 cannot run before p1 completes because of FIFO #tail queue
            gate2.resolve();
            gate1.resolve();

            const results = await Promise.all([p1, p2, p3]);
            assertEquals(results, [1, 2, 3]);
            assertEquals(log, [1, 2, 3]);
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "database: transaction rollback preserves consistency and next FIFO operations succeed",
    async fn() {
        const store = openDatabase(":memory:");
        try {
            await migrateDatabase(store);

            const now = Date.now();
            const id1 = crypto.randomUUID();

            // Insert initial record
            await store.run(async (db) => {
                await db.insert(users).values({
                    id: id1,
                    username: "user_initial",
                    displayName: "User Initial",
                    passwordHash: "hash1",
                    role: "user",
                    disabled: false,
                    authVersion: 1,
                    createdAt: now,
                    updatedAt: now,
                });
            });

            // Failed transaction should rollback completely
            const id2 = crypto.randomUUID();
            await assertRejects(
                async () => {
                    await store.run(async (db) => {
                        await db.transaction(async (tx) => {
                            await tx.insert(users).values({
                                id: id2,
                                username: "user_to_rollback",
                                displayName: "User Rollback",
                                passwordHash: "hash2",
                                role: "user",
                                disabled: false,
                                authVersion: 1,
                                createdAt: now,
                                updatedAt: now,
                            });
                            // Intentionally throw error inside transaction
                            throw new Error("Simulated transaction failure");
                        });
                    });
                },
                Error,
                "Simulated transaction failure",
            );

            // Check that id2 was rolled back and was not persisted
            const rows = await store.run(async (db) => {
                return await db.select().from(users).all();
            });
            assertEquals(rows.length, 1);
            assertEquals(rows[0].id, id1);

            // Next FIFO operation after failure must execute successfully
            const id3 = crypto.randomUUID();
            await store.run(async (db) => {
                await db.insert(users).values({
                    id: id3,
                    username: "user_subsequent",
                    displayName: "User Subsequent",
                    passwordHash: "hash3",
                    role: "user",
                    disabled: false,
                    authVersion: 1,
                    createdAt: now,
                    updatedAt: now,
                });
            });

            const rowsAfter = await store.run(async (db) => {
                return await db.select().from(users).all();
            });
            assertEquals(rowsAfter.length, 2);
        } finally {
            await store.close();
        }
    },
});
