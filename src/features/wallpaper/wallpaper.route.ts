import type { Routes } from "@internal/hono/routes.ts";
import { failResponse } from "@internal/hono/middleware/response.ts";
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

        try {
            const result = await service.saveWallpaper(user.id, bytes);
            return c.success({ url: result.url });
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
            return failResponse(c, 400, message);
        }
    });

    routes.get("/api/wallpaper", async (c) => {
        const user = c.get("user");
        if (!user) return failResponse(c, 401, "请先登录");

        try {
            const records = await service.listUserWallpapers(user.id);
            c.header("Cache-Control", "no-store");
            return c.success(records.map((record) => ({
                url: "/api/wallpaper/" + record.id,
            })));
        } catch (error) {
            if (error instanceof ManifestCorruptionError) {
                return failResponse(c, 500, "壁纸存储元数据损坏，无法写入");
            }
            return failResponse(c, 500, "服务器内部错误");
        }
    });

    // 2. PROTECTED GET /api/wallpaper/:id
    // Returns raw image binary with exact Content-Type, Cache-Control: no-store, nosniff
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

            c.header("Content-Type", result.record.contentType);
            c.header("Cache-Control", "no-store");
            c.header("X-Content-Type-Options", "nosniff");
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
}
