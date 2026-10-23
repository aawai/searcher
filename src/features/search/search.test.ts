// src/features/search/search.test.ts
import { assertEquals } from "@std/assert";
import { eq } from "drizzle-orm";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { preferences, users } from "../../db/schema.ts";
import { SearchService } from "./service.ts";

Deno.test("search suggestions: silent degradation on adapter network failure", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const failingGoogleAdapter = {
            fetchSuggestions() {
                throw new Error("Network timeout or unreachable");
            },
        };
        const failingBingAdapter = {
            fetchSuggestions() {
                throw new Error("DNS resolution failure");
            },
        };

        const service = new SearchService(store, {
            googleAdapter: failingGoogleAdapter,
            bingAdapter: failingBingAdapter,
        });

        // Test with google
        const googleResult = await service.getSuggestions("deno", "google");
        assertEquals(googleResult, []);

        // Test with bing
        const bingResult = await service.getSuggestions("deno", "bing");
        assertEquals(bingResult, []);
    } finally {
        await store.close();
    }
});

Deno.test("search suggestions: returns provider suggestions when successful", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const mockGoogleAdapter = {
            fetchSuggestions(q: string) {
                return Promise.resolve([`${q} test`, `${q} js`]);
            },
        };
        const mockBingAdapter = {
            fetchSuggestions(q: string) {
                return Promise.resolve([`${q} bing1`, `${q} bing2`]);
            },
        };

        const service = new SearchService(store, {
            googleAdapter: mockGoogleAdapter,
            bingAdapter: mockBingAdapter,
        });

        const googleResult = await service.getSuggestions("deno", "google");
        assertEquals(googleResult.length, 2);
        assertEquals(googleResult[0].text, "deno test");
        assertEquals(googleResult[0].source, "engine");

        const bingResult = await service.getSuggestions("deno", "bing");
        assertEquals(bingResult.length, 2);
        assertEquals(bingResult[0].text, "deno bing1");
    } finally {
        await store.close();
    }
});

Deno.test("search history: opt-in default off for authenticated user, only records when enabled", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const userId = "user_hist_test_a";
        const now = Date.now();
        await store.run(async (db) => {
            await db.insert(users).values({
                id: userId,
                username: "user_hist_a",
                displayName: "User A",
                passwordHash: "dummyhash",
                createdAt: now,
                updatedAt: now,
            }).run();
            await db.insert(preferences).values({
                userId,
                searchHistoryEnabled: false,
            }).run();
        });

        const service = new SearchService(store, {
            googleAdapter: {
                fetchSuggestions: () => Promise.resolve([]),
            },
        });

        // 1. By default, searchHistoryEnabled is false. Recording should do nothing and return null.
        const res1 = await service.recordHistory(
            userId,
            "first query",
            "google",
        );
        assertEquals(res1, null);

        const list1 = await service.listHistory(userId);
        assertEquals(list1.length, 0);

        // 2. Opt-in: enable search history in preferences
        await store.run(async (db) => {
            await db.update(preferences)
                .set({ searchHistoryEnabled: true })
                .where(eq(preferences.userId, userId))
                .run();
        });

        // 3. Now recording should succeed
        const res2 = await service.recordHistory(
            userId,
            "typescript react",
            "google",
        );
        assertEquals(res2?.query, "typescript react");

        const list2 = await service.listHistory(userId);
        assertEquals(list2.length, 1);
        assertEquals(list2[0].query, "typescript react");

        // 4. Suggestions should include matched history items
        const suggestions = await service.getSuggestions(
            "type",
            "google",
            userId,
        );
        const historySuggestion = suggestions.find((s) =>
            s.source === "history"
        );
        assertEquals(historySuggestion?.text, "typescript react");

        // 5. Delete single history item
        const deleted = await service.deleteHistoryItem(userId, res2!.id);
        assertEquals(deleted, true);
        const list3 = await service.listHistory(userId);
        assertEquals(list3.length, 0);
    } finally {
        await store.close();
    }
});
