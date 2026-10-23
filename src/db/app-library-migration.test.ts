import { assertEquals } from "@std/assert";
import { openDatabase } from "./database.ts";

Deno.test("app library migration puts pinned root apps first, keeps the rest in order, and loses no rows", async () => {
    const store = openDatabase(":memory:");
    try {
        const journal: { entries: Array<{ tag: string }> } = JSON.parse(
            await Deno.readTextFile(
                new URL("../../drizzle/meta/_journal.json", import.meta.url),
            ),
        );
        const index = journal.entries.findIndex(({ tag }) =>
            tag === "0025_app_library_home"
        );
        if (index < 0) throw new Error("Missing app library migration");
        const migrations = await Promise.all(
            journal.entries.map(async ({ tag }) =>
                (await Deno.readTextFile(
                    new URL(`../../drizzle/${tag}.sql`, import.meta.url),
                )).split("--> statement-breakpoint")
            ),
        );
        await store.exclusiveNative(() => {
            for (const statements of migrations.slice(0, index)) {
                store.migrate(statements);
            }
            return Promise.resolve();
        });
        await store.run(async (db) => {
            for (const user of ["u1", "u2"]) {
                await db.run(
                    `INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('${user}', '${user}', '${user}', 'hash', 1, 1)`,
                );
            }
            await db.run(
                `INSERT INTO preferences (user_id, webapp_home_limit, show_app_labels) VALUES ('u1', '8', 0)`,
            );
            await db.run(
                `INSERT INTO webapp_groups (id, user_id, name, sort_order, created_at, updated_at) VALUES ('g1', 'u1', 'Folder', 1, 1, 1), ('g2', 'u2', 'Other', 0, 1, 1)`,
            );
            // id, user, group, pinned, sort_order, pinned_sort_order
            const apps: Array<
                [string, string, string | null, number, number, number]
            > = [
                ["plain0", "u1", null, 0, 0, 0],
                ["pinB", "u1", null, 1, 5, 2],
                ["plain2", "u1", null, 0, 2, 0],
                ["pinA", "u1", null, 1, 9, 1],
                ["inFolderPinned", "u1", "g1", 1, 7, 3],
                ["inFolderPlain", "u1", "g1", 0, 3, 0],
                ["u2plain", "u2", null, 0, 4, 0],
                ["u2pinned", "u2", null, 1, 8, 0],
            ];
            for (const [id, user, group, pinned, sort, pinSort] of apps) {
                await db.run(
                    `INSERT INTO webapps (id, user_id, name, url, group_id, is_pinned, sort_order, pinned_sort_order, created_at, updated_at) VALUES ('${id}', '${user}', '${id}', 'https://example.com/${id}', ${
                        group ? `'${group}'` : "NULL"
                    }, ${pinned}, ${sort}, ${pinSort}, 1, 1)`,
                );
            }
        });
        await store.exclusiveNative(() => {
            store.migrate(migrations[index]);
            return Promise.resolve();
        });
        await store.exclusiveNative((native) => {
            const rootOrder = (user: string) =>
                (native.prepare(
                    `SELECT id, sort_order FROM (
                        SELECT id, sort_order FROM webapps WHERE user_id = ? AND group_id IS NULL
                        UNION ALL SELECT id, sort_order FROM webapp_groups WHERE user_id = ?
                    ) ORDER BY sort_order`,
                ).all(user, user) as Array<{ id: string }>).map((r) => r.id);
            // pinned first by pinned_sort_order, then plain0(0), g1(1), plain2(2)
            assertEquals(rootOrder("u1"), [
                "pinA",
                "pinB",
                "plain0",
                "g1",
                "plain2",
            ]);
            assertEquals(rootOrder("u2"), ["u2pinned", "g2", "u2plain"]);
            const members = native.prepare(
                `SELECT id, group_id, sort_order FROM webapps WHERE group_id = 'g1' ORDER BY id`,
            ).all();
            assertEquals(members, [
                { id: "inFolderPinned", group_id: "g1", sort_order: 7 },
                { id: "inFolderPlain", group_id: "g1", sort_order: 3 },
            ]);
            assertEquals(
                (native.prepare("SELECT count(*) AS n FROM webapps").get() as {
                    n: number;
                }).n,
                8,
            );
            assertEquals(
                (native.prepare("SELECT count(*) AS n FROM webapp_groups")
                    .get() as { n: number }).n,
                2,
            );
            const columns = (native.prepare("PRAGMA table_info(webapps)")
                .all() as Array<{ name: string }>).map((c) => c.name);
            assertEquals(columns.includes("is_pinned"), false);
            assertEquals(columns.includes("pinned_sort_order"), false);
            const pref = native.prepare(
                "SELECT show_home_apps, show_app_labels FROM preferences WHERE user_id = 'u1'",
            ).get();
            assertEquals(pref, { show_home_apps: 1, show_app_labels: 0 });
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});
