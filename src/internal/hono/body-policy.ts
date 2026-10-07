import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { failResponse } from "./middleware/response.ts";
import {
    DOCUMENT_ASSET_MAX_BYTES,
    DOCUMENT_JSON_MAX_BYTES,
} from "../../shared/documents.ts";

export type BodyType = "json" | "multipart";

export interface BodyPolicy {
    readonly maxSize: number;
    readonly limitMessage: string;
    readonly bodyType: BodyType;
}

export const JSON_DEFAULT_MAX_SIZE = 64 * 1024; // 64 KiB
export const AI_CHAT_STREAM_MAX_SIZE = 32 * 1024 * 1024; // 32 MiB
export const WEBAPP_ICON_UPLOAD_MAX_SIZE = 2 * 1024 * 1024 + 64 * 1024; // 2 MiB + 64 KiB
export const UPLOAD_LARGE_MAX_SIZE = 50 * 1024 * 1024; // 50 MiB

export const MSG_JSON_LIMIT = "请求体超过 64 KiB 上限";
export const MSG_AI_STREAM_LIMIT = "AI 请求体超过 32 MiB 上限";
export const MSG_UPLOAD_LIMIT = "上传文件大小超过限制";

export const DEFAULT_BODY_POLICY: BodyPolicy = {
    maxSize: JSON_DEFAULT_MAX_SIZE,
    limitMessage: MSG_JSON_LIMIT,
    bodyType: "json",
};

export const AI_CHAT_STREAM_POLICY: BodyPolicy = {
    maxSize: AI_CHAT_STREAM_MAX_SIZE,
    limitMessage: MSG_AI_STREAM_LIMIT,
    bodyType: "json",
};

export const WEBAPP_ICON_UPLOAD_POLICY: BodyPolicy = {
    maxSize: WEBAPP_ICON_UPLOAD_MAX_SIZE,
    limitMessage: MSG_UPLOAD_LIMIT,
    bodyType: "multipart",
};

export const LARGE_UPLOAD_POLICY: BodyPolicy = {
    maxSize: UPLOAD_LARGE_MAX_SIZE,
    limitMessage: MSG_UPLOAD_LIMIT,
    bodyType: "multipart",
};

export const DOCUMENT_JSON_POLICY: BodyPolicy = {
    maxSize: DOCUMENT_JSON_MAX_BYTES,
    limitMessage: "文档请求体超过 8 MiB 上限",
    bodyType: "json",
};
export const DOCUMENT_ASSET_UPLOAD_POLICY: BodyPolicy = {
    maxSize: DOCUMENT_ASSET_MAX_BYTES + JSON_DEFAULT_MAX_SIZE,
    limitMessage: "文档图片超过 10 MiB 上限",
    bodyType: "multipart",
};

/**
 * Resolve the body policy for a given HTTP request.
 */
export function resolveBodyPolicy(method: string, path: string): BodyPolicy {
    const normalizedMethod = method.toUpperCase();
    const cleanPath = path.length > 1 && path.endsWith("/")
        ? path.slice(0, -1)
        : path;

    if (
        (normalizedMethod === "POST" && cleanPath === "/api/documents") ||
        (normalizedMethod === "PATCH" &&
            /^\/api\/documents\/[^/]+$/.test(cleanPath))
    ) return DOCUMENT_JSON_POLICY;
    if (
        normalizedMethod === "POST" &&
        /^\/api\/documents\/[^/]+\/assets$/.test(cleanPath)
    ) {
        return DOCUMENT_ASSET_UPLOAD_POLICY;
    }
    if (normalizedMethod === "POST") {
        if (cleanPath === "/api/ai/chat/stream") {
            return AI_CHAT_STREAM_POLICY;
        }
        if (cleanPath === "/api/webapp-icons/upload") {
            return WEBAPP_ICON_UPLOAD_POLICY;
        }
        if (
            cleanPath === "/api/wallpaper" ||
            cleanPath.startsWith("/api/admin/backup/")
        ) {
            return LARGE_UPLOAD_POLICY;
        }
    }

    return DEFAULT_BODY_POLICY;
}

/**
 * Creates the Hono bodyLimit middleware configured according to body policies.
 * Body limit is the single byte enforcement mechanism in the pipeline.
 */
export function createBodyLimitMiddleware(): MiddlewareHandler {
    return async function bodyLimitMiddleware(c, next) {
        const policy = resolveBodyPolicy(c.req.method, c.req.path);
        return await bodyLimit({
            maxSize: policy.maxSize,
            onError: (c) => {
                if (typeof c.fail === "function") {
                    return c.fail(413, policy.limitMessage);
                }
                return failResponse(c, 413, policy.limitMessage);
            },
        })(c, next);
    };
}
