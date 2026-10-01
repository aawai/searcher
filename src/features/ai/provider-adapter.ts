/**
 * Provider Capability Adapters.
 * Resolves endpoints, normalizes raw provider models, and handles provider-specific
 * capabilities such as CLIProxyAPIHome extended catalog with graceful fallback.
 */

import {
    type DiscoveryMode,
    normalizeRawModelCapabilities,
    type ReasoningCapability,
} from "./model-capabilities.ts";
import { normalizeBaseUrl, OpenAIClientError } from "./client.ts";

export interface DiscoveredModelWithCapabilities {
    id: string;
    displayName: string;
    supportsText: boolean;
    supportsVision: boolean;
    supportsTools: boolean;
    supportsStreaming: boolean;
    reasoningCapability: ReasoningCapability;
    rawMetadata?: Record<string, unknown>;
}

export interface ProviderCapabilityAdapter {
    readonly id: string;
    discoverModels(
        baseUrl: string,
        apiKey: string,
        fetchFn?: typeof fetch,
    ): Promise<DiscoveredModelWithCapabilities[]>;
}

export const DEFAULT_MODELS_TIMEOUT_MS = 15000;
export const DEFAULT_EXTENDED_TIMEOUT_MS = 5000;

/**
 * Redact sensitive credentials (API keys, Bearer tokens, URL credentials) from error text and response bodies.
 */
export function redactSensitiveData(text: string, apiKey?: string): string {
    let result = text;
    if (apiKey && apiKey.trim().length > 0) {
        result = result.replaceAll(apiKey.trim(), "[REDACTED]");
    }
    result = result.replace(
        /(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi,
        "$1[REDACTED]",
    );
    result = result.replace(
        /:\/\/[^:]+:[^@]+@/g,
        "://[REDACTED]:[REDACTED]@",
    );
    return result;
}

/**
 * Resolve endpoint against the origin root of the baseUrl rather than appending to subpaths.
 * Preserves standard URL normalization and security validation (no credentials, queries, or fragments).
 * For example:
 *   "https://api.example.com/v1" + "/user/models" -> "https://api.example.com/user/models"
 *   "http://localhost:8080/v1/chat" + "/user/models" -> "http://localhost:8080/user/models"
 */
export function resolveOriginEndpoint(
    baseUrl: string,
    endpointPath: string,
): string {
    const normalized = normalizeBaseUrl(baseUrl);
    const url = new URL(normalized);
    const path = endpointPath.startsWith("/")
        ? endpointPath
        : `/${endpointPath}`;
    return `${url.origin}${path}`;
}

/**
 * Normalize baseUrl into the standard /models endpoint.
 */
export function normalizeModelsEndpoint(baseUrl: string): string {
    const normalized = normalizeBaseUrl(baseUrl);
    if (normalized.endsWith("/models")) {
        return normalized;
    }
    return `${normalized}/models`;
}

/**
 * Extract an explicit boolean capability flag if declared by provider at top level
 * or under a capabilities object. Returns undefined if not specified.
 */
function extractExplicitBoolean(
    record: Record<string, unknown>,
    ...keys: string[]
): boolean | undefined {
    for (const key of keys) {
        if (typeof record[key] === "boolean") {
            return record[key] as boolean;
        }
    }
    if (
        record.capabilities &&
        typeof record.capabilities === "object" &&
        !Array.isArray(record.capabilities)
    ) {
        const caps = record.capabilities as Record<string, unknown>;
        for (const key of keys) {
            if (typeof caps[key] === "boolean") {
                return caps[key] as boolean;
            }
        }
    }
    return undefined;
}

/**
 * Robustly extract and normalize model list and capabilities from any raw provider payload.
 * Honors explicit false from provider before falling back to conservative inference,
 * so models do not claim capabilities the provider explicitly denies.
 */
export function normalizeRawModels(
    raw: unknown,
): DiscoveredModelWithCapabilities[] {
    if (!raw || typeof raw !== "object") {
        return [];
    }

    const json = raw as Record<string, unknown>;
    const list = Array.isArray(json.data)
        ? json.data
        : Array.isArray(json.models)
        ? json.models
        : Array.isArray(raw)
        ? raw
        : null;

    if (!list) return [];

    const result: DiscoveredModelWithCapabilities[] = [];
    for (const item of list) {
        if (!item || typeof item !== "object" || !("id" in item)) continue;
        const rawId = (item as { id: unknown }).id;
        if (typeof rawId !== "string" || rawId.trim().length === 0) continue;
        const modelId = rawId.trim();
        const rawRecord = item as Record<string, unknown>;
        const reasoningCap = normalizeRawModelCapabilities(rawRecord, modelId);
        const rawName = "name" in item && typeof item.name === "string"
            ? item.name.trim()
            : "";

        // Check provider explicit capability flags
        const explicitText = extractExplicitBoolean(
            rawRecord,
            "supports_text",
            "supportsText",
            "text",
        );
        const explicitVision = extractExplicitBoolean(
            rawRecord,
            "supports_vision",
            "supportsVision",
            "vision",
        );
        const explicitTools = extractExplicitBoolean(
            rawRecord,
            "supports_tools",
            "supportsTools",
            "tools",
        );
        const explicitStreaming = extractExplicitBoolean(
            rawRecord,
            "supports_streaming",
            "supportsStreaming",
            "streaming",
        );

        result.push({
            id: modelId,
            displayName: rawName || modelId,
            supportsText: explicitText !== undefined ? explicitText : true,
            // Explicit false takes precedence over name inference:
            supportsVision: explicitVision !== undefined
                ? explicitVision
                : /vision|vl|-v\b|4o|gemini/i.test(modelId),
            supportsTools: explicitTools !== undefined ? explicitTools : true,
            supportsStreaming: explicitStreaming !== undefined
                ? explicitStreaming
                : true,
            reasoningCapability: reasoningCap,
            rawMetadata: rawRecord,
        });
    }

    return result;
}

/**
 * Check whether a provider or observed models explicitly indicate CLIProxyAPIHome.
 * Generic capabilities.reasoning is NOT considered CLIProxy evidence because many standard
 * providers also return capabilities. Only explicit discriminator metadata or URL hints match.
 */
export function hasCLIProxyDiscriminator(
    baseUrl: string,
    observedModels?: DiscoveredModelWithCapabilities[],
): boolean {
    if (/cliproxy/i.test(baseUrl)) {
        return true;
    }
    if (observedModels && observedModels.length > 0) {
        return observedModels.some((m) => {
            const raw = m.rawMetadata;
            if (!raw || typeof raw !== "object") return false;
            if ("cliproxy" in raw) return true;
            if (
                typeof raw.provider === "string" &&
                /cliproxy/i.test(raw.provider)
            ) {
                return true;
            }
            if (
                typeof raw._provider === "string" &&
                /cliproxy/i.test(raw._provider)
            ) {
                return true;
            }
            if (
                typeof raw.service === "string" && /cliproxy/i.test(raw.service)
            ) {
                return true;
            }
            return false;
        });
    }
    return false;
}

/**
 * Standard OpenAI-compatible Provider Adapter.
 * Does NOT call /user/models by default; preserves and normalizes raw model metadata.
 * Denies credential-bearing redirects (redirect: "error") to prevent API key leaks.
 */
export class OpenAICompatibleAdapter implements ProviderCapabilityAdapter {
    readonly id = "openai-compatible";

    async discoverModels(
        baseUrl: string,
        apiKey: string,
        fetchFn: typeof fetch = fetch,
    ): Promise<DiscoveredModelWithCapabilities[]> {
        const endpoint = normalizeModelsEndpoint(baseUrl);
        const headers: Record<string, string> = {
            "Accept": "application/json",
        };
        if (apiKey.trim().length > 0) {
            headers["Authorization"] = `Bearer ${apiKey.trim()}`;
        }

        let res: Response;
        try {
            res = await fetchFn(endpoint, {
                method: "GET",
                headers,
                redirect: "error", // Deny credential-bearing redirects
                signal: AbortSignal.timeout(DEFAULT_MODELS_TIMEOUT_MS),
            });
        } catch (error: unknown) {
            if (error instanceof TypeError && /redirect/i.test(error.message)) {
                throw new OpenAIClientError(
                    "Provider 请求遭遇重定向，已拒绝重定向以防止 API Key 泄露",
                );
            }
            if (
                error instanceof DOMException && error.name === "TimeoutError"
            ) {
                throw new OpenAIClientError("获取模型列表超时");
            }
            throw new OpenAIClientError(
                redactSensitiveData(
                    `网络连接失败无法访问 /models: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                    apiKey,
                ),
            );
        }

        if (res.status >= 300 && res.status < 400) {
            throw new OpenAIClientError(
                "Provider 返回重定向状态码，已拒绝重定向以防止 API Key 泄露",
            );
        }

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            const sanitizedBody = redactSensitiveData(body, apiKey);
            throw new OpenAIClientError(
                redactSensitiveData(
                    `获取模型列表失败: HTTP ${res.status} ${res.statusText}${
                        sanitizedBody ? ` - ${sanitizedBody}` : ""
                    }`,
                    apiKey,
                ),
                res.status,
                sanitizedBody,
            );
        }

        let json: unknown;
        try {
            json = await res.json();
        } catch {
            throw new OpenAIClientError("模型列表返回结果不是合法的 JSON");
        }

        const models = normalizeRawModels(json);
        if (models.length === 0) {
            throw new OpenAIClientError(
                "未从 /models 发现可用模型列表（data 为空或不是数组）",
            );
        }

        return models;
    }
}

/**
 * CLIProxyAPIHome Provider Adapter.
 * Discovers standard /models first, then best-effort attempts origin-root /user/models
 * to MERGE extended reasoning capabilities without replacing the standard list.
 * Denies credential-bearing redirects and enforces bounded timeout on extended probing.
 */
export class CLIProxyAPIHomeAdapter implements ProviderCapabilityAdapter {
    readonly id = "cliproxyapi";

    async enrichWithUserModels(
        baseUrl: string,
        apiKey: string,
        standardModels: DiscoveredModelWithCapabilities[],
        fetchFn: typeof fetch = fetch,
    ): Promise<DiscoveredModelWithCapabilities[]> {
        try {
            const userModelsEndpoint = resolveOriginEndpoint(
                baseUrl,
                "/user/models",
            );
            const headers: Record<string, string> = {
                "Accept": "application/json",
            };
            if (apiKey.trim().length > 0) {
                headers["Authorization"] = `Bearer ${apiKey.trim()}`;
            }

            const res = await fetchFn(userModelsEndpoint, {
                method: "GET",
                headers,
                redirect: "error", // Deny credential-bearing redirects
                signal: AbortSignal.timeout(DEFAULT_EXTENDED_TIMEOUT_MS),
            });

            if (res.status >= 300 && res.status < 400) {
                // Deny redirect
                return standardModels;
            }

            if (res.ok) {
                const json = await res.json().catch(() => null);
                const extendedModels = normalizeRawModels(json);

                // MERGE extended models into standard models rather than replacing
                if (extendedModels.length > 0) {
                    const extendedMap = new Map(
                        extendedModels.map((m) => [m.id, m]),
                    );
                    const mergedResult: DiscoveredModelWithCapabilities[] = [];

                    for (const std of standardModels) {
                        const ext = extendedMap.get(std.id);
                        if (ext) {
                            extendedMap.delete(std.id);
                            mergedResult.push({
                                ...std,
                                displayName: ext.displayName &&
                                        ext.displayName !== ext.id
                                    ? ext.displayName
                                    : std.displayName,
                                reasoningCapability: ext.reasoningCapability
                                        .status !== "unknown"
                                    ? ext.reasoningCapability
                                    : std.reasoningCapability,
                                rawMetadata: {
                                    ...std.rawMetadata,
                                    ...ext.rawMetadata,
                                },
                            });
                        } else {
                            mergedResult.push(std);
                        }
                    }

                    // Append any additional models unique to the extended catalog
                    for (const remaining of extendedMap.values()) {
                        mergedResult.push(remaining);
                    }

                    return mergedResult;
                }
            }
        } catch {
            // Best effort fallback: ignore /user/models failure and keep standard models
        }

        return standardModels;
    }

    async discoverModels(
        baseUrl: string,
        apiKey: string,
        fetchFn: typeof fetch = fetch,
    ): Promise<DiscoveredModelWithCapabilities[]> {
        const standardAdapter = new OpenAICompatibleAdapter();
        const standardModels = await standardAdapter.discoverModels(
            baseUrl,
            apiKey,
            fetchFn,
        );
        return await this.enrichWithUserModels(
            baseUrl,
            apiKey,
            standardModels,
            fetchFn,
        );
    }
}

/**
 * Resolve provider capability adapter by discovery mode, baseUrl hints,
 * or observed /models metadata with explicit discriminator. Never blind-probes /user/models.
 */
export function resolveProviderAdapter(
    discoveryMode?: DiscoveryMode,
    baseUrl?: string,
    observedModels?: DiscoveredModelWithCapabilities[],
): ProviderCapabilityAdapter {
    if (discoveryMode === "cliproxyapi") {
        return new CLIProxyAPIHomeAdapter();
    }
    if (discoveryMode === "openai-compatible") {
        return new OpenAICompatibleAdapter();
    }

    // Auto mode: check baseUrl hint or explicit cliproxy metadata discriminator
    if (baseUrl && hasCLIProxyDiscriminator(baseUrl, observedModels)) {
        return new CLIProxyAPIHomeAdapter();
    }

    return new OpenAICompatibleAdapter();
}

/**
 * High-level model discovery: Auto is /models-first.
 * Only explicit CLIProxy discriminator metadata or URL hint triggers /user/models enrichment.
 * Explicit mode (options.discoveryMode === 'cliproxyapi') serves as fallback for local non-descriptive hosts.
 */
export async function discoverProviderModels(
    baseUrl: string,
    apiKey: string,
    options?: {
        discoveryMode?: DiscoveryMode;
        fetchFn?: typeof fetch;
    },
): Promise<DiscoveredModelWithCapabilities[]> {
    const mode = options?.discoveryMode ?? "auto";

    if (mode === "cliproxyapi") {
        const adapter = new CLIProxyAPIHomeAdapter();
        return await adapter.discoverModels(baseUrl, apiKey, options?.fetchFn);
    }

    // Standard /models is fetched first
    const standardAdapter = new OpenAICompatibleAdapter();
    const standardModels = await standardAdapter.discoverModels(
        baseUrl,
        apiKey,
        options?.fetchFn,
    );

    if (mode === "auto") {
        if (hasCLIProxyDiscriminator(baseUrl, standardModels)) {
            const cliAdapter = new CLIProxyAPIHomeAdapter();
            return await cliAdapter.enrichWithUserModels(
                baseUrl,
                apiKey,
                standardModels,
                options?.fetchFn,
            );
        }
    }

    return standardModels;
}
