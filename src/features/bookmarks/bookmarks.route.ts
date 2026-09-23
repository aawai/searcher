import { STATUS_CODE } from "@std/http";
import { json, param, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import * as v from "@valibot/valibot";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import {
    BookmarkConflictError,
    BookmarkNotFoundError,
    BookmarksService,
} from "./service.ts";
import { normalizeUrl } from "./url.ts";

const TitleSchema = v.pipe(
    v.string("标题必须为字符串"),
    v.trim(),
    v.minLength(1, "标题长度至少1个字符"),
    v.maxLength(80, "标题长度最多80个字符"),
);

const UrlSchema = v.pipe(
    v.string("URL必须为字符串"),
    v.trim(),
    v.check((val) => {
        try {
            normalizeUrl(val);
            return true;
        } catch {
            return false;
        }
    }, "无效的URL格式或协议不受支持"),
);

const OptionalTitleSchema = v.optional(TitleSchema);
const OptionalUrlSchema = v.optional(UrlSchema);

const IdParamSchema = v.pipe(
    v.string("ID必须为字符串"),
    v.trim(),
    v.minLength(1, "ID不能为空"),
);

export function registerBookmarksRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
): void {
    const service = new BookmarksService(deps.store, deps.now);

    // GET /api/bookmarks
    routes.get("/api/bookmarks", async (c) => {
        const user = c.get("user");
        const list = await service.list(user.id);
        return c.success(list);
    });

    // POST /api/bookmarks
    routes.post(
        "/api/bookmarks",
        validator({
            title: json(TitleSchema),
            url: json(UrlSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                const bookmark = await service.create(user.id, {
                    title: data.title,
                    url: data.url,
                });
                return c.success(bookmark);
            } catch (error) {
                if (error instanceof BookmarkConflictError) {
                    return c.fail(
                        STATUS_CODE.Conflict,
                        error.message,
                    );
                }
                throw error;
            }
        },
    );

    // PATCH /api/bookmarks/:id
    routes.patch(
        "/api/bookmarks/:id",
        validator({
            id: param(IdParamSchema),
            title: json(OptionalTitleSchema),
            url: json(OptionalUrlSchema),
        }),
        async (c, data) => {
            if (data.title === undefined && data.url === undefined) {
                return c.fail(
                    STATUS_CODE.BadRequest,
                    "必须至少提供一个修改字段",
                );
            }
            const user = c.get("user");
            try {
                const updated = await service.update(
                    user.id,
                    data.id,
                    {
                        title: data.title,
                        url: data.url,
                    },
                );
                return c.success(updated);
            } catch (error) {
                if (error instanceof BookmarkNotFoundError) {
                    return c.fail(
                        STATUS_CODE.NotFound,
                        error.message,
                    );
                }
                if (error instanceof BookmarkConflictError) {
                    return c.fail(
                        STATUS_CODE.Conflict,
                        error.message,
                    );
                }
                throw error;
            }
        },
    );

    // DELETE /api/bookmarks/:id
    routes.delete(
        "/api/bookmarks/:id",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                await service.delete(user.id, data.id);
                return c.success(undefined, "删除成功");
            } catch (error) {
                if (error instanceof BookmarkNotFoundError) {
                    return c.fail(
                        STATUS_CODE.NotFound,
                        error.message,
                    );
                }
                throw error;
            }
        },
    );
}
