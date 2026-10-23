// src/features/search/search.route.test.ts
import { assertEquals } from "@std/assert";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService } from "../auth/service.ts";
import { Routes } from "@internal/hono/routes.ts";
import { createSessionMiddleware } from "../auth/middleware.ts";
import { registerSearchRoutes } from "./search.route.ts";
import { registerAuthRoutes } from "../auth/auth.route.ts";
import { registerPreferencesRoutes } from "../preferences/preferences.route.ts";
import { Hono } from "hono";
import type { AppEnv } from "../../serve/env.ts";
import { responseMiddleware } from "@internal/hono/middleware/response.ts";
import type { Envelope } from "@shared/contracts.ts";
import type { SearchHistoryItem, SuggestionItem } from "./types.ts";

const ORIGIN = "http://localhost:8000";

async function setupSearchTestApp() {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    const auth = new AuthService({ store, origin: ORIGIN });

    const app = new Hono<AppEnv>();
    app.use("*", responseMiddleware);

    const routes = new Routes<AppEnv>();
    registerAuthRoutes(routes, { store, auth, origin: ORIGIN });
    registerPreferencesRoutes(routes, { store, auth, origin: ORIGIN });
    registerSearchRoutes(routes, { store, auth, origin: ORIGIN });

    routes.mount(app, [createSessionMiddleware(auth)]);

    return { store, auth, app };
}

Deno.test("search routes: webpage suggestions follow canonical interface language without cross-language reuse", async () => {
    const { store, app } = await setupSearchTestApp();
    const originalFetch = globalThis.fetch;
    const requests: { url: URL; language: string | null }[] = [];
    globalThis.fetch = (input, init) => {
        const url = new URL(
            input instanceof Request ? input.url : String(input),
        );
        const language = new Headers(init?.headers).get("Accept-Language");
        requests.push({ url, language });
        const market = url.searchParams.get(
            url.hostname === "api.bing.com" ? "mkt" : "hl",
        );
        let text = "hello 日本語";
        if (market === language && market === "zh-CN") {
            text = "hello 中文联想";
        } else if (market === language && market === "en-US") {
            text = "hello English suggestion";
        }
        return Promise.resolve(Response.json(["hello", [text]]));
    };
    try {
        for (const engine of ["google", "bing"] as const) {
            for (
                const [suffix, language, text] of [
                    ["", "zh-CN", "hello 中文联想"],
                    ["&language=en-us", "en-US", "hello English suggestion"],
                    ["&language=zh-cn", "zh-CN", "hello 中文联想"],
                ]
            ) {
                const res = await app.request(
                    `/api/search/suggestions?q=hello&engine=${engine}${suffix}`,
                );
                assertEquals(res.status, 200);
                const data = await res.json() as Envelope<SuggestionItem[]>;
                assertEquals(data.data, [{
                    text,
                    source: "engine",
                    engine,
                }]);
                const request = requests.at(-1)!;
                assertEquals(request.language, language);
                assertEquals(
                    request.url.searchParams.get(
                        engine === "google" ? "hl" : "mkt",
                    ),
                    language,
                );
                assertEquals(
                    request.url.searchParams.get(
                        engine === "google" ? "q" : "query",
                    ),
                    "hello",
                );
            }
        }
        const count = requests.length;
        for (
            const language of [
                "",
                "en_US",
                "en-US,en",
                "en\r\nX-Test: injected",
                "x".repeat(65),
            ]
        ) {
            const res = await app.request(
                `/api/search/suggestions?q=hello&language=${
                    encodeURIComponent(language)
                }`,
            );
            assertEquals(res.status, 400, `Invalid language: ${language}`);
            await res.arrayBuffer();
        }
        assertEquals(requests.length, count);
    } finally {
        globalThis.fetch = originalFetch;
        await store.close();
    }
});

Deno.test("search routes: history endpoints require auth and follow opt-in", async () => {
    const { store, app } = await setupSearchTestApp();
    try {
        // Unauthenticated request should fail 401
        const unauthRes = await app.request("/api/search/history", {
            headers: { Origin: ORIGIN },
        });
        assertEquals(unauthRes.status, 401);

        // Register user
        const regRes = await app.request("/api/auth/register", {
            method: "POST",
            headers: { Origin: ORIGIN, "Content-Type": "application/json" },
            body: JSON.stringify({
                username: "search_tester",
                displayName: "Search Tester",
                password: "Password123456!",
            }),
        });
        assertEquals(regRes.status, 200);
        const cookie = regRes.headers.get("set-cookie")?.split(";")[0]!;

        // 1. Post search history while disabled (default)
        const postRes1 = await app.request("/api/search/history", {
            method: "POST",
            headers: {
                Origin: ORIGIN,
                "Content-Type": "application/json",
                Cookie: cookie,
            },
            body: JSON.stringify({
                query: "my search query",
                engineId: "google",
            }),
        });
        assertEquals(postRes1.status, 200);
        const postData1 = await postRes1.json() as Envelope<
            SearchHistoryItem | null
        >;
        assertEquals(postData1.data, null); // default off

        // 2. Enable search history in preferences
        const patchRes = await app.request("/api/preferences", {
            method: "PATCH",
            headers: {
                Origin: ORIGIN,
                "Content-Type": "application/json",
                Cookie: cookie,
            },
            body: JSON.stringify({ searchHistoryEnabled: true }),
        });
        assertEquals(patchRes.status, 200);

        // 3. Post search history now enabled
        const postRes2 = await app.request("/api/search/history", {
            method: "POST",
            headers: {
                Origin: ORIGIN,
                "Content-Type": "application/json",
                Cookie: cookie,
            },
            body: JSON.stringify({
                query: "my search query",
                engineId: "google",
            }),
        });
        assertEquals(postRes2.status, 200);
        const postData2 = await postRes2.json() as Envelope<
            SearchHistoryItem | null
        >;
        assertEquals(postData2.data?.query, "my search query");

        // 4. List search history
        const listRes = await app.request("/api/search/history", {
            headers: { Origin: ORIGIN, Cookie: cookie },
        });
        assertEquals(listRes.status, 200);
        const listData = await listRes.json() as Envelope<SearchHistoryItem[]>;
        assertEquals(listData.data?.length, 1);

        // 5. Delete search history
        const delRes = await app.request(
            `/api/search/history/${postData2.data?.id}`,
            {
                method: "DELETE",
                headers: { Origin: ORIGIN, Cookie: cookie },
            },
        );
        assertEquals(delRes.status, 200);

        const listRes2 = await app.request("/api/search/history", {
            headers: { Origin: ORIGIN, Cookie: cookie },
        });
        const listData2 = await listRes2.json() as Envelope<
            SearchHistoryItem[]
        >;
        assertEquals(listData2.data?.length, 0);
    } finally {
        await store.close();
    }
});
