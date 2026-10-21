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
import { eq } from "drizzle-orm";
import { aiBlobs } from "../../db/ai-schema.ts";

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
            discovery_mode TEXT NOT NULL DEFAULT 'auto',
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
            active_leaf_message_id TEXT,
            system_instruction TEXT,
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
            parts_json TEXT,
            created_at INTEGER NOT NULL
        );`,
        `CREATE TABLE ai_blobs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE CASCADE,
            mime_type TEXT NOT NULL,
            data TEXT NOT NULL,
            size INTEGER NOT NULL,
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
    assertEquals((events[3].data as { status: string }).status, "complete");

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

Deno.test("AI Route: real HTTP client disconnect stops /api/ai/chat/stream provider generation", async () => {
    const normalUser: UserDto = {
        id: "user-1",
        username: "testuser",
        displayName: "Test User",
        role: "user",
    };

    // Real socket I/O needs a wall-clock bound; fake timers cannot drive the TCP response.
    const withTimeout = async <T>(
        promise: Promise<T>,
        description: string,
    ): Promise<T> => {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                promise,
                new Promise<never>((_, reject) => {
                    timeout = setTimeout(
                        () =>
                            reject(
                                new Error(
                                    `Timed out waiting for ${description}`,
                                ),
                            ),
                        5_000,
                    );
                }),
            ]);
        } finally {
            clearTimeout(timeout);
        }
    };

    let providerSignal: AbortSignal | undefined;
    let providerAborted = false;
    let providerStreamStopped = false;
    let providerStreamController:
        | ReadableStreamDefaultController<Uint8Array>
        | undefined;
    let releaseProviderPull: (() => void) | undefined;
    let resolveProviderAbort: (() => void) | undefined;
    let resolveProviderStreamStopped: (() => void) | undefined;
    const providerAbortObserved = new Promise<void>((resolve) => {
        resolveProviderAbort = resolve;
    });
    const providerStreamStoppedObserved = new Promise<void>((resolve) => {
        resolveProviderStreamStopped = resolve;
    });
    const markProviderStreamStopped = () => {
        if (providerStreamStopped) return;
        providerStreamStopped = true;
        resolveProviderStreamStopped?.();
        releaseProviderPull?.();
        try {
            providerStreamController?.close();
        } catch {
            // The consumer may already have cancelled the provider body.
        }
    };

    const mockFetch: typeof fetch = (input, init) => {
        const urlStr = String(input);
        if (urlStr.endsWith("/models")) {
            return Promise.resolve(
                Response.json({ data: [{ id: "tcp-disconnect-model" }] }),
            );
        }
        if (urlStr.endsWith("/chat/completions")) {
            providerSignal = init?.signal ?? undefined;
            if (providerSignal?.aborted) {
                providerAborted = true;
                resolveProviderAbort?.();
            } else {
                providerSignal?.addEventListener(
                    "abort",
                    () => {
                        providerAborted = true;
                        resolveProviderAbort?.();
                        markProviderStreamStopped();
                    },
                    { once: true },
                );
            }

            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    providerStreamController = controller;
                    controller.enqueue(
                        new TextEncoder().encode(
                            `data: ${
                                JSON.stringify({
                                    choices: [{
                                        delta: {
                                            content: "first TCP delta",
                                        },
                                    }],
                                })
                            }\n\n`,
                        ),
                    );
                },
                pull() {
                    if (providerStreamStopped) return;
                    return new Promise<void>((resolve) => {
                        releaseProviderPull = resolve;
                    });
                },
                cancel() {
                    markProviderStreamStopped();
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

    const { app, service, store } = setupTestApp(normalUser, mockFetch);
    const provider = await service.createProvider("user-1", {
        name: "TCP Disconnect Provider",
        baseUrl: "https://api.ai.com/v1",
        apiKey: "sk-tcp-disconnect-secret",
        scope: "user",
    }, false);

    const server = Deno.serve(
        {
            hostname: "127.0.0.1",
            port: 0,
            onListen: () => {},
        },
        (request) => app.fetch(request),
    );
    const clientAbort = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let receivedToken = false;

    try {
        const response = await withTimeout(
            fetch(
                `http://127.0.0.1:${server.addr.port}/api/ai/chat/stream`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        providerId: provider.id,
                        modelId: "tcp-disconnect-model",
                        message: "Disconnect after the first token",
                    }),
                    signal: clientAbort.signal,
                },
            ),
            "AI chat HTTP response",
        );
        assertEquals(response.status, 200);
        if (!response.body) {
            throw new Error(
                "AI chat response did not contain a streaming body",
            );
        }
        reader = response.body.getReader();

        const decoder = new TextDecoder();
        let receivedText = "";
        while (!receivedToken) {
            const { done, value } = await withTimeout(
                reader.read(),
                "first AI token over the TCP response",
            );
            if (done) {
                throw new Error(
                    "AI chat response ended before the first token arrived",
                );
            }
            receivedText += decoder.decode(value, { stream: true });
            receivedToken = receivedText.includes(
                'event: token\ndata: "first TCP delta"',
            );
        }

        clientAbort.abort();

        await withTimeout(
            providerAbortObserved,
            "provider fetch AbortSignal after client disconnect",
        );
        await withTimeout(
            providerStreamStoppedObserved,
            "provider stream termination after client disconnect",
        );
        assertEquals(receivedToken, true);
        assertEquals(providerSignal?.aborted, true);
        assertEquals(providerAborted, true);
        assertEquals(providerStreamStopped, true);
        const meta = parseSseEvents(receivedText).find((event) =>
            event.event === "meta"
        )?.data as { conversationId: string; messageId: string };
        await withTimeout(
            (async () => {
                // Persistence follows real socket cancellation, not a controllable clock.
                const deadline = Date.now() + 3000;
                while (true) {
                    const response = await app.request(
                        `/api/ai/conversations/${meta.conversationId}`,
                    );
                    const body: {
                        data: {
                            messages: Array<
                                { id: string; status: string; content: string }
                            >;
                        };
                    } = await response.json();
                    const message = body.data.messages.find((message) =>
                        message.id === meta.messageId
                    );
                    if (message?.status === "interrupted") {
                        assertEquals(message.content, "first TCP delta");
                        return;
                    }
                    if (Date.now() >= deadline) {
                        throw new Error(
                            "Interrupted assistant content was not persisted",
                        );
                    }
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }
            })(),
            "interrupted assistant content to be persisted",
        );
    } finally {
        clientAbort.abort();
        releaseProviderPull?.();
        try {
            providerStreamController?.close();
        } catch {
            // The response reader or abort handler may already have closed it.
        }
        if (reader) {
            try {
                await reader.cancel();
            } catch {
                // Aborting the fetch may already have errored the response body.
            }
        }
        await server.shutdown();
        await store.close();
    }
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

Deno.test("AI Route: HTTP DELETE /api/ai/conversations/:id/temporary deletes temporary conversation, messages and blobs (Cache-Control: no-store)", async () => {
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
                Response.json({ data: [{ id: "model-vision-temp" }] }),
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

    const { app, service, store } = setupTestApp(normalUser, mockFetch);
    const provider = await service.createProvider("user-1", {
        name: "User AI",
        baseUrl: "https://api.ai.com/v1",
        apiKey: "sk-user-secret-99999",
        scope: "user",
    }, false);

    const blobId = "blob-temp-1";
    const validPngBase64 =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const chatRes = await app.request("/api/ai/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            providerId: provider.id,
            modelId: "model-vision-temp",
            message: "Temporary chat with image",
            historyEnabled: false,
            attachments: [{
                id: blobId,
                name: "pixel.png",
                type: "image",
                mimeType: "image/png",
                data: validPngBase64,
            }],
        }),
    });
    assertEquals(chatRes.status, 200);
    const text = await chatRes.text();
    const convIdMatch = /"conversationId":"([^"]+)"/.exec(text);
    const convId = convIdMatch![1];

    // Can get conversation details while active
    const getRes = await app.request(`/api/ai/conversations/${convId}`);
    assertEquals(getRes.status, 200);
    // Get the stored blob generated by processAndStoreAttachments
    const [storedBlob] = await store.run(async (db) => {
        return await db
            .select()
            .from(aiBlobs)
            .where(eq(aiBlobs.conversationId, convId))
            .all();
    });
    assertEquals(Boolean(storedBlob), true);
    const realBlobId = storedBlob.id;

    // Verify blob retrieval and Cache-Control: no-store
    const blobRes = await app.request(`/api/ai/blobs/${realBlobId}`);
    assertEquals(blobRes.status, 200);
    assertEquals(blobRes.headers.get("content-type"), "image/png");
    assertEquals(blobRes.headers.get("cache-control"), "no-store");

    // Other user gets 403
    const otherUser: UserDto = {
        id: "user-2",
        username: "testuser2",
        displayName: "Test User 2",
        role: "user",
    };
    const { app: otherApp } = setupTestApp(otherUser, mockFetch, store);
    const otherBlobRes = await otherApp.request(`/api/ai/blobs/${realBlobId}`);
    assertEquals(otherBlobRes.status, 403);

    // Unauthenticated gets 401
    const { app: unauthApp } = setupTestApp(null, mockFetch, store);
    const unauthBlobRes = await unauthApp.request(
        `/api/ai/blobs/${realBlobId}`,
    );
    assertEquals(unauthBlobRes.status, 401);

    // Purge temporary conversation
    const purgeRes = await app.request(
        `/api/ai/conversations/${convId}/temporary`,
        {
            method: "DELETE",
        },
    );
    assertEquals(purgeRes.status, 200);

    // Subsequent conversation get returns 404
    const getResAfter = await app.request(
        `/api/ai/conversations/${convId}`,
    );
    assertEquals(getResAfter.status, 404);

    // Fresh HTTP GET for blob returns 404
    const blobResAfter = await app.request(`/api/ai/blobs/${realBlobId}`);
    assertEquals(blobResAfter.status, 404);

    // Database check: verify blob was truly purged from ai_blobs table (not just 404 hidden)
    const dbBlobs = await store.run(async (db) => {
        return await db
            .select()
            .from(aiBlobs)
            .where(eq(aiBlobs.id, realBlobId))
            .all();
    });
    assertEquals(dbBlobs.length, 0);
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
    const mockFetch: typeof fetch = (input) => {
        if (String(input).endsWith("/models")) {
            return Promise.resolve(
                Response.json({ data: [{ id: "image-model" }] }),
            );
        }
        if (String(input).endsWith("/images/generations")) {
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
});

Deno.test("AI Logo errors never disclose system credentials to ordinary users", async () => {
    const secret = 'sk-review-secret-with-"quote';
    let mode: "json" | "text" | "transport" = "json";
    const mockFetch: typeof fetch = (input) => {
        if (String(input).endsWith("/models")) {
            return Promise.resolve(
                Response.json({ data: [{ id: "image-model" }] }),
            );
        }
        const message = "Invalid credential: Bearer " + secret +
            "; check provider authentication";
        if (mode === "transport") return Promise.reject(new Error(message));
        return Promise.resolve(
            mode === "json"
                ? Response.json({ error: { message } }, { status: 401 })
                : new Response(message, { status: 401 }),
        );
    };
    const { app, service, store } = setupTestApp(TEST_USER, mockFetch);
    try {
        const provider = await service.createProvider("admin-1", {
            name: "System images",
            baseUrl: "https://images.example/v1",
            apiKey: secret,
            scope: "system",
        }, true);
        for (const failure of ["json", "text", "transport"] as const) {
            mode = failure;
            const response = await app.request("/api/ai/logo-candidates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    providerId: provider.id,
                    modelId: "image-model",
                    siteName: "Searcher",
                    style: "minimal",
                }),
            });
            assertEquals(response.status, 400);
            const result = await response.json();
            assertEquals(result.message.includes(secret), false);
            assertEquals(
                JSON.stringify(result).includes(
                    JSON.stringify(secret).slice(1, -1),
                ),
                false,
            );
            assertEquals(
                result.message.includes("check provider authentication"),
                true,
            );
        }
    } finally {
        await store.close();
    }
});

Deno.test("AI image protocol selection preserves model aliases and text chat", async () => {
    const baseUrl = "https://provider.example/tenant/v1beta/openai";
    const mockFetch: typeof fetch = (input, init) => {
        const path = new URL(String(input)).pathname;
        const body: unknown = typeof init?.body === "string"
            ? JSON.parse(init.body)
            : null;
        if (path === "/tenant/v1beta/openai/models") {
            return Promise.resolve(
                Response.json({
                    data: [{ id: "text-model" }, {
                        id: "google/gemini-3.1-flash-image",
                    }, {
                        id: "models/gemini-3.1-flash-image",
                    }],
                }),
            );
        }
        if (path === "/tenant/v1beta/openai/chat/completions") {
            if (
                !body || typeof body !== "object" || !("model" in body) ||
                body.model !== "text-model"
            ) return Promise.resolve(new Response(null, { status: 400 }));
            return Promise.resolve(
                new Response(
                    'data: {"choices":[{"delta":{"content":"text unaffected"}}]}\n\ndata: [DONE]\n\n',
                    { headers: { "Content-Type": "text/event-stream" } },
                ),
            );
        }
        if (path === "/tenant/v1beta/openai/images/generations") {
            if (
                !body || typeof body !== "object" || !("model" in body) ||
                body.model !== "google/gemini-3.1-flash-image"
            ) return Promise.resolve(new Response(null, { status: 400 }));
            return Promise.resolve(
                Response.json({
                    data: [{ b64_json: VALID_PNG_BYTES.toBase64() }],
                }),
            );
        }
        if (
            path ===
                "/tenant/v1beta/models/gemini-3.1-flash-image:generateContent"
        ) {
            return Promise.resolve(
                Response.json({
                    candidates: [{
                        content: {
                            parts: [{
                                inlineData: {
                                    mimeType: "image/png",
                                    data: VALID_PNG_BYTES.toBase64(),
                                },
                            }],
                        },
                    }],
                }),
            );
        }
        return Promise.resolve(new Response(null, { status: 404 }));
    };
    const { app, service, store } = setupTestApp(TEST_USER, mockFetch);
    try {
        const provider = await service.createProvider(TEST_USER.id, {
            name: "Mixed",
            baseUrl,
            apiKey: "fixture-secret",
            scope: "user",
        });
        for (const imageProtocol of ["openai", "gemini"] as const) {
            const modelId = imageProtocol === "openai"
                ? "google/gemini-3.1-flash-image"
                : "models/gemini-3.1-flash-image";
            const imageResponse = await app.request("/api/ai/logo-candidates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    providerId: provider.id,
                    modelId,
                    imageProtocol,
                    siteName: "Searcher",
                    style: "minimal",
                }),
            });
            assertEquals(imageResponse.status, 200);
            const images = (await imageResponse.json()).data.images;
            assertEquals(
                images.map((image: { dataUrl: string; style: string }) =>
                    image.dataUrl
                ),
                Array(3).fill(
                    "data:image/png;base64," + VALID_PNG_BYTES.toBase64(),
                ),
            );
            const chat = await app.request("/api/ai/chat/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: "Hello" }),
            });
            assertEquals(chat.status, 200);
            const events = parseSseEvents(await chat.text());
            assertEquals(
                events.filter((e) => e.event === "token").map((e) => e.data),
                [
                    "text unaffected",
                ],
            );
            assertEquals(events.some((e) => e.event === "done"), true);
            assertEquals(events.some((e) => e.event === "error"), false);
        }
    } finally {
        await store.close();
    }
});
