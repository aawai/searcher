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

Deno.test("search history: recorded items after opt-in are suggested", async () => {
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

        // 2. Opt-in: enable search history in preferences
        await store.run(async (db) => {
            await db.update(preferences)
                .set({ searchHistoryEnabled: true })
                .where(eq(preferences.userId, userId))
                .run();
        });

        // 3. Now recording should succeed
        await service.recordHistory(
            userId,
            "typescript react",
            "google",
        );

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
    } finally {
        await store.close();
    }
});
