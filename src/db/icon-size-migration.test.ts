import { assertEquals } from "@std/assert";
import { PreferencesService } from "../features/preferences/service.ts";
import { openDatabase } from "./database.ts";

Deno.test("icon size removal migrates every legacy tier without losing readable preferences", async () => {
    const store = openDatabase(":memory:");
    try {
        const journal: { entries: Array<{ tag: string }> } = JSON.parse(
            await Deno.readTextFile(
                new URL("../../drizzle/meta/_journal.json", import.meta.url),
            ),
        );
        const removalIndex = journal.entries.findIndex(({ tag }) =>
            tag === "0023_mute_terror"
        );
        if (removalIndex < 0) {
            throw new Error("Missing icon size removal migration");
        }
        const migrations = await Promise.all(
            journal.entries.map(async ({ tag }) =>
                (await Deno.readTextFile(
                    new URL(`../../drizzle/${tag}.sql`, import.meta.url),
                )).split("--> statement-breakpoint")
            ),
        );
        await store.exclusiveNative(() => {
            for (const statements of migrations.slice(0, removalIndex)) {
                store.migrate(statements);
            }
            return Promise.resolve();
        });
        const tiers = ["compact", "default", "large"];
        await store.run(async (db) => {
            for (const tier of tiers) {
                await db.run(
                    `INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('${tier}', '${tier}', '${tier}', 'hash', 1, 1)`,
                );
                await db.run(
                    `INSERT INTO preferences (user_id, webapp_icon_size, show_app_labels, webapp_home_limit, accent) VALUES ('${tier}', '${tier}', 0, '16', 'violet')`,
                );
            }
        });
        await store.exclusiveNative(() => {
            for (const statements of migrations.slice(removalIndex)) {
                store.migrate(statements);
            }
            return Promise.resolve();
        });
        const service = new PreferencesService(store);
        for (const tier of tiers) {
            const result = await service.get(tier);
            assertEquals(result.showAppLabels, false);
            assertEquals(result.webAppHomeLimit, 16);
            assertEquals(result.accent, "violet");
            assertEquals("webAppIconSize" in result, false);
        }
        await store.exclusiveNative((native) => {
            const columns = native.prepare("PRAGMA table_info(preferences)")
                .all() as Array<{ name: string }>;
            assertEquals(
                columns.some(({ name }) => name === "webapp_icon_size"),
                false,
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});
