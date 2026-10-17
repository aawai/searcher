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
                style: "widgets",
                accent: "violet",
                searchShape: "pill",
                searchOpacity: 0.85,
                canvasMotion: "ambient",
                canvasMotionLevel: "standard",
                defaultEngine: "google",
                webAppHomeLimit: 16,
                webAppIconSize: "large",
                showAppLabels: false,
            }),
        });
        assertEquals(response.status, 200);
        const saved = await response.json() as Envelope<PreferencesDto>;
        assertEquals(saved.data?.style, "widgets");
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
            body: JSON.stringify({ canvasMotion: "off", accent: "rose" }),
        });
        assertEquals(partial.status, 200);
        const changed = await partial.json() as Envelope<PreferencesDto>;
        assertEquals(changed.data?.canvasMotion, "off");
        assertEquals(changed.data?.style, "widgets");
        assertEquals(changed.data?.accent, "rose");
        assertEquals(changed.data?.searchOpacity, 0.85);
        assertEquals(changed.data?.defaultEngine, "google");
        assertEquals(changed.data?.webAppHomeLimit, 16);
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
        assertEquals(isolated.data?.style, "zen");
        assertEquals(isolated.data?.defaultEngine, "bing");
        assertEquals(isolated.data?.searchOpacity, 1);
        assertEquals(isolated.data?.webAppHomeLimit, 12);
        assertEquals(isolated.data?.webAppIconSize, "default");
        assertEquals(isolated.data?.showAppLabels, true);
        assertEquals(isolated.data?.canvasMotion, "off");
        assertEquals(isolated.data?.canvasMotionLevel, "soft");
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
                { canvasMotion: "breathe" },
                { canvasMotionLevel: "invalid" },
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
                { webAppIconSize: "huge" },
                { searchOpacity: 0.05 },
                { searchOpacity: 1.5 },
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

Deno.test("preferences: new user GET and guest GET return canonical defaults including ambient fields and mask 0.36", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });

        // 1. Guest GET returns canonical defaults
        const guestRes = await app.request("/api/preferences");
        assertEquals(guestRes.status, 200);
        const guestBody = await guestRes.json() as Envelope<PreferencesDto>;
        assertEquals(guestBody.data?.canvasMotion, "off");
        assertEquals(guestBody.data?.canvasMotionLevel, "soft");
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
        assertEquals(userBody.data?.canvasMotion, "off");
        assertEquals(userBody.data?.canvasMotionLevel, "soft");
        assertEquals(userBody.data?.wallpaperPresentations, {});
        assertEquals(userBody.data?.accent, "blue");
        assertEquals(userBody.data?.style, "zen");
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
        assertEquals(patchBody.data?.canvasMotion, "off");
        assertEquals(patchBody.data?.canvasMotionLevel, "soft");
        assertEquals(patchBody.data?.wallpaperPresentations, {});
        assertEquals(patchBody.data?.defaultEngine, "duckduckgo");
        assertEquals(patchBody.data?.theme, "dark");
        assertEquals(patchBody.data?.searchTarget, "new");
        assertEquals(patchBody.data?.style, "zen");
        assertEquals(patchBody.data?.searchShape, "rounded");
        assertEquals(patchBody.data?.searchOpacity, 1);
        assertEquals(patchBody.data?.webAppHomeLimit, 12);
        assertEquals(patchBody.data?.webAppIconSize, "default");
        assertEquals(patchBody.data?.showAppLabels, true);

        // Verify subsequent GET confirms DB persistence
        const getRes = await app.request("/api/preferences", {
            headers: { cookie },
        });
        assertEquals(getRes.status, 200);
        const getBody = await getRes.json() as Envelope<PreferencesDto>;
        assertEquals(getBody.data?.canvasMotion, "off");
        assertEquals(getBody.data?.canvasMotionLevel, "soft");
        assertEquals(getBody.data?.wallpaperPresentations, {});
        assertEquals(getBody.data?.defaultEngine, "duckduckgo");
        assertEquals(getBody.data?.theme, "dark");
        assertEquals(getBody.data?.searchTarget, "new");
    } finally {
        await store.close();
    }
});
Deno.test("preferences: canvasMotion and presentation fields accept valid stages and reject invalid enums", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });

        const regRes = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username: "ambient_user",
                displayName: "Ambient",
                password: "Password123456!",
            }),
        });
        const cookie = regRes.headers.get("set-cookie")?.split(";")[0] ?? "";

        // Accept valid canvasMotion stages
        for (const mode of ["off", "ambient"] as const) {
            const res = await app.request("/api/preferences", {
                method: "PATCH",
                headers: { origin, cookie, "content-type": "application/json" },
                body: JSON.stringify({ canvasMotion: mode }),
            });
            assertEquals(res.status, 200);
            const body = await res.json() as Envelope<PreferencesDto>;
            assertEquals(body.data?.canvasMotion, mode);
        }

        // Accept valid canvasMotionLevel stages
        for (
            const level of [
                "subtle",
                "soft",
                "standard",
                "pronounced",
            ] as const
        ) {
            const res = await app.request("/api/preferences", {
                method: "PATCH",
                headers: { origin, cookie, "content-type": "application/json" },
                body: JSON.stringify({ canvasMotionLevel: level }),
            });
            assertEquals(res.status, 200);
            const body = await res.json() as Envelope<PreferencesDto>;
            assertEquals(body.data?.canvasMotionLevel, level);
        }

        // Accept valid wallpaperPresentations
        const testPresentation = {
            readability: "quiet",
            softness: "soft",
            tone: "mono",
            motion: "drift",
            motionLevel: "pronounced",
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
        assertEquals(
            presBody.data?.wallpaperPresentations
                ?.["https://example.com/bg.jpg"]
                ?.tone,
            "mono",
        );
        assertEquals(
            presBody.data?.wallpaperPresentations
                ?.["https://example.com/bg.jpg"]
                ?.motion,
            "drift",
        );
        assertEquals(
            presBody.data?.wallpaperPresentations
                ?.["https://example.com/bg.jpg"]
                ?.motionLevel,
            "pronounced",
        );

        // Reject invalid enums and ranges
        for (
            const patch of [
                { canvasMotion: "breathe" },
                { canvasMotion: "breathe_ripple" },
                { canvasMotion: "unknown" },
                { canvasMotionLevel: "high" },
                { canvasMotionLevel: 1 },
                {
                    wallpaperPresentations: {
                        "https://example.com/bg.jpg": {
                            readability: "super",
                        },
                    },
                },
                {
                    wallpaperPresentations: {
                        "https://example.com/bg.jpg": { tone: "sepia" },
                    },
                },
                {
                    wallpaperPresentations: {
                        "https://example.com/bg.jpg": { motion: "spin" },
                    },
                },
                {
                    wallpaperPresentations: {
                        "https://example.com/bg.jpg": { motionLevel: "max" },
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

Deno.test("preferences: subsequent partial updates preserve existing presentation and canvas motion fields", async () => {
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

        // Initial setup with customized canvas motion and wallpaper presentations
        const initRes = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                accent: "emerald",
                canvasMotion: "ambient",
                canvasMotionLevel: "pronounced",
                wallpaperPresentations: {
                    "https://example.com/wall-1.jpg": {
                        readability: "focus",
                        softness: "hazy",
                        tone: "soft",
                        motion: "drift",
                        motionLevel: "standard",
                        composition: { focalX: 0.4, focalY: 0.6 },
                    },
                },
            }),
        });
        assertEquals(initRes.status, 200);
        const initBody = await initRes.json() as Envelope<PreferencesDto>;
        assertEquals(initBody.data?.accent, "emerald");
        assertEquals(initBody.data?.canvasMotion, "ambient");
        assertEquals(initBody.data?.canvasMotionLevel, "pronounced");
        assertEquals(
            initBody.data
                ?.wallpaperPresentations?.["https://example.com/wall-1.jpg"]
                ?.readability,
            "focus",
        );

        // Partial update 1: change only canvasMotionLevel to "soft"
        const patch1 = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({ canvasMotionLevel: "soft" }),
        });
        assertEquals(patch1.status, 200);
        const body1 = await patch1.json() as Envelope<PreferencesDto>;
        assertEquals(body1.data?.canvasMotionLevel, "soft");
        assertEquals(body1.data?.canvasMotion, "ambient");
        assertEquals(body1.data?.accent, "emerald");
        assertEquals(
            body1.data
                ?.wallpaperPresentations?.["https://example.com/wall-1.jpg"]
                ?.readability,
            "focus",
        );

        // Partial update 2: change only canvasMotion to "off"
        const patch2 = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({ canvasMotion: "off" }),
        });
        assertEquals(patch2.status, 200);
        const body2 = await patch2.json() as Envelope<PreferencesDto>;
        assertEquals(body2.data?.canvasMotion, "off");
        assertEquals(body2.data?.canvasMotionLevel, "soft");
        assertEquals(body2.data?.accent, "emerald");
        assertEquals(
            body2.data
                ?.wallpaperPresentations?.["https://example.com/wall-1.jpg"]
                ?.readability,
            "focus",
        );

        // Partial update 3: add presentation for a second wallpaper
        const patch3 = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                wallpaperPresentations: {
                    "https://example.com/wall-2.jpg": {
                        readability: "clear",
                        softness: "none",
                        tone: "natural",
                        motion: "zoom",
                        motionLevel: "subtle",
                        composition: { focalX: 0.5, focalY: 0.5 },
                    },
                },
            }),
        });
        assertEquals(patch3.status, 200);
        const body3 = await patch3.json() as Envelope<PreferencesDto>;
        assertEquals(body3.data?.canvasMotion, "off");
        assertEquals(body3.data?.canvasMotionLevel, "soft");
        assertEquals(body3.data?.accent, "emerald");
        assertEquals(
            body3.data
                ?.wallpaperPresentations?.["https://example.com/wall-1.jpg"]
                ?.readability,
            "focus",
        );
        assertEquals(
            body3.data
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
            assertEquals(dbRows[0]?.wallpaperGlowStrength, 0.14);
            assertEquals(dbRows[0]?.ambientMotionMode, "breathe_ripple");
            assertEquals(dbRows[0]?.ambientMotionStrength, 0.35);

            // Verify public GET API returns clean DTO with new defaults
            const upgraded = await read(id);
            assertEquals(upgraded?.accent, accent);
            assertEquals(upgraded?.canvasMotion, "off");
            assertEquals(upgraded?.canvasMotionLevel, "soft");
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
        assertEquals(futureDb[0]?.wallpaperGlowStrength, 0.14);
        assertEquals(futureDb[0]?.ambientMotionMode, "breathe_ripple");
        assertEquals(futureDb[0]?.ambientMotionStrength, 0.35);

        const future = await read("future");
        assertEquals(future?.canvasMotion, "off");
        assertEquals(future?.canvasMotionLevel, "soft");
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
                wallpaperBlur: 5,
                wallpaperGrayscale: 0.5,
                wallpaperMask: 0.24,
                wallpaperGlowStrength: 0.20,
                ambientMotionMode: "breathe",
                ambientMotionStrength: 0.75,
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
        assertEquals(body.data?.canvasMotion, "off");
        assertEquals(body.data?.canvasMotionLevel, "soft");

        // Migrated presentation for legacy.jpg
        const pres = body.data?.wallpaperPresentations
            ?.["https://example.com/legacy.jpg"];
        assertEquals(pres?.readability, "balanced"); // 0.24 -> balanced
        assertEquals(pres?.softness, "soft"); // 5px -> soft
        assertEquals(pres?.tone, "soft"); // 0.50 -> soft
        assertEquals(pres?.motion, "ambient"); // breathe -> ambient
        assertEquals(pres?.motionLevel, "pronounced"); // 0.75 -> pronounced
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
                        softness: "hazy",
                        tone: "mono",
                        motion: "zoom",
                        motionLevel: "pronounced",
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
        assertEquals(
            clearBody.data
                ?.wallpaperPresentations?.["https://example.com/to-clear.jpg"]
                ?.tone,
            "mono",
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
                softness: "none",
                tone: "natural",
                motion: "off",
                motionLevel: "soft",
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

Deno.test("preferences: desktopScene defaults to none, validates, preserves other fields and isolates users", async () => {
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
            return response.headers.get("set-cookie")?.split(";")[0] ?? "";
        };
        const patch = (cookie: string, payload: unknown) =>
            app.request("/api/preferences", {
                method: "PATCH",
                headers: { origin, cookie, "content-type": "application/json" },
                body: JSON.stringify(payload),
            });
        const read = async (cookie?: string) => {
            const response = await app.request("/api/preferences", {
                headers: cookie ? { cookie } : {},
            });
            assertEquals(response.status, 200);
            return (await response.json() as Envelope<PreferencesDto>).data;
        };

        // 访客与新用户默认关闭场景
        assertEquals((await read())?.desktopScene, "none");
        const first = await register("scene_a");
        const second = await register("scene_b");
        assertEquals((await read(first))?.desktopScene, "none");

        // 先写入其他外观字段，再只改场景，其余字段必须保持
        assertEquals(
            (await patch(first, {
                accent: "violet",
                canvasMotion: "ambient",
                canvasMotionLevel: "pronounced",
            })).status,
            200,
        );
        const enabled = await patch(first, { desktopScene: "amusement-park" });
        assertEquals(enabled.status, 200);
        const enabledBody = await enabled.json() as Envelope<PreferencesDto>;
        assertEquals(enabledBody.data?.desktopScene, "amusement-park");
        assertEquals(enabledBody.data?.accent, "violet");
        assertEquals(enabledBody.data?.canvasMotion, "ambient");
        assertEquals(enabledBody.data?.canvasMotionLevel, "pronounced");

        // 反向：修改其他字段不会重置场景
        assertEquals((await patch(first, { theme: "dark" })).status, 200);
        assertEquals((await read(first))?.desktopScene, "amusement-park");

        // 用户之间互不影响
        assertEquals((await read(second))?.desktopScene, "none");

        // 非法值被拒绝，且不改变已保存的值
        for (
            const invalid of [
                { desktopScene: "undersea" },
                { desktopScene: "AMUSEMENT-PARK" },
                { desktopScene: "" },
                { desktopScene: null },
                { desktopScene: 1 },
            ]
        ) {
            const response = await patch(first, invalid);
            assertEquals(response.status, 400, JSON.stringify(invalid));
            await response.body?.cancel();
        }
        assertEquals((await read(first))?.desktopScene, "amusement-park");

        // 关闭
        const disabled = await patch(first, { desktopScene: "none" });
        assertEquals(disabled.status, 200);
        assertEquals((await read(first))?.desktopScene, "none");
    } finally {
        await store.close();
    }
});

Deno.test("preferences: unknown stored desktopScene degrades to none without affecting other fields", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });
        await store.run(async (db) => {
            await db.insert(users).values({
                id: "newer",
                username: "newer",
                displayName: "Newer",
                passwordHash: "hash",
                createdAt: 1,
                updatedAt: 1,
            }).run();
            // 模拟回滚/升级后遇到本版本不认识的场景 ID
            await db.insert(preferences).values({
                userId: "newer",
                accent: "cyan",
                desktopScene: "undersea",
            }).run();
        });
        const session = await auth.createSession("newer", 1);
        const response = await app.request("/api/preferences", {
            headers: { cookie: SESSION_COOKIE_NAME + "=" + session.token },
        });
        assertEquals(response.status, 200);
        const body = await response.json() as Envelope<PreferencesDto>;
        assertEquals(body.data?.desktopScene, "none");
        assertEquals(body.data?.accent, "cyan");
    } finally {
        await store.close();
    }
});
