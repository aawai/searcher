import { STATUS_CODE } from "@std/http";
import type { Context, Next } from "hono";
import type {
    ClientErrorStatusCode,
    ServerErrorStatusCode,
} from "hono/utils/http-status";
import type { TypedResponse } from "hono/types";

export type ErrorStatusCode = ClientErrorStatusCode | ServerErrorStatusCode;

export interface SuccessEnvelope<T = unknown> {
    code: typeof STATUS_CODE.OK;
    data?: T;
    message?: string;
    status: true;
}

export interface FailEnvelope<T = unknown> {
    code: ErrorStatusCode;
    data?: T;
    message: string;
    status: false;
}

declare module "hono" {
    interface Context {
        success: <T = unknown>(
            data?: T,
            message?: string,
        ) => Response & TypedResponse<SuccessEnvelope<T>, 200, "json">;
        fail: <T = unknown>(
            code: ErrorStatusCode,
            message: string,
            data?: T,
        ) => Response & TypedResponse<FailEnvelope<T>, ErrorStatusCode, "json">;
    }
}

export function isErrorStatusCode(code: number): code is ErrorStatusCode {
    return Number.isInteger(code) && code >= 400 && code <= 599;
}

export function failResponse<T = unknown>(
    c: Context,
    code: ErrorStatusCode,
    message: string,
    data?: T,
): Response & TypedResponse<FailEnvelope<T>, ErrorStatusCode, "json"> {
    if (!isErrorStatusCode(code)) {
        throw new RangeError(
            `Invalid HTTP error status code: ${code}. Expected 4xx or 5xx.`,
        );
    }

    const body: FailEnvelope<T> = { code, message, status: false };
    if (data !== undefined) {
        body.data = data;
    }

    return c.json<FailEnvelope<T>, ErrorStatusCode>(body, code);
}

export async function responseMiddleware(c: Context, next: Next) {
    c.success = function <T = unknown>(
        data?: T,
        message?: string,
    ) {
        return c.json<SuccessEnvelope<T>, 200>(
            { code: STATUS_CODE.OK, data, message, status: true },
            STATUS_CODE.OK,
        );
    };

    c.fail = function <T = unknown>(
        code: ErrorStatusCode,
        message: string,
        data?: T,
    ) {
        return failResponse(c, code, message, data);
    };

    await next();
}
