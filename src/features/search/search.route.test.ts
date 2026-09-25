// src/features/search/search.route.test.ts
import { assertEquals } from "@std/assert";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import { createApp } from "../../app.ts";
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

Deno.test("search routes: public suggestions endpoint works", async () => {
    const { store, app } = await setupSearchTestApp();
    try {
        const res = await app.request(
            "/api/search/suggestions?q=hello&engine=bing",
            {
                headers: { Origin: ORIGIN },
            },
        );
        assertEquals(res.status, 200);
        const data = await res.json() as Envelope<SuggestionItem[]>;
        assertEquals(data.code, 200);
        assertEquals(Array.isArray(data.data), true);
    } finally {
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
