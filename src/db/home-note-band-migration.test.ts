import { assertEquals } from "@std/assert";
import { openDatabase } from "./database.ts";

const TAG = "0031_foamy_archangel";

async function migrations() {
    const journal: { entries: Array<{ tag: string }> } = JSON.parse(
        await Deno.readTextFile(
            new URL("../../drizzle/meta/_journal.json", import.meta.url),
        ),
    );
    const index = journal.entries.findIndex((entry) => entry.tag === TAG);
    if (index < 0) throw new Error(`Missing migration ${TAG}`);
    const statements = await Promise.all(
        journal.entries.map(async (entry) =>
            (await Deno.readTextFile(
                new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url),
            )).split("--> statement-breakpoint")
        ),
    );
    return { before: statements.slice(0, index), own: statements[index] };
}

async function seed() {
    const store = openDatabase(":memory:");
    const { before, own } = await migrations();
    await store.exclusiveNative(() => {
        for (const group of before) store.migrate(group);
        return Promise.resolve();
    });
    await store.run(async (db) => {
        await db.run(
            `INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('u1', 'u1', 'u1', 'hash', 1, 1)`,
        );
        await db.run(
            `INSERT INTO documents (id, user_id, title, current_body, is_home_fixed, home_sort_order, created_at, updated_at) VALUES
                ('inner-left', 'u1', 'Inner left', '', 1, 0, 1, 1),
                ('inner-right', 'u1', 'Inner right', '', 1, 1, 1, 1),
                ('outer-right', 'u1', 'Outer right', '', 1, 2, 1, 1),
                ('unplaced', 'u1', 'Unplaced', '', 1, 3, 1, 1)`,
        );
        await db.run(
            `INSERT INTO document_layouts (id, document_id, user_id, col, row, size, updated_at) VALUES
                ('l-inner-left', 'inner-left', 'u1', 0, 0, 's', 1),
                ('l-inner-right', 'inner-right', 'u1', 1, 2, 'w', 1),
                ('l-outer-right', 'outer-right', 'u1', 4, 1, 's', 1),
                ('l-unplaced', 'unplaced', 'u1', NULL, NULL, 's', 1)`,
        );
    });
    return { store, own };
}

Deno.test("band migration maps legacy flat columns to band-relative cells", async () => {
    const { store, own } = await seed();
    try {
        await store.exclusiveNative(() => {
            store.migrate(own);
            return Promise.resolve();
        });
        await store.exclusiveNative((native) => {
            assertEquals(
                native.prepare(
                    "SELECT id, band, col, row, size FROM document_layouts ORDER BY id",
                ).all(),
                [
                    {
                        id: "l-inner-left",
                        band: "left",
                        col: 0,
                        row: 0,
                        size: "s",
                    },
                    {
                        id: "l-inner-right",
                        band: "right",
                        col: 0,
                        row: 2,
                        size: "w",
                    },
                    {
                        id: "l-outer-right",
                        band: "right",
                        col: 3,
                        row: 1,
                        size: "s",
                    },
                    {
                        id: "l-unplaced",
                        band: null,
                        col: null,
                        row: null,
                        size: "s",
                    },
                ],
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});
