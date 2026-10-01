import type {
    AiCapabilitiesDto,
    AiConversationDto,
    AiMessageDto,
    AiModelDto,
    AiProviderDto,
    AttachmentInput,
    GenerationConfig,
    MessageContentPart,
    ReasoningEffort,
    SourceCitation,
    ToolsConfig,
} from "../../../../src/features/ai/types.ts";

export type {
    AiCapabilitiesDto,
    AiConversationDto,
    AiMessageDto,
    AiModelDto,
    AiProviderDto,
    AttachmentInput,
    GenerationConfig,
    MessageContentPart,
    ReasoningEffort,
    SourceCitation,
    ToolsConfig,
};

export const CANONICAL_REASONING_EFFORTS: readonly ReasoningEffort[] = [
    "none",
    "auto",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
] as const;

export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
    none: "关闭",
    minimal: "最低",
    low: "快速",
    medium: "标准",
    high: "深入",
    xhigh: "极深",
    max: "极深",
    auto: "自动",
};

export interface AttachmentItem extends AttachmentInput {
    file?: File;
    status?: "uploading" | "ready" | "error";
    error?: string;
}

export interface StreamMeta {
    type: "meta";
    conversationId: string;
    userMessageId?: string;
    assistantMessageId?: string;
    title?: string;
    providerId?: string;
    modelId?: string;
}

export interface ConversationFullData {
    conversation: AiConversationDto;
    messages: AiMessageDto[];
}
