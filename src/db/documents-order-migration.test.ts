import { assertEquals } from "@std/assert";
import { type DatabaseStore, openDatabase } from "./database.ts";
import { migrateDatabase } from "./migrate.ts";

type JournalEntry = { idx: number; tag: string; when: number };

async function createPreviousDatabase(): Promise<DatabaseStore> {
    const journal: { entries: JournalEntry[] } = JSON.parse(
        await Deno.readTextFile(
            new URL("../../drizzle/meta/_journal.json", import.meta.url),
        ),
    );
    const store = openDatabase(":memory:");
    store.migrate([
        "CREATE TABLE IF NOT EXISTS `__drizzle_migrations` (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric)",
    ]);
    for (const entry of journal.entries.filter((entry) => entry.idx < 36)) {
        const sql = await Deno.readTextFile(
            new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url),
        );
        const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(sql),
        );
        const hash = Array.from(
            new Uint8Array(digest),
            (byte) => byte.toString(16).padStart(2, "0"),
        ).join("");
        store.migrate([
            ...sql.split("--> statement-breakpoint"),
            `INSERT INTO \`__drizzle_migrations\` ("hash", "created_at") VALUES ('${hash}', '${entry.when}')`,
        ]);
    }
    return store;
}

Deno.test("document order migration backfills each user and notebook including trash and can be rolled back", async () => {
    const store = await createPreviousDatabase();
    try {
        await store.exclusiveNative((native) => {
            native.exec(`
                INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at)
                VALUES ('owner', 'owner', 'Owner', 'hash', 1, 1), ('other', 'other', 'Other', 'hash', 1, 1);
                INSERT INTO document_notebooks (id, user_id, name, created_at, updated_at)
                VALUES ('book', 'owner', 'Book', 1, 1);
                INSERT INTO documents (id, user_id, notebook_id, deleted_at, created_at, updated_at)
                VALUES ('a', 'owner', NULL, NULL, 1, 10),
                       ('b', 'owner', NULL, 9, 1, 10),
                       ('c', 'owner', NULL, NULL, 1, 5),
                       ('d', 'owner', 'book', NULL, 1, 3),
                       ('e', 'other', NULL, NULL, 1, 2);
            `);
            return Promise.resolve();
        });
        await migrateDatabase(store);
        await store.exclusiveNative((native) => {
            assertEquals(
                native.prepare(
                    "SELECT id, sort_order, last_opened_at, updated_at, deleted_at FROM documents ORDER BY id",
                ).all(),
                [
                    {
                        id: "a",
                        sort_order: 1,
                        last_opened_at: null,
                        updated_at: 10,
                        deleted_at: null,
                    },
                    {
                        id: "b",
                        sort_order: 0,
                        last_opened_at: null,
                        updated_at: 10,
                        deleted_at: 9,
                    },
                    {
                        id: "c",
                        sort_order: 2,
                        last_opened_at: null,
                        updated_at: 5,
                        deleted_at: null,
                    },
                    {
                        id: "d",
                        sort_order: 0,
                        last_opened_at: null,
                        updated_at: 3,
                        deleted_at: null,
                    },
                    {
                        id: "e",
                        sort_order: 0,
                        last_opened_at: null,
                        updated_at: 2,
                        deleted_at: null,
                    },
                ],
            );
            native.exec(
                "INSERT INTO documents (id, user_id, created_at, updated_at) VALUES ('new', 'owner', 1, 1)",
            );
            assertEquals(
                native.prepare(
                    "SELECT sort_order, last_opened_at FROM documents WHERE id = 'new'",
                ).all(),
                [{ sort_order: 0, last_opened_at: null }],
            );
            assertEquals(
                native.prepare(
                    "SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('documents_user_last_opened_idx', 'documents_user_notebook_sort_idx') ORDER BY name",
                ).all(),
                [{ name: "documents_user_last_opened_idx" }, {
                    name: "documents_user_notebook_sort_idx",
                }],
            );
            return Promise.resolve();
        });
        const rollback = await Deno.readTextFile(
            new URL(
                "../../drizzle/rollback/0036_damp_stardust.sql",
                import.meta.url,
            ),
        );
        await store.exclusiveNative((native) => {
            native.exec(rollback);
            assertEquals(
                native.prepare(
                    "SELECT id, updated_at, deleted_at FROM documents WHERE id = 'b'",
                ).all(),
                [{ id: "b", updated_at: 10, deleted_at: 9 }],
            );
            assertEquals(
                native.prepare(
                    "SELECT name FROM pragma_table_info('documents') WHERE name IN ('sort_order', 'last_opened_at')",
                ).all(),
                [],
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});
