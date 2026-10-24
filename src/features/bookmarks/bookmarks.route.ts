import { STATUS_CODE } from "@std/http";
import { json, param, query, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import * as v from "@valibot/valibot";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { WebAppIconService } from "../webapp-icons/service.ts";
import {
    BookmarksService,
    normalizeWebAppUrl,
    WebAppGroupNotFoundError,
    WebAppNotFoundError,
} from "./service.ts";

const TitleSchema = v.pipe(
    v.string("名称必须为字符串"),
    v.trim(),
    v.minLength(1, "名称长度至少1个字符"),
    v.maxLength(80, "名称长度最多80个字符"),
);

const UrlSchema = v.pipe(
    v.string("URL必须为字符串"),
    v.trim(),
    v.check((val) => {
        try {
            normalizeWebAppUrl(val);
            return true;
        } catch {
            return false;
        }
    }, "无效的URL格式或协议不受支持"),
);

const IdParamSchema = v.pipe(
    v.string("ID必须为字符串"),
    v.trim(),
    v.minLength(1, "ID不能为空"),
);

const IntegerSchema = v.pipe(
    v.number("必须为数字"),
    v.integer("必须为整数"),
);

const IconSourceSchema = v.picklist([
    "website",
    "upload",
    "url",
    "ai",
    "default",
]);
const OpenModeSchema = v.picklist(["global", "current", "new_tab"]);
const FolderSizeSchema = v.picklist(["small", "large"]);

export function registerBookmarksRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
): void {
    const service = new BookmarksService(deps.store, deps.now);
    const icons = deps.icons ?? new WebAppIconService();

    // ==========================================
    // WebApp Groups: /api/webapp-groups
    // ==========================================

    // GET /api/webapp-groups
    routes.get("/api/webapp-groups", async (c) => {
        const user = c.get("user");
        const groups = await service.listGroups(user.id);
        return c.success(groups);
    });

    // POST /api/webapp-groups
    routes.post(
        "/api/webapp-groups",
        validator({
            name: json(TitleSchema),
            sortOrder: json(v.optional(IntegerSchema, 0)),
            folderSize: json(v.optional(FolderSizeSchema, "small")),
            isHomeFixed: json(v.optional(v.boolean(), false)),
            appIds: json(v.optional(v.array(IdParamSchema), [])),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                const group = await service.createGroup(
                    user.id,
                    data.name,
                    data.sortOrder,
                    data.folderSize,
                    data.isHomeFixed,
                    data.appIds,
                );
                return c.success(group);
            } catch (error) {
                if (error instanceof WebAppNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                throw error;
            }
        },
    );

    // PATCH /api/webapp-groups/:id
    routes.patch(
        "/api/webapp-groups/:id",
        validator({
            id: param(IdParamSchema),
            name: json(v.optional(TitleSchema)),
            sortOrder: json(v.optional(IntegerSchema)),
            folderSize: json(v.optional(FolderSizeSchema)),
            isHomeFixed: json(v.optional(v.boolean())),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                const group = await service.updateGroup(
                    user.id,
                    data.id,
                    data.name,
                    data.sortOrder,
                    data.folderSize,
                    data.isHomeFixed,
                );
                return c.success(group);
            } catch (error) {
                if (error instanceof WebAppGroupNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                throw error;
            }
        },
    );

    // DELETE /api/webapp-groups/:id
    routes.delete(
        "/api/webapp-groups/:id",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                await service.deleteGroup(user.id, data.id);
                return c.success(undefined, "文件夹已删除");
            } catch (error) {
                if (error instanceof WebAppGroupNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                throw error;
            }
        },
    );

    // ==========================================
    // WebApps: /api/webapps
    // ==========================================

    // GET /api/webapps
    routes.get(
        "/api/webapps",
        validator({
            groupId: query(v.optional(v.string())),
        }),
        async (c, data) => {
            const user = c.get("user");
            const groupId = data.groupId !== undefined
                ? (data.groupId === "null" || data.groupId === ""
                    ? null
                    : data.groupId)
                : undefined;
            const apps = await service.listWebApps(user.id, {
                groupId,
            });
            return c.success(apps);
        },
    );

    // GET /api/webapps/trash
    routes.get("/api/webapps/trash", async (c) => {
        const user = c.get("user");
        const trash = await service.listTrashWebApps(user.id);
        return c.success(trash);
    });

    // POST /api/webapps
    routes.post(
        "/api/webapps",
        validator({
            name: json(TitleSchema),
            url: json(UrlSchema),
            groupId: json(v.optional(v.nullable(v.string()))),
            iconAssetId: json(v.optional(v.nullable(v.string()))),
            iconSource: json(v.optional(IconSourceSchema, "website")),
            sortOrder: json(v.optional(IntegerSchema, 0)),
            isHomeFixed: json(v.optional(v.boolean(), false)),
            openMode: json(v.optional(OpenModeSchema, "global")),
        }),
        async (c, data) => {
            const user = c.get("user");
            const app = await service.createWebApp(user.id, {
                name: data.name,
                url: data.url,
                groupId: data.groupId,
                iconAssetId: data.iconAssetId,
                iconSource: data.iconSource,
                sortOrder: data.sortOrder,
                isHomeFixed: data.isHomeFixed,
                openMode: data.openMode,
            });
            return c.success(app);
        },
    );

    // PUT /api/webapps/reorder
    routes.put(
        "/api/webapps/reorder",
        validator({
            items: json(
                v.array(
                    v.object({
                        id: IdParamSchema,
                        sortOrder: v.optional(IntegerSchema),
                    }),
                ),
            ),
            groups: json(
                v.optional(
                    v.array(
                        v.object({
                            id: IdParamSchema,
                            sortOrder: IntegerSchema,
                        }),
                    ),
                    [],
                ),
            ),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                await service.reorderWebApps(user.id, data.items, data.groups);
                return c.success(undefined, "重新排序成功");
            } catch (error) {
                if (
                    error instanceof WebAppNotFoundError ||
                    error instanceof WebAppGroupNotFoundError
                ) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                throw error;
            }
        },
    );

    // Fetch outside the database queue; apply only to the unchanged icon draft.
    routes.post(
        "/api/webapps/:id/fetch-icon",
        validator({ id: param(IdParamSchema) }),
        async (c, data) => {
            const user = c.get("user");
            try {
                const app = await service.getWebAppById(user.id, data.id);
                if (
                    app.iconSource !== "default" &&
                    (app.iconAssetId || app.iconSource !== "website")
                ) return c.success(app);
                let asset;
                try {
                    asset = await icons.fetchAndSaveFromWebsite(
                        user.id,
                        app.url,
                    );
                } catch (error) {
                    return c.fail(
                        STATUS_CODE.BadRequest,
                        error instanceof Error
                            ? error.message
                            : "获取站点图标失败",
                    );
                }
                return c.success(
                    await service.applyFetchedIcon(user.id, app, asset.id),
                );
            } catch (error) {
                if (error instanceof WebAppNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                throw error;
            }
        },
    );

    // GET /api/webapps/:id
    routes.get(
        "/api/webapps/:id",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                const app = await service.getWebAppById(user.id, data.id);
                return c.success(app);
            } catch (error) {
                if (error instanceof WebAppNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                throw error;
            }
        },
    );

    // PATCH /api/webapps/:id
    routes.patch(
        "/api/webapps/:id",
        validator({
            id: param(IdParamSchema),
            name: json(v.optional(TitleSchema)),
            url: json(v.optional(UrlSchema)),
            groupId: json(v.optional(v.nullable(v.string()))),
            iconAssetId: json(v.optional(v.nullable(v.string()))),
            iconSource: json(v.optional(IconSourceSchema)),
            sortOrder: json(v.optional(IntegerSchema)),
            isHomeFixed: json(v.optional(v.boolean())),
            openMode: json(v.optional(OpenModeSchema)),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                const app = await service.updateWebApp(user.id, data.id, {
                    name: data.name,
                    url: data.url,
                    groupId: data.groupId,
                    iconAssetId: data.iconAssetId,
                    iconSource: data.iconSource,
                    sortOrder: data.sortOrder,
                    isHomeFixed: data.isHomeFixed,
                    openMode: data.openMode,
                });
                return c.success(app);
            } catch (error) {
                if (error instanceof WebAppNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                throw error;
            }
        },
    );

    // DELETE /api/webapps/:id (Soft delete)
    routes.delete(
        "/api/webapps/:id",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                await service.softDeleteWebApp(user.id, data.id);
                return c.success(undefined, "应用已移入回收站");
            } catch (error) {
                if (error instanceof WebAppNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                throw error;
            }
        },
    );

    // POST /api/webapps/:id/restore
    routes.post(
        "/api/webapps/:id/restore",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                const app = await service.restoreWebApp(user.id, data.id);
                return c.success(app, "应用已恢复");
            } catch (error) {
                if (error instanceof WebAppNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                throw error;
            }
        },
    );

    // DELETE /api/webapps/:id/permanent
    routes.delete(
        "/api/webapps/:id/permanent",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                await service.permanentDeleteWebApp(user.id, data.id);
                return c.success(undefined, "应用已彻底删除");
            } catch (error) {
                if (error instanceof WebAppNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                throw error;
            }
        },
    );
}
