import { STATUS_CODE } from "@std/http";
import { json, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import * as v from "@valibot/valibot";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { PreferencesService } from "./service.ts";
import { WallpaperService } from "../wallpaper/service.ts";
import { parseCookie } from "../auth/middleware.ts";
import { SESSION_COOKIE_NAME } from "../auth/service.ts";
const Engine = v.optional(
    v.picklist(["google", "bing", "baidu", "duckduckgo"]),
);
const Theme = v.optional(v.picklist(["system", "light", "dark"]));
const Style = v.optional(
    v.picklist(["quiet", "minimal", "glass", "soft", "classic"]),
);
const Accent = v.optional(
    v.picklist(["blue", "cyan", "teal", "violet", "orange", "mono"]),
);
const Shape = v.optional(v.picklist(["rounded", "pill"]));
const Target = v.optional(v.picklist(["same", "new"]));
const HistoryEnabled = v.optional(v.boolean("搜索历史开关必须为布尔值"));
const WebAppHomeLimit = v.optional(v.picklist([8, 12, 16, "all"]));
const WebAppIconSize = v.optional(v.picklist(["compact", "default", "large"]));
const BackgroundImage = v.optional(v.nullable(v.pipe(
    v.string(),
    v.maxLength(2048),
    v.check((value) => {
        if (
            /^\/api\/wallpaper\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
                .test(value)
        ) return true;
        try {
            const url = new URL(value);
            return url.protocol === "https:" && !url.username && !url.password;
        } catch {
            return false;
        }
    }, "壁纸必须是 HTTPS 地址或本人上传的壁纸"),
)));
const Blur = v.optional(
    v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(24)),
);
const Grayscale = v.optional(
    v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1)),
);
const Mask = v.optional(
    v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(0.8)),
);

export function registerPreferencesRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
): void {
    const service = new PreferencesService(deps.store, deps.settings);
    const wallpaper = deps.wallpaper ?? new WallpaperService();
    routes.public.get("/api/preferences", async (c) => {
        const cookieHeader = c.req.header("cookie");
        const token = parseCookie(cookieHeader, SESSION_COOKIE_NAME);
        let user = null;
        if (token) {
            user = await deps.auth.authenticateSessionToken(token, {
                updateActivity: false,
            });
        }
        if (user) {
            return c.success(await service.get(user.id));
        }
        return c.success(await service.getDefaults());
    });
    routes.patch(
        "/api/preferences",
        validator({
            defaultEngine: json(Engine),
            theme: json(Theme),
            style: json(Style),
            accent: json(Accent),
            searchShape: json(Shape),
            searchTarget: json(Target),
            searchHistoryEnabled: json(HistoryEnabled),
            webAppHomeLimit: json(WebAppHomeLimit),
            webAppIconSize: json(WebAppIconSize),
            backgroundImage: json(BackgroundImage),
            wallpaperBlur: json(Blur),
            wallpaperGrayscale: json(Grayscale),
            wallpaperMask: json(Mask),
        }),
        async (c, data) => {
            if (
                Object.values(data).every((value) => value === undefined)
            ) return c.fail(STATUS_CODE.BadRequest, "至少修改一项偏好");
            const user = c.get("user");
            if (data.backgroundImage?.startsWith("/api/wallpaper/")) {
                const id = data.backgroundImage.slice("/api/wallpaper/".length);
                if (!await wallpaper.getWallpaper(id, user.id)) {
                    return c.fail(
                        STATUS_CODE.NotFound,
                        "壁纸不存在或无权访问",
                    );
                }
            }
            const updated = await service.update(user.id, data);
            return c.success(updated);
        },
    );
}
