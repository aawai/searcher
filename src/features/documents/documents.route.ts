import type { Context } from "hono";
import { json, param, query, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import * as v from "@valibot/valibot";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import {
    DOCUMENT_ASSET_MAX_BYTES,
    DOCUMENT_BODY_MAX_LENGTH,
    DOCUMENT_PAGE_DEFAULT_LIMIT,
    DOCUMENT_PAGE_MAX_LIMIT,
    DOCUMENT_TITLE_MAX_LENGTH,
    type DocumentScope,
} from "../../shared/documents.ts";
import { DocumentAssetsService } from "./assets.ts";
import {
    DocumentConflictError,
    DocumentNotFoundError,
    DocumentValidationError,
} from "./errors.ts";
import { DocumentNotebooksService } from "./notebooks.ts";
import { DocumentsService } from "./service.ts";
import { DocumentSettingsService } from "./settings.ts";
import { DocumentLayoutsService } from "./layouts.ts";

const Id = v.pipe(v.string(), v.trim(), v.minLength(1, "ID 不能为空"));
const Version = v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(Number.MAX_SAFE_INTEGER),
);
const NumericQuery = v.pipe(
    v.string(),
    v.regex(/^[1-9]\d*$/),
    v.transform(Number),
    Version,
);
const Title = v.nullable(
    v.pipe(v.string(), v.maxLength(DOCUMENT_TITLE_MAX_LENGTH)),
);
const Color = v.picklist(["paper", "amber", "rose", "sage", "sky"]);
const Integer = v.pipe(v.number(), v.integer(), v.safeInteger());
const DeviceClass = v.picklist(["desktop", "tablet", "mobile"]);
const Coordinate = v.nullable(v.pipe(v.number(), v.finite()));
const Body = v.pipe(v.string(), v.maxLength(DOCUMENT_BODY_MAX_LENGTH));
const Name = v.pipe(v.string(), v.trim(), v.minLength(1, "笔记本名称不能为空"));
const Limit = v.optional(
    v.pipe(NumericQuery, v.maxValue(DOCUMENT_PAGE_MAX_LIMIT)),
    String(DOCUMENT_PAGE_DEFAULT_LIMIT),
);
const Cursor = v.optional(Id);
const Margin = v.pipe(v.number(), v.finite(), v.minValue(5), v.maxValue(50));
const pageQuery = { limit: query(Limit), cursor: query(Cursor) };
const entityParam = { id: param(Id) };

async function documentResponse(
    c: Context<AppEnv>,
    operation: () => Promise<Response>,
): Promise<Response> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof DocumentNotFoundError) {
            return c.fail(404, error.message);
        }
        if (error instanceof DocumentValidationError) {
            return c.fail(400, error.message);
        }
        if (error instanceof DocumentConflictError) {
            return c.fail(409, error.message, {
                currentDocument: error.currentDocument,
            });
        }
        throw error;
    }
}

export function registerDocumentsRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
): void {
    const documents = new DocumentsService(deps.store, deps.now);
    const notebooks = new DocumentNotebooksService(deps.store, deps.now);
    const assets = new DocumentAssetsService(deps.store, deps.now);
    const settings = new DocumentSettingsService(deps.store, deps.now);
    const layouts = new DocumentLayoutsService(deps.store, deps.now);

    routes.get("/api/documents/events", (c) => {
        const encoder = new TextEncoder();
        let off: (() => void) | undefined;
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                const send = (event: string, data: unknown) => {
                    controller.enqueue(encoder.encode(
                        `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
                    ));
                };
                send("ready", { ok: true });
                off = documents.events.on(c.get("user").id, (event) => {
                    send("document.updated", event);
                });
            },
            cancel() {
                off?.();
                off = undefined;
            },
        });
        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        });
    });

    routes.get(
        "/api/documents",
        validator({
            ...pageQuery,
            scope: query(
                v.optional(
                    v.picklist([
                        "all",
                        "recent",
                        "favorite",
                        "home",
                        "notebook",
                    ]),
                    "all",
                ),
            ),
            notebookId: query(v.optional(Id)),
        }),
        (c, data) =>
            documentResponse(c, async () => {
                if (data.scope === "notebook" && !data.notebookId) {
                    return c.fail(400, "笔记本范围需要 notebookId");
                }
                const scope: DocumentScope = data.scope === "notebook"
                    ? { type: "notebook", notebookId: data.notebookId! }
                    : { type: data.scope };
                return c.success(
                    await documents.list(c.get("user").id, {
                        scope,
                        limit: data.limit,
                        cursor: data.cursor,
                    }),
                );
            }),
    );
    routes.get(
        "/api/documents/search",
        validator({
            ...pageQuery,
            q: query(v.pipe(v.string(), v.trim())),
        }),
        (c, data) =>
            documentResponse(c, async () =>
                c.success(
                    await documents.search(c.get("user").id, data.q, data),
                )),
    );
    routes.get(
        "/api/documents/trash",
        validator(pageQuery),
        (c, data) =>
            documentResponse(
                c,
                async () =>
                    c.success(
                        await documents.listTrash(c.get("user").id, data),
                    ),
            ),
    );
    routes.post(
        "/api/documents",
        validator({
            title: json(v.optional(Title)),
            body: json(v.optional(Body)),
            notebookId: json(v.optional(v.nullable(Id))),
            color: json(v.optional(Color)),
            isHomeFixed: json(v.optional(v.boolean())),
            homeSortOrder: json(v.optional(Integer)),
            isFavorite: json(v.optional(v.boolean())),
        }),
        (c, data) =>
            documentResponse(
                c,
                async () =>
                    c.success(await documents.create(c.get("user").id, data)),
            ),
    );
    routes.get(
        "/api/documents/:id",
        validator(entityParam),
        (c, data) =>
            documentResponse(
                c,
                async () =>
                    c.success(await documents.get(c.get("user").id, data.id)),
            ),
    );
    routes.patch(
        "/api/documents/:id",
        validator({
            ...entityParam,
            version: json(Version),
            title: json(v.optional(Title)),
            body: json(v.optional(Body)),
            notebookId: json(v.optional(v.nullable(Id))),
            isFavorite: json(v.optional(v.boolean())),
            color: json(v.optional(Color)),
            isHomeFixed: json(v.optional(v.boolean())),
            homeSortOrder: json(v.optional(Integer)),
            origin: json(
                v.optional(
                    v.picklist([
                        "autosave",
                        "manual",
                        "conflict_resolution",
                        "restore",
                    ]),
                    "autosave",
                ),
            ),
        }),
        (c, data) =>
            documentResponse(c, async () =>
                c.success(
                    await documents.update(c.get("user").id, data.id, data),
                )),
    );
    routes.delete(
        "/api/documents/:id",
        validator({ ...entityParam, version: query(NumericQuery) }),
        (c, data) =>
            documentResponse(c, async () => {
                await documents.softDelete(
                    c.get("user").id,
                    data.id,
                    data.version,
                );
                return c.success(null);
            }),
    );
    routes.post(
        "/api/documents/:id/restore",
        validator(entityParam),
        (c, data) =>
            documentResponse(
                c,
                async () =>
                    c.success(
                        await documents.restore(c.get("user").id, data.id),
                    ),
            ),
    );
    routes.delete(
        "/api/documents/:id/permanent",
        validator({ ...entityParam, version: query(v.optional(NumericQuery)) }),
        (c, data) =>
            documentResponse(c, async () => {
                await documents.permanentDelete(
                    c.get("user").id,
                    data.id,
                    data.version,
                );
                return c.success(null);
            }),
    );
    routes.get(
        "/api/documents/:id/versions",
        validator(entityParam),
        (c, data) =>
            documentResponse(
                c,
                async () =>
                    c.success(
                        await documents.versions(c.get("user").id, data.id),
                    ),
            ),
    );
    routes.post(
        "/api/documents/:id/versions/:targetVersion/restore",
        validator({
            ...entityParam,
            targetVersion: param(NumericQuery),
            version: json(Version),
        }),
        (c, data) =>
            documentResponse(c, async () =>
                c.success(
                    await documents.restoreVersion(
                        c.get("user").id,
                        data.id,
                        data.targetVersion,
                        data.version,
                    ),
                )),
    );

    routes.get(
        "/api/documents/:id/layout",
        validator({
            ...entityParam,
            deviceClass: query(v.optional(DeviceClass, "desktop")),
        }),
        (c, data) =>
            documentResponse(
                c,
                async () =>
                    c.success(
                        await layouts.getLayout(
                            c.get("user").id,
                            data.id,
                            data.deviceClass,
                        ),
                    ),
            ),
    );
    routes.patch(
        "/api/documents/:id/layout",
        validator({
            ...entityParam,
            deviceClass: json(v.optional(DeviceClass, "desktop")),
            x: json(v.optional(Coordinate)),
            y: json(v.optional(Coordinate)),
            width: json(v.optional(Coordinate)),
            zIndex: json(v.optional(Integer)),
            expanded: json(v.optional(v.boolean())),
            sortOrder: json(v.optional(v.nullable(Integer))),
        }),
        (c, data) =>
            documentResponse(
                c,
                async () =>
                    c.success(
                        await layouts.updateLayout(
                            c.get("user").id,
                            data.id,
                            data,
                        ),
                    ),
            ),
    );

    routes.get(
        "/api/documents/:id/settings",
        validator(entityParam),
        (c, data) =>
            documentResponse(
                c,
                async () =>
                    c.success(await settings.get(c.get("user").id, data.id)),
            ),
    );
    routes.put(
        "/api/documents/:id/settings",
        validator({
            ...entityParam,
            paperSize: json(v.picklist(["a4", "letter"])),
            orientation: json(v.picklist(["portrait", "landscape"])),
            marginTopMm: json(Margin),
            marginRightMm: json(Margin),
            marginBottomMm: json(Margin),
            marginLeftMm: json(Margin),
        }),
        (c, data) =>
            documentResponse(c, async () =>
                c.success(
                    await settings.update(c.get("user").id, data.id, data),
                )),
    );
    routes.post(
        "/api/documents/:id/assets",
        validator(entityParam),
        (c, data) =>
            documentResponse(c, async () => {
                const body = await c.req.parseBody();
                const file = body.file;
                if (!(file instanceof File)) {
                    return c.fail(400, "需要上传 file");
                }
                if (file.size > DOCUMENT_ASSET_MAX_BYTES) {
                    return c.fail(400, "笔记图片超过 10 MiB 上限");
                }
                return c.success(
                    await assets.upload(c.get("user").id, data.id, {
                        bytes: new Uint8Array(await file.arrayBuffer()),
                        mimeType: file.type,
                        originalName: file.name,
                    }),
                );
            }),
    );
    routes.get(
        "/api/documents/:id/assets/:assetId",
        validator({ ...entityParam, assetId: param(Id) }),
        (c, data) =>
            documentResponse(c, async () => {
                const result = await assets.read(
                    c.get("user").id,
                    data.id,
                    data.assetId,
                );
                return new Response(result.bytes, {
                    headers: {
                        "Content-Type": result.asset.mimeType,
                        "Content-Length": String(result.asset.byteSize),
                        "Cache-Control": "no-store",
                        "X-Content-Type-Options": "nosniff",
                    },
                });
            }),
    );
    routes.delete(
        "/api/documents/:id/assets/:assetId",
        validator({ ...entityParam, assetId: param(Id) }),
        (c, data) =>
            documentResponse(c, async () => {
                await assets.delete(c.get("user").id, data.id, data.assetId);
                return c.success(null);
            }),
    );

    routes.get(
        "/api/document-notebooks",
        (c) =>
            documentResponse(
                c,
                async () => c.success(await notebooks.list(c.get("user").id)),
            ),
    );
    routes.post(
        "/api/document-notebooks",
        validator({
            name: json(Name),
            parentId: json(v.optional(v.nullable(Id))),
        }),
        (c, data) =>
            documentResponse(
                c,
                async () =>
                    c.success(await notebooks.create(c.get("user").id, data)),
            ),
    );
    routes.put(
        "/api/document-notebooks/reorder",
        validator({
            parentId: json(v.optional(v.nullable(Id), null)),
            ids: json(v.array(Id)),
        }),
        (c, data) =>
            documentResponse(c, async () =>
                c.success(
                    await notebooks.reorder(
                        c.get("user").id,
                        data.parentId,
                        data.ids,
                    ),
                )),
    );
    routes.patch(
        "/api/document-notebooks/:id",
        validator({ ...entityParam, name: json(Name) }),
        (c, data) =>
            documentResponse(c, async () =>
                c.success(
                    await notebooks.rename(
                        c.get("user").id,
                        data.id,
                        data.name,
                    ),
                )),
    );
    routes.post(
        "/api/document-notebooks/:id/move",
        validator({ ...entityParam, parentId: json(v.nullable(Id)) }),
        (c, data) =>
            documentResponse(c, async () =>
                c.success(
                    await notebooks.move(
                        c.get("user").id,
                        data.id,
                        data.parentId,
                    ),
                )),
    );
    routes.delete(
        "/api/document-notebooks/:id",
        validator(entityParam),
        (c, data) =>
            documentResponse(c, async () => {
                await notebooks.delete(c.get("user").id, data.id);
                return c.success(null);
            }),
    );
}
