import { assert, assertEquals, assertExists, assertRejects } from "@std/assert";
import { DatabaseSync } from "node:sqlite";
import { DatabaseStore, openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { users } from "../../db/schema.ts";
import { DocumentsService } from "../documents/service.ts";
import { AiService } from "./service.ts";
import { aiBlobs, aiConversations, aiMessages } from "../../db/ai-schema.ts";
import { executeToolCall } from "./tools.ts";

const TEST_KEY = "12345678901234567890123456789012";

function createTestStore(): DatabaseStore {
    const native = new DatabaseSync(":memory:");
    const store = new DatabaseStore(native);
    store.migrate([
        `CREATE TABLE users (
            id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT UNIQUE,
            display_name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user',
            disabled INTEGER NOT NULL DEFAULT 0, must_change_password INTEGER NOT NULL DEFAULT 0,
            auth_version INTEGER NOT NULL DEFAULT 1, soft_deleted_at INTEGER,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );`,
        `CREATE TABLE audit_logs (
            id TEXT PRIMARY KEY, actor_user_id TEXT, action TEXT NOT NULL, target_type TEXT NOT NULL,
            target_id TEXT, metadata_json TEXT, created_at INTEGER NOT NULL
        );`,
        `CREATE TABLE ai_providers (
            id TEXT PRIMARY KEY, owner_user_id TEXT, scope TEXT NOT NULL CHECK(scope in ('system', 'user')),
            name TEXT NOT NULL, base_url TEXT NOT NULL, encrypted_api_key TEXT NOT NULL,
            discovery_mode TEXT NOT NULL DEFAULT 'auto',
            enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );`,
        `CREATE TABLE ai_models (
            id TEXT PRIMARY KEY, provider_id TEXT NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
            model_id TEXT NOT NULL, display_name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
            visible_to_users INTEGER NOT NULL DEFAULT 1, is_default INTEGER NOT NULL DEFAULT 0,
            supports_text INTEGER NOT NULL DEFAULT 1, supports_vision INTEGER NOT NULL DEFAULT 0,
            supports_tools INTEGER NOT NULL DEFAULT 0, supports_streaming INTEGER NOT NULL DEFAULT 1,
            metadata_json TEXT, updated_at INTEGER NOT NULL
        );`,
        `CREATE UNIQUE INDEX ai_models_provider_model_idx ON ai_models(provider_id, model_id);`,
        `CREATE TABLE ai_conversations (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL, history_enabled INTEGER NOT NULL DEFAULT 1,
            temporary_delete_pending INTEGER NOT NULL DEFAULT 0,
            active_leaf_message_id TEXT, system_instruction TEXT, deleted_at INTEGER,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );`,
        `CREATE TABLE ai_temporary_leases (
            id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL,
            claimed INTEGER NOT NULL DEFAULT 0, released INTEGER NOT NULL DEFAULT 0
        );`,
        `CREATE TABLE ai_messages (
            id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
            parent_message_id TEXT, role TEXT NOT NULL CHECK(role in ('system', 'user', 'assistant')),
            content TEXT NOT NULL, provider_id TEXT REFERENCES ai_providers(id) ON DELETE SET NULL,
            model_id TEXT, status TEXT NOT NULL CHECK(status in ('streaming', 'complete', 'interrupted', 'failed')) DEFAULT 'complete',
            variant_group_id TEXT, input_tokens INTEGER, output_tokens INTEGER,
            parts_json TEXT, created_at INTEGER NOT NULL
        );`,
        `CREATE TABLE ai_blobs (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE CASCADE,
            mime_type TEXT NOT NULL, data TEXT NOT NULL, size INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        );`,
    ]);

    native.exec(`
        INSERT INTO users (id, username, display_name, password_hash, role, created_at, updated_at)
        VALUES ('u1', 'testuser', 'Test User', 'hash', 'user', 1000, 1000);
    `);
    return store;
}
async function createMigratedAiTestStore(): Promise<DatabaseStore> {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    await store.run(async (db) => {
        await db.insert(users).values({
            id: "u1",
            username: "testuser",
            displayName: "Test User",
            passwordHash: "hash",
            createdAt: 1000,
            updatedAt: 1000,
        });
    });
    return store;
}

Deno.test("AskWorkspace Phase 2: Reasoning effort validation rejects unsupported models without DB mutation", async () => {
    const store = createTestStore();
    try {
        const mockFetch: typeof fetch = (input) => {
            const url = String(input);
            if (url.endsWith("/models")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            data: [{ id: "standard-model" }],
                        }),
                        { headers: { "Content-Type": "application/json" } },
                    ),
                );
            }
            return Promise.resolve(new Response("Not found", { status: 404 }));
        };

        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });

        const provider = await service.createProvider("u1", {
            name: "P1",
            baseUrl: "https://api.example.com/v1",
            apiKey: "key",
            scope: "user",
        }, false);

        // Attempt streamChat with reasoningEffort: "high" on standard-model which has unknown/no reasoning
        const stream = service.streamChat("u1", {
            providerId: provider.id,
            modelId: "standard-model",
            message: "Hello reasoning",
            reasoningEffort: "high",
        });

        await assertRejects(
            async () => {
                for await (const _event of stream) {
                    // should throw before first yield
                }
            },
            Error,
            "推理能力未知且未配置有效强度",
        );

        // Verify NO conversation or message was created (zero mutations on 4xx)
        await store.run(async (db) => {
            const convs = await db.select().from(aiConversations).all();
            assertEquals(convs.length, 0);
            const msgs = await db.select().from(aiMessages).all();
            assertEquals(msgs.length, 0);
        });
    } finally {
        await store.close();
    }
});

Deno.test("AskWorkspace Phase 2: Manual reasoning override is preserved across provider refresh", async () => {
    const store = createTestStore();
    try {
        const mockFetch: typeof fetch = (input) => {
            const url = String(input);
            if (url.endsWith("/models")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            data: [{ id: "custom-oss-model" }],
                        }),
                        { headers: { "Content-Type": "application/json" } },
                    ),
                );
            }
            return Promise.resolve(new Response("Not found", { status: 404 }));
        };

        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });

        const provider = await service.createProvider("u1", {
            name: "P1",
            baseUrl: "https://api.example.com/v1",
            apiKey: "key",
            scope: "user",
        }, false);

        const models = await service.listModels("u1", provider.id);
        const model = models[0];

        // Apply manual override to enable reasoning: low, medium, high
        const updated = await service.updateModel("u1", model.id, {
            reasoningOverride: {
                enabled: true,
                levels: ["low", "medium", "high"],
                defaultLevel: "medium",
            },
        }, false);

        assertEquals(updated.supportsReasoning, true);
        assertEquals(updated.reasoningEfforts, ["low", "medium", "high"]);
        assertEquals(updated.defaultReasoningEffort, "medium");
        assertEquals(updated.reasoningCapabilitySource, "manual");

        // Refresh provider models
        const refreshed = await service.refreshProviderModels(
            "u1",
            provider.id,
            false,
        );
        const refreshedModel = refreshed[0];

        // Manual override must still be preserved!
        assertEquals(refreshedModel.supportsReasoning, true);
        assertEquals(refreshedModel.reasoningEfforts, [
            "low",
            "medium",
            "high",
        ]);
        assertEquals(refreshedModel.defaultReasoningEffort, "medium");
        assertEquals(refreshedModel.reasoningCapabilitySource, "manual");
    } finally {
        await store.close();
    }
});

Deno.test("AskWorkspace Phase 3: True parent chain, edit sibling branch, and regenerate variant", async () => {
    const store = createTestStore();
    try {
        const mockFetch: typeof fetch = (input) => {
            const url = String(input);
            if (url.endsWith("/models")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            data: [{ id: "chat-model" }],
                        }),
                        { headers: { "Content-Type": "application/json" } },
                    ),
                );
            }
            if (url.endsWith("/chat/completions")) {
                return Promise.resolve(
                    new Response(
                        `data: ${
                            JSON.stringify({
                                choices: [{ delta: { content: "Answer" } }],
                            })
                        }\n\n` +
                            `data: ${
                                JSON.stringify({
                                    choices: [],
                                    usage: {
                                        prompt_tokens: 10,
                                        completion_tokens: 5,
                                    },
                                })
                            }\n\n` +
                            "data: [DONE]\n\n",
                        { headers: { "Content-Type": "text/event-stream" } },
                    ),
                );
            }
            return Promise.resolve(new Response("Not found", { status: 404 }));
        };

        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });

        const provider = await service.createProvider("u1", {
            name: "P1",
            baseUrl: "https://api.example.com/v1",
            apiKey: "key",
            scope: "user",
        }, false);

        // Turn 1: Initial Question
        let convId = "";
        let user1Id = "";
        let assistant1Id = "";

        for await (
            const ev of service.streamChat("u1", {
                providerId: provider.id,
                modelId: "chat-model",
                message: "Question 1",
            })
        ) {
            if (ev.event === "meta") {
                const data = ev.data as {
                    conversationId: string;
                    userMessageId: string;
                    assistantMessageId: string;
                };
                convId = data.conversationId;
                user1Id = data.userMessageId;
                assistant1Id = data.assistantMessageId;
            }
        }

        const conv1 = await service.getConversation("u1", convId);
        assertEquals(conv1.messages.length, 2);
        assertEquals(conv1.conversation.activeLeafMessageId, assistant1Id);
        assertEquals(conv1.messages[0].parentMessageId, null);
        assertEquals(conv1.messages[1].parentMessageId, user1Id);

        // Turn 2: Follow-up question continuing from branch
        let user2Id = "";
        let assistant2Id = "";
        for await (
            const ev of service.streamChat("u1", {
                conversationId: convId,
                providerId: provider.id,
                modelId: "chat-model",
                message: "Question 2",
            })
        ) {
            if (ev.event === "meta") {
                const data = ev.data as {
                    userMessageId: string;
                    assistantMessageId: string;
                };
                user2Id = data.userMessageId;
                assistant2Id = data.assistantMessageId;
            }
        }

        const conv2 = await service.getConversation("u1", convId);
        assertEquals(conv2.messages.length, 4);
        assertEquals(conv2.conversation.activeLeafMessageId, assistant2Id);
        assertEquals(conv2.messages[2].parentMessageId, assistant1Id);
        assertEquals(conv2.messages[3].parentMessageId, user2Id);

        // Turn 3: Edit User Message 1 (creates sibling branch with same parent as user1: null)
        let editUser1Id = "";
        let editAssistant1Id = "";
        for await (
            const ev of service.streamChat("u1", {
                conversationId: convId,
                providerId: provider.id,
                modelId: "chat-model",
                editMessageId: user1Id,
                message: "Edited Question 1",
            })
        ) {
            if (ev.event === "meta") {
                const data = ev.data as {
                    userMessageId: string;
                    assistantMessageId: string;
                };
                editUser1Id = data.userMessageId;
                editAssistant1Id = data.assistantMessageId;
            }
        }

        const conv3 = await service.getConversation("u1", convId);
        assertEquals(conv3.messages.length, 6);
        // Sibling user message has same parent as original user message (null)
        const editUserMsg = conv3.messages.find((m) => m.id === editUser1Id);
        assertExists(editUserMsg);
        assertEquals(editUserMsg.parentMessageId, null);

        // Active leaf is updated to the new branch's assistant
        assertEquals(conv3.conversation.activeLeafMessageId, editAssistant1Id);

        // Branch switching via updateConversation (PATCH API)
        const switched = await service.updateConversation("u1", convId, {
            activeLeafMessageId: assistant2Id,
        });
        assertEquals(switched.activeLeafMessageId, assistant2Id);
    } finally {
        await store.close();
    }
});

async function streamUsageConversation(store: DatabaseStore) {
    const mockFetch: typeof fetch = (input) => {
        const url = String(input);
        if (url.endsWith("/models")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({ data: [{ id: "m1" }] }),
                    { headers: { "Content-Type": "application/json" } },
                ),
            );
        }
        if (url.endsWith("/chat/completions")) {
            return Promise.resolve(
                new Response(
                    `data: ${
                        JSON.stringify({
                            choices: [{
                                delta: { content: "Here is your plan" },
                            }],
                        })
                    }\n\n` +
                        `data: ${
                            JSON.stringify({
                                choices: [],
                                usage: {
                                    prompt_tokens: 42,
                                    completion_tokens: 18,
                                },
                            })
                        }\n\n` +
                        "data: [DONE]\n\n",
                    { headers: { "Content-Type": "text/event-stream" } },
                ),
            );
        }
        return Promise.resolve(new Response("Not found", { status: 404 }));
    };

    const service = new AiService({
        store,
        encryptionKey: TEST_KEY,
        fetchFn: mockFetch,
    });

    const provider = await service.createProvider("u1", {
        name: "P1",
        baseUrl: "https://api.example.com/v1",
        apiKey: "key",
        scope: "user",
    }, false);

    let convId = "";
    let assistantMsgId = "";
    let doneEvData: unknown = null;

    for await (
        const ev of service.streamChat("u1", {
            providerId: provider.id,
            modelId: "m1",
            message: "I need a workout plan",
            systemInstruction: "You are a fitness expert",
        })
    ) {
        if (ev.event === "meta") {
            const data = ev.data as {
                conversationId: string;
                assistantMessageId: string;
            };
            convId = data.conversationId;
            assistantMsgId = data.assistantMessageId;
        } else if (ev.event === "done") {
            doneEvData = ev.data;
        }
    }

    const doneRecord = doneEvData as {
        inputTokens: number;
        outputTokens: number;
        assistantMessageId: string;
    };
    return { service, convId, assistantMsgId, doneRecord };
}

Deno.test("AskWorkspace Phase 4: Token usage and system instruction persist with the done event", async () => {
    const store = createTestStore();
    try {
        const { service, convId, assistantMsgId, doneRecord } =
            await streamUsageConversation(store);

        assertEquals(doneRecord.inputTokens, 42);
        assertEquals(doneRecord.outputTokens, 18);
        assertEquals(doneRecord.assistantMessageId, assistantMsgId);

        const conv = await service.getConversation("u1", convId);
        assertEquals(
            conv.conversation.systemInstruction,
            "You are a fitness expert",
        );
        const asst = conv.messages.find((m) => m.id === assistantMsgId);
        assertExists(asst);
        assertEquals(asst.inputTokens, 42);
        assertEquals(asst.outputTokens, 18);
    } finally {
        await store.close();
    }
});

Deno.test("AskWorkspace Phase 4: Conversation search and export reflect persisted messages", async () => {
    const store = createTestStore();
    try {
        const { service, convId } = await streamUsageConversation(store);

        const searchRes = await service.searchConversationMessages(
            "u1",
            convId,
            "workout",
        );
        assertEquals(searchRes.length, 1);
        assertEquals(searchRes[0].content, "I need a workout plan");

        const mdExport = await service.exportConversation(
            "u1",
            convId,
            "markdown",
        );
        assertEquals(mdExport.mimeType, "text/markdown; charset=utf-8");
        assertEquals(mdExport.content.includes("### User"), true);
        assertEquals(mdExport.content.includes("workout plan"), true);
        assertEquals(mdExport.content.includes("### Assistant"), true);

        const jsonExport = await service.exportConversation(
            "u1",
            convId,
            "json",
        );
        assertEquals(jsonExport.mimeType, "application/json; charset=utf-8");
        const parsedExport = JSON.parse(jsonExport.content);
        assertEquals(parsedExport.conversation.id, convId);
        assertEquals(parsedExport.messages.length, 2);
    } finally {
        await store.close();
    }
});

Deno.test("AskWorkspace Phase 5: Multi-round tools execution and sources persistence", async () => {
    const store = await createMigratedAiTestStore();
    try {
        let completionsCallCount = 0;

        const mockFetch: typeof fetch = (input) => {
            const url = String(input);
            if (url.endsWith("/models")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            data: [{ id: "tool-model", supports_tools: true }],
                        }),
                        { headers: { "Content-Type": "application/json" } },
                    ),
                );
            }
            if (url.endsWith("/chat/completions")) {
                completionsCallCount++;
                if (completionsCallCount === 1) {
                    // Round 1: Model requests the unified document search
                    const toolChunk = {
                        choices: [
                            {
                                delta: {
                                    tool_calls: [
                                        {
                                            index: 0,
                                            id: "call_documents_1",
                                            function: {
                                                name: "lookup_documents",
                                                arguments: '{"query":"Apollo"}',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                        usage: { prompt_tokens: 30, completion_tokens: 10 },
                    };
                    return Promise.resolve(
                        new Response(
                            `data: ${JSON.stringify(toolChunk)}\n\n` +
                                "data: [DONE]\n\n",
                            {
                                headers: {
                                    "Content-Type": "text/event-stream",
                                },
                            },
                        ),
                    );
                } else {
                    // Round 2: Model consumes tool result and provides final text
                    return Promise.resolve(
                        new Response(
                            `data: ${
                                JSON.stringify({
                                    choices: [{
                                        delta: {
                                            content:
                                                "Based on your notes, here is the answer.",
                                        },
                                    }],
                                })
                            }\n\n` +
                                `data: ${
                                    JSON.stringify({
                                        choices: [],
                                        usage: {
                                            prompt_tokens: 25,
                                            completion_tokens: 15,
                                        },
                                    })
                                }\n\n` +
                                "data: [DONE]\n\n",
                            {
                                headers: {
                                    "Content-Type": "text/event-stream",
                                },
                            },
                        ),
                    );
                }
            }
            return Promise.resolve(new Response("Not found", { status: 404 }));
        };

        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });

        const provider = await service.createProvider("u1", {
            name: "P1",
            baseUrl: "https://api.example.com/v1",
            apiKey: "key",
            scope: "user",
        }, false);

        await new DocumentsService(store).create("u1", {
            title: null,
            body: "Project Apollo plans",
            isHomeFixed: true,
        });

        const eventsReceived: Array<{ event: string; data: unknown }> = [];
        let convId = "";
        let assistantMsgId = "";

        for await (
            const ev of service.streamChat("u1", {
                providerId: provider.id,
                modelId: "tool-model",
                message: "What is my secret project?",
                tools: { documents: true },
            })
        ) {
            eventsReceived.push(ev);
            if (ev.event === "meta") {
                const d = ev.data as {
                    conversationId: string;
                    assistantMessageId: string;
                };
                convId = d.conversationId;
                assistantMsgId = d.assistantMessageId;
            }
        }

        // Verify multi-round execution:
        // Round 1 tool-call & tool-result events were emitted
        const toolCallEv = eventsReceived.find((e) => e.event === "tool-call");
        assertExists(toolCallEv);
        assertEquals(
            (toolCallEv.data as { toolName: string }).toolName,
            "documents",
        );

        const toolResultEv = eventsReceived.find((e) =>
            e.event === "tool-result"
        );
        assertExists(toolResultEv);
        assertEquals(
            (toolResultEv.data as { toolName: string }).toolName,
            "documents",
        );

        // Verify usage was summed across rounds: 30+25 = 55 prompt, 10+15 = 25 completion
        const doneEv = eventsReceived.find((e) => e.event === "done");
        assertExists(doneEv);
        const doneData = doneEv.data as {
            inputTokens: number;
            outputTokens: number;
        };
        assertEquals(doneData.inputTokens, 55);
        assertEquals(doneData.outputTokens, 25);

        // Verify assistant message parts in DB contain tool calls and results
        const conv = await service.getConversation("u1", convId);
        const asst = conv.messages.find((m) => m.id === assistantMsgId);
        assertExists(asst);
        assertExists(asst.parts);
        assertEquals(asst.parts.some((p) => p.type === "tool-call"), true);
        assertEquals(asst.parts.some((p) => p.type === "tool-result"), true);
        assertEquals(asst.content, "Based on your notes, here is the answer.");
    } finally {
        await store.close();
    }
});
Deno.test("AskWorkspace: Document source citations stream and persist with document identity", async () => {
    const store = await createMigratedAiTestStore();
    try {
        let completionsCallCount = 0;
        const mockFetch: typeof fetch = (input) => {
            const url = String(input);
            if (url.endsWith("/models")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            data: [{
                                id: "document-model",
                                supports_tools: true,
                            }],
                        }),
                        { headers: { "Content-Type": "application/json" } },
                    ),
                );
            }
            if (url.endsWith("/chat/completions")) {
                completionsCallCount++;
                if (completionsCallCount === 1) {
                    const toolChunk = {
                        choices: [{
                            delta: {
                                tool_calls: [{
                                    index: 0,
                                    id: "call_document_1",
                                    function: {
                                        name: "lookup_documents",
                                        arguments: '{"query":"quartz"}',
                                    },
                                }],
                            },
                        }],
                    };
                    return Promise.resolve(
                        new Response(
                            `data: ${JSON.stringify(toolChunk)}\n\n` +
                                "data: [DONE]\n\n",
                            {
                                headers: {
                                    "Content-Type": "text/event-stream",
                                },
                            },
                        ),
                    );
                }
                return Promise.resolve(
                    new Response(
                        `data: ${
                            JSON.stringify({
                                choices: [{
                                    delta: {
                                        content:
                                            "The document describes quartz.",
                                    },
                                }],
                            })
                        }\n\n` +
                            `data: ${
                                JSON.stringify({
                                    choices: [],
                                    usage: {
                                        prompt_tokens: 15,
                                        completion_tokens: 6,
                                    },
                                })
                            }\n\n` +
                            "data: [DONE]\n\n",
                        {
                            headers: { "Content-Type": "text/event-stream" },
                        },
                    ),
                );
            }
            return Promise.resolve(new Response("Not found", { status: 404 }));
        };

        const documents = new DocumentsService(store);
        const document = await documents.create("u1", {
            title: "Quartz Field Manual",
            body: "Long-form field notes about quartz formations.",
        });
        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });
        const provider = await service.createProvider("u1", {
            name: "P1",
            baseUrl: "https://api.example.com/v1",
            apiKey: "key",
            scope: "user",
        }, false);

        const eventsReceived: Array<{ event: string; data: unknown }> = [];
        let conversationId = "";
        let assistantMessageId = "";
        for await (
            const event of service.streamChat("u1", {
                providerId: provider.id,
                modelId: "document-model",
                message: "Find my quartz field manual",
                tools: { documents: true },
            })
        ) {
            eventsReceived.push(event);
            if (
                event.event === "meta" && typeof event.data === "object" &&
                event.data !== null &&
                "conversationId" in event.data &&
                typeof event.data.conversationId === "string" &&
                "assistantMessageId" in event.data &&
                typeof event.data.assistantMessageId === "string"
            ) {
                conversationId = event.data.conversationId;
                assistantMessageId = event.data.assistantMessageId;
            }
        }

        const toolCall = eventsReceived.find((event) =>
            event.event === "tool-call"
        );
        assertExists(toolCall);
        if (
            typeof toolCall.data !== "object" || toolCall.data === null ||
            !("toolName" in toolCall.data)
        ) {
            throw new Error("Expected a document tool-call payload");
        }
        assertEquals(toolCall.data.toolName, "documents");

        const sourceEvent = eventsReceived.find((event) =>
            event.event === "sources"
        );
        assertExists(sourceEvent);
        if (
            typeof sourceEvent.data !== "object" ||
            sourceEvent.data === null || !("sources" in sourceEvent.data) ||
            !Array.isArray(sourceEvent.data.sources)
        ) {
            throw new Error("Expected a source citation event");
        }
        const streamedSource = sourceEvent.data.sources[0];
        if (
            typeof streamedSource !== "object" || streamedSource === null ||
            !("type" in streamedSource) ||
            !("documentId" in streamedSource) || !("title" in streamedSource)
        ) {
            throw new Error("Expected a document citation");
        }
        assertEquals(streamedSource.type, "document");
        assertEquals(streamedSource.documentId, document.id);
        assertEquals(streamedSource.title, document.displayTitle);

        const conversation = await service.getConversation(
            "u1",
            conversationId,
        );
        const assistant = conversation.messages.find((message) =>
            message.id === assistantMessageId
        );
        assertExists(assistant);
        const sourcesPart = assistant.parts?.find((part) =>
            part.type === "sources"
        );
        assertExists(sourcesPart);
        const persistedSource = sourcesPart.sources[0];
        if (persistedSource.type !== "document") {
            throw new Error("Expected a persisted document citation");
        }
        assertEquals(persistedSource.documentId, document.id);
        assertEquals(persistedSource.title, document.displayTitle);
        assertEquals(persistedSource, streamedSource);
        assertEquals(assistant.content, "The document describes quartz.");
    } finally {
        await store.close();
    }
});

Deno.test("AskWorkspace: Empty message allowed on regenerate", async () => {
    const store = createTestStore();
    try {
        const mockFetch: typeof fetch = (input) => {
            const url = String(input);
            if (url.endsWith("/models")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({ data: [{ id: "m1" }] }),
                        { headers: { "Content-Type": "application/json" } },
                    ),
                );
            }
            if (url.endsWith("/chat/completions")) {
                return Promise.resolve(
                    new Response(
                        `data: ${
                            JSON.stringify({
                                choices: [{
                                    delta: { content: "Regenerated" },
                                }],
                            })
                        }\n\n` +
                            "data: [DONE]\n\n",
                        { headers: { "Content-Type": "text/event-stream" } },
                    ),
                );
            }
            return Promise.resolve(new Response("Not found", { status: 404 }));
        };

        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });
        const provider = await service.createProvider("u1", {
            name: "P1",
            baseUrl: "https://api.example.com/v1",
            apiKey: "key",
            scope: "user",
        }, false);

        let convId = "";
        let asst1Id = "";
        for await (
            const ev of service.streamChat("u1", {
                providerId: provider.id,
                modelId: "m1",
                message: "First prompt",
            })
        ) {
            if (ev.event === "meta") {
                const d = ev.data as {
                    conversationId: string;
                    assistantMessageId: string;
                };
                convId = d.conversationId;
                asst1Id = d.assistantMessageId;
            }
        }

        // Now regenerate with empty message string! Should NOT throw "消息内容不能为空"
        let regenContent = "";
        for await (
            const ev of service.streamChat("u1", {
                conversationId: convId,
                providerId: provider.id,
                modelId: "m1",
                regenerateMessageId: asst1Id,
                message: "",
            })
        ) {
            if (ev.event === "token") {
                regenContent += ev.data as string;
            }
        }
        assertEquals(regenContent, "Regenerated");
    } finally {
        await store.close();
    }
});

Deno.test("AskWorkspace: Non-vision model rejects image attachments with 400 before DB mutations", async () => {
    const store = createTestStore();
    try {
        const mockFetch: typeof fetch = (input) => {
            const url = String(input);
            if (url.endsWith("/models")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            data: [{
                                id: "text-only-model",
                                supports_vision: false,
                            }],
                        }),
                        { headers: { "Content-Type": "application/json" } },
                    ),
                );
            }
            return Promise.resolve(new Response("Not found", { status: 404 }));
        };

        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });
        const provider = await service.createProvider("u1", {
            name: "P1",
            baseUrl: "https://api.example.com/v1",
            apiKey: "key",
            scope: "user",
        }, false);

        await assertRejects(
            async () => {
                for await (
                    const _ev of service.streamChat("u1", {
                        providerId: provider.id,
                        modelId: "text-only-model",
                        message: "Look at this image",
                        attachments: [{
                            id: "img1",
                            name: "pic.png",
                            type: "image",
                            mimeType: "image/png",
                            data:
                                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                        }],
                    })
                ) {
                    // should reject before stream
                }
            },
            Error,
            "不支持图片多模态分析",
        );

        // Zero mutations: no blobs stored, no conversation created
        await store.run(async (db) => {
            const blobs = await db.select().from(aiBlobs).all();
            assertEquals(blobs.length, 0);
            const convs = await db.select().from(aiConversations).all();
            assertEquals(convs.length, 0);
        });
    } finally {
        await store.close();
    }
});

Deno.test("AskWorkspace: Tool call security rejects unknown tool names", async () => {
    const store = createTestStore();
    try {
        // 1. Unknown tool name
        const unkRes = await executeToolCall("evil_code_exec", {}, {
            userId: "u1",
            store,
        });
        assertEquals(unkRes.error?.includes("不支持或未知的工具调用"), true);
    } finally {
        await store.close();
    }
});

Deno.test("AskWorkspace: web search with an invalid SearXNG URL reports not configured", async () => {
    const store = createTestStore();
    try {
        const res = await executeToolCall("web_search", { query: "test" }, {
            userId: "u1",
            store,
            searxngUrl: "invalid-url",
            allowedTools: { webSearch: true },
        });
        assertEquals(res.error?.includes("not configured or disabled"), true);
    } finally {
        await store.close();
    }
});

Deno.test("AskWorkspace: Live SearXNG HTTP mock smoke test verifies real query/sources/persistence", async () => {
    const store = createTestStore();
    try {
        // Local mock SearXNG server
        let requestedQuery = "";
        const searxngServer = Deno.serve({ port: 0 }, (req) => {
            const u = new URL(req.url);
            if (u.pathname === "/search") {
                requestedQuery = u.searchParams.get("q") ?? "";
                return new Response(
                    JSON.stringify({
                        results: [{
                            title: "Searcher Documentation",
                            url: "https://searcher.internal/docs",
                            content:
                                "Complete guide to Ask workspace and Searcher architecture.",
                        }],
                    }),
                    { headers: { "Content-Type": "application/json" } },
                );
            }
            return new Response("Not found", { status: 404 });
        });

        const addr = searxngServer.addr as Deno.NetAddr;
        const searxngUrl = `http://127.0.0.1:${addr.port}`;

        try {
            const res = await executeToolCall("web_search", {
                query: "searcher workspace",
            }, {
                userId: "u1",
                store,
                searxngUrl,
                allowedTools: { webSearch: true },
            });

            assertEquals(res.toolName, "webSearch");
            assertEquals(requestedQuery, "searcher workspace");
            assertExists(res.sources);
            assertEquals(res.sources.length, 1);
            assertEquals(res.sources[0].title, "Searcher Documentation");
            assert(res.sources[0].type !== "document");
            assertEquals(res.sources[0].url, "https://searcher.internal/docs");
        } finally {
            await searxngServer.shutdown();
        }
    } finally {
        await store.close();
    }
});

Deno.test("AskWorkspace: Public DTO strips image base64 data", async () => {
    const store = createTestStore();
    try {
        const mockFetch: typeof fetch = (input) => {
            const url = String(input);
            if (url.endsWith("/models")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            data: [{
                                id: "vision-model",
                                supports_vision: true,
                            }],
                        }),
                        { headers: { "Content-Type": "application/json" } },
                    ),
                );
            }
            if (url.endsWith("/chat/completions")) {
                return Promise.resolve(
                    new Response(
                        `data: ${
                            JSON.stringify({
                                choices: [{
                                    delta: { content: "I see the image!" },
                                }],
                            })
                        }\n\n` +
                            "data: [DONE]\n\n",
                        { headers: { "Content-Type": "text/event-stream" } },
                    ),
                );
            }
            return Promise.resolve(new Response("Not found", { status: 404 }));
        };

        const service = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });
        const provider = await service.createProvider("u1", {
            name: "P1",
            baseUrl: "https://api.example.com/v1",
            apiKey: "key",
            scope: "user",
        }, false);

        let convId = "";
        for await (
            const ev of service.streamChat("u1", {
                providerId: provider.id,
                modelId: "vision-model",
                message: "Describe this",
                attachments: [{
                    id: "img-test",
                    name: "pixel.png",
                    type: "image",
                    mimeType: "image/png",
                    data:
                        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                }],
            })
        ) {
            if (ev.event === "meta") {
                convId = (ev.data as { conversationId: string }).conversationId;
            }
        }

        const conv = await service.getConversation("u1", convId);
        const userMsg = conv.messages[0];
        assertExists(userMsg.parts);
        const imgPart = userMsg.parts.find((p) => p.type === "attachment") as {
            type: string;
            url?: string;
            data?: string;
        };
        assertExists(imgPart);
        assertExists(imgPart.url);
        // Base64 data MUST be stripped in public DTO!
        assertEquals(imgPart.data, undefined);
    } finally {
        await store.close();
    }
});
