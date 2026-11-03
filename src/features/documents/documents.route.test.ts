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
    type DocumentNotebookDto,
    type DocumentPageDto,
    type DocumentSettingsDto,
    type DocumentVersionDto,
    type HomeOrderDto,
} from "../../shared/documents.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";

const origin = "http://localhost:8000";
async function setup(now?: () => number) {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    const auth = new AuthService({ store, origin });
    const app = createApp({ store, auth, origin, now });
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
            await env.request("/api/document-notebooks", "POST", {
                name: "Filed",
            }),
        );
        await data<DocumentDto>(
            await env.request("/api/documents", "POST", {
                notebookId: notebook.id,
            }),
        );
        const first = await data<DocumentDto>(
            await env.request("/api/documents", "POST", { title: "first" }),
        );
        const second = await data<DocumentDto>(
            await env.request("/api/documents", "POST", { title: "second" }),
        );
        const deleted = await data<DocumentDto>(
            await env.request("/api/documents", "POST", { title: "deleted" }),
        );
        assertEquals(
            (await env.request(
                `/api/documents/${deleted.id}?version=${deleted.version}`,
                "DELETE",
            )).status,
            200,
        );
        const other = await data<DocumentDto>(
            await env.request("/api/documents", "POST", { title: "other" }, 1),
        );
        const page1 = await data<DocumentPageDto>(
            await env.request(`${path}&limit=1`),
        );
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
            (await data<DocumentPageDto>(
                await env.request(path, "GET", undefined, 1),
            ))
                .items.map((item) => item.id),
            [other.id],
        );
        assertEquals(
            (await env.request(`${path}&cursor=${cursor}`, "GET", undefined, 1))
                .status,
            400,
        );
        assertEquals(
            (await env.request(`/api/documents?scope=recent&cursor=${cursor}`))
                .status,
            400,
        );
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

Deno.test("Documents HTTP: home papers share nullable titles, metadata and account-isolated events", async () => {
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
                isHomeFixed: true,
                homeSortOrder: 12,
                isFavorite: true,
            }),
        );
        assertEquals(document.title, null);
        assertEquals(document.displayTitle, "A single unified note");
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
            }),
        );
        // Creation may also be observable; consume until the committed update.
        let event = "";
        while (!event.includes(`"version":${updated.version}`)) {
            event = decoder.decode((await owner.read()).value);
        }
        assert(event.startsWith("event: document.updated\n"));
        assert(event.includes(`"documentId":"${document.id}"`));
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

Deno.test("Documents HTTP: home-order reorders without versioning and pin-to-end appends new pins", async () => {
    let clock = 1_000_000;
    const env = await setup(() => clock);
    try {
        const first = await createHomeNote(env, "First");
        clock += 100;
        const second = await createHomeNote(env, "Second");
        clock += 100;
        const unpinned = await data<DocumentDto>(
            await env.request("/api/documents", "POST", {
                body: "Third via pin",
                isHomeFixed: false,
            }),
        );
        assertEquals(first.homeSortOrder, 0);
        assertEquals(second.homeSortOrder, 1);
        assertEquals(unpinned.homeSortOrder, 0);

        clock += 100;
        const third = await data<DocumentDto>(
            await env.request(`/api/documents/${unpinned.id}`, "PATCH", {
                version: unpinned.version,
                isHomeFixed: true,
            }),
        );
        assertEquals(third.homeSortOrder, 2);

        const initialHome = await data<DocumentPageDto>(
            await env.request("/api/documents?scope=home"),
        );
        assertEquals(initialHome.items.map((item) => item.id), [
            first.id,
            second.id,
            third.id,
        ]);

        clock += 500;
        const orderRes = await env.request(
            "/api/documents/home-order",
            "PATCH",
            { ids: [third.id, first.id, second.id] },
        );
        assertEquals(orderRes.status, 200);
        const orderDto = await data<HomeOrderDto>(orderRes);
        assertEquals(orderDto, {
            items: [
                { id: third.id, homeSortOrder: 0 },
                { id: first.id, homeSortOrder: 1 },
                { id: second.id, homeSortOrder: 2 },
            ],
        });

        const reorderedHome = await data<DocumentPageDto>(
            await env.request("/api/documents?scope=home"),
        );
        assertEquals(reorderedHome.items.map((item) => item.id), [
            third.id,
            first.id,
            second.id,
        ]);

        // Version and updatedAt remain untouched after home-order PATCH.
        const afterFirst = await data<DocumentDto>(
            await env.request(`/api/documents/${first.id}`),
        );
        assertEquals(afterFirst.version, first.version);
        assertEquals(afterFirst.updatedAt, first.updatedAt);
        assertEquals(afterFirst.homeSortOrder, 1);

        // Pinning another note after reorder appends after max (2 -> 3).
        clock += 100;
        const fourth = await createHomeNote(env, "Fourth");
        assertEquals(fourth.homeSortOrder, 3);
    } finally {
        await env.store.close();
    }
});

Deno.test("Documents HTTP: home-order enforces 400/404/409 contracts atomically", async () => {
    const env = await setup();
    try {
        const first = await createHomeNote(env, "First");
        const second = await createHomeNote(env, "Second");
        const unpinned = await data<DocumentDto>(
            await env.request("/api/documents", "POST", {
                body: "Unpinned",
                isHomeFixed: false,
            }),
        );
        const trashed = await createHomeNote(env, "Trashed");
        assertEquals(
            (await env.request(
                `/api/documents/${trashed.id}?version=${trashed.version}`,
                "DELETE",
            )).status,
            200,
        );
        const foreign = await createHomeNote(env, "Foreign", 1);

        // 409: missing a home note
        assertEquals(
            (await env.request("/api/documents/home-order", "PATCH", {
                ids: [first.id],
            })).status,
            409,
        );
        // 409: extra unpinned note (even when all home notes are included or replaced)
        assertEquals(
            (await env.request("/api/documents/home-order", "PATCH", {
                ids: [first.id, second.id, unpinned.id],
            })).status,
            409,
        );
        assertEquals(
            (await env.request("/api/documents/home-order", "PATCH", {
                ids: [first.id, unpinned.id],
            })).status,
            409,
        );

        // 404: foreign, soft-deleted, or unknown id
        assertEquals(
            (await env.request("/api/documents/home-order", "PATCH", {
                ids: [first.id, second.id, foreign.id],
            })).status,
            404,
        );
        assertEquals(
            (await env.request("/api/documents/home-order", "PATCH", {
                ids: [first.id, second.id, trashed.id],
            })).status,
            404,
        );
        assertEquals(
            (await env.request("/api/documents/home-order", "PATCH", {
                ids: [first.id, second.id, "missing-id"],
            })).status,
            404,
        );

        // 400: empty, duplicate, blank, or >500 ids
        assertEquals(
            (await env.request("/api/documents/home-order", "PATCH", {
                ids: [],
            })).status,
            400,
        );
        assertEquals(
            (await env.request("/api/documents/home-order", "PATCH", {
                ids: [first.id, first.id],
            })).status,
            400,
        );
        assertEquals(
            (await env.request("/api/documents/home-order", "PATCH", {
                ids: ["   "],
            })).status,
            400,
        );
        assertEquals(
            (await env.request("/api/documents/home-order", "PATCH", {
                ids: Array.from({ length: 501 }, (_, i) => `id-${i}`),
            })).status,
            400,
        );

        // Order unchanged after rejected requests
        const home = await data<DocumentPageDto>(
            await env.request("/api/documents?scope=home"),
        );
        assertEquals(home.items.map((item) => item.id), [first.id, second.id]);
    } finally {
        await env.store.close();
    }
});

Deno.test("Documents HTTP: last opened is owner-isolated, ignores trash and does not edit or emit", async () => {
    let clock = Date.now();
    const env = await setup(() => clock);
    const stream = await env.request("/api/documents/events");
    const reader = stream.body!.getReader();
    try {
        await reader.read();
        const lastOpened = async (owner = 0) => {
            const response = await env.request(
                "/api/documents/last-opened",
                "GET",
                undefined,
                owner,
            );
            assertEquals(response.status, 200);
            return (await response.json() as Envelope<{ id: string } | null>)
                .data;
        };
        // This static route must win over /:id, even when there is no result.
        assertEquals(await lastOpened(), null);
        const first = await data<DocumentDto>(
            await env.request("/api/documents", "POST", { title: "first" }),
        );
        const second = await data<DocumentDto>(
            await env.request("/api/documents", "POST", { title: "second" }),
        );
        const foreign = await data<DocumentDto>(
            await env.request(
                "/api/documents",
                "POST",
                { title: "foreign" },
                1,
            ),
        );
        await reader.read();
        await reader.read();
        clock += 1000;
        assertEquals(
            (await env.request(`/api/documents/${first.id}/opened`, "PUT"))
                .status,
            200,
        );
        assertEquals(await lastOpened(), { id: first.id });
        assertEquals(await lastOpened(1), null);
        clock += 1000;
        assertEquals(
            (await env.request(`/api/documents/${second.id}/opened`, "PUT"))
                .status,
            200,
        );
        assertEquals(
            (await env.request(
                `/api/documents/${foreign.id}/opened`,
                "PUT",
                undefined,
                1,
            )).status,
            200,
        );
        assertEquals(await lastOpened(), { id: second.id });
        assertEquals(await lastOpened(1), { id: foreign.id });
        assertEquals(
            (await env.request(`/api/documents/${foreign.id}/opened`, "PUT"))
                .status,
            404,
        );
        assertEquals(
            (await env.request("/api/documents/missing/opened", "PUT")).status,
            404,
        );
        const unchanged = await data<DocumentDto>(
            await env.request(`/api/documents/${second.id}`),
        );
        assertEquals(unchanged.version, second.version);
        assertEquals(unchanged.updatedAt, second.updatedAt);

        // The next event must be the actual edit, not either opened operation.
        const edited = await data<DocumentDto>(
            await env.request(`/api/documents/${first.id}`, "PATCH", {
                version: first.version,
                body: "event sentinel",
            }),
        );
        const event = new TextDecoder().decode((await reader.read()).value);
        assert(event.includes(`"documentId":"${first.id}"`));
        assert(event.includes(`"version":${edited.version}`));
        assertEquals(
            (await env.request(
                `/api/documents/${second.id}?version=${second.version}`,
                "DELETE",
            )).status,
            200,
        );
        assertEquals(
            (await env.request(`/api/documents/${second.id}/opened`, "PUT"))
                .status,
            404,
        );
        assertEquals(await lastOpened(), { id: first.id });
        assertEquals(
            (await env.request(
                `/api/documents/${first.id}?version=${edited.version}`,
                "DELETE",
            )).status,
            200,
        );
        assertEquals(await lastOpened(), null);
        assertEquals(await lastOpened(1), { id: foreign.id });
    } finally {
        await reader.cancel();
        await env.store.close();
    }
});

Deno.test("Documents HTTP: position orders and moves documents without changing their content version", async () => {
    const env = await setup();
    try {
        const notebook = await data<DocumentNotebookDto>(
            await env.request("/api/document-notebooks", "POST", {
                name: "Target",
            }),
        );
        const otherNotebook = await data<DocumentNotebookDto>(
            await env.request("/api/document-notebooks", "POST", {
                name: "Other",
            }),
        );
        const foreignNotebook = await data<DocumentNotebookDto>(
            await env.request("/api/document-notebooks", "POST", {
                name: "Foreign",
            }, 1),
        );
        const a = await data<DocumentDto>(
            await env.request("/api/documents", "POST", { title: "a" }),
        );
        const b = await data<DocumentDto>(
            await env.request("/api/documents", "POST", { title: "b" }),
        );
        const c = await data<DocumentDto>(
            await env.request("/api/documents", "POST", {
                title: "c",
                notebookId: notebook.id,
            }),
        );
        const foreign = await data<DocumentDto>(
            await env.request(
                "/api/documents",
                "POST",
                { title: "foreign" },
                1,
            ),
        );
        const list = async (path: string) =>
            (await data<DocumentPageDto>(await env.request(path))).items.map((
                item,
            ) => item.id);
        const root = "/api/documents?scope=uncategorized";
        const target =
            `/api/documents?scope=notebook&notebookId=${notebook.id}`;
        const position = (id: string, body: unknown, owner = 0) =>
            env.request(`/api/documents/${id}/position`, "POST", body, owner);
        assertEquals(await list(root), [b.id, a.id]);
        const stream = await env.request("/api/documents/events");
        const reader = stream.body!.getReader();
        await reader.read();

        assertEquals(
            (await position(a.id, { notebookId: null, beforeId: b.id })).status,
            200,
        );
        const event = new TextDecoder().decode((await reader.read()).value);
        assert(event.includes(`"documentId":"${a.id}"`));
        await reader.cancel();
        assertEquals(await list(root), [a.id, b.id]);
        const page = await data<DocumentPageDto>(
            await env.request(`${root}&limit=1`),
        );
        assertEquals(page.items.map((item) => item.id), [a.id]);
        assert(page.nextCursor);
        const next = await data<DocumentPageDto>(
            await env.request(
                `${root}&limit=1&cursor=${encodeURIComponent(page.nextCursor)}`,
            ),
        );
        assertEquals(next.items.map((item) => item.id), [b.id]);
        assertEquals(next.nextCursor, null);
        assertEquals(
            (await position(a.id, { notebookId: notebook.id, afterId: c.id }))
                .status,
            200,
        );
        assertEquals(await list(root), [b.id]);
        assertEquals(await list(target), [c.id, a.id]);
        assertEquals(
            (await position(b.id, { notebookId: notebook.id })).status,
            200,
        );
        assertEquals(await list(target), [b.id, c.id, a.id]);
        const moved = await data<DocumentDto>(
            await env.request(`/api/documents/${a.id}`),
        );
        assertEquals(moved.notebookId, notebook.id);
        assertEquals(moved.version, a.version);
        assertEquals(moved.updatedAt, a.updatedAt);

        // PATCH may ignore the obsolete field, but must never move a document.
        const patched = await data<DocumentDto>(
            await env.request(`/api/documents/${a.id}`, "PATCH", {
                version: moved.version,
                notebookId: null,
                title: "still filed",
            }),
        );
        assertEquals(patched.notebookId, notebook.id);
        assertEquals(await list(target), [b.id, c.id, a.id]);
        for (
            const body of [
                {},
                { notebookId: 123 },
                { notebookId: notebook.id, beforeId: b.id, afterId: c.id },
                { notebookId: notebook.id, beforeId: a.id },
                { notebookId: otherNotebook.id, beforeId: b.id },
            ]
        ) {
            assertEquals((await position(a.id, body)).status, 400);
        }
        for (
            const body of [
                { notebookId: "missing" },
                { notebookId: foreignNotebook.id },
                { notebookId: notebook.id, beforeId: "missing" },
                { notebookId: notebook.id, beforeId: foreign.id },
            ]
        ) {
            assertEquals((await position(a.id, body)).status, 404);
        }
        assertEquals(
            (await position(foreign.id, { notebookId: null })).status,
            404,
        );
        assertEquals(
            (await position(a.id, { notebookId: null }, 1)).status,
            404,
        );
        assertEquals(
            (await env.request(
                `/api/documents/${c.id}?version=${c.version}`,
                "DELETE",
            )).status,
            200,
        );
        assertEquals(
            (await position(a.id, { notebookId: notebook.id, beforeId: c.id }))
                .status,
            404,
        );
        assertEquals((await position(c.id, { notebookId: null })).status, 404);
        assertEquals(await list(target), [b.id, a.id]);
    } finally {
        await env.store.close();
    }
});

Deno.test("Documents HTTP: notebook move orders siblings and validates anchors", async () => {
    const env = await setup();
    try {
        const create = async (
            name: string,
            parentId: string | null = null,
            owner = 0,
        ) => await data<DocumentNotebookDto>(
            await env.request("/api/document-notebooks", "POST", {
                name,
                parentId,
            }, owner),
        );
        const a = await create("a");
        const b = await create("b");
        const c = await create("c");
        const child = await create("child", a.id);
        const foreign = await create("foreign", null, 1);
        const move = (id: string, body: unknown, owner = 0) =>
            env.request(
                `/api/document-notebooks/${id}/move`,
                "POST",
                body,
                owner,
            );
        const siblings = async (parentId: string | null) =>
            (await data<DocumentNotebookDto[]>(
                await env.request("/api/document-notebooks"),
            ))
                .filter((item) => item.parentId === parentId).map((item) =>
                    item.id
                );
        assertEquals(
            (await move(c.id, { parentId: null, beforeId: a.id })).status,
            200,
        );
        assertEquals(await siblings(null), [c.id, a.id, b.id]);
        assertEquals(
            (await move(c.id, { parentId: null, afterId: a.id })).status,
            200,
        );
        assertEquals(await siblings(null), [a.id, c.id, b.id]);
        assertEquals(
            (await move(c.id, { parentId: a.id, beforeId: child.id })).status,
            200,
        );
        assertEquals(await siblings(a.id), [c.id, child.id]);
        assertEquals((await move(c.id, { parentId: null })).status, 200);
        assertEquals(await siblings(null), [a.id, b.id, c.id]);
        for (
            const body of [
                { parentId: null, beforeId: a.id, afterId: b.id },
                { parentId: null, beforeId: c.id },
                { parentId: null, beforeId: child.id },
            ]
        ) {
            assertEquals((await move(c.id, body)).status, 400);
        }
        assertEquals(
            (await move(c.id, { parentId: null, beforeId: foreign.id })).status,
            404,
        );
        assertEquals(
            (await move(c.id, { parentId: null, afterId: "missing" })).status,
            404,
        );
        assertEquals((await move(c.id, { parentId: null }, 1)).status, 404);
        assertEquals(await siblings(null), [a.id, b.id, c.id]);
    } finally {
        await env.store.close();
    }
});
