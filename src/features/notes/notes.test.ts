import { assertEquals } from "@std/assert";
import { STATUS_CODE } from "@std/http";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import type { Hono } from "hono";
import type { AppEnv } from "../../serve/env.ts";
import { createApp } from "../../app.ts";
import type { Envelope, NoteDto } from "@shared/contracts.ts";

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
                    content: "Secret note for User A",
                }),
            });
            assertEquals(createRes.status, STATUS_CODE.OK);
            const created = await createRes.json() as Envelope<NoteDto>;
            const noteId = created.data!.id;

            // User B lists notes -> should be empty
            const listB = await app.request("/api/notes", {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
                },
            });
            assertEquals(listB.status, STATUS_CODE.OK);
            const listBBody = await listB.json() as Envelope<NoteDto[]>;
            assertEquals(listBBody.data?.length, 0);

            // User B attempts to patch User A's note -> 404 (ownership isolation)
            const patchRes = await app.request(`/api/notes/${noteId}`, {
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
            assertEquals(patchRes.status, STATUS_CODE.NotFound);

            // User B attempts to delete User A's note -> 404
            const deleteRes = await app.request(`/api/notes/${noteId}`, {
                method: "DELETE",
                headers: {
                    "origin": ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
                },
            });
            assertEquals(deleteRes.status, STATUS_CODE.NotFound);
        } finally {
            await store.close();
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

            // Create note with initial version 1
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
            const created = await createRes.json() as Envelope<NoteDto>;
            const noteId = created.data!.id;
            assertEquals(created.data!.version, 1);

            // Update to version 2
            const update1 = await app.request(`/api/notes/${noteId}`, {
                method: "PATCH",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    content: "First valid update",
                    version: 1,
                }),
            });
            assertEquals(update1.status, STATUS_CODE.OK);
            const noteV2 = await update1.json() as Envelope<NoteDto>;
            assertEquals(noteV2.data!.version, 2);
            assertEquals(noteV2.data!.content, "First valid update");

            // Stale update using old version 1 -> must return 409 Conflict with currentNote data
            const staleUpdate = await app.request(`/api/notes/${noteId}`, {
                method: "PATCH",
                headers: {
                    "origin": ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${token}`,
                },
                body: JSON.stringify({
                    content: "Stale update attempting to overwrite",
                    version: 1,
                }),
            });
            assertEquals(staleUpdate.status, STATUS_CODE.Conflict);
            const conflictBody = await staleUpdate.json() as Envelope<NoteDto>;
            assertEquals(conflictBody.status, false);
            assertEquals(conflictBody.code, STATUS_CODE.Conflict);
            // Must contain current note in conflict payload
            assertEquals(conflictBody.data?.version, 2);
            assertEquals(conflictBody.data?.content, "First valid update");

            // Stale delete using wrong version -> must also return 409 Conflict
            const staleDelete = await app.request(
                `/api/notes/${noteId}?version=1`,
                {
                    method: "DELETE",
                    headers: {
                        "origin": ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(staleDelete.status, STATUS_CODE.Conflict);
            const deleteConflictBody = await staleDelete.json() as Envelope<
                NoteDto
            >;
            assertEquals(deleteConflictBody.data?.version, 2);

            // Valid delete with matching version 2 succeeds
            const validDelete = await app.request(
                `/api/notes/${noteId}?version=2`,
                {
                    method: "DELETE",
                    headers: {
                        "origin": ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${token}`,
                    },
                },
            );
            assertEquals(validDelete.status, STATUS_CODE.OK);
        } finally {
            await store.close();
        }
    },
});
