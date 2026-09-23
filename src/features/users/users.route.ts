import * as v from "@valibot/valibot";
import { json, param, query, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import { failResponse } from "@internal/hono/middleware/response.ts";
import { count, desc, eq, like, or } from "drizzle-orm";
import type { AdminUserDto } from "@shared/contracts.ts";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { preferences, sessions, users } from "../../db/schema.ts";

const pageSchema = v.pipe(
    v.optional(v.string(), "1"),
    v.regex(/^[1-9]\d*$/, "页码必须为正整数"),
    v.transform((val) => parseInt(val, 10)),
);

const searchSchema = v.optional(
    v.pipe(
        v.string("搜索关键词必须是字符串"),
        v.trim(),
        v.maxLength(64, "搜索关键词不能超过 64 个字符"),
    ),
    "",
);

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

const disabledSchema = v.boolean("disabled 必须是布尔值");

const idParamSchema = v.pipe(
    v.string("用户 ID 必须是字符串"),
    v.minLength(1, "用户 ID 不能为空"),
);

function escapeLike(str: string): string {
    return str.replace(/[%_\\]/g, "\\$&");
}

export function registerUserRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
): void {
    const { store, auth } = deps;
    const now = deps.now ?? (() => Date.now());

    // GET /api/admin/users?page=1&q=
    routes.get(
        "/api/admin/users",
        validator({
            page: query(pageSchema),
            q: query(searchSchema),
        }),
        async (c, data) => {
            const currentUser = c.get("user");
            if (currentUser.role !== "admin") {
                return failResponse(c, 403, "权限不足，仅管理员可访问");
            }

            const page = data.page ?? 1;
            const pageSize = 50;
            const offset = (page - 1) * pageSize;
            const searchTerm = data.q ?? "";

            const result = await store.run(async (db) => {
                const searchPattern = `%${escapeLike(searchTerm)}%`;
                const whereClause = searchTerm.length > 0
                    ? or(
                        like(users.username, searchPattern),
                        like(users.displayName, searchPattern),
                    )
                    : undefined;

                const countQuery = db
                    .select({ total: count() })
                    .from(users);

                const countRows = whereClause
                    ? await countQuery.where(whereClause).all()
                    : await countQuery.all();

                const total = countRows[0]?.total ?? 0;

                const baseQuery = db
                    .select({
                        id: users.id,
                        username: users.username,
                        displayName: users.displayName,
                        role: users.role,
                        disabled: users.disabled,
                        createdAt: users.createdAt,
                    })
                    .from(users);

                const rows = whereClause
                    ? await baseQuery
                        .where(whereClause)
                        .orderBy(desc(users.createdAt), desc(users.id))
                        .limit(pageSize)
                        .offset(offset)
                        .all()
                    : await baseQuery
                        .orderBy(desc(users.createdAt), desc(users.id))
                        .limit(pageSize)
                        .offset(offset)
                        .all();

                const items: AdminUserDto[] = rows.map((r) => ({
                    id: r.id,
                    username: r.username,
                    displayName: r.displayName,
                    role: r.role,
                    disabled: r.disabled,
                    createdAt: r.createdAt,
                }));

                return { items, page, total };
            });

            return c.success(result);
        },
    );

    // POST /api/admin/users
    routes.post(
        "/api/admin/users",
        validator({
            username: json(usernameSchema),
            displayName: json(displayNameSchema),
            password: json(passwordSchema),
        }),
        async (c, data) => {
            const currentUser = c.get("user");
            if (currentUser.role !== "admin") {
                return failResponse(c, 403, "权限不足，仅管理员可访问");
            }

            const currentTime = now();
            const passwordHash = await auth.hashPassword(data.password);
            const userId = crypto.randomUUID();

            const createResult = await store.run(async (db) => {
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

                    const userDto: AdminUserDto = {
                        id: userId,
                        username: data.username,
                        displayName: data.displayName,
                        role: "user",
                        disabled: false,
                        createdAt: currentTime,
                    };

                    return { conflict: false, user: userDto };
                });
            });

            if (createResult.conflict || !createResult.user) {
                return failResponse(c, 409, "用户名已存在");
            }

            return c.success({ user: createResult.user });
        },
    );

    // PATCH /api/admin/users/:id
    routes.patch(
        "/api/admin/users/:id",
        validator({
            id: param(idParamSchema),
            disabled: json(disabledSchema),
        }),
        async (c, data) => {
            const currentUser = c.get("user");
            if (currentUser.role !== "admin") {
                return failResponse(c, 403, "权限不足，仅管理员可访问");
            }

            const targetId = data.id;

            if (currentUser.id === targetId) {
                return failResponse(c, 403, "禁止修改当前登录管理员的状态");
            }

            const currentTime = now();

            const updateResult = await store.run(async (db) => {
                return await db.transaction(async (tx) => {
                    const rows = await tx
                        .select()
                        .from(users)
                        .where(eq(users.id, targetId))
                        .limit(1)
                        .all();

                    const targetUser = rows[0] ?? null;
                    if (!targetUser) {
                        return { status: 404, message: "用户不存在" } as const;
                    }

                    // All admin accounts cannot be disabled via this API
                    if (targetUser.role === "admin") {
                        return {
                            status: 403,
                            message: "不能禁用管理员账户",
                        } as const;
                    }

                    await tx
                        .update(users)
                        .set({
                            disabled: data.disabled,
                            updatedAt: currentTime,
                        })
                        .where(eq(users.id, targetId));

                    if (data.disabled) {
                        await tx.delete(sessions).where(
                            eq(sessions.userId, targetId),
                        );
                    }

                    return { status: 200 } as const;
                });
            });

            if (updateResult.status === 404) {
                return failResponse(c, 404, updateResult.message);
            }
            if (updateResult.status === 403) {
                return failResponse(c, 403, updateResult.message);
            }

            return c.success(undefined, "用户状态已更新");
        },
    );

    // PUT /api/admin/users/:id/password
    routes.put(
        "/api/admin/users/:id/password",
        validator({
            id: param(idParamSchema),
            password: json(passwordSchema),
        }),
        async (c, data) => {
            const currentUser = c.get("user");
            if (currentUser.role !== "admin") {
                return failResponse(c, 403, "权限不足，仅管理员可访问");
            }

            const targetId = data.id;

            const targetUser = await store.run(async (db) => {
                const rows = await db
                    .select()
                    .from(users)
                    .where(eq(users.id, targetId))
                    .limit(1)
                    .all();
                return rows[0] ?? null;
            });

            if (!targetUser) {
                return failResponse(c, 404, "用户不存在");
            }

            // All admin accounts cannot be reset via this API
            if (targetUser.role === "admin") {
                return failResponse(
                    c,
                    403,
                    "不能重置管理员密码，管理员请在账户设置中修改密码",
                );
            }

            const newPasswordHash = await auth.hashPassword(data.password);
            const currentTime = now();

            const updateResult = await store.run(async (db) => {
                return await db.transaction(async (tx) => {
                    const [current] = await tx
                        .select({
                            authVersion: users.authVersion,
                            role: users.role,
                        })
                        .from(users)
                        .where(eq(users.id, targetId))
                        .limit(1)
                        .all();

                    if (!current) {
                        return { status: 404, message: "用户不存在" } as const;
                    }

                    if (current.role === "admin") {
                        return {
                            status: 403,
                            message:
                                "不能重置管理员密码，管理员请在账户设置中修改密码",
                        } as const;
                    }

                    // Optimistic concurrency check: ensure authVersion hasn't changed during password hashing
                    if (current.authVersion !== targetUser.authVersion) {
                        return {
                            status: 409,
                            message: "用户凭据已被其他操作更新，请刷新重试",
                        } as const;
                    }

                    await tx
                        .update(users)
                        .set({
                            passwordHash: newPasswordHash,
                            authVersion: current.authVersion + 1,
                            updatedAt: currentTime,
                        })
                        .where(eq(users.id, targetId));

                    await tx.delete(sessions).where(
                        eq(sessions.userId, targetId),
                    );

                    return { status: 200 } as const;
                });
            });

            if (updateResult.status === 404) {
                return failResponse(c, 404, updateResult.message);
            }
            if (updateResult.status === 403) {
                return failResponse(c, 403, updateResult.message);
            }
            if (updateResult.status === 409) {
                return failResponse(c, 409, updateResult.message);
            }
            return c.success(undefined, "密码已重置，已撤销该用户全部会话");
        },
    );
}
