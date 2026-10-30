import { STATUS_CODE } from "@std/http";
import { json, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import * as v from "@valibot/valibot";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { PreferencesService, PreferencesValidationError } from "./service.ts";
import { WallpaperService } from "../wallpaper/service.ts";
import { parseCookie } from "../auth/middleware.ts";
import { SESSION_COOKIE_NAME } from "../auth/service.ts";
import {
    ACCENT_PREFERENCES,
    CANONICAL_REASONING_EFFORTS,
    GLASS_INTENSITIES,
} from "../../shared/contracts.ts";
import { DOCK_SYSTEM_IDS } from "../../shared/dock.ts";
import {
    normalizeWallpaperPresentation,
    type WallpaperPresentation,
} from "../../shared/wallpaper-presentation.ts";
import {
    parseWallpaperSource,
    type WallpaperComposition,
} from "../../shared/wallpaper.ts";
const Engine = v.optional(
    v.picklist(["google", "bing", "baidu", "duckduckgo"]),
);
const Theme = v.optional(v.picklist(["system", "light", "dark"]));
const Accent = v.optional(v.picklist(ACCENT_PREFERENCES));
const Shape = v.optional(v.picklist(["rounded", "pill"]));
const GlassIntensity = v.optional(v.picklist(GLASS_INTENSITIES));
const Target = v.optional(v.picklist(["same", "new"]));
const HistoryEnabled = v.optional(v.boolean("搜索历史开关必须为布尔值"));
const ShowHomeApps = v.optional(v.boolean("首页显示应用必须为布尔值"));
const ShowHomeAppPlate = v.optional(v.boolean("首页应用底板必须为布尔值"));
const ShowHomeDate = v.optional(v.boolean("首页显示日期必须为布尔值"));
const ShowHomeTime = v.optional(v.boolean("首页显示时间必须为布尔值"));
const ShowHomeContinue = v.optional(v.boolean("首页显示继续必须为布尔值"));
const ShowAppLabels = v.optional(v.boolean("显示应用名称必须为布尔值"));
const DockSchema = v.optional(
    v.nullable(
        v.object({
            systemOrder: v.optional(
                v.array(
                    v.picklist(DOCK_SYSTEM_IDS, "系统入口无效"),
                ),
            ),
            hiddenSystemIds: v.optional(
                v.array(
                    v.picklist(DOCK_SYSTEM_IDS, "系统入口无效"),
                ),
            ),
            appIds: v.optional(v.array(v.string())),
        }),
    ),
);
const BackgroundImage = v.optional(v.nullable(v.pipe(
    v.string(),
    v.maxLength(2048),
    v.check((value) => {
        return parseWallpaperSource(value) !== null;
    }, "壁纸必须是 HTTPS 地址或本人上传的壁纸"),
)));
const WallpaperCompositions = v.optional(
    v.nullable(
        v.record(
            v.pipe(
                v.string(),
                v.maxLength(2048),
                v.check(
                    (val) => parseWallpaperSource(val) !== null,
                    "壁纸构图 source 格式非法",
                ),
            ),
            v.object({
                focalX: v.pipe(
                    v.number("focalX 必须为数值"),
                    v.finite("focalX 必须为有限数值"),
                    v.minValue(0, "focalX 最小为 0"),
                    v.maxValue(1, "focalX 最大为 1"),
                ),
                focalY: v.pipe(
                    v.number("focalY 必须为数值"),
                    v.finite("focalY 必须为有限数值"),
                    v.minValue(0, "focalY 最小为 0"),
                    v.maxValue(1, "focalY 最大为 1"),
                ),
            }),
        ),
    ),
);
const WallpaperPresentations = v.optional(
    v.nullable(
        v.record(
            v.pipe(
                v.string(),
                v.maxLength(2048),
                v.check(
                    (val) =>
                        val.startsWith("data:") ||
                        parseWallpaperSource(val) !== null,
                    "壁纸效果 source 格式非法",
                ),
            ),
            v.object({
                composition: v.optional(
                    v.object({
                        focalX: v.pipe(
                            v.number("focalX 必须为数值"),
                            v.finite("focalX 必须为有限数值"),
                            v.minValue(0, "focalX 最小为 0"),
                            v.maxValue(1, "focalX 最大为 1"),
                        ),
                        focalY: v.pipe(
                            v.number("focalY 必须为数值"),
                            v.finite("focalY 必须为有限数值"),
                            v.minValue(0, "focalY 最小为 0"),
                            v.maxValue(1, "focalY 最大为 1"),
                        ),
                    }),
                ),
                readability: v.optional(
                    v.picklist(["none", "clear", "balanced", "quiet", "focus"]),
                ),
            }),
        ),
    ),
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
            accent: json(Accent),
            searchShape: json(Shape),
            glassIntensity: json(GlassIntensity),
            searchTarget: json(Target),
            searchHistoryEnabled: json(HistoryEnabled),
            showAppLabels: json(ShowAppLabels),
            showHomeApps: json(ShowHomeApps),
            showHomeAppPlate: json(ShowHomeAppPlate),
            showHomeDate: json(ShowHomeDate),
            showHomeTime: json(ShowHomeTime),
            showHomeContinue: json(ShowHomeContinue),
            backgroundImage: json(BackgroundImage),
            wallpaperPresentations: json(WallpaperPresentations),
            aiGenerationDefaults: json(AiGenerationDefaults),
            wallpaperCompositions: json(WallpaperCompositions),
            dock: json(DockSchema),
        }),
        async (c, data) => {
            if (
                Object.values(data).every((value) => value === undefined)
            ) return c.fail(STATUS_CODE.BadRequest, "至少修改一项偏好");
            const user = c.get("user");
            return await wallpaper.withLock(async () => {
                if (
                    data.backgroundImage !== undefined &&
                    data.backgroundImage !== null
                ) {
                    const source = parseWallpaperSource(data.backgroundImage);
                    if (!source) {
                        return c.fail(
                            STATUS_CODE.BadRequest,
                            "壁纸地址格式非法",
                        );
                    }
                    if (source.type === "uploaded") {
                        const id = source.value.slice("/api/wallpaper/".length);
                        if (!await wallpaper.getWallpaper(id, user.id)) {
                            return c.fail(
                                STATUS_CODE.NotFound,
                                "壁纸不存在或无权访问",
                            );
                        }
                    }
                    data.backgroundImage = source.value;
                }

                const uploadedFocalsToSync: Array<{
                    id: string;
                    focalX: number;
                    focalY: number;
                }> = [];
                if (
                    data.wallpaperPresentations !== undefined &&
                    data.wallpaperPresentations !== null
                ) {
                    const canonicalPresentations: Record<
                        string,
                        WallpaperPresentation
                    > = {};
                    for (
                        const [key, pres] of Object.entries(
                            data.wallpaperPresentations,
                        )
                    ) {
                        if (key.startsWith("data:")) {
                            if (pres) {
                                canonicalPresentations[key] =
                                    normalizeWallpaperPresentation(pres);
                            }
                            continue;
                        }
                        const source = parseWallpaperSource(key);
                        if (!source) {
                            return c.fail(
                                STATUS_CODE.BadRequest,
                                "壁纸效果 source 格式非法",
                            );
                        }
                        if (source.type === "uploaded") {
                            const id = source.value.slice(
                                "/api/wallpaper/".length,
                            );
                            if (!await wallpaper.getWallpaper(id, user.id)) {
                                return c.fail(
                                    STATUS_CODE.NotFound,
                                    "壁纸不存在或无权访问",
                                );
                            }
                            if (pres?.composition) {
                                uploadedFocalsToSync.push({
                                    id,
                                    focalX: pres.composition.focalX,
                                    focalY: pres.composition.focalY,
                                });
                            }
                        }
                        if (pres) {
                            canonicalPresentations[source.value] =
                                normalizeWallpaperPresentation(pres);
                        }
                    }
                    data.wallpaperPresentations = canonicalPresentations;
                }
                if (
                    data.wallpaperCompositions !== undefined &&
                    data.wallpaperCompositions !== null
                ) {
                    const canonicalCompositions: Record<
                        string,
                        WallpaperComposition
                    > = {};
                    for (
                        const [key, comp] of Object.entries(
                            data.wallpaperCompositions,
                        )
                    ) {
                        const source = parseWallpaperSource(key);
                        if (!source) {
                            return c.fail(
                                STATUS_CODE.BadRequest,
                                "壁纸构图 source 格式非法",
                            );
                        }
                        if (source.type === "uploaded") {
                            const id = source.value.slice(
                                "/api/wallpaper/".length,
                            );
                            if (!await wallpaper.getWallpaper(id, user.id)) {
                                return c.fail(
                                    STATUS_CODE.NotFound,
                                    "壁纸不存在或无权访问",
                                );
                            }
                            if (comp) {
                                uploadedFocalsToSync.push({
                                    id,
                                    focalX: comp.focalX,
                                    focalY: comp.focalY,
                                });
                            }
                        }
                        if (comp) {
                            canonicalCompositions[source.value] = {
                                focalX: comp.focalX,
                                focalY: comp.focalY,
                            };
                        }
                    }
                    data.wallpaperCompositions = canonicalCompositions;
                }

                // Pass 2: Atomic DB update and manifest synchronization
                let updated;
                try {
                    updated = await service.update(user.id, data);
                } catch (error) {
                    if (error instanceof PreferencesValidationError) {
                        return c.fail(STATUS_CODE.BadRequest, error.message);
                    }
                    throw error;
                }
                const syncedIds = new Set<string>();
                // Process in reverse to use the latest focal coordinates if duplicated
                for (let i = uploadedFocalsToSync.length - 1; i >= 0; i--) {
                    const item = uploadedFocalsToSync[i];
                    if (syncedIds.has(item.id)) continue;
                    syncedIds.add(item.id);
                    await wallpaper.updateWallpaperComposition(
                        item.id,
                        user.id,
                        {
                            focalX: item.focalX,
                            focalY: item.focalY,
                        },
                    );
                }
                return c.success(updated);
            });
        },
    );
}
