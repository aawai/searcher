// src/features/search/types.ts
import type { EngineId } from "@shared/engines.ts";

export interface SuggestionItem {
    text: string;
    source: "history" | "webapp" | "engine";
    engine?: EngineId;
    url?: string;
}

export interface SearchHistoryItem {
    id: string;
    userId: string;
    query: string;
    engineId: EngineId;
    createdAt: number;
}
