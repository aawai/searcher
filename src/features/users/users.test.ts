import { assertEquals, assertNotEquals } from "@std/assert";
import { STATUS_CODE } from "@std/http";
import type { Hono } from "hono";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import type { AppEnv } from "../../serve/env.ts";
import { createApp } from "../../app.ts";
import type { AdminUserDto, Envelope } from "@shared/contracts.ts";
import { users } from "../../db/schema.ts";

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
    name: "users admin contract: role-based access control and user management",
    async fn() {
        const { store, auth, app } = await setupTestApp();
        try {
            // Register normal user
            const normalUserToken = await registerUser(app, "normal_user");

            // Non-admin request to /api/admin/users must return 403 Forbidden
            const forbiddenRes = await app.request("/api/admin/users", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${normalUserToken}`,
                },
            });
            assertEquals(forbiddenRes.status, STATUS_CODE.Forbidden);
            const forbiddenBody = await forbiddenRes.json() as Envelope<never>;
            assertEquals(forbiddenBody.status, false);

            // Create admin user directly in DB
            const adminId = crypto.randomUUID();
            const now = Date.now();
            await store.run(async (db) => {
                await db.insert(users).values({
                    id: adminId,
                    username: "admin_tester",
                    displayName: "Admin Tester",
                    passwordHash: "dummyhash",
                    role: "admin",
                    disabled: false,
                    authVersion: 1,
                    createdAt: now,
                    updatedAt: now,
                });
            });

            // Create admin session
            const adminSession = await auth.createSession(adminId, 1);
            const adminToken = adminSession.token;

            // Admin can list users
            const listRes = await app.request("/api/admin/users", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
                },
            });
            assertEquals(listRes.status, STATUS_CODE.OK);
            const listBody = await listRes.json() as Envelope<{
                items: AdminUserDto[];
                page: number;
                total: number;
            }>;
            assertEquals(listBody.data?.items.length, 2); // normal_user + admin_tester

            // Find normal user's id
            const targetUser = listBody.data?.items.find((u) =>
                u.username === "normal_user"
            );
            assertNotEquals(targetUser, undefined);

            // Admin disables normal user
            const patchRes = await app.request(
                `/api/admin/users/${targetUser!.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "origin": ORIGIN,
                        "content-type": "application/json",
                        cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
                    },
                    body: JSON.stringify({
                        disabled: true,
                    }),
                },
            );
            assertEquals(patchRes.status, STATUS_CODE.OK);

            // Disabled normal user's session is revoked: accessing /api/auth/me returns 401
            const meRes = await app.request("/api/auth/me", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${normalUserToken}`,
                },
            });
            assertEquals(meRes.status, STATUS_CODE.Unauthorized);

            // Disabling the admin themselves is forbidden (403)
            const selfDisableRes = await app.request(
                `/api/admin/users/${adminId}`,
                {
                    method: "PATCH",
                    headers: {
                        "origin": ORIGIN,
                        "content-type": "application/json",
                        cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
                    },
                    body: JSON.stringify({
                        disabled: true,
                    }),
                },
            );
            assertEquals(selfDisableRes.status, STATUS_CODE.Forbidden);
        } finally {
            await store.close();
        }
    },
});
