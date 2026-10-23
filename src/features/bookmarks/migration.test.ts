import { assertEquals } from "@std/assert";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../../db/database.ts";

Deno.test({
    name:
        "migration 0005: preserves pre-existing user, session, preference and bookmark data",
    async fn() {
        const testDbPath = await Deno.makeTempFile({ suffix: ".sqlite" });
        try {
            const native = new DatabaseSync(testDbPath);
            native.exec(
                "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
            );

            // 1. Apply migrations 0000 - 0004
            for (
                const tag of [
                    "0000_messy_the_hunter",
                    "0001_curious_sinister_six",
                    "0002_sharp_gauntlet",
                    "0003_polite_owl",
                    "0004_naive_vector",
                ]
            ) {
                const sqlContent = await Deno.readTextFile(
                    `./drizzle/${tag}.sql`,
                );
                const stmts = sqlContent.split("--> statement-breakpoint");
                native.exec("BEGIN IMMEDIATE");
                for (const stmt of stmts) {
                    if (stmt.trim().length > 0) native.exec(stmt);
                }
                native.exec("COMMIT");
            }

            // 2. Populate legacy records before 0005
            native.exec(`
                INSERT INTO users (id, username, display_name, password_hash, role, disabled, auth_version, created_at, updated_at)
                VALUES ('u_test_legacy', 'legacy_user', 'Legacy User', 'hash123', 'user', 0, 1, 1000, 1000);

                INSERT INTO sessions (token_hash, user_id, auth_version, expires_at, created_at)
                VALUES ('sess_hash_1', 'u_test_legacy', 1, 9999999, 1000);

                INSERT INTO preferences (user_id, default_engine, theme, visual_style, background_image, background_opacity, search_target)
                VALUES ('u_test_legacy', 'bing', 'dark', 'spatial-glass', 'https://img.jpg', 0.5, 'new');

                INSERT INTO bookmarks (id, user_id, title, url, created_at, updated_at)
                VALUES ('bm_legacy_1', 'u_test_legacy', 'My Old Bookmark', 'https://example.com/test', 1000, 1000);
            `);

            // 3. Apply 0005 via DatabaseStore.migrate
            const store = openDatabase(testDbPath);
            try {
                const sql0005 = await Deno.readTextFile(
                    "./drizzle/0005_v1_webapps_rich_notes_and_preferences.sql",
                );
                const stmts0005 = sql0005.split("--> statement-breakpoint");
                store.migrate(stmts0005.filter((s) => s.trim().length > 0));
            } finally {
                await store.close();
            }

            // 4. Assertions for zero data loss using DatabaseSync directly:
            const verifyNative = new DatabaseSync(testDbPath);
            try {
                // 1. Users preserved
                type CountRow = { c: number };
                const userCount = verifyNative.prepare(
                    "SELECT count(*) as c FROM users WHERE id = 'u_test_legacy'",
                ).all() as unknown as CountRow[];
                assertEquals(userCount[0].c, 1);

                // 2. Sessions preserved
                const sessCount = verifyNative.prepare(
                    "SELECT count(*) as c FROM sessions WHERE user_id = 'u_test_legacy'",
                ).all() as unknown as CountRow[];
                assertEquals(sessCount[0].c, 1);

                // 3. Preferences preserved
                type PrefRow = {
                    visual_style: string;
                    theme: string;
                    style: string;
                };
                const prefRows = verifyNative.prepare(
                    "SELECT visual_style, theme, style FROM preferences WHERE user_id = 'u_test_legacy'",
                ).all() as unknown as PrefRow[];
                assertEquals(prefRows.length, 1);
                assertEquals(prefRows[0].visual_style, "spatial-glass");
                assertEquals(prefRows[0].theme, "dark");
                assertEquals(prefRows[0].style, "quiet");

                // 4. Bookmarks preserved
                const bmCount = verifyNative.prepare(
                    "SELECT count(*) as c FROM bookmarks WHERE user_id = 'u_test_legacy'",
                ).all() as unknown as CountRow[];
                assertEquals(bmCount[0].c, 1);

                // 5. Webapps migrated from bookmarks
                type WebAppRow = { name: string; url: string };
                const webappRows = verifyNative.prepare(
                    "SELECT name, url FROM webapps WHERE id = 'bm_legacy_1'",
                ).all() as unknown as WebAppRow[];
                assertEquals(webappRows.length, 1);
                assertEquals(webappRows[0].name, "My Old Bookmark");
                assertEquals(webappRows[0].url, "https://example.com/test");
            } finally {
                verifyNative.close();
            }
        } finally {
            try {
                await Deno.remove(testDbPath);
            } catch {
                // ignore
            }
        }
    },
});

Deno.test({
    name:
        "migration 0010: preserves existing webapp_groups and preferences with folder_size and show_app_labels defaults",
    async fn() {
        const testDbPath = await Deno.makeTempFile({ suffix: ".sqlite" });
        try {
            // 1. Run migrations 0000 - 0009
            const store = openDatabase(testDbPath);
            try {
                for (
                    const tag of [
                        "0000_messy_the_hunter",
                        "0001_curious_sinister_six",
                        "0002_sharp_gauntlet",
                        "0003_polite_owl",
                        "0004_naive_vector",
                        "0005_v1_webapps_rich_notes_and_preferences",
                        "0006_unknown_morgan_stark",
                        "0007_friendly_vengeance",
                        "0008_silent_iron_lad",
                        "0009_flowery_firebrand",
                    ]
                ) {
                    const sql = await Deno.readTextFile(`./drizzle/${tag}.sql`);
                    const stmts = sql.split("--> statement-breakpoint");
                    store.migrate(stmts.filter((s) => s.trim().length > 0));
                }
            } finally {
                await store.close();
            }

            // 2. Populate records before 0010
            const native = new DatabaseSync(testDbPath);
            native.exec(`
                INSERT INTO users (id, username, display_name, password_hash, role, disabled, auth_version, created_at, updated_at)
                VALUES ('u_test_10', 'user_10', 'User 10', 'hash', 'user', 0, 1, 1000, 1000);

                INSERT INTO preferences (user_id, default_engine, theme, visual_style, background_image, background_opacity, search_target)
                VALUES ('u_test_10', 'bing', 'dark', 'linear-dark', null, 0.36, 'same');

                INSERT INTO webapp_groups (id, user_id, name, sort_order, created_at, updated_at)
                VALUES ('group_10', 'u_test_10', 'My Group', 5, 1000, 1000);
                INSERT INTO webapps (id, user_id, name, url, group_id, created_at, updated_at)
                VALUES ('app_10', 'u_test_10', 'Existing App', 'https://example.com', 'group_10', 1000, 1000);
            `);
            native.close();

            // 3. Apply 0010 via DatabaseStore.migrate
            const store2 = openDatabase(testDbPath);
            try {
                const sql0010 = await Deno.readTextFile(
                    "./drizzle/0010_brainy_nemesis.sql",
                );
                const stmts0010 = sql0010.split("--> statement-breakpoint");
                store2.migrate(stmts0010.filter((s) => s.trim().length > 0));
            } finally {
                await store2.close();
            }

            // 4. Verify data preservation and defaults
            const verifyNative = new DatabaseSync(testDbPath);
            try {
                type PrefRow = {
                    user_id: string;
                    theme: string;
                    show_app_labels: number;
                };
                const prefRows = verifyNative.prepare(
                    "SELECT user_id, theme, show_app_labels FROM preferences WHERE user_id = 'u_test_10'",
                ).all() as unknown as PrefRow[];
                assertEquals(prefRows.length, 1);
                assertEquals(prefRows[0].theme, "dark");
                assertEquals(prefRows[0].show_app_labels, 1);

                type GroupRow = {
                    id: string;
                    name: string;
                    sort_order: number;
                    folder_size: string;
                };
                const groupRows = verifyNative.prepare(
                    "SELECT id, name, sort_order, folder_size FROM webapp_groups WHERE id = 'group_10'",
                ).all() as unknown as GroupRow[];
                assertEquals(groupRows.length, 1);
                assertEquals(groupRows[0].name, "My Group");
                assertEquals(groupRows[0].sort_order, 5);
                assertEquals(groupRows[0].folder_size, "small");
                const appRows = verifyNative.prepare(
                    "SELECT id, group_id FROM webapps WHERE id = 'app_10'",
                ).all() as unknown as { id: string; group_id: string }[];
                assertEquals(appRows, [{ id: "app_10", group_id: "group_10" }]);
                assertEquals(
                    verifyNative.prepare("PRAGMA foreign_key_check").all(),
                    [],
                );
            } finally {
                verifyNative.close();
            }
        } finally {
            try {
                await Deno.remove(testDbPath);
            } catch {
                // ignore
            }
        }
    },
});
