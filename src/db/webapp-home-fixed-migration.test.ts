import { assertEquals, assertThrows } from "@std/assert";
import { openDatabase } from "./database.ts";

const TAG = "0029_dear_the_call";

async function migrations() {
    const journal: { entries: Array<{ tag: string }> } = JSON.parse(
        await Deno.readTextFile(
            new URL("../../drizzle/meta/_journal.json", import.meta.url),
        ),
    );
    const index = journal.entries.findIndex((entry) => entry.tag === TAG);
    if (index < 0) throw new Error(`Missing migration ${TAG}`);
    const statements = await Promise.all(
        journal.entries.map(async (entry) =>
            (await Deno.readTextFile(
                new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url),
            )).split("--> statement-breakpoint")
        ),
    );
    return { before: statements.slice(0, index), own: statements[index] };
}

async function seed() {
    const store = openDatabase(":memory:");
    const { before, own } = await migrations();
    await store.exclusiveNative(() => {
        for (const group of before) store.migrate(group);
        return Promise.resolve();
    });
    await store.run(async (db) => {
        await db.run(
            `INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('u1', 'u1', 'u1', 'hash', 1, 1)`,
        );
        await db.run(
            `INSERT INTO webapp_groups (id, user_id, name, sort_order, folder_size, created_at, updated_at) VALUES ('folder', 'u1', 'Folder', 1, 'small', 1, 1), ('empty', 'u1', 'Empty', 2, 'large', 1, 1)`,
        );
        await db.run(
            `INSERT INTO webapps (id, user_id, name, url, group_id, sort_order, deleted_at, created_at, updated_at) VALUES
                ('root', 'u1', 'Root', 'https://root.example', NULL, 0, NULL, 1, 1),
                ('deletedRoot', 'u1', 'Deleted', 'https://deleted.example', NULL, 3, 9, 1, 1),
                ('member', 'u1', 'Member', 'https://member.example', 'folder', 0, NULL, 1, 1),
                ('deletedMember', 'u1', 'Deleted member', 'https://deleted-member.example', 'folder', 1, 9, 1, 1)`,
        );
    });
    return { store, own };
}

Deno.test("Y8 migration pins existing root apps and all folders, leaving members and deleted apps alone", async () => {
    const { store, own } = await seed();
    try {
        await store.exclusiveNative(() => {
            store.migrate(own);
            return Promise.resolve();
        });
        await store.exclusiveNative((native) => {
            assertEquals(
                native.prepare(
                    "SELECT id, is_home_fixed FROM webapps ORDER BY id",
                ).all(),
                [
                    { id: "deletedMember", is_home_fixed: 0 },
                    { id: "deletedRoot", is_home_fixed: 0 },
                    { id: "member", is_home_fixed: 0 },
                    { id: "root", is_home_fixed: 1 },
                ],
            );
            assertEquals(
                native.prepare(
                    "SELECT id, is_home_fixed FROM webapp_groups ORDER BY id",
                ).all(),
                [
                    { id: "empty", is_home_fixed: 1 },
                    { id: "folder", is_home_fixed: 1 },
                ],
            );
            assertEquals(
                (native.prepare("SELECT count(*) AS n FROM webapps").get() as {
                    n: number;
                }).n,
                4,
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});

Deno.test("Y8 migration failure rolls back both columns and the pin updates", async () => {
    const { store, own } = await seed();
    try {
        await store.exclusiveNative(() => {
            assertThrows(() =>
                store.migrate([
                    ...own,
                    "INSERT INTO missing_table (id) VALUES ('boom')",
                ])
            );
            return Promise.resolve();
        });
        await store.exclusiveNative((native) => {
            const webappColumns = (native.prepare(
                "PRAGMA table_info(webapps)",
            ).all() as Array<{ name: string }>).map((column) => column.name);
            const groupColumns = (native.prepare(
                "PRAGMA table_info(webapp_groups)",
            ).all() as Array<{ name: string }>).map((column) => column.name);
            assertEquals(webappColumns.includes("is_home_fixed"), false);
            assertEquals(groupColumns.includes("is_home_fixed"), false);
            assertEquals(
                (native.prepare("SELECT count(*) AS n FROM webapps").get() as {
                    n: number;
                }).n,
                4,
            );
            return Promise.resolve();
        });
    } finally {
        await store.close();
    }
});
