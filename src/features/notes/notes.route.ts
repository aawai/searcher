import { STATUS_CODE } from "@std/http";
import { json, param, query, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import * as v from "@valibot/valibot";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import {
    NoteConflictError,
    noteEvents,
    NoteNotFoundError,
    NotesService,
} from "./service.ts";

const NoteColorSchema = v.picklist(
    ["paper", "amber", "rose", "sage", "sky"],
    "颜色必须为 paper, amber, rose, sage 或 sky",
);

const NoteContentSchema = v.pipe(
    v.string("便签内容必须为字符串"),
    v.maxLength(10000, "便签内容最多10000个字符"),
);

const TitleSchema = v.pipe(
    v.string("便签标题必须为字符串"),
    v.maxLength(200, "便签标题最多200个字符"),
);

const IntegerSchema = v.pipe(
    v.number("必须为数字"),
    v.integer("必须为整数"),
);

const LayoutSchema = v.object({
    deviceClass: v.optional(v.picklist(["desktop", "tablet", "mobile"])),
    x: v.optional(v.nullable(v.number())),
    y: v.optional(v.nullable(v.number())),
    width: v.optional(v.nullable(v.number())),
    zIndex: v.optional(IntegerSchema),
    expanded: v.optional(v.boolean()),
    sortOrder: v.optional(v.nullable(IntegerSchema)),
});

const IdParamSchema = v.pipe(
    v.string("ID必须为字符串"),
    v.trim(),
    v.minLength(1, "ID不能为空"),
);

const VersionParamSchema = v.pipe(
    v.string("版本号必须为数字字符串"),
    v.transform((val) => Number.parseInt(val, 10)),
    v.integer("版本号必须为整数"),
    v.minValue(1, "版本号必须大于等于1"),
);

const DeleteVersionQuerySchema = v.optional(
    v.pipe(
        v.string("版本号必须为数字字符串"),
        v.transform((val) => Number.parseInt(val, 10)),
        v.integer("版本号必须为整数"),
        v.minValue(1, "版本号必须大于等于1"),
    ),
);

const SearchQuerySchema = v.pipe(
    v.string("搜索关键词必须为字符串"),
    v.trim(),
    v.minLength(1, "搜索关键词不能为空"),
);

export function registerNotesRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
): void {
    const service = new NotesService(deps.store, deps.now);

    // GET /api/notes/events — Y-003 轻量实时事件流（protected，会话中间件鉴权）。
    routes.get("/api/notes/events", (c) => {
        const user = c.get("user");
        const userId = user.id;
        const encoder = new TextEncoder();
        let off: (() => void) | null = null;
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                const send = (event: string, data: unknown) => {
                    try {
                        controller.enqueue(
                            encoder.encode(
                                `event: ${event}\ndata: ${
                                    JSON.stringify(data)
                                }\n\n`,
                            ),
                        );
                    } catch {
                        // 客户端已断开：忽略
                    }
                };
                send("ready", { ok: true });
                off = noteEvents.on(userId, (evt) => {
                    send("note.updated", {
                        noteId: evt.noteId,
                        version: evt.version,
                        updatedAt: evt.updatedAt,
                    });
                });
                c.req.raw.signal.addEventListener("abort", () => {
                    off?.();
                    off = null;
                    try {
                        controller.close();
                    } catch {
                        // 已关闭：忽略
                    }
                }, { once: true });
            },
            cancel() {
                off?.();
                off = null;
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

    // GET /api/notes
    routes.get("/api/notes", async (c) => {
        const user = c.get("user");
        const list = await service.list(user.id);
        return c.success(list);
    });
    // GET /api/notes/search?q=...
    routes.get(
        "/api/notes/search",
        validator({
            q: query(SearchQuerySchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            const results = await service.search(user.id, data.q);
            return c.success(results);
        },
    );

    // GET /api/notes/trash
    routes.get("/api/notes/trash", async (c) => {
        const user = c.get("user");
        const trash = await service.listTrash(user.id);
        return c.success(trash);
    });

    // POST /api/notes
    routes.post(
        "/api/notes",
        validator({
            title: json(v.optional(v.nullable(TitleSchema))),
            body: json(v.optional(NoteContentSchema)),
            content: json(v.optional(NoteContentSchema)),
            pinned: json(v.optional(v.boolean("置顶状态必须为布尔值"))),
            isPinned: json(v.optional(v.boolean("置顶状态必须为布尔值"))),
            isHomeFixed: json(
                v.optional(v.boolean("固定主页状态必须为布尔值")),
            ),
            color: json(v.optional(NoteColorSchema, "paper")),
            sortOrder: json(v.optional(IntegerSchema)),
            layout: json(v.optional(LayoutSchema)),
        }),
        async (c, data) => {
            const user = c.get("user");
            const note = await service.create(user.id, {
                title: data.title,
                body: data.body,
                content: data.content,
                pinned: data.pinned,
                isPinned: data.isPinned,
                isHomeFixed: data.isHomeFixed,
                color: data.color,
                sortOrder: data.sortOrder,
                layout: data.layout,
            });
            return c.success(note);
        },
    );

    // GET /api/notes/:id
    routes.get(
        "/api/notes/:id",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                const note = await service.getById(user.id, data.id);
                return c.success(note);
            } catch (error) {
                if (error instanceof NoteNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                throw error;
            }
        },
    );

    // PATCH /api/notes/:id
    routes.patch(
        "/api/notes/:id",
        validator({
            id: param(IdParamSchema),
            title: json(v.optional(v.nullable(TitleSchema))),
            body: json(v.optional(NoteContentSchema)),
            content: json(v.optional(NoteContentSchema)),
            pinned: json(v.optional(v.boolean("置顶状态必须为布尔值"))),
            isPinned: json(v.optional(v.boolean("置顶状态必须为布尔值"))),
            isHomeFixed: json(
                v.optional(v.boolean("固定主页状态必须为布尔值")),
            ),
            color: json(v.optional(NoteColorSchema)),
            sortOrder: json(v.optional(IntegerSchema)),
            version: json(
                v.pipe(
                    v.number("版本号必须为整数"),
                    v.integer("版本号必须为整数"),
                    v.minValue(1, "版本号必须大于等于1"),
                ),
            ),
            layout: json(v.optional(LayoutSchema)),
            origin: json(
                v.optional(
                    v.picklist(["autosave", "manual", "conflict_resolution"]),
                ),
            ),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                const updated = await service.update(
                    user.id,
                    data.id,
                    {
                        title: data.title,
                        body: data.body,
                        content: data.content,
                        pinned: data.pinned,
                        isPinned: data.isPinned,
                        isHomeFixed: data.isHomeFixed,
                        color: data.color,
                        sortOrder: data.sortOrder,
                        version: data.version,
                        layout: data.layout,
                        origin: data.origin,
                    },
                );
                return c.success(updated);
            } catch (error) {
                if (error instanceof NoteNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                if (error instanceof NoteConflictError) {
                    return c.fail(
                        STATUS_CODE.Conflict,
                        error.message,
                        error.currentNote,
                    );
                }
                throw error;
            }
        },
    );

    // PUT /api/notes/:id/layout
    routes.put(
        "/api/notes/:id/layout",
        validator({
            id: param(IdParamSchema),
            deviceClass: json(
                v.optional(v.picklist(["desktop", "tablet", "mobile"])),
            ),
            x: json(v.optional(v.nullable(v.number()))),
            y: json(v.optional(v.nullable(v.number()))),
            width: json(v.optional(v.nullable(v.number()))),
            zIndex: json(v.optional(IntegerSchema)),
            expanded: json(v.optional(v.boolean())),
            sortOrder: json(v.optional(v.nullable(IntegerSchema))),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                const layout = await service.updateLayout(user.id, data.id, {
                    deviceClass: data.deviceClass,
                    x: data.x,
                    y: data.y,
                    width: data.width,
                    zIndex: data.zIndex,
                    expanded: data.expanded,
                    sortOrder: data.sortOrder,
                });
                return c.success(layout);
            } catch (error) {
                if (error instanceof NoteNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                throw error;
            }
        },
    );

    // DELETE /api/notes/:id?version=N (Soft delete)
    routes.delete(
        "/api/notes/:id",
        validator({
            id: param(IdParamSchema),
            version: query(DeleteVersionQuerySchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                await service.softDelete(user.id, data.id, data.version);
                return c.success(undefined, "便签已移至回收站");
            } catch (error) {
                if (error instanceof NoteNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                if (error instanceof NoteConflictError) {
                    return c.fail(
                        STATUS_CODE.Conflict,
                        error.message,
                        error.currentNote,
                    );
                }
                throw error;
            }
        },
    );

    // POST /api/notes/:id/restore
    routes.post(
        "/api/notes/:id/restore",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                const restored = await service.restore(user.id, data.id);
                return c.success(restored, "便签已恢复");
            } catch (error) {
                if (error instanceof NoteNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                throw error;
            }
        },
    );

    // DELETE /api/notes/:id/permanent
    routes.delete(
        "/api/notes/:id/permanent",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                await service.permanentDelete(user.id, data.id);
                return c.success(undefined, "便签已彻底删除");
            } catch (error) {
                if (error instanceof NoteNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                throw error;
            }
        },
    );

    // GET /api/notes/:id/versions
    routes.get(
        "/api/notes/:id/versions",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                const versions = await service.listVersions(user.id, data.id);
                return c.success(versions);
            } catch (error) {
                if (error instanceof NoteNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                throw error;
            }
        },
    );

    // POST /api/notes/:id/versions/:version/restore
    routes.post(
        "/api/notes/:id/versions/:version/restore",
        validator({
            id: param(IdParamSchema),
            version: param(VersionParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                const restored = await service.restoreVersion(
                    user.id,
                    data.id,
                    data.version,
                );
                return c.success(restored, "版本已恢复");
            } catch (error) {
                if (error instanceof NoteNotFoundError) {
                    return c.fail(STATUS_CODE.NotFound, error.message);
                }
                if (error instanceof Error) {
                    return c.fail(STATUS_CODE.BadRequest, error.message);
                }
                throw error;
            }
        },
    );
}
