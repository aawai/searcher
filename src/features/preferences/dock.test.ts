import { assertEquals } from "@std/assert";
import { eq, sql } from "drizzle-orm";
import { webapps } from "../../db/schema.ts";
import { createApp } from "../../app.ts";
import { AuthService } from "../auth/service.ts";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import type { Envelope, PreferencesDto } from "@shared/contracts.ts";
import { DEFAULT_DOCK_PREFERENCES } from "@shared/dock.ts";
import type { WebAppDto } from "../bookmarks/service.ts";

const origin = "http://localhost:8000";

Deno.test("dock preferences: default preferences for guest and new user", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });

        // 1. Guest GET
        const guestRes = await app.request("/api/preferences");
        assertEquals(guestRes.status, 200);
        const guestBody = await guestRes.json() as Envelope<PreferencesDto>;
        assertEquals(guestBody.data?.dock, DEFAULT_DOCK_PREFERENCES);

        // 2. New user GET
        const regRes = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username: "dock_user_1",
                displayName: "Dock User 1",
                password: "Password123456!",
            }),
        });
        const cookie = regRes.headers.get("set-cookie")?.split(";")[0] ?? "";
        const userRes = await app.request("/api/preferences", {
            headers: { cookie },
        });
        assertEquals(userRes.status, 200);
        const userBody = await userRes.json() as Envelope<PreferencesDto>;
        assertEquals(userBody.data?.dock, DEFAULT_DOCK_PREFERENCES);
    } finally {
        await store.close();
    }
});

Deno.test("dock preferences: systemOrder reordering and validation guards", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });

        const regRes = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username: "dock_order_user",
                displayName: "Order User",
                password: "Password123456!",
            }),
        });
        const cookie = regRes.headers.get("set-cookie")?.split(";")[0] ?? "";

        // 1. Valid reordering
        const reordered = ["ai", "notes", "apps", "home"] as const;
        const validPatch = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                dock: { systemOrder: reordered },
            }),
        });
        assertEquals(validPatch.status, 200);
        const validBody = await validPatch.json() as Envelope<PreferencesDto>;
        assertEquals(validBody.data?.dock.systemOrder, [...reordered]);

        // 2. Incomplete systemOrder (missing 'home') -> 400
        const incompletePatch = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                dock: { systemOrder: ["ai", "notes", "apps"] },
            }),
        });
        assertEquals(incompletePatch.status, 400);

        // 3. Duplicated system id -> 400
        const duplicatePatch = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                dock: { systemOrder: ["ai", "ai", "notes", "apps"] },
            }),
        });
        assertEquals(duplicatePatch.status, 400);

        // 4. Invalid system id -> 400
        const invalidPatch = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                dock: { systemOrder: ["ai", "notes", "apps", "invalid"] },
            }),
        });
        assertEquals(invalidPatch.status, 400);

        // 5. Valid hiddenSystemIds partial update preserves systemOrder
        const hidePatch = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                dock: { hiddenSystemIds: ["notes", "ai"] },
            }),
        });
        assertEquals(hidePatch.status, 200);
        const hideBody = await hidePatch.json() as Envelope<PreferencesDto>;
        assertEquals(hideBody.data?.dock.systemOrder, [...reordered]);
        assertEquals(hideBody.data?.dock.hiddenSystemIds, ["notes", "ai"]);

        // 6. All four system entries hidden is valid -> 200
        const hideAllPatch = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                dock: { hiddenSystemIds: ["home", "apps", "notes", "ai"] },
            }),
        });
        assertEquals(hideAllPatch.status, 200);
        const hideAllBody = await hideAllPatch.json() as Envelope<
            PreferencesDto
        >;
        assertEquals(hideAllBody.data?.dock.hiddenSystemIds, [
            "home",
            "apps",
            "notes",
            "ai",
        ]);

        // 7. Duplicated hiddenSystemIds -> 400
        const dupHiddenPatch = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                dock: { hiddenSystemIds: ["home", "home"] },
            }),
        });
        assertEquals(dupHiddenPatch.status, 400);

        // 8. Invalid hiddenSystemIds item -> 400
        const invalidHiddenPatch = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                dock: { hiddenSystemIds: ["home", "invalid"] },
            }),
        });
        assertEquals(invalidHiddenPatch.status, 400);
    } finally {
        await store.close();
    }
});

Deno.test("dock preferences: appIds pinning validation, isolation and privacy", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });

        // User A
        const regA = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username: "user_a",
                displayName: "User A",
                password: "Password123456!",
            }),
        });
        const cookieA = regA.headers.get("set-cookie")?.split(";")[0] ?? "";

        // User B
        const regB = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username: "user_b",
                displayName: "User B",
                password: "Password123456!",
            }),
        });
        const cookieB = regB.headers.get("set-cookie")?.split(";")[0] ?? "";

        // User A creates webapps
        const createAppRes1 = await app.request("/api/webapps", {
            method: "POST",
            headers: {
                origin,
                cookie: cookieA,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                name: "App 1",
                url: "https://app1.example.com",
            }),
        });
        const app1 = (await createAppRes1.json() as Envelope<WebAppDto>).data!;

        const createAppRes2 = await app.request("/api/webapps", {
            method: "POST",
            headers: {
                origin,
                cookie: cookieA,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                name: "App 2",
                url: "https://app2.example.com",
            }),
        });
        const app2 = (await createAppRes2.json() as Envelope<WebAppDto>).data!;

        // User B creates webapp
        const createAppResB = await app.request("/api/webapps", {
            method: "POST",
            headers: {
                origin,
                cookie: cookieB,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                name: "App B",
                url: "https://appb.example.com",
            }),
        });
        const appB = (await createAppResB.json() as Envelope<WebAppDto>).data!;

        // 1. User A pins app1 and app2 -> 200
        const pinResA = await app.request("/api/preferences", {
            method: "PATCH",
            headers: {
                origin,
                cookie: cookieA,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                dock: { appIds: [app1.id, app2.id] },
            }),
        });
        assertEquals(pinResA.status, 200);
        const pinBodyA = await pinResA.json() as Envelope<PreferencesDto>;
        assertEquals(pinBodyA.data?.dock.appIds, [app1.id, app2.id]);

        // 2. User A cannot pin duplicate appIds -> 400
        const dupPinRes = await app.request("/api/preferences", {
            method: "PATCH",
            headers: {
                origin,
                cookie: cookieA,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                dock: { appIds: [app1.id, app1.id] },
            }),
        });
        assertEquals(dupPinRes.status, 400);

        // 3. User A cannot pin foreign user B's app -> 400 (avoids leaking existence)
        const foreignPinRes = await app.request("/api/preferences", {
            method: "PATCH",
            headers: {
                origin,
                cookie: cookieA,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                dock: { appIds: [appB.id] },
            }),
        });
        assertEquals(foreignPinRes.status, 400);
        const foreignBody = await foreignPinRes.json() as Envelope<never>;
        assertEquals(foreignBody.message, "应用不存在或已被删除");

        // 4. User B preferences are isolated (dock.appIds is still empty)
        const getResB = await app.request("/api/preferences", {
            headers: { cookie: cookieB },
        });
        assertEquals(getResB.status, 200);
        const bodyB = await getResB.json() as Envelope<PreferencesDto>;
        assertEquals(bodyB.data?.dock.appIds, []);
    } finally {
        await store.close();
    }
});

Deno.test("dock preferences: bookmark deletion clears pinned app; restore does not re-pin", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });

        const regRes = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username: "trash_dock_user",
                displayName: "Trash Dock User",
                password: "Password123456!",
            }),
        });
        const cookie = regRes.headers.get("set-cookie")?.split(";")[0] ?? "";

        // Create app
        const createRes = await app.request("/api/webapps", {
            method: "POST",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                name: "Trash Me",
                url: "https://trash.example.com",
            }),
        });
        const webapp = (await createRes.json() as Envelope<WebAppDto>).data!;

        // Pin to dock
        const pinRes = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({ dock: { appIds: [webapp.id] } }),
        });
        assertEquals(pinRes.status, 200);
        assertEquals(
            (await pinRes.json() as Envelope<PreferencesDto>).data?.dock.appIds,
            [webapp.id],
        );

        // 1. Soft delete (move to trash)
        const softDeleteRes = await app.request(`/api/webapps/${webapp.id}`, {
            method: "DELETE",
            headers: { origin, cookie },
        });
        assertEquals(softDeleteRes.status, 200);

        // Verify dock preferences cleared pinned webapp in same transaction
        const prefAfterTrash = await app.request("/api/preferences", {
            headers: { cookie },
        });
        const prefAfterTrashBody = await prefAfterTrash.json() as Envelope<
            PreferencesDto
        >;
        assertEquals(prefAfterTrashBody.data?.dock.appIds, []);

        // 2. Restore app from trash -> MUST NOT re-pin!
        const restoreRes = await app.request(
            `/api/webapps/${webapp.id}/restore`,
            {
                method: "POST",
                headers: { origin, cookie },
            },
        );
        assertEquals(restoreRes.status, 200);

        const prefAfterRestore = await app.request("/api/preferences", {
            headers: { cookie },
        });
        const prefAfterRestoreBody = await prefAfterRestore.json() as Envelope<
            PreferencesDto
        >;
        assertEquals(prefAfterRestoreBody.data?.dock.appIds, []);

        // 3. Re-pin restored app, then permanent delete
        const repinRes = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({ dock: { appIds: [webapp.id] } }),
        });
        assertEquals(repinRes.status, 200);

        const permDeleteRes = await app.request(
            `/api/webapps/${webapp.id}/permanent`,
            {
                method: "DELETE",
                headers: { origin, cookie },
            },
        );
        assertEquals(permDeleteRes.status, 200);

        const prefAfterPerm = await app.request("/api/preferences", {
            headers: { cookie },
        });
        const prefAfterPermBody = await prefAfterPerm.json() as Envelope<
            PreferencesDto
        >;
        assertEquals(prefAfterPermBody.data?.dock.appIds, []);
    } finally {
        await store.close();
    }
});

Deno.test("dock preferences: atomic rollback fault injection ensures webapp deletion rolls back if preferences unpin fails", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });

        const regRes = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username: "rollback_test_user",
                displayName: "Rollback User",
                password: "Password123456!",
            }),
        });
        const cookie = regRes.headers.get("set-cookie")?.split(";")[0] ?? "";

        // 1. Create and pin a webapp
        const createRes = await app.request("/api/webapps", {
            method: "POST",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                name: "Rollback App",
                url: "https://rollback.example.com",
            }),
        });
        const webapp = (await createRes.json() as Envelope<WebAppDto>).data!;

        const pinRes = await app.request("/api/preferences", {
            method: "PATCH",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({ dock: { appIds: [webapp.id] } }),
        });
        assertEquals(pinRes.status, 200);

        // 2. Inject fault: trigger that aborts when preferences is updated
        await store.run(async (db) => {
            await db.run(sql`
                CREATE TRIGGER fail_pref_dock_unpin
                BEFORE UPDATE ON preferences
                BEGIN
                    SELECT RAISE(ABORT, 'forced failure on preferences update');
                END;
            `);
        });

        // 3. Attempt soft delete -> must fail (status 500) because preferences unpin aborts
        const softDeleteRes = await app.request(`/api/webapps/${webapp.id}`, {
            method: "DELETE",
            headers: { origin, cookie },
        });
        assertEquals(softDeleteRes.status, 500);

        // 4. Verify transaction rolled back: webapp is NOT soft-deleted!
        const webappAfterFail = await store.run(async (db) => {
            return await db
                .select({ id: webapps.id, deletedAt: webapps.deletedAt })
                .from(webapps)
                .where(eq(webapps.id, webapp.id))
                .all();
        });
        assertEquals(webappAfterFail.length, 1);
        assertEquals(webappAfterFail[0].deletedAt, null);

        // 5. Attempt permanent delete -> must also abort and roll back
        const permDeleteRes = await app.request(
            `/api/webapps/${webapp.id}/permanent`,
            {
                method: "DELETE",
                headers: { origin, cookie },
            },
        );
        assertEquals(permDeleteRes.status, 500);

        // Verify permanent delete rolled back: webapp still exists in database!
        const webappAfterPermFail = await store.run(async (db) => {
            return await db
                .select({ id: webapps.id })
                .from(webapps)
                .where(eq(webapps.id, webapp.id))
                .all();
        });
        assertEquals(webappAfterPermFail.length, 1);

        // 6. Remove the trigger
        await store.run(async (db) => {
            await db.run(sql`DROP TRIGGER fail_pref_dock_unpin;`);
        });

        // 7. Now normal deletion succeeds
        const normalDelRes = await app.request(`/api/webapps/${webapp.id}`, {
            method: "DELETE",
            headers: { origin, cookie },
        });
        assertEquals(normalDelRes.status, 200);

        const prefAfterSuccess = await app.request("/api/preferences", {
            headers: { cookie },
        });
        const prefBody = await prefAfterSuccess.json() as Envelope<
            PreferencesDto
        >;
        assertEquals(prefBody.data?.dock.appIds, []);
    } finally {
        await store.close();
    }
});
