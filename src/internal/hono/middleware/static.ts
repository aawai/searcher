import { serveStatic } from "hono/deno";
import { etag } from "hono/etag";
import type { MiddlewareHandler } from "hono";

/** Only ETag files actually served here; downstream API responses never enter. */
export function serveCachedStatic(
    options: Parameters<typeof serveStatic>[0],
): MiddlewareHandler {
    const serve = serveStatic(options);
    const cache = etag();
    return async (c, next) => {
        if (c.req.method !== "GET" && c.req.method !== "HEAD") {
            return await next();
        }
        const served = await serve(c, async () => {});
        if (served) c.res = served;
        if (!c.finalized) return await next();
        await cache(c, async () => {});
        return c.res;
    };
}
