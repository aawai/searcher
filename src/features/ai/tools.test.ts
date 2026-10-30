import { assertEquals, assertExists } from "@std/assert";
import { DatabaseSync } from "node:sqlite";
import { DatabaseStore, openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { users } from "../../db/schema.ts";
import { DocumentsService } from "../documents/service.ts";
import { buildToolDefinitions, executeToolCall } from "./tools.ts";

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
        `CREATE TABLE webapps (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            group_id TEXT, name TEXT NOT NULL, url TEXT NOT NULL, icon_asset_id TEXT,
            icon_source TEXT DEFAULT 'manifest',
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_home_fixed INTEGER NOT NULL DEFAULT 0,
            open_mode TEXT NOT NULL DEFAULT 'same_tab', deleted_at INTEGER,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );`,
    ]);
    return store;
}
async function createDocumentsStore(): Promise<DatabaseStore> {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    await store.run(async (db) => {
        await db.insert(users).values([
            {
                id: "u1",
                username: "user1",
                displayName: "User One",
                passwordHash: "h1",
                createdAt: 100,
                updatedAt: 100,
            },
            {
                id: "u2",
                username: "user2",
                displayName: "User Two",
                passwordHash: "h2",
                createdAt: 100,
                updatedAt: 100,
            },
        ]);
    });
    return store;
}

Deno.test("Tools: buildToolDefinitions respects opt-in flags", () => {
    const empty = buildToolDefinitions({
        documents: false,
        apps: false,
        webSearch: false,
    });
    assertEquals(empty.length, 0);

    const withApps = buildToolDefinitions({ documents: true, apps: true });
    assertEquals(withApps.map((tool) => tool.function.name), [
        "lookup_documents",
        "lookup_apps",
    ]);

    const withDocuments = buildToolDefinitions({ documents: true });
    assertEquals(withDocuments.length, 1);
    assertEquals(withDocuments[0].function.name, "lookup_documents");
    assertEquals(
        withDocuments[0].function.description.includes("all the user's notes"),
        true,
    );
    assertEquals(buildToolDefinitions({ documents: true }, false).length, 0);
});
Deno.test("Tools: lookup_documents searches owned live documents and returns document sources", async () => {
    const store = await createDocumentsStore();
    try {
        const documents = new DocumentsService(store);
        const owned = await documents.create("u1", {
            title: null,
            body: "A short plan about stellar quartz.",
            isHomeFixed: true,
        });
        await documents.create("u2", {
            title: "Another Account",
            body: "A long-form plan about stellar quartz.",
        });
        const trashed = await documents.create("u1", {
            title: "Trashed Long Document",
            body: "A long-form plan about stellar quartz.",
        });
        await documents.softDelete("u1", trashed.id, trashed.version);

        const result = await executeToolCall(
            "lookup_documents",
            { query: "stellar quartz" },
            {
                userId: "u1",
                store,
                allowedTools: { documents: true },
            },
        );

        assertEquals(result.toolName, "documents");
        const matches = result.result as Array<{
            id: string;
            title: string;
            body: string;
            snippet: string;
        }>;
        assertEquals(matches.map((item) => item.id), [owned.id]);
        assertEquals(matches[0].title, owned.displayTitle);
        assertEquals(matches[0].body, owned.body);
        assertExists(result.sources);
        assertEquals(result.sources, [{
            type: "document",
            documentId: owned.id,
            title: owned.displayTitle,
            snippet: matches[0].snippet,
        }]);
    } finally {
        await store.close();
    }
});

Deno.test("Tools: lookup_documents rejects disabled and missing session opt-in", async () => {
    const store = createInMemoryStore();
    try {
        for (const allowedTools of [{ documents: false }, undefined]) {
            const result = await executeToolCall(
                "lookup_documents",
                { query: "private" },
                {
                    userId: "u1",
                    store,
                    allowedTools,
                },
            );
            assertEquals(result.toolName, "documents");
            assertEquals(result.result, null);
            assertEquals(
                result.error?.includes("未在当前会话中启用"),
                true,
            );
        }
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

Deno.test("Tools: executeToolCall web search surfaces SearXNG HTTP failures as tool errors", async () => {
    const store = createInMemoryStore();
    try {
        const server = Deno.serve(
            { port: 0 },
            () => new Response("unavailable", { status: 503 }),
        );
        try {
            const addr = server.addr as Deno.NetAddr;
            const res = await executeToolCall(
                "web_search",
                { query: "deno runtime" },
                {
                    userId: "u1",
                    store,
                    searxngUrl: `http://127.0.0.1:${addr.port}`,
                },
            );
            assertEquals(res.toolName, "webSearch");
            assertEquals(res.result, null);
            assertEquals(res.error, "SearXNG search failed with status 503");
        } finally {
            await server.shutdown();
        }
    } finally {
        await store.close();
    }
});

Deno.test("Tools: executeToolCall web search reports an unreachable SearXNG as a tool error", async () => {
    const store = createInMemoryStore();
    const server = Deno.serve({ port: 0 }, () => new Response("ok"));
    const addr = server.addr as Deno.NetAddr;
    await server.shutdown();
    try {
        const res = await executeToolCall(
            "web_search",
            { query: "deno runtime" },
            {
                userId: "u1",
                store,
                searxngUrl: `http://127.0.0.1:${addr.port}`,
            },
        );
        assertEquals(res.toolName, "webSearch");
        assertEquals(res.result, null);
        assertEquals(res.sources, undefined);
        assertEquals(typeof res.error, "string");
    } finally {
        await store.close();
    }
});
