import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
    fetchOpenAIModels,
    normalizeBaseUrl,
    OpenAIClientError,
    streamOpenAIChat,
} from "./client.ts";

const request = {
    model: "custom-model",
    messages: [{ role: "user" as const, content: "hello" }],
};

Deno.test("AI Client: provider SSE errors terminate with an error event", async () => {
    const fetchFn: typeof fetch = () =>
        Promise.resolve(
            new Response(
                'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n' +
                    'data: {"error":{"message":"provider overloaded","type":"server_error"}}\n\n',
                { headers: { "Content-Type": "text/event-stream" } },
            ),
        );
    const events = await Array.fromAsync(streamOpenAIChat(
        "https://compatible.example/custom/v1",
        "test-key",
        request,
        fetchFn,
    ));
    assertEquals(events[0], { type: "token", token: "partial" });
    assertEquals(events[1]?.type, "error");
    assertEquals(events.some((event) => event.type === "done"), false);
});

Deno.test("AI Client: fragmented UTF-8 and CRLF SSE preserve text and ignore non-text chunks", async () => {
    const bytes = new TextEncoder().encode(
        ": heartbeat\r\n\r\n" +
            'data: {"choices":[{"delta":{"role":"assistant"}}]}\r\n\r\n' +
            'data: {"choices":[{"delta":{"content":"你好🌏"}}]}\r\n\r\n' +
            'data: {"choices":[],"usage":{"total_tokens":2}}\r\n\r\n' +
            "data: [DONE]\r\n\r\n",
    );
    let offset = 0;
    const fetchFn: typeof fetch = () =>
        Promise.resolve(
            new Response(
                new ReadableStream<Uint8Array>({
                    pull(controller) {
                        if (offset === bytes.length) {
                            controller.close();
                            return;
                        }
                        controller.enqueue(bytes.subarray(offset, ++offset));
                    },
                }),
                { headers: { "Content-Type": "text/event-stream" } },
            ),
        );
    assertEquals(
        await Array.fromAsync(streamOpenAIChat(
            "https://compatible.example/custom/v1",
            "test-key",
            request,
            fetchFn,
        )),
        [{ type: "token", token: "你好🌏" }, { type: "done" }],
    );
});

Deno.test("AI Client: malformed SSE returns an error after partial output without throwing", async () => {
    const fetchFn: typeof fetch = () =>
        Promise.resolve(
            new Response(
                'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n' +
                    "data: {not json}\n\n",
                { headers: { "Content-Type": "text/event-stream" } },
            ),
        );
    const events = await Array.fromAsync(streamOpenAIChat(
        "https://compatible.example/v1",
        "test-key",
        request,
        fetchFn,
    ));
    assertEquals(events[0], { type: "token", token: "partial" });
    assertEquals(events.map((event) => event.type), ["token", "error"]);
});

Deno.test("AI Client: unexpected JSON chunks cannot escape the stream boundary", async () => {
    const fetchFn: typeof fetch = () =>
        Promise.resolve(
            new Response(
                'data: null\n\ndata: {"choices":[null]}\n\ndata: {"choices":[{"delta":{"content":42}}]}\n\n' +
                    'data: {"choices":[{"delta":{"content":"valid"}}]}\n\ndata: [DONE]\n\n',
                { headers: { "Content-Type": "text/event-stream" } },
            ),
        );
    assertEquals(
        await Array.fromAsync(streamOpenAIChat(
            "https://compatible.example/v1",
            "test-key",
            request,
            fetchFn,
        )),
        [{ type: "token", token: "valid" }, { type: "done" }],
    );
});

Deno.test("AI Client: models and chat never retry provider HTTP failures", async () => {
    for (const status of [401, 429, 503]) {
        const urls: string[] = [];
        const fetchFn: typeof fetch = (input) => {
            urls.push(String(input));
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        error: { message: "provider unavailable" },
                    }),
                    { status, headers: { "Content-Type": "application/json" } },
                ),
            );
        };
        const error = await assertRejects(() =>
            fetchOpenAIModels(
                "https://compatible.example/custom/v1/",
                "test-key",
                fetchFn,
            ), OpenAIClientError);
        assertEquals(error.statusCode, status);
        assertEquals(urls, ["https://compatible.example/custom/v1/models"]);
        urls.length = 0;
        const events = await Array.fromAsync(streamOpenAIChat(
            "https://compatible.example/custom/v1/",
            "test-key",
            request,
            fetchFn,
        ));
        assertEquals(events.map((event) => event.type), ["error"]);
        assertEquals(urls, [
            "https://compatible.example/custom/v1/chat/completions",
        ]);
    }
});

Deno.test("AI Client: invalid models responses remain Searcher errors", async () => {
    for (const body of ["{not json}", "{}", '{"data":null}', '{"data":[]}']) {
        const fetchFn: typeof fetch = () =>
            Promise.resolve(
                new Response(body, {
                    headers: { "Content-Type": "application/json" },
                }),
            );
        await assertRejects(() =>
            fetchOpenAIModels(
                "https://compatible.example/v1",
                "test-key",
                fetchFn,
            ), OpenAIClientError);
    }
});

Deno.test("AI Client: endpoint policy rejects credentials, query, hash and restricted hosts", () => {
    for (
        const url of [
            "https://user:password@example.com/v1",
            "https://example.com/v1?key=value",
            "https://example.com/v1#fragment",
            "https://192.168.1.1/v1",
            "https://[fe80::1]/v1",
            "https://provider.local/v1",
            "https://provider.internal/v1",
            "https://provider.localhost/v1",
            "http://localhost.evil.example/v1",
            "http://127.1.0.1/v1",
            "ftp://localhost/v1",
        ]
    ) {
        assertThrows(() => normalizeBaseUrl(url), OpenAIClientError);
    }
    assertEquals(
        normalizeBaseUrl("http://[::1]:11434/v1/"),
        "http://[::1]:11434/v1",
    );
});
