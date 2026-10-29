import { and, eq, isNull } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { preferences, webapps } from "../../db/schema.ts";
import {
    DEFAULT_DOCK_PREFERENCES,
    DOCK_SYSTEM_IDS,
    type DockPreferences,
    isValidDockSystemId,
    normalizeDockPreferences,
} from "@shared/dock.ts";
import {
    type AiGenerationDefaultsDto,
    DEFAULT_ACCENT,
    DEFAULT_GLASS_INTENSITY,
    normalizeGlassIntensity,
    normalizeWallpaperCompositions,
    type PreferencesDto,
    type UserGenerationConfig,
    type WallpaperComposition,
} from "@shared/contracts.ts";
import {
    DEFAULT_WALLPAPER_PRESENTATION,
    normalizeWallpaperPresentation,
    normalizeWallpaperPresentations,
    touchWallpaperPresentation,
    type WallpaperPresentation,
    wallpaperPresentation,
} from "@shared/wallpaper-presentation.ts";
import { parseWallpaperSource } from "@shared/wallpaper.ts";

export class PreferencesValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PreferencesValidationError";
    }
}

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
    accent: DEFAULT_ACCENT,
    searchShape: "rounded",
    glassIntensity: DEFAULT_GLASS_INTENSITY,
    backgroundImage: null,
    searchTarget: "same",
    searchHistoryEnabled: false,
    showAppLabels: true,
    showHomeApps: true,
    showHomeAppPlate: true,
    showHomeDate: true,
    showHomeTime: false,
    showHomeContinue: true,
    aiGenerationDefaults: {
        models: {},
    },
    wallpaperPresentations: {},
    dock: { ...DEFAULT_DOCK_PREFERENCES },
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
function parseDockPreferences(raw?: string | null): DockPreferences {
    if (!raw) return { ...DEFAULT_DOCK_PREFERENCES };
    try {
        const parsed = JSON.parse(raw);
        return normalizeDockPreferences(parsed);
    } catch {
        return { ...DEFAULT_DOCK_PREFERENCES };
    }
}

function toDto(row: typeof preferences.$inferSelect): PreferencesDto {
    const compositions = parseWallpaperCompositions(row.wallpaperCompositions);
    const rawPresentations = parseWallpaperPresentations(
        row.wallpaperPresentations,
    );
    const presentations = normalizeWallpaperPresentations(rawPresentations, {
        currentSource: row.backgroundImage,
        legacy: {
            wallpaperMask: row.wallpaperMask,
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
        accent: row.accent,
        searchShape: row.searchShape ?? "rounded",
        glassIntensity: normalizeGlassIntensity(row.glassIntensity),
        backgroundImage: row.backgroundImage,
        wallpaperPresentations: presentations,
        searchTarget: row.searchTarget,
        searchHistoryEnabled: row.searchHistoryEnabled ?? false,
        showAppLabels: row.showAppLabels ?? true,
        showHomeApps: row.showHomeApps ?? true,
        showHomeAppPlate: row.showHomeAppPlate ?? true,
        showHomeDate: row.showHomeDate ?? true,
        showHomeTime: row.showHomeTime ?? false,
        showHomeContinue: row.showHomeContinue ?? true,
        aiGenerationDefaults: parseAiGenerationDefaults(
            row.aiGenerationDefaults,
        ),
        dock: parseDockPreferences(row.dock),
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
                    | "aiGenerationDefaults"
                    | "wallpaperCompositions"
                    | "wallpaperPresentations"
                    | "dock"
                >
            >
            & {
                aiGenerationDefaults?: UpdateAiGenerationDefaultsInput;
                wallpaperCompositions?:
                    | Record<string, WallpaperComposition>
                    | null;
                wallpaperPresentations?:
                    | Record<string, Partial<WallpaperPresentation>>
                    | null;
                dock?: Partial<DockPreferences> | null;
            },
    ): Promise<PreferencesDto> {
        const canonicalDefaults = await this.getDefaults();
        const {
            aiGenerationDefaults,
            wallpaperCompositions,
            wallpaperPresentations,
            dock,
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
            let serializedDock: string | undefined = undefined;
            if (dock === null) {
                serializedDock = JSON.stringify(DEFAULT_DOCK_PREFERENCES);
            } else if (dock !== undefined) {
                const [existingRow] = await db.select().from(preferences)
                    .where(eq(preferences.userId, userId)).limit(1).all();
                const currentDock = parseDockPreferences(existingRow?.dock);

                let systemOrder = currentDock.systemOrder;
                if (dock.systemOrder !== undefined) {
                    if (
                        !Array.isArray(dock.systemOrder) ||
                        dock.systemOrder.length !== DOCK_SYSTEM_IDS.length ||
                        new Set(dock.systemOrder).size !==
                            DOCK_SYSTEM_IDS.length ||
                        !dock.systemOrder.every((id) => isValidDockSystemId(id))
                    ) {
                        throw new PreferencesValidationError(
                            `任务栏入口已更新，请刷新页面后重试；系统入口必须完整包含且不重复: ${
                                DOCK_SYSTEM_IDS.join(", ")
                            }`,
                        );
                    }
                    systemOrder = [...dock.systemOrder];
                }

                let hiddenSystemIds = currentDock.hiddenSystemIds;
                if (dock.hiddenSystemIds !== undefined) {
                    if (
                        !Array.isArray(dock.hiddenSystemIds) ||
                        new Set(dock.hiddenSystemIds).size !==
                            dock.hiddenSystemIds.length ||
                        !dock.hiddenSystemIds.every((id) =>
                            isValidDockSystemId(id)
                        )
                    ) {
                        throw new PreferencesValidationError(
                            "隐藏系统入口列表不能重复且必须为合法系统入口",
                        );
                    }
                    hiddenSystemIds = [...dock.hiddenSystemIds];
                }

                let appIds = currentDock.appIds;
                if (dock.appIds !== undefined) {
                    if (!Array.isArray(dock.appIds)) {
                        throw new PreferencesValidationError(
                            "固定应用列表必须为数组",
                        );
                    }
                    const seen = new Set<string>();
                    for (const id of dock.appIds) {
                        if (typeof id !== "string" || !id.trim()) {
                            throw new PreferencesValidationError(
                                "应用 ID 无效",
                            );
                        }
                        if (seen.has(id)) {
                            throw new PreferencesValidationError(
                                "固定应用不能重复",
                            );
                        }
                        seen.add(id);
                    }
                    if (dock.appIds.length > 0) {
                        const validRows = await db
                            .select({ id: webapps.id })
                            .from(webapps)
                            .where(
                                and(
                                    eq(webapps.userId, userId),
                                    isNull(webapps.deletedAt),
                                ),
                            )
                            .all();
                        const validSet = new Set(validRows.map((r) => r.id));
                        for (const id of dock.appIds) {
                            if (!validSet.has(id)) {
                                throw new PreferencesValidationError(
                                    "应用不存在或已被删除",
                                );
                            }
                        }
                    }
                    appIds = [...dock.appIds];
                }

                const mergedDock: DockPreferences = {
                    systemOrder,
                    hiddenSystemIds,
                    appIds,
                };
                serializedDock = JSON.stringify(mergedDock);
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
                                wallpaperMask: existingRow.wallpaperMask,
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
            if (serializedDock !== undefined) {
                patchValues.dock = serializedDock;
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
                accent: canonicalDefaults.accent,
                searchShape: canonicalDefaults.searchShape,
                glassIntensity: canonicalDefaults.glassIntensity,
                backgroundImage: canonicalDefaults.backgroundImage,
                wallpaperMask: 0.24,
                searchTarget: canonicalDefaults.searchTarget,
                searchHistoryEnabled: canonicalDefaults.searchHistoryEnabled ??
                    false,
                showAppLabels: canonicalDefaults.showAppLabels,
                showHomeApps: canonicalDefaults.showHomeApps,
                showHomeAppPlate: canonicalDefaults.showHomeAppPlate,
                showHomeDate: canonicalDefaults.showHomeDate,
                showHomeTime: canonicalDefaults.showHomeTime,
                showHomeContinue: canonicalDefaults.showHomeContinue,
                aiGenerationDefaults: JSON.stringify(
                    canonicalDefaults.aiGenerationDefaults ?? { models: {} },
                ),
                wallpaperCompositions: JSON.stringify({}),
                wallpaperPresentations: JSON.stringify(
                    canonicalDefaults.wallpaperPresentations ?? {},
                ),
                dock: JSON.stringify(
                    canonicalDefaults.dock ?? DEFAULT_DOCK_PREFERENCES,
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
