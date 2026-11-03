import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import { type DatabaseStore, openDatabase } from "./database.ts";

export async function migrateDatabase(store: DatabaseStore): Promise<void> {
    await store.run(async (db) => {
        await migrate(db, (statements) => {
            store.migrate(statements);
            return Promise.resolve();
        }, { migrationsFolder: "./drizzle" });
    });
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
