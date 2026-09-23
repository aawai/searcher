import { STATUS_CODE } from "@std/http";
import { json, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import * as v from "@valibot/valibot";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { PreferencesService } from "./service.ts";
import type { EngineId } from "@shared/engines.ts";
import type { ThemeId } from "@shared/contracts.ts";

const EngineSchema = v.picklist(
    ["google", "bing", "baidu", "duckduckgo"],
    "无效的搜索引擎选项",
);

const ThemeSchema = v.picklist(
    ["system", "light", "dark", "forest"],
    "无效的主题选项",
);

const OptionalEngineSchema = v.optional(EngineSchema);
const OptionalThemeSchema = v.optional(ThemeSchema);

export function registerPreferencesRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
): void {
    const service = new PreferencesService(deps.store);

    // GET /api/preferences (protected)
    routes.get("/api/preferences", async (c) => {
        const user = c.get("user");
        const prefs = await service.get(user.id);
        return c.success(prefs);
    });

    // PATCH /api/preferences (protected)
    routes.patch(
        "/api/preferences",
        validator({
            defaultEngine: json(OptionalEngineSchema),
            theme: json(OptionalThemeSchema),
        }),
        async (c, data) => {
            if (data.defaultEngine === undefined && data.theme === undefined) {
                return c.fail(
                    STATUS_CODE.BadRequest,
                    "必须至少提供一个偏好设置字段",
                );
            }
            const user = c.get("user");
            const updated = await service.update(user.id, {
                defaultEngine: data.defaultEngine as EngineId | undefined,
                theme: data.theme as ThemeId | undefined,
            });
            return c.success(updated);
        },
    );
}
