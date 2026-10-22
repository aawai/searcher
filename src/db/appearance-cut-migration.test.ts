import { assertEquals } from "@std/assert";
import { openDatabase } from "./database.ts";

type Migration = { idx: number; sql: string[] };

type MigrationJournal = {
    entries: Array<{ idx: number; tag: string }>;
};

Deno.test("appearance cut migration drops removed preference columns and keeps row data", async () => {
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
            for (const migration of migrations.filter(({ idx }) => idx < 21)) {
                store.migrate(migration.sql);
            }
            return Promise.resolve();
        });
        await store.run(async (db) => {
            await db.run(
                "INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('legacy', 'legacy', 'Legacy', 'hash', 1, 1)",
            );
            await db.run(
                `INSERT INTO preferences (user_id, default_engine, theme, accent, background_image, background_opacity, wallpaper_mask, search_target, search_history_enabled, webapp_home_limit, style, visual_style, search_shape, search_opacity, webapp_icon_size, wallpaper_blur, wallpaper_grayscale, wallpaper_glow_strength, ambient_motion_mode, ambient_motion_strength, wallpaper_presentations) VALUES ('legacy', 'google', 'dark', 'emerald', 'https://example.com/bg.png', 0.5, 0.42, 'new', 1, '16', 'zen', 'linear-dark', 'pill', 0.5, 'large', 2, 0.5, 0.2, 'breathe', 0.5, '{"https://example.com/bg.png":{"composition":"cover","readability":"quiet","motion":"drift"}}')`,
            );
        });

        const cutMigration = migrations.find(({ idx }) => idx === 21);
        if (!cutMigration) {
            throw new Error("Missing appearance cut migration 0021");
        }
        await store.exclusiveNative(() => {
            store.migrate(cutMigration.sql);
            return Promise.resolve();
        });

        await store.exclusiveNative((native) => {
            assertEquals(
                native.prepare(
                    "SELECT name FROM pragma_table_info('preferences') ORDER BY name",
                ).all(),
                [
                    { name: "accent" },
                    { name: "ai_generation_defaults" },
                    { name: "background_image" },
                    { name: "default_engine" },
                    { name: "search_history_enabled" },
                    { name: "search_opacity" },
                    { name: "search_shape" },
                    { name: "search_target" },
                    { name: "show_app_labels" },
                    { name: "theme" },
                    { name: "user_id" },
                    { name: "wallpaper_compositions" },
                    { name: "wallpaper_mask" },
                    { name: "wallpaper_presentations" },
                    { name: "webapp_home_limit" },
                    { name: "webapp_icon_size" },
                ],
            );
            assertEquals(
                native.prepare(
                    "SELECT default_engine, theme, accent, search_shape, search_opacity, background_image, wallpaper_mask, search_target, search_history_enabled, webapp_home_limit, webapp_icon_size, show_app_labels, wallpaper_presentations FROM preferences WHERE user_id = 'legacy'",
                ).all(),
                [{
                    default_engine: "google",
                    theme: "dark",
                    accent: "emerald",
                    search_shape: "pill",
                    search_opacity: 0.5,
                    background_image: "https://example.com/bg.png",
                    wallpaper_mask: 0.42,
                    search_target: "new",
                    search_history_enabled: 1,
                    webapp_home_limit: "16",
                    webapp_icon_size: "large",
                    show_app_labels: 1,
                    wallpaper_presentations:
                        '{"https://example.com/bg.png":{"composition":"cover","readability":"quiet","motion":"drift"}}',
                }],
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});
