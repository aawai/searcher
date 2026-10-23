import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { DatabaseStore, SearchDatabase } from "../../db/database.ts";
import {
    aiBlobs,
    aiConversations,
    aiMessages,
    aiModels,
    aiProviders,
} from "../../db/ai-schema.ts";
import { auditLogs, preferences } from "../../db/schema.ts";
import { decryptApiKey, encryptApiKey, maskApiKey } from "./crypto.ts";
import { type OpenAIChatMessage, streamOpenAIChat } from "./client.ts";
import { generateLogoCandidates } from "./images.ts";
import {
    buildProviderGenerationParams,
    resolveEffectiveGenerationConfig,
} from "./reasoning.ts";
import {
    applyManualOverride,
    isStrictReasoningModel,
    mergeModelMetadata,
    parseModelMetadata,
    populateModelDtoCapabilities,
    resolveEffectiveCapability,
    resolveReasoningTransport,
} from "./model-capabilities.ts";
import type { AiGenerationDefaultsDto } from "@shared/contracts.ts";
import {
    type DiscoveredModelWithCapabilities,
    discoverProviderModels,
} from "./provider-adapter.ts";
import {
    processAndStoreAttachments,
    validateAttachments,
} from "./attachments.ts";
import { buildToolDefinitions, executeToolCall } from "./tools.ts";
import type {
    AiConversationDto,
    AiMessageDto,
    AiModelDto,
    AiProviderDto,
    ChatStreamRequest,
    CreateProviderInput,
    DiscoveryMode,
    ImageProtocol,
    LogoStyle,
    MessageContentPart,
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
function sanitizePublicMetadataJson(
    metadataJson: string | null | undefined,
): string | null {
    if (!metadataJson) return null;
    try {
        const parsed = JSON.parse(metadataJson);
        if (!parsed || typeof parsed !== "object") return null;
        const sanitized: Record<string, unknown> = {};
        if (parsed.capabilities && typeof parsed.capabilities === "object") {
            sanitized.capabilities = parsed.capabilities;
        }
        if (typeof parsed.discoveryMode === "string") {
            sanitized.discoveryMode = parsed.discoveryMode;
        }
        return JSON.stringify(sanitized);
    } catch {
        return null;
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
                discoveryMode: (r.discoveryMode as DiscoveryMode) ?? "auto",
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

        const discoveryMode: DiscoveryMode = input.discoveryMode ?? "auto";

        // 1. 验证 Provider 模型列表，通过 adapter 发现
        let discovered: DiscoveredModelWithCapabilities[];
        try {
            discovered = await discoverProviderModels(
                input.baseUrl,
                trimmedApiKey,
                { fetchFn: this.#fetchFn, discoveryMode },
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new AiServiceError(
                `未能从 Provider 获取到可用模型: ${msg}`,
                400,
            );
        }

        if (discovered.length === 0) {
            throw new AiServiceError(
                "未能从 Provider 获取到可用模型，Provider 不可用",
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
                discoveryMode,
                enabled: input.enabled ?? true,
                createdAt: now,
                updatedAt: now,
            }).run();

            // 批量将发现的模型插入 ai_models，并持久化推理能力与元数据
            for (let i = 0; i < discovered.length; i++) {
                const model = discovered[i];
                const initialMetadata = mergeModelMetadata(
                    null,
                    model.reasoningCapability,
                );
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
                    metadataJson: initialMetadata,
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
                discoveryMode,
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
        const discoveryMode = input.discoveryMode ??
            (existing.discoveryMode as DiscoveryMode) ?? "auto";
        let encryptedApiKey = existing.encryptedApiKey;
        let discovered: DiscoveredModelWithCapabilities[] = [];
        if (
            input.apiKey !== undefined ||
            input.baseUrl !== undefined ||
            input.discoveryMode !== undefined
        ) {
            const effectiveKey = input.apiKey?.trim() ||
                await decryptApiKey(
                    existing.encryptedApiKey,
                    this.#encryptionKey,
                );
            try {
                discovered = await discoverProviderModels(
                    baseUrl,
                    effectiveKey,
                    { fetchFn: this.#fetchFn, discoveryMode },
                );
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                throw new AiServiceError(
                    `更新后未能获取到可用模型: ${msg}`,
                    400,
                );
            }
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
                const known = new Map(
                    models.map((model) => [model.modelId, model]),
                );
                for (const model of discovered) {
                    const existingModel = known.get(model.id);
                    if (existingModel) {
                        const mergedMetadata = mergeModelMetadata(
                            existingModel.metadataJson,
                            model.reasoningCapability,
                        );
                        await db.update(aiModels).set({
                            metadataJson: mergedMetadata,
                            supportsText: model.supportsText,
                            supportsVision: model.supportsVision,
                            supportsTools: model.supportsTools,
                            supportsStreaming: model.supportsStreaming,
                            updatedAt: now,
                        }).where(eq(aiModels.id, existingModel.id)).run();
                        continue;
                    }
                    const initialMetadata = mergeModelMetadata(
                        null,
                        model.reasoningCapability,
                    );
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
                        metadataJson: initialMetadata,
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
                discoveryMode,
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
                discoveryMode,
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
        const discovered = await discoverProviderModels(
            existing.baseUrl,
            apiKey,
            {
                fetchFn: this.#fetchFn,
                discoveryMode: (existing.discoveryMode as DiscoveryMode) ??
                    "auto",
            },
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
            const known = new Map(
                models.map((model) => [model.modelId, model]),
            );
            const now = this.#now();
            for (const model of discovered) {
                const existingModel = known.get(model.id);
                if (existingModel) {
                    const mergedMetadata = mergeModelMetadata(
                        existingModel.metadataJson,
                        model.reasoningCapability,
                    );
                    await db.update(aiModels).set({
                        metadataJson: mergedMetadata,
                        supportsText: model.supportsText,
                        supportsVision: model.supportsVision,
                        supportsTools: model.supportsTools,
                        supportsStreaming: model.supportsStreaming,
                        updatedAt: now,
                    }).where(eq(aiModels.id, existingModel.id)).run();
                    continue;
                }
                const initialMetadata = mergeModelMetadata(
                    null,
                    model.reasoningCapability,
                );
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
                    metadataJson: initialMetadata,
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
            .map((r) => {
                const caps = populateModelDtoCapabilities(r);
                return {
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
                    supportsReasoning: caps.supportsReasoning,
                    reasoningEfforts: caps.reasoningEfforts,
                    defaultReasoningEffort: caps.defaultReasoningEffort,
                    reasoningCapabilitySource: caps.reasoningCapabilitySource,
                    isReasoningStrict: caps.isReasoningStrict,
                    metadataJson: sanitizePublicMetadataJson(r.metadataJson),
                    updatedAt: r.updatedAt,
                };
            });
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

            let updatedMetadata = model.metadataJson;
            if (input.reasoningOverride !== undefined) {
                updatedMetadata = applyManualOverride(
                    updatedMetadata,
                    input.reasoningOverride,
                );
            } else if (input.metadataJson !== undefined) {
                updatedMetadata = input.metadataJson;
            }

            await db.update(aiModels)
                .set({
                    displayName: input.displayName ?? model.displayName,
                    enabled: input.enabled ?? model.enabled,
                    visibleToUsers: input.visibleToUsers ??
                        model.visibleToUsers,
                    isDefault: input.isDefault ?? model.isDefault,
                    metadataJson: updatedMetadata,
                    updatedAt: now,
                })
                .where(eq(aiModels.id, modelPk))
                .run();
            await this.#audit(db, userId, "ai.model.update", model.providerId);

            const [updated] = await db
                .select()
                .from(aiModels)
                .where(eq(aiModels.id, modelPk))
                .limit(1)
                .all();
            const currentRecord = updated ??
                { ...model, metadataJson: updatedMetadata };
            const caps = populateModelDtoCapabilities(currentRecord);

            return {
                id: currentRecord.id,
                providerId: currentRecord.providerId,
                modelId: currentRecord.modelId,
                displayName: currentRecord.displayName,
                enabled: currentRecord.enabled,
                visibleToUsers: currentRecord.visibleToUsers,
                isDefault: currentRecord.isDefault,
                supportsText: currentRecord.supportsText,
                supportsVision: currentRecord.supportsVision,
                supportsTools: currentRecord.supportsTools,
                supportsStreaming: currentRecord.supportsStreaming,
                supportsReasoning: caps.supportsReasoning,
                reasoningEfforts: caps.reasoningEfforts,
                defaultReasoningEffort: caps.defaultReasoningEffort,
                reasoningCapabilitySource: caps.reasoningCapabilitySource,
                isReasoningStrict: caps.isReasoningStrict,
                metadataJson: sanitizePublicMetadataJson(
                    currentRecord.metadataJson,
                ),
                updatedAt: currentRecord.updatedAt,
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
                activeLeafMessageId: r.activeLeafMessageId,
                systemInstruction: r.systemInstruction,
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
                    activeLeafMessageId: conv.activeLeafMessageId,
                    systemInstruction: conv.systemInstruction,
                    deletedAt: conv.deletedAt,
                    createdAt: conv.createdAt,
                    updatedAt: conv.updatedAt,
                },
                messages: msgs.map((m) => {
                    let parts: MessageContentPart[] | undefined;
                    if (m.partsJson) {
                        try {
                            const parsed = JSON.parse(m.partsJson);
                            if (Array.isArray(parsed)) {
                                parts = parsed.map((p: unknown) => {
                                    if (
                                        p &&
                                        typeof p === "object" &&
                                        "type" in p &&
                                        p.type === "attachment" &&
                                        "mimeType" in p &&
                                        typeof p.mimeType === "string" &&
                                        p.mimeType.toLowerCase().startsWith(
                                            "image/",
                                        )
                                    ) {
                                        const copy = {
                                            ...(p as Record<string, unknown>),
                                        };
                                        delete copy.data;
                                        return copy as unknown as MessageContentPart;
                                    }
                                    return p as MessageContentPart;
                                });
                            }
                        } catch {
                            // ignore parse error
                        }
                    }
                    return {
                        id: m.id,
                        conversationId: m.conversationId,
                        parentMessageId: m.parentMessageId,
                        role: m.role as AiMessageDto["role"],
                        content: m.content,
                        parts,
                        providerId: m.providerId,
                        modelId: m.modelId,
                        status: m.status as AiMessageDto["status"],
                        variantGroupId: m.variantGroupId,
                        inputTokens: m.inputTokens,
                        outputTokens: m.outputTokens,
                        createdAt: m.createdAt,
                    };
                }),
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
                activeLeafMessageId: conv.activeLeafMessageId,
                systemInstruction: conv.systemInstruction,
                deletedAt: conv.deletedAt,
                createdAt: conv.createdAt,
                updatedAt: now,
            };
        });
    }

    async updateConversation(
        userId: string,
        conversationId: string,
        input: {
            title?: string;
            historyEnabled?: boolean;
            activeLeafMessageId?: string | null;
            systemInstruction?: string | null;
        },
    ): Promise<AiConversationDto> {
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
            const setObj: Record<string, unknown> = { updatedAt: now };
            if (input.title !== undefined) {
                const trimmed = input.title.trim();
                if (!trimmed) throw new AiServiceError("标题不能为空", 400);
                setObj.title = trimmed;
            }
            if (input.historyEnabled !== undefined) {
                setObj.historyEnabled = input.historyEnabled;
            }
            if (input.activeLeafMessageId !== undefined) {
                setObj.activeLeafMessageId = input.activeLeafMessageId;
            }
            if (input.systemInstruction !== undefined) {
                setObj.systemInstruction = input.systemInstruction;
            }

            await db.update(aiConversations)
                .set(setObj)
                .where(eq(aiConversations.id, conversationId))
                .run();

            const [updated] = await db
                .select()
                .from(aiConversations)
                .where(eq(aiConversations.id, conversationId))
                .limit(1)
                .all();

            return {
                id: updated.id,
                userId: updated.userId,
                title: updated.title,
                historyEnabled: updated.historyEnabled,
                activeLeafMessageId: updated.activeLeafMessageId,
                systemInstruction: updated.systemInstruction,
                deletedAt: updated.deletedAt,
                createdAt: updated.createdAt,
                updatedAt: updated.updatedAt,
            };
        });
    }

    async searchConversationMessages(
        userId: string,
        conversationId: string,
        query: string,
    ): Promise<
        Array<{
            messageId: string;
            role: string;
            content: string;
            createdAt: number;
            matchSnippet: string;
        }>
    > {
        const trimmed = query.trim().toLowerCase();
        if (!trimmed) return [];

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

            const msgs = await db
                .select()
                .from(aiMessages)
                .where(eq(aiMessages.conversationId, conversationId))
                .orderBy(aiMessages.createdAt)
                .all();

            const results: Array<{
                messageId: string;
                role: string;
                content: string;
                createdAt: number;
                matchSnippet: string;
            }> = [];

            for (const m of msgs) {
                const idx = m.content.toLowerCase().indexOf(trimmed);
                if (idx >= 0) {
                    const start = Math.max(0, idx - 40);
                    const end = Math.min(
                        m.content.length,
                        idx + trimmed.length + 40,
                    );
                    const snippet = (start > 0 ? "..." : "") +
                        m.content.slice(start, end) +
                        (end < m.content.length ? "..." : "");
                    results.push({
                        messageId: m.id,
                        role: m.role,
                        content: m.content,
                        createdAt: m.createdAt,
                        matchSnippet: snippet,
                    });
                }
            }

            return results;
        });
    }

    async exportConversation(
        userId: string,
        conversationId: string,
        format: "markdown" | "json",
    ): Promise<{ filename: string; mimeType: string; content: string }> {
        const { conversation, messages } = await this.getConversation(
            userId,
            conversationId,
        );

        const safeTitle =
            conversation.title.replace(/[^\w\u4e00-\u9fa5-_]/g, "_") ||
            "conversation";

        if (format === "json") {
            return {
                filename: `${safeTitle}.json`,
                mimeType: "application/json; charset=utf-8",
                content: JSON.stringify({ conversation, messages }, null, 2),
            };
        }

        const msgMap = new Map(messages.map((m) => [m.id, m]));
        const path: AiMessageDto[] = [];
        let currId = conversation.activeLeafMessageId ??
            (messages.length > 0 ? messages[messages.length - 1].id : null);
        while (currId) {
            const m = msgMap.get(currId);
            if (!m) break;
            path.unshift(m);
            currId = m.parentMessageId;
        }

        const msgsToExport = path.length > 0 ? path : messages;

        let md = `# ${conversation.title}\n\n`;
        for (const m of msgsToExport) {
            const roleName = m.role === "user"
                ? "User"
                : m.role === "assistant"
                ? "Assistant"
                : "System";
            md += `### ${roleName}\n\n${m.content}\n\n`;
        }

        return {
            filename: `${safeTitle}.md`,
            mimeType: "text/markdown; charset=utf-8",
            content: md,
        };
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
            if (requestedModelId) {
                if (requestedProviderId) {
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
                                or(
                                    eq(aiModels.modelId, requestedModelId),
                                    eq(aiModels.id, requestedModelId),
                                ),
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

                // When requestedProviderId is omitted, find matching model across accessible providers
                const accessibleProviders = await db
                    .select()
                    .from(aiProviders)
                    .where(
                        and(
                            eq(aiProviders.enabled, true),
                            or(
                                eq(aiProviders.ownerUserId, userId),
                                eq(aiProviders.scope, "system"),
                            ),
                        ),
                    )
                    .all();

                // Search user providers first, then system providers
                accessibleProviders.sort((a, b) => {
                    if (a.scope === "user" && b.scope !== "user") return -1;
                    if (a.scope !== "user" && b.scope === "user") return 1;
                    return 0;
                });

                for (const p of accessibleProviders) {
                    const [model] = await db
                        .select()
                        .from(aiModels)
                        .where(
                            and(
                                eq(aiModels.providerId, p.id),
                                or(
                                    eq(aiModels.modelId, requestedModelId),
                                    eq(aiModels.id, requestedModelId),
                                ),
                                eq(aiModels.enabled, true),
                                eq(aiModels.visibleToUsers, true),
                            ),
                        )
                        .limit(1)
                        .all();

                    if (model) {
                        return { provider: p, model };
                    }
                }

                throw new AiServiceError(
                    `模型 ${requestedModelId} 不可用或未对用户开放`,
                    404,
                );
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
            event:
                | "meta"
                | "token"
                | "tool-call"
                | "tool-result"
                | "sources"
                | "done"
                | "error";
            data: unknown;
        },
        void,
        unknown
    > {
        // 0. Preliminary validation (zero mutations on 4xx)
        if (
            !request.regenerateMessageId &&
            !request.message &&
            (!request.attachments || request.attachments.length === 0)
        ) {
            throw new AiServiceError("消息内容不能为空", 400);
        }

        if (request.attachments && request.attachments.length > 0) {
            validateAttachments(request.attachments);
        }

        // 1. Resolve Target Provider & Model
        const { provider, model } = await this.resolveTargetModel(
            userId,
            request.providerId,
            request.modelId,
        );

        // Check image capability: non-vision models reject images before mutations
        const hasImages = request.attachments &&
            request.attachments.some((a) =>
                a.type === "image" ||
                a.mimeType.toLowerCase().startsWith("image/")
            );
        if (hasImages && !model.supportsVision) {
            throw new AiServiceError("当前模型不支持图片多模态分析", 400);
        }

        // Load user defaults from preferences (graceful fallback if preferences table not present in partial test schema)
        let userDefaults: AiGenerationDefaultsDto | undefined = undefined;
        try {
            const userPrefs = await this.#store.run(
                async (db: SearchDatabase) => {
                    const [row] = await db
                        .select()
                        .from(preferences)
                        .where(eq(preferences.userId, userId))
                        .limit(1)
                        .all();
                    return row;
                },
            );

            if (userPrefs?.aiGenerationDefaults) {
                const parsed = JSON.parse(userPrefs.aiGenerationDefaults);
                if (parsed && typeof parsed === "object") {
                    userDefaults = parsed;
                }
            }
        } catch {
            // Ignore if preferences table not in isolated store or malformed JSON
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

        // Resolve generation params with strict precedence: request -> per-model user default -> global default -> model default
        const resolvedConfig = resolveEffectiveGenerationConfig({
            requestConfig: {
                reasoningEffort: request.reasoningEffort,
                temperature: request.temperature,
                topP: request.topP,
                maxTokens: request.maxTokens,
            },
            userDefaults,
            modelId: model.modelId,
            modelDbId: model.id,
            capability,
            transport,
            isReasoningStrict,
        });

        // BUILD GENERATION PARAMS BEFORE ANY DB MUTATION (throws 400 if strict reasoning receives temp/topP)
        const generationParams = buildProviderGenerationParams(
            resolvedConfig,
            capability,
            transport,
            { isReasoningStrict },
        );

        const now = this.#now();
        const existingConvId = request.conversationId;
        let convId: string;
        const historyEnabled = request.historyEnabled ?? true;
        let systemInstruction = request.systemInstruction;
        let title = "新对话";

        let userMsgParentId: string | null = null;
        let variantGroupId: string | null = null;
        let branchStartParentId: string | null = null;
        const branchChain: typeof aiMessages.$inferSelect[] = [];

        // 2. Validate conversation & targets BEFORE blob storage or any DB mutations
        if (existingConvId) {
            convId = existingConvId;
            const existing = await this.#store.run(
                async (db: SearchDatabase) => {
                    const [c] = await db
                        .select()
                        .from(aiConversations)
                        .where(
                            and(
                                eq(aiConversations.id, existingConvId),
                                eq(aiConversations.userId, userId),
                                isNull(aiConversations.deletedAt),
                            ),
                        )
                        .limit(1)
                        .all();
                    return c;
                },
            );
            if (!existing) {
                throw new AiServiceError("对话不存在", 404);
            }
            title = existing.title;
            if (!systemInstruction && existing.systemInstruction) {
                systemInstruction = existing.systemInstruction;
            }

            const allMsgs = await this.#store.run(
                async (db: SearchDatabase) => {
                    return await db
                        .select()
                        .from(aiMessages)
                        .where(eq(aiMessages.conversationId, existingConvId))
                        .all();
                },
            );
            const msgMap = new Map(allMsgs.map((m) => [m.id, m]));

            if (request.regenerateMessageId) {
                const targetMsg = msgMap.get(request.regenerateMessageId);
                if (!targetMsg || targetMsg.role !== "assistant") {
                    throw new AiServiceError("要重新生成的助手回复不存在", 404);
                }
                variantGroupId = targetMsg.variantGroupId ?? targetMsg.id;
                userMsgParentId = targetMsg.parentMessageId;
                branchStartParentId = targetMsg.parentMessageId;
            } else if (request.editMessageId) {
                const editedMsg = msgMap.get(request.editMessageId);
                if (!editedMsg || editedMsg.role !== "user") {
                    throw new AiServiceError("要编辑的用户消息不存在", 404);
                }
                userMsgParentId = editedMsg.parentMessageId;
                branchStartParentId = editedMsg.parentMessageId;
            } else if (request.parentMessageId) {
                const parentMsg = msgMap.get(request.parentMessageId);
                if (!parentMsg) {
                    throw new AiServiceError("指定的父消息不存在", 404);
                }
                userMsgParentId = request.parentMessageId;
                branchStartParentId = request.parentMessageId;
            } else {
                userMsgParentId = existing.activeLeafMessageId ?? null;
                branchStartParentId = existing.activeLeafMessageId ?? null;
            }

            let currId: string | null = branchStartParentId;
            const visited = new Set<string>();
            while (currId && !visited.has(currId)) {
                visited.add(currId);
                const m = msgMap.get(currId);
                if (!m) break;
                branchChain.unshift(m);
                currId = m.parentMessageId;
            }
        } else {
            if (request.regenerateMessageId) {
                throw new AiServiceError("无法在未指定对话时重新生成回复", 400);
            }
            if (request.editMessageId) {
                throw new AiServiceError("无法在未指定对话时编辑消息", 400);
            }
            if (request.parentMessageId) {
                throw new AiServiceError("无法在未指定对话时指定父消息", 400);
            }
            const newConvId = crypto.randomUUID();
            convId = newConvId;
            title = request.message.trim().slice(0, 30) || "新对话";
            await this.#store.run(async (db: SearchDatabase) => {
                await db.insert(aiConversations).values({
                    id: newConvId,
                    userId,
                    title,
                    historyEnabled,
                    systemInstruction: systemInstruction ?? null,
                    deletedAt: null,
                    createdAt: now,
                    updatedAt: now,
                }).run();
            });
        }

        // 3. Process and store attachments safely tied to conversation
        const attachmentParts = await processAndStoreAttachments(
            userId,
            convId,
            request.attachments,
            this.#store,
        );

        // 4. Insert new user message if not regenerate
        let userMsgId: string;
        if (!request.regenerateMessageId) {
            userMsgId = crypto.randomUUID();
            const userParts: MessageContentPart[] = [];
            if (request.message) {
                userParts.push({ type: "text", text: request.message });
            }
            for (const att of attachmentParts) {
                userParts.push(att);
            }

            await this.#store.run(async (db: SearchDatabase) => {
                await db.insert(aiMessages).values({
                    id: userMsgId,
                    conversationId: convId!,
                    parentMessageId: userMsgParentId,
                    role: "user",
                    content: request.message,
                    partsJson: userParts.length > 0
                        ? JSON.stringify(userParts)
                        : null,
                    providerId: null,
                    modelId: null,
                    status: "complete",
                    variantGroupId: null,
                    inputTokens: null,
                    outputTokens: null,
                    createdAt: now,
                }).run();
            });
        } else {
            userMsgId = branchStartParentId ?? "";
        }

        // 5. Create Assistant message (status: "streaming")
        const assistantMsgId = crypto.randomUUID();
        const assistantParentId = !request.regenerateMessageId
            ? userMsgId
            : branchStartParentId;

        await this.#store.run(async (db: SearchDatabase) => {
            await db.insert(aiMessages).values({
                id: assistantMsgId,
                conversationId: convId!,
                parentMessageId: assistantParentId,
                role: "assistant",
                content: "",
                partsJson: null,
                providerId: provider.id,
                modelId: model.modelId,
                status: "streaming",
                variantGroupId,
                inputTokens: null,
                outputTokens: null,
                createdAt: this.#now(),
            }).run();
        });

        // Emit meta event
        yield {
            event: "meta",
            data: {
                conversationId: convId,
                messageId: assistantMsgId,
                userMessageId: userMsgId,
                assistantMessageId: assistantMsgId,
                title,
                providerId: provider.id,
                modelId: model.modelId,
            },
        };

        // 6. Prepare LLM message history with attachment replay
        const llmMessages: OpenAIChatMessage[] = [];
        if (systemInstruction) {
            llmMessages.push({ role: "system", content: systemInstruction });
        }

        for (const m of branchChain) {
            if (m.role === "user" && m.partsJson) {
                try {
                    const parts = JSON.parse(m.partsJson);
                    if (Array.isArray(parts)) {
                        const blocks: Array<
                            | { type: "text"; text: string }
                            | { type: "image_url"; image_url: { url: string } }
                        > = [];
                        for (const p of parts) {
                            if (
                                p.type === "attachment" &&
                                p.mimeType?.startsWith("image/")
                            ) {
                                if (model.supportsVision) {
                                    const blob = await this.#store.run(
                                        async (db) => {
                                            const [row] = await db
                                                .select()
                                                .from(aiBlobs)
                                                .where(eq(aiBlobs.id, p.id))
                                                .limit(1)
                                                .all();
                                            return row;
                                        },
                                    );
                                    if (blob && blob.data) {
                                        blocks.push({
                                            type: "image_url",
                                            image_url: { url: blob.data },
                                        });
                                    }
                                } else {
                                    blocks.push({
                                        type: "text",
                                        text: `[Attached image: ${p.name}]`,
                                    });
                                }
                            } else if (p.type === "attachment" && p.data) {
                                blocks.push({
                                    type: "text",
                                    text:
                                        `[Attached file: ${p.name}]\n${p.data}\n`,
                                });
                            } else if (p.type === "text" && p.text) {
                                blocks.push({ type: "text", text: p.text });
                            }
                        }
                        if (blocks.length > 0) {
                            llmMessages.push({ role: "user", content: blocks });
                            continue;
                        }
                    }
                } catch {
                    // fallback
                }
            }
            llmMessages.push({
                role: m.role as "system" | "user" | "assistant",
                content: m.content,
            });
        }

        if (!request.regenerateMessageId) {
            if (model.supportsVision && hasImages) {
                const blocks: Array<
                    | { type: "text"; text: string }
                    | { type: "image_url"; image_url: { url: string } }
                > = [];
                for (const att of attachmentParts) {
                    if (att.mimeType.startsWith("image/") && att.data) {
                        blocks.push({
                            type: "image_url",
                            image_url: { url: att.data },
                        });
                    } else if (att.data) {
                        blocks.push({
                            type: "text",
                            text: `[Attached file: ${att.name}]\n${att.data}\n`,
                        });
                    }
                }
                if (request.message) {
                    blocks.push({ type: "text", text: request.message });
                }
                llmMessages.push({ role: "user", content: blocks });
            } else {
                let userText = request.message;
                const textAtts = attachmentParts.filter((a) =>
                    !a.mimeType.startsWith("image/") && a.data
                );
                if (textAtts.length > 0) {
                    const prefix = textAtts.map((a) =>
                        `[Attached file: ${a.name}]\n${a.data}\n`
                    ).join("\n");
                    userText = `${prefix}\n${userText}`;
                }
                llmMessages.push({ role: "user", content: userText });
            }
        }

        const toolDefs = buildToolDefinitions(
            request.tools,
            model.supportsTools,
        );

        // 7. Stream and multi-round tool loop
        const apiKey = await decryptApiKey(
            provider.encryptedApiKey,
            this.#encryptionKey,
        );

        let fullContent = "";
        let finalStatus: "complete" | "interrupted" | "failed" = "complete";
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        const assistantParts: MessageContentPart[] = [];
        let round = 0;
        const MAX_TOOL_ROUNDS = 3;
        let hadToolCalls = false;

        try {
            while (round < MAX_TOOL_ROUNDS) {
                round++;
                const stream = streamOpenAIChat(
                    provider.baseUrl,
                    apiKey,
                    {
                        model: model.modelId,
                        messages: llmMessages,
                        ...generationParams,
                        tools: toolDefs.length > 0 ? toolDefs : undefined,
                    },
                    this.#fetchFn,
                    signal,
                );

                let roundHadToolCalls = false;
                for await (const chunk of stream) {
                    if (signal?.aborted) {
                        finalStatus = "interrupted";
                        yield { event: "error", data: "请求已中断" };
                        break;
                    }

                    if (chunk.type === "token" && chunk.token) {
                        fullContent += chunk.token;
                        yield { event: "token", data: chunk.token };
                    } else if (
                        chunk.type === "tool_calls" &&
                        chunk.toolCalls &&
                        chunk.toolCalls.length > 0
                    ) {
                        roundHadToolCalls = true;
                        hadToolCalls = true;
                        if (typeof chunk.inputTokens === "number") {
                            totalInputTokens += chunk.inputTokens;
                        }
                        if (typeof chunk.outputTokens === "number") {
                            totalOutputTokens += chunk.outputTokens;
                        }

                        const toolCallMessages: Array<{
                            id: string;
                            type: "function";
                            function: { name: string; arguments: string };
                        }> = [];

                        for (const tc of chunk.toolCalls) {
                            let parsedArgs: Record<string, unknown> = {};
                            try {
                                parsedArgs = JSON.parse(tc.arguments || "{}");
                            } catch {
                                parsedArgs = { raw: tc.arguments };
                            }

                            const canonicalName:
                                | "documents"
                                | "apps"
                                | "webSearch" =
                                    tc.name === "lookup_documents" ||
                                        tc.name === "documents"
                                        ? "documents"
                                        : tc.name === "lookup_apps" ||
                                                tc.name === "apps"
                                        ? "apps"
                                        : "webSearch";

                            yield {
                                event: "tool-call",
                                data: {
                                    callId: tc.id,
                                    toolName: canonicalName,
                                    args: parsedArgs,
                                },
                            };

                            const execResult = await executeToolCall(
                                tc.name,
                                parsedArgs,
                                {
                                    userId,
                                    store: this.#store,
                                    allowedTools: request.tools,
                                    signal,
                                },
                            );

                            yield {
                                event: "tool-result",
                                data: {
                                    callId: tc.id,
                                    toolName: canonicalName,
                                    result: execResult.result,
                                    error: execResult.error,
                                },
                            };

                            if (
                                execResult.sources &&
                                execResult.sources.length > 0
                            ) {
                                yield {
                                    event: "sources",
                                    data: { sources: execResult.sources },
                                };
                                assistantParts.push({
                                    type: "sources",
                                    sources: execResult.sources,
                                });
                            }

                            assistantParts.push({
                                type: "tool-call",
                                callId: tc.id,
                                toolName: canonicalName,
                                args: parsedArgs,
                            });
                            assistantParts.push({
                                type: "tool-result",
                                callId: tc.id,
                                toolName: canonicalName,
                                result: execResult.result,
                                error: execResult.error,
                            });

                            toolCallMessages.push({
                                id: tc.id,
                                type: "function",
                                function: {
                                    name: tc.name,
                                    arguments: tc.arguments,
                                },
                            });

                            llmMessages.push({
                                role: "tool",
                                tool_call_id: tc.id,
                                content: typeof execResult.result === "string"
                                    ? execResult.result
                                    : JSON.stringify(
                                        execResult.result ?? {
                                            error: execResult.error,
                                        },
                                    ),
                            });
                        }

                        llmMessages.splice(
                            llmMessages.length - toolCallMessages.length,
                            0,
                            {
                                role: "assistant",
                                content: "",
                                tool_calls: toolCallMessages,
                            },
                        );

                        break; // re-invoke next round
                    } else if (chunk.type === "done") {
                        if (typeof chunk.inputTokens === "number") {
                            totalInputTokens += chunk.inputTokens;
                        }
                        if (typeof chunk.outputTokens === "number") {
                            totalOutputTokens += chunk.outputTokens;
                        }
                        finalStatus = "complete";
                        break;
                    } else if (chunk.type === "error") {
                        finalStatus = signal?.aborted
                            ? "interrupted"
                            : "failed";
                        yield { event: "error", data: chunk.error };
                        break;
                    }
                }

                if (
                    !roundHadToolCalls || finalStatus !== "complete" ||
                    signal?.aborted
                ) {
                    break;
                }
            }

            // If max tool rounds reached and tool calls occurred without a final textual answer,
            // force one final turn without tools so the model must provide text.
            if (
                hadToolCalls && !fullContent && finalStatus === "complete" &&
                !signal?.aborted
            ) {
                const finalStream = streamOpenAIChat(
                    provider.baseUrl,
                    apiKey,
                    {
                        model: model.modelId,
                        messages: llmMessages,
                        ...generationParams,
                        tools: undefined,
                    },
                    this.#fetchFn,
                    signal,
                );
                for await (const chunk of finalStream) {
                    if (signal?.aborted) {
                        finalStatus = "interrupted";
                        yield { event: "error", data: "请求已中断" };
                        break;
                    }
                    if (chunk.type === "token" && chunk.token) {
                        fullContent += chunk.token;
                        yield { event: "token", data: chunk.token };
                    } else if (chunk.type === "done") {
                        if (typeof chunk.inputTokens === "number") {
                            totalInputTokens += chunk.inputTokens;
                        }
                        if (typeof chunk.outputTokens === "number") {
                            totalOutputTokens += chunk.outputTokens;
                        }
                        finalStatus = "complete";
                        break;
                    } else if (chunk.type === "error") {
                        finalStatus = signal?.aborted
                            ? "interrupted"
                            : "failed";
                        yield { event: "error", data: chunk.error };
                        break;
                    }
                }
            }

            if (hadToolCalls && !fullContent && finalStatus === "complete") {
                finalStatus = "failed";
                fullContent = "已达到工具调用轮数上限，未能生成最终回答";
            }
        } catch (err: unknown) {
            finalStatus = signal?.aborted ? "interrupted" : "failed";
            const msg = err instanceof Error ? err.message : String(err);
            yield { event: "error", data: msg };
        } finally {
            const finishedNow = this.#now();
            if (signal?.aborted) {
                finalStatus = "interrupted";
            }

            if (fullContent) {
                assistantParts.unshift({ type: "text", text: fullContent });
            }

            // Commit to DB BEFORE yielding done!
            await this.#store.run(async (db: SearchDatabase) => {
                await db.update(aiMessages)
                    .set({
                        content: fullContent,
                        partsJson: assistantParts.length > 0
                            ? JSON.stringify(assistantParts)
                            : null,
                        status: finalStatus,
                        inputTokens: totalInputTokens > 0
                            ? totalInputTokens
                            : null,
                        outputTokens: totalOutputTokens > 0
                            ? totalOutputTokens
                            : null,
                    })
                    .where(eq(aiMessages.id, assistantMsgId))
                    .run();

                await db.update(aiConversations)
                    .set({
                        activeLeafMessageId: assistantMsgId,
                        updatedAt: finishedNow,
                    })
                    .where(eq(aiConversations.id, convId!))
                    .run();
            });

            // NOW emit done event AFTER persistence is committed!
            if (finalStatus === "complete") {
                yield {
                    event: "done",
                    data: {
                        assistantMessageId: assistantMsgId,
                        status: finalStatus,
                        inputTokens: totalInputTokens > 0
                            ? totalInputTokens
                            : null,
                        outputTokens: totalOutputTokens > 0
                            ? totalOutputTokens
                            : null,
                    },
                };
            }
        }
    }
}
