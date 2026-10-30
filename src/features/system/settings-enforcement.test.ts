import { assertEquals, assertStringIncludes } from "@std/assert";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService } from "../auth/service.ts";
import { SystemSettingsStore } from "../system/settings-store.ts";
import { createApp } from "../../app.ts";
import type { Envelope, PreferencesDto } from "@shared/contracts.ts";

const origin = "http://localhost:8000";

Deno.test("settings-enforcement: registration gating & custom default engine/theme/target", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const settings = new SystemSettingsStore(":memory:");
        const app = createApp({ store, auth, origin, settings });

        // 1. Initial defaults check on public /api/auth/register
        const regStatusRes = await app.request("/api/auth/register");
        assertEquals(regStatusRes.status, 200);
        const regStatus = await regStatusRes.json() as Envelope<
            { allowRegistration: boolean }
        >;
        assertEquals(regStatus.data?.allowRegistration, true);

        // 2. Initial guest preferences reflect default settings (bing, system, same)
        const guestPrefsRes = await app.request("/api/preferences");
        assertEquals(guestPrefsRes.status, 200);
        const guestPrefs = await guestPrefsRes.json() as Envelope<
            PreferencesDto
        >;
        assertEquals(guestPrefs.data?.defaultEngine, "bing");
        assertEquals(guestPrefs.data?.theme, "system");
        assertEquals(guestPrefs.data?.searchTarget, "same");

        // 3. Update system settings: allowRegistration: false, defaultEngine: duckduckgo, defaultTheme: dark, defaultSearchTarget: new
        await settings.update({
            allowRegistration: false,
            defaultEngine: "duckduckgo",
            defaultTheme: "dark",
            defaultSearchTarget: "new",
        });

        // 4. Query registration status after update
        const regStatusRes2 = await app.request("/api/auth/register");
        const regStatus2 = await regStatusRes2.json() as Envelope<
            { allowRegistration: boolean }
        >;
        assertEquals(regStatus2.data?.allowRegistration, false);

        // 5. Attempt registration when allowRegistration = false must be rejected with 403
        const regAttemptRes = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username: "newuser1",
                displayName: "New User 1",
                password: "Password123456!",
            }),
        });
        assertEquals(regAttemptRes.status, 403);
        const regAttemptBody = await regAttemptRes.json() as Envelope<unknown>;
        assertEquals(regAttemptBody.message, "开放注册已关闭");

        // 6. Guest preferences now reflect updated system defaults (duckduckgo, dark, new)
        const guestPrefsRes2 = await app.request("/api/preferences");
        assertEquals(guestPrefsRes2.status, 200);
        const guestPrefs2 = await guestPrefsRes2.json() as Envelope<
            PreferencesDto
        >;
        assertEquals(guestPrefs2.data?.defaultEngine, "duckduckgo");
        assertEquals(guestPrefs2.data?.theme, "dark");
        assertEquals(guestPrefs2.data?.searchTarget, "new");

        // 7. Re-open registration
        await settings.update({ allowRegistration: true });

        // 8. Register a new user when allowed -> created preferences must use system defaults
        const regSuccessRes = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username: "newuser1",
                displayName: "New User 1",
                password: "Password123456!",
            }),
        });
        assertEquals(regSuccessRes.status, 200);
        const cookie = regSuccessRes.headers.get("set-cookie")?.split(";")[0];

        // 9. User preferences endpoint reflects the newly created user's initialized defaults
        const userPrefsRes = await app.request("/api/preferences", {
            headers: { cookie: cookie! },
        });
        assertEquals(userPrefsRes.status, 200);
        const userPrefs = await userPrefsRes.json() as Envelope<PreferencesDto>;
        assertEquals(userPrefs.data?.defaultEngine, "duckduckgo");
        assertEquals(userPrefs.data?.theme, "dark");
        assertEquals(userPrefs.data?.searchTarget, "new");

        // 10. Without an explicit engine the configured default (duckduckgo) uses the Bing fallback.
        // Network is stubbed so the test never reaches the real suggestion providers.
        const requestedUrls: string[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = ((input: string | URL | Request) => {
            requestedUrls.push(String(input));
            return Promise.resolve(
                new Response(
                    JSON.stringify(["deno", ["deno land", "deno deploy"]]),
                    {
                        headers: { "content-type": "application/json" },
                    },
                ),
            );
        }) as typeof fetch;
        try {
            const suggRes = await app.request("/api/search/suggestions?q=deno");
            assertEquals(suggRes.status, 200);
            const suggestions = await suggRes.json() as Envelope<
                Array<{ text: string }>
            >;
            assertEquals(requestedUrls.length, 1);
            assertStringIncludes(requestedUrls[0], "api.bing.com/osjson.aspx");
            assertEquals(suggestions.data?.map((s) => s.text), [
                "deno land",
                "deno deploy",
            ]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    } finally {
        await store.close();
    }
});
