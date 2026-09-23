import { assertEquals } from "@std/assert";
import { STATUS_CODE } from "@std/http";
import type { Hono } from "hono";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import type { AppEnv } from "../../serve/env.ts";
import { createApp } from "../../app.ts";
import type { BookmarkDto, Envelope } from "@shared/contracts.ts";

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
        "bookmarks contract: strict user isolation and duplicate url conflict",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            const tokenA = await registerUser(app, "bm_user_a");
            const tokenB = await registerUser(app, "bm_user_b");

            // User A creates a bookmark
            const createA = await app.request("/api/bookmarks", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
                },
                body: JSON.stringify({
                    title: "Deno Home",
                    url: "https://deno.com",
                }),
            });
            assertEquals(createA.status, STATUS_CODE.OK);
            const createdA = await createA.json() as Envelope<BookmarkDto>;
            const bmAId = createdA.data!.id;

            // User A duplicate URL creation returns 409 Conflict
            const dupCreateA = await app.request("/api/bookmarks", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
                },
                body: JSON.stringify({
                    title: "Duplicate Deno",
                    url: "https://deno.com",
                }),
            });
            assertEquals(dupCreateA.status, STATUS_CODE.Conflict);

            // User B creates the same URL -> allowed because bookmarks are scoped per user
            const createB = await app.request("/api/bookmarks", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
                },
                body: JSON.stringify({
                    title: "Deno for B",
                    url: "https://deno.com",
                }),
            });
            assertEquals(createB.status, STATUS_CODE.OK);

            // User B cannot patch User A's bookmark -> 404 NotFound
            const patchAlien = await app.request(`/api/bookmarks/${bmAId}`, {
                method: "PATCH",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
                },
                body: JSON.stringify({
                    title: "Hacked by B",
                }),
            });
            assertEquals(patchAlien.status, STATUS_CODE.NotFound);

            // User B cannot delete User A's bookmark -> 404 NotFound
            const deleteAlien = await app.request(`/api/bookmarks/${bmAId}`, {
                method: "DELETE",
                headers: {
                    "origin": ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
                },
            });
            assertEquals(deleteAlien.status, STATUS_CODE.NotFound);

            // User A lists bookmarks -> contains 1 bookmark
            const listA = await app.request("/api/bookmarks", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
                },
            });
            assertEquals(listA.status, STATUS_CODE.OK);
            const listABody = await listA.json() as Envelope<BookmarkDto[]>;
            assertEquals(listABody.data?.length, 1);
            assertEquals(listABody.data?.[0].id, bmAId);
        } finally {
            await store.close();
        }
    },
});
