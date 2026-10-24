import { assertEquals } from "@std/assert";
import { openDatabase } from "./database.ts";

Deno.test("首页静状态迁移保留既有偏好并填充默认值", async () => {
    const store = openDatabase(":memory:");
    try {
        const journal: { entries: Array<{ tag: string }> } = JSON.parse(
            await Deno.readTextFile(
                new URL("../../drizzle/meta/_journal.json", import.meta.url),
            ),
        );
        const index = journal.entries.findIndex(({ tag }) =>
            tag.startsWith("0027_")
        );
        if (index < 0) throw new Error("缺少首页静状态迁移");
        const migrations = await Promise.all(
            journal.entries.map(async ({ tag }) =>
                (await Deno.readTextFile(
                    new URL(`../../drizzle/${tag}.sql`, import.meta.url),
                ))
                    .split("--> statement-breakpoint")
            ),
        );
        await store.exclusiveNative(() => {
            for (const statements of migrations.slice(0, index)) {
                store.migrate(statements);
            }
            return Promise.resolve();
        });
        await store.run(async (db) => {
            await db.run(
                "INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('u1', 'u1', 'Name', 'hash', 1, 1)",
            );
            await db.run(
                "INSERT INTO preferences (user_id, show_home_apps, accent) VALUES ('u1', 0, 'violet')",
            );
        });
        await store.exclusiveNative(() => {
            store.migrate(migrations[index]);
            return Promise.resolve();
        });
        await store.exclusiveNative((native) => {
            assertEquals(
                native.prepare(
                    "SELECT user_id, show_home_apps, accent, show_home_date, show_home_time, show_home_continue FROM preferences",
                ).all(),
                [{
                    user_id: "u1",
                    show_home_apps: 0,
                    accent: "violet",
                    show_home_date: 1,
                    show_home_time: 0,
                    show_home_continue: 1,
                }],
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});
