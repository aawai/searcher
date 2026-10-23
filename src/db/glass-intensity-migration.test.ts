import { assertEquals } from "@std/assert";
import { openDatabase } from "./database.ts";

type Migration = { idx: number; sql: string[] };

Deno.test("glass intensity migration maps legacy search_opacity to tiers and drops the column", async () => {
    const store = openDatabase(":memory:");
    try {
        const journal: { entries: Array<{ idx: number; tag: string }> } = JSON
            .parse(
                await Deno.readTextFile(
                    new URL(
                        "../../drizzle/meta/_journal.json",
                        import.meta.url,
                    ),
                ),
            );
        const migrations: Migration[] = await Promise.all(
            journal.entries.map(async (entry) => ({
                idx: entry.idx,
                sql: (await Deno.readTextFile(
                    new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url),
                )).split("--> statement-breakpoint"),
            })),
        );
        const glassIdx = migrations.find(({ sql }) =>
            sql.some((statement) => statement.includes("glass_intensity"))
        )?.idx;
        if (glassIdx === undefined) {
            throw new Error("no migration introduces glass_intensity");
        }

        await store.exclusiveNative(() => {
            for (
                const migration of migrations.filter(({ idx }) =>
                    idx < glassIdx
                )
            ) {
                store.migrate(migration.sql);
            }
            return Promise.resolve();
        });
        const legacy: Array<[string, number]> = [
            ["opaque", 1],
            ["translucent", 0.72],
            ["boundary", 0.5],
            ["minimum", 0.1],
        ];
        await store.run(async (db) => {
            for (const [id, opacity] of legacy) {
                await db.run(
                    `INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('${id}', '${id}', '${id}', 'hash', 1, 1)`,
                );
                await db.run(
                    `INSERT INTO preferences (user_id, search_opacity) VALUES ('${id}', ${opacity})`,
                );
            }
        });
        await store.exclusiveNative(() => {
            for (
                const migration of migrations.filter(({ idx }) =>
                    idx >= glassIdx
                )
            ) {
                store.migrate(migration.sql);
            }
            return Promise.resolve();
        });
        await store.exclusiveNative((native) => {
            const columns = native.prepare("PRAGMA table_info(preferences)")
                .all() as Array<{ name: string }>;
            assertEquals(
                columns.some(({ name }) => name === "search_opacity"),
                false,
            );
            const rows = native.prepare(
                "SELECT user_id, glass_intensity FROM preferences ORDER BY user_id",
            ).all();
            assertEquals(rows, [
                { user_id: "boundary", glass_intensity: "clear" },
                { user_id: "minimum", glass_intensity: "clear" },
                { user_id: "opaque", glass_intensity: "regular" },
                { user_id: "translucent", glass_intensity: "regular" },
            ]);
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});
