import { assertEquals } from "@std/assert";
import { openDatabase } from "./database.ts";

type Migration = { idx: number; sql: string[] };

type MigrationJournal = {
    entries: Array<{ idx: number; tag: string }>;
};

Deno.test("desktop scene migration preserves legacy preference rows", async () => {
    const store = openDatabase(":memory:");
    try {
        const journal: MigrationJournal = JSON.parse(
            await Deno.readTextFile(
                new URL("../../drizzle/meta/_journal.json", import.meta.url),
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

        await store.exclusiveNative(() => {
            for (const migration of migrations.filter(({ idx }) => idx < 20)) {
                store.migrate(migration.sql);
            }
            return Promise.resolve();
        });
        await store.run(async (db) => {
            await db.run(
                "INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('legacy', 'legacy', 'Legacy', 'hash', 1, 1)",
            );
            await db.run(
                "INSERT INTO preferences (user_id, default_engine, theme, accent) VALUES ('legacy', 'google', 'dark', 'emerald')",
            );
        });

        const desktopSceneMigration = migrations.find(({ idx }) => idx === 20);
        if (!desktopSceneMigration) {
            throw new Error("Missing desktop scene migration 0020");
        }
        await store.exclusiveNative(() => {
            store.migrate(desktopSceneMigration.sql);
            return Promise.resolve();
        });
        await store.exclusiveNative((native) => {
            assertEquals(
                native.prepare(
                    "SELECT default_engine, theme, accent, desktop_scene FROM preferences WHERE user_id = 'legacy'",
                ).all(),
                [{
                    default_engine: "google",
                    theme: "dark",
                    accent: "emerald",
                    desktop_scene: "none",
                }],
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});
