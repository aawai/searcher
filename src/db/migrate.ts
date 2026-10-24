import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import { type DatabaseStore, openDatabase } from "./database.ts";
import { migrateHomeNoteCells } from "./home-note-cells-migration.ts";

export async function migrateDatabase(store: DatabaseStore): Promise<void> {
    await store.run(async (db) => {
        await migrate(db, (statements) => {
            store.migrate(statements);
            return Promise.resolve();
        }, { migrationsFolder: "./drizzle" });
    });
    // Pixel layouts added before #285 Y3 cannot be converted in SQL; this step
    // is idempotent and runs after the schema has col/row/size.
    await migrateHomeNoteCells(store);
}

if (import.meta.main) {
    const store = openDatabase(
        Deno.env.get("DATABASE_PATH") ?? "./data/searcher.sqlite",
    );
    try {
        await migrateDatabase(store);
        console.log("Database migrated");
    } finally {
        await store.close();
    }
}
