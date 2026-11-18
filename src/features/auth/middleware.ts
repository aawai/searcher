import type { Context, MiddlewareHandler } from "hono";
import { failResponse } from "@internal/hono/middleware/response.ts";
import type { AppEnv } from "../../serve/env.ts";
import { AuthService } from "./service.ts";

export function parseCookie(
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
        const requestOrigin = c.req.header("origin");
        const requestHost = c.req.header("host");
        const cookieName = authService.getSessionCookieName(
            requestOrigin,
            requestHost,
        );
        const token = parseCookie(cookieHeader, cookieName);

        if (!token) {
            c.header(
                "Set-Cookie",
                authService.buildClearSessionCookieHeader(
                    requestOrigin,
                    requestHost,
                ),
            );
            return failResponse(c, 401, "未登录或登录已失效");
        }

        const user = await authService.authenticateSessionToken(token, {
            updateActivity: true,
        });
        if (!user) {
            c.header(
                "Set-Cookie",
                authService.buildClearSessionCookieHeader(
                    requestOrigin,
                    requestHost,
                ),
            );
            return failResponse(c, 401, "未登录或登录已失效");
        }

        c.set("user", user);
        c.set("sessionToken", token);

        await next();
    };
}
