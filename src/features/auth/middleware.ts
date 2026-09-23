import type { Context, MiddlewareHandler } from "hono";
import { failResponse } from "@internal/hono/middleware/response.ts";
import type { AppEnv } from "../../serve/env.ts";
import { AuthService, SESSION_COOKIE_NAME } from "./service.ts";

function parseCookie(
    cookieHeader: string | undefined,
    name: string,
): string | undefined {
    if (!cookieHeader) return undefined;
    const cookies = cookieHeader.split(";");
    for (const cookie of cookies) {
        const trimmed = cookie.trim();
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx);
        if (key === name) {
            return trimmed.slice(eqIdx + 1);
        }
    }
    return undefined;
}

export function createSessionMiddleware(
    authService: AuthService,
): MiddlewareHandler<AppEnv> {
    return async function sessionMiddleware(c: Context<AppEnv>, next) {
        const cookieHeader = c.req.header("cookie");
        const token = parseCookie(cookieHeader, SESSION_COOKIE_NAME);

        if (!token) {
            c.header("Set-Cookie", authService.buildClearSessionCookieHeader());
            return failResponse(c, 401, "未登录或登录已失效");
        }

        const user = await authService.authenticateSessionToken(token);
        if (!user) {
            c.header("Set-Cookie", authService.buildClearSessionCookieHeader());
            return failResponse(c, 401, "未登录或登录已失效");
        }

        c.set("user", user);
        c.set("sessionToken", token);

        await next();
    };
}
