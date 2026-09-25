export type ProviderScope = "system" | "user";

export interface AiProviderDto {
    id: string;
    ownerUserId: string | null;
    scope: ProviderScope;
    name: string;
    baseUrl: string;
    apiKeyMasked: string;
    enabled: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface AiModelDto {
    id: string;
    providerId: string;
    modelId: string;
    displayName: string;
    enabled: boolean;
    visibleToUsers: boolean;
    isDefault: boolean;
    supportsText: boolean;
    supportsVision: boolean;
    supportsTools: boolean;
    supportsStreaming: boolean;
    metadataJson?: string | null;
    updatedAt: number;
}

export interface CreateProviderInput {
    name: string;
    baseUrl: string;
    apiKey: string;
    scope?: ProviderScope;
    enabled?: boolean;
}

export interface UpdateProviderInput {
    name?: string;
    baseUrl?: string;
    apiKey?: string;
    enabled?: boolean;
}

export interface UpdateModelInput {
    displayName?: string;
    enabled?: boolean;
    visibleToUsers?: boolean;
    isDefault?: boolean;
}

export interface DiscoveredModel {
    id: string;
    displayName?: string;
    supportsText?: boolean;
    supportsVision?: boolean;
    supportsTools?: boolean;
    supportsStreaming?: boolean;
}

export interface AiConversationDto {
    id: string;
    userId: string;
    title: string;
    historyEnabled: boolean;
    deletedAt?: number | null;
    createdAt: number;
    updatedAt: number;
}

export type MessageRole = "system" | "user" | "assistant";
export type MessageStatus = "streaming" | "complete" | "interrupted" | "failed";

export interface AiMessageDto {
    id: string;
    conversationId: string;
    parentMessageId: string | null;
    role: MessageRole;
    content: string;
    providerId: string | null;
    modelId: string | null;
    status: MessageStatus;
    variantGroupId: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    createdAt: number;
}

export interface ChatStreamRequest {
    conversationId?: string;
    providerId?: string;
    modelId?: string;
    message: string;
    regenerateMessageId?: string;
    historyEnabled?: boolean;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
}
