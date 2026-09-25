// src/features/search/service.ts
import { desc, eq } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { preferences, searchHistory } from "../../db/schema.ts";
import type { EngineId } from "@shared/engines.ts";
import type { SearchHistoryItem, SuggestionItem } from "./types.ts";
import { BingSuggestionAdapter, GoogleSuggestionAdapter } from "./adapters.ts";

export interface SearchServiceOptions {
    googleAdapter?: {
        fetchSuggestions(q: string, signal?: AbortSignal): Promise<string[]>;
    };
    bingAdapter?: {
        fetchSuggestions(q: string, signal?: AbortSignal): Promise<string[]>;
    };
    now?: () => number;
}

export class SearchService {
    private googleAdapter: {
        fetchSuggestions(q: string, signal?: AbortSignal): Promise<string[]>;
    };
    private bingAdapter: {
        fetchSuggestions(q: string, signal?: AbortSignal): Promise<string[]>;
    };
    private now: () => number;

    constructor(
        private readonly store: DatabaseStore,
        options: SearchServiceOptions = {},
    ) {
        this.googleAdapter = options.googleAdapter ??
            new GoogleSuggestionAdapter();
        this.bingAdapter = options.bingAdapter ?? new BingSuggestionAdapter();
        this.now = options.now ?? (() => Date.now());
    }

    async getSuggestions(
        query: string,
        engine: EngineId,
        userId?: string,
        signal?: AbortSignal,
    ): Promise<SuggestionItem[]> {
        const trimmed = query.trim();
        if (!trimmed) return [];

        const suggestions: SuggestionItem[] = [];
        const seen = new Set<string>();

        // 1. If user is logged in, fetch matched search history from DB
        if (userId) {
            try {
                const historyItems = await this.listHistory(userId, 20);
                const qLower = trimmed.toLowerCase();
                for (const h of historyItems) {
                    if (
                        h.query.toLowerCase().includes(qLower) &&
                        !seen.has(h.query.toLowerCase())
                    ) {
                        seen.add(h.query.toLowerCase());
                        suggestions.push({
                            text: h.query,
                            source: "history",
                            engine: h.engineId,
                        });
                        if (suggestions.length >= 5) break;
                    }
                }
            } catch {
                // silently degrade on history fetch error
            }
        }

        // 2. Fetch external engine suggestions (Google or Bing) with silent degradation
        let engineWords: string[] = [];
        try {
            if (engine === "google") {
                engineWords = await this.googleAdapter.fetchSuggestions(
                    trimmed,
                    signal,
                );
            } else if (engine === "bing") {
                engineWords = await this.bingAdapter.fetchSuggestions(
                    trimmed,
                    signal,
                );
            } else {
                // For baidu/duckduckgo fallback to bing or google, or attempt both silently
                engineWords = await this.bingAdapter.fetchSuggestions(
                    trimmed,
                    signal,
                );
            }
        } catch {
            // Silently degrade
            engineWords = [];
        }

        for (const word of engineWords) {
            const lower = word.toLowerCase();
            if (!seen.has(lower)) {
                seen.add(lower);
                suggestions.push({
                    text: word,
                    source: "engine",
                    engine,
                });
            }
        }

        return suggestions;
    }

    async recordHistory(
        userId: string,
        query: string,
        engineId: EngineId,
    ): Promise<SearchHistoryItem | null> {
        const trimmed = query.trim();
        if (!trimmed) return null;

        return await this.store.run(async (db) => {
            // Check if user has search history enabled (default off)
            const prefRows = await db
                .select({
                    searchHistoryEnabled: preferences.searchHistoryEnabled,
                })
                .from(preferences)
                .where(eq(preferences.userId, userId))
                .limit(1)
                .all();

            const isEnabled = prefRows[0]?.searchHistoryEnabled ?? false;
            if (!isEnabled) {
                return null;
            }

            const id = crypto.randomUUID();
            const createdAt = this.now();

            await db.insert(searchHistory).values({
                id,
                userId,
                query: trimmed,
                engineId,
                createdAt,
            }).run();

            return {
                id,
                userId,
                query: trimmed,
                engineId,
                createdAt,
            };
        });
    }

    async listHistory(
        userId: string,
        limit = 50,
    ): Promise<SearchHistoryItem[]> {
        return await this.store.run(async (db) => {
            const rows = await db
                .select()
                .from(searchHistory)
                .where(eq(searchHistory.userId, userId))
                .orderBy(desc(searchHistory.createdAt))
                .limit(limit)
                .all();

            return rows.map((r) => ({
                id: r.id,
                userId: r.userId,
                query: r.query,
                engineId: r.engineId as EngineId,
                createdAt: r.createdAt,
            }));
        });
    }

    async deleteHistoryItem(
        userId: string,
        id: string,
    ): Promise<boolean> {
        return await this.store.run(async (db) => {
            const rows = await db
                .delete(searchHistory)
                .where(eq(searchHistory.id, id))
                .returning({ id: searchHistory.id })
                .all();

            return rows.length > 0;
        });
    }

    async clearHistory(userId: string): Promise<void> {
        await this.store.run(async (db) => {
            await db
                .delete(searchHistory)
                .where(eq(searchHistory.userId, userId))
                .run();
        });
    }
}
