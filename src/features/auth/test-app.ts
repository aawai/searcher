import { Routes } from "@internal/hono/routes.ts";
import { Hono } from "hono";
import { responseMiddleware } from "@internal/hono/middleware/response.ts";
import { createSessionMiddleware } from "./middleware.ts";
import { createApiSecurityMiddleware } from "./security.ts";
import { registerAuthRoutes } from "./auth.route.ts";
import { registerUserRoutes } from "../users/users.route.ts";
import { registerAuditRoutes } from "../audit/audit.route.ts";
import { AuditService } from "../audit/service.ts";
import type { AppDeps, AppEnv } from "../../serve/env.ts";

export function createAuthTestApp(deps: AppDeps): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    app.use("*", responseMiddleware);
    app.use("/api/*", createApiSecurityMiddleware({ origin: deps.origin }));

    const audit = new AuditService({ store: deps.store, now: deps.now });
    const routes = new Routes<AppEnv>();
    registerAuthRoutes(routes, deps);
    registerUserRoutes(routes, deps, audit);
    registerAuditRoutes(routes, deps, audit);

    routes.mount(app, [createSessionMiddleware(deps.auth)]);
    return app;
}
