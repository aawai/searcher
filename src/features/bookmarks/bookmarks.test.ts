import { assertEquals } from "@std/assert";
import { STATUS_CODE } from "@std/http";
import type { Hono } from "hono";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import type { AppEnv } from "../../serve/env.ts";
import { createApp } from "../../app.ts";
import type { Envelope } from "@shared/contracts.ts";
import type { WebAppDto, WebAppGroupDto } from "./service.ts";

const ORIGIN = "http://localhost:8000";

async function setupTestApp() {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);

    const auth = new AuthService({
        store,
        origin: ORIGIN,
    });

    const app = createApp({
        store,
        auth,
        origin: ORIGIN,
        now: () => Date.now(),
    });

    return { store, auth, app };
}

function extractCookie(response: Response, name: string): string | null {
    const setCookie = response.headers.get("set-cookie");
    if (!setCookie) return null;
    const match = setCookie.match(new RegExp(`${name}=([^;]+)`));
    return match ? match[1] : null;
}

async function registerUser(app: Hono<AppEnv>, username: string) {
    const res = await app.request("/api/auth/register", {
        method: "POST",
        headers: {
            "origin": ORIGIN,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            username,
            displayName: `Display ${username}`,
            password: "Password123456!",
        }),
    });
    const token = extractCookie(res, SESSION_COOKIE_NAME);
    return token!;
}

Deno.test({
    name: "webapps contract: strict user isolation and duplicate url allowed",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            const tokenA = await registerUser(app, "user_w_a");
            const tokenB = await registerUser(app, "user_w_b");

            // User A creates a webapp
            const createA1 = await app.request("/api/webapps", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
                },
                body: JSON.stringify({
                    name: "GitHub",
                    url: "https://github.com",
                }),
            });
            assertEquals(createA1.status, STATUS_CODE.OK);
            const wA1 = (await createA1.json() as Envelope<WebAppDto>).data!;

            // User A creates another webapp with the SAME URL -> spec 9.5: duplicate URL is allowed!
            const createA2 = await app.request("/api/webapps", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
                },
                body: JSON.stringify({
                    name: "GitHub Second",
                    url: "https://github.com/",
                }),
            });
            assertEquals(createA2.status, STATUS_CODE.OK);
            const wA2 = (await createA2.json() as Envelope<WebAppDto>).data!;
            assertEquals(wA1.url, wA2.url);

            // User B creates the same URL -> allowed
            const createB = await app.request("/api/webapps", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
                },
                body: JSON.stringify({
                    name: "GitHub for B",
                    url: "https://github.com",
                }),
            });
            assertEquals(createB.status, STATUS_CODE.OK);

            // User B cannot get, patch or delete User A's webapp -> 404
            const getAlien = await app.request(`/api/webapps/${wA1.id}`, {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
                },
            });
            assertEquals(getAlien.status, STATUS_CODE.NotFound);

            const patchAlien = await app.request(`/api/webapps/${wA1.id}`, {
                method: "PATCH",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
                },
                body: JSON.stringify({
                    name: "Hacked",
                }),
            });
            assertEquals(patchAlien.status, STATUS_CODE.NotFound);

            const deleteAlien = await app.request(`/api/webapps/${wA1.id}`, {
                method: "DELETE",
                headers: {
                    "origin": ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
                },
            });
            assertEquals(deleteAlien.status, STATUS_CODE.NotFound);
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "webapps & webapp-groups: CRUD, groups, group deletion migration, pin, order, soft-delete, trash and restore",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            const token = await registerUser(app, "user_webapps_full");

            // 1. Create a WebApp group
            const createGroupRes = await app.request("/api/webapp-groups", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    name: "Development",
                    sortOrder: 1,
                }),
            });
            assertEquals(createGroupRes.status, STATUS_CODE.OK);
            const devGroup =
                (await createGroupRes.json() as Envelope<WebAppGroupDto>).data!;
            assertEquals(devGroup.name, "Development");
            assertEquals(devGroup.folderSize, "small");

            // 2. Create WebApps (one grouped, one ungrouped)
            const createW1Res = await app.request("/api/webapps", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    name: "GitHub",
                    url: "https://github.com",
                    groupId: devGroup.id,
                    isPinned: true,
                    sortOrder: 1,
                    pinnedSortOrder: 1,
                    openMode: "new_tab",
                }),
            });
            assertEquals(createW1Res.status, STATUS_CODE.OK);
            const w1 = (await createW1Res.json() as Envelope<WebAppDto>).data!;
            assertEquals(w1.name, "GitHub");
            assertEquals(w1.groupId, devGroup.id);
            assertEquals(w1.isPinned, true);
            assertEquals(w1.openMode, "new_tab");

            // 2b. Patch group folderSize to large
            const patchGroupRes = await app.request(
                `/api/webapp-groups/${devGroup.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "origin": ORIGIN,
                        "content-type": "application/json",
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                    body: JSON.stringify({
                        folderSize: "large",
                    }),
                },
            );
            assertEquals(patchGroupRes.status, STATUS_CODE.OK);
            const patchedGroup =
                (await patchGroupRes.json() as Envelope<WebAppGroupDto>).data!;
            assertEquals(patchedGroup.folderSize, "large");

            const createW2Res = await app.request("/api/webapps", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    name: "Figma",
                    url: "https://figma.com",
                    isPinned: false,
                    sortOrder: 2,
                }),
            });
            assertEquals(createW2Res.status, STATUS_CODE.OK);
            const w2 = (await createW2Res.json() as Envelope<WebAppDto>).data!;

            // 3. Query filtered by pinned and groupId
            const listPinnedRes = await app.request(
                "/api/webapps?pinned=true",
                {
                    method: "GET",
                    headers: {
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(listPinnedRes.status, STATUS_CODE.OK);
            const pinnedList =
                (await listPinnedRes.json() as Envelope<WebAppDto[]>).data!;
            assertEquals(pinnedList.length, 1);
            assertEquals(pinnedList[0].id, w1.id);

            const listGroupRes = await app.request(
                `/api/webapps?groupId=${devGroup.id}`,
                {
                    method: "GET",
                    headers: {
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(listGroupRes.status, STATUS_CODE.OK);
            const groupApps =
                (await listGroupRes.json() as Envelope<WebAppDto[]>).data!;
            assertEquals(groupApps.length, 1);
            assertEquals(groupApps[0].id, w1.id);

            // 4. Reorder webapps
            const reorderRes = await app.request("/api/webapps/reorder", {
                method: "PUT",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    items: [
                        { id: w1.id, sortOrder: 10, pinnedSortOrder: 2 },
                        { id: w2.id, sortOrder: 5, pinnedSortOrder: 1 },
                    ],
                }),
            });
            assertEquals(reorderRes.status, STATUS_CODE.OK);

            // 5. Soft-delete w1 -> moves to trash
            const deleteRes = await app.request(`/api/webapps/${w1.id}`, {
                method: "DELETE",
                headers: {
                    "origin": ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
            });
            assertEquals(deleteRes.status, STATUS_CODE.OK);

            // List normal webapps -> w1 not present
            const listAfterDelete = await app.request("/api/webapps", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
            });
            assertEquals(listAfterDelete.status, STATUS_CODE.OK);
            const normalList =
                (await listAfterDelete.json() as Envelope<WebAppDto[]>).data!;
            assertEquals(normalList.some((w) => w.id === w1.id), false);

            // Trash contains w1
            const trashRes = await app.request("/api/webapps/trash", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
            });
            assertEquals(trashRes.status, STATUS_CODE.OK);
            const trashList = (await trashRes.json() as Envelope<WebAppDto[]>)
                .data!;
            assertEquals(trashList.some((w) => w.id === w1.id), true);

            // 6. Restore w1 from trash
            const restoreRes = await app.request(
                `/api/webapps/${w1.id}/restore`,
                {
                    method: "POST",
                    headers: {
                        "origin": ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(restoreRes.status, STATUS_CODE.OK);

            const listAfterRestore = await app.request("/api/webapps", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
            });
            const restoredList =
                (await listAfterRestore.json() as Envelope<WebAppDto[]>).data!;
            assertEquals(restoredList.some((w) => w.id === w1.id), true);

            // 7. Delete group -> per spec 9.2, WebApps migrate to ungrouped (groupId = null)
            const deleteGroupRes = await app.request(
                `/api/webapp-groups/${devGroup.id}`,
                {
                    method: "DELETE",
                    headers: {
                        "origin": ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(deleteGroupRes.status, STATUS_CODE.OK);

            const w1AfterGroupDelete = await app.request(
                `/api/webapps/${w1.id}`,
                {
                    method: "GET",
                    headers: {
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(w1AfterGroupDelete.status, STATUS_CODE.OK);
            const w1Final =
                (await w1AfterGroupDelete.json() as Envelope<WebAppDto>).data!;
            assertEquals(w1Final.groupId, null);

            // 8. Permanent delete
            const permDeleteRes = await app.request(
                `/api/webapps/${w1.id}/permanent`,
                {
                    method: "DELETE",
                    headers: {
                        "origin": ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(permDeleteRes.status, STATUS_CODE.OK);

            const trashAfterPerm = await app.request("/api/webapps/trash", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
            });
            const trashAfterPermData =
                (await trashAfterPerm.json() as Envelope<WebAppDto[]>).data!;
            assertEquals(trashAfterPermData.some((w) => w.id === w1.id), false);
        } finally {
            await store.close();
        }
    },
});
