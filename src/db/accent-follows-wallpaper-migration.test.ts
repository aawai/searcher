import { assertEquals, assertThrows } from "@std/assert";
import { PreferencesService } from "../features/preferences/service.ts";
import { type DatabaseStore, openDatabase } from "./database.ts";

const TAG = "0028_accent_follows_wallpaper";

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

const USERS = ["violet", "unset", "default"] as const;

async function seedLegacy(store: DatabaseStore) {
    const { before, rest } = await migrationsAround(TAG);
    await store.exclusiveNative(() => {
        for (const statements of before) store.migrate(statements);
        return Promise.resolve();
    });
    await store.run(async (db) => {
        for (const id of [...USERS, "fresh"]) {
            await db.run(
                `INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('${id}', '${id}', '${id}', 'hash', 1, 1)`,
            );
        }
        await db.run(
            "INSERT INTO preferences (user_id, accent, show_app_labels) VALUES ('violet', 'violet', 0)",
        );
        await db.run(
            "INSERT INTO preferences (user_id, accent) VALUES ('unset', NULL)",
        );
        await db.run("INSERT INTO preferences (user_id) VALUES ('default')");
    });
    return rest;
}

Deno.test("accent migration keeps existing accounts' accent and makes new accounts follow the wallpaper", async () => {
    const store = openDatabase(":memory:");
    try {
        const rest = await seedLegacy(store);
        await store.exclusiveNative(() => {
            for (const statements of rest) store.migrate(statements);
            return Promise.resolve();
        });
        const service = new PreferencesService(store);
        const violet = await service.get("violet");
        assertEquals(violet.accent, "violet");
        assertEquals(violet.showAppLabels, false);
        // NULL and the old column default both rendered blue before the upgrade.
        assertEquals((await service.get("unset")).accent, "blue");
        assertEquals((await service.get("default")).accent, "blue");
        assertEquals((await service.get("fresh")).accent, "wallpaper");
        await store.exclusiveNative((native) => {
            assertThrows(() =>
                native.exec(
                    "UPDATE preferences SET accent = 'neon' WHERE user_id = 'violet'",
                )
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});

Deno.test("accent rollback SQL turns 'follow wallpaper' back into blue for the previous version", async () => {
    const store = openDatabase(":memory:");
    try {
        const rest = await seedLegacy(store);
        await store.exclusiveNative(() => {
            for (const statements of rest) store.migrate(statements);
            return Promise.resolve();
        });
        await new PreferencesService(store).update("fresh", {
            accent: "wallpaper",
        });
        const rollback = await Deno.readTextFile(
            new URL(`../../drizzle/rollback/${TAG}.sql`, import.meta.url),
        );
        await store.exclusiveNative((native) => {
            native.exec(rollback);
            assertEquals(
                native.prepare(
                    "SELECT user_id, accent FROM preferences ORDER BY user_id",
                ).all(),
                [
                    { user_id: "default", accent: "blue" },
                    { user_id: "fresh", accent: "blue" },
                    { user_id: "unset", accent: "blue" },
                    { user_id: "violet", accent: "violet" },
                ],
            );
            assertThrows(() =>
                native.exec(
                    "UPDATE preferences SET accent = 'wallpaper' WHERE user_id = 'violet'",
                )
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});
