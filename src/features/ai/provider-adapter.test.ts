import { assertEquals, assertRejects } from "@std/assert";
import {
    CLIProxyAPIHomeAdapter,
    discoverProviderModels,
    hasCLIProxyDiscriminator,
    normalizeRawModels,
    OpenAICompatibleAdapter,
    redactSensitiveData,
    resolveOriginEndpoint,
} from "./provider-adapter.ts";
import { OpenAIClientError } from "./client.ts";

Deno.test("ProviderAdapter: redactSensitiveData redacts api keys and Bearer tokens", () => {
    const rawError =
        "Request failed with key sk-secret-123456789 and Bearer sk-another-token-abc";
    const redacted = redactSensitiveData(rawError, "sk-secret-123456789");
    assertEquals(redacted.includes("sk-secret-123456789"), false);
    assertEquals(redacted.includes("sk-another-token-abc"), false);
    assertEquals(redacted.includes("[REDACTED]"), true);
});

Deno.test("ProviderAdapter: resolveOriginEndpoint resolves to origin root", () => {
    // 1. https://api.example.com/v1 -> https://api.example.com/user/models
    assertEquals(
        resolveOriginEndpoint("https://api.example.com/v1", "/user/models"),
        "https://api.example.com/user/models",
    );
    // 2. Trailing slash https://api.example.com/v1/ -> https://api.example.com/user/models
    assertEquals(
        resolveOriginEndpoint("https://api.example.com/v1/", "user/models"),
        "https://api.example.com/user/models",
    );
    // 3. Port preservation http://localhost:8080/v1/chat -> http://localhost:8080/user/models
    assertEquals(
        resolveOriginEndpoint("http://localhost:8080/v1/chat", "/user/models"),
        "http://localhost:8080/user/models",
    );
});

Deno.test("ProviderAdapter: normalizeRawModels honors explicit capability denials before name inference", () => {
    const rawData = {
        data: [
            {
                id: "gpt-4o-novision",
                name: "GPT-4o No Vision",
                // Explicitly denied vision despite '4o' in modelId:
                supports_vision: false,
                // Explicitly denied tools:
                supports_tools: false,
            },
            {
                id: "gemini-flash",
                // Explicitly declared in capabilities object:
                capabilities: {
                    vision: false,
                    streaming: false,
                },
            },
            {
                id: "standard-4o",
                // No explicit flags -> falls back to conservative name inference:
            },
        ],
    };

    const models = normalizeRawModels(rawData);
    assertEquals(models.length, 3);

    // Model 1: explicit false honored
    assertEquals(models[0].supportsVision, false);
    assertEquals(models[0].supportsTools, false);

    // Model 2: nested capabilities explicit false honored
    assertEquals(models[1].supportsVision, false);
    assertEquals(models[1].supportsStreaming, false);

    // Model 3: fallback inference used
    assertEquals(models[2].supportsVision, true);
    assertEquals(models[2].supportsTools, true);
    assertEquals(models[2].supportsStreaming, true);
});

Deno.test("ProviderAdapter: hasCLIProxyDiscriminator distinguishes cliproxy from generic capabilities", () => {
    // URL hint
    assertEquals(
        hasCLIProxyDiscriminator("https://cliproxy.example.com/v1"),
        true,
    );
    assertEquals(hasCLIProxyDiscriminator("https://api.openai.com/v1"), false);

    // Explicit cliproxy metadata discriminator
    const cliproxyModel = [
        {
            id: "m1",
            displayName: "m1",
            supportsText: true,
            supportsVision: false,
            supportsTools: false,
            supportsStreaming: true,
            reasoningCapability: {
                status: "supported" as const,
                levels: [],
                source: "provider" as const,
            },
            rawMetadata: { provider: "cliproxyapi" },
        },
    ];
    assertEquals(
        hasCLIProxyDiscriminator("https://api.example.com/v1", cliproxyModel),
        true,
    );

    // Generic provider returning capabilities is NOT CLIProxy evidence
    const genericCapabilitiesModel = [
        {
            id: "m2",
            displayName: "m2",
            supportsText: true,
            supportsVision: false,
            supportsTools: false,
            supportsStreaming: true,
            reasoningCapability: {
                status: "supported" as const,
                levels: ["low" as const],
                source: "provider" as const,
            },
            rawMetadata: {
                capabilities: {
                    reasoning: { status: "supported", levels: ["low"] },
                },
            },
        },
    ];
    assertEquals(
        hasCLIProxyDiscriminator(
            "https://api.example.com/v1",
            genericCapabilitiesModel,
        ),
        false,
    );
});

Deno.test("ProviderAdapter: OpenAICompatibleAdapter denies credential-bearing redirects on /models", async () => {
    const fetchFn: typeof fetch = (
        _input: RequestInfo | URL,
        init?: RequestInit,
    ) => {
        // Verify redirect mode is set to error
        assertEquals(init?.redirect, "error");
        // Simulate redirect rejection by fetch when redirect: "error"
        return Promise.reject(
            new TypeError(
                "Failed to fetch: redirect mode is set to error: unexpected redirect",
            ),
        );
    };

    const adapter = new OpenAICompatibleAdapter();
    const err = await assertRejects(
        () =>
            adapter.discoverModels(
                "https://api.openai.com/v1",
                "secret-key",
                fetchFn,
            ),
        OpenAIClientError,
    );
    assertEquals(err.message.includes("已拒绝重定向以防止 API Key 泄露"), true);
});

Deno.test("ProviderAdapter: CLIProxyAPIHomeAdapter denies credential-bearing redirects on /user/models without failing standard discovery", async () => {
    const fetchFn: typeof fetch = (
        input: RequestInfo | URL,
        init?: RequestInit,
    ) => {
        const url = String(input);
        assertEquals(init?.redirect, "error");

        if (url.includes("/v1/models")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: [{ id: "model-1", name: "Model 1" }],
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            );
        }
        if (url.includes("/user/models")) {
            // Simulate redirect on /user/models
            return Promise.reject(
                new TypeError("redirect mode is set to error"),
            );
        }
        return Promise.resolve(new Response("Not Found", { status: 404 }));
    };

    const adapter = new CLIProxyAPIHomeAdapter();
    const models = await adapter.discoverModels(
        "https://proxy.example.com/v1",
        "secret-key",
        fetchFn,
    );

    // Standard models preserved despite /user/models redirect denial
    assertEquals(models.length, 1);
    assertEquals(models[0].id, "model-1");
});

Deno.test("ProviderAdapter: discoverProviderModels in Auto mode is /models-first and never blind-probes /user/models", async () => {
    const requestedUrls: string[] = [];
    const fetchFn: typeof fetch = (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes("/models")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: [
                            {
                                id: "generic-model",
                                capabilities: {
                                    reasoning: {
                                        status: "supported",
                                        levels: ["low"],
                                    },
                                },
                            },
                        ],
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

    const models = await discoverProviderModels(
        "https://api.generic-provider.com/v1",
        "key",
        { discoveryMode: "auto", fetchFn },
    );

    assertEquals(requestedUrls, ["https://api.generic-provider.com/v1/models"]);
    assertEquals(models.length, 1);
    assertEquals(models[0].id, "generic-model");
});

Deno.test("ProviderAdapter: discoverProviderModels in Auto mode with cliproxy URL enriches via /user/models", async () => {
    const requestedUrls: string[] = [];
    const fetchFn: typeof fetch = (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes("/v1/models")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: [{ id: "model-std", name: "Standard Model" }],
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            );
        }
        if (url.includes("/user/models")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        models: [
                            {
                                id: "model-std",
                                capabilities: {
                                    reasoning: {
                                        status: "supported",
                                        levels: ["low", "high"],
                                    },
                                },
                            },
                        ],
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

    const models = await discoverProviderModels(
        "https://cliproxy.example.com/v1",
        "key",
        { discoveryMode: "auto", fetchFn },
    );

    assertEquals(requestedUrls[0], "https://cliproxy.example.com/v1/models");
    assertEquals(requestedUrls[1], "https://cliproxy.example.com/user/models");
    assertEquals(models.length, 1);
    assertEquals(models[0].reasoningCapability.levels, ["low", "high"]);
});

Deno.test("ProviderAdapter: CLIProxyAPIHomeAdapter preserves standard models when /user/models fails or is empty", async () => {
    const fetchFn: typeof fetch = (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/user/models")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({ models: [] }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            );
        }
        if (url.includes("/models")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: [{ id: "standard-model" }],
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

    const adapter = new CLIProxyAPIHomeAdapter();
    const models = await adapter.discoverModels(
        "https://proxy.example.com/v1",
        "proxy-key",
        fetchFn,
    );

    assertEquals(models.length, 1);
    assertEquals(models[0].id, "standard-model");
});

Deno.test("ProviderAdapter: discoverProviderModels in cliproxyapi mode queries standard and origin user models", async () => {
    const requested: string[] = [];
    const fetchFn: typeof fetch = (input) => {
        const url = String(input);
        requested.push(url);
        if (url.endsWith("/user/models")) {
            return Promise.resolve(
                Response.json({ models: [{ id: "user-model" }] }),
            );
        }
        if (url.endsWith("/models")) {
            return Promise.resolve(
                Response.json({ data: [{ id: "standard-model" }] }),
            );
        }
        return Promise.resolve(new Response("Not Found", { status: 404 }));
    };

    const models = await discoverProviderModels(
        "https://proxy.example.com/v1",
        "proxy-key",
        { discoveryMode: "cliproxyapi", fetchFn },
    );

    assertEquals(requested.sort(), [
        "https://proxy.example.com/user/models",
        "https://proxy.example.com/v1/models",
    ]);
    assertEquals(models.map((m) => m.id).sort(), [
        "standard-model",
        "user-model",
    ]);
});
