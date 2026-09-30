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
import { registerWallpaperRoutes } from "./features/wallpaper/wallpaper.route.ts";
import { registerAiRoutes } from "./features/ai/ai.route.ts";
import { registerAuditRoutes } from "./features/audit/audit.route.ts";
import { registerSearchRoutes } from "./features/search/search.route.ts";
import { registerWebAppIconsRoutes } from "./features/webapp-icons/webapp-icons.route.ts";
import { registerSystemRoutes } from "./features/system/system.route.ts";
import { SystemService } from "./features/system/service.ts";
import { SystemSettingsStore } from "./features/system/settings-store.ts";
import { WebAppIconService } from "./features/webapp-icons/service.ts";
import { WallpaperService } from "./features/wallpaper/service.ts";
import type { AppDeps, AppEnv } from "./serve/env.ts";

const frontend = new URL("../web/dist/", import.meta.url);
const frontendPath = decodeURIComponent(frontend.pathname);

export function createApp(deps: AppDeps): Hono<AppEnv> {
    const settingsStore = deps.settings ?? new SystemSettingsStore();
    const sharedDeps: AppDeps = {
        ...deps,
        wallpaper: deps.wallpaper ?? new WallpaperService(),
        icons: deps.icons ?? new WebAppIconService(),
        settings: settingsStore,
    };
    const systemService = new SystemService({
        store: sharedDeps.store,
        settingsStore,
        wallpaperService: sharedDeps.wallpaper,
        iconService: sharedDeps.icons,
        now: sharedDeps.now,
    });
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
    app.use("/api/*", async (c, next) => {
        const isIconUpload = c.req.path === "/api/webapp-icons/upload" &&
            c.req.method.toUpperCase() === "POST";
        if (
            isIconUpload ||
            (c.req.path === "/api/wallpaper" &&
                c.req.method.toUpperCase() === "POST") ||
            (c.req.path.startsWith("/api/admin/backup/") &&
                c.req.method.toUpperCase() === "POST")
        ) {
            return await bodyLimit({
                maxSize: isIconUpload
                    ? 2 * 1024 * 1024 + 64 * 1024
                    : 50 * 1024 * 1024,
                onError: (c) => c.fail(413, "上传文件大小超过限制"),
            })(c, next);
        }
        return await bodyLimit({
            maxSize: 64 * 1024,
            onError: (c) => c.fail(413, "请求体超过 64 KiB 上限"),
        })(c, next);
    });
    app.use("/api/*", createApiSecurityMiddleware({ origin: deps.origin }));

    const routes = new Routes<AppEnv>();
    registerAuthRoutes(routes, sharedDeps);
    registerUserRoutes(routes, sharedDeps);
    registerBookmarksRoutes(routes, deps);
    registerNotesRoutes(routes, deps);
    registerPreferencesRoutes(routes, sharedDeps);
    registerWallpaperRoutes(routes, sharedDeps);
    registerAiRoutes(routes, deps);
    registerAuditRoutes(routes, deps);
    registerSearchRoutes(routes, sharedDeps);
    registerWebAppIconsRoutes(routes, sharedDeps);
    registerSystemRoutes(routes, sharedDeps, systemService);
    routes.mount(app, [createSessionMiddleware(deps.auth)]);
    app.on(["GET", "HEAD"], "/assets/*", serveStatic({ root: frontendPath }));
    app.on(["GET", "HEAD"], [
        "/",
        "/ask",
        "/settings",
        "/login",
        "/register",
        "/design-lab",
        "/admin",
        "/account",
        "/trash",
    ], async (c) => {
        const html = await Deno.readTextFile(`${frontendPath}/index.html`);
        c.header("Cache-Control", "no-cache");
        return c.html(html);
    });
    return app;
}
