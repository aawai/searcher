import type { Context, Next } from "hono";
import { getConnInfo } from "hono/deno";
import { failResponse } from "@internal/hono/middleware/response.ts";
import { resolveBodyPolicy } from "@internal/hono/body-policy.ts";

export interface RateLimiterOptions {
    windowMs: number;
    maxRequests: number;
    maxEntries?: number;
    now?: () => number;
}

interface WindowBucket {
    count: number;
    resetAt: number;
}

export class InMemoryRateLimiter {
    readonly #windowMs: number;
    readonly #maxRequests: number;
    readonly #maxEntries: number;
    readonly #now: () => number;
    readonly #entries = new Map<string, WindowBucket>();

    constructor(options: RateLimiterOptions) {
        this.#windowMs = options.windowMs;
        this.#maxRequests = options.maxRequests;
        this.#maxEntries = options.maxEntries ?? 10000;
        this.#now = options.now ?? (() => Date.now());
    }

    #cleanup(currentTime: number): void {
        for (const [key, bucket] of this.#entries.entries()) {
            if (bucket.resetAt <= currentTime) {
                this.#entries.delete(key);
            }
        }
    }

    consume(key: string): { ok: boolean; retryAfter: number } {
        const currentTime = this.#now();
        const existing = this.#entries.get(key);

        if (existing) {
            if (existing.resetAt <= currentTime) {
                existing.count = 1;
                existing.resetAt = currentTime + this.#windowMs;
                return { ok: true, retryAfter: 0 };
            }
            if (existing.count >= this.#maxRequests) {
                const retryAfter = Math.max(
                    1,
                    Math.ceil((existing.resetAt - currentTime) / 1000),
                );
                return { ok: false, retryAfter };
            }
            existing.count += 1;
            return { ok: true, retryAfter: 0 };
        }

        if (this.#entries.size >= this.#maxEntries) {
            this.#cleanup(currentTime);
        }

        if (this.#entries.size >= this.#maxEntries) {
            return { ok: false, retryAfter: Math.ceil(this.#windowMs / 1000) };
        }

        this.#entries.set(key, {
            count: 1,
            resetAt: currentTime + this.#windowMs,
        });
        return { ok: true, retryAfter: 0 };
    }
}

export function getClientIp(c: Context): string {
    try {
        const connInfo = getConnInfo(c);
        if (connInfo?.remote?.address) {
            return connInfo.remote.address;
        }
    } catch {
        // Fallback for direct unit tests or non-Deno connection info
    }
    return "127.0.0.1";
}

const MUTATING_METHODS: Record<string, true> = {
    POST: true,
    PATCH: true,
    PUT: true,
    DELETE: true,
};

export function createApiSecurityMiddleware(options: {
    origin: string;
}) {
    const expectedOrigin = options.origin;

    return async function apiSecurityMiddleware(c: Context, next: Next) {
        c.header("Cache-Control", "no-store");

        const method = c.req.method.toUpperCase();
        if (MUTATING_METHODS[method]) {
            const reqOrigin = c.req.header("origin");
            if (!reqOrigin || reqOrigin !== expectedOrigin) {
                return failResponse(c, 403, "Origin 校验失败，禁止跨站请求");
            }
            const policy = resolveBodyPolicy(method, c.req.path);
            const contentLengthHeader = c.req.header("content-length");
            const contentLength = contentLengthHeader
                ? parseInt(contentLengthHeader, 10)
                : 0;
            const contentType = c.req.header("content-type");
            const hasBody =
                (contentLengthHeader !== undefined && contentLength > 0) ||
                (contentType !== undefined && contentType.trim().length > 0);

            if (hasBody) {
                if (policy.bodyType === "multipart") {
                    if (
                        !contentType ||
                        !contentType.toLowerCase().startsWith(
                            "multipart/form-data",
                        )
                    ) {
                        return failResponse(
                            c,
                            415,
                            "不支持的 Content-Type，仅接受 multipart/form-data",
                        );
                    }
                } else {
                    if (
                        !contentType ||
                        !contentType.toLowerCase().includes("application/json")
                    ) {
                        return failResponse(
                            c,
                            415,
                            "不支持的 Content-Type，仅接受 application/json",
                        );
                    }
                }
            }
        }

        await next();
    };
}
