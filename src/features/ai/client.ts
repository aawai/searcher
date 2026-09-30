import OpenAI from "openai";
import type { DiscoveredModel } from "./types.ts";

// Searcher 的文本聊天边界；SDK 类型仅存在于 adapter 内部。
export interface OpenAIChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface OpenAIChatCompletionRequest {
    model: string;
    messages: OpenAIChatMessage[];
    stream?: boolean;
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
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

export async function fetchOpenAIModels(
    baseUrl: string,
    apiKey: string,
    fetchFn: typeof fetch = fetch,
): Promise<DiscoveredModel[]> {
    const client = createClient(baseUrl, apiKey, fetchFn);
    let page;
    try {
        // 只读取 /models 的首个响应，不触发 SDK 自动分页。
        page = await client.models.list();
    } catch (error: unknown) {
        if (error instanceof OpenAI.APIError && error.status !== undefined) {
            throw new OpenAIClientError(
                `获取模型列表失败: HTTP ${error.status} ${error.message}`,
                error.status,
                error.error === undefined
                    ? error.message
                    : JSON.stringify(error.error),
            );
        }
        if (error instanceof SyntaxError) {
            throw new OpenAIClientError("模型列表返回结果不是合法的 JSON");
        }
        throw new OpenAIClientError(
            `网络连接失败无法访问 /models: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }

    if (!Array.isArray(page.data) || page.data.length === 0) {
        throw new OpenAIClientError(
            "未从 /models 发现可用模型列表（data 为空或不是数组）",
        );
    }

    return page.data
        .filter((item) =>
            typeof item?.id === "string" && item.id.trim().length > 0
        )
        .map((item) => {
            const modelId = item.id.trim();
            return {
                id: modelId,
                displayName: modelId,
                supportsText: true,
                supportsVision: /vision|vl|-v\b|4o|gemini/i.test(modelId),
                supportsTools: true,
                supportsStreaming: true,
            };
        });
}

export interface StreamEvent {
    type: "token" | "done" | "error";
    token?: string;
    error?: string;
    inputTokens?: number;
    outputTokens?: number;
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
    try {
        const stream = await client.chat.completions.create(
            { ...request, stream: true },
            { signal, headers: { Accept: "text/event-stream" } },
        );
        streaming = true;
        for await (const chunk of stream) {
            if (signal?.aborted) {
                yield { type: "error", error: "请求已中断" };
                return;
            }
            const content = chunk?.choices?.[0]?.delta?.content;
            if (typeof content === "string" && content.length > 0) {
                yield { type: "token", token: content };
            }
        }
        // SDK 将流读取时的 Abort 当作正常迭代结束，不能误报 complete。
        yield signal?.aborted
            ? { type: "error", error: "请求已中断" }
            : { type: "done" };
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
