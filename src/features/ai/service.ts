import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { DatabaseStore, SearchDatabase } from "../../db/database.ts";
import {
    aiConversations,
    aiMessages,
    aiModels,
    aiProviders,
} from "../../db/ai-schema.ts";
import { auditLogs } from "../../db/schema.ts";
import { decryptApiKey, encryptApiKey, maskApiKey } from "./crypto.ts";
import { fetchOpenAIModels, streamOpenAIChat } from "./client.ts";
import { generateLogoCandidates } from "./images.ts";
import type {
    AiConversationDto,
    AiMessageDto,
    AiModelDto,
    AiProviderDto,
    ChatStreamRequest,
    CreateProviderInput,
    ImageProtocol,
    LogoStyle,
    ProviderScope,
    UpdateModelInput,
    UpdateProviderInput,
} from "./types.ts";

export class AiServiceError extends Error {
    readonly statusCode: number;

    constructor(message: string, statusCode = 400) {
        super(message);
        this.name = "AiServiceError";
        this.statusCode = statusCode;
    }
}

export interface AiServiceDeps {
    store: DatabaseStore;
    now?: () => number;
    encryptionKey?: string;
    fetchFn?: typeof fetch;
}

export class AiService {
    readonly #store: DatabaseStore;
    readonly #now: () => number;
    readonly #encryptionKey?: string;
    readonly #fetchFn: typeof fetch;

    constructor(deps: AiServiceDeps) {
        this.#store = deps.store;
        this.#now = deps.now ?? (() => Date.now());
        this.#encryptionKey = deps.encryptionKey;
        this.#fetchFn = deps.fetchFn ?? fetch;
    }
    async #audit(
        db: SearchDatabase,
        actorUserId: string,
        action: string,
        targetId: string,
    ) {
        await db.insert(auditLogs).values({
            id: crypto.randomUUID(),
            actorUserId,
            action,
            targetType: "ai_provider",
            targetId,
            metadataJson: null,
            createdAt: this.#now(),
        }).run();
    }

    // --- Provider 管理 ---

    async listProviders(
        userId: string,
        isAdmin = false,
    ): Promise<AiProviderDto[]> {
        return await this.#store.run(async (db: SearchDatabase) => {
            const rows = await db
                .select()
                .from(aiProviders)
                .where(
                    isAdmin
                        ? or(
                            eq(aiProviders.scope, "system"),
                            eq(aiProviders.ownerUserId, userId),
                        )
                        : or(
                            eq(aiProviders.scope, "system"),
                            eq(aiProviders.ownerUserId, userId),
                        ),
                )
                .all();

            return rows.map((r) => ({
                id: r.id,
                ownerUserId: r.ownerUserId,
                scope: r.scope as ProviderScope,
                name: r.name,
                baseUrl: r.baseUrl,
                apiKeyMasked: "********",
                enabled: r.enabled,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
            }));
        });
    }

    async createProvider(
        userId: string,
        input: CreateProviderInput,
        isAdmin = false,
    ): Promise<AiProviderDto> {
        const scope: ProviderScope = input.scope ??
            (isAdmin ? "system" : "user");
        if (scope === "system" && !isAdmin) {
            throw new AiServiceError(
                "只有管理员可以创建系统级 AI Provider",
                403,
            );
        }

        const trimmedApiKey = input.apiKey?.trim();
        if (!trimmedApiKey) {
            throw new AiServiceError("API Key 不能为空", 400);
        }

        // 1. 验证 /models，必须获取成功才能配置
        const discovered = await fetchOpenAIModels(
            input.baseUrl,
            trimmedApiKey,
            this.#fetchFn,
        );
        if (discovered.length === 0) {
            throw new AiServiceError(
                "未能从 Provider 的 /models 获取到可用模型，Provider 不可用",
                400,
            );
        }

        // 2. 加密存储 API Key
        const encrypted = await encryptApiKey(
            trimmedApiKey,
            this.#encryptionKey,
        );
        const now = this.#now();
        const providerId = crypto.randomUUID();

        return await this.#store.run(async (db: SearchDatabase) => {
            await db.insert(aiProviders).values({
                id: providerId,
                ownerUserId: scope === "system" ? null : userId,
                scope,
                name: input.name.trim(),
                baseUrl: input.baseUrl.trim(),
                encryptedApiKey: encrypted,
                enabled: input.enabled ?? true,
                createdAt: now,
                updatedAt: now,
            }).run();

            // 批量将发现的模型插入 ai_models
            for (let i = 0; i < discovered.length; i++) {
                const model = discovered[i];
                await db.insert(aiModels).values({
                    id: crypto.randomUUID(),
                    providerId,
                    modelId: model.id,
                    displayName: model.displayName ?? model.id,
                    enabled: true,
                    visibleToUsers: true,
                    isDefault: i === 0, // 默认第一个为 provider 默认模型
                    supportsText: model.supportsText ?? true,
                    supportsVision: model.supportsVision ?? false,
                    supportsTools: model.supportsTools ?? false,
                    supportsStreaming: model.supportsStreaming ?? true,
                    metadataJson: null,
                    updatedAt: now,
                }).run();
            }
            await this.#audit(db, userId, "ai.provider.create", providerId);

            return {
                id: providerId,
                ownerUserId: scope === "system" ? null : userId,
                scope,
                name: input.name.trim(),
                baseUrl: input.baseUrl.trim(),
                apiKeyMasked: maskApiKey(trimmedApiKey),
                enabled: input.enabled ?? true,
                createdAt: now,
                updatedAt: now,
            };
        });
    }

    async updateProvider(
        userId: string,
        providerId: string,
        input: UpdateProviderInput,
        isAdmin = false,
    ): Promise<AiProviderDto> {
        const existing = await this.#store.run(async (db) => {
            const [row] = await db.select().from(aiProviders)
                .where(eq(aiProviders.id, providerId)).limit(1).all();
            if (!row) throw new AiServiceError("Provider 不存在", 404);
            if (row.scope === "system" && !isAdmin) {
                throw new AiServiceError("无权修改系统级 Provider", 403);
            }
            if (
                row.scope === "user" && row.ownerUserId !== userId && !isAdmin
            ) {
                throw new AiServiceError("无权修改该 Provider", 403);
            }
            return row;
        });
        const baseUrl = input.baseUrl?.trim() ?? existing.baseUrl;
        let encryptedApiKey = existing.encryptedApiKey;
        let discovered: Awaited<ReturnType<typeof fetchOpenAIModels>> = [];
        if (input.apiKey !== undefined || input.baseUrl !== undefined) {
            const effectiveKey = input.apiKey?.trim() ||
                await decryptApiKey(
                    existing.encryptedApiKey,
                    this.#encryptionKey,
                );
            discovered = await fetchOpenAIModels(
                baseUrl,
                effectiveKey,
                this.#fetchFn,
            );
            if (discovered.length === 0) {
                throw new AiServiceError(
                    "更新后未能获取到可用模型，Provider 不可用",
                    400,
                );
            }
            if (input.apiKey !== undefined) {
                encryptedApiKey = await encryptApiKey(
                    effectiveKey,
                    this.#encryptionKey,
                );
            }
        }
        return await this.#store.run(async (db) => {
            const [current] = await db.select().from(aiProviders)
                .where(eq(aiProviders.id, providerId)).limit(1).all();
            if (!current || current.updatedAt !== existing.updatedAt) {
                throw new AiServiceError(
                    "Provider 已被其他操作修改，请重试",
                    409,
                );
            }
            const now = this.#now();
            if (discovered.length) {
                const models = await db.select().from(aiModels)
                    .where(eq(aiModels.providerId, providerId)).all();
                const known = new Set(models.map((model) => model.modelId));
                for (const model of discovered) {
                    if (known.has(model.id)) continue;
                    await db.insert(aiModels).values({
                        id: crypto.randomUUID(),
                        providerId,
                        modelId: model.id,
                        displayName: model.displayName ?? model.id,
                        enabled: true,
                        visibleToUsers: true,
                        isDefault: false,
                        supportsText: model.supportsText ?? true,
                        supportsVision: model.supportsVision ?? false,
                        supportsTools: model.supportsTools ?? false,
                        supportsStreaming: model.supportsStreaming ?? true,
                        metadataJson: null,
                        updatedAt: now,
                    }).run();
                }
            }
            const name = input.name?.trim() ?? current.name;
            const enabled = input.enabled ?? current.enabled;
            await db.update(aiProviders).set({
                name,
                baseUrl,
                encryptedApiKey,
                enabled,
                updatedAt: now,
            }).where(eq(aiProviders.id, providerId)).run();
            await this.#audit(db, userId, "ai.provider.update", providerId);
            return {
                id: current.id,
                ownerUserId: current.ownerUserId,
                scope: current.scope as ProviderScope,
                name,
                baseUrl,
                apiKeyMasked: "********",
                enabled,
                createdAt: current.createdAt,
                updatedAt: now,
            };
        });
    }

    async deleteProvider(
        userId: string,
        providerId: string,
        isAdmin = false,
    ): Promise<void> {
        await this.#store.run(async (db: SearchDatabase) => {
            const [existing] = await db
                .select()
                .from(aiProviders)
                .where(eq(aiProviders.id, providerId))
                .limit(1)
                .all();

            if (!existing) {
                throw new AiServiceError("Provider 不存在", 404);
            }

            if (existing.scope === "system" && !isAdmin) {
                throw new AiServiceError("无权删除系统级 Provider", 403);
            }
            if (
                existing.scope === "user" && existing.ownerUserId !== userId &&
                !isAdmin
            ) {
                throw new AiServiceError("无权删除该 Provider", 403);
            }

            await db.delete(aiProviders).where(eq(aiProviders.id, providerId))
                .run();
            await this.#audit(db, userId, "ai.provider.delete", providerId);
        });
    }

    async refreshProviderModels(
        userId: string,
        providerId: string,
        isAdmin = false,
    ): Promise<AiModelDto[]> {
        const existing = await this.#store.run(async (db) => {
            const [row] = await db.select().from(aiProviders)
                .where(eq(aiProviders.id, providerId)).limit(1).all();
            if (!row) throw new AiServiceError("Provider 不存在", 404);
            if (row.scope === "system" && !isAdmin) {
                throw new AiServiceError("无权操作系统级 Provider", 403);
            }
            if (
                row.scope === "user" && row.ownerUserId !== userId && !isAdmin
            ) {
                throw new AiServiceError("无权操作该 Provider", 403);
            }
            return row;
        });
        const apiKey = await decryptApiKey(
            existing.encryptedApiKey,
            this.#encryptionKey,
        );
        const discovered = await fetchOpenAIModels(
            existing.baseUrl,
            apiKey,
            this.#fetchFn,
        );
        await this.#store.run(async (db) => {
            const [current] = await db.select().from(aiProviders)
                .where(eq(aiProviders.id, providerId)).limit(1).all();
            if (!current || current.updatedAt !== existing.updatedAt) {
                throw new AiServiceError(
                    "Provider 已被其他操作修改，请重试",
                    409,
                );
            }
            const models = await db.select().from(aiModels)
                .where(eq(aiModels.providerId, providerId)).all();
            const known = new Set(models.map((model) => model.modelId));
            const now = this.#now();
            for (const model of discovered) {
                if (known.has(model.id)) continue;
                await db.insert(aiModels).values({
                    id: crypto.randomUUID(),
                    providerId,
                    modelId: model.id,
                    displayName: model.displayName ?? model.id,
                    enabled: true,
                    visibleToUsers: true,
                    isDefault: false,
                    supportsText: model.supportsText ?? true,
                    supportsVision: model.supportsVision ?? false,
                    supportsTools: model.supportsTools ?? false,
                    supportsStreaming: model.supportsStreaming ?? true,
                    metadataJson: null,
                    updatedAt: now,
                }).run();
            }
            await this.#audit(db, userId, "ai.provider.refresh", providerId);
        });
        return await this.listModels(userId, providerId, isAdmin);
    }
    // --- Model 管理 ---

    async listModels(
        userId: string,
        providerId?: string,
        isAdmin = false,
    ): Promise<AiModelDto[]> {
        return await this.#store.run(async (db: SearchDatabase) => {
            // 获取当前用户可访问的 Provider 列表
            const providers = await db
                .select()
                .from(aiProviders)
                .where(
                    or(
                        eq(aiProviders.scope, "system"),
                        eq(aiProviders.ownerUserId, userId),
                    ),
                )
                .all();

            const providerMap = new Map(providers.map((p) => [p.id, p]));
            const providerIds = Array.from(providerMap.keys());
            if (providerIds.length === 0) return [];

            const query = db.select().from(aiModels);
            if (providerId) {
                if (!providerMap.has(providerId)) {
                    return [];
                }
                const rows = await query.where(
                    eq(aiModels.providerId, providerId),
                ).all();
                return this.#filterModels(rows, isAdmin);
            }

            const allRows = await query.all();
            const validRows = allRows.filter((r) =>
                providerMap.has(r.providerId)
            );
            return this.#filterModels(validRows, isAdmin);
        });
    }

    #filterModels(
        rows: typeof aiModels.$inferSelect[],
        isAdmin: boolean,
    ): AiModelDto[] {
        return rows
            .filter((r) => {
                if (isAdmin) return true;
                return r.enabled && r.visibleToUsers;
            })
            .map((r) => ({
                id: r.id,
                providerId: r.providerId,
                modelId: r.modelId,
                displayName: r.displayName,
                enabled: r.enabled,
                visibleToUsers: r.visibleToUsers,
                isDefault: r.isDefault,
                supportsText: r.supportsText,
                supportsVision: r.supportsVision,
                supportsTools: r.supportsTools,
                supportsStreaming: r.supportsStreaming,
                metadataJson: r.metadataJson,
                updatedAt: r.updatedAt,
            }));
    }

    async updateModel(
        userId: string,
        modelPk: string,
        input: UpdateModelInput,
        isAdmin = false,
    ): Promise<AiModelDto> {
        return await this.#store.run(async (db: SearchDatabase) => {
            const [model] = await db
                .select()
                .from(aiModels)
                .where(eq(aiModels.id, modelPk))
                .limit(1)
                .all();

            if (!model) {
                throw new AiServiceError("模型配置不存在", 404);
            }

            const [provider] = await db
                .select()
                .from(aiProviders)
                .where(eq(aiProviders.id, model.providerId))
                .limit(1)
                .all();

            if (!provider) {
                throw new AiServiceError("Provider 不存在", 404);
            }

            if (provider.scope === "system" && !isAdmin) {
                throw new AiServiceError("普通用户无权修改系统模型的配置", 403);
            }
            if (
                provider.scope === "user" && provider.ownerUserId !== userId &&
                !isAdmin
            ) {
                throw new AiServiceError("无权修改该模型配置", 403);
            }

            const now = this.#now();

            if (input.isDefault) {
                // 如果当前设为默认，取消该 Provider 其他模型的默认状态
                await db.update(aiModels)
                    .set({ isDefault: false, updatedAt: now })
                    .where(eq(aiModels.providerId, model.providerId))
                    .run();
            }

            await db.update(aiModels)
                .set({
                    displayName: input.displayName ?? model.displayName,
                    enabled: input.enabled ?? model.enabled,
                    visibleToUsers: input.visibleToUsers ??
                        model.visibleToUsers,
                    isDefault: input.isDefault ?? model.isDefault,
                    updatedAt: now,
                })
                .where(eq(aiModels.id, modelPk))
                .run();
            await this.#audit(db, userId, "ai.model.update", model.providerId);

            return {
                id: model.id,
                providerId: model.providerId,
                modelId: model.modelId,
                displayName: input.displayName ?? model.displayName,
                enabled: input.enabled ?? model.enabled,
                visibleToUsers: input.visibleToUsers ?? model.visibleToUsers,
                isDefault: input.isDefault ?? model.isDefault,
                supportsText: model.supportsText,
                supportsVision: model.supportsVision,
                supportsTools: model.supportsTools,
                supportsStreaming: model.supportsStreaming,
                metadataJson: model.metadataJson,
                updatedAt: now,
            };
        });
    }

    // --- Conversation & Messages 历史管理 ---

    async listConversations(userId: string): Promise<AiConversationDto[]> {
        return await this.#store.run(async (db: SearchDatabase) => {
            // 服务端短 TTL 清理兜底：清除超过 30 分钟未更新的临时会话与消息
            const cutoff = this.#now() - 30 * 60 * 1000;
            const expired = await db
                .select({ id: aiConversations.id })
                .from(aiConversations)
                .where(
                    and(
                        eq(aiConversations.historyEnabled, false),
                        sql`${aiConversations.updatedAt} < ${cutoff}`,
                    ),
                )
                .all();
            for (const { id } of expired) {
                await db.delete(aiMessages).where(
                    eq(aiMessages.conversationId, id),
                ).run();
                await db.delete(aiConversations).where(
                    eq(aiConversations.id, id),
                ).run();
            }

            const rows = await db
                .select()
                .from(aiConversations)
                .where(
                    and(
                        eq(aiConversations.userId, userId),
                        eq(aiConversations.historyEnabled, true),
                        isNull(aiConversations.deletedAt),
                    ),
                )
                .orderBy(desc(aiConversations.updatedAt))
                .all();

            return rows.map((r) => ({
                id: r.id,
                userId: r.userId,
                title: r.title,
                historyEnabled: r.historyEnabled,
                deletedAt: r.deletedAt,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
            }));
        });
    }

    async getConversation(
        userId: string,
        conversationId: string,
    ): Promise<{
        conversation: AiConversationDto;
        messages: AiMessageDto[];
    }> {
        return await this.#store.run(async (db: SearchDatabase) => {
            const [conv] = await db
                .select()
                .from(aiConversations)
                .where(
                    and(
                        eq(aiConversations.id, conversationId),
                        eq(aiConversations.userId, userId),
                        isNull(aiConversations.deletedAt),
                    ),
                )
                .limit(1)
                .all();

            if (!conv) {
                throw new AiServiceError("对话不存在或已删除", 404);
            }

            const msgs = await db
                .select()
                .from(aiMessages)
                .where(eq(aiMessages.conversationId, conversationId))
                .orderBy(aiMessages.createdAt)
                .all();

            return {
                conversation: {
                    id: conv.id,
                    userId: conv.userId,
                    title: conv.title,
                    historyEnabled: conv.historyEnabled,
                    deletedAt: conv.deletedAt,
                    createdAt: conv.createdAt,
                    updatedAt: conv.updatedAt,
                },
                messages: msgs.map((m) => ({
                    id: m.id,
                    conversationId: m.conversationId,
                    parentMessageId: m.parentMessageId,
                    role: m.role as AiMessageDto["role"],
                    content: m.content,
                    providerId: m.providerId,
                    modelId: m.modelId,
                    status: m.status as AiMessageDto["status"],
                    variantGroupId: m.variantGroupId,
                    inputTokens: m.inputTokens,
                    outputTokens: m.outputTokens,
                    createdAt: m.createdAt,
                })),
            };
        });
    }

    async renameConversation(
        userId: string,
        conversationId: string,
        title: string,
    ): Promise<AiConversationDto> {
        const trimmed = title.trim();
        if (!trimmed) {
            throw new AiServiceError("标题不能为空", 400);
        }

        return await this.#store.run(async (db: SearchDatabase) => {
            const [conv] = await db
                .select()
                .from(aiConversations)
                .where(
                    and(
                        eq(aiConversations.id, conversationId),
                        eq(aiConversations.userId, userId),
                        isNull(aiConversations.deletedAt),
                    ),
                )
                .limit(1)
                .all();

            if (!conv) {
                throw new AiServiceError("对话不存在", 404);
            }

            const now = this.#now();
            await db.update(aiConversations)
                .set({ title: trimmed, updatedAt: now })
                .where(eq(aiConversations.id, conversationId))
                .run();

            return {
                id: conv.id,
                userId: conv.userId,
                title: trimmed,
                historyEnabled: conv.historyEnabled,
                deletedAt: conv.deletedAt,
                createdAt: conv.createdAt,
                updatedAt: now,
            };
        });
    }

    async deleteConversation(
        userId: string,
        conversationId: string,
    ): Promise<void> {
        await this.#store.run(async (db: SearchDatabase) => {
            const [conv] = await db
                .select()
                .from(aiConversations)
                .where(
                    and(
                        eq(aiConversations.id, conversationId),
                        eq(aiConversations.userId, userId),
                    ),
                )
                .limit(1)
                .all();

            if (!conv) {
                throw new AiServiceError("对话不存在", 404);
            }

            const now = this.#now();
            // 逻辑删除
            await db.update(aiConversations)
                .set({ deletedAt: now, updatedAt: now })
                .where(eq(aiConversations.id, conversationId))
                .run();
        });
    }

    async restoreConversation(
        userId: string,
        conversationId: string,
    ): Promise<AiConversationDto> {
        return await this.#store.run(async (db: SearchDatabase) => {
            const [conv] = await db
                .select()
                .from(aiConversations)
                .where(
                    and(
                        eq(aiConversations.id, conversationId),
                        eq(aiConversations.userId, userId),
                    ),
                )
                .limit(1)
                .all();

            if (!conv) {
                throw new AiServiceError("对话不存在", 404);
            }

            const now = this.#now();
            await db.update(aiConversations)
                .set({ deletedAt: null, updatedAt: now })
                .where(eq(aiConversations.id, conversationId))
                .run();

            return {
                id: conv.id,
                userId: conv.userId,
                title: conv.title,
                historyEnabled: conv.historyEnabled,
                deletedAt: null,
                createdAt: conv.createdAt,
                updatedAt: now,
            };
        });
    }

    /**
     * 彻底清理/删除 historyEnabled=false 的临时会话及关联消息。
     * 在用户切换新对话、关闭/退出会话时调用。
     */
    async purgeTemporaryConversation(
        userId: string,
        conversationId: string,
    ): Promise<void> {
        await this.#store.run(async (db: SearchDatabase) => {
            const [conv] = await db
                .select()
                .from(aiConversations)
                .where(
                    and(
                        eq(aiConversations.id, conversationId),
                        eq(aiConversations.userId, userId),
                        eq(aiConversations.historyEnabled, false),
                    ),
                )
                .limit(1)
                .all();

            if (!conv) return;

            await db.delete(aiMessages)
                .where(eq(aiMessages.conversationId, conversationId))
                .run();

            await db.delete(aiConversations)
                .where(eq(aiConversations.id, conversationId))
                .run();
        });
    }

    /**
     * 服务端短 TTL 清理兜底：清除超过指定 TTL（默认 30 分钟）的 historyEnabled=false 临时会话及消息。
     * 防止客户端异常关闭/断网未触发显式关闭而残留历史。
     */
    async purgeExpiredTemporaryConversations(
        ttlMs: number = 30 * 60 * 1000,
    ): Promise<number> {
        return await this.#store.run(async (db: SearchDatabase) => {
            const cutoff = this.#now() - ttlMs;
            const expired = await db
                .select({ id: aiConversations.id })
                .from(aiConversations)
                .where(
                    and(
                        eq(aiConversations.historyEnabled, false),
                        sql`${aiConversations.updatedAt} < ${cutoff}`,
                    ),
                )
                .all();

            if (!expired.length) return 0;

            for (const { id } of expired) {
                await db.delete(aiMessages)
                    .where(eq(aiMessages.conversationId, id))
                    .run();
                await db.delete(aiConversations)
                    .where(eq(aiConversations.id, id))
                    .run();
            }

            return expired.length;
        });
    }

    // --- 核心流式对话 ---

    async resolveTargetModel(
        userId: string,
        requestedProviderId?: string,
        requestedModelId?: string,
    ): Promise<{
        provider: typeof aiProviders.$inferSelect;
        model: typeof aiModels.$inferSelect;
    }> {
        return await this.#store.run(async (db: SearchDatabase) => {
            if (requestedProviderId && requestedModelId) {
                const [provider] = await db
                    .select()
                    .from(aiProviders)
                    .where(
                        and(
                            eq(aiProviders.id, requestedProviderId),
                            eq(aiProviders.enabled, true),
                            or(
                                eq(aiProviders.scope, "system"),
                                eq(aiProviders.ownerUserId, userId),
                            ),
                        ),
                    )
                    .limit(1)
                    .all();

                if (!provider) {
                    throw new AiServiceError(
                        "指定的 AI Provider 不存在或已被禁用",
                        404,
                    );
                }

                const [model] = await db
                    .select()
                    .from(aiModels)
                    .where(
                        and(
                            eq(aiModels.providerId, requestedProviderId),
                            eq(aiModels.modelId, requestedModelId),
                            eq(aiModels.enabled, true),
                            eq(aiModels.visibleToUsers, true),
                        ),
                    )
                    .limit(1)
                    .all();

                if (!model) {
                    throw new AiServiceError(
                        `模型 ${requestedModelId} 不可用或未对用户开放`,
                        404,
                    );
                }

                return { provider, model };
            }

            // 自动解析默认模型：
            // 1. 用户 Provider 的 default model
            // 2. 系统 Provider 的 default model
            // 3. 第一个可用模型
            const userProviders = await db
                .select()
                .from(aiProviders)
                .where(
                    and(
                        eq(aiProviders.ownerUserId, userId),
                        eq(aiProviders.enabled, true),
                    ),
                )
                .all();

            for (const p of userProviders) {
                const [defModel] = await db
                    .select()
                    .from(aiModels)
                    .where(
                        and(
                            eq(aiModels.providerId, p.id),
                            eq(aiModels.enabled, true),
                            eq(aiModels.visibleToUsers, true),
                            eq(aiModels.isDefault, true),
                        ),
                    )
                    .limit(1)
                    .all();
                if (defModel) return { provider: p, model: defModel };
            }

            const sysProviders = await db
                .select()
                .from(aiProviders)
                .where(
                    and(
                        eq(aiProviders.scope, "system"),
                        eq(aiProviders.enabled, true),
                    ),
                )
                .all();

            for (const p of sysProviders) {
                const [defModel] = await db
                    .select()
                    .from(aiModels)
                    .where(
                        and(
                            eq(aiModels.providerId, p.id),
                            eq(aiModels.enabled, true),
                            eq(aiModels.visibleToUsers, true),
                            eq(aiModels.isDefault, true),
                        ),
                    )
                    .limit(1)
                    .all();
                if (defModel) return { provider: p, model: defModel };
            }

            // 第一个可用模型
            const allProviders = [...userProviders, ...sysProviders];
            for (const p of allProviders) {
                const [anyModel] = await db
                    .select()
                    .from(aiModels)
                    .where(
                        and(
                            eq(aiModels.providerId, p.id),
                            eq(aiModels.enabled, true),
                            eq(aiModels.visibleToUsers, true),
                        ),
                    )
                    .limit(1)
                    .all();
                if (anyModel) return { provider: p, model: anyModel };
            }

            throw new AiServiceError("未配置可用模型", 400);
        });
    }

    async generateLogo(
        userId: string,
        providerId: string,
        modelId: string,
        siteName: string,
        siteDomain: string | undefined,
        description: string | undefined,
        style: LogoStyle,
        imageProtocol: ImageProtocol,
    ) {
        const { provider, model } = await this.resolveTargetModel(
            userId,
            providerId,
            modelId,
        );
        const apiKey = await decryptApiKey(
            provider.encryptedApiKey,
            this.#encryptionKey,
        );
        return await generateLogoCandidates(
            provider.baseUrl,
            apiKey,
            model.modelId,
            siteName,
            siteDomain,
            description,
            style,
            imageProtocol,
            this.#fetchFn,
        );
    }

    async *streamChat(
        userId: string,
        request: ChatStreamRequest,
        signal?: AbortSignal,
    ): AsyncGenerator<
        {
            event: "meta" | "token" | "done" | "error";
            data: unknown;
        },
        void,
        unknown
    > {
        // 1. 查找目标 Provider & Model (禁止自动静默 failover)
        const { provider, model } = await this.resolveTargetModel(
            userId,
            request.providerId,
            request.modelId,
        );

        const now = this.#now();
        let convId = request.conversationId;
        const historyEnabled = request.historyEnabled ?? true;

        // 2. 会话管理
        await this.#store.run(async (db: SearchDatabase) => {
            if (convId) {
                const [existing] = await db
                    .select()
                    .from(aiConversations)
                    .where(
                        and(
                            eq(aiConversations.id, convId),
                            eq(aiConversations.userId, userId),
                            isNull(aiConversations.deletedAt),
                        ),
                    )
                    .limit(1)
                    .all();
                if (!existing) {
                    throw new AiServiceError("对话不存在", 404);
                }
            } else {
                convId = crypto.randomUUID();
                const title = request.message.trim().slice(0, 30) || "新对话";
                await db.insert(aiConversations).values({
                    id: convId,
                    userId,
                    title,
                    historyEnabled,
                    deletedAt: null,
                    createdAt: now,
                    updatedAt: now,
                }).run();
            }
        });

        // 3. 构建历史消息上下文
        const contextMessages: {
            role: "system" | "user" | "assistant";
            content: string;
        }[] = [];

        let parentMsgId: string | null = null;
        let variantGroupId: string | null = null;

        await this.#store.run(async (db: SearchDatabase) => {
            if (request.regenerateMessageId) {
                // Regenerate Assistant 回复：创建 Assistant Variant
                const [targetMsg] = await db
                    .select()
                    .from(aiMessages)
                    .where(
                        and(
                            eq(aiMessages.id, request.regenerateMessageId),
                            eq(aiMessages.conversationId, convId!),
                        ),
                    )
                    .limit(1)
                    .all();

                if (!targetMsg || targetMsg.role !== "assistant") {
                    throw new AiServiceError("要重新生成的助手回复不存在", 404);
                }

                variantGroupId = targetMsg.variantGroupId ?? targetMsg.id;
                parentMsgId = targetMsg.parentMessageId;

                // 查询此助手消息之前的上下文
                const priorMsgs = await db
                    .select()
                    .from(aiMessages)
                    .where(eq(aiMessages.conversationId, convId!))
                    .orderBy(aiMessages.createdAt)
                    .all();

                for (const m of priorMsgs) {
                    if (m.createdAt < targetMsg.createdAt) {
                        contextMessages.push({
                            role: m.role as "system" | "user" | "assistant",
                            content: m.content,
                        });
                    }
                }
            } else {
                // 普通问答：插入 User Message
                const userMsgId = crypto.randomUUID();
                await db.insert(aiMessages).values({
                    id: userMsgId,
                    conversationId: convId!,
                    parentMessageId: null,
                    role: "user",
                    content: request.message,
                    providerId: null,
                    modelId: null,
                    status: "complete",
                    variantGroupId: null,
                    inputTokens: null,
                    outputTokens: null,
                    createdAt: now,
                }).run();

                parentMsgId = userMsgId;

                const priorMsgs = await db
                    .select()
                    .from(aiMessages)
                    .where(eq(aiMessages.conversationId, convId!))
                    .orderBy(aiMessages.createdAt)
                    .all();

                for (const m of priorMsgs) {
                    contextMessages.push({
                        role: m.role as "system" | "user" | "assistant",
                        content: m.content,
                    });
                }
            }
        });

        // 4. 创建一条待填充的 Assistant Message (status: "streaming")
        const assistantMsgId = crypto.randomUUID();
        await this.#store.run(async (db: SearchDatabase) => {
            await db.insert(aiMessages).values({
                id: assistantMsgId,
                conversationId: convId!,
                parentMessageId: parentMsgId,
                role: "assistant",
                content: "",
                providerId: provider.id,
                modelId: model.modelId,
                status: "streaming",
                variantGroupId,
                inputTokens: null,
                outputTokens: null,
                createdAt: this.#now(),
            }).run();
        });

        // 发送 meta 事件让客户端感知 messageId, provider, model
        yield {
            event: "meta",
            data: {
                conversationId: convId,
                messageId: assistantMsgId,
                providerId: provider.id,
                modelId: model.modelId,
            },
        };

        // 5. 解密 API Key 并发起流式请求
        const apiKey = await decryptApiKey(
            provider.encryptedApiKey,
            this.#encryptionKey,
        );

        let fullContent = "";
        let finalStatus: "complete" | "interrupted" | "failed" = "complete";

        try {
            const stream = streamOpenAIChat(
                provider.baseUrl,
                apiKey,
                {
                    model: model.modelId,
                    messages: contextMessages,
                    temperature: request.temperature,
                    top_p: request.topP,
                    max_tokens: request.maxTokens,
                },
                this.#fetchFn,
                signal,
            );

            for await (const chunk of stream) {
                if (chunk.type === "token" && chunk.token) {
                    fullContent += chunk.token;
                    yield { event: "token", data: chunk.token };
                } else if (chunk.type === "done") {
                    finalStatus = "complete";
                    yield { event: "done", data: null };
                    break;
                } else if (chunk.type === "error") {
                    finalStatus = signal?.aborted ? "interrupted" : "failed";
                    yield { event: "error", data: chunk.error };
                    break;
                }
            }
        } catch (err: unknown) {
            finalStatus = signal?.aborted ? "interrupted" : "failed";
            const msg = err instanceof Error ? err.message : String(err);
            yield { event: "error", data: msg };
        } finally {
            // 6. 将最终内容持久化回数据库
            const finishedNow = this.#now();
            await this.#store.run(async (db: SearchDatabase) => {
                await db.update(aiMessages)
                    .set({
                        content: fullContent,
                        status: finalStatus,
                    })
                    .where(eq(aiMessages.id, assistantMsgId))
                    .run();

                await db.update(aiConversations)
                    .set({ updatedAt: finishedNow })
                    .where(eq(aiConversations.id, convId!))
                    .run();
            });
        }
    }
}
