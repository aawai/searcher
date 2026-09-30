import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { DatabaseSync } from "node:sqlite";
import { DatabaseStore } from "../../db/database.ts";
import { AiService, AiServiceError } from "./service.ts";
import { and, eq } from "drizzle-orm";
import {
    aiConversations,
    aiMessages,
    aiModels,
    aiProviders,
} from "../../db/ai-schema.ts";
import { decryptApiKey, encryptApiKey, maskApiKey } from "./crypto.ts";
import {
    fetchOpenAIModels,
    normalizeBaseUrl,
    OpenAIClientError,
} from "./client.ts";

function createInMemoryStore(): DatabaseStore {
    const native = new DatabaseSync(":memory:");
    const store = new DatabaseStore(native);

    // 建表语句 (基于 ai-schema.ts 和 users 表)
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
            id TEXT PRIMARY KEY, actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT,
            metadata_json TEXT, created_at INTEGER NOT NULL
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

    // 预填测试用户
    native.exec(`
        INSERT INTO users (id, username, display_name, password_hash, role, created_at, updated_at)
        VALUES ('user-1', 'testuser', 'Test User', 'hash', 'user', 1000, 1000),
               ('admin-1', 'adminuser', 'Admin User', 'hash', 'admin', 1000, 1000);
    `);

    return store;
}

function parseUrl(input: RequestInfo | URL): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.toString();
    return input.url;
}

function sseResponse(chunks: string[], signal?: AbortSignal): Response {
    const encoder = new TextEncoder();
    let index = 0;
    let abortListener: (() => void) | undefined;

    const stream = new ReadableStream({
        start(controller) {
            if (signal) {
                abortListener = () => {
                    try {
                        controller.error(
                            new DOMException(
                                "The operation was aborted",
                                "AbortError",
                            ),
                        );
                    } catch {
                        // ignore if stream is already closed
                    }
                };
                if (signal.aborted) {
                    abortListener();
                } else {
                    signal.addEventListener("abort", abortListener, {
                        once: true,
                    });
                }
            }
        },
        pull(controller) {
            if (signal?.aborted) {
                try {
                    controller.error(
                        new DOMException(
                            "The operation was aborted",
                            "AbortError",
                        ),
                    );
                } catch {
                    // ignore
                }
                return;
            }
            if (index < chunks.length) {
                controller.enqueue(encoder.encode(chunks[index++]));
            } else {
                controller.close();
            }
        },
        cancel() {
            if (abortListener && signal) {
                signal.removeEventListener("abort", abortListener);
            }
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}

function makeChunk(content: string): string {
    return `data: ${
        JSON.stringify({
            id: "chatcmpl-test",
            object: "chat.completion.chunk",
            created: 1700000000,
            choices: [{
                index: 0,
                delta: { content },
                finish_reason: null,
            }],
        })
    }\n\n`;
}

function makeDoneChunk(): string {
    return "data: [DONE]\n\n";
}

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
        },
    });
}

const TEST_KEY = "12345678901234567890123456789012"; // 32 chars master key

Deno.test("AI Crypto: encryptApiKey & decryptApiKey works with mask", async () => {
    const rawKey = "sk-test-secret-1234567890";
    const cipher = await encryptApiKey(rawKey, TEST_KEY);
    assertEquals(typeof cipher, "string");
    const decrypted = await decryptApiKey(cipher, TEST_KEY);
    assertEquals(decrypted, rawKey);

    const masked = maskApiKey(rawKey);
    assertEquals(masked.startsWith("sk-"), true);
    assertEquals(masked.endsWith("7890"), true);
    assertEquals(masked.includes("..."), true);
});

Deno.test("AI Client: fetchOpenAIModels discovers models correctly", async () => {
    const mockFetch: typeof fetch = (_input, _init) => {
        return Promise.resolve(
            new Response(
                JSON.stringify({
                    object: "list",
                    data: [
                        { id: "gpt-4o", object: "model" },
                        { id: "gpt-4o-mini", object: "model" },
                    ],
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            ),
        );
    };

    const models = await fetchOpenAIModels(
        "https://api.openai.com/v1",
        "sk-mock",
        mockFetch,
    );
    assertEquals(models.length, 2);
    assertEquals(models[0].id, "gpt-4o");
    assertEquals(models[0].supportsVision, true);
    assertEquals(models[1].id, "gpt-4o-mini");
});

Deno.test("AI Client: normalizeBaseUrl validates allowed endpoints", () => {
    assertEquals(
        normalizeBaseUrl("http://localhost:11434"),
        "http://localhost:11434",
    );
    assertEquals(
        normalizeBaseUrl("http://127.0.0.1:11434/"),
        "http://127.0.0.1:11434",
    );
    assertEquals(
        normalizeBaseUrl("http://100.78.0.1:11434"),
        "http://100.78.0.1:11434",
    );
    assertEquals(
        normalizeBaseUrl("https://api.openai.com/v1"),
        "https://api.openai.com/v1",
    );

    assertThrows(
        () => normalizeBaseUrl("http://192.168.1.1:11434"),
        OpenAIClientError,
    );
    assertThrows(
        () => normalizeBaseUrl("http://example.com"),
        OpenAIClientError,
    );
});

Deno.test("AI Service: Provider creation requires /models discovery & sets default model", async () => {
    const store = createInMemoryStore();
    try {
        const mockFetch: typeof fetch = (input) => {
            const urlStr = String(input);
            if (urlStr.endsWith("/models")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            data: [{ id: "mock-model-1" }, {
                                id: "mock-model-2",
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

        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });

        // 1. 普通用户不能创建 system provider
        await assertRejects(
            () =>
                service.createProvider("user-1", {
                    name: "Sys Provider",
                    baseUrl: "https://api.example.com/v1",
                    apiKey: "sk-sys",
                    scope: "system",
                }, false),
            Error,
            "只有管理员可以创建系统级 AI Provider",
        );

        // 2. 管理员创建 system provider
        const sysProvider = await service.createProvider("admin-1", {
            name: "Sys Provider",
            baseUrl: "https://api.example.com/v1",
            apiKey: "sk-sys-1234567890",
            scope: "system",
        }, true);

        assertEquals(sysProvider.scope, "system");
        assertEquals(sysProvider.apiKeyMasked.includes("sk-"), true);

        // 3. 模型列表应已自动发现并落库
        const models = await service.listModels(
            "user-1",
            sysProvider.id,
            false,
        );
        assertEquals(models.length, 2);
        assertEquals(models[0].modelId, "mock-model-1");
        assertEquals(models[0].isDefault, true);
        assertEquals(models[1].modelId, "mock-model-2");
        assertEquals(models[1].isDefault, false);
    } finally {
        await store.close();
    }
});

Deno.test("AI Service: Streaming chat persists conversation and messages with history", async () => {
    const store = createInMemoryStore();
    try {
        const mockFetch: typeof fetch = (input, init) => {
            const urlStr = String(input);
            if (urlStr.endsWith("/models")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            data: [{ id: "model-stream" }],
                        }),
                        {
                            status: 200,
                            headers: { "Content-Type": "application/json" },
                        },
                    ),
                );
            }
            if (urlStr.endsWith("/chat/completions")) {
                const bodyStr = init?.body as string;
                const parsed = JSON.parse(bodyStr);
                const messages = parsed.messages;
                // 简单校验 messages 携带了历史
                const lastUserMsg = messages[messages.length - 1]?.content;

                const chunks = [
                    `data: ${
                        JSON.stringify({
                            choices: [{
                                delta: { content: `Echo: ${lastUserMsg}` },
                            }],
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

        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });

        const provider = await service.createProvider("user-1", {
            name: "User Provider",
            baseUrl: "https://api.ai.com/v1",
            apiKey: "sk-user-test-12345",
            scope: "user",
        }, false);

        // 第一轮对话
        const stream1 = service.streamChat("user-1", {
            providerId: provider.id,
            modelId: "model-stream",
            message: "Hello world!",
        });

        let convId = "";
        let receivedTokens = "";

        for await (const chunk of stream1) {
            if (chunk.event === "meta") {
                const meta = chunk.data as { conversationId: string };
                convId = meta.conversationId;
            } else if (chunk.event === "token") {
                receivedTokens += chunk.data as string;
            }
        }

        assertEquals(receivedTokens, "Echo: Hello world!");

        // 检查落库结果
        const convDetails1 = await service.getConversation("user-1", convId);
        assertEquals(convDetails1.conversation.title, "Hello world!");
        assertEquals(convDetails1.messages.length, 2);
        assertEquals(convDetails1.messages[0].role, "user");
        assertEquals(convDetails1.messages[0].content, "Hello world!");
        assertEquals(convDetails1.messages[1].role, "assistant");
        assertEquals(convDetails1.messages[1].content, "Echo: Hello world!");
        assertEquals(convDetails1.messages[1].status, "complete");

        // 第二轮对话 (带上 conversationId)
        const stream2 = service.streamChat("user-1", {
            conversationId: convId,
            providerId: provider.id,
            modelId: "model-stream",
            message: "Second message",
        });

        let receivedTokens2 = "";
        for await (const chunk of stream2) {
            if (chunk.event === "token") {
                receivedTokens2 += chunk.data as string;
            }
        }

        assertEquals(receivedTokens2, "Echo: Second message");

        const convDetails2 = await service.getConversation("user-1", convId);
        assertEquals(convDetails2.messages.length, 4);
        assertEquals(convDetails2.messages[2].content, "Second message");
        assertEquals(convDetails2.messages[3].content, "Echo: Second message");
    } finally {
        await store.close();
    }
});

Deno.test("AI Provider update and refresh leave database available during model discovery", async () => {
    const store = createInMemoryStore();
    try {
        let discovered = [{ id: "first" }];
        const fetchFn: typeof fetch = () =>
            Promise.resolve(Response.json({ data: discovered }));
        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn,
        });
        const provider = await service.createProvider("user-1", {
            name: "First",
            baseUrl: "https://ai.example.com/v1",
            apiKey: "key-first",
        });
        discovered = [{ id: "first" }, { id: "second" }];
        const updated = await Promise.race([
            service.updateProvider("user-1", provider.id, {
                name: "Updated",
                apiKey: "key-next",
            }),
            new Promise<never>((_, reject) =>
                setTimeout(
                    () => reject(new Error("Provider update blocked")),
                    1500,
                )
            ),
        ]);
        assertEquals(updated.name, "Updated");
        const refreshed = await Promise.race([
            service.refreshProviderModels("user-1", provider.id),
            new Promise<never>((_, reject) =>
                setTimeout(
                    () => reject(new Error("Provider refresh blocked")),
                    1500,
                )
            ),
        ]);
        assertEquals(refreshed.map((model) => model.modelId).sort(), [
            "first",
            "second",
        ]);
    } finally {
        await store.close();
    }
});

Deno.test("AI Service: History disabled (spec 7.4) maintains current context but excluded from history list", async () => {
    const store = createInMemoryStore();
    try {
        const mockFetch: typeof fetch = (input, init) => {
            const urlStr = String(input);
            if (urlStr.endsWith("/models")) {
                return Promise.resolve(
                    Response.json({ data: [{ id: "model-history-off" }] }),
                );
            }
            if (urlStr.endsWith("/chat/completions")) {
                const bodyStr = init?.body as string;
                const parsed = JSON.parse(bodyStr);
                const messages = parsed.messages;
                const lastUserMsg = messages[messages.length - 1]?.content;
                const chunks = [
                    `data: ${
                        JSON.stringify({
                            choices: [{
                                delta: { content: `Echo: ${lastUserMsg}` },
                            }],
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

        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });
        const provider = await service.createProvider("user-1", {
            name: "User Provider",
            baseUrl: "https://api.ai.com/v1",
            apiKey: "sk-user-test-12345",
            scope: "user",
        }, false);

        // Turn 1 with historyEnabled: false
        const stream1 = service.streamChat("user-1", {
            providerId: provider.id,
            modelId: "model-history-off",
            message: "Secret conversation 1",
            historyEnabled: false,
        });

        let convId = "";
        for await (const chunk of stream1) {
            if (chunk.event === "meta") {
                convId =
                    (chunk.data as { conversationId: string }).conversationId;
            }
        }

        // 1. Current conversation context can be fetched and continues to work
        const conv1 = await service.getConversation("user-1", convId);
        assertEquals(conv1.conversation.historyEnabled, false);
        assertEquals(conv1.messages.length, 2);

        // Turn 2 in the same conversation
        const stream2 = service.streamChat("user-1", {
            conversationId: convId,
            providerId: provider.id,
            modelId: "model-history-off",
            message: "Secret conversation 2",
        });
        for await (const _ of stream2) {
            // drain
        }
        const conv2 = await service.getConversation("user-1", convId);
        assertEquals(conv2.messages.length, 4);

        // 2. Long-term history list excludes historyEnabled: false
        const list = await service.listConversations("user-1");
        assertEquals(list.some((item) => item.id === convId), false);

        // 3. New / Close: purgeTemporaryConversation destroys conversation and messages
        await service.purgeTemporaryConversation("user-1", convId);
        assertEquals(
            (await assertRejects(async () => {
                await service.getConversation("user-1", convId);
            }, AiServiceError)).statusCode,
            404,
        );

        // 4. Verify messages are also deleted
        await store.run(async (db) => {
            const msgs = await db
                .select()
                .from(aiMessages)
                .where(eq(aiMessages.conversationId, convId))
                .all();
            assertEquals(msgs.length, 0);
        });

        // 5. Server-side TTL cleanup兜底测试
        let mockTime = 1000000;
        const ttlService = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
            now: () => mockTime,
        });
        const stream3 = ttlService.streamChat("user-1", {
            providerId: provider.id,
            modelId: "model-history-off",
            message: "Old temporary message",
            historyEnabled: false,
        });
        let tempConvId = "";
        for await (const chunk of stream3) {
            if (chunk.event === "meta") {
                tempConvId =
                    (chunk.data as { conversationId: string }).conversationId;
            }
        }
        // Advance mock time by 31 minutes (exceeding 30 min TTL)
        mockTime += 31 * 60 * 1000;
        const purgedCount = await ttlService.purgeExpiredTemporaryConversations(
            30 * 60 * 1000,
        );
        assertEquals(purgedCount, 1);
        assertEquals(
            (await assertRejects(async () => {
                await ttlService.getConversation("user-1", tempConvId);
            }, AiServiceError)).statusCode,
            404,
        );
    } finally {
        await store.close();
    }
});

Deno.test("AI Service: Conversation deletion and short Undo restore (spec 17)", async () => {
    const store = createInMemoryStore();
    try {
        const mockFetch: typeof fetch = (input) => {
            const urlStr = String(input);
            if (urlStr.endsWith("/models")) {
                return Promise.resolve(
                    Response.json({ data: [{ id: "model-undo" }] }),
                );
            }
            if (urlStr.endsWith("/chat/completions")) {
                const chunks = [
                    `data: ${
                        JSON.stringify({
                            choices: [{ delta: { content: "Echo" } }],
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

        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });
        const provider = await service.createProvider("user-1", {
            name: "Undo Provider",
            baseUrl: "https://api.ai.com/v1",
            apiKey: "sk-user-test-12345",
            scope: "user",
        }, false);

        const stream = service.streamChat("user-1", {
            providerId: provider.id,
            modelId: "model-undo",
            message: "To be deleted",
            historyEnabled: true,
        });
        let convId = "";
        for await (const chunk of stream) {
            if (chunk.event === "meta") {
                convId =
                    (chunk.data as { conversationId: string }).conversationId;
            }
        }

        // List contains convId
        let list = await service.listConversations("user-1");
        assertEquals(list.some((c) => c.id === convId), true);

        // Delete conversation
        await service.deleteConversation("user-1", convId);
        list = await service.listConversations("user-1");
        assertEquals(list.some((c) => c.id === convId), false);

        // Short Undo restore
        const restored = await service.restoreConversation("user-1", convId);
        assertEquals(restored.id, convId);
        assertEquals(restored.deletedAt, null);

        // List contains convId again
        list = await service.listConversations("user-1");
        assertEquals(list.some((c) => c.id === convId), true);
    } finally {
        await store.close();
    }
});

Deno.test("AI Service: Partial token Abort persists interrupted content", async () => {
    const store = createInMemoryStore();
    try {
        const mockFetch: typeof fetch = (input, init) => {
            const url = parseUrl(input);
            const signal = init?.signal ??
                (input instanceof Request ? input.signal : undefined);
            if (url.endsWith("/models")) {
                return Promise.resolve(
                    jsonResponse({
                        object: "list",
                        data: [{ id: "model-abort", object: "model" }],
                    }),
                );
            }
            if (url.endsWith("/chat/completions")) {
                const chunks = [
                    makeChunk("First partial token; "),
                    makeChunk("second partial token; "),
                    makeChunk("third partial token that should be discarded"),
                    makeDoneChunk(),
                ];
                return Promise.resolve(sseResponse(chunks, signal));
            }
            return Promise.resolve(new Response("Not Found", { status: 404 }));
        };

        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });

        const provider = await service.createProvider("user-1", {
            name: "Abort Provider",
            baseUrl: "https://api.ai.com/v1",
            apiKey: "sk-abort-key-12345",
            scope: "user",
        }, false);

        const abortController = new AbortController();
        const stream = service.streamChat("user-1", {
            providerId: provider.id,
            modelId: "model-abort",
            message: "Start streaming",
        }, abortController.signal);

        let convId = "";
        let assistantMsgId = "";
        let receivedTokens = "";

        for await (const chunk of stream) {
            if (chunk.event === "meta") {
                const meta = chunk.data as {
                    conversationId: string;
                    messageId: string;
                };
                convId = meta.conversationId;
                assistantMsgId = meta.messageId;
            } else if (chunk.event === "token") {
                receivedTokens += chunk.data as string;
                if (receivedTokens.includes("second partial token;")) {
                    abortController.abort();
                }
            }
        }

        // Verify tokens received before abort
        assertEquals(
            receivedTokens,
            "First partial token; second partial token; ",
        );

        // Public API verification
        const conv = await service.getConversation("user-1", convId);
        assertEquals(conv.messages.length, 2);
        const [userMsg, assistantMsg] = conv.messages;

        assertEquals(userMsg.role, "user");
        assertEquals(userMsg.content, "Start streaming");
        assertEquals(userMsg.status, "complete");

        assertEquals(assistantMsg.id, assistantMsgId);
        assertEquals(assistantMsg.role, "assistant");
        assertEquals(assistantMsg.status, "interrupted");
        assertEquals(
            assistantMsg.content,
            "First partial token; second partial token; ",
        );
    } finally {
        await store.close();
    }
});

Deno.test("AI Service: 4xx and 5xx responses preserve failed status and error", async () => {
    const store = createInMemoryStore();
    try {
        let returnStatus = 500;
        let errorMessage = "Internal server error: capacity limit";

        const mockFetch: typeof fetch = (input) => {
            const url = parseUrl(input);
            if (url.endsWith("/models")) {
                return Promise.resolve(
                    jsonResponse({
                        object: "list",
                        data: [{ id: "model-err", object: "model" }],
                    }),
                );
            }
            if (url.endsWith("/chat/completions")) {
                return Promise.resolve(
                    jsonResponse(
                        { error: { message: errorMessage, type: "api_error" } },
                        returnStatus,
                    ),
                );
            }
            return Promise.resolve(new Response("Not Found", { status: 404 }));
        };

        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });

        const provider = await service.createProvider("user-1", {
            name: "Error Provider",
            baseUrl: "https://api.ai.com/v1",
            apiKey: "sk-error-key-12345",
            scope: "user",
        }, false);

        // --- 1. Test 5xx error (500) ---
        returnStatus = 500;
        errorMessage = "Internal server error: capacity limit";

        const stream500 = service.streamChat("user-1", {
            providerId: provider.id,
            modelId: "model-err",
            message: "Test 500 error",
        });

        let convId500 = "";
        let assistantMsgId500 = "";
        let errorData500: unknown = null;

        for await (const chunk of stream500) {
            if (chunk.event === "meta") {
                const meta = chunk.data as {
                    conversationId: string;
                    messageId: string;
                };
                convId500 = meta.conversationId;
                assistantMsgId500 = meta.messageId;
            } else if (chunk.event === "error") {
                errorData500 = chunk.data;
            }
        }

        // Verify error event was yielded and contains error details
        assertEquals(typeof errorData500, "string");
        assertEquals((errorData500 as string).includes("500"), true);

        // Verify conversation messages in database via service API
        const convDetails500 = await service.getConversation(
            "user-1",
            convId500,
        );
        assertEquals(convDetails500.messages.length, 2);
        const [userMsg500, assistantMsg500] = convDetails500.messages;
        assertEquals(userMsg500.status, "complete");
        assertEquals(assistantMsg500.id, assistantMsgId500);
        assertEquals(assistantMsg500.status, "failed");
        assertEquals(assistantMsg500.content, "");

        // --- 2. Test 4xx error (429 Rate Limit) ---
        returnStatus = 429;
        errorMessage = "Rate limit exceeded: too many requests";

        const stream429 = service.streamChat("user-1", {
            providerId: provider.id,
            modelId: "model-err",
            message: "Test 429 error",
        });

        let convId429 = "";
        let assistantMsgId429 = "";
        let errorData429: unknown = null;

        for await (const chunk of stream429) {
            if (chunk.event === "meta") {
                const meta = chunk.data as {
                    conversationId: string;
                    messageId: string;
                };
                convId429 = meta.conversationId;
                assistantMsgId429 = meta.messageId;
            } else if (chunk.event === "error") {
                errorData429 = chunk.data;
            }
        }

        // Verify error event was yielded and contains 429 details
        assertEquals(typeof errorData429, "string");
        assertEquals((errorData429 as string).includes("429"), true);

        // Verify assistant message status is "failed"
        const convDetails429 = await service.getConversation(
            "user-1",
            convId429,
        );
        assertEquals(convDetails429.messages.length, 2);
        const assistantMsg429 = convDetails429.messages[1];
        assertEquals(assistantMsg429.id, assistantMsgId429);
        assertEquals(assistantMsg429.status, "failed");
    } finally {
        await store.close();
    }
});

Deno.test("AI Service: No silent provider failover when selected provider fails", async () => {
    const store = createInMemoryStore();
    try {
        let providerACalls = 0;
        let providerBCalls = 0;

        const mockFetch: typeof fetch = (input) => {
            const url = parseUrl(input);
            if (url.includes("provider-a.example")) {
                if (url.endsWith("/models")) {
                    return Promise.resolve(
                        jsonResponse({
                            object: "list",
                            data: [{ id: "model-a", object: "model" }],
                        }),
                    );
                }
                if (url.endsWith("/chat/completions")) {
                    providerACalls++;
                    return Promise.resolve(
                        jsonResponse(
                            {
                                error: {
                                    message: "Provider A backend crash",
                                    type: "server_error",
                                },
                            },
                            500,
                        ),
                    );
                }
            }

            if (url.includes("provider-b.example")) {
                if (url.endsWith("/models")) {
                    return Promise.resolve(
                        jsonResponse({
                            object: "list",
                            data: [{ id: "model-b", object: "model" }],
                        }),
                    );
                }
                if (url.endsWith("/chat/completions")) {
                    providerBCalls++;
                    const chunks = [
                        makeChunk("Provider B response"),
                        makeDoneChunk(),
                    ];
                    return Promise.resolve(sseResponse(chunks));
                }
            }

            return Promise.resolve(new Response("Not Found", { status: 404 }));
        };

        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });

        // Provider A (User Provider)
        const providerA = await service.createProvider("user-1", {
            name: "Provider A",
            baseUrl: "https://provider-a.example/v1",
            apiKey: "sk-key-a-12345",
            scope: "user",
        }, false);

        // Provider B (System Provider with default model)
        await service.createProvider("admin-1", {
            name: "Provider B Backup",
            baseUrl: "https://provider-b.example/v1",
            apiKey: "sk-key-b-12345",
            scope: "system",
        }, true);

        // Chat explicitly requesting Provider A
        const stream = service.streamChat("user-1", {
            providerId: providerA.id,
            modelId: "model-a",
            message: "Failover check message",
        });

        let convId = "";
        let assistantMsgId = "";
        let receivedError: unknown = null;

        for await (const chunk of stream) {
            if (chunk.event === "meta") {
                const meta = chunk.data as {
                    conversationId: string;
                    messageId: string;
                };
                convId = meta.conversationId;
                assistantMsgId = meta.messageId;
            } else if (chunk.event === "error") {
                receivedError = chunk.data;
            }
        }

        // Provider A was invoked exactly once
        assertEquals(providerACalls, 1);
        // Provider B must NEVER be called (no silent failover to backup provider)
        assertEquals(providerBCalls, 0);

        // Error must be propagated to caller
        assertEquals(typeof receivedError, "string");
        assertEquals((receivedError as string).includes("500"), true);

        // The assistant message must belong to Provider A and have status "failed"
        const conv = await service.getConversation("user-1", convId);
        assertEquals(conv.messages.length, 2);
        const assistantMsg = conv.messages[1];
        assertEquals(assistantMsg.id, assistantMsgId);
        assertEquals(assistantMsg.providerId, providerA.id);
        assertEquals(assistantMsg.modelId, "model-a");
        assertEquals(assistantMsg.status, "failed");
    } finally {
        await store.close();
    }
});

Deno.test("AI Service: Target unavailable rejects without silent failover", async () => {
    const store = createInMemoryStore();
    try {
        let systemChatCalls = 0;

        const mockFetch: typeof fetch = (input) => {
            const url = parseUrl(input);
            if (url.endsWith("/models")) {
                return Promise.resolve(
                    jsonResponse({
                        object: "list",
                        data: [
                            { id: "sys-default", object: "model" },
                            { id: "model-active", object: "model" },
                            { id: "model-inactive", object: "model" },
                        ],
                    }),
                );
            }
            if (url.endsWith("/chat/completions")) {
                systemChatCalls++;
                return Promise.resolve(
                    sseResponse([makeChunk("Sys response"), makeDoneChunk()]),
                );
            }
            return Promise.resolve(new Response("Not Found", { status: 404 }));
        };

        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });

        // Active System Provider with default model
        await service.createProvider("admin-1", {
            name: "System Fallback Provider",
            baseUrl: "https://sys.example.com/v1",
            apiKey: "sk-sys-12345",
            scope: "system",
        }, true);

        // User Provider with multiple models
        const userProvider = await service.createProvider("user-1", {
            name: "User Provider",
            baseUrl: "https://user.example.com/v1",
            apiKey: "sk-user-12345",
            scope: "user",
        }, false);

        // --- 1. Target provider does not exist ---

        assertEquals(
            (await assertRejects(async () => {
                const stream = service.streamChat("user-1", {
                    providerId: "non-existent-provider-id",
                    modelId: "sys-default",
                    message: "Should not execute",
                });
                for await (const _ of stream) {
                    // drain
                }
            }, AiServiceError)).statusCode,
            404,
        );

        // --- 2. Target provider is disabled ---
        await store.run(async (db) => {
            await db
                .update(aiProviders)
                .set({ enabled: false })
                .where(eq(aiProviders.id, userProvider.id))
                .run();
        });

        assertEquals(
            (await assertRejects(async () => {
                const stream = service.streamChat("user-1", {
                    providerId: userProvider.id,
                    modelId: "model-active",
                    message: "Should not execute",
                });
                for await (const _ of stream) {
                    // drain
                }
            }, AiServiceError)).statusCode,
            404,
        );

        // Re-enable user provider for subsequent model tests
        await store.run(async (db) => {
            await db
                .update(aiProviders)
                .set({ enabled: true })
                .where(eq(aiProviders.id, userProvider.id))
                .run();
        });

        // --- 3. Target model is disabled ---
        await store.run(async (db) => {
            await db
                .update(aiModels)
                .set({ enabled: false })
                .where(
                    and(
                        eq(aiModels.providerId, userProvider.id),
                        eq(aiModels.modelId, "model-inactive"),
                    ),
                )
                .run();
        });

        assertEquals(
            (await assertRejects(async () => {
                const stream = service.streamChat("user-1", {
                    providerId: userProvider.id,
                    modelId: "model-inactive",
                    message: "Should not execute",
                });
                for await (const _ of stream) {
                    // drain
                }
            }, AiServiceError)).statusCode,
            404,
        );

        // --- 4. Target model is not visible to users ---
        await store.run(async (db) => {
            await db
                .update(aiModels)
                .set({ enabled: true, visibleToUsers: false })
                .where(
                    and(
                        eq(aiModels.providerId, userProvider.id),
                        eq(aiModels.modelId, "model-inactive"),
                    ),
                )
                .run();
        });

        assertEquals(
            (await assertRejects(async () => {
                const stream = service.streamChat("user-1", {
                    providerId: userProvider.id,
                    modelId: "model-inactive",
                    message: "Should not execute",
                });
                for await (const _ of stream) {
                    // drain
                }
            }, AiServiceError)).statusCode,
            404,
        );

        // --- 5. Target provider belongs to another user ---
        const otherUserProvider = await service.createProvider("admin-1", {
            name: "Admin Private Provider",
            baseUrl: "https://admin.example.com/v1",
            apiKey: "sk-admin-private-12345",
            scope: "user",
        }, true);

        assertEquals(
            (await assertRejects(async () => {
                const stream = service.streamChat("user-1", {
                    providerId: otherUserProvider.id,
                    modelId: "sys-default",
                    message: "Should not execute",
                });
                for await (const _ of stream) {
                    // drain
                }
            }, AiServiceError)).statusCode,
            404,
        );

        // --- 6. Verify System provider chat completions was NEVER called ---
        assertEquals(systemChatCalls, 0);

        // --- 7. Verify no orphan conversations or messages created during rejected calls ---
        await store.run(async (db) => {
            const conversations = await db.select().from(aiConversations).all();
            assertEquals(conversations.length, 0);
            const messages = await db.select().from(aiMessages).all();
            assertEquals(messages.length, 0);
        });
    } finally {
        await store.close();
    }
});
