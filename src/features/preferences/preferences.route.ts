import { STATUS_CODE } from "@std/http";
import { json, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import * as v from "@valibot/valibot";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { PreferencesService, PreferencesValidationError } from "./service.ts";
import { WallpaperService } from "../wallpaper/service.ts";
import { parseCookie } from "../auth/middleware.ts";
import {
    ACCENT_PREFERENCES,
    CANONICAL_REASONING_EFFORTS,
    DARK_WALLPAPER_MODES,
    GLASS_INTENSITIES,
    ICON_CUSTOM_STYLES_MAX_COUNT,
    ICON_PROMPT_MAX_LENGTH,
    ICON_STYLE_NAME_MAX_LENGTH,
    ICON_STYLE_PROMPT_MAX_LENGTH,
    TAB_ICONS,
    THEME_IDS,
} from "../../shared/contracts.ts";
import { DOCK_SYSTEM_IDS } from "../../shared/dock.ts";
import {
    normalizeWallpaperPresentation,
    type WallpaperPresentation,
} from "../../shared/wallpaper-presentation.ts";
import {
    BOTANICAL_SPECIES,
    parseWallpaperSource,
    type WallpaperComposition,
} from "../../shared/wallpaper.ts";
const Engine = v.optional(
    v.picklist(["google", "bing", "baidu", "duckduckgo"]),
);
const Theme = v.optional(v.picklist(THEME_IDS));
const Accent = v.optional(v.picklist(ACCENT_PREFERENCES));
const Shape = v.optional(v.picklist(["rounded", "pill"]));
const GlassIntensity = v.optional(v.picklist(GLASS_INTENSITIES));
const TabIcon = v.optional(v.picklist(TAB_ICONS));
const Target = v.optional(v.picklist(["same", "new"]));
const HistoryEnabled = v.optional(v.boolean("搜索历史开关必须为布尔值"));
const ShowHomeApps = v.optional(v.boolean("首页显示应用必须为布尔值"));
const ShowHomeAppPlate = v.optional(v.boolean("首页应用底板必须为布尔值"));
const ShowHomeDate = v.optional(v.boolean("首页显示日期必须为布尔值"));
const ShowHomeTime = v.optional(v.boolean("首页显示时间必须为布尔值"));
const ShowHomeContinue = v.optional(v.boolean("首页显示继续必须为布尔值"));
const HomeMastheadCollapsed = v.optional(
    v.boolean("刊头默认收起必须为布尔值"),
);
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
const DarkWallpaperMode = v.optional(
    v.picklist(DARK_WALLPAPER_MODES, "深色壁纸模式无效"),
);
const BotanicalScene = v.optional(
    v.nullable(v.picklist(BOTANICAL_SPECIES, "内置插画种类无效")),
);
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

const CustomIconStyleSchema = v.object({
    id: v.pipe(
        v.string("风格 ID 必须为字符串"),
        v.trim(),
        v.minLength(1, "风格 ID 不能为空"),
        v.maxLength(64, "风格 ID 过长"),
    ),
    name: v.pipe(
        v.string("风格名称必须为字符串"),
        v.trim(),
        v.minLength(1, "风格名称不能为空"),
        v.maxLength(ICON_STYLE_NAME_MAX_LENGTH, "风格名称过长"),
    ),
    prompt: v.pipe(
        v.string("风格提示词必须为字符串"),
        v.trim(),
        v.minLength(1, "风格提示词不能为空"),
        v.maxLength(ICON_STYLE_PROMPT_MAX_LENGTH, "风格提示词过长"),
    ),
});

const IconGenerationDefaultsSchema = v.object({
    defaultStyle: v.optional(
        v.nullable(
            v.pipe(
                v.string("默认风格必须为字符串"),
                v.trim(),
                v.maxLength(64, "默认风格 ID 过长"),
            ),
        ),
    ),
    defaultCount: v.optional(
        v.nullable(
            v.pipe(
                v.number("默认生成数量必须为数值"),
                v.integer("默认生成数量必须为整数"),
                v.minValue(1, "默认生成数量至少为 1"),
                v.maxValue(3, "默认生成数量最多为 3"),
            ),
        ),
    ),
    defaultProtocol: v.optional(
        v.nullable(v.picklist(["openai", "gemini"], "图片协议无效")),
    ),
    referenceTemplate: v.optional(
        v.nullable(
            v.pipe(
                v.string("有参考图模板必须为字符串"),
                v.maxLength(ICON_PROMPT_MAX_LENGTH, "有参考图模板过长"),
            ),
        ),
    ),
    textTemplate: v.optional(
        v.nullable(
            v.pipe(
                v.string("无参考图模板必须为字符串"),
                v.maxLength(ICON_PROMPT_MAX_LENGTH, "无参考图模板过长"),
            ),
        ),
    ),
    customStyles: v.optional(
        v.nullable(
            v.pipe(
                v.array(CustomIconStyleSchema),
                v.maxLength(
                    ICON_CUSTOM_STYLES_MAX_COUNT,
                    `自定义风格最多 ${ICON_CUSTOM_STYLES_MAX_COUNT} 个`,
                ),
            ),
        ),
    ),
});

const AiGenerationDefaults = v.optional(
    v.nullable(
        v.object({
            default: v.optional(v.nullable(GenerationConfig)),
            models: v.optional(
                v.nullable(v.record(v.string(), v.nullable(GenerationConfig))),
            ),
            iconGeneration: v.optional(
                v.nullable(IconGenerationDefaultsSchema),
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
        const cookieName = deps.auth.getSessionCookieName(
            c.req.header("origin"),
            c.req.header("host"),
        );
        const token = parseCookie(cookieHeader, cookieName);
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
            tabIcon: json(TabIcon),
            searchTarget: json(Target),
            searchHistoryEnabled: json(HistoryEnabled),
            showAppLabels: json(ShowAppLabels),
            showHomeApps: json(ShowHomeApps),
            showHomeAppPlate: json(ShowHomeAppPlate),
            showHomeDate: json(ShowHomeDate),
            showHomeTime: json(ShowHomeTime),
            showHomeContinue: json(ShowHomeContinue),
            homeMastheadCollapsed: json(HomeMastheadCollapsed),
            backgroundImage: json(BackgroundImage),
            darkWallpaperMode: json(DarkWallpaperMode),
            darkBackgroundImage: json(BackgroundImage),
            botanicalScene: json(BotanicalScene),
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
                for (
                    const field of [
                        "backgroundImage",
                        "darkBackgroundImage",
                    ] as const
                ) {
                    const value = data[field];
                    if (value === undefined || value === null) continue;
                    const source = parseWallpaperSource(value);
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
                    data[field] = source.value;
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
