import { eq } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { preferences } from "../../db/schema.ts";
import {
    type AiGenerationDefaultsDto,
    type LegacyStylePreset,
    normalizeStylePreset,
    normalizeWallpaperCompositions,
    type PreferencesDto,
    type StylePreset,
    type UserGenerationConfig,
    type WallpaperComposition,
} from "@shared/contracts.ts";
import {
    type CanvasMotion,
    DEFAULT_CANVAS_MOTION,
    DEFAULT_CANVAS_MOTION_LEVEL,
    DEFAULT_WALLPAPER_PRESENTATION,
    normalizeWallpaperPresentation,
    normalizeWallpaperPresentations,
    touchWallpaperPresentation,
    type WallpaperMotionLevel,
    type WallpaperPresentation,
    wallpaperPresentation,
} from "@shared/wallpaper-presentation.ts";
import { parseWallpaperSource } from "@shared/wallpaper.ts";
import {
    DEFAULT_DESKTOP_SCENE,
    normalizeDesktopScene,
} from "@shared/desktop-scenes.ts";

export type UpdateAiGenerationDefaultsInput = {
    default?:
        | Partial<
            {
                [K in keyof UserGenerationConfig]:
                    | UserGenerationConfig[K]
                    | null;
            }
        >
        | null;
    models?:
        | Record<
            string,
            Partial<
                {
                    [K in keyof UserGenerationConfig]:
                        | UserGenerationConfig[K]
                        | null;
                }
            > | null
        >
        | null;
} | null;
import type { SystemSettingsStore } from "../system/settings-store.ts";
const defaults: PreferencesDto = {
    defaultEngine: "bing",
    theme: "system",
    style: "zen",
    accent: "blue",
    searchShape: "rounded",
    searchOpacity: 1,
    backgroundImage: null,
    canvasMotion: DEFAULT_CANVAS_MOTION,
    canvasMotionLevel: DEFAULT_CANVAS_MOTION_LEVEL,
    desktopScene: DEFAULT_DESKTOP_SCENE,
    searchTarget: "same",
    searchHistoryEnabled: false,
    webAppHomeLimit: 12,
    webAppIconSize: "default",
    showAppLabels: true,
    aiGenerationDefaults: {
        models: {},
    },
    wallpaperPresentations: {},
};

function cleanConfig(
    raw?: unknown,
): UserGenerationConfig | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const r = raw as Record<string, unknown>;
    const result: UserGenerationConfig = {};
    if (typeof r.temperature === "number" && Number.isFinite(r.temperature)) {
        result.temperature = r.temperature;
    }
    if (typeof r.topP === "number" && Number.isFinite(r.topP)) {
        result.topP = r.topP;
    }
    if (typeof r.maxTokens === "number" && Number.isFinite(r.maxTokens)) {
        result.maxTokens = Math.floor(r.maxTokens);
    }
    if (typeof r.reasoningEffort === "string") {
        result.reasoningEffort = r
            .reasoningEffort as UserGenerationConfig["reasoningEffort"];
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function parseAiGenerationDefaults(
    raw?: string | null,
): AiGenerationDefaultsDto {
    if (!raw) return { models: {} };
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const p = parsed as Record<string, unknown>;
            const modelsRecord: Record<string, UserGenerationConfig> = {};
            if (
                p.models && typeof p.models === "object" &&
                !Array.isArray(p.models)
            ) {
                for (
                    const [k, v] of Object.entries(
                        p.models as Record<string, unknown>,
                    )
                ) {
                    const cleaned = cleanConfig(v);
                    if (cleaned) {
                        modelsRecord[k] = cleaned;
                    }
                }
            }
            return {
                default: cleanConfig(p.default),
                models: modelsRecord,
            };
        }
    } catch {
        // Fall back to empty defaults
    }
    return { models: {} };
}
function parseWallpaperCompositions(
    raw?: string | null,
): Record<string, WallpaperComposition> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return normalizeWallpaperCompositions(parsed);
    } catch {
        return {};
    }
}

function parseWallpaperPresentations(
    raw?: string | null,
): Record<string, WallpaperPresentation> | undefined {
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, WallpaperPresentation>;
        }
    } catch {
        // Fall back to undefined so migration runs
    }
    return undefined;
}

function toDto(row: typeof preferences.$inferSelect): PreferencesDto {
    const compositions = parseWallpaperCompositions(row.wallpaperCompositions);
    const rawPresentations = parseWallpaperPresentations(
        row.wallpaperPresentations,
    );
    const presentations = normalizeWallpaperPresentations(rawPresentations, {
        currentSource: row.backgroundImage,
        legacy: {
            wallpaperBlur: row.wallpaperBlur,
            wallpaperGrayscale: row.wallpaperGrayscale,
            wallpaperMask: row.wallpaperMask,
            wallpaperGlowStrength: row.wallpaperGlowStrength,
            ambientMotionMode: row.ambientMotionMode,
            ambientMotionStrength: row.ambientMotionStrength,
        },
        legacyCompositions: compositions,
    });

    if (row.backgroundImage) {
        const parsedBg = parseWallpaperSource(row.backgroundImage);
        const canonicalBg = parsedBg ? parsedBg.value : row.backgroundImage;
        if (!presentations[canonicalBg]) {
            presentations[canonicalBg] = wallpaperPresentation(
                canonicalBg,
                presentations,
            );
        }
        if (compositions[canonicalBg]) {
            presentations[canonicalBg].composition = compositions[canonicalBg];
        } else if (presentations[canonicalBg]?.composition) {
            compositions[canonicalBg] = presentations[canonicalBg].composition;
        }
    }

    for (const [key, comp] of Object.entries(compositions)) {
        if (presentations[key]) {
            presentations[key].composition = comp;
        }
    }

    return {
        defaultEngine: row.defaultEngine,
        theme: row.theme,
        style: normalizeStylePreset(row.style),
        accent: row.accent ?? "blue",
        searchShape: row.searchShape ?? "rounded",
        searchOpacity: row.searchOpacity ?? 1,
        backgroundImage: row.backgroundImage,
        wallpaperPresentations: presentations,
        canvasMotion: (row.canvasMotion as CanvasMotion) ??
            DEFAULT_CANVAS_MOTION,
        canvasMotionLevel: (row.canvasMotionLevel as WallpaperMotionLevel) ??
            DEFAULT_CANVAS_MOTION_LEVEL,
        desktopScene: normalizeDesktopScene(row.desktopScene),
        searchTarget: row.searchTarget,
        searchHistoryEnabled: row.searchHistoryEnabled ?? false,
        webAppHomeLimit: row.webAppHomeLimit === "all"
            ? "all"
            : Number(row.webAppHomeLimit) as 8 | 12 | 16,
        webAppIconSize: row.webAppIconSize,
        showAppLabels: row.showAppLabels ?? true,
        aiGenerationDefaults: parseAiGenerationDefaults(
            row.aiGenerationDefaults,
        ),
    };
}

export class PreferencesService {
    constructor(
        private readonly store: DatabaseStore,
        private readonly settingsStore?: SystemSettingsStore,
    ) {}

    async getDefaults(): Promise<PreferencesDto> {
        if (!this.settingsStore) return { ...defaults };
        const sys = await this.settingsStore.get();
        return {
            ...defaults,
            defaultEngine: sys.defaultEngine,
            theme: sys.defaultTheme,
            searchTarget: sys.defaultSearchTarget,
        };
    }

    async get(userId: string): Promise<PreferencesDto> {
        const fallback = await this.getDefaults();
        return await this.store.run(async (db) => {
            const rows = await db.select().from(preferences)
                .where(eq(preferences.userId, userId)).limit(1).all();
            return rows[0] ? toDto(rows[0]) : fallback;
        });
    }

    async update(
        userId: string,
        updates:
            & Partial<
                Omit<
                    PreferencesDto,
                    | "style"
                    | "aiGenerationDefaults"
                    | "wallpaperCompositions"
                    | "wallpaperPresentations"
                    | "canvasMotion"
                    | "canvasMotionLevel"
                >
            >
            & {
                style?: StylePreset | LegacyStylePreset;
                aiGenerationDefaults?: UpdateAiGenerationDefaultsInput;
                wallpaperCompositions?:
                    | Record<string, WallpaperComposition>
                    | null;
                wallpaperPresentations?:
                    | Record<string, Partial<WallpaperPresentation>>
                    | null;
                canvasMotion?: CanvasMotion;
                canvasMotionLevel?: WallpaperMotionLevel;
            },
    ): Promise<PreferencesDto> {
        const canonicalDefaults = await this.getDefaults();
        const {
            webAppHomeLimit,
            style,
            aiGenerationDefaults,
            wallpaperCompositions,
            wallpaperPresentations,
            canvasMotion,
            canvasMotionLevel,
            ...rest
        } = updates;
        return await this.store.run(async (db) => {
            let serializedAiDefaults: string | undefined = undefined;
            if (aiGenerationDefaults === null) {
                serializedAiDefaults = JSON.stringify({ models: {} });
            } else if (aiGenerationDefaults !== undefined) {
                const [existingRow] = await db.select().from(preferences)
                    .where(eq(preferences.userId, userId)).limit(1).all();
                const current = parseAiGenerationDefaults(
                    existingRow?.aiGenerationDefaults,
                );
                let mergedDefault = current.default;
                if (aiGenerationDefaults.default === null) {
                    mergedDefault = undefined;
                } else if (aiGenerationDefaults.default !== undefined) {
                    mergedDefault = cleanConfig({
                        ...current.default,
                        ...aiGenerationDefaults.default,
                    });
                }

                const mergedModels: Record<string, UserGenerationConfig> = {
                    ...current.models,
                };
                if (aiGenerationDefaults.models) {
                    for (
                        const [mId, mConf] of Object.entries(
                            aiGenerationDefaults.models,
                        )
                    ) {
                        if (mConf === null) {
                            delete mergedModels[mId];
                        } else if (mConf !== undefined) {
                            const cleaned = cleanConfig({
                                ...mergedModels[mId],
                                ...mConf,
                            });
                            if (cleaned) {
                                mergedModels[mId] = cleaned;
                            } else {
                                delete mergedModels[mId];
                            }
                        }
                    }
                }

                const merged: AiGenerationDefaultsDto = {
                    ...(mergedDefault ? { default: mergedDefault } : {}),
                    models: mergedModels,
                };
                serializedAiDefaults = JSON.stringify(merged);
            }
            let serializedWallpaperPresentations: string | undefined =
                undefined;
            let serializedWallpaperCompositions: string | undefined = undefined;

            if (
                wallpaperPresentations !== undefined ||
                wallpaperCompositions !== undefined ||
                rest.backgroundImage !== undefined
            ) {
                const [existingRow] = await db.select().from(preferences)
                    .where(eq(preferences.userId, userId)).limit(1).all();

                const currentComps = parseWallpaperCompositions(
                    existingRow?.wallpaperCompositions,
                );
                const rawCurrentPres = parseWallpaperPresentations(
                    existingRow?.wallpaperPresentations,
                );
                let mergedPres = normalizeWallpaperPresentations(
                    rawCurrentPres,
                    {
                        currentSource: existingRow?.backgroundImage,
                        legacy: existingRow
                            ? {
                                wallpaperBlur: existingRow.wallpaperBlur,
                                wallpaperGrayscale:
                                    existingRow.wallpaperGrayscale,
                                wallpaperMask: existingRow.wallpaperMask,
                                wallpaperGlowStrength:
                                    existingRow.wallpaperGlowStrength,
                                ambientMotionMode:
                                    existingRow.ambientMotionMode,
                                ambientMotionStrength:
                                    existingRow.ambientMotionStrength,
                            }
                            : undefined,
                        legacyCompositions: currentComps,
                    },
                );

                if (wallpaperPresentations === null) {
                    mergedPres = {};
                } else if (wallpaperPresentations !== undefined) {
                    for (
                        const [key, pres] of Object.entries(
                            wallpaperPresentations,
                        )
                    ) {
                        const s = parseWallpaperSource(key);
                        const canonicalKey = s ? s.value : key;
                        mergedPres = touchWallpaperPresentation(
                            mergedPres,
                            canonicalKey,
                            normalizeWallpaperPresentation(pres),
                        );
                    }
                }

                if (wallpaperCompositions === null) {
                    for (const key of Object.keys(currentComps)) {
                        delete currentComps[key];
                    }
                } else if (wallpaperCompositions !== undefined) {
                    const normalizedComps = normalizeWallpaperCompositions(
                        wallpaperCompositions,
                    );
                    for (const [key, comp] of Object.entries(normalizedComps)) {
                        currentComps[key] = comp;
                        if (mergedPres[key]) {
                            mergedPres[key].composition = comp;
                        } else {
                            mergedPres[key] = {
                                ...DEFAULT_WALLPAPER_PRESENTATION,
                                composition: comp,
                            };
                        }
                    }
                }

                const nextBg = rest.backgroundImage !== undefined
                    ? rest.backgroundImage
                    : existingRow?.backgroundImage;
                if (nextBg) {
                    const s = parseWallpaperSource(nextBg);
                    const bgKey = s ? s.value : nextBg;
                    if (!mergedPres[bgKey]) {
                        mergedPres[bgKey] = wallpaperPresentation(
                            bgKey,
                            mergedPres,
                        );
                    }
                    mergedPres = touchWallpaperPresentation(
                        mergedPres,
                        bgKey,
                        mergedPres[bgKey],
                    );
                }

                for (const [key, pres] of Object.entries(mergedPres)) {
                    const presentation = pres as WallpaperPresentation;
                    if (presentation.composition) {
                        currentComps[key] = presentation.composition;
                    }
                }

                if (
                    wallpaperPresentations !== undefined ||
                    wallpaperCompositions !== undefined ||
                    rest.backgroundImage !== undefined
                ) {
                    serializedWallpaperPresentations = JSON.stringify(
                        mergedPres,
                    );
                }
                if (
                    wallpaperCompositions !== undefined ||
                    wallpaperPresentations !== undefined
                ) {
                    serializedWallpaperCompositions = JSON.stringify(
                        currentComps,
                    );
                }
            }
            const patchValues: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(rest)) {
                if (val !== undefined) {
                    patchValues[key] = val;
                }
            }
            if (serializedAiDefaults !== undefined) {
                patchValues.aiGenerationDefaults = serializedAiDefaults;
            }
            if (serializedWallpaperCompositions !== undefined) {
                patchValues.wallpaperCompositions =
                    serializedWallpaperCompositions;
            }
            if (serializedWallpaperPresentations !== undefined) {
                patchValues.wallpaperPresentations =
                    serializedWallpaperPresentations;
            }
            if (canvasMotion !== undefined) {
                patchValues.canvasMotion = canvasMotion;
            }
            if (canvasMotionLevel !== undefined) {
                patchValues.canvasMotionLevel = canvasMotionLevel;
            }
            if (style !== undefined) {
                patchValues.style = normalizeStylePreset(style);
            }
            if (webAppHomeLimit !== undefined) {
                patchValues.webAppHomeLimit = String(webAppHomeLimit);
            }

            if (Object.keys(patchValues).length === 0) {
                const rows = await db.select().from(preferences)
                    .where(eq(preferences.userId, userId)).limit(1).all();
                return rows[0] ? toDto(rows[0]) : canonicalDefaults;
            }

            const defaultRowValues = {
                userId,
                defaultEngine: canonicalDefaults.defaultEngine,
                theme: canonicalDefaults.theme,
                style: canonicalDefaults.style,
                accent: canonicalDefaults.accent,
                searchShape: canonicalDefaults.searchShape,
                searchOpacity: canonicalDefaults.searchOpacity,
                backgroundImage: canonicalDefaults.backgroundImage,
                wallpaperBlur: 0,
                wallpaperGrayscale: 0,
                wallpaperMask: 0.24,
                wallpaperGlowStrength: 0,
                ambientMotionMode: "off" as const,
                ambientMotionStrength: 0,
                searchTarget: canonicalDefaults.searchTarget,
                searchHistoryEnabled: canonicalDefaults.searchHistoryEnabled ??
                    false,
                webAppHomeLimit: String(canonicalDefaults.webAppHomeLimit) as
                    | "8"
                    | "12"
                    | "16"
                    | "all",
                webAppIconSize: canonicalDefaults.webAppIconSize,
                showAppLabels: canonicalDefaults.showAppLabels,
                aiGenerationDefaults: JSON.stringify(
                    canonicalDefaults.aiGenerationDefaults ?? { models: {} },
                ),
                wallpaperCompositions: JSON.stringify({}),
                canvasMotion: canonicalDefaults.canvasMotion ?? "off",
                canvasMotionLevel: canonicalDefaults.canvasMotionLevel ??
                    "soft",
                desktopScene: canonicalDefaults.desktopScene,
                wallpaperPresentations: JSON.stringify(
                    canonicalDefaults.wallpaperPresentations ?? {},
                ),
            };
            const insertValues = {
                ...defaultRowValues,
                ...patchValues,
            };

            await db.insert(preferences).values(insertValues)
                .onConflictDoUpdate({
                    target: preferences.userId,
                    set: patchValues,
                }).run();
            const rows = await db.select().from(preferences)
                .where(eq(preferences.userId, userId)).limit(1).all();
            if (!rows[0]) throw new Error("Preferences update did not persist");
            return toDto(rows[0]);
        });
    }
}
