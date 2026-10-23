import { json, validator } from "@internal/validator/hono.ts";
import * as v from "@valibot/valibot";
import type { Routes } from "@internal/hono/routes.ts";
import { failResponse } from "@internal/hono/middleware/response.ts";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { SystemService } from "./service.ts";
import { AuditService } from "../audit/service.ts";
import type { SystemSettingsDto } from "./types.ts";
import { users } from "../../db/schema.ts";
import { eq } from "drizzle-orm";

const _SystemSettingsPatchSchema = v.object({
    auditRetentionDays: v.optional(
        v.pipe(
            v.number("审计保留天数必须为数字"),
            v.integer("审计保留天数必须为整数"),
            v.minValue(1, "审计保留天数最少为 1 天"),
            v.maxValue(3650, "审计保留天数最多为 3650 天"),
        ),
    ),
    allowRegistration: v.optional(v.boolean("开放注册必须为布尔值")),
    defaultEngine: v.optional(
        v.picklist(
            ["google", "bing", "baidu", "duckduckgo"],
            "不支持的默认搜索引擎",
        ),
    ),
    defaultTheme: v.optional(
        v.picklist(["system", "light", "dark"], "不支持的默认主题"),
    ),
    defaultSearchTarget: v.optional(
        v.picklist(["same", "new"], "不支持的搜索打开方式"),
    ),
});

export function registerSystemRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
    systemService?: SystemService,
    auditService?: AuditService,
): void {
    const service = systemService ??
        new SystemService({
            store: deps.store,
            wallpaperService: deps.wallpaper,
            iconService: deps.icons,
            now: deps.now,
        });

    const audit = auditService ??
        new AuditService({
            store: deps.store,
            now: deps.now,
        });

    // 1. GET /api/admin/system/overview
    routes.get("/api/admin/system/overview", async (c) => {
        const user = c.get("user");
        if (user.role !== "admin") {
            return failResponse(c, 403, "权限不足，仅管理员可访问");
        }
        const overview = await service.getOverview();
        return c.success(overview);
    });

    // 2. GET /api/admin/system/settings
    routes.get("/api/admin/system/settings", async (c) => {
        const user = c.get("user");
        if (user.role !== "admin") {
            return failResponse(c, 403, "权限不足，仅管理员可访问");
        }
        const settings = await service.settingsStore.get();
        return c.success(settings);
    });

    // 3. PATCH /api/admin/system/settings
    routes.patch(
        "/api/admin/system/settings",
        validator({
            auditRetentionDays: json(
                v.optional(
                    v.pipe(
                        v.number(),
                        v.integer(),
                        v.minValue(1),
                        v.maxValue(3650),
                    ),
                ),
            ),
            allowRegistration: json(v.optional(v.boolean())),
            defaultEngine: json(
                v.optional(
                    v.picklist(["google", "bing", "baidu", "duckduckgo"]),
                ),
            ),
            defaultTheme: json(
                v.optional(v.picklist(["system", "light", "dark"])),
            ),
            defaultSearchTarget: json(v.optional(v.picklist(["same", "new"]))),
        }),
        async (c, data) => {
            const user = c.get("user");
            if (user.role !== "admin") {
                return failResponse(c, 403, "权限不足，仅管理员可访问");
            }
            if (Object.values(data).every((val) => val === undefined)) {
                return failResponse(c, 400, "至少修改一项系统设置");
            }

            const updated = await service.settingsStore.update(
                data as Partial<SystemSettingsDto>,
            );

            // Trigger audit retention cleanup if retention days changed
            if (typeof data.auditRetentionDays === "number") {
                await audit.cleanup(data.auditRetentionDays);
            }

            await audit.log({
                actorUserId: user.id,
                action: "admin.system.settings_update",
                targetType: "system",
                targetId: "settings",
                metadata: {
                    ...data,
                },
            });

            return c.success(updated, "系统设置更新成功");
        },
    );

    // 4. GET /api/admin/system/config/export
    routes.get("/api/admin/system/config/export", async (c) => {
        const user = c.get("user");
        if (user.role !== "admin") {
            return failResponse(c, 403, "权限不足，仅管理员可访问");
        }
        const config = await service.exportConfig();

        await audit.log({
            actorUserId: user.id,
            action: "admin.system.config_export",
            targetType: "system",
            targetId: "config",
        });

        c.header("Content-Type", "application/json; charset=utf-8");
        c.header(
            "Content-Disposition",
            `attachment; filename="searcher-config-${
                new Date().toISOString().slice(0, 10)
            }.json"`,
        );
        return c.text(JSON.stringify(config, null, 2));
    });

    // 5. POST /api/admin/system/config/import
    routes.post("/api/admin/system/config/import", async (c) => {
        const user = c.get("user");
        if (user.role !== "admin") {
            return failResponse(c, 403, "权限不足，仅管理员可访问");
        }

        let body: unknown;
        try {
            body = await c.req.json();
        } catch {
            return failResponse(c, 400, "无法解析 JSON 配置");
        }

        try {
            const result = await service.importConfig(body);
            await audit.log({
                actorUserId: user.id,
                action: "admin.system.config_import",
                targetType: "system",
                targetId: "config",
                metadata: {
                    importedProvidersCount: result.importedProvidersCount,
                },
            });
            return c.success(result, "系统配置导入成功");
        } catch (err) {
            return failResponse(c, 400, (err as Error).message);
        }
    });

    // 6. GET /api/admin/backup/export (Full ZIP backup download)
    routes.get("/api/admin/backup/export", async (c) => {
        const user = c.get("user");
        if (user.role !== "admin") {
            return failResponse(c, 403, "权限不足，仅管理员可访问");
        }
        await audit.log({
            actorUserId: user.id,
            action: "admin.backup.create",
            targetType: "system",
            targetId: "backup",
        });

        const zipBytes = await service.createFullBackupZip();
        c.header("Content-Type", "application/zip");
        c.header(
            "Content-Disposition",
            `attachment; filename="searcher-backup-${
                new Date().toISOString().slice(0, 10)
            }.zip"`,
        );
        c.header("Content-Length", String(zipBytes.length));

        return new Response(zipBytes as unknown as BodyInit, {
            status: 200,
            headers: c.res.headers,
        });
    });

    // 7. POST /api/admin/backup/validate (Pre-check ZIP backup before restore)
    routes.post("/api/admin/backup/validate", async (c) => {
        const user = c.get("user");
        if (user.role !== "admin") {
            return failResponse(c, 403, "权限不足，仅管理员可访问");
        }

        let formData: FormData;
        try {
            formData = await c.req.formData();
        } catch {
            return failResponse(c, 400, "无法解析的表单数据");
        }

        const file = formData.get("backup");
        if (!file || !(file instanceof File)) {
            return failResponse(c, 400, "请提供有效的 backup ZIP 文件");
        }

        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        const check = await service.validateBackupZip(bytes);
        if (!check.valid) {
            return failResponse(c, 400, check.error ?? "备份文件校验失败");
        }

        return c.success({
            valid: true,
            manifest: check.manifest,
            warnings: check.warnings ?? [],
        });
    });

    // 8. POST /api/admin/backup/restore (Full ZIP restore with snapshot rollback)
    routes.post("/api/admin/backup/restore", async (c) => {
        const user = c.get("user");
        if (user.role !== "admin") {
            return failResponse(c, 403, "权限不足，仅管理员可访问");
        }

        let formData: FormData;
        try {
            formData = await c.req.formData();
        } catch {
            return failResponse(c, 400, "无法解析的表单数据");
        }

        const file = formData.get("backup");
        if (!file || !(file instanceof File)) {
            return failResponse(c, 400, "请提供有效的 backup ZIP 文件");
        }

        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        try {
            const result = await service.restoreFromBackupZip(bytes);
            const actor = await deps.store.run(async (db) =>
                await db.select({ id: users.id }).from(users)
                    .where(eq(users.id, user.id)).limit(1).all()
            );

            await audit.log({
                actorUserId: actor[0] ? user.id : null,
                action: "admin.backup.restore",
                targetType: "system",
                targetId: "backup",
                metadata: {
                    manifestCreatedAt: result.manifest.createdAt,
                    snapshotCreated: result.snapshotCreated,
                    snapshotPath: result.snapshotPath,
                },
            });

            return c.success(
                result,
                "系统数据恢复成功，当前快照已保存。请重新加载页面以生效。",
            );
        } catch (err) {
            return failResponse(c, 400, (err as Error).message);
        }
    });
}
