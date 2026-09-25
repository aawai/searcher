// src/features/search/adapters.ts
import type { EngineId } from "@shared/engines.ts";

export interface SuggestionAdapter {
    fetchSuggestions(query: string, signal?: AbortSignal): Promise<string[]>;
}

export class GoogleSuggestionAdapter implements SuggestionAdapter {
    async fetchSuggestions(
        query: string,
        signal?: AbortSignal,
    ): Promise<string[]> {
        if (!query.trim()) return [];
        try {
            const url =
                `https://suggestqueries.google.com/complete/search?client=firefox&q=${
                    encodeURIComponent(query)
                }`;
            const response = await fetch(url, {
                signal,
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "application/json, text/javascript, */*",
                },
            });
            if (!response.ok) return [];
            const data = await response.json();
            if (Array.isArray(data) && Array.isArray(data[1])) {
                return (data[1] as unknown[])
                    .filter((item): item is string => typeof item === "string");
            }
            return [];
        } catch {
            // Silently degrade on network error, abort, or parse error
            return [];
        }
    }
}

export class BingSuggestionAdapter implements SuggestionAdapter {
    async fetchSuggestions(
        query: string,
        signal?: AbortSignal,
    ): Promise<string[]> {
        if (!query.trim()) return [];
        try {
            const url = `https://api.bing.com/osjson.aspx?query=${
                encodeURIComponent(query)
            }`;
            const response = await fetch(url, {
                signal,
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "application/json, text/javascript, */*",
                },
            });
            if (!response.ok) return [];
            const data = await response.json();
            if (Array.isArray(data) && Array.isArray(data[1])) {
                return (data[1] as unknown[])
                    .filter((item): item is string => typeof item === "string");
            }
            return [];
        } catch {
            // Silently degrade on network error, abort, or parse error
            return [];
        }
    }
}

export function getSuggestionAdapter(
    engine: EngineId,
): SuggestionAdapter | null {
    switch (engine) {
        case "google":
            return new GoogleSuggestionAdapter();
        case "bing":
            return new BingSuggestionAdapter();
        default:
            return null;
    }
}
