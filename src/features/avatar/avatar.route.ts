import * as v from "@valibot/valibot";
import { json, param, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import { failResponse } from "@internal/hono/middleware/response.ts";
import {
    AVATAR_UPLOAD_MAX_BYTES,
    AVATAR_UPLOAD_MAX_MIB,
    type AvatarCrop,
} from "@shared/avatar.ts";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import {
    AvatarNotFoundError,
    AvatarService,
    AvatarValidationError,
} from "./service.ts";

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const avatarIdParamSchema = v.pipe(
    v.string("头像 ID 必须是字符串"),
    v.regex(UUID_REGEX, "头像 ID 格式无效"),
);

const cropSchema = {
    x: json(
        v.pipe(
            v.number("裁剪横坐标必须是数字"),
            v.finite("裁剪横坐标必须是有效数字"),
            v.minValue(0, "裁剪横坐标不能小于 0"),
            v.maxValue(1, "裁剪横坐标不能大于 1"),
        ),
    ),
    y: json(
        v.pipe(
            v.number("裁剪纵坐标必须是数字"),
            v.finite("裁剪纵坐标必须是有效数字"),
            v.minValue(0, "裁剪纵坐标不能小于 0"),
            v.maxValue(1, "裁剪纵坐标不能大于 1"),
        ),
    ),
    size: json(
        v.pipe(
            v.number("裁剪尺寸必须是数字"),
            v.finite("裁剪尺寸必须是有效数字"),
            v.gtValue(0, "裁剪尺寸必须大于 0"),
            v.maxValue(1, "裁剪尺寸不能大于 1"),
        ),
    ),
};

function parseOptionalCropField(
    raw: FormDataEntryValue | null,
): number | undefined {
    if (typeof raw !== "string" || raw.trim() === "") return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function parseFormCrop(formData: FormData): Partial<AvatarCrop> | null {
    const x = parseOptionalCropField(formData.get("cropX"));
    const y = parseOptionalCropField(formData.get("cropY"));
    const size = parseOptionalCropField(formData.get("cropSize"));
    if (x === undefined && y === undefined && size === undefined) {
        return null;
    }
    return { x, y, size };
}

export function registerAvatarRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
    service: AvatarService = new AvatarService(deps.store, deps.now),
): void {
    routes.get("/api/account/avatar", async (c) => {
        const user = c.get("user");
        const avatar = await service.getMeta(user.id);
        return c.success({ avatar });
    });

    routes.post("/api/account/avatar", async (c) => {
        const user = c.get("user");
        let formData: FormData;
        try {
            formData = await c.req.formData();
        } catch {
            return failResponse(c, 400, "无法解析的表单数据");
        }

        const file = formData.get("avatar");
        if (!file || !(file instanceof File)) {
            return failResponse(c, 400, "请提供有效的头像图片文件");
        }
        if (file.size < 1) {
            return failResponse(c, 400, "头像图片不能为空");
        }
        if (file.size > AVATAR_UPLOAD_MAX_BYTES) {
            return failResponse(
                c,
                413,
                `头像图片大小不能超过 ${AVATAR_UPLOAD_MAX_MIB} MiB`,
            );
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const crop = parseFormCrop(formData);

        try {
            const avatar = await service.upload(user.id, bytes, crop);
            return c.success({ avatar, avatarUrl: avatar.avatarUrl });
        } catch (err) {
            if (err instanceof AvatarValidationError) {
                return failResponse(c, 400, err.message);
            }
            throw err;
        }
    });

    routes.patch(
        "/api/account/avatar/crop",
        validator(cropSchema),
        async (c, data) => {
            const user = c.get("user");
            try {
                const avatar = await service.recrop(user.id, {
                    x: data.x,
                    y: data.y,
                    size: data.size,
                });
                return c.success({ avatar, avatarUrl: avatar.avatarUrl });
            } catch (err) {
                if (err instanceof AvatarNotFoundError) {
                    return failResponse(c, 404, err.message);
                }
                if (err instanceof AvatarValidationError) {
                    return failResponse(c, 400, err.message);
                }
                throw err;
            }
        },
    );

    routes.delete("/api/account/avatar", async (c) => {
        const user = c.get("user");
        await service.remove(user.id);
        return c.success({ avatarUrl: null }, "头像已移除");
    });

    routes.get(
        "/api/avatars/:id",
        validator({ id: param(avatarIdParamSchema) }),
        async (c, data) => {
            const user = c.get("user");
            const result = await service.readDisplay(data.id, user);
            if (!result) {
                return failResponse(c, 404, "头像不存在");
            }
            c.header("Content-Type", result.contentType);
            c.header("Cache-Control", "private, max-age=31536000, immutable");
            c.header("X-Content-Type-Options", "nosniff");
            c.header("Content-Length", String(result.bytes.length));
            return new Response(result.bytes as unknown as BodyInit, {
                status: 200,
                headers: c.res.headers,
            });
        },
    );

    routes.get(
        "/api/avatars/:id/original",
        validator({ id: param(avatarIdParamSchema) }),
        async (c, data) => {
            const user = c.get("user");
            const result = await service.readOriginal(data.id, user.id);
            if (!result) {
                return failResponse(c, 404, "原图不存在");
            }
            c.header("Content-Type", result.contentType);
            c.header("Cache-Control", "private, max-age=31536000, immutable");
            c.header("X-Content-Type-Options", "nosniff");
            c.header("Content-Disposition", "inline");
            c.header("Content-Length", String(result.bytes.length));
            return new Response(result.bytes as unknown as BodyInit, {
                status: 200,
                headers: c.res.headers,
            });
        },
    );
}
