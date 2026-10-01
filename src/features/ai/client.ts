import OpenAI from "openai";

// Searcher 的文本聊天边界；SDK 类型仅存在于 adapter 内部。
export type OpenAIChatMessageContent =
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail?: string } }
    >;

export interface OpenAIChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: OpenAIChatMessageContent;
    name?: string;
    tool_call_id?: string;
    tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
    }>;
}

export interface OpenAIChatCompletionRequest {
    model: string;
    messages: OpenAIChatMessage[];
    stream?: boolean;
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    reasoning_effort?: string;
    tools?: unknown[];
    stream_options?: { include_usage?: boolean };
    [key: string]: unknown;
}

export class OpenAIClientError extends Error {
    readonly statusCode?: number;
    readonly responseBody?: string;

    constructor(message: string, statusCode?: number, responseBody?: string) {
        super(message);
        this.name = "OpenAIClientError";
        this.statusCode = statusCode;
        this.responseBody = responseBody;
    }
}

export function normalizeBaseUrl(rawUrl: string): string {
    let url: URL;
    try {
        url = new URL(rawUrl.trim());
    } catch {
        throw new OpenAIClientError("Base URL 必须是完整的 HTTP(S) 地址");
    }
    const host = url.hostname.toLowerCase();
    const loopback = host === "localhost" || host === "127.0.0.1" ||
        host === "[::1]" || host === "100.78.0.1";
    const literalIp = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[");
    if (
        (url.protocol !== "https:" &&
            !(loopback && url.protocol === "http:")) ||
        url.username || url.password || url.search || url.hash ||
        (literalIp && !loopback) || /\.(local|internal|localhost)$/.test(host)
    ) {
        throw new OpenAIClientError(
            "Provider URL 仅允许公开 HTTPS 或本机 loopback HTTP，且不能包含凭据、查询或片段",
        );
    }
    return url.href.replace(/\/+$/, "");
}

function createClient(
    baseUrl: string,
    apiKey: string,
    fetchFn: typeof fetch,
): OpenAI {
    return new OpenAI({
        baseURL: normalizeBaseUrl(baseUrl),
        apiKey: apiKey.trim(),
        fetch: fetchFn,
        fetchOptions: { redirect: "error" },
        // 原 transport 无请求超时；使用运行时可安全表示的最长 timer。
        timeout: 2 ** 31 - 1,
        organization: null,
        project: null,
        // models 和 chat 均保持单次请求，不继承 SDK 的自动重试。
        maxRetries: 0,
    });
}

export interface StreamEvent {
    type: "token" | "tool_calls" | "done" | "error";
    token?: string;
    error?: string;
    inputTokens?: number;
    outputTokens?: number;
    toolCalls?: Array<{
        id: string;
        name: string;
        arguments: string;
    }>;
}

interface ExtractedChunkUsage {
    promptTokens?: number;
    completionTokens?: number;
}

function extractChunkUsage(chunk: unknown): ExtractedChunkUsage | undefined {
    if (!chunk || typeof chunk !== "object" || !("usage" in chunk)) {
        return undefined;
    }
    const u = chunk.usage;
    if (!u || typeof u !== "object") return undefined;
    const prompt = "prompt_tokens" in u && typeof u.prompt_tokens === "number"
        ? u.prompt_tokens
        : undefined;
    const completion =
        "completion_tokens" in u && typeof u.completion_tokens === "number"
            ? u.completion_tokens
            : undefined;
    return { promptTokens: prompt, completionTokens: completion };
}

interface ExtractedToolCallDelta {
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
}

function extractChunkToolCalls(
    chunk: unknown,
): ExtractedToolCallDelta[] | undefined {
    if (!chunk || typeof chunk !== "object" || !("choices" in chunk)) {
        return undefined;
    }
    const choices = chunk.choices;
    if (!Array.isArray(choices) || choices.length === 0) return undefined;
    const choice0 = choices[0];
    if (!choice0 || typeof choice0 !== "object" || !("delta" in choice0)) {
        return undefined;
    }
    const delta = choice0.delta;
    if (!delta || typeof delta !== "object" || !("tool_calls" in delta)) {
        return undefined;
    }
    const tc = delta.tool_calls;
    return Array.isArray(tc) ? (tc as ExtractedToolCallDelta[]) : undefined;
}

export async function* streamOpenAIChat(
    baseUrl: string,
    apiKey: string,
    request: OpenAIChatCompletionRequest,
    fetchFn: typeof fetch = fetch,
    signal?: AbortSignal,
): AsyncGenerator<StreamEvent, void, unknown> {
    const client = createClient(baseUrl, apiKey, fetchFn);
    let streaming = false;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    const accumulatedToolCalls = new Map<
        number,
        { id: string; name: string; arguments: string }
    >();

    try {
        const stream = await client.chat.completions.create(
            {
                ...request,
                stream: true,
                stream_options: { include_usage: true },
            } as unknown as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
            { signal, headers: { Accept: "text/event-stream" } },
        );
        streaming = true;
        for await (const chunk of stream) {
            if (signal?.aborted) {
                yield { type: "error", error: "请求已中断" };
                return;
            }

            // Capture usage if provider returned it in chunk
            const chunkUsage = extractChunkUsage(chunk);
            if (chunkUsage) {
                if (chunkUsage.promptTokens !== undefined) {
                    inputTokens = chunkUsage.promptTokens;
                }
                if (chunkUsage.completionTokens !== undefined) {
                    outputTokens = chunkUsage.completionTokens;
                }
            }

            // Handle delta text content
            const content = chunk?.choices?.[0]?.delta?.content;
            if (typeof content === "string" && content.length > 0) {
                yield { type: "token", token: content };
            }

            // Handle delta tool calls
            const rawToolCalls = extractChunkToolCalls(chunk);
            if (rawToolCalls) {
                for (const tc of rawToolCalls) {
                    const idx = typeof tc.index === "number" ? tc.index : 0;
                    const existing = accumulatedToolCalls.get(idx) ?? {
                        id: "",
                        name: "",
                        arguments: "",
                    };
                    if (tc.id) existing.id += tc.id;
                    if (tc.function?.name) existing.name += tc.function.name;
                    if (tc.function?.arguments) {
                        existing.arguments += tc.function.arguments;
                    }
                    accumulatedToolCalls.set(idx, existing);
                }
            }
        }

        if (signal?.aborted) {
            yield { type: "error", error: "请求已中断" };
            return;
        }

        // If tool calls were accumulated, yield tool_calls event
        if (accumulatedToolCalls.size > 0) {
            const calls = Array.from(accumulatedToolCalls.values()).filter(
                (c) => c.name.length > 0,
            );
            if (calls.length > 0) {
                yield {
                    type: "tool_calls",
                    toolCalls: calls,
                    inputTokens,
                    outputTokens,
                };
                return;
            }
        }

        // Standard done event with usage
        const doneEvent: StreamEvent = { type: "done" };
        if (inputTokens !== undefined) doneEvent.inputTokens = inputTokens;
        if (outputTokens !== undefined) doneEvent.outputTokens = outputTokens;
        yield doneEvent;
    } catch (error: unknown) {
        if (signal?.aborted) {
            yield { type: "error", error: "请求已中断" };
            return;
        }
        if (error instanceof OpenAI.APIError && error.status !== undefined) {
            yield {
                type: "error",
                error:
                    `AI Provider 返回错误 HTTP ${error.status}: ${error.message}`,
            };
            return;
        }
        yield {
            type: "error",
            error: `${
                streaming ? "读取流发生异常" : "连接 AI Provider 失败"
            }: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
