import { query, validator } from "@internal/validator/hono.ts";
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
    v.pipe(
        v.string(),
        v.trim(),
    ),
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
