import { assertEquals } from "@std/assert";
import { STATUS_CODE } from "@std/http";
import type { Hono } from "hono";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import type { AppEnv } from "../../serve/env.ts";
import { createApp } from "../../app.ts";
import type { Envelope, PreferencesDto } from "@shared/contracts.ts";

const ORIGIN = "http://localhost:8000";

async function setupTestApp() {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);

    const auth = new AuthService({
        store,
        origin: ORIGIN,
    });

    const app = createApp({
        store,
        auth,
        origin: ORIGIN,
        now: () => Date.now(),
    });

    return { store, auth, app };
}

function extractCookie(response: Response, name: string): string | null {
    const setCookie = response.headers.get("set-cookie");
    if (!setCookie) return null;
    const match = setCookie.match(new RegExp(`${name}=([^;]+)`));
    return match ? match[1] : null;
}

async function registerUser(app: Hono<AppEnv>, username: string) {
    const res = await app.request("/api/auth/register", {
        method: "POST",
        headers: {
            "origin": ORIGIN,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            username,
            displayName: `Display ${username}`,
            password: "Password123456!",
        }),
    });
    const token = extractCookie(res, SESSION_COOKIE_NAME);
    return token!;
}

Deno.test({
    name:
        "preferences contract: default values, user isolation, and patch updates",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            const tokenA = await registerUser(app, "pref_user_a");
            const tokenB = await registerUser(app, "pref_user_b");

            // User A gets initial preferences
            const getA1 = await app.request("/api/preferences", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
                },
            });
            assertEquals(getA1.status, STATUS_CODE.OK);
            const prefA1 = await getA1.json() as Envelope<PreferencesDto>;
            assertEquals(prefA1.data?.defaultEngine, "bing");
            assertEquals(prefA1.data?.theme, "system");

            // User A patches theme to "dark" and engine to "google"
            const patchA = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
                },
                body: JSON.stringify({
                    defaultEngine: "google",
                    theme: "dark",
                }),
            });
            assertEquals(patchA.status, STATUS_CODE.OK);
            const patchABody = await patchA.json() as Envelope<PreferencesDto>;
            assertEquals(patchABody.data?.defaultEngine, "google");
            assertEquals(patchABody.data?.theme, "dark");

            // User B's preferences remain default (user isolation)
            const getB = await app.request("/api/preferences", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
                },
            });
            assertEquals(getB.status, STATUS_CODE.OK);
            const prefB = await getB.json() as Envelope<PreferencesDto>;
            assertEquals(prefB.data?.defaultEngine, "bing");
            assertEquals(prefB.data?.theme, "system");
        } finally {
            await store.close();
        }
    },
});
