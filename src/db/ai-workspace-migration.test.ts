import { assertEquals } from "@std/assert";
import { openDatabase } from "./database.ts";

Deno.test("AI workspace upgrade preserves Provider data and reconstructs legacy variants", async () => {
    const store = openDatabase(":memory:");
    try {
        const journal: { entries: { idx: number; tag: string }[] } = JSON.parse(
            await Deno.readTextFile(
                new URL("../../drizzle/meta/_journal.json", import.meta.url),
            ),
        );
        const migrations = await Promise.all(
            journal.entries.map(async (entry) => ({
                idx: entry.idx,
                sql: (await Deno.readTextFile(
                    new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url),
                ))
                    .split("--> statement-breakpoint"),
            })),
        );
        await store.exclusiveNative(() => {
            for (
                const migration of migrations.filter((entry) => entry.idx <= 12)
            ) {
                store.migrate(migration.sql);
            }
            return Promise.resolve();
        });
        await store.run(async (db) => {
            await db.run(
                "INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('owner', 'owner', 'Owner', 'hash', 1, 1)",
            );
            await db.run(
                "INSERT INTO ai_providers (id, owner_user_id, scope, name, base_url, encrypted_api_key, created_at, updated_at) VALUES ('provider', 'owner', 'user', 'Provider', 'https://example.com/v1', 'encrypted', 1, 1)",
            );
            await db.run(
                "INSERT INTO ai_models (id, provider_id, model_id, display_name, updated_at) VALUES ('model', 'provider', 'custom', 'Custom', 1)",
            );
            await db.run(
                "INSERT INTO ai_conversations (id, user_id, title, created_at, updated_at) VALUES ('conversation', 'owner', 'Legacy', 1, 1)",
            );
            for (
                const [id, role, group, createdAt] of [
                    ["u1", "user", null, 10],
                    ["a1", "assistant", "a1", 20],
                    ["u2", "user", null, 30],
                    ["a2", "assistant", null, 40],
                    ["a1-retry", "assistant", "a1", 50],
                ] as const
            ) {
                await db.run(
                    `INSERT INTO ai_messages (id, conversation_id, role, content, provider_id, model_id, variant_group_id, created_at) VALUES ('${id}', 'conversation', '${role}', '${id}', 'provider', 'custom', ${
                        group ? `'${group}'` : "NULL"
                    }, ${createdAt})`,
                );
            }
        });
        await store.exclusiveNative(() => {
            for (
                const migration of migrations.filter((entry) => entry.idx > 12)
            ) {
                store.migrate(migration.sql);
            }
            return Promise.resolve();
        });
        await store.exclusiveNative((native) => {
            assertEquals(
                native.prepare(
                    "SELECT encrypted_api_key, discovery_mode FROM ai_providers WHERE id='provider'",
                ).all(),
                [{ encrypted_api_key: "encrypted", discovery_mode: "auto" }],
            );
            assertEquals(
                native.prepare(
                    "SELECT id FROM ai_models WHERE provider_id='provider'",
                ).all(),
                [{ id: "model" }],
            );
            assertEquals(
                native.prepare(
                    "SELECT id, parent_message_id, provider_id FROM ai_messages ORDER BY created_at",
                ).all(),
                [
                    {
                        id: "u1",
                        parent_message_id: null,
                        provider_id: "provider",
                    },
                    {
                        id: "a1",
                        parent_message_id: "u1",
                        provider_id: "provider",
                    },
                    {
                        id: "u2",
                        parent_message_id: "a1",
                        provider_id: "provider",
                    },
                    {
                        id: "a2",
                        parent_message_id: "u2",
                        provider_id: "provider",
                    },
                    {
                        id: "a1-retry",
                        parent_message_id: "u1",
                        provider_id: "provider",
                    },
                ],
            );
            assertEquals(
                native.prepare(
                    "SELECT active_leaf_message_id FROM ai_conversations WHERE id='conversation'",
                ).all(),
                [{ active_leaf_message_id: "a1-retry" }],
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});
