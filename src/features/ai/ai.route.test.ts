import { assertEquals } from "@std/assert";
import { DatabaseSync } from "node:sqlite";
import { Hono, type MiddlewareHandler } from "hono";
import { Routes } from "@internal/hono/routes.ts";
import { responseMiddleware } from "@internal/hono/middleware/response.ts";
import { DatabaseStore } from "../../db/database.ts";
import { AiService } from "./service.ts";
import { registerAiRoutes } from "./ai.route.ts";
import { LOGO_STYLES } from "./types.ts";
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
               ('user-2', 'testuser2', 'Test User 2', 'hash', 'user', 1000, 1000),
               ('admin-1', 'adminuser', 'Admin User', 'hash', 'admin', 1000, 1000);
    `);

    return store;
}

const TEST_KEY = "12345678901234567890123456789012";

function setupTestApp(
    currentUser?: UserDto | null,
    mockFetch?: typeof fetch,
    existingStore?: DatabaseStore,
) {
    const store = existingStore ?? createInMemoryStore();
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
        if (!currentUser) {
            return c.fail(401, "未登录或登录已失效");
        }
        c.set("user", currentUser);
        await next();
    };
    routes.mount(app, [mockAuthMiddleware]);

    return { app, service, store };
}
interface ParsedSseEvent {
    event: string;
    data: unknown;
}

function parseSseEvents(sseText: string): ParsedSseEvent[] {
    const blocks = sseText.split(/\n\n+/);
    const events: ParsedSseEvent[] = [];
    for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;
        let event = "message";
        const dataLines: string[] = [];
        for (const line of trimmed.split("\n")) {
            if (line.startsWith("event:")) {
                event = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trim());
            }
        }
        const dataRaw = dataLines.join("\n");
        let parsedData: unknown = dataRaw;
        try {
            parsedData = JSON.parse(dataRaw);
        } catch {
            // retain raw string if not valid JSON
        }
        events.push({ event, data: parsedData });
    }
    return events;
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

    const mockFetch: typeof fetch = (input) => {
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
    const events = parseSseEvents(text);
    assertEquals(events.map((e) => e.event), [
        "meta",
        "token",
        "token",
        "done",
    ]);

    const meta = events[0].data as {
        conversationId: string;
        messageId: string;
        providerId: string;
        modelId: string;
    };
    assertEquals(typeof meta.conversationId, "string");
    assertEquals(typeof meta.messageId, "string");
    assertEquals(meta.modelId, "sse-model");

    const tokens = events
        .filter((e) => e.event === "token")
        .map((e) => e.data as string)
        .join("");
    assertEquals(tokens, "Streaming response!");
    assertEquals(events[3].data, null);

    // 确保绝对不包含明文 key
    assertEquals(text.includes("sk-user-secret-99999"), false);

    // 验证会话及消息在数据库中已持久化为完成状态
    const convRes = await app.request(
        `/api/ai/conversations/${meta.conversationId}`,
    );
    assertEquals(convRes.status, 200);
    const convBody = await convRes.json();
    assertEquals(convBody.status, true);
    const assistantMsg = convBody.data.messages.find(
        (m: { id: string }) => m.id === meta.messageId,
    );
    assertEquals(assistantMsg?.status, "complete");
    assertEquals(assistantMsg?.content, "Streaming response!");
});

Deno.test("AI Route: HTTP POST /api/ai/chat/stream emits meta, token, and error events on provider stream failure", async () => {
    const normalUser: UserDto = {
        id: "user-1",
        username: "testuser",
        displayName: "Test User",
        role: "user",
    };

    let streamPulls = 0;
    const mockFetch: typeof fetch = (input) => {
        const urlStr = String(input);
        if (urlStr.endsWith("/models")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: [{ id: "fail-stream-model" }],
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            );
        }
        if (urlStr.endsWith("/chat/completions")) {
            const stream = new ReadableStream({
                pull(controller) {
                    if (streamPulls === 0) {
                        streamPulls++;
                        controller.enqueue(
                            new TextEncoder().encode(
                                `data: ${
                                    JSON.stringify({
                                        choices: [{
                                            delta: {
                                                content:
                                                    "Partial stream token ",
                                            },
                                        }],
                                    })
                                }\n\n`,
                            ),
                        );
                    } else {
                        controller.error(
                            new Error("upstream provider socket hang up"),
                        );
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
        name: "Failing Provider",
        baseUrl: "https://api.ai.com/v1",
        apiKey: "sk-fail-secret-99999",
        scope: "user",
    }, false);

    const chatRes = await app.request("/api/ai/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider.id,
            modelId: "fail-stream-model",
            message: "Test message for stream failure",
        }),
    });

    assertEquals(chatRes.status, 200);
    assertEquals(
        chatRes.headers.get("Content-Type")?.includes("text/event-stream"),
        true,
    );

    const text = await chatRes.text();
    const events = parseSseEvents(text);

    // 验证事件流为 meta -> token -> error，且不包含 done
    assertEquals(events.map((e) => e.event), ["meta", "token", "error"]);

    const meta = events[0].data as {
        conversationId: string;
        messageId: string;
        providerId: string;
        modelId: string;
    };
    assertEquals(typeof meta.conversationId, "string");
    assertEquals(typeof meta.messageId, "string");
    assertEquals(meta.modelId, "fail-stream-model");

    assertEquals(events[1].data, "Partial stream token ");

    // 确保绝对不包含明文 key
    assertEquals(text.includes("sk-fail-secret-99999"), false);

    // 验证局部内容已持久化为 failed 状态
    const convRes = await app.request(
        `/api/ai/conversations/${meta.conversationId}`,
    );
    assertEquals(convRes.status, 200);
    const convBody = await convRes.json();
    assertEquals(convBody.status, true);
    const assistantMsg = convBody.data.messages.find(
        (m: { id: string }) => m.id === meta.messageId,
    );
    assertEquals(assistantMsg?.status, "failed");
    assertEquals(assistantMsg?.content, "Partial stream token ");
});

Deno.test("AI Route: HTTP POST /api/ai/chat/stream propagates request abort to provider and persists partial content", async () => {
    const normalUser: UserDto = {
        id: "user-1",
        username: "testuser",
        displayName: "Test User",
        role: "user",
    };

    let providerSignal: AbortSignal | null | undefined;
    let providerAborted = false;

    const mockFetch: typeof fetch = (input, init) => {
        const urlStr = String(input);
        if (urlStr.endsWith("/models")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: [{ id: "abort-model" }],
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            );
        }
        if (urlStr.endsWith("/chat/completions")) {
            providerSignal = init?.signal;
            if (providerSignal?.aborted) {
                providerAborted = true;
            } else {
                providerSignal?.addEventListener("abort", () => {
                    providerAborted = true;
                });
            }

            const stream = new ReadableStream({
                async start(controller) {
                    controller.enqueue(
                        new TextEncoder().encode(
                            `data: ${
                                JSON.stringify({
                                    choices: [{
                                        delta: {
                                            content:
                                                "Partial token before abort ",
                                        },
                                    }],
                                })
                            }\n\n`,
                        ),
                    );

                    if (init?.signal) {
                        if (init.signal.aborted) {
                            controller.error(
                                new DOMException(
                                    "The operation was aborted.",
                                    "AbortError",
                                ),
                            );
                            return;
                        }
                        await new Promise<void>((resolve) => {
                            init.signal?.addEventListener("abort", () => {
                                controller.error(
                                    new DOMException(
                                        "The operation was aborted.",
                                        "AbortError",
                                    ),
                                );
                                resolve();
                            });
                        });
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
        name: "Abort Provider",
        baseUrl: "https://api.ai.com/v1",
        apiKey: "sk-abort-secret-99999",
        scope: "user",
    }, false);

    const clientAbort = new AbortController();

    const chatRes = await app.request("/api/ai/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider.id,
            modelId: "abort-model",
            message: "Test abort handling",
        }),
        signal: clientAbort.signal,
    });

    assertEquals(chatRes.status, 200);

    const reader = chatRes.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
        try {
            const { done, value } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
            if (text.includes("Partial token before abort")) {
                clientAbort.abort();
            }
        } catch {
            break;
        }
    }

    // 验证 provider 层的 fetch 确实收到了 AbortSignal 且被触发
    assertEquals(providerAborted, true);
    assertEquals(providerSignal?.aborted, true);

    const events = parseSseEvents(text);
    const metaEvent = events.find((e) => e.event === "meta");
    const meta = metaEvent?.data as {
        conversationId: string;
        messageId: string;
    };
    assertEquals(typeof meta?.conversationId, "string");
    assertEquals(typeof meta?.messageId, "string");

    // 验证局部内容已持久化为 interrupted 状态
    const convRes = await app.request(
        `/api/ai/conversations/${meta.conversationId}`,
    );
    assertEquals(convRes.status, 200);
    const convBody = await convRes.json();
    assertEquals(convBody.status, true);
    const assistantMsg = convBody.data.messages.find(
        (m: { id: string }) => m.id === meta.messageId,
    );
    assertEquals(assistantMsg?.status, "interrupted");
    assertEquals(assistantMsg?.content, "Partial token before abort ");

    // 确保没有泄漏 key
    assertEquals(text.includes("sk-abort-secret-99999"), false);
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

const VALID_PNG_BYTES = new Uint8Array([
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

function createMockImageFetch(options?: {
    onImageRequest?: (body: {
        model?: string;
        prompt?: string;
        n?: number;
        size?: string;
        response_format?: string;
    }) => void;
    imageData?: Uint8Array;
}) {
    const imageBytes = options?.imageData ?? VALID_PNG_BYTES;
    return (
        input: RequestInfo | URL,
        init?: RequestInit,
    ): Promise<Response> => {
        const urlStr = String(input);
        if (urlStr.endsWith("/models")) {
            return Promise.resolve(
                Response.json({ data: [{ id: "image-model" }] }),
            );
        }
        if (urlStr.endsWith("/images/generations")) {
            const body = init?.body ? JSON.parse(String(init.body)) : {};
            options?.onImageRequest?.(body);
            return Promise.resolve(
                Response.json({
                    data: Array.from({ length: 3 }, () => ({
                        b64_json: imageBytes.toBase64(),
                    })),
                }),
            );
        }
        return Promise.resolve(new Response(null, { status: 404 }));
    };
}

const TEST_USER: UserDto = {
    id: "user-1",
    username: "testuser",
    displayName: "Test User",
    role: "user",
};

const SECOND_USER: UserDto = {
    id: "user-2",
    username: "testuser2",
    displayName: "Test User 2",
    role: "user",
};

Deno.test("AI Logo candidates route accepts all eight valid styles with one provider call of n=3 size=1024", async () => {
    const user = TEST_USER;

    for (const style of LOGO_STYLES) {
        let providerCalls = 0;
        let requestBody:
            | {
                model?: string;
                n?: number;
                size?: string;
                response_format?: string;
            }
            | undefined;

        const mockFetch = createMockImageFetch({
            onImageRequest: (body) => {
                providerCalls++;
                requestBody = body;
            },
        });

        const { app, service } = setupTestApp(user, mockFetch);
        const provider = await service.createProvider(user.id, {
            name: "Style Provider",
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
                style,
            }),
        });

        assertEquals(response.status, 200);
        const result = await response.json();
        assertEquals(result.status, true);
        assertEquals(result.data.images.length, 3);
        for (const img of result.data.images) {
            assertEquals(img.style, style);
            assertEquals(
                img.dataUrl,
                `data:image/png;base64,${VALID_PNG_BYTES.toBase64()}`,
            );
        }
        assertEquals(providerCalls, 1);
        assertEquals(requestBody?.model, "image-model");
        assertEquals(requestBody?.n, 3);
        assertEquals(requestBody?.size, "1024x1024");
        assertEquals(requestBody?.response_format, "b64_json");
    }
});

Deno.test("AI Logo candidates route rejects invalid styles before calling provider", async () => {
    const user = TEST_USER;

    let providerCalls = 0;
    const mockFetch = createMockImageFetch({
        onImageRequest: () => {
            providerCalls++;
        },
    });

    const { app, service } = setupTestApp(user, mockFetch);
    const provider = await service.createProvider(user.id, {
        name: "Test Provider",
        baseUrl: "https://images.example/v1",
        apiKey: "secret-key",
        scope: "user",
    });

    const invalidStyles = [
        "cyberpunk",
        "vintage",
        "minimalist",
        "3d",
        "",
        12345,
    ];

    for (const style of invalidStyles) {
        const response = await app.request("/api/ai/logo-candidates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                providerId: provider.id,
                modelId: "image-model",
                siteName: "Search",
                style,
            }),
        });

        assertEquals(response.status, 400);
        const result = await response.json();
        assertEquals(result.status, false);
        assertEquals(providerCalls, 0);
    }
});

Deno.test("AI Logo candidates route receives optional siteDomain and description as quoted data in provider prompt", async () => {
    const user = TEST_USER;

    let providerCalls = 0;
    let requestPrompt = "";

    const mockFetch = createMockImageFetch({
        onImageRequest: (body) => {
            providerCalls++;
            requestPrompt = String(body.prompt ?? "");
        },
    });

    const { app, service } = setupTestApp(user, mockFetch);
    const provider = await service.createProvider(user.id, {
        name: "Metadata Provider",
        baseUrl: "https://images.example/v1",
        apiKey: "secret-key",
        scope: "user",
    });

    const siteDomain = "search.example.com";
    const description = "Personal search and web-app launcher portal";

    const response = await app.request("/api/ai/logo-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider.id,
            modelId: "image-model",
            siteName: "Searcher",
            style: "glyph",
            siteDomain,
            description,
        }),
    });

    assertEquals(response.status, 200);
    assertEquals(providerCalls, 1);
    assertEquals(requestPrompt.includes(JSON.stringify(siteDomain)), true);
    assertEquals(requestPrompt.includes(JSON.stringify(description)), true);
    assertEquals(requestPrompt.includes(JSON.stringify("Searcher")), true);
});

Deno.test("AI Logo candidates route rejects siteDomain > 253 and description > 300 before provider call", async () => {
    const user = TEST_USER;

    let providerCalls = 0;
    const mockFetch = createMockImageFetch({
        onImageRequest: () => {
            providerCalls++;
        },
    });

    const { app, service } = setupTestApp(user, mockFetch);
    const provider = await service.createProvider(user.id, {
        name: "Boundary Provider",
        baseUrl: "https://images.example/v1",
        apiKey: "secret-key",
        scope: "user",
    });

    // 1. siteDomain > 253 characters rejected before provider call
    const overDomainRes = await app.request("/api/ai/logo-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider.id,
            modelId: "image-model",
            siteName: "Searcher",
            style: "minimal",
            siteDomain: "a".repeat(254),
        }),
    });
    assertEquals(overDomainRes.status, 400);
    assertEquals(providerCalls, 0);

    // 2. description > 300 characters rejected before provider call
    const overDescRes = await app.request("/api/ai/logo-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider.id,
            modelId: "image-model",
            siteName: "Searcher",
            style: "minimal",
            description: "d".repeat(301),
        }),
    });
    assertEquals(overDescRes.status, 400);
    assertEquals(providerCalls, 0);

    // 3. Exact boundaries (siteDomain: 253 chars, description: 300 chars) are accepted
    const boundaryRes = await app.request("/api/ai/logo-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider.id,
            modelId: "image-model",
            siteName: "Searcher",
            style: "minimal",
            siteDomain: "d".repeat(253),
            description: "c".repeat(300),
        }),
    });
    assertEquals(boundaryRes.status, 200);
    assertEquals(providerCalls, 1);
});

Deno.test("AI Logo candidates route omits absent and whitespace-only optional fields from prompt", async () => {
    const user = TEST_USER;

    let promptOmitted = "";
    let promptWhitespace = "";

    let stage = "omitted";
    const mockFetch = createMockImageFetch({
        onImageRequest: (body) => {
            if (stage === "omitted") {
                promptOmitted = String(body.prompt ?? "");
            } else {
                promptWhitespace = String(body.prompt ?? "");
            }
        },
    });

    const { app, service } = setupTestApp(user, mockFetch);
    const provider = await service.createProvider(user.id, {
        name: "Omitted Provider",
        baseUrl: "https://images.example/v1",
        apiKey: "secret-key",
        scope: "user",
    });

    // 1. Optional fields omitted entirely
    const resOmitted = await app.request("/api/ai/logo-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider.id,
            modelId: "image-model",
            siteName: "Searcher",
            style: "minimal",
        }),
    });
    assertEquals(resOmitted.status, 200);
    assertEquals(promptOmitted.includes("siteDomain"), false);
    assertEquals(promptOmitted.includes("description"), false);
    assertEquals(promptOmitted.includes("undefined"), false);
    assertEquals(promptOmitted.includes("null"), false);
    assertEquals(promptOmitted.includes('""'), false);

    // 2. Optional fields provided as whitespace-only
    stage = "whitespace";
    const resWhitespace = await app.request("/api/ai/logo-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider.id,
            modelId: "image-model",
            siteName: "Searcher",
            style: "minimal",
            siteDomain: "   ",
            description: "  \n\t  ",
        }),
    });
    assertEquals(resWhitespace.status, 200);
    assertEquals(promptWhitespace.includes("siteDomain"), false);
    assertEquals(promptWhitespace.includes("description"), false);
    assertEquals(promptWhitespace.includes("undefined"), false);
    assertEquals(promptWhitespace.includes("null"), false);
    assertEquals(promptWhitespace.includes('""'), false);
});

Deno.test("AI Logo candidates route rejects invalid images and denies unauthenticated or unowned model generation", async () => {
    const user1 = TEST_USER;
    const user2 = SECOND_USER;

    let providerCalls = 0;
    let returnCorruptImage = false;

    const mockFetch: typeof fetch = (input, _init) => {
        const urlStr = String(input);
        if (urlStr.endsWith("/models")) {
            return Promise.resolve(
                Response.json({ data: [{ id: "image-model" }] }),
            );
        }
        if (urlStr.endsWith("/images/generations")) {
            providerCalls++;
            const b64 = returnCorruptImage
                ? btoa("definitely-not-a-valid-image-format-bytes")
                : VALID_PNG_BYTES.toBase64();
            return Promise.resolve(
                Response.json({
                    data: Array.from(
                        { length: 3 },
                        () => ({ b64_json: b64 }),
                    ),
                }),
            );
        }
        return Promise.resolve(new Response(null, { status: 404 }));
    };

    const { app: app1, service, store } = setupTestApp(user1, mockFetch);
    const provider1 = await service.createProvider(user1.id, {
        name: "Private Provider",
        baseUrl: "https://images.example/v1",
        apiKey: "secret-key",
        scope: "user",
    });

    // 1. Unauthenticated request denied (401) before calling provider
    const { app: unauthApp } = setupTestApp(null, mockFetch, store);
    const unauthRes = await unauthApp.request("/api/ai/logo-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider1.id,
            modelId: "image-model",
            siteName: "Search",
            style: "minimal",
        }),
    });
    assertEquals(unauthRes.status, 401);
    assertEquals(providerCalls, 0);

    // 2. Unowned model generation denied (404) for user2 targeting user1's private provider
    const { app: app2 } = setupTestApp(user2, mockFetch, store);
    const unownedRes = await app2.request("/api/ai/logo-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider1.id,
            modelId: "image-model",
            siteName: "Search",
            style: "minimal",
        }),
    });
    assertEquals(unownedRes.status, 404);
    assertEquals(providerCalls, 0);

    // 3. Disabled provider rejected (404)
    await service.updateProvider(user1.id, provider1.id, { enabled: false });
    const disabledRes = await app1.request("/api/ai/logo-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider1.id,
            modelId: "image-model",
            siteName: "Search",
            style: "minimal",
        }),
    });
    assertEquals(disabledRes.status, 404);
    assertEquals(providerCalls, 0);

    // Re-enable provider for corrupt image test
    await service.updateProvider(user1.id, provider1.id, { enabled: true });

    // 4. Provider returning invalid image format rejected (400)
    returnCorruptImage = true;
    const corruptRes = await app1.request("/api/ai/logo-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider1.id,
            modelId: "image-model",
            siteName: "Search",
            style: "minimal",
        }),
    });
    assertEquals(corruptRes.status, 400);
    assertEquals(providerCalls, 1);
});
