import { eq } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { preferences } from "../../db/schema.ts";
import type { PreferencesDto, ThemeId } from "@shared/contracts.ts";
import type { EngineId } from "@shared/engines.ts";

export class PreferencesService {
    constructor(private readonly store: DatabaseStore) {}

    async get(userId: string): Promise<PreferencesDto> {
        return await this.store.run(async (db) => {
            const rows = await db
                .select({
                    defaultEngine: preferences.defaultEngine,
                    theme: preferences.theme,
                })
                .from(preferences)
                .where(eq(preferences.userId, userId))
                .limit(1)
                .all();

            if (rows.length > 0) {
                return {
                    defaultEngine: rows[0].defaultEngine as EngineId,
                    theme: rows[0].theme as ThemeId,
                };
            }

            // Fallback default if row missing
            return {
                defaultEngine: "bing",
                theme: "system",
            };
        });
    }

    async update(
        userId: string,
        updates: { defaultEngine?: EngineId; theme?: ThemeId },
    ): Promise<PreferencesDto> {
        return await this.store.run(async (db) => {
            const existing = await db
                .select({
                    defaultEngine: preferences.defaultEngine,
                    theme: preferences.theme,
                })
                .from(preferences)
                .where(eq(preferences.userId, userId))
                .limit(1)
                .all();

            const nextEngine = updates.defaultEngine ??
                (existing[0]?.defaultEngine as EngineId | undefined) ?? "bing";
            const nextTheme = updates.theme ??
                (existing[0]?.theme as ThemeId | undefined) ?? "system";

            if (existing.length === 0) {
                await db.insert(preferences).values({
                    userId,
                    defaultEngine: nextEngine,
                    theme: nextTheme,
                }).run();
            } else {
                const patch: { defaultEngine?: EngineId; theme?: ThemeId } = {};
                if (updates.defaultEngine !== undefined) {
                    patch.defaultEngine = updates.defaultEngine;
                }
                if (updates.theme !== undefined) {
                    patch.theme = updates.theme;
                }
                if (Object.keys(patch).length > 0) {
                    await db.update(preferences)
                        .set(patch)
                        .where(eq(preferences.userId, userId))
                        .run();
                }
            }

            return {
                defaultEngine: nextEngine,
                theme: nextTheme,
            };
        });
    }
}
