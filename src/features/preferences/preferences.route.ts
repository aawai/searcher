import { STATUS_CODE } from "@std/http";
import { json, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import * as v from "@valibot/valibot";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { PreferencesService } from "./service.ts";
import { WallpaperService } from "../wallpaper/service.ts";
import { parseCookie } from "../auth/middleware.ts";
import { SESSION_COOKIE_NAME } from "../auth/service.ts";
import {
    ACCENT_IDS,
    CANONICAL_REASONING_EFFORTS,
} from "../../shared/contracts.ts";
const Engine = v.optional(
    v.picklist(["google", "bing", "baidu", "duckduckgo"]),
);
const Theme = v.optional(v.picklist(["system", "light", "dark"]));
const Style = v.optional(
    v.picklist([
        "command",
        "zen",
        "widgets",
        "quiet",
        "minimal",
        "glass",
        "soft",
        "classic",
    ]),
);
const Accent = v.optional(v.picklist(ACCENT_IDS));
const Shape = v.optional(v.picklist(["rounded", "pill"]));
const SearchOpacity = v.optional(
    v.pipe(v.number(), v.finite(), v.minValue(0.1), v.maxValue(1)),
);
const Target = v.optional(v.picklist(["same", "new"]));
const HistoryEnabled = v.optional(v.boolean("搜索历史开关必须为布尔值"));
const WebAppHomeLimit = v.optional(v.picklist([8, 12, 16, "all"]));
const WebAppIconSize = v.optional(v.picklist(["compact", "default", "large"]));
const ShowAppLabels = v.optional(v.boolean("显示应用标签必须为布尔值"));
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

const GenerationConfig = v.object({
    temperature: v.optional(
        v.nullable(
            v.pipe(
                v.number("temperature 必须为数值"),
                v.finite("temperature 必须为有限数值"),
                v.minValue(0, "temperature 最小为 0"),
                v.maxValue(2, "temperature 最大为 2"),
            ),
        ),
    ),
    topP: v.optional(
        v.nullable(
            v.pipe(
                v.number("topP 必须为数值"),
                v.finite("topP 必须为有限数值"),
                v.minValue(0, "topP 最小为 0"),
                v.maxValue(1, "topP 最大为 1"),
            ),
        ),
    ),
    maxTokens: v.optional(
        v.nullable(
            v.pipe(
                v.number("maxTokens 必须为整数"),
                v.integer("maxTokens 必须为整数"),
                v.minValue(1, "maxTokens 最小为 1"),
            ),
        ),
    ),
    reasoningEffort: v.optional(
        v.nullable(v.picklist(CANONICAL_REASONING_EFFORTS, "推理强度无效")),
    ),
});

const AiGenerationDefaults = v.optional(
    v.nullable(
        v.object({
            default: v.optional(v.nullable(GenerationConfig)),
            models: v.optional(
                v.nullable(v.record(v.string(), v.nullable(GenerationConfig))),
            ),
        }),
    ),
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
            searchOpacity: json(SearchOpacity),
            searchTarget: json(Target),
            searchHistoryEnabled: json(HistoryEnabled),
            webAppHomeLimit: json(WebAppHomeLimit),
            webAppIconSize: json(WebAppIconSize),
            showAppLabels: json(ShowAppLabels),
            backgroundImage: json(BackgroundImage),
            wallpaperBlur: json(Blur),
            wallpaperGrayscale: json(Grayscale),
            wallpaperMask: json(Mask),
            aiGenerationDefaults: json(AiGenerationDefaults),
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
