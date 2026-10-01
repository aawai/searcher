import { assertEquals } from "@std/assert";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import { createApp } from "../../app.ts";
import type { Envelope, PreferencesDto } from "@shared/contracts.ts";
import { AiService } from "../ai/service.ts";

const origin = "http://localhost:8000";
const TEST_KEY = "test-encryption-key-32-bytes-ok!";

Deno.test("Preferences: persisted user generation defaults full lifecycle, precedence and validation", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });

        const register = async (username: string) => {
            const response = await app.request("/api/auth/register", {
                method: "POST",
                headers: { origin, "content-type": "application/json" },
                body: JSON.stringify({
                    username,
                    displayName: username,
                    password: "Password123456!",
                }),
            });
            assertEquals(response.status, 200);
            const cookie = response.headers.get("set-cookie")?.split(";")[0];
            if (!cookie?.startsWith(SESSION_COOKIE_NAME + "=")) {
                throw new Error("Missing session cookie");
            }
            return cookie;
        };

        const cookie = await register("gen_defaults_user");

        // 1. Initial GET /api/preferences includes default empty aiGenerationDefaults
        const getInitial = await app.request("/api/preferences", {
            method: "GET",
            headers: { origin, cookie },
        });
        assertEquals(getInitial.status, 200);
        const initialBody = await getInitial.json() as Envelope<PreferencesDto>;
        assertEquals(initialBody.data?.aiGenerationDefaults, { models: {} });

        // 2. PATCH per-model defaults (e.g. gpt-4o)
        const patchGpt4o = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                aiGenerationDefaults: {
                    models: {
                        "gpt-4o": {
                            temperature: 0.7,
                            topP: 0.9,
                            maxTokens: 2048,
                        },
                    },
                },
            }),
        });
        assertEquals(patchGpt4o.status, 200);
        const gpt4oBody = await patchGpt4o.json() as Envelope<PreferencesDto>;
        assertEquals(gpt4oBody.data?.aiGenerationDefaults?.models?.["gpt-4o"], {
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 2048,
        });

        // 3. Partial update: add o1 defaults without clobbering gpt-4o
        const patchO1 = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                aiGenerationDefaults: {
                    models: {
                        "o1": {
                            reasoningEffort: "high",
                            maxTokens: 4096,
                        },
                    },
                    default: {
                        temperature: 0.5,
                        topP: 0.8,
                    },
                },
            }),
        });
        assertEquals(patchO1.status, 200);
        const o1Body = await patchO1.json() as Envelope<PreferencesDto>;
        assertEquals(o1Body.data?.aiGenerationDefaults?.models?.["gpt-4o"], {
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 2048,
        });
        assertEquals(o1Body.data?.aiGenerationDefaults?.models?.["o1"], {
            reasoningEffort: "high",
            maxTokens: 4096,
        });
        assertEquals(o1Body.data?.aiGenerationDefaults?.default, {
            temperature: 0.5,
            topP: 0.8,
        });

        // 4. Resetting a single model default by sending null
        const resetGpt4o = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                aiGenerationDefaults: {
                    models: {
                        "gpt-4o": null,
                    },
                },
            }),
        });
        assertEquals(resetGpt4o.status, 200);
        const resetGpt4oBody = await resetGpt4o.json() as Envelope<
            PreferencesDto
        >;
        assertEquals(
            resetGpt4oBody.data?.aiGenerationDefaults?.models?.["gpt-4o"],
            undefined,
        );
        assertEquals(
            resetGpt4oBody.data?.aiGenerationDefaults?.models?.["o1"],
            {
                reasoningEffort: "high",
                maxTokens: 4096,
            },
        );
        assertEquals(resetGpt4oBody.data?.aiGenerationDefaults?.default, {
            temperature: 0.5,
            topP: 0.8,
        });

        // 5. Resetting global default by sending null
        const resetGlobal = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                aiGenerationDefaults: {
                    default: null,
                },
            }),
        });
        assertEquals(resetGlobal.status, 200);
        const resetGlobalBody = await resetGlobal.json() as Envelope<
            PreferencesDto
        >;
        assertEquals(
            resetGlobalBody.data?.aiGenerationDefaults?.default,
            undefined,
        );
        assertEquals(
            resetGlobalBody.data?.aiGenerationDefaults?.models?.["o1"],
            {
                reasoningEffort: "high",
                maxTokens: 4096,
            },
        );

        // 6. Validation: Reject invalid temperature (> 2 or < 0)
        const invalidTemp = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                aiGenerationDefaults: {
                    models: { "gpt-4o": { temperature: 2.5 } },
                },
            }),
        });
        assertEquals(invalidTemp.status, 400);

        // 7. Validation: Reject invalid topP (> 1 or < 0)
        const invalidTopP = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                aiGenerationDefaults: {
                    models: { "gpt-4o": { topP: -0.1 } },
                },
            }),
        });
        assertEquals(invalidTopP.status, 400);

        // 8. Validation: Reject invalid reasoningEffort
        const invalidEffort = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                aiGenerationDefaults: {
                    models: { "o1": { reasoningEffort: "super-extreme" } },
                },
            }),
        });
        assertEquals(invalidEffort.status, 400);

        // 9. Validation: Reject invalid maxTokens (<= 0 or non-integer)
        const invalidTokens = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                aiGenerationDefaults: {
                    models: { "o1": { maxTokens: 0 } },
                },
            }),
        });
        assertEquals(invalidTokens.status, 400);
    } finally {
        await store.close();
    }
});

Deno.test("Preferences: user generation defaults applied in chatStream when request params omitted", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        let capturedGenerationParams: Record<string, unknown> = {};

        const mockFetch: typeof fetch = (input, init) => {
            const url = String(input);
            if (url.endsWith("/models")) {
                return Promise.resolve(Response.json({
                    data: [
                        { id: "gpt-4o", supports_vision: true },
                        {
                            id: "o1",
                            reasoning_efforts: ["low", "medium", "high"],
                        },
                    ],
                }));
            }
            if (url.endsWith("/chat/completions")) {
                const bodyText = typeof init?.body === "string"
                    ? init.body
                    : "{}";
                capturedGenerationParams = JSON.parse(bodyText);
                return Promise.resolve(
                    new Response(
                        "data: " + JSON.stringify({
                            id: "chatcmpl-test",
                            object: "chat.completion.chunk",
                            created: 123456,
                            model: "gpt-4o",
                            choices: [{
                                delta: { content: "Hello from mock LLM!" },
                                index: 0,
                            }],
                        }) + "\n\ndata: [DONE]\n\n",
                        {
                            headers: { "content-type": "text/event-stream" },
                        },
                    ),
                );
            }
            return Promise.resolve(new Response("Not found", { status: 404 }));
        };

        const auth = new AuthService({ store, origin });
        const aiService = new AiService({
            store,
            encryptionKey: TEST_KEY,
            fetchFn: mockFetch,
        });
        const app = createApp({ store, auth, origin });

        // Register user
        const regRes = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username: "stream_defaults_user",
                displayName: "Stream User",
                password: "Password123456!",
            }),
        });
        assertEquals(regRes.status, 200);
        const cookie = regRes.headers.get("set-cookie")?.split(";")[0]!;

        // Create provider and models
        const { user } =
            (await regRes.json() as { data: { user: { id: string } } }).data;
        const provider = await aiService.createProvider(user.id, {
            name: "Test Provider",
            baseUrl: "https://api.openai.com/v1",
            apiKey: "sk-test-secret-key",
            scope: "user",
        }, false);
        const models = await aiService.listModels(user.id, provider.id, false);
        const gpt4o = models.find((m) => m.modelId === "gpt-4o")!;
        const o1 = models.find((m) => m.modelId === "o1")!;

        // Verify public AiModelDto properties
        assertEquals(gpt4o.isReasoningStrict, false);
        assertEquals(o1.isReasoningStrict, true);
        assertEquals(o1.supportsReasoning, true);
        assertEquals(o1.reasoningEfforts, ["low", "medium", "high"]);

        // Set user defaults in preferences
        await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                aiGenerationDefaults: {
                    default: {
                        temperature: 0.85,
                        topP: 0.95,
                    },
                    models: {
                        "gpt-4o": {
                            temperature: 0.42,
                            maxTokens: 1800,
                        },
                        "o1": {
                            reasoningEffort: "high",
                            maxTokens: 3500,
                        },
                    },
                },
            }),
        });

        const consumeStream = async (
            gen: AsyncGenerator<{ event: string; data: unknown }>,
        ) => {
            const events = [];
            for await (const chunk of gen) {
                events.push(chunk);
            }
            return events;
        };

        // Stream chat with gpt-4o without explicit params: should use per-model defaults
        const streamGen1 = aiService.streamChat(user.id, {
            modelId: "gpt-4o",
            message: "Hello gpt-4o",
        });
        const events1 = await consumeStream(streamGen1);
        assertEquals(
            events1.some((e) =>
                e.event === "token" && e.data === "Hello from mock LLM!"
            ),
            true,
        );
        assertEquals(capturedGenerationParams.temperature, 0.42); // from models['gpt-4o']
        assertEquals(capturedGenerationParams.top_p, 0.95); // from default.topP
        assertEquals(capturedGenerationParams.max_tokens, 1800); // from models['gpt-4o']

        // Stream chat with explicit temperature overriding defaults
        const streamGen2 = aiService.streamChat(user.id, {
            modelId: "gpt-4o",
            message: "Hello again",
            temperature: 0.1,
        });
        await consumeStream(streamGen2);
        assertEquals(capturedGenerationParams.temperature, 0.1); // explicit request param overrides user default!

        // Stream chat with strict model o1: should suppress temperature/topP and apply reasoningEffort
        const streamGen3 = aiService.streamChat(user.id, {
            modelId: "o1",
            message: "Hello o1",
        });
        await consumeStream(streamGen3);
        assertEquals(capturedGenerationParams.reasoning_effort, "high"); // from models['o1']
        assertEquals(capturedGenerationParams.max_tokens, 3500); // from models['o1']
        assertEquals(capturedGenerationParams.temperature, undefined); // strict model suppresses temperature
        assertEquals(capturedGenerationParams.top_p, undefined); // strict model suppresses top_p
    } finally {
        await store.close();
    }
});
