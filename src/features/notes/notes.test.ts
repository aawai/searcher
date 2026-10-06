import { assertEquals } from "@std/assert";
import { STATUS_CODE } from "@std/http";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import type { Hono } from "hono";
import type { AppEnv } from "../../serve/env.ts";
import { createApp } from "../../app.ts";
import type { Envelope } from "@shared/contracts.ts";
import type {
    NoteDto,
    NoteLayoutDto,
    NoteVersionDto,
    SearchNotesResultDto,
} from "./service.ts";

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

async function registerUser(
    app: Hono<AppEnv>,
    username: string,
) {
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
    name: "notes realtime: PATCH emits note.updated over SSE events stream",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            const token = await registerUser(app, "user_notes_events");
            const cookie = `${SESSION_COOKIE_NAME}=${token}`;

            const createRes = await app.request("/api/notes", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie,
                },
                body: JSON.stringify({ body: "realtime body" }),
            });
            assertEquals(createRes.status, STATUS_CODE.OK);
            const created = (await createRes.json() as Envelope<NoteDto>).data!;

            // 未登录订阅应被会话中间件拒绝
            const anon = await app.request("/api/notes/events");
            assertEquals(anon.status, 401);

            // 打开 SSE 流：首帧为 ready 事件
            const controller = new AbortController();
            const streamRes = await app.request("/api/notes/events", {
                headers: { cookie },
                signal: controller.signal,
            });
            assertEquals(streamRes.status, 200);
            assertEquals(
                streamRes.headers.get("content-type")?.includes(
                    "text/event-stream",
                ),
                true,
            );
            const reader = streamRes.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            const readEvent = async (): Promise<
                { event: string; data: unknown } | null
            > => {
                while (true) {
                    const idx = buffer.indexOf("\n\n");
                    if (idx >= 0) {
                        const block = buffer.slice(0, idx);
                        buffer = buffer.slice(idx + 2);
                        const event = /^event: (.+)$/m.exec(block)?.[1] ?? "";
                        const raw = /^data: (.+)$/m.exec(block)?.[1] ?? "";
                        return { event, data: JSON.parse(raw) };
                    }
                    const { done, value } = await reader.read();
                    if (done) return null;
                    buffer += decoder.decode(value, { stream: true });
                }
            };
            const first = await readEvent();
            assertEquals(first?.event, "ready");

            // 另一“设备”保存同一便签 → 流中收到 note.updated
            const patchRes = await app.request(`/api/notes/${created.id}`, {
                method: "PATCH",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie,
                },
                body: JSON.stringify({
                    body: "updated by other device",
                    version: 1,
                    origin: "manual",
                }),
            });
            assertEquals(patchRes.status, STATUS_CODE.OK);
            const second = await Promise.race([
                readEvent(),
                new Promise<null>((resolve) =>
                    setTimeout(() => resolve(null), 3000)
                ),
            ]);
            controller.abort();
            await reader.cancel().catch(() => {});
            assertEquals(second?.event, "note.updated");
            const payload = second?.data as {
                noteId: string;
                version: number;
            };
            assertEquals(payload.noteId, created.id);
            assertEquals(payload.version, 2);
        } finally {
            store.close();
        }
    },
});

Deno.test({
    name: "notes contract: strict user isolation and account ownership",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            const tokenA = await registerUser(app, "user_notes_a");
            const tokenB = await registerUser(app, "user_notes_b");

            // User A creates a note
            const createRes = await app.request("/api/notes", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
                },
                body: JSON.stringify({
                    content: "Hello from User A",
                }),
            });
            assertEquals(createRes.status, STATUS_CODE.OK);
            const createdBody = await createRes.json() as Envelope<NoteDto>;
            const noteAId = createdBody.data!.id;

            // User B lists notes -> empty list
            const listB = await app.request("/api/notes", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
                },
            });
            assertEquals(listB.status, STATUS_CODE.OK);
            const listBBody = await listB.json() as Envelope<NoteDto[]>;
            assertEquals(listBBody.data!.length, 0);

            // User B cannot patch User A's note -> 404
            const patchAlien = await app.request(`/api/notes/${noteAId}`, {
                method: "PATCH",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
                },
                body: JSON.stringify({
                    content: "Tampered by B",
                    version: 1,
                }),
            });
            assertEquals(patchAlien.status, STATUS_CODE.NotFound);

            // User B cannot delete User A's note -> 404
            const deleteAlien = await app.request(`/api/notes/${noteAId}`, {
                method: "DELETE",
                headers: {
                    "origin": ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
                },
            });
            assertEquals(deleteAlien.status, STATUS_CODE.NotFound);
        } finally {
            store.close();
        }
    },
});

Deno.test({
    name:
        "notes contract: optimistic locking version conflict returns 409 with current note",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            const token = await registerUser(app, "user_conflict");

            // Create note version 1
            const createRes = await app.request("/api/notes", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    content: "Initial content",
                }),
            });
            assertEquals(createRes.status, STATUS_CODE.OK);
            const note = (await createRes.json() as Envelope<NoteDto>).data!;
            assertEquals(note.version, 1);

            // Client 1 updates note with version 1 -> success, advances to version 2
            const update1Res = await app.request(`/api/notes/${note.id}`, {
                method: "PATCH",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    content: "Client 1 update",
                    version: 1,
                }),
            });
            assertEquals(update1Res.status, STATUS_CODE.OK);
            const updated1 = (await update1Res.json() as Envelope<NoteDto>)
                .data!;
            assertEquals(updated1.version, 2);
            assertEquals(updated1.content, "Client 1 update");

            // Client 2 attempts to update with stale version 1 -> 409 Conflict
            const update2Res = await app.request(`/api/notes/${note.id}`, {
                method: "PATCH",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    content: "Client 2 stale update",
                    version: 1,
                }),
            });
            assertEquals(update2Res.status, STATUS_CODE.Conflict);
            const conflictBody = await update2Res.json() as Envelope<NoteDto>;
            assertEquals(conflictBody.data!.version, 2);
            assertEquals(conflictBody.data!.content, "Client 1 update");

            // Delete with stale version -> 409 Conflict
            const deleteConflictRes = await app.request(
                `/api/notes/${note.id}?version=1`,
                {
                    method: "DELETE",
                    headers: {
                        "origin": ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(deleteConflictRes.status, STATUS_CODE.Conflict);

            // Delete with correct version 2 -> 200 OK
            const deleteOkRes = await app.request(
                `/api/notes/${note.id}?version=2`,
                {
                    method: "DELETE",
                    headers: {
                        "origin": ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(deleteOkRes.status, STATUS_CODE.OK);
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "notes contract: color and pin persistence, default retention, validation, and conflict",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            const token = await registerUser(app, "user_note_metadata");

            // 1. Create with defaults (pinned=false, color='paper')
            const createDefaultRes = await app.request("/api/notes", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    content: "Default note",
                }),
            });
            assertEquals(createDefaultRes.status, STATUS_CODE.OK);
            const defaultCreated = await createDefaultRes.json() as Envelope<
                NoteDto
            >;
            assertEquals(defaultCreated.data!.pinned, false);
            assertEquals(defaultCreated.data!.color, "paper");
            assertEquals(defaultCreated.data!.version, 1);

            // 2. Create with explicit pinned and color
            const createCustomRes = await app.request("/api/notes", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    content: "Amber reminder",
                    pinned: true,
                    color: "amber",
                }),
            });
            assertEquals(createCustomRes.status, STATUS_CODE.OK);
            const customCreated = await createCustomRes.json() as Envelope<
                NoteDto
            >;
            assertEquals(customCreated.data!.pinned, true);
            assertEquals(customCreated.data!.color, "amber");

            // 3. Create with invalid color rejected (400)
            const invalidColorRes = await app.request("/api/notes", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    content: "Invalid color note",
                    color: "neon-pink",
                }),
            });
            assertEquals(invalidColorRes.status, STATUS_CODE.BadRequest);

            // 4. List returns persisted metadata
            const listRes = await app.request("/api/notes", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
            });
            assertEquals(listRes.status, STATUS_CODE.OK);
            const listBody = await listRes.json() as Envelope<NoteDto[]>;
            const list = listBody.data!;
            assertEquals(list.length, 2);
            const customInList = list.find((n) =>
                n.id === customCreated.data!.id
            );
            assertEquals(customInList?.pinned, true);
            assertEquals(customInList?.color, "amber");

            // 5. Existing content-only PATCH retains old pinned and color metadata
            const patchContentOnly = await app.request(
                `/api/notes/${customCreated.data!.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "origin": ORIGIN,
                        "content-type": "application/json",
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                    body: JSON.stringify({
                        content: "Updated amber reminder",
                        version: 1,
                    }),
                },
            );
            assertEquals(patchContentOnly.status, STATUS_CODE.OK);
            const patchedContentOnlyNote = await patchContentOnly
                .json() as Envelope<NoteDto>;
            assertEquals(
                patchedContentOnlyNote.data!.content,
                "Updated amber reminder",
            );
            assertEquals(patchedContentOnlyNote.data!.pinned, true);
            assertEquals(patchedContentOnlyNote.data!.color, "amber");
            assertEquals(patchedContentOnlyNote.data!.version, 2);

            // 6. Update color and pinned without changing content
            const patchMeta = await app.request(
                `/api/notes/${customCreated.data!.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "origin": ORIGIN,
                        "content-type": "application/json",
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                    body: JSON.stringify({
                        color: "sky",
                        pinned: false,
                        version: 2,
                    }),
                },
            );
            assertEquals(patchMeta.status, STATUS_CODE.OK);
            const patchedMetaNote = await patchMeta.json() as Envelope<NoteDto>;
            assertEquals(
                patchedMetaNote.data!.content,
                "Updated amber reminder",
            );
            assertEquals(patchedMetaNote.data!.pinned, false);
            assertEquals(patchedMetaNote.data!.color, "sky");
            assertEquals(patchedMetaNote.data!.version, 3);

            // 7. Invalid color in PATCH rejected (400)
            const patchInvalidColor = await app.request(
                `/api/notes/${customCreated.data!.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "origin": ORIGIN,
                        "content-type": "application/json",
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                    body: JSON.stringify({
                        color: "invalid-color",
                        version: 3,
                    }),
                },
            );
            assertEquals(patchInvalidColor.status, STATUS_CODE.BadRequest);

            // 8. Version conflict on PATCH returns 409 with latest metadata
            const conflictPatch = await app.request(
                `/api/notes/${customCreated.data!.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "origin": ORIGIN,
                        "content-type": "application/json",
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                    body: JSON.stringify({
                        content: "Stale patch",
                        version: 2,
                    }),
                },
            );
            assertEquals(conflictPatch.status, STATUS_CODE.Conflict);
            const conflictBody = await conflictPatch.json() as Envelope<
                NoteDto
            >;
            assertEquals(conflictBody.data!.version, 3);
            assertEquals(conflictBody.data!.color, "sky");
            assertEquals(conflictBody.data!.pinned, false);
            assertEquals(conflictBody.data!.content, "Updated amber reminder");
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "notes advanced: title/body independent pin/home-fixed, layout, snapshot/restore, FTS5 search, soft-delete/trash",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            const token = await registerUser(app, "user_rich_notes");

            // 1. Create rich note with independent title, body, isPinned, isHomeFixed and layout
            const createRes = await app.request("/api/notes", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    title: "Project Alpha Architecture",
                    body:
                        "This is a detailed markdown body about SQLite FTS5 search.",
                    isPinned: true,
                    isHomeFixed: true,
                    color: "sage",
                    layout: {
                        deviceClass: "desktop",
                        x: 120.5,
                        y: 340.0,
                        width: 400.0,
                        zIndex: 10,
                        expanded: true,
                    },
                }),
            });
            assertEquals(createRes.status, STATUS_CODE.OK);
            const noteAlpha = (await createRes.json() as Envelope<NoteDto>)
                .data!;
            assertEquals(noteAlpha.title, "Project Alpha Architecture");
            assertEquals(
                noteAlpha.body,
                "This is a detailed markdown body about SQLite FTS5 search.",
            );
            assertEquals(noteAlpha.isPinned, true);
            assertEquals(noteAlpha.isHomeFixed, true);
            assertEquals(noteAlpha.color, "sage");
            assertEquals(noteAlpha.layout?.x, 120.5);
            assertEquals(noteAlpha.layout?.zIndex, 10);
            assertEquals(noteAlpha.version, 1);

            // 2. Update layout via dedicated endpoint PUT /api/notes/:id/layout
            const layoutRes = await app.request(
                `/api/notes/${noteAlpha.id}/layout`,
                {
                    method: "PUT",
                    headers: {
                        "origin": ORIGIN,
                        "content-type": "application/json",
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                    body: JSON.stringify({
                        x: 150.0,
                        y: 400.0,
                        zIndex: 25,
                    }),
                },
            );
            assertEquals(layoutRes.status, STATUS_CODE.OK);

            // Verify getById returns updated layout
            const getRes = await app.request(`/api/notes/${noteAlpha.id}`, {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
            });
            assertEquals(getRes.status, STATUS_CODE.OK);
            const getNote = (await getRes.json() as Envelope<NoteDto>).data!;
            assertEquals(getNote.layout?.x, 150.0);
            assertEquals(getNote.layout?.zIndex, 25);

            // 3. Update note content -> creates snapshot version 2
            const updateRes = await app.request(`/api/notes/${noteAlpha.id}`, {
                method: "PATCH",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    title: "Project Alpha Architecture v2",
                    body:
                        "Updated body with brand new information and keywords.",
                    version: 1,
                    origin: "manual",
                }),
            });
            assertEquals(updateRes.status, STATUS_CODE.OK);
            const updatedNote = (await updateRes.json() as Envelope<NoteDto>)
                .data!;
            assertEquals(updatedNote.version, 2);

            // 4. List versions -> should have version 1 and 2
            const versionsRes = await app.request(
                `/api/notes/${noteAlpha.id}/versions`,
                {
                    method: "GET",
                    headers: {
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(versionsRes.status, STATUS_CODE.OK);
            const versions =
                (await versionsRes.json() as Envelope<NoteVersionDto[]>).data!;
            assertEquals(versions.length >= 2, true);
            const v1 = versions.find((v) => v.version === 1);
            assertEquals(v1?.title, "Project Alpha Architecture");

            // 5. Restore version 1 -> advances note to version 3 with v1 content
            const restoreVerRes = await app.request(
                `/api/notes/${noteAlpha.id}/versions/1/restore`,
                {
                    method: "POST",
                    headers: {
                        "origin": ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(restoreVerRes.status, STATUS_CODE.OK);
            const restoredNote =
                (await restoreVerRes.json() as Envelope<NoteDto>).data!;
            assertEquals(restoredNote.version, 3);
            assertEquals(restoredNote.title, "Project Alpha Architecture");
            assertEquals(
                restoredNote.body,
                "This is a detailed markdown body about SQLite FTS5 search.",
            );

            // 6. FTS5 Search -> find by keyword
            const searchRes = await app.request(
                "/api/notes/search?q=Architecture",
                {
                    method: "GET",
                    headers: {
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(searchRes.status, STATUS_CODE.OK);
            const searchResults =
                (await searchRes.json() as Envelope<SearchNotesResultDto[]>)
                    .data!;
            assertEquals(searchResults.length > 0, true);
            assertEquals(searchResults[0].id, noteAlpha.id);

            // 7. Soft delete -> note moves to trash, does not appear in normal list or search
            const deleteRes = await app.request(`/api/notes/${noteAlpha.id}`, {
                method: "DELETE",
                headers: {
                    "origin": ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
            });
            assertEquals(deleteRes.status, STATUS_CODE.OK);

            const listAfterDelete = await app.request("/api/notes", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
            });
            assertEquals(listAfterDelete.status, STATUS_CODE.OK);
            const listAfterDeleteData =
                (await listAfterDelete.json() as Envelope<NoteDto[]>).data!;
            assertEquals(
                listAfterDeleteData.find((n) => n.id === noteAlpha.id),
                undefined,
            );

            const searchAfterDelete = await app.request(
                "/api/notes/search?q=Architecture",
                {
                    method: "GET",
                    headers: {
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(searchAfterDelete.status, STATUS_CODE.OK);
            const searchAfterDeleteData =
                (await searchAfterDelete.json() as Envelope<
                    SearchNotesResultDto[]
                >).data!;
            assertEquals(
                searchAfterDeleteData.find((n) => n.id === noteAlpha.id),
                undefined,
            );

            // Trash list contains note
            const trashRes = await app.request("/api/notes/trash", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
            });
            assertEquals(trashRes.status, STATUS_CODE.OK);
            const trashNotes = (await trashRes.json() as Envelope<NoteDto[]>)
                .data!;
            assertEquals(trashNotes.some((n) => n.id === noteAlpha.id), true);

            // 8. Restore from trash
            const restoreRes = await app.request(
                `/api/notes/${noteAlpha.id}/restore`,
                {
                    method: "POST",
                    headers: {
                        "origin": ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(restoreRes.status, STATUS_CODE.OK);

            const listAfterRestore = await app.request("/api/notes", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
            });
            const listRestoredData =
                (await listAfterRestore.json() as Envelope<NoteDto[]>).data!;
            assertEquals(
                listRestoredData.some((n) => n.id === noteAlpha.id),
                true,
            );

            // 9. Permanent delete
            const permDeleteRes = await app.request(
                `/api/notes/${noteAlpha.id}/permanent`,
                {
                    method: "DELETE",
                    headers: {
                        "origin": ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(permDeleteRes.status, STATUS_CODE.OK);

            const trashAfterPerm = await app.request("/api/notes/trash", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
            });
            const trashAfterPermData =
                (await trashAfterPerm.json() as Envelope<NoteDto[]>).data!;
            assertEquals(
                trashAfterPermData.some((n) => n.id === noteAlpha.id),
                false,
            );
        } finally {
            await store.close();
        }
    },
});

Deno.test({
    name:
        "notes contract: layout expanded toggle and preservation contract (#122)",
    async fn() {
        const { store, app } = await setupTestApp();
        try {
            const token = await registerUser(app, "layout_user");

            // 1. Create note with initial layout, expanded=false, and preserve fields
            const createRes = await app.request("/api/notes", {
                method: "POST",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    title: "Layout Test Note",
                    body: "Testing expanded toggle preservation",
                    layout: {
                        deviceClass: "desktop",
                        x: 120,
                        y: 240,
                        width: 350,
                        zIndex: 5,
                        expanded: false,
                        sortOrder: 3,
                    },
                }),
            });
            assertEquals(createRes.status, STATUS_CODE.OK);
            const created = (await createRes.json() as Envelope<NoteDto>).data!;
            const noteId = created.id;

            // 2. GET returns expanded=false with preserved fields
            const getRes1 = await app.request(`/api/notes/${noteId}`, {
                method: "GET",
                headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
            });
            assertEquals(getRes1.status, STATUS_CODE.OK);
            const get1 = (await getRes1.json() as Envelope<NoteDto>).data!;
            assertEquals(get1.layout?.expanded, false);
            assertEquals(get1.layout?.x, 120);
            assertEquals(get1.layout?.y, 240);
            assertEquals(get1.layout?.width, 350);
            assertEquals(get1.layout?.zIndex, 5);
            assertEquals(get1.layout?.sortOrder, 3);

            // 3. PUT /api/notes/:id/layout with expanded=true
            const putRes1 = await app.request(`/api/notes/${noteId}/layout`, {
                method: "PUT",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({ expanded: true }),
            });
            assertEquals(putRes1.status, STATUS_CODE.OK);
            const put1 = (await putRes1.json() as Envelope<NoteLayoutDto>)
                .data!;
            assertEquals(put1.expanded, true);
            assertEquals(put1.x, 120);
            assertEquals(put1.y, 240);
            assertEquals(put1.width, 350);
            assertEquals(put1.zIndex, 5);
            assertEquals(put1.sortOrder, 3);

            // 4. GET returns expanded=true
            const getRes2 = await app.request(`/api/notes/${noteId}`, {
                method: "GET",
                headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
            });
            assertEquals(getRes2.status, STATUS_CODE.OK);
            const get2 = (await getRes2.json() as Envelope<NoteDto>).data!;
            assertEquals(get2.layout?.expanded, true);
            assertEquals(get2.layout?.x, 120);
            assertEquals(get2.layout?.y, 240);
            assertEquals(get2.layout?.width, 350);
            assertEquals(get2.layout?.zIndex, 5);
            assertEquals(get2.layout?.sortOrder, 3);

            // 5. PUT /api/notes/:id/layout with expanded=false
            const putRes2 = await app.request(`/api/notes/${noteId}/layout`, {
                method: "PUT",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({ expanded: false }),
            });
            assertEquals(putRes2.status, STATUS_CODE.OK);
            const put2 = (await putRes2.json() as Envelope<NoteLayoutDto>)
                .data!;
            assertEquals(put2.expanded, false);
            assertEquals(put2.x, 120);
            assertEquals(put2.y, 240);
            assertEquals(put2.width, 350);
            assertEquals(put2.zIndex, 5);
            assertEquals(put2.sortOrder, 3);

            // 6. GET returns expanded=false
            // 7. Only expanded changed; existing x/y/width/zIndex/sortOrder strictly preserved
            const getRes3 = await app.request(`/api/notes/${noteId}`, {
                method: "GET",
                headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
            });
            assertEquals(getRes3.status, STATUS_CODE.OK);
            const get3 = (await getRes3.json() as Envelope<NoteDto>).data!;
            assertEquals(get3.layout?.expanded, false);
            assertEquals(get3.layout?.x, 120);
            assertEquals(get3.layout?.y, 240);
            assertEquals(get3.layout?.width, 350);
            assertEquals(get3.layout?.zIndex, 5);
            assertEquals(get3.layout?.sortOrder, 3);
        } finally {
            await store.close();
        }
    },
});
