import { eq } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { preferences } from "../../db/schema.ts";
import {
    type AiGenerationDefaultsDto,
    type AmbientMotionMode,
    DEFAULT_AMBIENT_MOTION_MODE,
    DEFAULT_AMBIENT_MOTION_STRENGTH,
    DEFAULT_WALLPAPER_GLOW_STRENGTH,
    DEFAULT_WALLPAPER_MASK,
    type LegacyStylePreset,
    normalizeStylePreset,
    type PreferencesDto,
    type StylePreset,
    type UserGenerationConfig,
} from "@shared/contracts.ts";

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
    wallpaperBlur: 0,
    wallpaperGrayscale: 0,
    wallpaperMask: DEFAULT_WALLPAPER_MASK,
    wallpaperGlowStrength: DEFAULT_WALLPAPER_GLOW_STRENGTH,
    ambientMotionMode: DEFAULT_AMBIENT_MOTION_MODE,
    ambientMotionStrength: DEFAULT_AMBIENT_MOTION_STRENGTH,
    searchTarget: "same",
    searchHistoryEnabled: false,
    webAppHomeLimit: 12,
    webAppIconSize: "default",
    showAppLabels: true,
    aiGenerationDefaults: {
        models: {},
    },
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
function toDto(row: typeof preferences.$inferSelect): PreferencesDto {
    return {
        defaultEngine: row.defaultEngine,
        theme: row.theme,
        style: normalizeStylePreset(row.style),
        accent: row.accent ?? "blue",
        searchShape: row.searchShape ?? "rounded",
        searchOpacity: row.searchOpacity ?? 1,
        backgroundImage: row.backgroundImage,
        wallpaperBlur: row.wallpaperBlur,
        wallpaperGrayscale: row.wallpaperGrayscale,
        wallpaperMask: row.wallpaperMask ?? DEFAULT_WALLPAPER_MASK,
        wallpaperGlowStrength: row.wallpaperGlowStrength ??
            DEFAULT_WALLPAPER_GLOW_STRENGTH,
        ambientMotionMode: (row.ambientMotionMode as AmbientMotionMode) ??
            DEFAULT_AMBIENT_MOTION_MODE,
        ambientMotionStrength: row.ambientMotionStrength ??
            DEFAULT_AMBIENT_MOTION_STRENGTH,
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
            & Partial<Omit<PreferencesDto, "style" | "aiGenerationDefaults">>
            & {
                style?: StylePreset | LegacyStylePreset;
                aiGenerationDefaults?: UpdateAiGenerationDefaultsInput;
            },
    ): Promise<PreferencesDto> {
        const canonicalDefaults = await this.getDefaults();
        const { webAppHomeLimit, style, aiGenerationDefaults, ...rest } =
            updates;
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

            const patchValues: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(rest)) {
                if (val !== undefined) {
                    patchValues[key] = val;
                }
            }
            if (serializedAiDefaults !== undefined) {
                patchValues.aiGenerationDefaults = serializedAiDefaults;
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
                wallpaperBlur: canonicalDefaults.wallpaperBlur,
                wallpaperGrayscale: canonicalDefaults.wallpaperGrayscale,
                wallpaperMask: canonicalDefaults.wallpaperMask,
                wallpaperGlowStrength: canonicalDefaults.wallpaperGlowStrength,
                ambientMotionMode: canonicalDefaults.ambientMotionMode,
                ambientMotionStrength: canonicalDefaults.ambientMotionStrength,
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
