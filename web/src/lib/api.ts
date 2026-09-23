import type { Envelope } from "@shared/contracts.ts";

export class ApiError extends Error {
    constructor(
        public readonly code: number,
        message: string,
        public readonly data?: unknown,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

let onUnauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
    onUnauthorizedHandler = handler;
}

export async function apiFetch<T>(
    endpoint: string,
    options: RequestInit = {},
): Promise<T> {
    const headers = new Headers(options.headers || {});

    if (
        options.body && typeof options.body === "string" &&
        !headers.has("Content-Type")
    ) {
        headers.set("Content-Type", "application/json");
    }

    const response = await fetch(endpoint, {
        ...options,
        headers,
        credentials: "same-origin",
    });

    if (response.status === 401) {
        if (onUnauthorizedHandler) {
            onUnauthorizedHandler();
        }
    }

    let envelope: Envelope<T> | null = null;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        try {
            envelope = await response.json();
        } catch {
            // ignore json parse error
        }
    }

    if (!response.ok) {
        const errorMsg = envelope?.message || `请求失败 (${response.status})`;
        throw new ApiError(response.status, errorMsg, envelope?.data);
    }

    if (envelope) {
        return envelope.data as T;
    }

    return undefined as unknown as T;
}
