import type { Envelope, PreferencesDto } from "@shared/contracts.ts";
import { assertEquals } from "@std/assert";
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
                wallpaperBlur: 16,
                wallpaperGrayscale: 0.3,
                wallpaperMask: 0.65,
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
            body: JSON.stringify({ wallpaperMask: 0.4, accent: "rose" }),
        });
        assertEquals(partial.status, 200);
        const changed = await partial.json() as Envelope<PreferencesDto>;
        assertEquals(changed.data?.wallpaperMask, 0.4);
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
        assertEquals(isolated.data?.wallpaperMask, 0.36);
        assertEquals(isolated.data?.wallpaperGlowStrength, 0.14);
        assertEquals(isolated.data?.ambientMotionMode, "breathe_ripple");
        assertEquals(isolated.data?.ambientMotionStrength, 0.35);
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
        assertEquals(guestBody.data?.wallpaperMask, 0.36);
        assertEquals(guestBody.data?.wallpaperGlowStrength, 0.14);
        assertEquals(guestBody.data?.ambientMotionMode, "breathe_ripple");
        assertEquals(guestBody.data?.ambientMotionStrength, 0.35);

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
        assertEquals(userBody.data?.wallpaperMask, 0.36);
        assertEquals(userBody.data?.wallpaperGlowStrength, 0.14);
        assertEquals(userBody.data?.ambientMotionMode, "breathe_ripple");
        assertEquals(userBody.data?.ambientMotionStrength, 0.35);
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
        assertEquals(patchBody.data?.accent, "violet");
        assertEquals(patchBody.data?.wallpaperMask, 0.36);
        assertEquals(patchBody.data?.wallpaperGlowStrength, 0.14);
        assertEquals(patchBody.data?.ambientMotionMode, "breathe_ripple");
        assertEquals(patchBody.data?.ambientMotionStrength, 0.35);
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
        assertEquals(getBody.data?.accent, "violet");
        assertEquals(getBody.data?.wallpaperMask, 0.36);
        assertEquals(getBody.data?.wallpaperGlowStrength, 0.14);
        assertEquals(getBody.data?.ambientMotionMode, "breathe_ripple");
        assertEquals(getBody.data?.ambientMotionStrength, 0.35);
        assertEquals(getBody.data?.defaultEngine, "duckduckgo");
        assertEquals(getBody.data?.theme, "dark");
        assertEquals(getBody.data?.searchTarget, "new");
    } finally {
        await store.close();
    }
});

Deno.test("preferences: ambient fields accept boundary values and reject invalid ranges and enums", async () => {
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

        // Accept boundaries and valid values
        for (
            const [key, value] of [
                ["wallpaperGlowStrength", 0],
                ["wallpaperGlowStrength", 0.14],
                ["wallpaperGlowStrength", 0.30],
                ["ambientMotionStrength", 0],
                ["ambientMotionStrength", 0.35],
                ["ambientMotionStrength", 1],
                ["ambientMotionMode", "off"],
                ["ambientMotionMode", "breathe"],
                ["ambientMotionMode", "breathe_ripple"],
            ] as const
        ) {
            const res = await app.request("/api/preferences", {
                method: "PATCH",
                headers: { origin, cookie, "content-type": "application/json" },
                body: JSON.stringify({ [key]: value }),
            });
            assertEquals(res.status, 200, `Expected 200 for ${key}=${value}`);
            const body = await res.json() as Envelope<PreferencesDto>;
            assertEquals(body.data?.[key as keyof PreferencesDto], value);
        }

        // Reject out-of-range values and invalid enums
        for (
            const patch of [
                { wallpaperGlowStrength: -0.01 },
                { wallpaperGlowStrength: -1 },
                { wallpaperGlowStrength: 0.31 },
                { wallpaperGlowStrength: 1 },
                { ambientMotionStrength: -0.01 },
                { ambientMotionStrength: -0.5 },
                { ambientMotionStrength: 1.01 },
                { ambientMotionStrength: 2 },
                { ambientMotionMode: "none" },
                { ambientMotionMode: "wave" },
                { ambientMotionMode: "ripple" },
                { ambientMotionMode: "" },
                { ambientMotionMode: 123 },
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

Deno.test("preferences: subsequent partial updates preserve existing ambient and appearance fields", async () => {
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

        // Initial setup with customized ambient settings
        const initRes = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                accent: "emerald",
                wallpaperMask: 0.5,
                wallpaperGlowStrength: 0.25,
                ambientMotionMode: "breathe",
                ambientMotionStrength: 0.75,
            }),
        });
        assertEquals(initRes.status, 200);
        const initBody = await initRes.json() as Envelope<PreferencesDto>;
        assertEquals(initBody.data?.accent, "emerald");
        assertEquals(initBody.data?.wallpaperMask, 0.5);
        assertEquals(initBody.data?.wallpaperGlowStrength, 0.25);
        assertEquals(initBody.data?.ambientMotionMode, "breathe");
        assertEquals(initBody.data?.ambientMotionStrength, 0.75);

        // Partial update 1: change only wallpaperGlowStrength to 0.1
        const patch1 = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({ wallpaperGlowStrength: 0.1 }),
        });
        assertEquals(patch1.status, 200);
        const body1 = await patch1.json() as Envelope<PreferencesDto>;
        assertEquals(body1.data?.wallpaperGlowStrength, 0.1);
        assertEquals(body1.data?.accent, "emerald");
        assertEquals(body1.data?.wallpaperMask, 0.5);
        assertEquals(body1.data?.ambientMotionMode, "breathe");
        assertEquals(body1.data?.ambientMotionStrength, 0.75);

        // Partial update 2: change only ambientMotionMode to "off"
        const patch2 = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({ ambientMotionMode: "off" }),
        });
        assertEquals(patch2.status, 200);
        const body2 = await patch2.json() as Envelope<PreferencesDto>;
        assertEquals(body2.data?.ambientMotionMode, "off");
        assertEquals(body2.data?.wallpaperGlowStrength, 0.1);
        assertEquals(body2.data?.accent, "emerald");
        assertEquals(body2.data?.wallpaperMask, 0.5);
        assertEquals(body2.data?.ambientMotionStrength, 0.75);

        // Partial update 3: change only ambientMotionStrength to 0.35
        const patch3 = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({ ambientMotionStrength: 0.35 }),
        });
        assertEquals(patch3.status, 200);
        const body3 = await patch3.json() as Envelope<PreferencesDto>;
        assertEquals(body3.data?.ambientMotionStrength, 0.35);
        assertEquals(body3.data?.ambientMotionMode, "off");
        assertEquals(body3.data?.wallpaperGlowStrength, 0.1);
        assertEquals(body3.data?.accent, "emerald");
        assertEquals(body3.data?.wallpaperMask, 0.5);
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
            const upgraded = await read(id);
            assertEquals(upgraded?.wallpaperMask, mask);
            assertEquals(upgraded?.accent, accent);
            assertEquals(upgraded?.wallpaperGlowStrength, 0.14);
            assertEquals(upgraded?.ambientMotionMode, "breathe_ripple");
            assertEquals(upgraded?.ambientMotionStrength, 0.35);
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
        const future = await read("future");
        assertEquals(future?.wallpaperMask, 0.36);
        assertEquals(future?.wallpaperGlowStrength, 0.14);
        assertEquals(future?.ambientMotionMode, "breathe_ripple");
        assertEquals(future?.ambientMotionStrength, 0.35);
    } finally {
        await store.close();
    }
});
