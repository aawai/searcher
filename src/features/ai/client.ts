import type { DiscoveredModel } from "./types.ts";

export interface OpenAIModelItem {
    id: string;
    object?: string;
    created?: number;
    owned_by?: string;
    [key: string]: unknown;
}

export interface OpenAIModelsResponse {
    object?: string;
    data?: OpenAIModelItem[];
    error?: {
        message: string;
        type?: string;
        code?: string | number;
    };
}

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
        host === "[::1]";
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

export async function fetchOpenAIModels(
    baseUrl: string,
    apiKey: string,
    fetchFn: typeof fetch = fetch,
): Promise<DiscoveredModel[]> {
    const normalized = normalizeBaseUrl(baseUrl);
    const targetUrl = `${normalized}/models`;

    let response: Response;
    try {
        response = await fetchFn(targetUrl, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${apiKey.trim()}`,
                "Accept": "application/json",
            },
            redirect: "error",
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new OpenAIClientError(`网络连接失败无法访问 /models: ${msg}`);
    }

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new OpenAIClientError(
            `获取模型列表失败: HTTP ${response.status} ${response.statusText}`,
            response.status,
            text,
        );
    }

    let json: OpenAIModelsResponse;
    try {
        json = await response.json();
    } catch {
        throw new OpenAIClientError("模型列表返回结果不是合法的 JSON");
    }

    if (!json.data || !Array.isArray(json.data) || json.data.length === 0) {
        throw new OpenAIClientError(
            "未从 /models 发现可用模型列表（data 为空或不是数组）",
        );
    }

    return json.data
        .filter((item) =>
            typeof item.id === "string" && item.id.trim().length > 0
        )
        .map((item) => {
            const modelId = item.id.trim();
            const isVision = /vision|vl|-v\b|4o|gemini/i.test(modelId);
            return {
                id: modelId,
                displayName: modelId,
                supportsText: true,
                supportsVision: isVision,
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
    const normalized = normalizeBaseUrl(baseUrl);
    const targetUrl = `${normalized}/chat/completions`;

    let response: Response;
    try {
        response = await fetchFn(targetUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey.trim()}`,
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
            body: JSON.stringify({
                ...request,
                stream: true,
            }),
            signal,
            redirect: "error",
        });
    } catch (err: unknown) {
        if (signal?.aborted) {
            yield { type: "error", error: "请求已中断" };
            return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        yield { type: "error", error: `连接 AI Provider 失败: ${msg}` };
        return;
    }

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        yield {
            type: "error",
            error: `AI Provider 返回错误 HTTP ${response.status}: ${
                text || response.statusText
            }`,
        };
        return;
    }

    if (!response.body) {
        yield { type: "error", error: "AI Provider 未提供流式响应正文" };
        return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
        while (true) {
            if (signal?.aborted) {
                yield { type: "error", error: "请求已中断" };
                return;
            }

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(":")) continue;

                if (trimmed.startsWith("data:")) {
                    const dataStr = trimmed.slice(5).trim();
                    if (dataStr === "[DONE]") {
                        yield { type: "done" };
                        return;
                    }

                    try {
                        const parsed = JSON.parse(dataStr);
                        const choices = parsed.choices;
                        if (Array.isArray(choices) && choices.length > 0) {
                            const delta = choices[0].delta;
                            if (delta?.content) {
                                yield { type: "token", token: delta.content };
                            }
                        }
                    } catch {
                        // 忽略非 JSON 行或格式异常行
                    }
                }
            }
        }

        if (buffer.trim()) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith("data:")) {
                const dataStr = trimmed.slice(5).trim();
                if (dataStr === "[DONE]") {
                    yield { type: "done" };
                    return;
                }
                try {
                    const parsed = JSON.parse(dataStr);
                    const delta = parsed.choices?.[0]?.delta;
                    if (delta?.content) {
                        yield { type: "token", token: delta.content };
                    }
                } catch {
                    // ignore
                }
            }
        }

        yield { type: "done" };
    } catch (err: unknown) {
        if (signal?.aborted) {
            yield { type: "error", error: "请求已中断" };
        } else {
            const msg = err instanceof Error ? err.message : String(err);
            yield { type: "error", error: `读取流失败: ${msg}` };
        }
    } finally {
        reader.releaseLock();
    }
}
