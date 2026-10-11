import { Hono } from "hono";
import { createBodyLimitMiddleware } from "@internal/hono/body-policy.ts";
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
import { registerDocumentsRoutes } from "./features/documents/documents.route.ts";
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

export interface CreateAppOptions {
    frontendPath?: string;
}

export function createApp(
    deps: AppDeps,
    options?: CreateAppOptions,
): Hono<AppEnv> {
    const staticRoot = (options?.frontendPath ?? frontendPath).replace(
        /\/+$/,
        "",
    );
    const settingsStore = deps.settings ?? new SystemSettingsStore();
    const wallpaperService = deps.wallpaper ??
        new WallpaperService(undefined, undefined, undefined, deps.store);
    if (!wallpaperService.store && deps.store) {
        wallpaperService.setStore(deps.store);
    }
    const sharedDeps: AppDeps = {
        ...deps,
        wallpaper: wallpaperService,
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
    app.use("/api/*", createBodyLimitMiddleware());
    app.use("/api/*", createApiSecurityMiddleware({ origin: deps.origin }));

    const routes = new Routes<AppEnv>();
    registerAuthRoutes(routes, sharedDeps);
    registerUserRoutes(routes, sharedDeps);
    registerBookmarksRoutes(routes, deps);
    registerNotesRoutes(routes, deps);
    registerDocumentsRoutes(routes, deps);
    registerPreferencesRoutes(routes, sharedDeps);
    registerWallpaperRoutes(routes, sharedDeps);
    registerAiRoutes(routes, deps);
    registerAuditRoutes(routes, deps);
    registerSearchRoutes(routes, sharedDeps);
    registerWebAppIconsRoutes(routes, sharedDeps);
    registerSystemRoutes(routes, sharedDeps, systemService);
    routes.mount(app, [createSessionMiddleware(deps.auth)]);
    app.on(
        ["GET", "HEAD"],
        "/assets/*",
        serveStatic({
            root: staticRoot,
            onFound: (_path, c) => {
                // Vite's default content hashes use base64url characters.
                const filename = c.req.path.slice(
                    c.req.path.lastIndexOf("/") + 1,
                );
                const versioned =
                    /^.+-[A-Za-z0-9_-]{8,}\.(?:js|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf)$/
                        .test(filename);
                c.header(
                    "Cache-Control",
                    versioned
                        ? "public, max-age=31536000, immutable"
                        : "no-cache",
                );
            },
        }),
    );
    app.all("/assets/*", (c) => c.text("Not Found", 404));
    app.all("/assets", (c) => c.text("Not Found", 404));

    app.on(["GET", "HEAD"], "*", async (c) => {
        const path = c.req.path;
        if (path === "/api" || path.startsWith("/api/")) {
            return notFoundResponse(c);
        }
        const html = await Deno.readTextFile(`${staticRoot}/index.html`);
        c.header("Cache-Control", "no-cache");
        return c.html(html);
    });
    return app;
}
