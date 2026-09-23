export const ENGINE_IDS = ["google", "bing", "baidu", "duckduckgo"] as const;
export type EngineId = typeof ENGINE_IDS[number];

export interface SearchEngine {
    id: EngineId;
    label: string;
    searchUrl: string;
    queryParameter: "q" | "wd";
    probeUrl: string;
}

export const SEARCH_ENGINES: readonly SearchEngine[] = [
    {
        id: "google",
        label: "Google",
        searchUrl: "https://www.google.com/search",
        queryParameter: "q",
        probeUrl: "https://www.google.com/favicon.ico",
    },
    {
        id: "bing",
        label: "Bing",
        searchUrl: "https://www.bing.com/search",
        queryParameter: "q",
        probeUrl: "https://www.bing.com/favicon.ico",
    },
    {
        id: "baidu",
        label: "百度",
        searchUrl: "https://www.baidu.com/s",
        queryParameter: "wd",
        probeUrl: "https://www.baidu.com/favicon.ico",
    },
    {
        id: "duckduckgo",
        label: "DuckDuckGo",
        searchUrl: "https://duckduckgo.com/",
        queryParameter: "q",
        probeUrl: "https://duckduckgo.com/favicon.ico",
    },
];

export function buildSearchUrl(
    engineId: EngineId,
    query: string,
): string | null {
    const normalized = query.trim();
    if (!normalized) return null;
    const engine = SEARCH_ENGINES.find(({ id }) => id === engineId);
    if (!engine) return null;
    const url = new URL(engine.searchUrl);
    url.searchParams.set(engine.queryParameter, normalized);
    return url.href;
}
