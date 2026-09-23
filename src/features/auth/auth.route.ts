import * as v from "@valibot/valibot";
import { json, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import { failResponse } from "@internal/hono/middleware/response.ts";
import { eq } from "drizzle-orm";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { preferences, sessions, users } from "../../db/schema.ts";
import { getClientIp, InMemoryRateLimiter } from "./security.ts";

const usernameSchema = v.pipe(
    v.string("用户名必须是字符串"),
    v.trim(),
    v.toLowerCase(),
    v.regex(/^[a-z0-9_]{3,32}$/, "用户名需为 3–32 位的字母、数字或下划线"),
);

const displayNameSchema = v.pipe(
    v.string("展示名称必须是字符串"),
    v.trim(),
    v.minLength(1, "展示名称长度为 1–40 个字符"),
    v.maxLength(40, "展示名称长度为 1–40 个字符"),
);

const passwordSchema = v.pipe(
    v.string("密码必须是字符串"),
    v.minLength(12, "密码长度须为 12–128 个字符"),
    v.maxLength(128, "密码长度须为 12–128 个字符"),
);

const loginUsernameSchema = v.pipe(
    v.string("用户名必须是字符串"),
    v.trim(),
    v.toLowerCase(),
);

const loginPasswordSchema = v.pipe(
    v.string("密码必须是字符串"),
);

export function registerAuthRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
): void {
    const { store, auth } = deps;
    const now = deps.now ?? (() => Date.now());

    // Rate limiters:
    // Auth endpoints by socket IP: 30 per 15 minutes
    const ipLimiter = new InMemoryRateLimiter({
        windowMs: 15 * 60 * 1000,
        maxRequests: 30,
        now,
    });
    // Login by normalized username: 10 per 15 minutes
    const loginUserLimiter = new InMemoryRateLimiter({
        windowMs: 15 * 60 * 1000,
        maxRequests: 10,
        now,
    });

    // 1. PUBLIC POST /api/auth/register
    routes.public.post(
        "/api/auth/register",
        validator({
            username: json(usernameSchema),
            displayName: json(displayNameSchema),
            password: json(passwordSchema),
        }),
        async (c, data) => {
            const ip = getClientIp(c);
            const ipCheck = ipLimiter.consume(`ip:${ip}`);
            if (!ipCheck.ok) {
                c.header("Retry-After", String(ipCheck.retryAfter));
                return failResponse(c, 429, "请求过于频繁，请稍后重试");
            }

            const currentTime = now();
            // Hash password outside DB queue
            const passwordHash = await auth.hashPassword(data.password);
            const userId = crypto.randomUUID();

            const registerResult = await store.run(async (db) => {
                return await db.transaction(async (tx) => {
                    const existing = await tx
                        .select({ id: users.id })
                        .from(users)
                        .where(eq(users.username, data.username))
                        .limit(1)
                        .all();

                    if (existing.length > 0) {
                        return { conflict: true, user: null };
                    }

                    await tx.insert(users).values({
                        id: userId,
                        username: data.username,
                        displayName: data.displayName,
                        passwordHash,
                        role: "user",
                        disabled: false,
                        authVersion: 1,
                        createdAt: currentTime,
                        updatedAt: currentTime,
                    });

                    await tx.insert(preferences).values({
                        userId,
                        defaultEngine: "bing",
                        theme: "system",
                    });

                    return {
                        conflict: false,
                        user: {
                            id: userId,
                            username: data.username,
                            displayName: data.displayName,
                            role: "user" as const,
                        },
                    };
                });
            });

            if (registerResult.conflict || !registerResult.user) {
                return failResponse(c, 409, "用户名已存在");
            }

            // Create session for newly registered user
            const session = await auth.createSession(userId, 1);
            c.header(
                "Set-Cookie",
                auth.buildSessionCookieHeader(session.token),
            );

            return c.success({ user: registerResult.user });
        },
    );

    // 2. PUBLIC POST /api/auth/login
    routes.public.post(
        "/api/auth/login",
        validator({
            username: json(loginUsernameSchema),
            password: json(loginPasswordSchema),
        }),
        async (c, data) => {
            const ip = getClientIp(c);
            const ipCheck = ipLimiter.consume(`ip:${ip}`);
            if (!ipCheck.ok) {
                c.header("Retry-After", String(ipCheck.retryAfter));
                return failResponse(c, 429, "请求过于频繁，请稍后重试");
            }

            const userCheck = loginUserLimiter.consume(`user:${data.username}`);
            if (!userCheck.ok) {
                c.header("Retry-After", String(userCheck.retryAfter));
                return failResponse(c, 429, "请求过于频繁，请稍后重试");
            }

            const foundUser = await store.run(async (db) => {
                const rows = await db
                    .select()
                    .from(users)
                    .where(eq(users.username, data.username))
                    .limit(1)
                    .all();
                return rows[0] ?? null;
            });

            let isValidPassword = false;
            if (foundUser) {
                isValidPassword = await auth.verifyPassword(
                    data.password,
                    foundUser.passwordHash,
                );
            } else {
                // Timing protection: verify against dummy hash
                const dummyHash = await auth.getDummyHash();
                await auth.verifyPassword(data.password, dummyHash);
            }

            if (!foundUser || !isValidPassword || foundUser.disabled) {
                return failResponse(c, 400, "用户名或密码错误");
            }

            const session = await auth.createSession(
                foundUser.id,
                foundUser.authVersion,
            );
            c.header(
                "Set-Cookie",
                auth.buildSessionCookieHeader(session.token),
            );

            return c.success({
                user: {
                    id: foundUser.id,
                    username: foundUser.username,
                    displayName: foundUser.displayName,
                    role: foundUser.role,
                },
            });
        },
    );

    // 3. PROTECTED GET /api/auth/me
    routes.get("/api/auth/me", (c) => {
        const user = c.get("user");
        return c.success({ user });
    });

    // 4. PROTECTED POST /api/auth/logout
    routes.post("/api/auth/logout", async (c) => {
        const token = c.get("sessionToken");
        if (token) {
            await auth.revokeSession(token);
        }
        c.header("Set-Cookie", auth.buildClearSessionCookieHeader());
        return c.success(undefined, "退出成功");
    });

    // 5. PROTECTED PATCH /api/account
    routes.patch(
        "/api/account",
        validator({
            displayName: json(displayNameSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            const currentTime = now();

            const updatedUser = await store.run(async (db) => {
                await db
                    .update(users)
                    .set({
                        displayName: data.displayName,
                        updatedAt: currentTime,
                    })
                    .where(eq(users.id, user.id));

                return {
                    id: user.id,
                    username: user.username,
                    displayName: data.displayName,
                    role: user.role,
                };
            });

            return c.success({ user: updatedUser });
        },
    );

    // 6. PROTECTED PUT /api/account/password
    routes.put(
        "/api/account/password",
        validator({
            currentPassword: json(loginPasswordSchema),
            newPassword: json(passwordSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            const currentTime = now();

            const currentRecord = await store.run(async (db) => {
                const rows = await db
                    .select({
                        passwordHash: users.passwordHash,
                        authVersion: users.authVersion,
                    })
                    .from(users)
                    .where(eq(users.id, user.id))
                    .limit(1)
                    .all();
                return rows[0] ?? null;
            });

            if (!currentRecord) {
                return failResponse(c, 401, "未登录或登录已失效");
            }

            const isMatch = await auth.verifyPassword(
                data.currentPassword,
                currentRecord.passwordHash,
            );
            if (!isMatch) {
                return failResponse(c, 400, "原密码不正确");
            }

            // Hash new password outside queue
            const newPasswordHash = await auth.hashPassword(data.newPassword);

            // In transaction, re-check auth version, update password, increment authVersion and delete sessions
            const updateSuccess = await store.run(async (db) => {
                return await db.transaction(async (tx) => {
                    const [current] = await tx
                        .select({
                            authVersion: users.authVersion,
                            disabled: users.disabled,
                        })
                        .from(users)
                        .where(eq(users.id, user.id))
                        .limit(1)
                        .all();

                    if (!current || current.disabled) {
                        return { ok: false, reason: "invalid" as const };
                    }

                    // Optimistic concurrency check: ensure authVersion hasn't changed during password hashing
                    if (current.authVersion !== currentRecord.authVersion) {
                        return { ok: false, reason: "conflict" as const };
                    }

                    await tx
                        .update(users)
                        .set({
                            passwordHash: newPasswordHash,
                            authVersion: current.authVersion + 1,
                            updatedAt: currentTime,
                        })
                        .where(eq(users.id, user.id));

                    await tx.delete(sessions).where(
                        eq(sessions.userId, user.id),
                    );

                    return { ok: true } as const;
                });
            });

            if (!updateSuccess.ok) {
                if (updateSuccess.reason === "conflict") {
                    return failResponse(
                        c,
                        409,
                        "账户凭据已在其他会话中更新，请重新登录",
                    );
                }
                return failResponse(c, 401, "未登录或登录已失效");
            }

            c.header("Set-Cookie", auth.buildClearSessionCookieHeader());
            return c.success(undefined, "密码修改成功，已在所有设备退出");
        },
    );
}
