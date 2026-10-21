import { STATUS_CODE } from "@std/http";
import { eq } from "drizzle-orm";
import { json, param, validator } from "@internal/validator/hono.ts";
import type { Routes } from "@internal/hono/routes.ts";
import * as v from "@valibot/valibot";
import type { AppDeps, AppEnv } from "../../serve/env.ts";
import { aiBlobs } from "../../db/ai-schema.ts";
import { AiService, AiServiceError } from "./service.ts";
import { OpenAIClientError } from "./client.ts";
import {
    AttachmentValidationError,
    validateAttachments,
} from "./attachments.ts";
import { getAiCapabilities } from "./tools.ts";
import {
    getTransportSupportedLevels,
    isStrictReasoningModel,
    parseModelMetadata,
    resolveEffectiveCapability,
    resolveReasoningTransport,
} from "./model-capabilities.ts";
import {
    buildProviderGenerationParams,
    ReasoningValidationError,
    resolveEffectiveReasoningEffort,
    validateReasoningEffort,
} from "./reasoning.ts";
import { IMAGE_PROTOCOLS, LOGO_STYLES } from "./types.ts";
import type {
    ChatStreamRequest,
    CreateProviderInput,
    DiscoveryMode,
    ReasoningOverride,
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
const DiscoveryModeSchema = v.optional(
    v.picklist(["auto", "openai-compatible", "cliproxyapi"]),
);

const CreateProviderSchema = v.object({
    name: ProviderNameSchema,
    baseUrl: BaseUrlSchema,
    apiKey: ApiKeySchema,
    scope: ScopeSchema,
    discoveryMode: DiscoveryModeSchema,
    enabled: BooleanSchema,
});

const UpdateProviderSchema = v.object({
    name: v.optional(ProviderNameSchema),
    baseUrl: v.optional(BaseUrlSchema),
    apiKey: v.optional(ApiKeySchema),
    discoveryMode: DiscoveryModeSchema,
    enabled: BooleanSchema,
});

const UpdateModelSchema = v.object({
    displayName: v.optional(
        v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
    ),
    enabled: BooleanSchema,
    visibleToUsers: BooleanSchema,
    isDefault: BooleanSchema,
    reasoningOverride: v.optional(v.nullable(v.unknown())),
    metadataJson: v.optional(v.nullable(v.string())),
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

const AttachmentInputSchema = v.object({
    id: v.string(),
    name: v.string(),
    type: v.picklist(["image", "text"]),
    mimeType: v.string(),
    data: v.string(),
    size: v.optional(v.number()),
});

const ToolsConfigSchema = v.object({
    notes: v.optional(v.boolean()),
    documents: v.optional(v.boolean()),
    apps: v.optional(v.boolean()),
    webSearch: v.optional(v.boolean()),
});

const ChatStreamSchema = v.object({
    conversationId: v.optional(v.string()),
    providerId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    message: v.optional(v.pipe(v.string(), v.trim()), ""),
    parentMessageId: v.optional(v.string()),
    editMessageId: v.optional(v.string()),
    regenerateMessageId: v.optional(v.string()),
    historyEnabled: v.optional(v.boolean()),
    systemInstruction: v.optional(v.string()),
    attachments: v.optional(v.array(AttachmentInputSchema)),
    tools: v.optional(ToolsConfigSchema),
    reasoningEffort: v.optional(v.picklist([
        "none",
        "auto",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
    ])),
    temperature: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(2))),
    topP: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
    maxTokens: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});

const LogoSchema = {
    providerId: v.pipe(v.string(), v.minLength(1)),
    modelId: v.pipe(v.string(), v.minLength(1)),
    siteName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
    siteDomain: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(253))),
    description: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(300))),
    style: v.picklist(LOGO_STYLES),
    imageProtocol: v.optional(v.picklist(IMAGE_PROTOCOLS), "openai"),
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
            discoveryMode: json(CreateProviderSchema.entries.discoveryMode),
            enabled: json(CreateProviderSchema.entries.enabled),
        }),
        async (c, data) => {
            const user = c.get("user");
            const isAdmin = user.role === "admin";
            const body: CreateProviderInput = {
                name: data.name,
                baseUrl: data.baseUrl,
                apiKey: data.apiKey,
                scope: data.scope,
                discoveryMode: data.discoveryMode as DiscoveryMode | undefined,
                enabled: data.enabled,
            };

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
            discoveryMode: json(UpdateProviderSchema.entries.discoveryMode),
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
                discoveryMode: data.discoveryMode as DiscoveryMode | undefined,
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
            reasoningOverride: json(
                UpdateModelSchema.entries.reasoningOverride,
            ),
            metadataJson: json(UpdateModelSchema.entries.metadataJson),
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
                reasoningOverride: data.reasoningOverride as
                    | ReasoningOverride
                    | null
                    | undefined,
                metadataJson: data.metadataJson,
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
    // 10. PATCH /api/ai/conversations/:id - 更新对话设置（标题/分支/历史开关/系统指令）
    routes.patch(
        "/api/ai/conversations/:id",
        validator({
            id: param(IdParamSchema),
            title: json(v.optional(RenameConversationSchema.entries.title)),
            historyEnabled: json(v.optional(v.boolean())),
            activeLeafMessageId: json(v.optional(v.nullable(v.string()))),
            systemInstruction: json(v.optional(v.nullable(v.string()))),
        }),
        async (c, data) => {
            const user = c.get("user");
            const conversationId = data.id;
            try {
                const updated = await service.updateConversation(
                    user.id,
                    conversationId,
                    {
                        title: data.title,
                        historyEnabled: data.historyEnabled,
                        activeLeafMessageId: data.activeLeafMessageId,
                        systemInstruction: data.systemInstruction,
                    },
                );
                return c.success(updated, "对话设置更新成功");
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

    // 11.6. GET /api/ai/conversations/:id/search - 会话内消息搜索
    routes.get(
        "/api/ai/conversations/:id/search",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            const q = c.req.query("query") ?? "";
            try {
                const results = await service.searchConversationMessages(
                    user.id,
                    data.id,
                    q,
                );
                return c.success(results);
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

    // 11.7. GET /api/ai/conversations/:id/export - 会话导出 (Markdown / JSON)
    routes.get(
        "/api/ai/conversations/:id/export",
        validator({
            id: param(IdParamSchema),
        }),
        async (c, data) => {
            const user = c.get("user");
            const format = c.req.query("format") === "json"
                ? "json"
                : "markdown";
            try {
                const exp = await service.exportConversation(
                    user.id,
                    data.id,
                    format,
                );
                return new Response(exp.content, {
                    headers: {
                        "Content-Type": exp.mimeType,
                        "Content-Disposition":
                            `attachment; filename="${exp.filename}"`,
                    },
                });
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

    // 11.8. GET /api/ai/capabilities - 获取 AI 运行时能力与工具配置
    routes.get("/api/ai/capabilities", (c) => {
        return c.success(getAiCapabilities());
    });

    // 11.9. GET /api/ai/blobs/:id - 获取持久化附件
    routes.get(
        "/api/ai/blobs/:id",
        validator({ id: param(IdParamSchema) }),
        async (c, data) => {
            const user = c.get("user");
            const blobId = data.id;
            const blob = await deps.store.run(async (db) => {
                const [row] = await db
                    .select()
                    .from(aiBlobs)
                    .where(eq(aiBlobs.id, blobId))
                    .limit(1)
                    .all();
                return row;
            });
            if (!blob) {
                return c.fail(404, "附件不存在");
            }
            if (blob.userId !== user.id && user.role !== "admin") {
                return c.fail(403, "无权访问此附件");
            }
            const commaIndex = blob.data.indexOf(",");
            const base64Str = commaIndex >= 0
                ? blob.data.slice(commaIndex + 1)
                : blob.data;
            const bin = atob(base64Str);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) {
                bytes[i] = bin.charCodeAt(i);
            }
            return new Response(bytes, {
                headers: {
                    "Content-Type": blob.mimeType,
                    "Cache-Control": "no-store",
                },
            });
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
            parentMessageId: json(ChatStreamSchema.entries.parentMessageId),
            editMessageId: json(ChatStreamSchema.entries.editMessageId),
            regenerateMessageId: json(
                ChatStreamSchema.entries.regenerateMessageId,
            ),
            historyEnabled: json(ChatStreamSchema.entries.historyEnabled),
            systemInstruction: json(ChatStreamSchema.entries.systemInstruction),
            attachments: json(ChatStreamSchema.entries.attachments),
            tools: json(ChatStreamSchema.entries.tools),
            reasoningEffort: json(ChatStreamSchema.entries.reasoningEffort),
            temperature: json(ChatStreamSchema.entries.temperature),
            topP: json(ChatStreamSchema.entries.topP),
            maxTokens: json(ChatStreamSchema.entries.maxTokens),
        }),
        async (c, data) => {
            const user = c.get("user");
            const body: ChatStreamRequest = data;

            // 检查是否有可用模型并校验推理与附件参数 (零数据库副作用拒绝非法请求)
            try {
                const { model } = await service.resolveTargetModel(
                    user.id,
                    body.providerId,
                    body.modelId,
                );
                if (body.attachments && body.attachments.length > 0) {
                    validateAttachments(body.attachments);
                    const hasImages = body.attachments.some(
                        (a) =>
                            a.type === "image" ||
                            a.mimeType.toLowerCase().startsWith("image/"),
                    );
                    if (hasImages && !model.supportsVision) {
                        return c.fail(
                            STATUS_CODE.BadRequest,
                            "当前模型不支持图片多模态分析",
                        );
                    }
                }
                const capability = resolveEffectiveCapability(
                    model.metadataJson,
                    model.modelId,
                );
                const transport = resolveReasoningTransport(model.metadataJson);
                const metadata = parseModelMetadata(model.metadataJson);
                const isReasoningStrict = isStrictReasoningModel(
                    model.modelId,
                    metadata,
                );

                validateReasoningEffort(
                    body.reasoningEffort,
                    capability,
                    model.modelId,
                );
                const supportedLevels = getTransportSupportedLevels(
                    transport,
                    capability,
                );
                if (
                    body.reasoningEffort !== undefined &&
                    !supportedLevels.includes(body.reasoningEffort)
                ) {
                    throw new ReasoningValidationError(
                        `传输适配器 "${transport.type}" 无法映射指定的推理强度 "${body.reasoningEffort}"`,
                    );
                }
                const effectiveEffort = resolveEffectiveReasoningEffort({
                    explicitEffort: body.reasoningEffort,
                    capability,
                    transport,
                    modelId: model.modelId,
                });
                buildProviderGenerationParams(
                    {
                        reasoningEffort: effectiveEffort,
                        temperature: body.temperature,
                        topP: body.topP,
                        maxTokens: body.maxTokens,
                    },
                    capability,
                    transport,
                    { isReasoningStrict },
                );
            } catch (err: unknown) {
                if (err instanceof AiServiceError) {
                    return c.fail(
                        err.statusCode as 400 | 403 | 404,
                        err.message,
                    );
                }
                if (
                    err instanceof ReasoningValidationError ||
                    err instanceof AttachmentValidationError
                ) {
                    return c.fail(STATUS_CODE.BadRequest, err.message);
                }
                const msg = err instanceof Error ? err.message : String(err);
                return c.fail(STATUS_CODE.BadRequest, msg);
            }

            const abortController = new AbortController();

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
                            // Drain the service so interrupted output is persisted,
                            // but never write to a cancelled response stream.
                            if (abortController.signal.aborted) continue;
                            const eventStr = `event: ${chunk.event}\ndata: ${
                                JSON.stringify(chunk.data)
                            }\n\n`;
                            controller.enqueue(textEncoder.encode(eventStr));
                        }
                    } catch (err: unknown) {
                        if (abortController.signal.aborted) return;
                        const errMsg = err instanceof Error
                            ? err.message
                            : String(err);
                        const errPayload = `event: error\ndata: ${
                            JSON.stringify(errMsg)
                        }\n\n`;
                        controller.enqueue(textEncoder.encode(errPayload));
                    } finally {
                        if (!abortController.signal.aborted) controller.close();
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
            siteDomain: json(LogoSchema.siteDomain),
            description: json(LogoSchema.description),
            style: json(LogoSchema.style),
            imageProtocol: json(LogoSchema.imageProtocol),
        }),
        async (c, data) => {
            try {
                const images = await service.generateLogo(
                    c.get("user").id,
                    data.providerId,
                    data.modelId,
                    data.siteName,
                    data.siteDomain,
                    data.description,
                    data.style,
                    data.imageProtocol,
                );
                return c.success({ images });
            } catch (err) {
                if (err instanceof AiServiceError) {
                    return c.fail(
                        err.statusCode as 400 | 403 | 404,
                        err.message,
                    );
                }
                if (err instanceof OpenAIClientError) {
                    return c.fail(
                        400,
                        err.message,
                    );
                }
                throw err;
            }
        },
    );
}
