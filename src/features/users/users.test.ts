import { assertEquals, assertNotEquals } from "@std/assert";
import { STATUS_CODE } from "@std/http";
import type { Hono } from "hono";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import type { AppEnv } from "../../serve/env.ts";
import { createAuthTestApp } from "../auth/test-app.ts";
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

    const app = createAuthTestApp({
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

Deno.test({
    name:
        "admin spec §15/§16: create, reset password forcing change, two-stage soft delete, and audit logging",
    async fn() {
        const { store, auth, app } = await setupTestApp();
        try {
            // 1. Create admin user
            const adminId = crypto.randomUUID();
            const now = Date.now();
            await store.run(async (db) => {
                await db.insert(users).values({
                    id: adminId,
                    username: "super_admin",
                    displayName: "Super Admin",
                    passwordHash: "dummyhash",
                    role: "admin",
                    disabled: false,
                    authVersion: 1,
                    createdAt: now,
                    updatedAt: now,
                });
            });
            const adminSession = await auth.createSession(adminId, 1);
            const adminToken = adminSession.token;

            // 2. Admin creates a new user with optional email
            const createRes = await app.request("/api/admin/users", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
                },
                body: JSON.stringify({
                    username: "target_user",
                    email: "target@example.com",
                    displayName: "Target User",
                    password: "Password123456!",
                }),
            });
            assertEquals(createRes.status, STATUS_CODE.OK);
            const createBody = await createRes.json() as Envelope<
                { user: AdminUserDto & { email?: string } }
            >;
            const targetUserId = createBody.data!.user.id;
            assertEquals(createBody.data!.user.username, "target_user");
            assertEquals(createBody.data!.user.email, "target@example.com");

            // 3. User logs in
            const loginRes = await app.request("/api/auth/login", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    account: "target@example.com",
                    password: "Password123456!",
                }),
            });
            assertEquals(loginRes.status, STATUS_CODE.OK);
            const userToken = extractCookie(loginRes, SESSION_COOKIE_NAME)!;
            assertNotEquals(userToken, null);

            // Check user mustChangePassword is false initially
            const meRes1 = await app.request("/api/auth/me", {
                method: "GET",
                headers: { cookie: `${SESSION_COOKIE_NAME}=${userToken}` },
            });
            const meBody1 = await meRes1.json() as Envelope<
                { user: { mustChangePassword: boolean } }
            >;
            assertEquals(meBody1.data?.user.mustChangePassword, false);

            // 4. Admin resets target user's password -> must force password change & revoke sessions
            const resetRes = await app.request(
                `/api/admin/users/${targetUserId}/password`,
                {
                    method: "PUT",
                    headers: {
                        "origin": ORIGIN,
                        "content-type": "application/json",
                        cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
                    },
                    body: JSON.stringify({
                        password: "NewTempPassword123!",
                    }),
                },
            );
            assertEquals(resetRes.status, STATUS_CODE.OK);

            // Old user session is revoked (401)
            const meResOld = await app.request("/api/auth/me", {
                method: "GET",
                headers: { cookie: `${SESSION_COOKIE_NAME}=${userToken}` },
            });
            assertEquals(meResOld.status, STATUS_CODE.Unauthorized);

            // User logs in with new temporary password
            const loginNewRes = await app.request("/api/auth/login", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    account: "target_user",
                    password: "NewTempPassword123!",
                }),
            });
            assertEquals(loginNewRes.status, STATUS_CODE.OK);
            const loginNewBody = await loginNewRes.json() as Envelope<
                { user: { mustChangePassword: boolean } }
            >;
            assertEquals(loginNewBody.data?.user.mustChangePassword, true);
            const newUserToken = extractCookie(
                loginNewRes,
                SESSION_COOKIE_NAME,
            )!;

            // 5. Two-stage delete
            // Stage 1: delete without confirmation returns 400 with requiresConfirmation
            const deleteStage1Res = await app.request(
                `/api/admin/users/${targetUserId}`,
                {
                    method: "DELETE",
                    headers: {
                        "origin": ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
                    },
                },
            );
            assertEquals(deleteStage1Res.status, STATUS_CODE.BadRequest);
            const stage1Body = await deleteStage1Res.json() as {
                data: { requiresConfirmation: boolean };
            };
            assertEquals(stage1Body.data?.requiresConfirmation, true);

            // Stage 2: delete with confirm=true
            const deleteStage2Res = await app.request(
                `/api/admin/users/${targetUserId}?confirm=true`,
                {
                    method: "DELETE",
                    headers: {
                        "origin": ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
                    },
                },
            );
            assertEquals(deleteStage2Res.status, STATUS_CODE.OK);

            // Deleted user cannot access /api/auth/me anymore
            const meAfterDelete = await app.request("/api/auth/me", {
                method: "GET",
                headers: { cookie: `${SESSION_COOKIE_NAME}=${newUserToken}` },
            });
            assertEquals(meAfterDelete.status, STATUS_CODE.Unauthorized);

            // Deleted user cannot log in
            const loginDeletedRes = await app.request("/api/auth/login", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    username: "target_user",
                    password: "NewTempPassword123!",
                }),
            });
            assertEquals(loginDeletedRes.status, STATUS_CODE.BadRequest);

            // 6. Check Audit Logs (Spec §16)
            const auditRes = await app.request("/api/admin/audit-logs", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
                },
            });
            assertEquals(auditRes.status, STATUS_CODE.OK);
            const auditBody = await auditRes.json() as Envelope<{
                items: Array<{
                    action: string;
                    targetType: string;
                    targetId: string;
                    metadataJson: string | null;
                }>;
            }>;

            const actions = auditBody.data?.items.map((i) => i.action);
            assertEquals(actions?.includes("admin.user.create"), true);
            assertEquals(actions?.includes("admin.user.reset_password"), true);
            assertEquals(actions?.includes("admin.user.delete"), true);

            // Verify that no passwords or secrets leaked into metadataJson
            for (const item of auditBody.data?.items ?? []) {
                if (item.metadataJson) {
                    assertEquals(item.metadataJson.includes("Password"), false);
                    assertEquals(item.metadataJson.includes("password"), false);
                }
            }
        } finally {
            await store.close();
        }
    },
});
