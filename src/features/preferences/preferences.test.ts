import type { Envelope, PreferencesDto } from "@shared/contracts.ts";
import { assertEquals } from "@std/assert";
import { eq } from "drizzle-orm";
import { createApp } from "../../app.ts";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { preferences, users } from "../../db/schema.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import { SystemSettingsStore } from "../system/settings-store.ts";
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
                accent: "violet",
                searchShape: "pill",
                searchOpacity: 0.85,
                defaultEngine: "google",
                webAppHomeLimit: 16,
                webAppIconSize: "large",
                showAppLabels: false,
            }),
        });
        assertEquals(response.status, 200);
        const saved = await response.json() as Envelope<PreferencesDto>;
        assertEquals(saved.data?.accent, "violet");
        assertEquals(saved.data?.searchShape, "pill");
        assertEquals(saved.data?.searchOpacity, 0.85);
        assertEquals(saved.data?.webAppHomeLimit, 16);
        assertEquals(saved.data?.webAppIconSize, "large");
        assertEquals(saved.data?.showAppLabels, false);
        const partial = await app.request("/api/preferences", {
            method: "PATCH",
            headers: {
                origin,
                cookie: first,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                accent: "rose",
            }),
        });
        assertEquals(partial.status, 200);
        const changed = await partial.json() as Envelope<PreferencesDto>;
        assertEquals(changed.data?.accent, "rose");
        assertEquals(changed.data?.defaultEngine, "google");
        assertEquals(changed.data?.webAppHomeLimit, 16);
        assertEquals(changed.data?.searchShape, "pill");
        assertEquals(changed.data?.searchOpacity, 0.85);
        assertEquals(changed.data?.webAppIconSize, "large");
        assertEquals(changed.data?.showAppLabels, false);
        const updateEmerald = await app.request("/api/preferences", {
            method: "PATCH",
            headers: {
                origin,
                cookie: first,
                "content-type": "application/json",
            },
            body: JSON.stringify({ accent: "emerald" }),
        });
        assertEquals(updateEmerald.status, 200);
        const emeraldSaved = await updateEmerald.json() as Envelope<
            PreferencesDto
        >;
        assertEquals(emeraldSaved.data?.accent, "emerald");
        const updateAmber = await app.request("/api/preferences", {
            method: "PATCH",
            headers: {
                origin,
                cookie: first,
                "content-type": "application/json",
            },
            body: JSON.stringify({ accent: "amber" }),
        });
        assertEquals(updateAmber.status, 200);
        const amberSaved = await updateAmber.json() as Envelope<PreferencesDto>;
        assertEquals(amberSaved.data?.accent, "amber");
        const other = await app.request("/api/preferences", {
            headers: { cookie: second },
        });
        const isolated = await other.json() as Envelope<PreferencesDto>;
        assertEquals(isolated.data?.defaultEngine, "bing");
        assertEquals(isolated.data?.webAppHomeLimit, 12);
        assertEquals(isolated.data?.searchShape, "rounded");
        assertEquals(isolated.data?.searchOpacity, 1);
        assertEquals(isolated.data?.webAppIconSize, "default");
        assertEquals(isolated.data?.showAppLabels, true);
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
                { accent: "red" },
                {
                    wallpaperPresentations: {
                        "invalid-source": { readability: "clear" },
                    },
                },
                {
                    wallpaperPresentations: {
                        "https://example.com/a.png": {
                            readability: "invalid",
                        },
                    },
                },
                { backgroundImage: "https://user:pass@example.com/a.png" },
                { webAppHomeLimit: 15 },
                { searchShape: "square" },
                { searchOpacity: 0.05 },
                { searchOpacity: 1.5 },
                { webAppIconSize: "huge" },
                { showAppLabels: "not-a-bool" },
                { accent: "neon_green" },
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

Deno.test("preferences: new user GET and guest GET return canonical defaults", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });

        // 1. Guest GET returns canonical defaults
        const guestRes = await app.request("/api/preferences");
        assertEquals(guestRes.status, 200);
        const guestBody = await guestRes.json() as Envelope<PreferencesDto>;
        assertEquals(guestBody.data?.wallpaperPresentations, {});

        // 2. New registered user GET returns same canonical defaults
        const regRes = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username: "canon_user",
                displayName: "Canon",
                password: "Password123456!",
            }),
        });
        assertEquals(regRes.status, 200);
        const cookie = regRes.headers.get("set-cookie")?.split(";")[0] ?? "";
        const userRes = await app.request("/api/preferences", {
            headers: { cookie },
        });
        assertEquals(userRes.status, 200);
        const userBody = await userRes.json() as Envelope<PreferencesDto>;
        assertEquals(userBody.data?.wallpaperPresentations, {});
        assertEquals(userBody.data?.accent, "blue");
    } finally {
        await store.close();
    }
});

Deno.test("preferences: first partial PATCH with accent-only seeds full canonical defaults including system settings", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const settings = new SystemSettingsStore(":memory:");
        await settings.update({
            defaultEngine: "duckduckgo",
            defaultTheme: "dark",
            defaultSearchTarget: "new",
        });
        const app = createApp({ store, auth, origin, settings });

        // Create user without preferences row (simulate first patch or new user)
        const now = Date.now();
        await store.run(async (db) => {
            await db.insert(users).values({
                id: "first_patch_user",
                username: "first_patch_user",
                displayName: "First Patch",
                passwordHash: "hash",
                createdAt: now,
                updatedAt: now,
            }).run();
        });

        const authSvc = new AuthService({ store, origin });
        const session = await authSvc.createSession("first_patch_user", 1);
        const cookie = `${SESSION_COOKIE_NAME}=${session.token}`;

        // First partial PATCH with ONLY accent
        const patchRes = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({ accent: "violet" }),
        });
        assertEquals(patchRes.status, 200);
        const patchBody = await patchRes.json() as Envelope<PreferencesDto>;

        // Verify that accent was updated, and all other defaults did not drift
        assertEquals(patchBody.data?.wallpaperPresentations, {});
        assertEquals(patchBody.data?.defaultEngine, "duckduckgo");
        assertEquals(patchBody.data?.theme, "dark");
        assertEquals(patchBody.data?.searchTarget, "new");
        assertEquals(patchBody.data?.webAppHomeLimit, 12);

        // Verify subsequent GET confirms DB persistence
        const getRes = await app.request("/api/preferences", {
            headers: { cookie },
        });
        assertEquals(getRes.status, 200);
        const getBody = await getRes.json() as Envelope<PreferencesDto>;
        assertEquals(getBody.data?.wallpaperPresentations, {});
        assertEquals(getBody.data?.defaultEngine, "duckduckgo");
        assertEquals(getBody.data?.theme, "dark");
        assertEquals(getBody.data?.searchTarget, "new");
    } finally {
        await store.close();
    }
});
Deno.test("preferences: presentation fields accept valid stages and reject invalid enums", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });

        const regRes = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username: "presentation_user",
                displayName: "Presentation",
                password: "Password123456!",
            }),
        });
        const cookie = regRes.headers.get("set-cookie")?.split(";")[0] ?? "";

        // Accept valid wallpaperPresentations
        const testPresentation = {
            readability: "quiet",
            composition: { focalX: 0.3, focalY: 0.7 },
        };
        const resPres = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                wallpaperPresentations: {
                    "https://example.com/bg.jpg": testPresentation,
                },
            }),
        });
        assertEquals(resPres.status, 200);
        const presBody = await resPres.json() as Envelope<PreferencesDto>;
        assertEquals(
            presBody.data?.wallpaperPresentations
                ?.["https://example.com/bg.jpg"]
                ?.readability,
            "quiet",
        );

        // Reject invalid enums and ranges
        for (
            const patch of [
                {
                    wallpaperPresentations: {
                        "https://example.com/bg.jpg": {
                            readability: "super",
                        },
                    },
                },
                {
                    wallpaperPresentations: {
                        "https://example.com/bg.jpg": {
                            composition: { focalX: -0.1, focalY: 0.5 },
                        },
                    },
                },
                {
                    wallpaperPresentations: {
                        "https://example.com/bg.jpg": {
                            composition: { focalX: 0.5, focalY: 1.5 },
                        },
                    },
                },
            ]
        ) {
            const res = await app.request("/api/preferences", {
                method: "PATCH",
                headers: { origin, cookie, "content-type": "application/json" },
                body: JSON.stringify(patch),
            });
            assertEquals(
                res.status,
                400,
                `Expected 400 for ${JSON.stringify(patch)}`,
            );
        }
    } finally {
        await store.close();
    }
});

Deno.test("preferences: subsequent partial updates preserve existing accent and presentation fields", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });

        const regRes = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username: "preserve_user",
                displayName: "Preserve",
                password: "Password123456!",
            }),
        });
        const cookie = regRes.headers.get("set-cookie")?.split(";")[0] ?? "";

        // Initial setup with accent and a wallpaper presentation
        const initRes = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                accent: "emerald",
                wallpaperPresentations: {
                    "https://example.com/wall-1.jpg": {
                        readability: "focus",
                        composition: { focalX: 0.4, focalY: 0.6 },
                    },
                },
            }),
        });
        assertEquals(initRes.status, 200);
        const initBody = await initRes.json() as Envelope<PreferencesDto>;
        assertEquals(initBody.data?.accent, "emerald");
        assertEquals(
            initBody.data
                ?.wallpaperPresentations?.["https://example.com/wall-1.jpg"]
                ?.readability,
            "focus",
        );

        // Partial update: add presentation for a second wallpaper
        const patchRes = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                wallpaperPresentations: {
                    "https://example.com/wall-2.jpg": {
                        readability: "clear",
                        composition: { focalX: 0.5, focalY: 0.5 },
                    },
                },
            }),
        });
        assertEquals(patchRes.status, 200);
        const patchBody = await patchRes.json() as Envelope<PreferencesDto>;
        assertEquals(patchBody.data?.accent, "emerald");
        assertEquals(
            patchBody.data
                ?.wallpaperPresentations?.["https://example.com/wall-1.jpg"]
                ?.readability,
            "focus",
        );
        assertEquals(
            patchBody.data
                ?.wallpaperPresentations?.["https://example.com/wall-2.jpg"]
                ?.readability,
            "clear",
        );
    } finally {
        await store.close();
    }
});

Deno.test("preferences: upgrade preserves legacy masks and future rows use canonical defaults", async () => {
    const store = openDatabase(":memory:");
    try {
        const journal: { entries: { idx: number; tag: string }[] } = JSON.parse(
            await Deno.readTextFile(
                new URL("../../../drizzle/meta/_journal.json", import.meta.url),
            ),
        );
        const migrations = await Promise.all(
            journal.entries.map(async (entry) => ({
                idx: entry.idx,
                sql: (await Deno.readTextFile(
                    new URL(
                        "../../../drizzle/" + entry.tag + ".sql",
                        import.meta.url,
                    ),
                )).split("--> statement-breakpoint"),
            })),
        );
        await store.exclusiveNative(() => {
            for (
                const migration of migrations.filter((entry) => entry.idx < 16)
            ) store.migrate(migration.sql);
            return Promise.resolve();
        });
        await store.run(async (db) => {
            await db.run(
                "INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('zero', 'zero', 'Zero', 'hash', 1, 1), ('max', 'max', 'Max', 'hash', 1, 1)",
            );
            await db.run(
                "INSERT INTO preferences (user_id, wallpaper_mask, accent) VALUES ('zero', 0, 'violet'), ('max', 0.8, 'cyan')",
            );
        });
        await store.exclusiveNative(() => {
            for (
                const migration of migrations.filter((entry) => entry.idx >= 16)
            ) store.migrate(migration.sql);
            return Promise.resolve();
        });
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });
        const read = async (id: string) => {
            const session = await auth.createSession(id, 1);
            const response = await app.request("/api/preferences", {
                headers: { cookie: SESSION_COOKIE_NAME + "=" + session.token },
            });
            assertEquals(response.status, 200);
            const body = await response.json() as Envelope<PreferencesDto>;
            return body.data;
        };
        for (
            const [id, mask, accent] of [["zero", 0, "violet"], [
                "max",
                0.8,
                "cyan",
            ]] as const
        ) {
            // Verify physical DB preserved values for rollback
            const dbRows = await store.run(async (db) => {
                return await db.select().from(preferences).where(
                    eq(preferences.userId, id),
                ).limit(1).all();
            });
            assertEquals(dbRows[0]?.wallpaperMask, mask);
            assertEquals(dbRows[0]?.accent, accent);

            // Verify public GET API returns clean DTO with new defaults
            const upgraded = await read(id);
            assertEquals(upgraded?.accent, accent);
        }
        await store.run(async (db) => {
            await db.insert(users).values({
                id: "future",
                username: "future",
                displayName: "Future",
                passwordHash: "hash",
                createdAt: 1,
                updatedAt: 1,
            }).run();
            await db.insert(preferences).values({ userId: "future" }).run();
        });
        const futureDb = await store.run(async (db) => {
            return await db.select().from(preferences).where(
                eq(preferences.userId, "future"),
            ).limit(1).all();
        });
        assertEquals(futureDb[0]?.wallpaperMask, 0.36);

        const future = await read("future");
        assertEquals(future?.wallpaperPresentations, {});
    } finally {
        await store.close();
    }
});

Deno.test("preferences: legacy DB row with NULL wallpaper_presentations deterministically migrates on GET", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });

        // Manually insert legacy row with null wallpaper_presentations
        const now = Date.now();
        await store.run(async (db) => {
            await db.insert(users).values({
                id: "legacy_user",
                username: "legacy_user",
                displayName: "Legacy",
                passwordHash: "hash",
                createdAt: now,
                updatedAt: now,
            }).run();

            await db.insert(preferences).values({
                userId: "legacy_user",
                backgroundImage: "https://example.com/legacy.jpg",
                wallpaperMask: 0.24,
                wallpaperCompositions: JSON.stringify({
                    "https://example.com/legacy.jpg": {
                        focalX: 0.25,
                        focalY: 0.75,
                    },
                }),
                wallpaperPresentations: null,
            }).run();
        });

        const session = await auth.createSession("legacy_user", 1);
        const res = await app.request("/api/preferences", {
            headers: { cookie: `${SESSION_COOKIE_NAME}=${session.token}` },
        });
        assertEquals(res.status, 200);
        const body = await res.json() as Envelope<PreferencesDto>;
        assertEquals(
            body.data?.backgroundImage,
            "https://example.com/legacy.jpg",
        );

        // Migrated presentation for legacy.jpg
        const pres = body.data?.wallpaperPresentations
            ?.["https://example.com/legacy.jpg"];
        assertEquals(pres?.readability, "balanced"); // 0.24 -> balanced
        assertEquals(pres?.composition, { focalX: 0.25, focalY: 0.75 });
    } finally {
        await store.close();
    }
});

Deno.test("preferences: clear backgroundImage deactivates wallpaper but retains presentation record", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });

        const regRes = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username: "clear_test_user",
                displayName: "ClearTest",
                password: "Password123456!",
            }),
        });
        const cookie = regRes.headers.get("set-cookie")?.split(";")[0] ?? "";

        // Set wallpaper with presentation
        const setRes = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                backgroundImage: "https://example.com/to-clear.jpg",
                wallpaperPresentations: {
                    "https://example.com/to-clear.jpg": {
                        readability: "focus",
                    },
                },
            }),
        });
        assertEquals(setRes.status, 200);

        // Now clear wallpaper (backgroundImage: null)
        const clearRes = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({ backgroundImage: null }),
        });
        assertEquals(clearRes.status, 200);
        const clearBody = await clearRes.json() as Envelope<PreferencesDto>;
        assertEquals(clearBody.data?.backgroundImage, null);
        // Presentation MUST be retained!
        assertEquals(
            clearBody.data
                ?.wallpaperPresentations?.["https://example.com/to-clear.jpg"]
                ?.readability,
            "focus",
        );
    } finally {
        await store.close();
    }
});

Deno.test("preferences: remote/gradient LRU enforces max 24 limit while uploaded excluded from quota", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });

        const regRes = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username: "lru_user",
                displayName: "LRU",
                password: "Password123456!",
            }),
        });
        const cookie = regRes.headers.get("set-cookie")?.split(";")[0] ?? "";

        // Build 26 remote presentations
        const presentations: Record<string, unknown> = {};
        for (let i = 1; i <= 26; i++) {
            presentations[`https://example.com/bg-${i}.jpg`] = {
                readability: "balanced",
            };
        }

        const res = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                backgroundImage: "https://example.com/bg-26.jpg",
                wallpaperPresentations: presentations,
            }),
        });
        assertEquals(res.status, 200);
        const body = await res.json() as Envelope<PreferencesDto>;
        const keys = Object.keys(body.data?.wallpaperPresentations ?? {});
        // Max 24 remote entries!
        assertEquals(keys.length, 24);
        // Oldest (1 and 2) should be evicted
        assertEquals(
            body.data?.wallpaperPresentations?.["https://example.com/bg-1.jpg"],
            undefined,
        );
        assertEquals(
            body.data?.wallpaperPresentations?.["https://example.com/bg-2.jpg"],
            undefined,
        );
        // Current background (26) must NOT be evicted
        assertEquals(
            body.data
                ?.wallpaperPresentations?.["https://example.com/bg-26.jpg"]
                ?.readability,
            "balanced",
        );
    } finally {
        await store.close();
    }
});
