import { assertEquals, assertNotEquals } from "@std/assert";
import { STATUS_CODE } from "@std/http";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService, SESSION_COOKIE_NAME } from "./service.ts";
import { createAuthTestApp } from "./test-app.ts";
import type { Envelope, UserDto } from "@shared/contracts.ts";
import { eq, sql } from "drizzle-orm";
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

Deno.test({
    name: "auth contract: register, me, logout lifecycle with session cookie",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            // 1. Register new user
            const regRes = await app.request("/api/auth/register", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    username: "alice_contract",
                    displayName: "Alice Contract",
                    password: "Password123456!",
                }),
            });

            assertEquals(regRes.status, STATUS_CODE.OK);
            const regBody = await regRes.json() as Envelope<{ user: UserDto }>;
            assertEquals(regBody.status, true);
            assertEquals(regBody.data?.user.username, "alice_contract");
            assertEquals(regBody.data?.user.role, "user");

            const sessionToken = extractCookie(regRes, SESSION_COOKIE_NAME);
            assertNotEquals(sessionToken, null);

            // 2. Access protected /api/auth/me with session cookie
            const meRes = await app.request("/api/auth/me", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
                },
            });
            assertEquals(meRes.status, STATUS_CODE.OK);
            const meBody = await meRes.json() as Envelope<{ user: UserDto }>;
            assertEquals(meBody.status, true);
            assertEquals(meBody.data?.user.id, regBody.data?.user.id);

            // 3. Logout revokes session
            const logoutRes = await app.request("/api/auth/logout", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
                },
            });
            assertEquals(logoutRes.status, STATUS_CODE.OK);

            // 4. Accessing /api/auth/me after logout must be rejected with 401
            const meAfterLogout = await app.request("/api/auth/me", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
                },
            });
            assertEquals(meAfterLogout.status, STATUS_CODE.Unauthorized);
            const meAfterBody = await meAfterLogout.json() as Envelope<never>;
            assertEquals(meAfterBody.status, false);
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "auth contract: unauthenticated requests to protected endpoints return 401 envelope",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            const res = await app.request("/api/auth/me", {
                method: "GET",
            });
            assertEquals(res.status, STATUS_CODE.Unauthorized);
            const body = await res.json() as Envelope<never>;
            assertEquals(body.status, false);
            assertEquals(body.code, STATUS_CODE.Unauthorized);
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "auth contract: account password change increments authVersion and revokes old sessions",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            // Register
            const regRes = await app.request("/api/auth/register", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    username: "bob_contract",
                    displayName: "Bob Contract",
                    password: "Password123456!",
                }),
            });
            const oldToken = extractCookie(regRes, SESSION_COOKIE_NAME);
            assertNotEquals(oldToken, null);

            // Change password
            const changeRes = await app.request("/api/account/password", {
                method: "PUT",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${oldToken}`,
                },
                body: JSON.stringify({
                    currentPassword: "Password123456!",
                    newPassword: "NewStrongPassword789!",
                }),
            });
            assertEquals(changeRes.status, STATUS_CODE.OK);

            // Old session token must now be invalid
            const meWithOld = await app.request("/api/auth/me", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${oldToken}`,
                },
            });
            assertEquals(meWithOld.status, STATUS_CODE.Unauthorized);

            // Login with new password succeeds and gets new session
            const loginRes = await app.request("/api/auth/login", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    username: "bob_contract",
                    password: "NewStrongPassword789!",
                }),
            });
            assertEquals(loginRes.status, STATUS_CODE.OK);
            const newToken = extractCookie(loginRes, SESSION_COOKIE_NAME);
            assertNotEquals(newToken, null);

            const meWithNew = await app.request("/api/auth/me", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${newToken}`,
                },
            });
            assertEquals(meWithNew.status, STATUS_CODE.OK);
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name: "auth security: Origin and Content-Type checks on mutating endpoints",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            // 1. Missing Origin header on POST must be 403 Forbidden
            const noOriginRes = await app.request("/api/auth/register", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    username: "evil_csrf",
                    displayName: "Evil",
                    password: "Password123456!",
                }),
            });
            assertEquals(noOriginRes.status, STATUS_CODE.Forbidden);

            // 2. Mismatched Origin header on POST must be 403 Forbidden
            const mismatchOriginRes = await app.request("/api/auth/register", {
                method: "POST",
                headers: {
                    "origin": "https://attacker.com",
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    username: "evil_csrf",
                    displayName: "Evil",
                    password: "Password123456!",
                }),
            });
            assertEquals(mismatchOriginRes.status, STATUS_CODE.Forbidden);

            // 3. Non-json content-type on mutating endpoint with body must be 415
            const badContentTypeRes = await app.request("/api/auth/register", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "text/plain",
                },
                body: "hello world",
            });
            assertEquals(
                badContentTypeRes.status,
                STATUS_CODE.UnsupportedMediaType,
            );
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "auth security: login returns 429 after 10 attempts on one account without affecting others",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            const login = (username: string) =>
                app.request("/api/auth/login", {
                    method: "POST",
                    headers: {
                        "origin": ORIGIN,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        username,
                        password: "WrongPassword123!",
                    }),
                });
            for (let attempt = 0; attempt < 10; attempt++) {
                const res = await login("ratelimited_user");
                assertEquals(res.status, STATUS_CODE.BadRequest);
            }

            const limited = await login("ratelimited_user");
            assertEquals(limited.status, STATUS_CODE.TooManyRequests);
            assertNotEquals(limited.headers.get("Retry-After"), null);

            const otherAccount = await login("other_user");
            assertEquals(otherAccount.status, STATUS_CODE.BadRequest);
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "auth security: optimistic authVersion check prevents stale password overwrite",
    async fn() {
        const { store, auth, app } = await setupTestApp();
        try {
            // Register
            const regRes = await app.request("/api/auth/register", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    username: "carol_race",
                    displayName: "Carol Race",
                    password: "Password123456!",
                }),
            });
            const sessionToken = extractCookie(regRes, SESSION_COOKIE_NAME)!;

            // To simulate race condition: verify password succeeds with current authVersion,
            // but before the transaction completes, an out-of-band reset/change updates authVersion.
            // We test this by hooking verifyPassword or by simulating concurrent update right before transaction.
            const origVerify = auth.verifyPassword.bind(auth);
            auth.verifyPassword = async (candidate: string, hash: string) => {
                const result = await origVerify(candidate, hash);
                // Concurrent race right after verifyPassword (during hashing)
                await store.run(async (db) => {
                    await db
                        .update(users)
                        .set({
                            authVersion: sql`auth_version + 1`,
                        })
                        .where(eq(users.username, "carol_race"));
                });
                return result;
            };
            // Attempting to change password now should fail optimistic concurrency (409)
            const changeRes = await app.request("/api/account/password", {
                method: "PUT",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
                },
                body: JSON.stringify({
                    currentPassword: "Password123456!",
                    newPassword: "NewStrongPassword789!",
                }),
            });
            assertEquals(changeRes.status, STATUS_CODE.Conflict);
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "auth spec §14: register/login with optional unique email, login by username or email",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            // 1. Register with email
            const regRes = await app.request("/api/auth/register", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    username: "david_spec14",
                    email: "david@example.com",
                    displayName: "David Spec14",
                    password: "Password123456!",
                }),
            });
            assertEquals(regRes.status, STATUS_CODE.OK);

            // 2. Duplicate email registration rejected with 409
            const dupEmailRes = await app.request("/api/auth/register", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    username: "david_other",
                    email: "david@example.com",
                    displayName: "David Dup",
                    password: "Password123456!",
                }),
            });
            assertEquals(dupEmailRes.status, STATUS_CODE.Conflict);

            // 3. Login by email
            const loginByEmailRes = await app.request("/api/auth/login", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    account: "david@example.com",
                    password: "Password123456!",
                }),
            });
            assertEquals(loginByEmailRes.status, STATUS_CODE.OK);
            const emailLoginBody = await loginByEmailRes.json() as Envelope<
                { user: UserDto }
            >;
            assertEquals(emailLoginBody.data?.user.username, "david_spec14");

            // 4. Login by username
            const loginByUserRes = await app.request("/api/auth/login", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    username: "david_spec14",
                    password: "Password123456!",
                }),
            });
            assertEquals(loginByUserRes.status, STATUS_CODE.OK);
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "auth spec §14: remember-me session duration (7 vs 30 days) and device listing/revocation",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            // Register
            const regRes = await app.request("/api/auth/register", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    username: "eve_devices",
                    displayName: "Eve Devices",
                    password: "Password123456!",
                }),
            });
            const sessionToken1 = extractCookie(regRes, SESSION_COOKIE_NAME)!;
            assertNotEquals(sessionToken1, null);

            // Normal login (7 days = 604800s)
            const loginNormalRes = await app.request("/api/auth/login", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    username: "eve_devices",
                    password: "Password123456!",
                    rememberMe: false,
                }),
            });
            const setCookieNormal = loginNormalRes.headers.get("set-cookie")!;
            assertEquals(setCookieNormal.includes("Max-Age=604800"), true);
            const sessionToken2 = extractCookie(
                loginNormalRes,
                SESSION_COOKIE_NAME,
            )!;

            // Remember-me login (30 days = 2592000s)
            const loginRememberRes = await app.request("/api/auth/login", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    username: "eve_devices",
                    password: "Password123456!",
                    rememberMe: true,
                }),
            });
            const setCookieRemember = loginRememberRes.headers.get(
                "set-cookie",
            )!;
            assertEquals(setCookieRemember.includes("Max-Age=2592000"), true);
            const sessionToken3 = extractCookie(
                loginRememberRes,
                SESSION_COOKIE_NAME,
            )!;

            // Device list
            const devicesRes = await app.request("/api/auth/devices", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${sessionToken3}`,
                },
            });
            assertEquals(devicesRes.status, STATUS_CODE.OK);
            const devicesBody = await devicesRes.json() as Envelope<{
                devices: Array<{ id: string; isCurrent: boolean }>;
            }>;
            assertEquals(devicesBody.data?.devices.length, 3);
            const currentDevice = devicesBody.data?.devices.find((d) =>
                d.isCurrent
            );
            assertNotEquals(currentDevice, undefined);

            // Revoke other devices
            const revokeOthersRes = await app.request(
                "/api/auth/devices/revoke-others",
                {
                    method: "POST",
                    headers: {
                        "origin": ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${sessionToken3}`,
                    },
                },
            );
            assertEquals(revokeOthersRes.status, STATUS_CODE.OK);

            // sessionToken2 should now be revoked (401)
            const testRevokedRes = await app.request("/api/auth/me", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${sessionToken2}`,
                },
            });
            assertEquals(testRevokedRes.status, STATUS_CODE.Unauthorized);

            // sessionToken3 should still be valid
            const testCurrentRes = await app.request("/api/auth/me", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${sessionToken3}`,
                },
            });
            assertEquals(testCurrentRes.status, STATUS_CODE.OK);
            const logoutCurrent = await app.request(
                `/api/auth/devices/${currentDevice!.id}`,
                {
                    method: "DELETE",
                    headers: {
                        origin: ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${sessionToken3}`,
                    },
                },
            );
            assertEquals(logoutCurrent.status, STATUS_CODE.OK);
            assertEquals(
                logoutCurrent.headers.get("set-cookie")?.includes("Max-Age=0"),
                true,
            );
            const loggedOut = await app.request("/api/auth/me", {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionToken3}` },
            });
            assertEquals(loggedOut.status, STATUS_CODE.Unauthorized);
        } finally {
            await store.close();
        }
    },
});
