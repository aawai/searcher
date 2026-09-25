import { assertEquals } from "@std/assert";
import { STATUS_CODE } from "@std/http";
import { Hono } from "hono";
import { Routes } from "@internal/hono/routes.ts";
import { responseMiddleware } from "@internal/hono/middleware/response.ts";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import { createSessionMiddleware } from "../auth/middleware.ts";
import { registerAuthRoutes } from "../auth/auth.route.ts";
import { registerWebAppIconsRoutes } from "./webapp-icons.route.ts";
import { WebAppIconService } from "./service.ts";
import type { Envelope } from "@shared/contracts.ts";
import type { AppDeps, AppEnv } from "../../serve/env.ts";

const ORIGIN = "http://localhost:8000";

Deno.test("WebAppIcons routes: upload, fetch, and serve", async () => {
    const tempDir = await Deno.makeTempDir({
        prefix: "searcher-icon-route-test-",
    });
    try {
        const store = openDatabase(":memory:");
        await migrateDatabase(store);
        const auth = new AuthService({
            store,
            origin: ORIGIN,
        });
        const service = new WebAppIconService(tempDir);

        const deps: AppDeps = {
            store,
            auth,
            origin: ORIGIN,
            now: () => Date.now(),
        };

        const app = new Hono<AppEnv>();
        app.use("*", responseMiddleware);

        const routes = new Routes<AppEnv>();
        registerAuthRoutes(routes, deps);
        registerWebAppIconsRoutes(routes, deps, service);
        routes.mount(app, [createSessionMiddleware(deps.auth)]);

        // 1. Register a test user
        const regRes = await app.request(`${ORIGIN}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: "icontester",
                displayName: "Icon Tester",
                password: "Password123!",
            }),
        });
        assertEquals(regRes.status, STATUS_CODE.OK);
        const setCookie = regRes.headers.get("set-cookie") ?? "";
        const cookieMatch = setCookie.match(
            new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
        );
        const cookieHeader = `${SESSION_COOKIE_NAME}=${
            cookieMatch ? cookieMatch[1] : ""
        }`;

        // 2. Test GET 404
        const res404 = await app.request(
            `${ORIGIN}/api/webapp-icons/non-existent`,
        );
        assertEquals(res404.status, STATUS_CODE.NotFound);

        // 3. Test POST upload without auth -> 401
        const pngHeader = new Uint8Array([
            0x89,
            0x50,
            0x4e,
            0x47,
            0x0d,
            0x0a,
            0x1a,
            0x0a,
            0x00,
            0x00,
            0x00,
            0x0d,
        ]);
        const form1 = new FormData();
        form1.append(
            "icon",
            new File([pngHeader], "test.png", { type: "image/png" }),
        );
        const unauthRes = await app.request(
            `${ORIGIN}/api/webapp-icons/upload`,
            {
                method: "POST",
                body: form1,
            },
        );
        assertEquals(unauthRes.status, STATUS_CODE.Unauthorized);

        // 4. With auth -> 200
        const form2 = new FormData();
        form2.append(
            "icon",
            new File([pngHeader], "test.png", { type: "image/png" }),
        );
        const uploadRes = await app.request(
            `${ORIGIN}/api/webapp-icons/upload`,
            {
                method: "POST",
                headers: { Cookie: cookieHeader },
                body: form2,
            },
        );
        assertEquals(uploadRes.status, STATUS_CODE.OK);
        const json = await uploadRes.json() as Envelope<
            { id: string; url: string }
        >;
        assertEquals(json.status, true);
        assertEquals(typeof json.data?.id, "string");
        assertEquals(typeof json.data?.url, "string");

        // 5. GET uploaded icon -> 200 with Cache-Control and Content-Type
        const getRes = await app.request(`${ORIGIN}${json.data!.url}`);
        assertEquals(getRes.status, STATUS_CODE.OK);
        assertEquals(getRes.headers.get("content-type"), "image/png");
        assertEquals(
            getRes.headers.get("cache-control")?.includes("public"),
            true,
        );
        const resBytes = new Uint8Array(await getRes.arrayBuffer());
        assertEquals(resBytes.length, pngHeader.length);
    } finally {
        await Deno.remove(tempDir, { recursive: true }).catch(() => {});
    }
});
