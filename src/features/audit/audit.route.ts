import { query, validator } from "@internal/validator/hono.ts";
import { AUDIT_ACTIONS } from "@shared/contracts.ts";
import * as v from "@valibot/valibot";
import type { Routes } from "@internal/hono/routes.ts";
import { failResponse } from "@internal/hono/middleware/response.ts";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { AuditService } from "./service.ts";

const pageSchema = v.pipe(
    v.optional(v.string(), "1"),
    v.regex(/^[1-9]\d*$/, "页码必须为正整数"),
    v.transform((val) => parseInt(val, 10)),
);

const limitSchema = v.pipe(
    v.optional(v.string(), "50"),
    v.regex(/^[1-9]\d*$/, "条数必须为正整数"),
    v.transform((val) => Math.min(100, parseInt(val, 10))),
);

const actionSchema = v.optional(
    v.union([
        v.literal(""),
        v.picklist(AUDIT_ACTIONS, "不支持的审计操作"),
    ]),
);

const categorySchema = v.optional(
    v.union([
        v.literal(""),
        v.picklist(["user", "system", "ai"], "不支持的审计分类"),
    ]),
);

const searchSchema = v.optional(
    v.pipe(
        v.string("搜索关键词必须是字符串"),
        v.trim(),
        v.maxLength(64, "搜索关键词不能超过 64 个字符"),
    ),
    "",
);

export function registerAuditRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
    auditService?: AuditService,
): void {
    const service = auditService ?? new AuditService({
        store: deps.store,
        now: deps.now,
    });

    // GET /api/admin/audit-logs
    routes.get(
        "/api/admin/audit-logs",
        validator({
            page: query(pageSchema),
            limit: query(limitSchema),
            action: query(actionSchema),
            category: query(categorySchema),
            q: query(searchSchema),
        }),
        async (c, data) => {
            const currentUser = c.get("user");
            if (currentUser.role !== "admin") {
                return failResponse(c, 403, "权限不足，仅管理员可访问");
            }

            const page = data.page ?? 1;
            const limit = data.limit ?? 50;
            const offset = (page - 1) * limit;

            const result = await service.list({
                limit,
                offset,
                action: data.action || undefined,
                category: data.category || undefined,
                q: data.q || undefined,
            });
            return c.success({
                items: result.items,
                page,
                limit,
                total: result.total,
            });
        },
    );
}
