import { assertEquals } from "@std/assert";
import { createApp } from "../../app.ts";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService } from "../auth/service.ts";
import { SystemSettingsStore } from "../system/settings-store.ts";
import { WebAppIconService } from "../webapp-icons/service.ts";
import type { WebAppDto } from "./service.ts";

const ORIGIN = "http://localhost:8000";

Deno.test("webapp icon backfill preserves manual edits and never blocks creation", async () => {
    const store = openDatabase(":memory:");
    let finishFetch: (() => void) | undefined;
    let fetchStarted: (() => void) | undefined;
    let failFetch = false;
    let calls = 0;
    class Icons extends WebAppIconService {
        override async fetchAndSaveFromWebsite(
            userId: string | null,
            _url: string,
        ) {
            calls++;
            fetchStarted?.();
            if (failFetch) throw new Error("Website unavailable");
            const gate = Promise.withResolvers<void>();
            finishFetch = gate.resolve;
            await gate.promise;
            return {
                id: "real-icon",
                ownerUserId: userId,
                contentType: "image/png",
                size: 1,
                sha256: "hash",
                relativePath: "real-icon.png",
                createdAt: 1,
                url: "/api/webapp-icons/real-icon",
                siteName: "Website",
            };
        }
    }
    try {
        await migrateDatabase(store);
        const app = createApp({
            store,
            origin: ORIGIN,
            auth: new AuthService({ store, origin: ORIGIN }),
            settings: new SystemSettingsStore(":memory:"),
            icons: new Icons(),
        });
        const registration = await app.request("/api/auth/register", {
            method: "POST",
            headers: { Origin: ORIGIN, "Content-Type": "application/json" },
            body: JSON.stringify({
                username: "iconcontract",
                displayName: "Icons",
                password: "Password123!",
            }),
        });
        const cookie = registration.headers.get("set-cookie")!.split(";")[0];
        const send = async (path: string, method = "GET", body?: unknown) => {
            const response = await app.request(path, {
                method,
                headers: {
                    Origin: ORIGIN,
                    Cookie: cookie,
                    "Content-Type": "application/json",
                },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            return { status: response.status, body: await response.json() };
        };
        const created = await send("/api/webapps", "POST", {
            name: "Fast creation",
            url: "https://example.com",
        });
        assertEquals(created.status, 200);
        assertEquals(calls, 0);
        const item = created.body.data as WebAppDto;
        const started = Promise.withResolvers<void>();
        fetchStarted = started.resolve;
        const pending = send(`/api/webapps/${item.id}/fetch-icon`, "POST");
        await started.promise;
        // This request must complete while the external fetch is still pending.
        await send(`/api/webapps/${item.id}`, "PATCH", {
            iconAssetId: "manual",
            iconSource: "upload",
        });
        finishFetch!();
        const result = await pending;
        assertEquals(result.status, 200);
        assertEquals(result.body.data.iconAssetId, "manual");
        assertEquals(
            (await send(`/api/webapps/${item.id}`)).body.data.iconSource,
            "upload",
        );
        await send(`/api/webapps/${item.id}/fetch-icon`, "POST");
        assertEquals(calls, 1);
        await send(`/api/webapps/${item.id}`, "PATCH", {
            iconAssetId: null,
            iconSource: "default",
        });
        failFetch = true;
        assertEquals(
            (await send(`/api/webapps/${item.id}/fetch-icon`, "POST")).status,
            400,
        );
        assertEquals(
            (await send(`/api/webapps/${item.id}`)).body.data.iconAssetId,
            null,
        );
        failFetch = false;
        const changedUrlStarted = Promise.withResolvers<void>();
        fetchStarted = changedUrlStarted.resolve;
        const stale = send(`/api/webapps/${item.id}/fetch-icon`, "POST");
        await changedUrlStarted.promise;
        await send(`/api/webapps/${item.id}`, "PATCH", {
            url: "https://changed.example/",
        });
        finishFetch!();
        assertEquals((await stale).body.data.iconAssetId, null);
        const nextStarted = Promise.withResolvers<void>();
        fetchStarted = nextStarted.resolve;
        const successful = send(`/api/webapps/${item.id}/fetch-icon`, "POST");
        await nextStarted.promise;
        finishFetch!();
        const backfilled = await successful;
        assertEquals(backfilled.body.data.iconAssetId, "real-icon");
        assertEquals(backfilled.body.data.iconSource, "website");
    } finally {
        finishFetch?.();
        await store.close();
    }
});
