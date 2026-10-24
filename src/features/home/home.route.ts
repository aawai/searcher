import type { Routes } from "@internal/hono/routes.ts";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { HomeService } from "./service.ts";

export function registerHomeRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
): void {
    const service = new HomeService(deps.store);
    routes.get("/api/home/continue", async (c) => {
        return c.success(await service.getContinue(c.get("user").id));
    });
}
