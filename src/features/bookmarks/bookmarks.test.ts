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
                    sortOrder: 1,
                    openMode: "new_tab",
                }),
            });
            assertEquals(createW1Res.status, STATUS_CODE.OK);
            const w1 = (await createW1Res.json() as Envelope<WebAppDto>).data!;
            assertEquals(w1.name, "GitHub");
            assertEquals(w1.groupId, devGroup.id);
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
                    sortOrder: 2,
                }),
            });
            assertEquals(createW2Res.status, STATUS_CODE.OK);
            const w2 = (await createW2Res.json() as Envelope<WebAppDto>).data!;

            // 3. Query filtered by groupId
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
                        { id: w1.id, sortOrder: 10 },
                        { id: w2.id, sortOrder: 5 },
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

Deno.test({
    name:
        "webapps contract: moving webapp out of folder defaults sortOrder to max + 1 (placed at the end)",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        const { app, store } = await setupTestApp();
        try {
            const token = await registerUser(app, "reorderuser");
            // Create group
            const groupRes = await app.request("/api/webapp-groups", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({ name: "Folder A", sortOrder: 0 }),
            });
            const group = (await groupRes.json() as Envelope<WebAppGroupDto>)
                .data!;

            const targetRes = await app.request("/api/webapp-groups", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({ name: "Folder B", sortOrder: 1 }),
            });
            const target = (await targetRes.json() as Envelope<WebAppGroupDto>)
                .data!;
            // Create app 1 outside folder (sortOrder: 0)
            const a1Res = await app.request("/api/webapps", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    name: "App 1",
                    url: "https://example1.com",
                    sortOrder: 0,
                }),
            });
            const a1 = (await a1Res.json() as Envelope<WebAppDto>).data!;

            // Create app 2 outside folder (sortOrder: 5)
            const a2Res = await app.request("/api/webapps", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    name: "App 2",
                    url: "https://example2.com",
                    sortOrder: 5,
                }),
            });
            const a2 = (await a2Res.json() as Envelope<WebAppDto>).data!;

            // Create app 3 inside folder (sortOrder: 0)
            const a3Res = await app.request("/api/webapps", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    name: "App 3",
                    url: "https://example3.com",
                    groupId: group.id,
                    sortOrder: 0,
                }),
            });
            const a3 = (await a3Res.json() as Envelope<WebAppDto>).data!;

            // Moving between folders also appends after existing websites.
            const intoTarget = await app.request(`/api/webapps/${a3.id}`, {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({ groupId: target.id }),
            });
            assertEquals(intoTarget.status, STATUS_CODE.OK);
            const movedToTarget =
                (await intoTarget.json() as Envelope<WebAppDto>).data!;
            assertEquals(movedToTarget.groupId, target.id);
            assertEquals(movedToTarget.sortOrder, 6);
            // Move app 3 out of folder without specifying sortOrder
            const moveRes = await app.request(`/api/webapps/${a3.id}`, {
                method: "PATCH",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({ groupId: null }),
            });
            assertEquals(moveRes.status, STATUS_CODE.OK);
            const movedApp = (await moveRes.json() as Envelope<WebAppDto>)
                .data!;
            assertEquals(movedApp.groupId, null);
            // The PATCH response carries the new order for immediate UI rendering.
            assertEquals(movedApp.sortOrder, 7);
            assertEquals(movedApp.sortOrder > a1.sortOrder, true);
            assertEquals(movedApp.sortOrder > a2.sortOrder, true);
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "webapps contract: deleting folder migrates members to ungrouped and appends them to end preserving relative order",
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        const { app, store } = await setupTestApp();
        try {
            const token = await registerUser(app, "groupdeleteuser");

            // Create group
            const groupRes = await app.request("/api/webapp-groups", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({ name: "Folder B", sortOrder: 0 }),
            });
            const group = (await groupRes.json() as Envelope<WebAppGroupDto>)
                .data!;

            // Create an existing standalone app (sortOrder: 10)
            const standaloneRes = await app.request("/api/webapps", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    name: "Standalone",
                    url: "https://standalone.com",
                    sortOrder: 10,
                }),
            });
            const standalone =
                (await standaloneRes.json() as Envelope<WebAppDto>).data!;

            // Create member 1 in group (sortOrder: 1)
            const m1Res = await app.request("/api/webapps", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    name: "Member 1",
                    url: "https://m1.com",
                    groupId: group.id,
                    sortOrder: 1,
                }),
            });
            const m1 = (await m1Res.json() as Envelope<WebAppDto>).data!;

            // Create member 2 in group (sortOrder: 2)
            const m2Res = await app.request("/api/webapps", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    name: "Member 2",
                    url: "https://m2.com",
                    groupId: group.id,
                    sortOrder: 2,
                }),
            });
            const m2 = (await m2Res.json() as Envelope<WebAppDto>).data!;

            // Delete the group
            const delGroupRes = await app.request(
                `/api/webapp-groups/${group.id}`,
                {
                    method: "DELETE",
                    headers: {
                        "origin": ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(delGroupRes.status, STATUS_CODE.OK);

            // Verify all apps are ungrouped and members appended to end preserving relative order
            const listRes = await app.request("/api/webapps", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
            });
            assertEquals(listRes.status, STATUS_CODE.OK);
            const allApps = (await listRes.json() as Envelope<WebAppDto[]>)
                .data!;

            const updatedM1 = allApps.find((a) => a.id === m1.id)!;
            const updatedM2 = allApps.find((a) => a.id === m2.id)!;

            assertEquals(updatedM1.groupId, null);
            assertEquals(updatedM2.groupId, null);
            // Base was max(sortOrder) = 10; m1 gets 11, m2 gets 12
            assertEquals(updatedM1.sortOrder, 11);
            assertEquals(updatedM2.sortOrder, 12);
            assertEquals(updatedM1.sortOrder > standalone.sortOrder, true);
            assertEquals(updatedM2.sortOrder > updatedM1.sortOrder, true);
        } finally {
            await store.close();
        }
    },
});

Deno.test("WebApps mixed root reorder is atomic and owner isolated", async () => {
    const { store, app } = await setupTestApp();
    try {
        const token = await registerUser(app, "mixed_owner");
        const foreignToken = await registerUser(app, "mixed_foreign");
        const headers = {
            origin: ORIGIN,
            cookie: `${SESSION_COOKIE_NAME}=${token}`,
            "content-type": "application/json",
        };
        const create = async <T>(
            path: string,
            body: object,
            owner = token,
        ): Promise<T> => {
            const response = await app.request(path, {
                method: "POST",
                headers: {
                    ...headers,
                    cookie: `${SESSION_COOKIE_NAME}=${owner}`,
                },
                body: JSON.stringify(body),
            });
            assertEquals(response.status, STATUS_CODE.OK);
            return (await response.json() as Envelope<T>).data!;
        };
        const webapp = await create<WebAppDto>("/api/webapps", {
            name: "Loose",
            url: "https://example.org/loose",
            sortOrder: 9,
        });
        const folder = await create<WebAppGroupDto>("/api/webapp-groups", {
            name: "Folder",
            sortOrder: 8,
        });
        const foreignFolder = await create<WebAppGroupDto>(
            "/api/webapp-groups",
            { name: "Foreign", sortOrder: 7 },
            foreignToken,
        );
        const reorder = await app.request("/api/webapps/reorder", {
            method: "PUT",
            headers,
            body: JSON.stringify({
                items: [{ id: webapp.id, sortOrder: 1 }],
                groups: [{ id: folder.id, sortOrder: 0 }],
            }),
        });
        assertEquals(reorder.status, STATUS_CODE.OK);
        const apps = (await (await app.request("/api/webapps", { headers }))
            .json() as Envelope<WebAppDto[]>).data!;
        const groups =
            (await (await app.request("/api/webapp-groups", { headers }))
                .json() as Envelope<WebAppGroupDto[]>).data!;
        assertEquals(apps.find((item) => item.id === webapp.id)?.sortOrder, 1);
        assertEquals(
            groups.find((item) => item.id === folder.id)?.sortOrder,
            0,
        );
        for (const groupId of [foreignFolder.id, "missing-folder"]) {
            const denied = await app.request("/api/webapps/reorder", {
                method: "PUT",
                headers,
                body: JSON.stringify({
                    items: [{ id: webapp.id, sortOrder: 99 }],
                    groups: [{ id: groupId, sortOrder: 100 }],
                }),
            });
            assertEquals(denied.status, STATUS_CODE.NotFound);
            const unchanged =
                (await (await app.request("/api/webapps", { headers }))
                    .json() as Envelope<WebAppDto[]>).data!;
            assertEquals(
                unchanged.find((item) => item.id === webapp.id)?.sortOrder,
                1,
            );
        }
        const folderOnly = await app.request("/api/webapps/reorder", {
            method: "PUT",
            headers,
            body: JSON.stringify({
                items: [],
                groups: [{ id: folder.id, sortOrder: 3 }],
            }),
        });
        assertEquals(folderOnly.status, STATUS_CODE.OK);
        const changedGroups =
            (await (await app.request("/api/webapp-groups", { headers }))
                .json() as Envelope<WebAppGroupDto[]>).data!;
        assertEquals(
            changedGroups.find((item) => item.id === folder.id)?.sortOrder,
            3,
        );
    } finally {
        await store.close();
    }
});
