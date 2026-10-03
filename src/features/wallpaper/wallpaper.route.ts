import type { Routes } from "@internal/hono/routes.ts";
import { failResponse } from "@internal/hono/middleware/response.ts";
import { json, validator } from "@internal/validator/hono.ts";
import * as v from "@valibot/valibot";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { ManifestCorruptionError, WallpaperService } from "./service.ts";
export function registerWallpaperRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
): void {
    const service = deps.wallpaper ?? new WallpaperService();

    // 1. PROTECTED POST /api/wallpaper
    // Accepts multipart/form-data with field 'image'
    // Returns { url: '/api/wallpaper/<id>' }
    routes.post("/api/wallpaper", async (c) => {
        const user = c.get("user");
        if (!user) {
            return failResponse(c, 401, "请先登录");
        }

        let formData: FormData;
        try {
            formData = await c.req.formData();
        } catch {
            return failResponse(c, 400, "无法解析的表单数据");
        }

        const file = formData.get("image");
        if (!file || !(file instanceof File)) {
            return failResponse(c, 400, "请提供有效的 image 文件字段");
        }

        // Check size before arrayBuffer read where possible
        if (file.size > 5 * 1024 * 1024) {
            return failResponse(c, 413, "壁纸文件大小不能超过 5 MiB");
        }

        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        if (bytes.length > 5 * 1024 * 1024) {
            return failResponse(c, 413, "壁纸文件大小不能超过 5 MiB");
        }
        let focalX: number | undefined = undefined;
        let focalY: number | undefined = undefined;
        const rawFocalX = formData.get("focalX");
        if (rawFocalX !== null && typeof rawFocalX === "string") {
            const num = Number(rawFocalX);
            if (!Number.isFinite(num) || num < 0 || num > 1) {
                return failResponse(c, 400, "focalX 必须在 0 到 1 之间");
            }
            focalX = num;
        }
        const rawFocalY = formData.get("focalY");
        if (rawFocalY !== null && typeof rawFocalY === "string") {
            const num = Number(rawFocalY);
            if (!Number.isFinite(num) || num < 0 || num > 1) {
                return failResponse(c, 400, "focalY 必须在 0 到 1 之间");
            }
            focalY = num;
        }

        try {
            const result = await service.saveWallpaper(user.id, bytes, {
                focalX,
                focalY,
            });
            return c.success({
                url: result.url,
                id: result.id,
                focalX: result.record.focalX,
                focalY: result.record.focalY,
            });
        } catch (error) {
            if (error instanceof ManifestCorruptionError) {
                return failResponse(c, 500, "壁纸存储元数据损坏，无法写入");
            }
            const message = error instanceof Error
                ? error.message
                : "保存壁纸失败";
            if (message.includes("5 MiB")) {
                return failResponse(c, 413, message);
            }
            if (
                message.includes("格式") ||
                message.includes("图片") ||
                message.includes("focal")
            ) {
                return failResponse(c, 400, message);
            }
            return failResponse(c, 500, "保存壁纸失败");
        }
    });

    routes.get("/api/wallpaper", async (c) => {
        const user = c.get("user");
        if (!user) return failResponse(c, 401, "请先登录");

        try {
            const records = await service.listUserWallpapers(user.id);
            c.header("Cache-Control", "no-store");
            return c.success(records.map((record) => ({
                id: record.id,
                url: "/api/wallpaper/" + record.id,
                focalX: record.focalX,
                focalY: record.focalY,
            })));
        } catch (error) {
            if (error instanceof ManifestCorruptionError) {
                return failResponse(c, 500, "壁纸存储元数据损坏，无法写入");
            }
            return failResponse(c, 500, "服务器内部错误");
        }
    });

    // 2. PROTECTED GET /api/wallpaper/:id
    // Returns authenticated image bytes with private revalidation, ETag and nosniff.
    routes.get("/api/wallpaper/:id", async (c) => {
        const user = c.get("user");
        if (!user) {
            return failResponse(c, 401, "请先登录");
        }

        const id = c.req.param("id");
        if (!id) {
            return failResponse(c, 404, "壁纸不存在");
        }

        try {
            const result = await service.getWallpaper(id, user.id);
            if (!result) {
                return failResponse(c, 404, "壁纸不存在或无权访问");
            }
            const etag =
                `"${result.record.id}-${result.record.size}-${result.record.createdAt}"`;
            c.header("ETag", etag);
            c.header("Cache-Control", "private, no-cache");
            c.header("X-Content-Type-Options", "nosniff");

            const ifNoneMatch = c.req.header("if-none-match");
            if (
                ifNoneMatch &&
                (ifNoneMatch === etag || ifNoneMatch === `W/${etag}`)
            ) {
                return new Response(null, {
                    status: 304,
                    headers: c.res.headers,
                });
            }

            c.header("Content-Type", result.record.contentType);
            c.header("Content-Length", String(result.bytes.length));

            return new Response(result.bytes as unknown as BodyInit, {
                status: 200,
                headers: c.res.headers,
            });
        } catch (error) {
            if (error instanceof ManifestCorruptionError) {
                return failResponse(c, 500, "壁纸存储元数据损坏，无法读取");
            }
            return failResponse(c, 500, "读取壁纸失败");
        }
    });

    // 3. PROTECTED DELETE /api/wallpaper/:id
    routes.delete("/api/wallpaper/:id", async (c) => {
        const user = c.get("user");
        if (!user) {
            return failResponse(c, 401, "请先登录");
        }

        const id = c.req.param("id");
        if (!id) {
            return failResponse(c, 404, "壁纸不存在");
        }

        try {
            const deleted = await service.deleteWallpaper(id, user.id);
            if (!deleted) {
                return failResponse(c, 404, "壁纸不存在或无权删除");
            }
            return c.success({ deleted: true });
        } catch (error) {
            if (error instanceof ManifestCorruptionError) {
                return failResponse(c, 500, "壁纸存储元数据损坏，无法删除");
            }
            return failResponse(c, 500, "删除壁纸失败");
        }
    });

    // 4. PROTECTED PATCH /api/wallpaper/:id (update focal composition)
    routes.patch(
        "/api/wallpaper/:id",
        validator({
            focalX: json(
                v.optional(
                    v.pipe(
                        v.number("focalX 必须为数值"),
                        v.finite("focalX 必须为有限数值"),
                        v.minValue(0, "focalX 最小为 0"),
                        v.maxValue(1, "focalX 最大为 1"),
                    ),
                ),
            ),
            focalY: json(
                v.optional(
                    v.pipe(
                        v.number("focalY 必须为数值"),
                        v.finite("focalY 必须为有限数值"),
                        v.minValue(0, "focalY 最小为 0"),
                        v.maxValue(1, "focalY 最大为 1"),
                    ),
                ),
            ),
        }),
        async (c, data) => {
            const user = c.get("user");
            if (!user) {
                return failResponse(c, 401, "请先登录");
            }

            const id = c.req.param("id");
            if (!id) {
                return failResponse(c, 404, "壁纸不存在");
            }

            if (data.focalX === undefined && data.focalY === undefined) {
                return failResponse(c, 400, "至少提供 focalX 或 focalY");
            }

            try {
                const updated = await service.updateWallpaperComposition(
                    id,
                    user.id,
                    data,
                );
                if (!updated) {
                    return failResponse(c, 404, "壁纸不存在或无权访问");
                }
                return c.success({
                    id: updated.id,
                    url: `/api/wallpaper/${updated.id}`,
                    focalX: updated.focalX,
                    focalY: updated.focalY,
                });
            } catch (error) {
                if (error instanceof ManifestCorruptionError) {
                    return failResponse(c, 500, "壁纸存储元数据损坏，无法更新");
                }
                return failResponse(c, 500, "更新壁纸构图失败");
            }
        },
    );
}
