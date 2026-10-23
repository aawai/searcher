import { assertEquals } from "@std/assert";
import { type DatabaseStore, openDatabase } from "./database.ts";
import { migrateDatabase } from "./migrate.ts";

type JournalEntry = { idx: number; tag: string; when: number };

const TRIGRAM_MIGRATION_IDX = 26;

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

// Builds the database exactly as migrations before the trigram index left it.
async function createPreTrigramDatabase(): Promise<DatabaseStore> {
    const journal: { entries: JournalEntry[] } = JSON.parse(
        await Deno.readTextFile(
            new URL("../../drizzle/meta/_journal.json", import.meta.url),
        ),
    );
    const store = openDatabase(":memory:");
    store.migrate([
        "CREATE TABLE IF NOT EXISTS `__drizzle_migrations` (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric)",
    ]);
    for (
        const entry of journal.entries.filter((e) =>
            e.idx < TRIGRAM_MIGRATION_IDX
        )
    ) {
        const sql = await Deno.readTextFile(
            new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url),
        );
        store.migrate([
            ...sql.split("--> statement-breakpoint"),
            `INSERT INTO \`__drizzle_migrations\` ("hash", "created_at") VALUES ('${await sha256Hex(
                sql,
            )}', '${entry.when}')`,
        ]);
    }
    return store;
}

const SEED = `
    INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at)
    VALUES ('owner', 'owner', 'Owner', 'hash', 1, 1), ('other', 'other', 'Other', 'hash', 1, 1);
    INSERT INTO documents (id, user_id, title, current_body, deleted_at, created_at, updated_at) VALUES
        ('live', 'owner', '散步', '今天的灵感来源是散步', NULL, 1, 1),
        ('trashed', 'owner', '回收', '被删除的灵感来源', 5, 1, 1),
        ('theirs', 'other', NULL, '别人的灵感来源', NULL, 1, 1);
`;

function matchIds(
    store: DatabaseStore,
    phrase: string,
): Promise<string[]> {
    return store.exclusiveNative((native) =>
        Promise.resolve(
            native.prepare(
                "SELECT document_id FROM documents_fts WHERE documents_fts MATCH ? ORDER BY document_id",
            ).all(`"${phrase}"`).map((row) => String(row.document_id)),
        )
    );
}

Deno.test("trigram migration rebuilds the index from live documents so CJK substrings match", async () => {
    const store = await createPreTrigramDatabase();
    try {
        await store.exclusiveNative((native) => {
            native.exec(SEED);
            return Promise.resolve();
        });
        // Before: unicode61 treats the CJK run as one token.
        assertEquals(await matchIds(store, "来源是"), []);

        await migrateDatabase(store);

        assertEquals(await matchIds(store, "来源是"), ["live"]);
        assertEquals(await matchIds(store, "灵感来源"), ["live", "theirs"]);
        assertEquals(await matchIds(store, "被删除"), []);
    } finally {
        await store.close();
    }
});

Deno.test("trigram index stays in sync with edits, soft delete and restore", async () => {
    const store = await createPreTrigramDatabase();
    try {
        await store.exclusiveNative((native) => {
            native.exec(SEED);
            return Promise.resolve();
        });
        await migrateDatabase(store);

        await store.exclusiveNative((native) => {
            native.exec(
                "UPDATE documents SET current_body = '傍晚的咖啡馆' WHERE id = 'live'",
            );
            return Promise.resolve();
        });
        assertEquals(await matchIds(store, "咖啡馆"), ["live"]);
        assertEquals(await matchIds(store, "来源是"), []);

        await store.exclusiveNative((native) => {
            native.exec(
                "UPDATE documents SET deleted_at = 9 WHERE id = 'live'",
            );
            return Promise.resolve();
        });
        assertEquals(await matchIds(store, "咖啡馆"), []);

        await store.exclusiveNative((native) => {
            native.exec(
                "UPDATE documents SET deleted_at = NULL WHERE id = 'live'",
            );
            return Promise.resolve();
        });
        assertEquals(await matchIds(store, "咖啡馆"), ["live"]);
    } finally {
        await store.close();
    }
});

Deno.test("rollback SQL restores the unicode61 index without touching documents", async () => {
    const store = await createPreTrigramDatabase();
    try {
        await store.exclusiveNative((native) => {
            native.exec(SEED);
            return Promise.resolve();
        });
        await migrateDatabase(store);
        const rollback = await Deno.readTextFile(
            new URL(
                "../../drizzle/rollback/0026_documents_fts_trigram.sql",
                import.meta.url,
            ),
        );
        await store.exclusiveNative((native) => {
            native.exec(rollback);
            return Promise.resolve();
        });

        // unicode61 semantics are back: whole-token match only, same live rows indexed.
        assertEquals(await matchIds(store, "来源是"), []);
        assertEquals(await matchIds(store, "今天的灵感来源是散步"), ["live"]);
        await store.exclusiveNative((native) => {
            assertEquals(
                native.prepare("SELECT count(*) AS n FROM documents").all(),
                [{ n: 3 }],
            );
            native.exec(
                "UPDATE documents SET current_body = 'syncedafterrollback' WHERE id = 'live'",
            );
            return Promise.resolve();
        });
        assertEquals(await matchIds(store, "syncedafterrollback"), ["live"]);
    } finally {
        await store.close();
    }
});
