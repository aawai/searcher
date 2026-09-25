import { STATUS_CODE } from "@std/http";
import { json, param, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import * as v from "@valibot/valibot";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { AiService, AiServiceError } from "./service.ts";
import { OpenAIClientError } from "./client.ts";
import type {
    ChatStreamRequest,
    CreateProviderInput,
    UpdateModelInput,
    UpdateProviderInput,
} from "./types.ts";

const ProviderNameSchema = v.pipe(
    v.string("Provider 名称必须为字符串"),
    v.trim(),
    v.minLength(1, "Provider 名称不能为空"),
    v.maxLength(100, "Provider 名称最多100个字符"),
);

const BaseUrlSchema = v.pipe(
    v.string("Base URL 必须为字符串"),
    v.trim(),
    v.minLength(1, "Base URL 不能为空"),
    v.maxLength(2048, "Base URL 过长"),
);

const ApiKeySchema = v.pipe(
    v.string("API Key 必须为字符串"),
    v.trim(),
    v.minLength(1, "API Key 不能为空"),
);

const ScopeSchema = v.optional(v.picklist(["system", "user"]));
const BooleanSchema = v.optional(v.boolean());

const CreateProviderSchema = v.object({
    name: ProviderNameSchema,
    baseUrl: BaseUrlSchema,
    apiKey: ApiKeySchema,
    scope: ScopeSchema,
    enabled: BooleanSchema,
});

const UpdateProviderSchema = v.object({
    name: v.optional(ProviderNameSchema),
    baseUrl: v.optional(BaseUrlSchema),
    apiKey: v.optional(ApiKeySchema),
    enabled: BooleanSchema,
});

const UpdateModelSchema = v.object({
    displayName: v.optional(
        v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
    ),
    enabled: BooleanSchema,
    visibleToUsers: BooleanSchema,
    isDefault: BooleanSchema,
});

const IdParamSchema = v.pipe(
    v.string("ID 必须为字符串"),
    v.trim(),
    v.minLength(1, "ID 不能为空"),
);

const RenameConversationSchema = v.object({
    title: v.pipe(
        v.string("标题必须为字符串"),
        v.trim(),
        v.minLength(1, "标题不能为空"),
        v.maxLength(200, "标题最多200个字符"),
    ),
});

const ChatStreamSchema = v.object({
    conversationId: v.optional(v.string()),
    providerId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    message: v.pipe(
        v.string("消息必须为字符串"),
        v.trim(),
        v.minLength(1, "消息不能为空"),
    ),
    regenerateMessageId: v.optional(v.string()),
    historyEnabled: v.optional(v.boolean()),
    temperature: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(2))),
    topP: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
    maxTokens: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});

const LogoSchema = {
    providerId: v.pipe(v.string(), v.minLength(1)),
    modelId: v.pipe(v.string(), v.minLength(1)),
    siteName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
    style: v.picklist(["minimal", "geometric", "gradient"]),
};

export function registerAiRoutes(
    routes: Routes<AppEnv>,
    deps: AppDeps,
    serviceOverride?: AiService,
): void {
    const service = serviceOverride ??
        new AiService({
            store: deps.store,
            now: deps.now,
        });

    // 1. GET /api/ai/providers - 获取 Provider 列表
    routes.get("/api/ai/providers", async (c) => {
        const user = c.get("user");
        const isAdmin = user.role === "admin";
        const providers = await service.listProviders(user.id, isAdmin);
        return c.success(providers);
    });

    // 2. POST /api/ai/providers - 创建 Provider (系统/用户)
    routes.post(
        "/api/ai/providers",
        validator({
            name: json(CreateProviderSchema.entries.name),
            baseUrl: json(CreateProviderSchema.entries.baseUrl),
            apiKey: json(CreateProviderSchema.entries.apiKey),
            scope: json(CreateProviderSchema.entries.scope),
            enabled: json(CreateProviderSchema.entries.enabled),
        }),
        async (c, data) => {
            const user = c.get("user");
            const isAdmin = user.role === "admin";
            const body: CreateProviderInput = data;

            try {
                const provider = await service.createProvider(
                    user.id,
                    body,
                    isAdmin,
                );
                return c.success(provider, "Provider 创建成功");
            } catch (err: unknown) {
                if (err instanceof AiServiceError) {
                    return c.fail(
                        err.statusCode as 400 | 403 | 404,
                        err.message,
                    );
                }
                const msg = err instanceof Error ? err.message : String(err);
                return c.fail(STATUS_CODE.BadRequest, msg);
            }
        },
    );

    // 3. PUT /api/ai/providers/:id - 更新 Provider
    routes.put(
        "/api/ai/providers/:id",
        validator({
            id: param(IdParamSchema),
            name: json(UpdateProviderSchema.entries.name),
            baseUrl: json(UpdateProviderSchema.entries.baseUrl),
            apiKey: json(UpdateProviderSchema.entries.apiKey),
            enabled: json(UpdateProviderSchema.entries.enabled),
        }),
        async (c, data) => {
            const user = c.get("user");
            const isAdmin = user.role === "admin";
            const providerId = data.id;
            const body: UpdateProviderInput = {
                name: data.name,
                baseUrl: data.baseUrl,
                apiKey: data.apiKey,
                enabled: data.enabled,
            };

            try {
                const provider = await service.updateProvider(
                    user.id,
                    providerId,
                    body,
                    isAdmin,
                );
                return c.success(provider, "Provider 更新成功");
            } catch (err: unknown) {
                if (err instanceof AiServiceError) {
                    return c.fail(
                        err.statusCode as 400 | 403 | 404,
                        err.message,
                    );
                }
                const msg = err instanceof Error ? err.message : String(err);
                return c.fail(STATUS_CODE.BadRequest, msg);
            }
        },
    );

    // 4. DELETE /api/ai/providers/:id - 删除 Provider
    routes.delete(
        "/api/ai/providers/:id",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            const isAdmin = user.role === "admin";
            const providerId = data.id;
            try {
                await service.deleteProvider(user.id, providerId, isAdmin);
                return c.success(null, "Provider 删除成功");
            } catch (err: unknown) {
                if (err instanceof AiServiceError) {
                    return c.fail(
                        err.statusCode as 400 | 403 | 404,
                        err.message,
                    );
                }
                const msg = err instanceof Error ? err.message : String(err);
                return c.fail(STATUS_CODE.BadRequest, msg);
            }
        },
    );

    // 5. POST /api/ai/providers/:id/refresh - 重新从 /models 刷新同步可用模型
    routes.post(
        "/api/ai/providers/:id/refresh",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            const isAdmin = user.role === "admin";
            const providerId = data.id;
            try {
                const models = await service.refreshProviderModels(
                    user.id,
                    providerId,
                    isAdmin,
                );
                return c.success(models, "模型列表刷新成功");
            } catch (err: unknown) {
                if (err instanceof AiServiceError) {
                    return c.fail(
                        err.statusCode as 400 | 403 | 404,
                        err.message,
                    );
                }
                const msg = err instanceof Error ? err.message : String(err);
                return c.fail(STATUS_CODE.BadRequest, msg);
            }
        },
    );

    // 6. GET /api/ai/models - 查询当前可用模型列表
    routes.get("/api/ai/models", async (c) => {
        const user = c.get("user");
        const isAdmin = user.role === "admin";
        const providerId = c.req.query("providerId");
        const models = await service.listModels(user.id, providerId, isAdmin);
        return c.success(models);
    });

    // 7. PATCH /api/ai/models/:id - 更新模型设置（可见性、是否默认、显示名）
    routes.patch(
        "/api/ai/models/:id",
        validator({
            id: param(IdParamSchema),
            displayName: json(UpdateModelSchema.entries.displayName),
            enabled: json(UpdateModelSchema.entries.enabled),
            visibleToUsers: json(UpdateModelSchema.entries.visibleToUsers),
            isDefault: json(UpdateModelSchema.entries.isDefault),
        }),
        async (c, data) => {
            const user = c.get("user");
            const isAdmin = user.role === "admin";
            const modelPk = data.id;
            const body: UpdateModelInput = {
                displayName: data.displayName,
                enabled: data.enabled,
                visibleToUsers: data.visibleToUsers,
                isDefault: data.isDefault,
            };
            try {
                const updated = await service.updateModel(
                    user.id,
                    modelPk,
                    body,
                    isAdmin,
                );
                return c.success(updated, "模型配置更新成功");
            } catch (err: unknown) {
                if (err instanceof AiServiceError) {
                    return c.fail(
                        err.statusCode as 400 | 403 | 404,
                        err.message,
                    );
                }
                const msg = err instanceof Error ? err.message : String(err);
                return c.fail(STATUS_CODE.BadRequest, msg);
            }
        },
    );

    // 8. GET /api/ai/conversations - 获取对话历史列表
    routes.get("/api/ai/conversations", async (c) => {
        const user = c.get("user");
        const conversations = await service.listConversations(user.id);
        return c.success(conversations);
    });

    // 9. GET /api/ai/conversations/:id - 获取指定对话详情与所有消息
    routes.get(
        "/api/ai/conversations/:id",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            const conversationId = data.id;
            try {
                const details = await service.getConversation(
                    user.id,
                    conversationId,
                );
                return c.success(details);
            } catch (err: unknown) {
                if (err instanceof AiServiceError) {
                    return c.fail(
                        err.statusCode as 400 | 403 | 404,
                        err.message,
                    );
                }
                const msg = err instanceof Error ? err.message : String(err);
                return c.fail(STATUS_CODE.NotFound, msg);
            }
        },
    );

    // 10. PATCH /api/ai/conversations/:id - 重命名对话
    routes.patch(
        "/api/ai/conversations/:id",
        validator({
            id: param(IdParamSchema),
            title: json(RenameConversationSchema.entries.title),
        }),
        async (c, data) => {
            const user = c.get("user");
            const conversationId = data.id;
            const title = data.title;
            try {
                const updated = await service.renameConversation(
                    user.id,
                    conversationId,
                    title,
                );
                return c.success(updated, "对话重命名成功");
            } catch (err: unknown) {
                if (err instanceof AiServiceError) {
                    return c.fail(
                        err.statusCode as 400 | 403 | 404,
                        err.message,
                    );
                }
                const msg = err instanceof Error ? err.message : String(err);
                return c.fail(STATUS_CODE.BadRequest, msg);
            }
        },
    );

    // 11. DELETE /api/ai/conversations/:id - 逻辑删除对话
    routes.delete(
        "/api/ai/conversations/:id",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            const conversationId = data.id;
            try {
                await service.deleteConversation(user.id, conversationId);
                return c.success(null, "对话已删除");
            } catch (err: unknown) {
                if (err instanceof AiServiceError) {
                    return c.fail(
                        err.statusCode as 400 | 403 | 404,
                        err.message,
                    );
                }
                const msg = err instanceof Error ? err.message : String(err);
                return c.fail(STATUS_CODE.BadRequest, msg);
            }
        },
    );

    // 11.5. POST /api/ai/conversations/:id/restore - 恢复对话 (Short Undo)
    routes.post(
        "/api/ai/conversations/:id/restore",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            const conversationId = data.id;
            try {
                const restored = await service.restoreConversation(
                    user.id,
                    conversationId,
                );
                return c.success(restored, "对话已恢复");
            } catch (err: unknown) {
                if (err instanceof AiServiceError) {
                    return c.fail(
                        err.statusCode as 400 | 403 | 404,
                        err.message,
                    );
                }
                const msg = err instanceof Error ? err.message : String(err);
                return c.fail(STATUS_CODE.BadRequest, msg);
            }
        },
    );

    // 11.6. DELETE /api/ai/conversations/:id/temporary - 彻底销毁 history-off 临时会话及消息（新建/关闭时触发）
    routes.delete(
        "/api/ai/conversations/:id/temporary",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            const conversationId = data.id;
            try {
                await service.purgeTemporaryConversation(
                    user.id,
                    conversationId,
                );
                return c.success(null, "临时会话已销毁");
            } catch (err: unknown) {
                if (err instanceof AiServiceError) {
                    return c.fail(
                        err.statusCode as 400 | 403 | 404,
                        err.message,
                    );
                }
                const msg = err instanceof Error ? err.message : String(err);
                return c.fail(STATUS_CODE.BadRequest, msg);
            }
        },
    );

    // 12. POST /api/ai/chat/stream - 核心流式对话 (SSE)
    routes.post(
        "/api/ai/chat/stream",
        validator({
            conversationId: json(ChatStreamSchema.entries.conversationId),
            providerId: json(ChatStreamSchema.entries.providerId),
            modelId: json(ChatStreamSchema.entries.modelId),
            message: json(ChatStreamSchema.entries.message),
            regenerateMessageId: json(
                ChatStreamSchema.entries.regenerateMessageId,
            ),
            historyEnabled: json(ChatStreamSchema.entries.historyEnabled),
            temperature: json(ChatStreamSchema.entries.temperature),
            topP: json(ChatStreamSchema.entries.topP),
            maxTokens: json(ChatStreamSchema.entries.maxTokens),
        }),
        async (c, data) => {
            const user = c.get("user");
            const body: ChatStreamRequest = data;

            // 检查是否有可用模型或指定模型是否有效
            try {
                await service.resolveTargetModel(
                    user.id,
                    body.providerId,
                    body.modelId,
                );
            } catch (err: unknown) {
                if (err instanceof AiServiceError) {
                    return c.fail(
                        err.statusCode as 400 | 403 | 404,
                        err.message,
                    );
                }
                const msg = err instanceof Error ? err.message : String(err);
                return c.fail(STATUS_CODE.BadRequest, msg);
            }

            const abortController = new AbortController();
            c.req.raw.signal.addEventListener("abort", () => {
                abortController.abort();
            });

            const stream = service.streamChat(
                user.id,
                body,
                abortController.signal,
            );

            const textEncoder = new TextEncoder();
            const readable = new ReadableStream({
                async start(controller) {
                    try {
                        for await (const chunk of stream) {
                            const eventStr = `event: ${chunk.event}\ndata: ${
                                JSON.stringify(chunk.data)
                            }\n\n`;
                            controller.enqueue(textEncoder.encode(eventStr));
                        }
                    } catch (err: unknown) {
                        const errMsg = err instanceof Error
                            ? err.message
                            : String(err);
                        const errPayload = `event: error\ndata: ${
                            JSON.stringify(errMsg)
                        }\n\n`;
                        controller.enqueue(textEncoder.encode(errPayload));
                    } finally {
                        controller.close();
                    }
                },
                cancel() {
                    abortController.abort();
                },
            });

            return new Response(readable, {
                headers: {
                    "Content-Type": "text/event-stream; charset=utf-8",
                    "Cache-Control": "no-cache, no-transform",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                },
            });
        },
    );

    routes.post(
        "/api/ai/logo-candidates",
        validator({
            providerId: json(LogoSchema.providerId),
            modelId: json(LogoSchema.modelId),
            siteName: json(LogoSchema.siteName),
            style: json(LogoSchema.style),
        }),
        async (c, data) => {
            try {
                const images = await service.generateLogo(
                    c.get("user").id,
                    data.providerId,
                    data.modelId,
                    data.siteName,
                    data.style,
                );
                return c.success({ images });
            } catch (err) {
                if (err instanceof AiServiceError) {return c.fail(
                        err.statusCode as 400 | 403 | 404,
                        err.message,
                    );}
                if (err instanceof OpenAIClientError) {return c.fail(
                        400,
                        err.message,
                    );}
                throw err;
            }
        },
    );
}
