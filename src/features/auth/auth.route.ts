import * as v from "@valibot/valibot";
import { json, param, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import { failResponse } from "@internal/hono/middleware/response.ts";
import { eq } from "drizzle-orm";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { preferences, sessions, users } from "../../db/schema.ts";
import { getClientIp, InMemoryRateLimiter } from "./security.ts";
import { SystemSettingsStore } from "../system/settings-store.ts";
const usernameSchema = v.pipe(
    v.string("用户名必须是字符串"),
    v.trim(),
    v.toLowerCase(),
    v.regex(/^[a-z0-9_]{3,32}$/, "用户名需为 3–32 位的字母、数字或下划线"),
);

const emailSchema = v.optional(
    v.pipe(
        v.string("邮箱必须是字符串"),
        v.trim(),
        v.toLowerCase(),
        v.email("邮箱格式不正确"),
    ),
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

const loginIdentifierSchema = v.pipe(
    v.string("账号必须是字符串"),
    v.trim(),
    v.toLowerCase(),
);

const loginPasswordSchema = v.pipe(
    v.string("密码必须是字符串"),
);

const rememberMeSchema = v.optional(
    v.boolean("rememberMe 必须是布尔值"),
    false,
);
export function registerAuthRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
): void {
    const { store, auth } = deps;
    const now = deps.now ?? (() => Date.now());
    const settingsStore = deps.settings ?? new SystemSettingsStore();

    // 0. PUBLIC GET /api/auth/register (Query registration availability)
    routes.public.get("/api/auth/register", async (c) => {
        const settings = await settingsStore.get();
        return c.success({ allowRegistration: settings.allowRegistration });
    });
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
            email: json(emailSchema),
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

            const settings = await settingsStore.get();
            if (!settings.allowRegistration) {
                return failResponse(c, 403, "开放注册已关闭");
            }
            const currentTime = now();
            const passwordHash = await auth.hashPassword(data.password);
            const userId = crypto.randomUUID();
            const normalizedEmail = data.email && data.email.length > 0
                ? data.email
                : null;

            const registerResult = await store.run(async (db) => {
                return await db.transaction(async (tx) => {
                    const existingUser = await tx
                        .select({
                            id: users.id,
                            username: users.username,
                            email: users.email,
                        })
                        .from(users)
                        .where(eq(users.username, data.username))
                        .limit(1)
                        .all();

                    if (existingUser.length > 0) {
                        return {
                            conflict: true,
                            reason: "用户名已存在" as const,
                            user: null,
                        };
                    }

                    if (normalizedEmail) {
                        const existingEmail = await tx
                            .select({ id: users.id })
                            .from(users)
                            .where(eq(users.email, normalizedEmail))
                            .limit(1)
                            .all();
                        if (existingEmail.length > 0) {
                            return {
                                conflict: true,
                                reason: "邮箱已被注册" as const,
                                user: null,
                            };
                        }
                    }

                    await tx.insert(users).values({
                        id: userId,
                        username: data.username,
                        email: normalizedEmail,
                        displayName: data.displayName,
                        passwordHash,
                        role: "user",
                        disabled: false,
                        mustChangePassword: false,
                        authVersion: 1,
                        createdAt: currentTime,
                        updatedAt: currentTime,
                    });

                    await tx.insert(preferences).values({
                        userId,
                        defaultEngine: settings.defaultEngine,
                        theme: settings.defaultTheme,
                        searchTarget: settings.defaultSearchTarget,
                    });

                    return {
                        conflict: false,
                        user: {
                            id: userId,
                            username: data.username,
                            email: normalizedEmail ?? undefined,
                            displayName: data.displayName,
                            role: "user" as const,
                            mustChangePassword: false,
                        },
                    };
                });
            });

            if (registerResult.conflict || !registerResult.user) {
                return failResponse(
                    c,
                    409,
                    registerResult.reason ?? "用户名已存在",
                );
            }

            const userAgent = c.req.header("user-agent") ?? undefined;
            const session = await auth.createSession(userId, 1, {
                rememberMe: false,
                userAgent,
                ip,
            });
            c.header(
                "Set-Cookie",
                auth.buildSessionCookieHeader(
                    session.token,
                    session.maxAgeSeconds,
                ),
            );

            return c.success({ user: registerResult.user });
        },
    );

    // 2. PUBLIC POST /api/auth/login
    routes.public.post(
        "/api/auth/login",
        validator({
            username: json(v.optional(loginIdentifierSchema)),
            account: json(v.optional(loginIdentifierSchema)),
            email: json(v.optional(loginIdentifierSchema)),
            password: json(loginPasswordSchema),
            rememberMe: json(rememberMeSchema),
        }),
        async (c, data) => {
            const ip = getClientIp(c);
            const ipCheck = ipLimiter.consume(`ip:${ip}`);
            if (!ipCheck.ok) {
                c.header("Retry-After", String(ipCheck.retryAfter));
                return failResponse(c, 429, "请求过于频繁，请稍后重试");
            }

            const identifier = data.account || data.username || data.email;
            if (!identifier) {
                return failResponse(c, 400, "请输入用户名或邮箱");
            }

            const userCheck = loginUserLimiter.consume(`user:${identifier}`);
            if (!userCheck.ok) {
                c.header("Retry-After", String(userCheck.retryAfter));
                return failResponse(c, 429, "请求过于频繁，请稍后重试");
            }

            const foundUser = await store.run(async (db) => {
                const isEmail = identifier.includes("@");
                const condition = isEmail
                    ? eq(users.email, identifier)
                    : eq(users.username, identifier);

                const rows = await db
                    .select()
                    .from(users)
                    .where(condition)
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

            if (
                !foundUser || !isValidPassword || foundUser.disabled ||
                foundUser.softDeletedAt !== null
            ) {
                return failResponse(c, 400, "用户名或密码错误");
            }

            const rememberMe = data.rememberMe ?? false;
            const userAgent = c.req.header("user-agent") ?? undefined;
            const session = await auth.createSession(
                foundUser.id,
                foundUser.authVersion,
                {
                    rememberMe,
                    userAgent,
                    ip,
                },
            );
            c.header(
                "Set-Cookie",
                auth.buildSessionCookieHeader(
                    session.token,
                    session.maxAgeSeconds,
                ),
            );

            return c.success({
                user: {
                    id: foundUser.id,
                    username: foundUser.username,
                    email: foundUser.email ?? undefined,
                    displayName: foundUser.displayName,
                    role: foundUser.role,
                    mustChangePassword: Boolean(foundUser.mustChangePassword),
                },
            });
        },
    );

    // 3. PROTECTED GET /api/auth/me
    routes.get("/api/auth/me", async (c) => {
        const sessionUser = c.get("user");
        const userRecord = await store.run(async (db) => {
            const rows = await db
                .select({
                    id: users.id,
                    username: users.username,
                    email: users.email,
                    displayName: users.displayName,
                    role: users.role,
                    mustChangePassword: users.mustChangePassword,
                })
                .from(users)
                .where(eq(users.id, sessionUser.id))
                .limit(1)
                .all();
            return rows[0] ?? null;
        });

        if (!userRecord) {
            return failResponse(c, 401, "未登录或登录已失效");
        }

        return c.success({
            user: {
                id: userRecord.id,
                username: userRecord.username,
                email: userRecord.email ?? undefined,
                displayName: userRecord.displayName,
                role: userRecord.role,
                mustChangePassword: Boolean(userRecord.mustChangePassword),
            },
        });
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

    // 5. PROTECTED GET /api/auth/devices (Spec §14: device list)
    routes.get("/api/auth/devices", async (c) => {
        const user = c.get("user");
        const currentToken = c.get("sessionToken");
        const devices = await auth.listUserSessions(user.id, currentToken);
        return c.success({ devices });
    });

    // 6. PROTECTED POST /api/auth/devices/revoke-others (Spec §14: logout other devices)
    routes.post("/api/auth/devices/revoke-others", async (c) => {
        const user = c.get("user");
        const currentToken = c.get("sessionToken");
        if (currentToken) {
            await auth.revokeOtherUserSessions(user.id, currentToken);
        }
        return c.success(undefined, "已退出其他设备");
    });

    // 7. PROTECTED DELETE /api/auth/devices/:id (Spec §14: logout specific device)
    routes.delete(
        "/api/auth/devices/:id",
        validator({ id: param(v.pipe(v.string(), v.regex(/^[0-9a-f]{16}$/))) }),
        async (c, data) => {
            const user = c.get("user");
            const targetSessionId = data.id;
            const currentToken = c.get("sessionToken");

            const revoked = await auth.revokeUserSessionById(
                user.id,
                targetSessionId,
            );
            if (!revoked) {
                return failResponse(c, 404, "会话设备不存在");
            }

            // If revoked the current session, also clear cookie
            if (
                currentToken &&
                (await auth.hashToken(currentToken)).startsWith(targetSessionId)
            ) {
                c.header("Set-Cookie", auth.buildClearSessionCookieHeader());
            }
            return c.success(undefined, "已撤销该设备会话");
        },
    );

    // 8. PROTECTED PATCH /api/account
    routes.patch(
        "/api/account",
        validator({
            displayName: json(v.optional(displayNameSchema)),
            email: json(emailSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            const currentTime = now();
            const normalizedEmail = data.email && data.email.length > 0
                ? data.email
                : (data.email === "" ? null : undefined);

            const updateResult = await store.run(async (db) => {
                return await db.transaction(async (tx) => {
                    if (
                        normalizedEmail !== undefined &&
                        normalizedEmail !== null
                    ) {
                        const existing = await tx
                            .select({ id: users.id })
                            .from(users)
                            .where(eq(users.email, normalizedEmail))
                            .limit(1)
                            .all();
                        if (existing.length > 0 && existing[0].id !== user.id) {
                            return { conflict: true, user: null };
                        }
                    }

                    const updatePayload: Record<string, unknown> = {
                        updatedAt: currentTime,
                    };
                    if (data.displayName !== undefined) {
                        updatePayload.displayName = data.displayName;
                    }
                    if (normalizedEmail !== undefined) {
                        updatePayload.email = normalizedEmail;
                    }

                    await tx
                        .update(users)
                        .set(updatePayload)
                        .where(eq(users.id, user.id));

                    const rows = await tx
                        .select({
                            id: users.id,
                            username: users.username,
                            email: users.email,
                            displayName: users.displayName,
                            role: users.role,
                        })
                        .from(users)
                        .where(eq(users.id, user.id))
                        .limit(1)
                        .all();

                    return { conflict: false, user: rows[0] };
                });
            });

            if (updateResult.conflict || !updateResult.user) {
                return failResponse(c, 409, "邮箱已被使用");
            }

            return c.success({
                user: {
                    id: updateResult.user.id,
                    username: updateResult.user.username,
                    email: updateResult.user.email ?? undefined,
                    displayName: updateResult.user.displayName,
                    role: updateResult.user.role,
                },
            });
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
                            mustChangePassword: false,
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
