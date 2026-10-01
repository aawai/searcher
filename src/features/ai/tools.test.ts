import { assertEquals, assertExists } from "@std/assert";
import { DatabaseSync } from "node:sqlite";
import { DatabaseStore } from "../../db/database.ts";
import {
    buildToolDefinitions,
    executeToolCall,
    getAiCapabilities,
} from "./tools.ts";

function createInMemoryStore(): DatabaseStore {
    const native = new DatabaseSync(":memory:");
    const store = new DatabaseStore(native);
    store.migrate([
        `CREATE TABLE users (
            id TEXT PRIMARY KEY, username TEXT NOT NULL, email TEXT,
            display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user', disabled INTEGER NOT NULL DEFAULT 0,
            must_change_password INTEGER NOT NULL DEFAULT 0, auth_version INTEGER NOT NULL DEFAULT 1,
            soft_deleted_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );`,
        `CREATE TABLE notes (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT, current_body TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
            current_version INTEGER NOT NULL DEFAULT 1, color TEXT NOT NULL DEFAULT 'paper',
            is_pinned INTEGER NOT NULL DEFAULT 0, is_home_fixed INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0, deleted_at INTEGER,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );`,
        `CREATE TABLE notes_fts (
            title TEXT,
            body TEXT
        );`,
        `CREATE TABLE note_layouts (
            id TEXT PRIMARY KEY, note_id TEXT NOT NULL, user_id TEXT NOT NULL,
            device_class TEXT NOT NULL, x REAL, y REAL, width REAL,
            z_index INTEGER NOT NULL DEFAULT 0, expanded INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER, updated_at INTEGER NOT NULL
        );`,
        `CREATE TABLE webapps (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            group_id TEXT, name TEXT NOT NULL, url TEXT NOT NULL, icon_asset_id TEXT,
            icon_source TEXT DEFAULT 'manifest', is_pinned INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0, pinned_sort_order INTEGER,
            open_mode TEXT NOT NULL DEFAULT 'same_tab', deleted_at INTEGER,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );`,
    ]);
    return store;
}

Deno.test("Tools: getAiCapabilities returns tool and attachment caps", () => {
    const caps = getAiCapabilities();
    assertEquals(caps.tools.notes, true);
    assertEquals(caps.tools.apps, true);
    assertEquals(caps.attachments.maxFiles, 4);
    assertEquals(caps.attachments.maxImageSize, 5 * 1024 * 1024);
    assertEquals(caps.attachments.maxTextSize, 1 * 1024 * 1024);
});

Deno.test("Tools: buildToolDefinitions respects opt-in flags", () => {
    const empty = buildToolDefinitions({
        notes: false,
        apps: false,
        webSearch: false,
    });
    assertEquals(empty.length, 0);

    const withNotes = buildToolDefinitions({ notes: true, apps: true });
    assertEquals(withNotes.length, 2);
    assertEquals(withNotes[0].function.name, "lookup_notes");
    assertEquals(withNotes[1].function.name, "lookup_apps");
});

Deno.test("Tools: executeToolCall notes lookup returns read-only notes", async () => {
    const store = createInMemoryStore();
    try {
        await store.run(async (db) => {
            await db.run(
                `INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('u1', 'test', 'Test', 'h', 0, 0)`,
            );
            await db.run(
                `INSERT INTO notes (id, user_id, title, current_body, content, created_at, updated_at) VALUES ('n1', 'u1', 'Meeting Note', 'Discussed issue 38 roadmap', 'Discussed issue 38 roadmap', 100, 100)`,
            );
        });

        const res = await executeToolCall("lookup_notes", {}, {
            userId: "u1",
            store,
        });
        assertEquals(res.toolName, "notes");
        const list = res.result as Array<{ id: string; title: string }>;
        assertEquals(list.length, 1);
        assertEquals(list[0].id, "n1");
        assertEquals(list[0].title, "Meeting Note");
    } finally {
        await store.close();
    }
});

Deno.test("Tools: executeToolCall apps lookup returns read-only apps", async () => {
    const store = createInMemoryStore();
    try {
        await store.run(async (db) => {
            await db.run(
                `INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('u1', 'test', 'Test', 'h', 0, 0)`,
            );
            await db.run(
                `INSERT INTO webapps (id, user_id, name, url, created_at, updated_at) VALUES ('w1', 'u1', 'GitHub', 'https://github.com', 100, 100)`,
            );
        });

        const res = await executeToolCall("lookup_apps", { query: "git" }, {
            userId: "u1",
            store,
        });

        assertEquals(res.toolName, "apps");
        const list = res.result as Array<{ id: string; name: string }>;
        assertEquals(list.length, 1);
        assertEquals(list[0].name, "GitHub");
    } finally {
        await store.close();
    }
});

Deno.test("Tools: executeToolCall web search queries SearXNG mock", async () => {
    const store = createInMemoryStore();
    try {
        // Spin up a small local server simulating SearXNG
        const server = Deno.serve({ port: 0 }, (req) => {
            const url = new URL(req.url);
            if (url.pathname === "/search") {
                const q = url.searchParams.get("q");
                return new Response(
                    JSON.stringify({
                        query: q,
                        results: [
                            {
                                title: "Deno Documentation",
                                url: "https://deno.com",
                                content:
                                    "Deno is a modern runtime for JavaScript and TypeScript.",
                            },
                        ],
                    }),
                    { headers: { "Content-Type": "application/json" } },
                );
            }
            return new Response("Not found", { status: 404 });
        });

        const addr = server.addr as Deno.NetAddr;
        const mockSearxngUrl = `http://127.0.0.1:${addr.port}`;

        try {
            const res = await executeToolCall(
                "web_search",
                { query: "deno runtime" },
                {
                    userId: "u1",
                    store,
                    searxngUrl: mockSearxngUrl,
                },
            );

            assertEquals(res.toolName, "webSearch");
            assertExists(res.sources);
            assertEquals(res.sources.length, 1);
            assertEquals(res.sources[0].title, "Deno Documentation");
            assertEquals(res.sources[0].url, "https://deno.com");
        } finally {
            await server.shutdown();
        }
    } finally {
        await store.close();
    }
});
