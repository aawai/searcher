import { assertEquals } from "@std/assert";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import { createApp } from "../../app.ts";
import type { Envelope, PreferencesDto } from "@shared/contracts.ts";

const origin = "http://localhost:8000";

Deno.test("preferences: authenticated appearance sync is isolated and partial updates preserve fields", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });
        const register = async (username: string) => {
            const response = await app.request("/api/auth/register", {
                method: "POST",
                headers: { origin, "content-type": "application/json" },
                body: JSON.stringify({
                    username,
                    displayName: username,
                    password: "Password123456!",
                }),
            });
            assertEquals(response.status, 200);
            const cookie = response.headers.get("set-cookie")?.split(";")[0];
            if (!cookie?.startsWith(SESSION_COOKIE_NAME + "=")) {
                throw Error("Missing session cookie");
            }
            return cookie;
        };
        const first = await register("appearance_a");
        const second = await register("appearance_b");
        const response = await app.request("/api/preferences", {
            method: "PATCH",
            headers: {
                origin,
                cookie: first,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                theme: "dark",
                style: "glass",
                accent: "violet",
                searchShape: "pill",
                searchOpacity: 0.85,
                wallpaperBlur: 16,
                wallpaperGrayscale: 0.3,
                wallpaperMask: 0.65,
                defaultEngine: "google",
                webAppHomeLimit: 16,
                webAppIconSize: "large",
            }),
        });
        assertEquals(response.status, 200);
        const saved = await response.json() as Envelope<PreferencesDto>;
        assertEquals(saved.data?.style, "glass");
        assertEquals(saved.data?.accent, "violet");
        assertEquals(saved.data?.searchShape, "pill");
        assertEquals(saved.data?.searchOpacity, 0.85);
        assertEquals(saved.data?.webAppHomeLimit, 16);
        assertEquals(saved.data?.webAppIconSize, "large");
        const partial = await app.request("/api/preferences", {
            method: "PATCH",
            headers: {
                origin,
                cookie: first,
                "content-type": "application/json",
            },
            body: JSON.stringify({ wallpaperMask: 0.4 }),
        });
        assertEquals(partial.status, 200);
        const changed = await partial.json() as Envelope<PreferencesDto>;
        assertEquals(changed.data?.wallpaperMask, 0.4);
        assertEquals(changed.data?.style, "glass");
        assertEquals(changed.data?.accent, "violet");
        assertEquals(changed.data?.searchOpacity, 0.85);
        assertEquals(changed.data?.defaultEngine, "google");
        assertEquals(changed.data?.webAppHomeLimit, 16);
        assertEquals(changed.data?.webAppIconSize, "large");
        const other = await app.request("/api/preferences", {
            headers: { cookie: second },
        });
        const isolated = await other.json() as Envelope<PreferencesDto>;
        assertEquals(isolated.data?.style, "quiet");
        assertEquals(isolated.data?.defaultEngine, "bing");
        assertEquals(isolated.data?.searchOpacity, 1);
        assertEquals(isolated.data?.webAppHomeLimit, 12);
        assertEquals(isolated.data?.webAppIconSize, "default");
    } finally {
        await store.close();
    }
});

Deno.test("preferences: invalid wallpaper and appearance values are rejected", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });
        const register = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username: "appearance_valid",
                displayName: "Valid",
                password: "Password123456!",
            }),
        });
        const cookie = register.headers.get("set-cookie")?.split(";")[0] ?? "";
        for (
            const patch of [
                { style: "neon" },
                { accent: "red" },
                { searchShape: "square" },
                { wallpaperBlur: -1 },
                { wallpaperBlur: 25 },
                { wallpaperGrayscale: 1.1 },
                { wallpaperMask: 0.9 },
                { backgroundImage: "javascript:alert(1)" },
                { backgroundImage: "https://user:pass@example.com/a.png" },
                { webAppHomeLimit: 15 },
                { webAppIconSize: "huge" },
                { searchOpacity: 0.05 },
                { searchOpacity: 1.5 },
            ]
        ) {
            const response = await app.request("/api/preferences", {
                method: "PATCH",
                headers: { origin, cookie, "content-type": "application/json" },
                body: JSON.stringify(patch),
            });
            assertEquals(response.status, 400, JSON.stringify(patch));
        }
    } finally {
        await store.close();
    }
});
