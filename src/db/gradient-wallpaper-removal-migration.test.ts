import { assertEquals } from "@std/assert";
import { PreferencesService } from "../features/preferences/service.ts";
import { openDatabase } from "./database.ts";

Deno.test("gradient wallpaper removal clears only gradient backgrounds", async () => {
    const store = openDatabase(":memory:");
    try {
        const journal: { entries: Array<{ tag: string }> } = JSON.parse(
            await Deno.readTextFile(
                new URL("../../drizzle/meta/_journal.json", import.meta.url),
            ),
        );
        const removalIndex = journal.entries.findIndex(({ tag }) =>
            tag === "0035_remove_gradient_wallpaper"
        );
        if (removalIndex < 0) {
            throw new Error("Missing gradient wallpaper removal migration");
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
        const uploaded = "/api/wallpaper/12345678-1234-1234-1234-123456789abc";
        const remote = "https://example.com/wallpaper.jpg";
        const rows: Array<[string, string | null]> = [
            ["gradient", "linear-gradient(135deg, #102030, #405060)"],
            ["uploaded", uploaded],
            ["remote", remote],
            ["none", null],
        ];
        await store.run(async (db) => {
            for (const [id, background] of rows) {
                await db.run(
                    `INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('${id}', '${id}', '${id}', 'hash', 1, 1)`,
                );
                await db.run(
                    `INSERT INTO preferences (user_id, background_image, accent) VALUES ('${id}', ${
                        background ? `'${background}'` : "NULL"
                    }, 'violet')`,
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
        const result: Record<string, string | null> = {};
        for (const [id] of rows) {
            const preferences = await service.get(id);
            result[id] = preferences.backgroundImage ?? null;
            assertEquals(preferences.accent, "violet");
        }
        assertEquals(result, {
            gradient: null,
            uploaded,
            remote,
            none: null,
        });
    } finally {
        await store.close();
    }
});
