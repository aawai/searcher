/**
 * Web App Icons Route:
 * - GET /api/webapp-icons/:id (Public / Cached / Content-Type / nosniff)
 * - POST /api/webapp-icons/upload (Protected, multipart/form-data with 'icon')
 * - POST /api/webapp-icons/fetch (Protected, JSON { url: string } -> crawls & caches site icon)
 * - POST /api/webapp-icons/url (Protected, JSON { imageUrl: string } -> downloads & caches image)
 */

import type { Routes } from "@internal/hono/routes.ts";
import { failResponse } from "@internal/hono/middleware/response.ts";
import { json, validator } from "@internal/validator/hono.ts";
import * as v from "@valibot/valibot";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { WebAppIconService } from "./service.ts";

const UrlSchema = v.pipe(
    v.string("URL 必须为字符串"),
    v.trim(),
    v.minLength(1, "URL 不能为空"),
);
export function registerWebAppIconsRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
    service: WebAppIconService = deps.icons ?? new WebAppIconService(),
): void {
    // 1. GET /api/webapp-icons/:id (Public static icon serving)
    routes.public.get("/api/webapp-icons/:id", async (c) => {
        const id = c.req.param("id");
        if (!id) {
            return failResponse(c, 404, "图标不存在");
        }
        const result = await service.getIcon(id);
        if (!result) {
            return failResponse(c, 404, "图标不存在");
        }

        c.header("Content-Type", result.record.contentType);
        c.header("Cache-Control", "public, max-age=86400, immutable");
        c.header("X-Content-Type-Options", "nosniff");
        c.header("Content-Length", String(result.bytes.length));

        return new Response(result.bytes as unknown as BodyInit, {
            status: 200,
            headers: c.res.headers,
        });
    });

    // 2. POST /api/webapp-icons/upload (Protected)
    routes.post("/api/webapp-icons/upload", async (c) => {
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

        const file = formData.get("icon");
        if (!file || !(file instanceof File)) {
            return failResponse(c, 400, "请提供有效的 icon 文件");
        }

        if (file.size > 2 * 1024 * 1024) {
            return failResponse(c, 413, "图标文件大小不能超过 2 MiB");
        }

        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        try {
            const saved = await service.saveIcon(user.id, bytes);
            return c.success(saved);
        } catch (e) {
            return failResponse(
                c,
                400,
                e instanceof Error ? e.message : "上传图标失败",
            );
        }
    });

    // 3. POST /api/webapp-icons/fetch (Protected: auto-fetch from site URL)
    routes.post(
        "/api/webapp-icons/fetch",
        validator({
            url: json(UrlSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            if (!user) {
                return failResponse(c, 401, "请先登录");
            }

            try {
                const saved = await service.fetchAndSaveFromWebsite(
                    user.id,
                    data.url,
                );
                return c.success(saved);
            } catch (e) {
                return failResponse(
                    c,
                    400,
                    e instanceof Error ? e.message : "获取站点图标失败",
                );
            }
        },
    );

    // 4. POST /api/webapp-icons/url (Protected: fetch from direct image URL)
    routes.post(
        "/api/webapp-icons/url",
        validator({
            imageUrl: json(UrlSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            if (!user) {
                return failResponse(c, 401, "请先登录");
            }

            try {
                const saved = await service.fetchAndSaveFromUrl(
                    user.id,
                    data.imageUrl,
                );
                return c.success(saved);
            } catch (e) {
                return failResponse(
                    c,
                    400,
                    e instanceof Error ? e.message : "下载图标失败",
                );
            }
        },
    );
}
