import { assertEquals, assertThrows } from "@std/assert";
import type { DatabaseSync } from "node:sqlite";
import { type DatabaseStore, openDatabase } from "./database.ts";
import { migrateDatabase } from "./migrate.ts";

type JournalEntry = { idx: number; tag: string; when: number };

const LAST_LEGACY_IDX = 23;

async function sha256Hex(text: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
    );
    return Array.from(
        new Uint8Array(digest),
        (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
}

async function readLegacyMigrations(): Promise<
    { hash: string; when: number; statements: string[] }[]
> {
    const journal: { entries: JournalEntry[] } = JSON.parse(
        await Deno.readTextFile(
            new URL("../../drizzle/meta/_journal.json", import.meta.url),
        ),
    );
    return await Promise.all(
        journal.entries
            .filter((entry) => entry.idx <= LAST_LEGACY_IDX)
            .map(async (entry) => {
                const sql = await Deno.readTextFile(
                    new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url),
                );
                return {
                    hash: await sha256Hex(sql),
                    when: entry.when,
                    statements: sql.split("--> statement-breakpoint"),
                };
            }),
    );
}

// Builds a database exactly as the pre-unification schema (migrations 0000–0023) left it,
// including drizzle's migration ledger so the upgrade path only runs the new migration.
async function createLegacyDatabase(): Promise<DatabaseStore> {
    const store = openDatabase(":memory:");
    store.migrate([
        "CREATE TABLE IF NOT EXISTS `__drizzle_migrations` (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric)",
    ]);
    for (const migration of await readLegacyMigrations()) {
        store.migrate([
            ...migration.statements,
            `INSERT INTO \`__drizzle_migrations\` ("hash", "created_at") VALUES ('${migration.hash}', '${migration.when}')`,
        ]);
    }
    return store;
}

function seedLegacyData(native: DatabaseSync): void {
    native.exec(`
        INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at)
        VALUES ('owner', 'owner', 'Owner', 'hash', 1, 1);
        INSERT INTO documents (id, user_id, notebook_id, title, current_body, current_version, is_favorite, deleted_at, created_at, updated_at)
        VALUES ('doc-1', 'owner', NULL, 'Legacy document', 'upgrade body', 1, 0, NULL, 1, 1);
        INSERT INTO document_versions (id, document_id, user_id, version, title, body, reason, created_at)
        VALUES ('dv-1', 'doc-1', 'owner', 1, 'Legacy document', 'upgrade body', 'snapshot', 1);
        INSERT INTO document_settings (document_id, user_id, updated_at)
        VALUES ('doc-1', 'owner', 1);
        INSERT INTO document_assets (id, document_id, user_id, mime_type, byte_size, sha256, original_name, storage_ref, data, created_at)
        VALUES ('asset-1', 'doc-1', 'owner', 'image/png', 1, 'hash', 'a.png', 'ref', X'00', 1);
        INSERT INTO notes (id, user_id, title, current_body, content, current_version, is_pinned, is_home_fixed, color, sort_order, created_at, updated_at)
        VALUES ('note-1', 'owner', 'Legacy note', 'note body', 'note body', 1, 0, 1, 'amber', 0, 1, 1);
        INSERT INTO note_versions (id, note_id, user_id, version, title, body, reason, created_at)
        VALUES ('nv-1', 'note-1', 'owner', 1, 'Legacy note', 'note body', 'snapshot', 1);
        INSERT INTO note_layouts (id, note_id, user_id, device_class, updated_at)
        VALUES ('nl-1', 'note-1', 'owner', 'desktop', 1);
    `);
}

Deno.test("notes unification upgrade keeps documents and removes legacy notes data", async () => {
    const store = await createLegacyDatabase();
    try {
        await store.exclusiveNative((native) => {
            seedLegacyData(native);
            return Promise.resolve();
        });

        await migrateDatabase(store);

        await store.exclusiveNative((native) => {
            assertEquals(
                native.prepare(
                    "SELECT name FROM sqlite_master WHERE name LIKE 'note%' ORDER BY name",
                ).all(),
                [],
            );
            assertEquals(
                native.prepare(
                    "SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name",
                ).all(),
                [{ name: "documents_ad" }, { name: "documents_ai" }, {
                    name: "documents_au",
                }],
            );
            assertEquals(
                native.prepare(
                    "SELECT id, title, current_body, color, is_home_fixed, home_sort_order FROM documents",
                ).all(),
                [{
                    id: "doc-1",
                    title: "Legacy document",
                    current_body: "upgrade body",
                    color: "paper",
                    is_home_fixed: 0,
                    home_sort_order: 0,
                }],
            );
            assertEquals(
                native.prepare(
                    `SELECT
                        (SELECT count(*) FROM document_versions) AS versions,
                        (SELECT count(*) FROM document_settings) AS settings,
                        (SELECT count(*) FROM document_assets) AS assets,
                        (SELECT count(*) FROM document_layouts) AS layouts`,
                ).all(),
                [{ versions: 1, settings: 1, assets: 1, layouts: 0 }],
            );
            assertEquals(
                native.prepare("PRAGMA foreign_key_check").all(),
                [],
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});

Deno.test("upgraded documents keep FTS sync and accept nullable titles and document colors", async () => {
    const store = await createLegacyDatabase();
    try {
        await store.exclusiveNative((native) => {
            seedLegacyData(native);
            return Promise.resolve();
        });

        await migrateDatabase(store);

        await store.exclusiveNative((native) => {
            native.exec(
                "UPDATE documents SET current_body = 'searchable after upgrade' WHERE id = 'doc-1'",
            );
            assertEquals(
                native.prepare(
                    "SELECT document_id FROM documents_fts WHERE documents_fts MATCH 'searchable'",
                ).all(),
                [{ document_id: "doc-1" }],
            );

            native.exec(
                "INSERT INTO documents (id, user_id, title, current_body, created_at, updated_at) VALUES ('doc-null', 'owner', NULL, 'fresh', 2, 2)",
            );
            native.exec(
                "INSERT INTO document_versions (id, document_id, user_id, version, title, body, reason, created_at) VALUES ('dv-null', 'doc-null', 'owner', 1, NULL, 'fresh', 'snapshot', 2)",
            );
            assertThrows(() =>
                native.exec(
                    "INSERT INTO documents (id, user_id, title, current_body, color, created_at, updated_at) VALUES ('doc-red', 'owner', 'x', '', 'red', 2, 2)",
                )
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});
