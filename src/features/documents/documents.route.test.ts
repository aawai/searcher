import { assert, assertEquals } from "@std/assert";
import { createApp } from "../../app.ts";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import type { Envelope } from "../../shared/contracts.ts";
import {
    DOCUMENT_ASSET_MAX_BYTES,
    DOCUMENT_BODY_MAX_LENGTH,
    DOCUMENT_JSON_MAX_BYTES,
    type DocumentAssetDto,
    type DocumentDto,
    type DocumentLayoutDto,
    type DocumentLayoutsDto,
    type DocumentNotebookDto,
    type DocumentPageDto,
    type DocumentSettingsDto,
    type DocumentVersionDto,
} from "../../shared/documents.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";

const origin = "http://localhost:8000";
async function setup() {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    const auth = new AuthService({ store, origin });
    const app = createApp({ store, auth, origin });
    const cookies: string[] = [];
    for (const username of ["documents_http_owner", "documents_http_other"]) {
        const response = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username,
                displayName: username,
                password: "Password123456!",
            }),
        });
        assertEquals(response.status, 200);
        const token = response.headers.get("set-cookie")?.match(
            new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
        )?.[1];
        assert(token);
        cookies.push(`${SESSION_COOKIE_NAME}=${token}`);
    }
    return {
        store,
        app,
        cookies,
        request(path: string, method = "GET", body?: unknown, owner = 0) {
            return app.request(path, {
                method,
                headers: {
                    origin,
                    cookie: cookies[owner],
                    ...(body === undefined
                        ? {}
                        : { "content-type": "application/json" }),
                },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
        },
    };
}
async function data<T>(response: Response): Promise<T> {
    assertEquals(response.status, 200, await response.clone().text());
    const envelope = await response.json() as Envelope<T>;
    assert(envelope.data !== undefined && envelope.data !== null);
    return envelope.data;
}

Deno.test("Documents HTTP: title/body boundaries and exact 8 MiB create/update intake remain isolated", async () => {
    const env = await setup();
    try {
        const body = "x".repeat(DOCUMENT_BODY_MAX_LENGTH);
        const document = await data<DocumentDto>(
            await env.request("/api/documents", "POST", {
                title: "t".repeat(200),
                body,
            }),
        );
        assertEquals(document.body, body);
        assertEquals(document.title?.length, 200);
        for (
            const input of [{ title: "t".repeat(201) }, { body: body + "x" }]
        ) {
            assertEquals(
                (await env.request("/api/documents", "POST", input)).status,
                400,
            );
            assertEquals(
                (await env.request(`/api/documents/${document.id}`, "PATCH", {
                    version: document.version,
                    ...input,
                })).status,
                400,
            );
        }
        assertEquals(
            (await env.request(`/api/documents/${document.id}`, "PATCH", {
                body: "missing version",
            })).status,
            400,
        );
        const payload = JSON.stringify({ body: "large request" });
        const exact = payload +
            " ".repeat(DOCUMENT_JSON_MAX_BYTES - payload.length);
        for (
            const [path, method, serialized] of [
                ["/api/documents", "POST", exact],
                [
                    `/api/documents/${document.id}`,
                    "PATCH",
                    JSON.stringify({
                        version: document.version,
                        body: "patch boundary",
                    }),
                ],
            ]
        ) {
            const padded = serialized +
                " ".repeat(DOCUMENT_JSON_MAX_BYTES - serialized.length);
            const headers = {
                origin,
                cookie: env.cookies[0],
                "content-type": "application/json",
            };
            assertEquals(
                (await env.app.request(path, { method, headers, body: padded }))
                    .status,
                200,
            );
            assertEquals(
                (await env.app.request(path, {
                    method,
                    headers,
                    body: padded + " ",
                })).status,
                413,
            );
        }
        assertEquals(
            (await env.request(
                `/api/documents/${document.id}/settings`,
                "PUT",
                { extra: "x".repeat(70_000) },
            )).status,
            413,
        );
    } finally {
        await env.store.close();
    }
});

Deno.test("Documents HTTP: uncategorized scope paginates only the owner's active unfiled documents", async () => {
    const env = await setup();
    try {
        const path = "/api/documents?scope=uncategorized";
        assertEquals(await data<DocumentPageDto>(await env.request(path)), {
            items: [],
            nextCursor: null,
        });
        const notebook = await data<DocumentNotebookDto>(
            await env.request("/api/document-notebooks", "POST", { name: "Filed" }),
        );
        await data<DocumentDto>(await env.request("/api/documents", "POST", {
            notebookId: notebook.id,
        }));
        const first = await data<DocumentDto>(
            await env.request("/api/documents", "POST", { title: "first" }),
        );
        const second = await data<DocumentDto>(
            await env.request("/api/documents", "POST", { title: "second" }),
        );
        const deleted = await data<DocumentDto>(
            await env.request("/api/documents", "POST", { title: "deleted" }),
        );
        assertEquals((await env.request(
            `/api/documents/${deleted.id}?version=${deleted.version}`,
            "DELETE",
        )).status, 200);
        const other = await data<DocumentDto>(
            await env.request("/api/documents", "POST", { title: "other" }, 1),
        );
        const page1 = await data<DocumentPageDto>(await env.request(`${path}&limit=1`));
        assert(page1.nextCursor);
        const cursor = encodeURIComponent(page1.nextCursor);
        const page2 = await data<DocumentPageDto>(
            await env.request(`${path}&limit=1&cursor=${cursor}`),
        );
        assertEquals(
            [...page1.items, ...page2.items].map((item) => item.id).sort(),
            [first.id, second.id].sort(),
        );
        assertEquals(page2.nextCursor, null);
        assertEquals(
            (await data<DocumentPageDto>(await env.request(path, "GET", undefined, 1)))
                .items.map((item) => item.id),
            [other.id],
        );
        assertEquals((await env.request(`${path}&cursor=${cursor}`, "GET", undefined, 1)).status, 400);
        assertEquals((await env.request(`/api/documents?scope=recent&cursor=${cursor}`)).status, 400);
    } finally {
        await env.store.close();
    }
});

Deno.test("Documents HTTP: notebook library/search, conflict current document and trash restoration are owner-isolated", async () => {
    const env = await setup();
    try {
        assertEquals((await env.app.request("/api/documents")).status, 401);
        const root = await data<DocumentNotebookDto>(
            await env.request("/api/document-notebooks", "POST", {
                name: "Root",
            }),
        );
        const child = await data<DocumentNotebookDto>(
            await env.request("/api/document-notebooks", "POST", {
                name: "Child",
                parentId: root.id,
            }),
        );
        assertEquals(
            (await env.request("/api/document-notebooks", "POST", {
                name: "Too deep",
                parentId: child.id,
            })).status,
            400,
        );
        assertEquals(
            (await env.request(
                `/api/document-notebooks/${root.id}/move`,
                "POST",
                { parentId: child.id },
            )).status,
            400,
        );
        const document = await data<DocumentDto>(
            await env.request("/api/documents", "POST", {
                title: "Original",
                body: "**crossnotebook** ordinary",
                notebookId: child.id,
            }),
        );
        assertEquals(
            (await env.request(
                `/api/documents/${document.id}`,
                "GET",
                undefined,
                1,
            )).status,
            404,
        );
        assertEquals(
            (await env.request("/api/documents", "POST", {
                notebookId: child.id,
            }, 1)).status,
            404,
        );
        const current = await data<DocumentDto>(
            await env.request(`/api/documents/${document.id}`, "PATCH", {
                version: document.version,
                body: "crossnotebook updated",
                origin: "manual",
            }),
        );
        const conflict = await env.request(
            `/api/documents/${document.id}`,
            "PATCH",
            { version: document.version, body: "stale" },
        );
        assertEquals(conflict.status, 409);
        const envelope = await conflict.json() as Envelope<
            { currentDocument: DocumentDto }
        >;
        assertEquals(envelope.data?.currentDocument, current);
        const searched = await data<DocumentPageDto>(
            await env.request("/api/documents/search?q=crossnotebook&limit=1"),
        );
        assertEquals(searched.items.map((item) => item.id), [document.id]);
        assert(!("body" in searched.items[0]));
        assert(!searched.items[0].snippet.includes("<b>"));
        const listed = await data<DocumentPageDto>(
            await env.request(
                `/api/documents?scope=notebook&notebookId=${child.id}`,
            ),
        );
        assertEquals(listed.items.map((item) => item.id), [document.id]);
        assert(!("body" in listed.items[0]));
        assertEquals(
            (await env.request("/api/documents?limit=101")).status,
            400,
        );
        assertEquals(
            await data<DocumentPageDto>(
                await env.request("/api/documents/search?q=%20"),
            ),
            { items: [], nextCursor: null },
        );
        assertEquals(
            (await env.request(
                `/api/documents/${document.id}/versions/1junk/restore`,
                "POST",
                { version: current.version },
            )).status,
            400,
        );
        const restoredVersion = await data<DocumentDto>(
            await env.request(
                `/api/documents/${document.id}/versions/1/restore`,
                "POST",
                { version: current.version },
            ),
        );
        assertEquals(restoredVersion.body, document.body);
        assert(restoredVersion.version > current.version);
        const versions = await data<DocumentVersionDto[]>(
            await env.request(`/api/documents/${document.id}/versions`),
        );
        assert(versions.some((version) => version.reason === "restore"));
        assertEquals(
            (await env.request(`/api/documents/${document.id}`, "DELETE"))
                .status,
            400,
        );
        assertEquals(
            (await env.request(
                `/api/documents/${document.id}?version=${current.version}`,
                "DELETE",
            )).status,
            409,
        );
        assertEquals(
            (await env.request(
                `/api/documents/${document.id}?version=${restoredVersion.version}`,
                "DELETE",
            )).status,
            200,
        );
        assertEquals(
            (await env.request(`/api/documents/${document.id}`, "PATCH", {
                version: restoredVersion.version,
                body: "deleted",
            })).status,
            404,
        );
        assertEquals(
            (await data<DocumentPageDto>(
                await env.request("/api/documents/search?q=crossnotebook"),
            )).items,
            [],
        );
        assertEquals(
            (await data<DocumentPageDto>(
                await env.request("/api/documents/trash"),
            )).items.map((item) => item.id),
            [document.id],
        );
        assertEquals(
            (await env.request(`/api/document-notebooks/${root.id}`, "DELETE"))
                .status,
            200,
        );
        assertEquals(
            (await data<DocumentNotebookDto[]>(
                await env.request("/api/document-notebooks"),
            ))[0].parentId,
            null,
        );
        assertEquals(
            (await env.request(`/api/document-notebooks/${child.id}`, "DELETE"))
                .status,
            200,
        );
        const restored = await data<DocumentDto>(
            await env.request(`/api/documents/${document.id}/restore`, "POST"),
        );
        assertEquals(restored.notebookId, null);
        assertEquals(
            (await env.request(
                `/api/documents/${document.id}/permanent`,
                "DELETE",
            )).status,
            200,
        );
        assertEquals(
            (await env.request(`/api/documents/${document.id}`, "GET")).status,
            404,
        );
    } finally {
        await env.store.close();
    }
});

Deno.test("Documents HTTP: assets bind owner/document, deny referenced deletion and settings expose no presentation state", async () => {
    const env = await setup();
    try {
        const document = await data<DocumentDto>(
            await env.request("/api/documents", "POST", {}),
        );
        const other = await data<DocumentDto>(
            await env.request("/api/documents", "POST", {}),
        );
        const png = new Uint8Array([
            137,
            80,
            78,
            71,
            13,
            10,
            26,
            10,
            0,
            0,
            0,
            13,
            73,
            72,
            68,
            82,
        ]);
        const form = new FormData();
        form.set("file", new File([png], "test.png", { type: "image/png" }));
        const uploaded = await data<DocumentAssetDto>(
            await env.app.request(`/api/documents/${document.id}/assets`, {
                method: "POST",
                headers: { origin, cookie: env.cookies[0] },
                body: form,
            }),
        );
        assert(!("storageRef" in uploaded));
        const assetPath =
            `/api/documents/${document.id}/assets/${uploaded.assetId}`;
        const fetched = await env.request(assetPath);
        assertEquals(fetched.status, 200);
        assertEquals(fetched.headers.get("cache-control"), "no-store");
        assertEquals(new Uint8Array(await fetched.arrayBuffer()), png);
        assertEquals(
            (await env.request(assetPath, "GET", undefined, 1)).status,
            404,
        );
        assertEquals(
            (await env.request(
                `/api/documents/${other.id}/assets/${uploaded.assetId}`,
            )).status,
            404,
        );
        const updated = await data<DocumentDto>(
            await env.request(`/api/documents/${document.id}`, "PATCH", {
                version: document.version,
                body: `![image](asset://${uploaded.assetId})`,
            }),
        );
        assertEquals((await env.request(assetPath, "DELETE")).status, 400);
        await data<DocumentDto>(
            await env.request(`/api/documents/${document.id}`, "PATCH", {
                version: updated.version,
                body: "unreferenced",
            }),
        );
        assertEquals((await env.request(assetPath, "DELETE")).status, 200);
        assertEquals((await env.request(assetPath)).status, 404);
        const oversized = new Uint8Array(DOCUMENT_ASSET_MAX_BYTES + 1);
        oversized.set(png);
        const large = new FormData();
        large.set(
            "file",
            new File([oversized], "oversized.png", { type: "image/png" }),
        );
        const rejected = await env.app.request(
            `/api/documents/${document.id}/assets`,
            {
                method: "POST",
                headers: { origin, cookie: env.cookies[0] },
                body: large,
            },
        );
        assert(rejected.status >= 400 && rejected.status < 500);
        const settings = await data<DocumentSettingsDto>(
            await env.request(`/api/documents/${document.id}/settings`),
        );
        assertEquals(settings.paperSize, "a4");
        assert(!("preferredView" in settings));
        const input = {
            paperSize: "letter",
            orientation: "landscape",
            marginTopMm: 5,
            marginRightMm: 50,
            marginBottomMm: 5,
            marginLeftMm: 50,
        };
        const saved = await data<DocumentSettingsDto>(
            await env.request(
                `/api/documents/${document.id}/settings`,
                "PUT",
                input,
            ),
        );
        assertEquals(saved.marginRightMm, 50);
        assertEquals(saved.orientation, "landscape");
        assertEquals(
            (await env.request(
                `/api/documents/${document.id}/settings`,
                "PUT",
                { ...input, marginTopMm: 4.99 },
            )).status,
            400,
        );
        assertEquals(
            (await env.request(
                `/api/documents/${document.id}/settings`,
                "GET",
                undefined,
                1,
            )).status,
            404,
        );
    } finally {
        await env.store.close();
    }
});

Deno.test("Documents HTTP: home papers share nullable titles, metadata, layouts and account-isolated events", async () => {
    const env = await setup();
    const ownerStream = await env.request("/api/documents/events");
    const otherStream = await env.request(
        "/api/documents/events",
        "GET",
        undefined,
        1,
    );
    const owner = ownerStream.body!.getReader();
    const other = otherStream.body!.getReader();
    const decoder = new TextDecoder();
    try {
        assertEquals(
            ownerStream.headers.get("content-type"),
            "text/event-stream; charset=utf-8",
        );
        assertEquals(
            decoder.decode((await owner.read()).value),
            'event: ready\ndata: {"ok":true}\n\n',
        );
        await other.read();
        const document = await data<DocumentDto>(
            await env.request("/api/documents", "POST", {
                title: null,
                body: "A single unified note",
                color: "sage",
                isHomeFixed: true,
                homeSortOrder: 12,
                isFavorite: true,
            }),
        );
        assertEquals(document.title, null);
        assertEquals(document.displayTitle, "A single unified note");
        assertEquals(document.color, "sage");
        assertEquals(document.isHomeFixed, true);
        assertEquals(document.homeSortOrder, 12);
        assertEquals(document.isFavorite, true);
        const home = await data<DocumentPageDto>(
            await env.request("/api/documents?scope=home"),
        );
        assertEquals(home.items.map((item) => item.id), [document.id]);
        const updated = await data<DocumentDto>(
            await env.request(`/api/documents/${document.id}`, "PATCH", {
                version: document.version,
                body: "Updated across views",
                color: "rose",
            }),
        );
        // Creation may also be observable; consume until the committed update.
        let event = "";
        while (!event.includes(`"version":${updated.version}`)) {
            event = decoder.decode((await owner.read()).value);
        }
        assert(event.startsWith("event: document.updated\n"));
        assert(event.includes(`"documentId":"${document.id}"`));
        assertEquals(
            (await env.request(
                `/api/documents/${document.id}/layout`,
                "PATCH",
                { band: "right", col: 0, row: 0, size: "w" },
                1,
            )).status,
            404,
        );
        const layout = await data<DocumentLayoutDto>(
            await env.request(`/api/documents/${document.id}/layout`, "PATCH", {
                band: "right",
                col: 0,
                row: 0,
                size: "w",
            }),
        );
        assertEquals(layout.band, "right");
        assertEquals(layout.col, 0);
        assertEquals(layout.row, 0);
        assertEquals(layout.size, "w");
        assertEquals(
            await data(
                await env.request(`/api/documents/${document.id}/layout`),
            ),
            layout,
        );
        // A partial position or an out-of-range column is rejected before writing.
        assertEquals(
            (await env.request(
                `/api/documents/${document.id}/layout`,
                "PATCH",
                {
                    band: "right",
                    col: 2,
                    row: null,
                },
            )).status,
            400,
        );
        assertEquals(
            (await env.request(
                `/api/documents/${document.id}/layout`,
                "PATCH",
                {
                    band: "right",
                    col: 999,
                    row: 0,
                },
            )).status,
            400,
        );
        // A home note cannot share a W footprint with another home note.
        const overlap = await data<DocumentDto>(
            await env.request("/api/documents", "POST", {
                body: "Second pinned note",
                isHomeFixed: true,
            }),
        );
        assertEquals(
            (await env.request(
                `/api/documents/${overlap.id}/layout`,
                "PATCH",
                { band: "right", col: 1, row: 0, size: "w" },
            )).status,
            409,
        );
        assertEquals(
            (await env.request(
                `/api/documents/${overlap.id}/layout`,
                "PATCH",
                { band: "right", col: 3, row: 0 },
            )).status,
            200,
        );
        assertEquals(
            (await env.request("/api/documents", "POST", { color: "invalid" }))
                .status,
            400,
        );
        const ownOther = await data<DocumentDto>(
            await env.request("/api/documents", "POST", {
                body: "Other account",
            }, 1),
        );
        await env.request(`/api/documents/${ownOther.id}`, "PATCH", {
            version: ownOther.version,
            body: "Other account updated",
        }, 1);
        let otherEvent = "";
        while (!otherEvent.includes('"version":2')) {
            otherEvent = decoder.decode((await other.read()).value);
        }
        assert(otherEvent.includes(`"documentId":"${ownOther.id}"`));
        assert(!otherEvent.includes(document.id));
    } finally {
        await owner.cancel();
        await other.cancel();
        await env.store.close();
    }
});

type TestEnv = Awaited<ReturnType<typeof setup>>;

async function createHomeNote(
    env: TestEnv,
    body: string,
    owner = 0,
): Promise<DocumentDto> {
    return await data<DocumentDto>(
        await env.request("/api/documents", "POST", {
            body,
            isHomeFixed: true,
        }, owner),
    );
}

async function readLayoutOrNull(
    env: TestEnv,
    id: string,
): Promise<DocumentLayoutDto | null> {
    const response = await env.request(`/api/documents/${id}/layout`);
    assertEquals(response.status, 200);
    const envelope = await response.json() as Envelope<
        DocumentLayoutDto | null
    >;
    return envelope.data ?? null;
}

Deno.test("Documents HTTP: home note cells are band-relative and validate as one position", async () => {
    const env = await setup();
    try {
        const note = await createHomeNote(env, "Band note");
        const other = await createHomeNote(env, "Center note");
        const patch = (id: string, body: unknown) =>
            env.request(`/api/documents/${id}/layout`, "PATCH", body);
        const layout = await data<DocumentLayoutDto>(
            await patch(note.id, {
                band: "left",
                col: 0,
                row: 0,
                size: "w",
            }),
        );
        assertEquals(layout.band, "left");
        assertEquals(layout.col, 0);
        assertEquals(layout.row, 0);
        assertEquals(layout.size, "w");
        assertEquals(
            await data(
                await env.request(`/api/documents/${note.id}/layout`),
            ),
            layout,
        );

        // The same column and row in another band is a different cell.
        assertEquals(
            (await patch(other.id, {
                band: "center",
                col: 0,
                row: 0,
            })).status,
            200,
        );
        assertEquals(
            (await patch(other.id, {
                band: "left",
                col: 0,
                row: 0,
            })).status,
            409,
        );

        // Sides extend above the search box; the center shelf does not.
        assertEquals(
            (await patch(note.id, {
                band: "left",
                col: 0,
                row: -31,
            })).status,
            200,
        );
        assertEquals(
            (await patch(other.id, {
                band: "center",
                col: 0,
                row: -1,
            })).status,
            400,
        );
        assertEquals(
            (await patch(note.id, {
                band: "left",
                col: 0,
                row: -32,
            })).status,
            400,
        );
        assertEquals(
            (await patch(note.id, {
                band: "left",
                col: 64,
                row: 0,
            })).status,
            400,
        );
        assertEquals(
            (await patch(note.id, {
                band: "left",
                col: 0,
                row: 32,
            })).status,
            400,
        );

        // band/col/row are one position: all three provided or none.
        assertEquals((await patch(note.id, { band: "left" })).status, 400);
        assertEquals(
            (await patch(note.id, { col: 0, row: 0 })).status,
            400,
        );
        assertEquals(
            (await patch(note.id, {
                band: "top",
                col: 0,
                row: 0,
            })).status,
            400,
        );
        const cleared = await data<DocumentLayoutDto>(
            await patch(note.id, { band: null, col: null, row: null }),
        );
        assertEquals(cleared.band, null);
        assertEquals(cleared.col, null);
        assertEquals(cleared.row, null);
        assertEquals(cleared.size, "w");
    } finally {
        await env.store.close();
    }
});

Deno.test("Documents HTTP: batch layout swaps are atomic and keep unspecified fields", async () => {
    const env = await setup();
    try {
        const first = await createHomeNote(env, "First");
        const second = await createHomeNote(env, "Second");
        for (
            const [id, col] of [[first.id, 0], [second.id, 1]] as const
        ) {
            assertEquals(
                (await env.request(`/api/documents/${id}/layout`, "PATCH", {
                    band: "left",
                    col,
                    row: 0,
                })).status,
                200,
            );
        }
        const swapped = await data<DocumentLayoutsDto>(
            await env.request("/api/documents/layouts", "PATCH", {
                items: [
                    { id: first.id, band: "left", col: 1, row: 0 },
                    { id: second.id, band: "left", col: 0, row: 0 },
                ],
            }),
        );
        assertEquals(swapped.items.map((item) => item.id), [
            first.id,
            second.id,
        ]);
        assertEquals(swapped.items[0].layout.col, 1);
        assertEquals(swapped.items[1].layout.col, 0);
        assertEquals(
            await data(
                await env.request(`/api/documents/${first.id}/layout`),
            ),
            swapped.items[0].layout,
        );
        assertEquals(
            await data(
                await env.request(`/api/documents/${second.id}/layout`),
            ),
            swapped.items[1].layout,
        );

        // Unspecified fields keep the stored value, as in the single PATCH.
        const resized = await data<DocumentLayoutsDto>(
            await env.request("/api/documents/layouts", "PATCH", {
                items: [{ id: first.id, size: "w" }],
            }),
        );
        assertEquals(resized.items[0].layout.band, "left");
        assertEquals(resized.items[0].layout.col, 1);
        assertEquals(resized.items[0].layout.row, 0);
        assertEquals(resized.items[0].layout.size, "w");
    } finally {
        await env.store.close();
    }
});

Deno.test("Documents HTTP: batch conflicts reject the whole write", async () => {
    const env = await setup();
    try {
        const first = await createHomeNote(env, "First");
        const second = await createHomeNote(env, "Second");
        const third = await createHomeNote(env, "Third");
        for (
            const [id, col] of [
                [first.id, 0],
                [second.id, 1],
                [third.id, 2],
            ] as const
        ) {
            assertEquals(
                (await env.request(`/api/documents/${id}/layout`, "PATCH", {
                    band: "left",
                    col,
                    row: 0,
                })).status,
                200,
            );
        }
        // Moving onto a note outside the batch fails the whole transaction.
        assertEquals(
            (await env.request("/api/documents/layouts", "PATCH", {
                items: [
                    { id: first.id, band: "left", col: 2, row: 0 },
                    { id: second.id, band: "left", col: 1, row: 0 },
                ],
            })).status,
            409,
        );
        assertEquals(
            (await readLayoutOrNull(env, first.id))?.col,
            0,
        );
        assertEquals(
            (await readLayoutOrNull(env, second.id))?.col,
            1,
        );
        // Two items may not resolve to the same resulting cell either.
        assertEquals(
            (await env.request("/api/documents/layouts", "PATCH", {
                items: [
                    { id: first.id, band: "left", col: 3, row: 0 },
                    { id: second.id, band: "left", col: 3, row: 0 },
                ],
            })).status,
            409,
        );
        assertEquals(
            (await readLayoutOrNull(env, first.id))?.col,
            0,
        );
    } finally {
        await env.store.close();
    }
});

Deno.test("Documents HTTP: batch layouts reject foreign ids and invalid batches", async () => {
    const env = await setup();
    try {
        const note = await createHomeNote(env, "Owned note");
        const foreign = await createHomeNote(env, "Foreign note", 1);
        assertEquals(
            (await env.request("/api/documents/layouts", "PATCH", {
                items: [
                    { id: note.id, band: "left", col: 3, row: 0 },
                    { id: "missing" },
                ],
            })).status,
            404,
        );
        assertEquals(await readLayoutOrNull(env, note.id), null);
        assertEquals(
            (await env.request("/api/documents/layouts", "PATCH", {
                items: [
                    { id: note.id, band: "left", col: 3, row: 0 },
                    {
                        id: foreign.id,
                        band: "left",
                        col: 3,
                        row: 0,
                    },
                ],
            })).status,
            404,
        );
        assertEquals(await readLayoutOrNull(env, note.id), null);
        assertEquals(
            (await env.request("/api/documents/layouts", "PATCH", {
                items: [
                    { id: note.id, band: "left", col: 3, row: 0 },
                    { id: note.id, band: "left", col: 4, row: 0 },
                ],
            })).status,
            400,
        );
        assertEquals(
            (await env.request("/api/documents/layouts", "PATCH", {
                items: [],
            })).status,
            400,
        );
        assertEquals(
            (await env.request("/api/documents/layouts", "PATCH", {
                items: Array.from({ length: 65 }, (_, index) => ({
                    id: `note-${index}`,
                })),
            })).status,
            400,
        );
        assertEquals(await readLayoutOrNull(env, note.id), null);
    } finally {
        await env.store.close();
    }
});
