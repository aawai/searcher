import { assertEquals, assertThrows } from "@std/assert";
import { PreferencesService } from "../features/preferences/service.ts";
import { type DatabaseStore, openDatabase } from "./database.ts";

const TAG = "0040_high_contrast_themes";
const LEGACY = ["system", "light", "dark"] as const;

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

async function migrateFromLegacy(store: DatabaseStore) {
    const { before, rest } = await migrationsAround(TAG);
    await store.exclusiveNative(() => {
        for (const statements of before) store.migrate(statements);
        return Promise.resolve();
    });
    await store.run(async (db) => {
        for (const id of [...LEGACY, "hc-light", "hc-dark"]) {
            await db.run(
                `INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('${id}', '${id}', '${id}', 'hash', 1, 1)`,
            );
        }
        for (const theme of LEGACY) {
            await db.run(
                `INSERT INTO preferences (user_id, theme, accent, glass_intensity) VALUES ('${theme}', '${theme}', 'violet', 'clear')`,
            );
        }
    });
    await store.exclusiveNative(() => {
        for (const statements of rest) store.migrate(statements);
        return Promise.resolve();
    });
}

Deno.test("high-contrast theme migration keeps legacy themes and accepts both high-contrast themes", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateFromLegacy(store);
        const service = new PreferencesService(store);
        for (const theme of LEGACY) {
            const saved = await service.get(theme);
            assertEquals(saved.theme, theme);
            assertEquals(saved.accent, "violet");
            assertEquals(saved.glassIntensity, "clear");
        }
        await service.update("hc-light", { theme: "high-contrast-light" });
        await service.update("hc-dark", { theme: "high-contrast-dark" });
        assertEquals(
            (await service.get("hc-light")).theme,
            "high-contrast-light",
        );
        assertEquals(
            (await service.get("hc-dark")).theme,
            "high-contrast-dark",
        );
        await store.exclusiveNative((native) => {
            assertThrows(() =>
                native.exec(
                    "UPDATE preferences SET theme = 'contrast' WHERE user_id = 'light'",
                )
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});

Deno.test("high-contrast rollback SQL maps both themes to their base scheme for the previous version", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateFromLegacy(store);
        const service = new PreferencesService(store);
        await service.update("hc-light", { theme: "high-contrast-light" });
        await service.update("hc-dark", { theme: "high-contrast-dark" });
        const rollback = await Deno.readTextFile(
            new URL(`../../drizzle/rollback/${TAG}.sql`, import.meta.url),
        );
        await store.exclusiveNative((native) => {
            native.exec(rollback);
            assertEquals(
                native.prepare(
                    "SELECT user_id, theme, accent FROM preferences ORDER BY user_id",
                ).all(),
                [
                    { user_id: "dark", theme: "dark", accent: "violet" },
                    { user_id: "hc-dark", theme: "dark", accent: "wallpaper" },
                    {
                        user_id: "hc-light",
                        theme: "light",
                        accent: "wallpaper",
                    },
                    { user_id: "light", theme: "light", accent: "violet" },
                    { user_id: "system", theme: "system", accent: "violet" },
                ],
            );
            assertThrows(() =>
                native.exec(
                    "UPDATE preferences SET theme = 'high-contrast-dark' WHERE user_id = 'dark'",
                )
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});
