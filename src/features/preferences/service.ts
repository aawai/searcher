import { eq } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { preferences } from "../../db/schema.ts";
import type { PreferencesDto } from "@shared/contracts.ts";
import type { SystemSettingsStore } from "../system/settings-store.ts";
const defaults: PreferencesDto = {
    defaultEngine: "bing",
    theme: "system",
    style: "quiet",
    accent: "blue",
    searchShape: "rounded",
    searchOpacity: 1,
    backgroundImage: null,
    wallpaperBlur: 0,
    wallpaperGrayscale: 0,
    wallpaperMask: 0.36,
    searchTarget: "same",
    searchHistoryEnabled: false,
    webAppHomeLimit: 12,
    webAppIconSize: "default",
};

function toDto(row: typeof preferences.$inferSelect): PreferencesDto {
    return {
        defaultEngine: row.defaultEngine,
        theme: row.theme,
        style: row.style ?? "quiet",
        accent: row.accent ?? "blue",
        searchShape: row.searchShape ?? "rounded",
        searchOpacity: row.searchOpacity ?? 1,
        backgroundImage: row.backgroundImage,
        wallpaperBlur: row.wallpaperBlur,
        wallpaperGrayscale: row.wallpaperGrayscale,
        wallpaperMask: row.wallpaperMask,
        searchTarget: row.searchTarget,
        searchHistoryEnabled: row.searchHistoryEnabled ?? false,
        webAppHomeLimit: row.webAppHomeLimit === "all"
            ? "all"
            : Number(row.webAppHomeLimit) as 8 | 12 | 16,
        webAppIconSize: row.webAppIconSize,
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
        updates: Partial<PreferencesDto>,
    ): Promise<PreferencesDto> {
        const { webAppHomeLimit, ...rest } = updates;
        const values = {
            ...rest,
            ...(webAppHomeLimit === undefined ? {} : {
                webAppHomeLimit: String(webAppHomeLimit) as
                    | "8"
                    | "12"
                    | "16"
                    | "all",
            }),
        };
        return await this.store.run(async (db) => {
            await db.insert(preferences).values({ userId, ...values })
                .onConflictDoUpdate({
                    target: preferences.userId,
                    set: values,
                }).run();
            const rows = await db.select().from(preferences)
                .where(eq(preferences.userId, userId)).limit(1).all();
            if (!rows[0]) throw new Error("Preferences update did not persist");
            return toDto(rows[0]);
        });
    }
}
