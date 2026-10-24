import { assertEquals, assertRejects } from "@std/assert";
import type { DatabaseSync } from "node:sqlite";
import { type DatabaseStore, openDatabase } from "./database.ts";
import {
    HOME_NOTE_REFERENCE_GRID,
    migrateHomeNoteCells,
} from "./home-note-cells-migration.ts";

type JournalEntry = { idx: number; tag: string };

async function cellMigration(): Promise<{
    before: string[][];
    cell: string[];
}> {
    const journal: { entries: JournalEntry[] } = JSON.parse(
        await Deno.readTextFile(
            new URL("../../drizzle/meta/_journal.json", import.meta.url),
        ),
    );
    const target = journal.entries.findIndex((entry) =>
        entry.tag === "0030_nervous_phil_sheldon"
    );
    if (target < 0) throw new Error("Missing home note cell migration");
    const read = async (entry: JournalEntry) =>
        (await Deno.readTextFile(
            new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url),
        )).split("--> statement-breakpoint");
    return {
        before: await Promise.all(journal.entries.slice(0, target).map(read)),
        cell: await read(journal.entries[target]),
    };
}

async function prepare(): Promise<DatabaseStore> {
    const store = openDatabase(":memory:");
    const migration = await cellMigration();
    for (const statements of migration.before) store.migrate(statements);
    await store.nativeTransaction((native) => seed(native));
    // The size mapping runs in the same migration as the new columns, so seed
    // legacy rows first.
    store.migrate(migration.cell);
    return store;
}

function seed(native: DatabaseSync): void {
    native.exec(`
        INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at)
        VALUES ('owner', 'owner', 'Owner', 'hash', 1, 1);

        INSERT INTO documents (id, user_id, title, current_body, is_home_fixed, home_sort_order, created_at, updated_at)
        VALUES
            ('left', 'owner', 'Left', '', 1, 0, 1, 1),
            ('conflict', 'owner', 'Conflict', '', 1, 1, 1, 1),
            ('out-of-range', 'owner', 'Out', '', 1, 2, 1, 1),
            ('wide', 'owner', 'Wide', '', 1, 3, 1, 1),
            ('no-coordinate', 'owner', 'Home', '', 1, 4, 1, 1),
            ('hidden', 'owner', 'Hidden', '', 0, 5, 1, 1);

        INSERT INTO document_layouts
            (id, document_id, user_id, device_class, x, y, width, z_index, expanded, sort_order, updated_at)
        VALUES
            ('l-left', 'left', 'owner', 'desktop', 150, 200, 220, 1, 0, 0, 1),
            ('l-conflict', 'conflict', 'owner', 'desktop', 150, 200, 220, 2, 0, 0, 1),
            ('l-out', 'out-of-range', 'owner', 'desktop', -2000, 5000, 220, 3, 0, 0, 1),
            ('l-wide', 'wide', 'owner', 'desktop', 1100, 520, 220, 4, 1, 0, 1),
            ('l-none', 'no-coordinate', 'owner', 'desktop', NULL, NULL, NULL, 5, 1, 0, 1),
            ('l-hidden', 'hidden', 'owner', 'desktop', 100, 100, 220, 6, 0, 0, 1),
            ('l-tablet', 'left', 'owner', 'tablet', 100, 100, 220, 7, 1, 0, 1);
    `);
}

type LayoutRow = {
    id: string;
    col: number | null;
    row: number | null;
    size: string;
};

function readLayouts(native: DatabaseSync): LayoutRow[] {
    return native.prepare(
        "SELECT id, col, row, size FROM document_layouts ORDER BY id",
    ).all().map((row) => ({
        id: row.id,
        col: row.col,
        row: row.row,
        size: row.size,
    })) as LayoutRow[];
}

Deno.test("home note cell migration converts pixels, resolves conflicts and leaves unknown notes for default placement", async () => {
    const store = await prepare();
    try {
        // The reference grid is part of the frozen migration contract.
        assertEquals(HOME_NOTE_REFERENCE_GRID.rows, 2);
        assertEquals(
            HOME_NOTE_REFERENCE_GRID.columns.map((column) => column.band),
            ["left", "right"],
        );

        assertEquals(await migrateHomeNoteCells(store), 4);
        await store.exclusiveNative((native) => {
            assertEquals(readLayouts(native), [
                { id: "l-conflict", col: 1, row: 0, size: "s" },
                { id: "l-hidden", col: null, row: null, size: "s" },
                { id: "l-left", col: 0, row: 0, size: "s" },
                { id: "l-none", col: null, row: null, size: "w" },
                { id: "l-out", col: 0, row: 1, size: "s" },
                // A W needs two columns; this side only has one, so it is S.
                { id: "l-tablet", col: null, row: null, size: "w" },
                { id: "l-wide", col: 1, row: 1, size: "s" },
            ]);
            return Promise.resolve();
        });
        // Idempotent: a second run has nothing left to convert.
        assertEquals(await migrateHomeNoteCells(store), 0);
    } finally {
        await store.close();
    }
});

Deno.test("home note cell migration rolls back every row when one update fails", async () => {
    const store = await prepare();
    try {
        await store.nativeTransaction((native) => {
            native.exec(`
                CREATE TRIGGER fail_home_note_cells
                BEFORE UPDATE OF col ON document_layouts
                BEGIN
                    SELECT RAISE(ABORT, 'forced failure');
                END;
            `);
        });
        await assertRejects(
            () => migrateHomeNoteCells(store),
            Error,
            "forced failure",
        );
        await store.exclusiveNative((native) => {
            assertEquals(
                native.prepare(
                    "SELECT count(*) AS count FROM document_layouts WHERE col IS NOT NULL",
                ).all(),
                [{ count: 0 }],
            );
            // The failed transaction left the trigger in place but no data.
            native.exec("DROP TRIGGER fail_home_note_cells");
            return Promise.resolve();
        });
        await migrateHomeNoteCells(store);
        await store.exclusiveNative((native) => {
            assertEquals(
                native.prepare(
                    "SELECT count(*) AS count FROM document_layouts WHERE col IS NOT NULL",
                ).all(),
                [{ count: 4 }],
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});
