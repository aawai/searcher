import { assertEquals } from "@std/assert";
import { DatabaseSync } from "node:sqlite";
import { Hono, type MiddlewareHandler } from "hono";
import { Routes } from "@internal/hono/routes.ts";
import { responseMiddleware } from "@internal/hono/middleware/response.ts";
import { DatabaseStore } from "../../db/database.ts";
import { AiService } from "./service.ts";
import { registerAiRoutes } from "./ai.route.ts";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import type { UserDto } from "@shared/contracts.ts";

function createInMemoryStore(): DatabaseStore {
    const native = new DatabaseSync(":memory:");
    const store = new DatabaseStore(native);

    store.migrate([
        `CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            email TEXT UNIQUE,
            display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            disabled INTEGER NOT NULL DEFAULT 0,
            must_change_password INTEGER NOT NULL DEFAULT 0,
            auth_version INTEGER NOT NULL DEFAULT 1,
            soft_deleted_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );`,
        `CREATE TABLE audit_logs (
            id TEXT PRIMARY KEY,
            actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT,
            metadata_json TEXT,
            created_at INTEGER NOT NULL
        );`,
        `CREATE TABLE ai_providers (
            id TEXT PRIMARY KEY,
            owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            scope TEXT NOT NULL CHECK(scope in ('system', 'user')),
            name TEXT NOT NULL,
            base_url TEXT NOT NULL,
            encrypted_api_key TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );`,
        `CREATE TABLE ai_models (
            id TEXT PRIMARY KEY,
            provider_id TEXT NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
            model_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            visible_to_users INTEGER NOT NULL DEFAULT 1,
            is_default INTEGER NOT NULL DEFAULT 0,
            supports_text INTEGER NOT NULL DEFAULT 1,
            supports_vision INTEGER NOT NULL DEFAULT 0,
            supports_tools INTEGER NOT NULL DEFAULT 0,
            supports_streaming INTEGER NOT NULL DEFAULT 1,
            metadata_json TEXT,
            updated_at INTEGER NOT NULL
        );`,
        `CREATE UNIQUE INDEX ai_models_provider_model_idx ON ai_models(provider_id, model_id);`,
        `CREATE TABLE ai_conversations (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            history_enabled INTEGER NOT NULL DEFAULT 1,
            deleted_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );`,
        `CREATE TABLE ai_messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
            parent_message_id TEXT,
            role TEXT NOT NULL CHECK(role in ('system', 'user', 'assistant')),
            content TEXT NOT NULL,
            provider_id TEXT REFERENCES ai_providers(id) ON DELETE SET NULL,
            model_id TEXT,
            status TEXT NOT NULL CHECK(status in ('streaming', 'complete', 'interrupted', 'failed')) DEFAULT 'complete',
            variant_group_id TEXT,
            input_tokens INTEGER,
            output_tokens INTEGER,
            created_at INTEGER NOT NULL
        );`,
    ]);

    native.exec(`
        INSERT INTO users (id, username, display_name, password_hash, role, created_at, updated_at)
        VALUES ('user-1', 'testuser', 'Test User', 'hash', 'user', 1000, 1000),
               ('admin-1', 'adminuser', 'Admin User', 'hash', 'admin', 1000, 1000);
    `);

    return store;
}

const TEST_KEY = "12345678901234567890123456789012";

function setupTestApp(currentUser: UserDto, mockFetch?: typeof fetch) {
    const store = createInMemoryStore();
    const service = new AiService({
        store,
        encryptionKey: TEST_KEY,
        fetchFn: mockFetch,
    });

    const app = new Hono<AppEnv>();
    app.use("*", responseMiddleware);
    const routes = new Routes<AppEnv>();
    const deps = {
        store,
        auth: {} as unknown as AppDeps["auth"],
        origin: "http://localhost:8000",
    };

    registerAiRoutes(routes, deps, service);
    const mockAuthMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
        c.set("user", currentUser);
        await next();
    };
    routes.mount(app, [mockAuthMiddleware]);

    return { app, service };
}

Deno.test("AI Route: HTTP POST /api/ai/providers creates provider & /models endpoint lists them", async () => {
    const adminUser: UserDto = {
        id: "admin-1",
        username: "adminuser",
        displayName: "Admin User",
        role: "admin",
    };

    const mockFetch: typeof fetch = (input) => {
        const urlStr = String(input);
        if (urlStr.endsWith("/models")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: [{ id: "model-route-1" }, {
                            id: "model-route-2",
                        }],
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            );
        }
        return Promise.resolve(new Response("Not Found", { status: 404 }));
    };

    const { app } = setupTestApp(adminUser, mockFetch);

    // 1. POST /api/ai/providers
    const postRes = await app.request("/api/ai/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "OpenAI Official",
            baseUrl: "https://api.openai.com/v1",
            apiKey: "sk-real-secret-1234567890",
            scope: "system",
        }),
    });

    assertEquals(postRes.status, 200);
    const postBody = await postRes.json();
    assertEquals(postBody.status, true);
    assertEquals(postBody.data.name, "OpenAI Official");
    assertEquals(postBody.data.apiKeyMasked.includes("sk-"), true);
    // 验证返回没有明文 key
    assertEquals(
        JSON.stringify(postBody).includes("sk-real-secret-1234567890"),
        false,
    );

    // 2. GET /api/ai/models
    const modelsRes = await app.request("/api/ai/models");
    assertEquals(modelsRes.status, 200);
    const modelsBody = await modelsRes.json();
    assertEquals(modelsBody.status, true);
    assertEquals(modelsBody.data.length, 2);
    assertEquals(modelsBody.data[0].modelId, "model-route-1");
    assertEquals(modelsBody.data[0].isDefault, true);
});

Deno.test("AI Route: HTTP POST /api/ai/chat/stream returns SSE stream without leaking browser key", async () => {
    const normalUser: UserDto = {
        id: "user-1",
        username: "testuser",
        displayName: "Test User",
        role: "user",
    };

    const mockFetch: typeof fetch = (input, init) => {
        const urlStr = String(input);
        if (urlStr.endsWith("/models")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: [{ id: "sse-model" }],
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            );
        }
        if (urlStr.endsWith("/chat/completions")) {
            const chunks = [
                `data: ${
                    JSON.stringify({
                        choices: [{ delta: { content: "Streaming " } }],
                    })
                }\n\n`,
                `data: ${
                    JSON.stringify({
                        choices: [{ delta: { content: "response!" } }],
                    })
                }\n\n`,
                "data: [DONE]\n\n",
            ];

            let index = 0;
            const stream = new ReadableStream({
                pull(controller) {
                    if (index < chunks.length) {
                        controller.enqueue(
                            new TextEncoder().encode(chunks[index++]),
                        );
                    } else {
                        controller.close();
                    }
                },
            });

            return Promise.resolve(
                new Response(stream, {
                    status: 200,
                    headers: { "Content-Type": "text/event-stream" },
                }),
            );
        }
        return Promise.resolve(new Response("Not Found", { status: 404 }));
    };

    const { app, service } = setupTestApp(normalUser, mockFetch);

    // 预先给用户建一个 provider
    await service.createProvider("user-1", {
        name: "User AI",
        baseUrl: "https://api.ai.com/v1",
        apiKey: "sk-user-secret-99999",
        scope: "user",
    }, false);

    // 发起流式对话
    const chatRes = await app.request("/api/ai/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            message: "Hello from SSE test",
        }),
    });

    assertEquals(chatRes.status, 200);
    assertEquals(
        chatRes.headers.get("Content-Type")?.includes("text/event-stream"),
        true,
    );

    const text = await chatRes.text();
    assertEquals(text.includes("event: meta"), true);
    assertEquals(text.includes("event: token"), true);
    assertEquals(text.includes("Streaming "), true);
    assertEquals(text.includes("response!"), true);
    assertEquals(text.includes("event: done"), true);
    // 确保绝对不包含明文 key
    assertEquals(text.includes("sk-user-secret-99999"), false);
});

Deno.test("AI Route: HTTP POST /api/ai/conversations/:id/restore restores deleted conversation", async () => {
    const normalUser: UserDto = {
        id: "user-1",
        username: "testuser",
        displayName: "Test User",
        role: "user",
    };

    const mockFetch: typeof fetch = (input) => {
        const urlStr = String(input);
        if (urlStr.endsWith("/models")) {
            return Promise.resolve(
                Response.json({ data: [{ id: "model-route-restore" }] }),
            );
        }
        if (urlStr.endsWith("/chat/completions")) {
            const chunks = [
                `data: ${
                    JSON.stringify({
                        choices: [{ delta: { content: "ok" } }],
                    })
                }\n\n`,
                "data: [DONE]\n\n",
            ];
            let index = 0;
            const stream = new ReadableStream({
                pull(controller) {
                    if (index < chunks.length) {
                        controller.enqueue(
                            new TextEncoder().encode(chunks[index++]),
                        );
                    } else {
                        controller.close();
                    }
                },
            });
            return Promise.resolve(
                new Response(stream, {
                    status: 200,
                    headers: { "Content-Type": "text/event-stream" },
                }),
            );
        }
        return Promise.resolve(new Response("Not Found", { status: 404 }));
    };

    const { app, service } = setupTestApp(normalUser, mockFetch);
    const provider = await service.createProvider("user-1", {
        name: "User AI",
        baseUrl: "https://api.ai.com/v1",
        apiKey: "sk-user-secret-99999",
        scope: "user",
    }, false);

    // Create conversation via chat stream
    const chatRes = await app.request("/api/ai/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider.id,
            modelId: "model-route-restore",
            message: "Hello to restore",
            historyEnabled: true,
        }),
    });
    assertEquals(chatRes.status, 200);
    await chatRes.text();

    const listRes1 = await app.request("/api/ai/conversations", {
        method: "GET",
    });
    const list1 = await listRes1.json();
    assertEquals(list1.status, true);
    assertEquals(list1.data.length, 1);
    const convId = list1.data[0].id;

    // Delete conversation
    const delRes = await app.request(`/api/ai/conversations/${convId}`, {
        method: "DELETE",
    });
    assertEquals(delRes.status, 200);

    const listRes2 = await app.request("/api/ai/conversations", {
        method: "GET",
    });
    const list2 = await listRes2.json();
    assertEquals(list2.data.length, 0);

    // Restore conversation
    const restoreRes = await app.request(
        `/api/ai/conversations/${convId}/restore`,
        {
            method: "POST",
        },
    );
    assertEquals(restoreRes.status, 200);
    const restoreBody = await restoreRes.json();
    assertEquals(restoreBody.status, true);
    assertEquals(restoreBody.data.id, convId);
    assertEquals(restoreBody.data.deletedAt, null);

    // Listed again
    const listRes3 = await app.request("/api/ai/conversations", {
        method: "GET",
    });
    const list3 = await listRes3.json();
    assertEquals(list3.data.length, 1);
    assertEquals(list3.data[0].id, convId);
});

Deno.test("AI Route: HTTP DELETE /api/ai/conversations/:id/temporary deletes temporary conversation and messages", async () => {
    const normalUser: UserDto = {
        id: "user-1",
        username: "testuser",
        displayName: "Test User",
        role: "user",
    };

    const mockFetch: typeof fetch = (input) => {
        const urlStr = String(input);
        if (urlStr.endsWith("/models")) {
            return Promise.resolve(
                Response.json({ data: [{ id: "model-temp" }] }),
            );
        }
        if (urlStr.endsWith("/chat/completions")) {
            const chunks = [
                `data: ${
                    JSON.stringify({
                        choices: [{ delta: { content: "temp" } }],
                    })
                }\n\n`,
                "data: [DONE]\n\n",
            ];
            let index = 0;
            const stream = new ReadableStream({
                pull(controller) {
                    if (index < chunks.length) {
                        controller.enqueue(
                            new TextEncoder().encode(chunks[index++]),
                        );
                    } else {
                        controller.close();
                    }
                },
            });
            return Promise.resolve(
                new Response(stream, {
                    status: 200,
                    headers: { "Content-Type": "text/event-stream" },
                }),
            );
        }
        return Promise.resolve(new Response("Not Found", { status: 404 }));
    };

    const { app, service } = setupTestApp(normalUser, mockFetch);
    const provider = await service.createProvider("user-1", {
        name: "User AI",
        baseUrl: "https://api.ai.com/v1",
        apiKey: "sk-user-secret-99999",
        scope: "user",
    }, false);

    const chatRes = await app.request("/api/ai/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider.id,
            modelId: "model-temp",
            message: "Temporary chat",
            historyEnabled: false,
        }),
    });
    assertEquals(chatRes.status, 200);
    const text = await chatRes.text();
    const convIdMatch = /"conversationId":"([^"]+)"/.exec(text);
    const convId = convIdMatch![1];

    // Can get conversation details while active
    const getRes = await app.request(`/api/ai/conversations/${convId}`);
    assertEquals(getRes.status, 200);

    // Purge temporary conversation
    const purgeRes = await app.request(
        `/api/ai/conversations/${convId}/temporary`,
        {
            method: "DELETE",
        },
    );
    assertEquals(purgeRes.status, 200);

    // Subsequent get returns 404
    const getResAfter = await app.request(
        `/api/ai/conversations/${convId}`,
    );
    assertEquals(getResAfter.status, 404);
});

Deno.test("AI Logo candidates use the requested visible model and return three validated images", async () => {
    const user: UserDto = {
        id: "user-1",
        username: "testuser",
        displayName: "Test User",
        role: "user",
    };
    const png = new Uint8Array([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        0,
        0,
        0,
        0x0d,
    ]);
    let requestBody: { model: string; n: number } | undefined;
    const mockFetch: typeof fetch = (input, init) => {
        if (String(input).endsWith("/models")) {
            return Promise.resolve(
                Response.json({ data: [{ id: "image-model" }] }),
            );
        }
        if (String(input).endsWith("/images/generations")) {
            requestBody = JSON.parse(String(init?.body));
            return Promise.resolve(
                Response.json({
                    data: Array.from(
                        { length: 3 },
                        () => ({ b64_json: png.toBase64() }),
                    ),
                }),
            );
        }
        return Promise.resolve(new Response(null, { status: 404 }));
    };
    const { app, service } = setupTestApp(user, mockFetch);
    const provider = await service.createProvider(user.id, {
        name: "Images",
        baseUrl: "https://images.example/v1",
        apiKey: "secret-key",
        scope: "user",
    });
    const response = await app.request("/api/ai/logo-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider.id,
            modelId: "image-model",
            siteName: "Search",
            style: "geometric",
        }),
    });
    assertEquals(response.status, 200);
    const result = await response.json();
    assertEquals(result.data.images.length, 3);
    assertEquals(
        result.data.images[0].dataUrl,
        `data:image/png;base64,${png.toBase64()}`,
    );
    assertEquals(result.data.images[0].style, "geometric");
    assertEquals(requestBody?.model, "image-model");
    assertEquals(requestBody?.n, 3);
    const denied = await app.request("/api/ai/logo-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider.id,
            modelId: "not-discovered",
            siteName: "Search",
            style: "minimal",
        }),
    });
    assertEquals(denied.status, 404);
});
