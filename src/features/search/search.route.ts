// src/features/search/search.route.ts
import { STATUS_CODE } from "@std/http";
import { json, query, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import * as v from "@valibot/valibot";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { SearchService } from "./service.ts";
import type { EngineId } from "@shared/engines.ts";
import {
    PERSONAL_SEARCH_DEFAULT_LIMIT,
    PERSONAL_SEARCH_MAX_LIMIT,
    PERSONAL_SEARCH_QUERY_MAX_LENGTH,
} from "@shared/personal-search.ts";
import { BookmarksService } from "../bookmarks/service.ts";
import { DocumentsService } from "../documents/service.ts";
import { PersonalSearchService } from "./personal.ts";

const EngineSchema = v.picklist(
    ["google", "bing", "baidu", "duckduckgo"],
    "搜索引擎必须为 google, bing, baidu 或 duckduckgo",
);

const SuggestionQuerySchema = v.pipe(
    v.string("查询关键词必须为字符串"),
    v.trim(),
    v.minLength(1, "查询关键词不能为空"),
    v.maxLength(200, "查询关键词最多200字符"),
);

const PersonalQuerySchema = v.pipe(
    v.string("查询关键词必须为字符串"),
    v.trim(),
    v.maxLength(
        PERSONAL_SEARCH_QUERY_MAX_LENGTH,
        `查询关键词最多${PERSONAL_SEARCH_QUERY_MAX_LENGTH}字符`,
    ),
);

const PersonalLimitSchema = v.optional(
    v.pipe(
        v.string("limit 必须为整数"),
        v.regex(/^[1-9]\d*$/, "limit 必须为正整数"),
        v.transform(Number),
        v.maxValue(
            PERSONAL_SEARCH_MAX_LIMIT,
            `limit 不能超过 ${PERSONAL_SEARCH_MAX_LIMIT}`,
        ),
    ),
);

const RecordHistorySchema = v.object({
    query: v.pipe(
        v.string("搜索关键词必须为字符串"),
        v.trim(),
        v.minLength(1, "搜索关键词不能为空"),
        v.maxLength(200, "搜索关键词最多200字符"),
    ),
    engineId: EngineSchema,
});

export function registerSearchRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
): void {
    const service = new SearchService(deps.store, {
        now: deps.now,
    });

    const personal = new PersonalSearchService(
        new DocumentsService(deps.store, deps.now),
        new BookmarksService(deps.store, deps.now),
    );

    // 1. PUBLIC GET /api/search/suggestions?q=...&engine=...
    routes.public.get(
        "/api/search/suggestions",
        validator({
            q: query(SuggestionQuerySchema),
            engine: query(v.optional(EngineSchema)),
        }),
        async (c, data) => {
            const user = c.get("user");
            const defaultEngine = deps.settings
                ? (await deps.settings.get()).defaultEngine
                : "bing";
            const engine = data.engine ?? defaultEngine;
            const suggestions = await service.getSuggestions(
                data.q,
                engine as EngineId,
                user?.id,
            );
            return c.success(suggestions);
        },
    );
    // AUTH GET /api/search/personal?q=...&limit=... - the user's documents and apps for the search box
    routes.get(
        "/api/search/personal",
        validator({
            q: query(PersonalQuerySchema),
            limit: query(PersonalLimitSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            return c.success(
                await personal.search(
                    user.id,
                    data.q,
                    data.limit ?? PERSONAL_SEARCH_DEFAULT_LIMIT,
                ),
            );
        },
    );

    // 2. AUTH GET /api/search/history - list user search history
    routes.get("/api/search/history", async (c) => {
        const user = c.get("user");
        const list = await service.listHistory(user.id);
        return c.success(list);
    });

    // 3. AUTH POST /api/search/history - record user search history if opted-in
    routes.post(
        "/api/search/history",
        validator({
            query: json(RecordHistorySchema.entries.query),
            engineId: json(RecordHistorySchema.entries.engineId),
        }),
        async (c, data) => {
            const user = c.get("user");
            const item = await service.recordHistory(
                user.id,
                data.query,
                data.engineId,
            );
            return c.success(item);
        },
    );

    // 4. AUTH DELETE /api/search/history/:id - delete single history item
    routes.delete(
        "/api/search/history/:id",
        async (c) => {
            const user = c.get("user");
            const id = c.req.param("id");
            if (!id) return c.fail(STATUS_CODE.BadRequest, "缺少 ID");
            const deleted = await service.deleteHistoryItem(user.id, id);
            return c.success({ deleted });
        },
    );

    // 5. AUTH DELETE /api/search/history - clear all user search history
    routes.delete("/api/search/history", async (c) => {
        const user = c.get("user");
        await service.clearHistory(user.id);
        return c.success({ cleared: true });
    });
}
