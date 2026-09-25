import { assertEquals, assertRejects } from "@std/assert";
import { DatabaseSync } from "node:sqlite";
import { DatabaseStore } from "../../db/database.ts";
import { AiService, AiServiceError } from "./service.ts";
import { eq } from "drizzle-orm";
import { aiMessages } from "../../db/ai-schema.ts";
import { decryptApiKey, encryptApiKey, maskApiKey } from "./crypto.ts";
import { fetchOpenAIModels, streamOpenAIChat } from "./client.ts";

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

Deno.test("AI Service: Provider creation requires /models discovery & sets default model", async () => {
    const store = createInMemoryStore();
    const mockFetch: typeof fetch = (input) => {
        const urlStr = String(input);
        if (urlStr.endsWith("/models")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: [{ id: "mock-model-1" }, { id: "mock-model-2" }],
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
    const models = await service.listModels("user-1", sysProvider.id, false);
    assertEquals(models.length, 2);
    assertEquals(models[0].modelId, "mock-model-1");
    assertEquals(models[0].isDefault, true);
    assertEquals(models[1].modelId, "mock-model-2");
    assertEquals(models[1].isDefault, false);
});

Deno.test("AI Service: Streaming chat persists conversation and messages with history", async () => {
    const store = createInMemoryStore();
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
});

Deno.test("AI Provider update and refresh leave database available during model discovery", async () => {
    const store = createInMemoryStore();
    let discovered = [{ id: "first" }];
    const fetchFn: typeof fetch = () =>
        Promise.resolve(Response.json({ data: discovered }));
    const service = new AiService({ store, encryptionKey: TEST_KEY, fetchFn });
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
            setTimeout(() => reject(new Error("Provider update blocked")), 1500)
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
});

Deno.test("AI Service: History disabled (spec 7.4) maintains current context but excluded from history list", async () => {
    const store = createInMemoryStore();
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
            convId = (chunk.data as { conversationId: string }).conversationId;
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
    await assertRejects(
        async () => {
            await service.getConversation("user-1", convId);
        },
        AiServiceError,
        "对话不存在",
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
    await assertRejects(
        async () => {
            await ttlService.getConversation("user-1", tempConvId);
        },
        AiServiceError,
        "对话不存在",
    );
});

Deno.test("AI Service: Conversation deletion and short Undo restore (spec 17)", async () => {
    const store = createInMemoryStore();
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
            convId = (chunk.data as { conversationId: string }).conversationId;
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
});
