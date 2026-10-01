import { sql } from "drizzle-orm";
import {
    check,
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "./schema.ts";

export const aiProviders = sqliteTable("ai_providers", {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").references(() => users.id, {
        onDelete: "cascade",
    }),
    scope: text("scope", { enum: ["system", "user"] }).notNull(),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    discoveryMode: text("discovery_mode", {
        enum: ["auto", "openai-compatible", "cliproxyapi"],
    }).notNull().default("auto"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
}, (t) => [
    index("ai_providers_owner_idx").on(t.ownerUserId),
    index("ai_providers_scope_idx").on(t.scope),
    check(
        "ai_providers_scope_check",
        sql`${t.scope} in ('system', 'user')`,
    ),
    check(
        "ai_providers_discovery_mode_check",
        sql`${t.discoveryMode} in ('auto', 'openai-compatible', 'cliproxyapi')`,
    ),
]);

export const aiModels = sqliteTable("ai_models", {
    id: text("id").primaryKey(),
    providerId: text("provider_id").notNull().references(() => aiProviders.id, {
        onDelete: "cascade",
    }),
    modelId: text("model_id").notNull(),
    displayName: text("display_name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    visibleToUsers: integer("visible_to_users", { mode: "boolean" }).notNull()
        .default(true),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(
        false,
    ),
    supportsText: integer("supports_text", { mode: "boolean" }).notNull()
        .default(true),
    supportsVision: integer("supports_vision", { mode: "boolean" }).notNull()
        .default(false),
    supportsTools: integer("supports_tools", { mode: "boolean" }).notNull()
        .default(false),
    supportsStreaming: integer("supports_streaming", { mode: "boolean" })
        .notNull().default(true),
    metadataJson: text("metadata_json"),
    updatedAt: integer("updated_at").notNull(),
}, (t) => [
    index("ai_models_provider_idx").on(t.providerId),
    uniqueIndex("ai_models_provider_model_idx").on(t.providerId, t.modelId),
]);

export const aiConversations = sqliteTable("ai_conversations", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, {
        onDelete: "cascade",
    }),
    title: text("title").notNull(),
    historyEnabled: integer("history_enabled", { mode: "boolean" }).notNull()
        .default(true),
    activeLeafMessageId: text("active_leaf_message_id"),
    systemInstruction: text("system_instruction"),
    deletedAt: integer("deleted_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
}, (t) => [
    index("ai_conversations_user_idx").on(t.userId),
    index("ai_conversations_deleted_at_idx").on(t.deletedAt),
]);

export const aiMessages = sqliteTable("ai_messages", {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull().references(
        () => aiConversations.id,
        { onDelete: "cascade" },
    ),
    parentMessageId: text("parent_message_id"),
    role: text("role", { enum: ["system", "user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    providerId: text("provider_id").references(() => aiProviders.id, {
        onDelete: "set null",
    }),
    modelId: text("model_id"),
    status: text("status", {
        enum: ["streaming", "complete", "interrupted", "failed"],
    }).notNull().default("complete"),
    variantGroupId: text("variant_group_id"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    partsJson: text("parts_json"),
    createdAt: integer("created_at").notNull(),
}, (t) => [
    index("ai_messages_conversation_idx").on(t.conversationId),
    index("ai_messages_variant_group_idx").on(t.variantGroupId),
    check(
        "ai_messages_role_check",
        sql`${t.role} in ('system', 'user', 'assistant')`,
    ),
    check(
        "ai_messages_status_check",
        sql`${t.status} in ('streaming', 'complete', 'interrupted', 'failed')`,
    ),
]);

export const aiBlobs = sqliteTable("ai_blobs", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, {
        onDelete: "cascade",
    }),
    conversationId: text("conversation_id").references(
        () => aiConversations.id,
        { onDelete: "cascade" },
    ),
    mimeType: text("mime_type").notNull(),
    data: text("data").notNull(),
    size: integer("size").notNull(),
    createdAt: integer("created_at").notNull(),
}, (t) => [
    index("ai_blobs_user_idx").on(t.userId),
    index("ai_blobs_conversation_idx").on(t.conversationId),
]);
