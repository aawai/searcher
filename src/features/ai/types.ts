import type { GenerationConfig, ReasoningEffort } from "./reasoning.ts";
import type {
    DiscoveryMode,
    ReasoningCapabilitySource,
    ReasoningOverride,
} from "./model-capabilities.ts";

export {
    CANONICAL_REASONING_EFFORTS,
    type GenerationConfig,
    type ReasoningEffort,
} from "./reasoning.ts";
export {
    type DiscoveryMode,
    type ReasoningCapability,
    type ReasoningCapabilitySource,
    type ReasoningCapabilityStatus,
    type ReasoningOverride,
} from "./model-capabilities.ts";

export type ProviderScope = "system" | "user";
export const IMAGE_PROTOCOLS = ["openai", "gemini"] as const;
export type ImageProtocol = typeof IMAGE_PROTOCOLS[number];
export const LOGO_STYLES = [
    "minimal",
    "geometric",
    "glyph",
    "monoline",
    "duotone",
    "gradient",
    "soft3d",
    "mascot",
] as const;

export type LogoStyle = typeof LOGO_STYLES[number];

export interface AiProviderDto {
    id: string;
    ownerUserId: string | null;
    scope: ProviderScope;
    name: string;
    baseUrl: string;
    apiKeyMasked: string;
    discoveryMode: DiscoveryMode;
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
    supportsReasoning: boolean;
    reasoningEfforts: ReasoningEffort[];
    defaultReasoningEffort: ReasoningEffort | null;
    reasoningCapabilitySource: ReasoningCapabilitySource;
    isReasoningStrict?: boolean;
    metadataJson?: string | null;
    updatedAt: number;
}

export interface CreateProviderInput {
    name: string;
    baseUrl: string;
    apiKey: string;
    scope?: ProviderScope;
    discoveryMode?: DiscoveryMode;
    enabled?: boolean;
}

export interface UpdateProviderInput {
    name?: string;
    baseUrl?: string;
    apiKey?: string;
    discoveryMode?: DiscoveryMode;
    enabled?: boolean;
}

export interface UpdateModelInput {
    displayName?: string;
    enabled?: boolean;
    visibleToUsers?: boolean;
    isDefault?: boolean;
    reasoningOverride?: ReasoningOverride | null;
    metadataJson?: string | null;
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
    activeLeafMessageId?: string | null;
    systemInstruction?: string | null;
    deletedAt?: number | null;
    createdAt: number;
    updatedAt: number;
}

export type MessageRole = "system" | "user" | "assistant";
export type MessageStatus = "streaming" | "complete" | "interrupted" | "failed";

export interface SourceCitation {
    title: string;
    url: string;
    snippet?: string;
}

export interface TextContentPart {
    type: "text";
    text: string;
}

export interface AttachmentPart {
    type: "attachment";
    id: string;
    name: string;
    mimeType: string;
    size?: number;
    url?: string;
    data?: string;
}

export interface ToolCallPart {
    type: "tool-call";
    callId: string;
    toolName: "notes" | "apps" | "webSearch";
    args: Record<string, unknown>;
}

export interface ToolResultPart {
    type: "tool-result";
    callId: string;
    toolName: "notes" | "apps" | "webSearch";
    result: unknown;
    error?: string;
}

export interface SourcesPart {
    type: "sources";
    sources: SourceCitation[];
}

export type MessageContentPart =
    | TextContentPart
    | AttachmentPart
    | ToolCallPart
    | ToolResultPart
    | SourcesPart;
export interface AiMessageDto {
    id: string;
    conversationId: string;
    parentMessageId: string | null;
    role: MessageRole;
    content: string;
    parts?: MessageContentPart[];
    providerId: string | null;
    modelId: string | null;
    status: MessageStatus;
    variantGroupId: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    createdAt: number;
}

export interface AttachmentInput {
    id: string;
    name: string;
    type: "image" | "text";
    mimeType: string;
    data: string;
    size?: number;
}

export interface ToolsConfig {
    notes?: boolean;
    apps?: boolean;
    webSearch?: boolean;
}

export interface ChatStreamRequest extends GenerationConfig {
    conversationId?: string;
    providerId?: string;
    modelId?: string;
    message: string;
    parentMessageId?: string;
    editMessageId?: string;
    regenerateMessageId?: string;
    historyEnabled?: boolean;
    systemInstruction?: string;
    attachments?: AttachmentInput[];
    tools?: ToolsConfig;
}

export interface AiCapabilitiesDto {
    tools: {
        notes: boolean;
        apps: boolean;
        webSearch: boolean;
    };
    attachments: {
        maxFiles: number;
        maxImageSize: number;
        maxTextSize: number;
        allowedImageMimeTypes: string[];
        allowedTextMimeTypes: string[];
    };
}
