import { assertEquals } from "@std/assert";
import { STATUS_CODE } from "@std/http";
import { createApp } from "../../app.ts";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import { WebAppIconService } from "./service.ts";
import { SystemSettingsStore } from "../system/settings-store.ts";
import type { Envelope } from "@shared/contracts.ts";
import type { AppDeps } from "../../serve/env.ts";

const ORIGIN = "http://localhost:8000";

Deno.test("WebAppIcons routes: upload, fetch, and serve", async () => {
    const tempDir = await Deno.makeTempDir({
        prefix: "searcher-icon-route-test-",
    });
    const store = openDatabase(":memory:");
    try {
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
            settings: new SystemSettingsStore(":memory:"),
        };

        const app = createApp({ ...deps, icons: service });

        // 1. Register a test user
        const regRes = await app.request(`${ORIGIN}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: ORIGIN },
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
        const imageBytes = new Uint8Array(2 * 1024 * 1024);
        imageBytes.set(pngHeader);
        const form1 = new FormData();
        form1.append(
            "icon",
            new File([imageBytes], "test.png", { type: "image/png" }),
        );
        const unauthRes = await app.request(
            `${ORIGIN}/api/webapp-icons/upload`,
            {
                method: "POST",
                headers: { Origin: ORIGIN },
                body: form1,
            },
        );
        assertEquals(unauthRes.status, STATUS_CODE.Unauthorized);

        // 4. With auth -> 200
        const form2 = new FormData();
        form2.append(
            "icon",
            new File([imageBytes], "test.png", { type: "image/png" }),
        );
        const uploadRes = await app.request(
            `${ORIGIN}/api/webapp-icons/upload`,
            {
                method: "POST",
                headers: { Cookie: cookieHeader, Origin: ORIGIN },
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
        assertEquals(resBytes, imageBytes);
        const oversized = new FormData();
        oversized.append(
            "icon",
            new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", {
                type: "image/png",
            }),
        );
        const oversizedRes = await app.request(
            `${ORIGIN}/api/webapp-icons/upload`,
            {
                method: "POST",
                headers: { Cookie: cookieHeader, Origin: ORIGIN },
                body: oversized,
            },
        );
        assertEquals(oversizedRes.status, STATUS_CODE.ContentTooLarge);
        const crossOriginRes = await app.request(
            `${ORIGIN}/api/webapp-icons/upload`,
            {
                method: "POST",
                headers: {
                    Cookie: cookieHeader,
                    Origin: "https://untrusted.example",
                },
                body: form2,
            },
        );
        assertEquals(crossOriginRes.status, STATUS_CODE.Forbidden);
        const wrongTypeRes = await app.request(
            `${ORIGIN}/api/webapp-icons/upload`,
            {
                method: "POST",
                headers: {
                    Cookie: cookieHeader,
                    Origin: ORIGIN,
                    "Content-Type": "application/json",
                },
                body: "{}",
            },
        );
        assertEquals(wrongTypeRes.status, STATUS_CODE.UnsupportedMediaType);
        const largeJsonRes = await app.request(`${ORIGIN}/api/auth/login`, {
            method: "POST",
            headers: { Origin: ORIGIN, "Content-Type": "application/json" },
            body: JSON.stringify({ password: "a".repeat(64 * 1024) }),
        });
        assertEquals(largeJsonRes.status, STATUS_CODE.ContentTooLarge);
    } finally {
        store.close();
        await Deno.remove(tempDir, { recursive: true }).catch(() => {});
    }
});
