import type { Envelope } from "@shared/contracts.ts";
export class ApiError extends Error {
    constructor(
        readonly code: number,
        message: string,
        readonly data?: unknown,
    ) {
        super(message);
    }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (typeof init.body === "string" && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    const response = await fetch(path, {
        ...init,
        headers,
        credentials: "same-origin",
    });
    const result: Envelope<T> | undefined =
        response.headers.get("content-type")?.includes("application/json")
            ? await response.json()
            : undefined;
    if (response.status === 401) {
        globalThis.dispatchEvent(new Event("searcher:auth-expired"));
    }
    if (!response.ok || !result?.status) {
        throw new ApiError(
            response.status,
            result?.message ?? "请求失败",
            result?.data,
        );
    }
    return result.data as T;
}
export function json(method: string, body: unknown): RequestInit {
    return { method, body: JSON.stringify(body) };
}
