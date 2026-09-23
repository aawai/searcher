import type { Context } from "hono";
import { HTTPException as HonoHTTPException } from "hono/http-exception";
import { STATUS_CODE } from "@std/http";
import { logger } from "@logger";
import { HttpException } from "@internal/http/error.ts";
import {
    type ErrorStatusCode,
    failResponse,
    isErrorStatusCode,
} from "./middleware/response.ts";
const STRIPPED_RESPONSE_HEADERS: Record<string, true> = {
    "content-type": true,
    "content-length": true,
    "content-encoding": true,
    "content-language": true,
    "content-range": true,
    "content-location": true,
    "content-md5": true,
    "transfer-encoding": true,
    "etag": true,
    "digest": true,
    "last-modified": true,
};

function copySemanticHeaders(source: Response, target: Response): void {
    for (const [key, value] of source.headers.entries()) {
        const lower = key.toLowerCase();
        if (STRIPPED_RESPONSE_HEADERS[lower] || lower.startsWith("content-")) {
            continue;
        }
        target.headers.set(key, value);
    }
}

export function notFoundResponse(c: Context): Response {
    return failResponse(c, STATUS_CODE.NotFound, "Not Found");
}

export function errorResponse(err: unknown, c: Context): Response {
    const request = { method: c.req.method, path: c.req.path };
    if (err instanceof HonoHTTPException) {
        const code = isErrorStatusCode(err.status)
            ? err.status
            : STATUS_CODE.InternalServerError;
        logger.info({ ...request, status: code, errorType: "http" });
        const res = failResponse(c, code, err.message);
        if (err.res) copySemanticHeaders(err.res, res);
        return res;
    }

    if (err instanceof HttpException) {
        const code = isErrorStatusCode(err.statusCode)
            ? (err.statusCode as ErrorStatusCode)
            : STATUS_CODE.InternalServerError;
        logger.info({ ...request, status: code, errorType: err.name });
        return failResponse(c, code, err.message);
    }

    logger.error({ ...request, status: 500, errorType: "unknown" });
    return failResponse(
        c,
        STATUS_CODE.InternalServerError,
        "Internal Server Error",
    );
}
