import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "hono/deno";
import { Routes } from "@internal/hono/routes.ts";
import { responseMiddleware } from "@internal/hono/middleware/response.ts";
import { loggerMiddleware } from "@internal/hono/middleware/logger.ts";
import { errorResponse, notFoundResponse } from "@internal/hono/error.ts";
import { createSessionMiddleware } from "./features/auth/middleware.ts";
import { createApiSecurityMiddleware } from "./features/auth/security.ts";
import { registerAuthRoutes } from "./features/auth/auth.route.ts";
import { registerUserRoutes } from "./features/users/users.route.ts";
import { registerBookmarksRoutes } from "./features/bookmarks/bookmarks.route.ts";
import { registerNotesRoutes } from "./features/notes/notes.route.ts";
import { registerPreferencesRoutes } from "./features/preferences/preferences.route.ts";
import type { AppDeps, AppEnv } from "./serve/env.ts";

const frontend = new URL("../web/dist/", import.meta.url);
const frontendPath = decodeURIComponent(frontend.pathname);

export function createApp(deps: AppDeps): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    app.use("*", responseMiddleware);
    app.onError(errorResponse);
    app.notFound(notFoundResponse);
    app.use(
        "*",
        loggerMiddleware(
            Deno.env.get("NODE_ENV") === "test" ? false : "console",
        ),
    );
    app.use("/api/*", bodyLimit({ maxSize: 64 * 1024 }));
    app.use("/api/*", createApiSecurityMiddleware({ origin: deps.origin }));

    const routes = new Routes<AppEnv>();
    registerAuthRoutes(routes, deps);
    registerUserRoutes(routes, deps);
    registerBookmarksRoutes(routes, deps);
    registerNotesRoutes(routes, deps);
    registerPreferencesRoutes(routes, deps);
    routes.mount(app, [createSessionMiddleware(deps.auth)]);

    app.on(["GET", "HEAD"], "/assets/*", serveStatic({ root: frontendPath }));
    app.on(["GET", "HEAD"], ["/", "/admin/users"], async (c) => {
        const html = await Deno.readTextFile(`${frontendPath}/index.html`);
        c.header("Cache-Control", "no-cache");
        return c.html(html);
    });
    return app;
}
