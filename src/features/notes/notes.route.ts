import { STATUS_CODE } from "@std/http";
import { json, param, query, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import * as v from "@valibot/valibot";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import {
    NoteConflictError,
    NoteNotFoundError,
    NotesService,
} from "./service.ts";

const NoteContentSchema = v.pipe(
    v.string("便签内容必须为字符串"),
    v.maxLength(10000, "便签内容最多10000个字符"),
);

const CreateNoteContentSchema = v.optional(NoteContentSchema, "");

const NoteVersionSchema = v.pipe(
    v.number("版本号必须为整数"),
    v.integer("版本号必须为整数"),
    v.minValue(1, "版本号必须大于等于1"),
);

const IdParamSchema = v.pipe(
    v.string("ID必须为字符串"),
    v.trim(),
    v.minLength(1, "ID不能为空"),
);

const DeleteVersionQuerySchema = v.optional(
    v.pipe(
        v.string("版本号必须为数字字符串"),
        v.transform((val) => Number.parseInt(val, 10)),
        v.integer("版本号必须为整数"),
        v.minValue(1, "版本号必须大于等于1"),
    ),
);

export function registerNotesRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
): void {
    const service = new NotesService(deps.store, deps.now);

    // GET /api/notes
    routes.get("/api/notes", async (c) => {
        const user = c.get("user");
        const list = await service.list(user.id);
        return c.success(list);
    });

    // POST /api/notes
    routes.post(
        "/api/notes",
        validator({
            content: json(CreateNoteContentSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            const note = await service.create(user.id, {
                content: data.content,
            });
            return c.success(note);
        },
    );

    // PATCH /api/notes/:id
    routes.patch(
        "/api/notes/:id",
        validator({
            id: param(IdParamSchema),
            content: json(NoteContentSchema),
            version: json(NoteVersionSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                const updated = await service.update(
                    user.id,
                    data.id,
                    {
                        content: data.content,
                        version: data.version,
                    },
                );
                return c.success(updated);
            } catch (error) {
                if (error instanceof NoteNotFoundError) {
                    return c.fail(
                        STATUS_CODE.NotFound,
                        error.message,
                    );
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

    // DELETE /api/notes/:id?version=N
    routes.delete(
        "/api/notes/:id",
        validator({
            id: param(IdParamSchema),
            version: query(DeleteVersionQuerySchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            try {
                await service.delete(user.id, data.id, data.version);
                return c.success(undefined, "删除成功");
            } catch (error) {
                if (error instanceof NoteNotFoundError) {
                    return c.fail(
                        STATUS_CODE.NotFound,
                        error.message,
                    );
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
}
