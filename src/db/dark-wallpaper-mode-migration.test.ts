import { assertEquals, assertThrows } from "@std/assert";
import { PreferencesService } from "../features/preferences/service.ts";
import { openDatabase } from "./database.ts";

const TAG = "0048_slippery_talos";

async function migrationsAround(tag: string) {
    const journal: { entries: Array<{ tag: string }> } = JSON.parse(
        await Deno.readTextFile(
            new URL("../../drizzle/meta/_journal.json", import.meta.url),
        ),
    );
    const index = journal.entries.findIndex((entry) => entry.tag === tag);
    if (index < 0) throw new Error(`Missing migration ${tag}`);
    const migrations = await Promise.all(
        journal.entries.map(async (entry) =>
            (await Deno.readTextFile(
                new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url),
            )).split("--> statement-breakpoint")
        ),
    );
    return {
        before: migrations.slice(0, index),
        rest: migrations.slice(index),
    };
}

Deno.test("darkWallpaperMode migration converts legacy 'auto' to 'follow', preserves other modes, and enforces 4-mode CHECK", async () => {
    const store = openDatabase(":memory:");
    try {
        const { before, rest } = await migrationsAround(TAG);
        await store.exclusiveNative(() => {
            for (const statements of before) store.migrate(statements);
            return Promise.resolve();
        });

        const legacyRows = [
            { id: "u-auto", mode: "auto" },
            { id: "u-default", mode: null },
            { id: "u-follow", mode: "follow" },
            { id: "u-ambient", mode: "ambient" },
            { id: "u-canvas", mode: "canvas" },
            { id: "u-custom", mode: "custom" },
        ] as const;

        await store.run(async (db) => {
            for (const row of legacyRows) {
                await db.run(
                    `INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('${row.id}', '${row.id}', '${row.id}', 'hash', 1, 1)`,
                );
                if (row.mode === null) {
                    await db.run(
                        `INSERT INTO preferences (user_id, accent, background_image, dark_background_image) VALUES ('${row.id}', 'violet', 'https://example.com/${row.id}.jpg', 'https://example.com/${row.id}-dark.jpg')`,
                    );
                } else {
                    await db.run(
                        `INSERT INTO preferences (user_id, accent, background_image, dark_wallpaper_mode, dark_background_image) VALUES ('${row.id}', 'violet', 'https://example.com/${row.id}.jpg', '${row.mode}', 'https://example.com/${row.id}-dark.jpg')`,
                    );
                }
            }
            await db.run(
                `INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('u-new', 'u-new', 'u-new', 'hash', 1, 1)`,
            );
        });

        await store.exclusiveNative(() => {
            for (const statements of rest) store.migrate(statements);
            return Promise.resolve();
        });

        const service = new PreferencesService(store);

        const expectedModes: Record<string, string> = {
            "u-auto": "follow",
            "u-default": "follow",
            "u-follow": "follow",
            "u-ambient": "ambient",
            "u-canvas": "canvas",
            "u-custom": "custom",
        };
        for (const row of legacyRows) {
            const prefs = await service.get(row.id);
            assertEquals(prefs.darkWallpaperMode, expectedModes[row.id]);
            assertEquals(prefs.accent, "violet");
            assertEquals(
                prefs.backgroundImage,
                `https://example.com/${row.id}.jpg`,
            );
            assertEquals(
                prefs.darkBackgroundImage,
                `https://example.com/${row.id}-dark.jpg`,
            );
        }

        // New rows without explicit dark_wallpaper_mode default to 'follow'
        await store.run(async (db) => {
            await db.run(
                `INSERT INTO preferences (user_id) VALUES ('u-new')`,
            );
        });
        assertEquals((await service.get("u-new")).darkWallpaperMode, "follow");

        // Database CHECK rejects 'auto'
        await store.exclusiveNative((native) => {
            assertThrows(() =>
                native.exec(
                    "UPDATE preferences SET dark_wallpaper_mode = 'auto' WHERE user_id = 'u-follow'",
                )
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});
