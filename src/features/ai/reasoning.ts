/**
 * Reasoning canonical levels, validation, effective effort resolution,
 * transport mapping, and generation parameters synthesis.
 */

import {
    CANONICAL_REASONING_EFFORTS,
    getTransportSupportedLevels,
    isStrictReasoningModel,
    type ReasoningCapability,
    type ReasoningEffort,
    type ReasoningTransport,
    resolveReasoningTransport,
} from "./model-capabilities.ts";
import type {
    AiGenerationDefaultsDto,
    UserGenerationConfig,
} from "@shared/contracts.ts";
import type { AiModelDto } from "./types.ts";

export {
    CANONICAL_REASONING_EFFORTS,
    getTransportSupportedLevels,
    isStrictReasoningModel,
    type ReasoningEffort,
    type ReasoningTransport,
    resolveReasoningTransport,
};

export interface GenerationConfig {
    reasoningEffort?: ReasoningEffort;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
}

export class ReasoningValidationError extends Error {
    readonly statusCode: number = 400;

    constructor(message: string) {
        super(message);
        this.name = "ReasoningValidationError";
    }
}

/**
 * Validate that an explicitly provided reasoning effort matches the model's effective capability.
 * Throws ReasoningValidationError (HTTP 400) if invalid.
 */
export function validateReasoningEffort(
    effort: ReasoningEffort | undefined,
    capability: ReasoningCapability,
    modelId?: string,
): void {
    if (effort === undefined) return;

    if (capability.status === "unsupported") {
        throw new ReasoningValidationError(
            `模型 ${modelId ? `"${modelId}" ` : ""}不支持推理强度设置`,
        );
    }

    if (capability.status === "unknown" && capability.levels.length === 0) {
        throw new ReasoningValidationError(
            `模型 ${
                modelId ? `"${modelId}" ` : ""
            }的推理能力未知且未配置有效强度`,
        );
    }

    if (!capability.levels.includes(effort)) {
        const supported = capability.levels.length > 0
            ? capability.levels.join(", ")
            : "无";
        throw new ReasoningValidationError(
            `推理强度 "${effort}" 不受模型支持。支持的推理强度: ${supported}`,
        );
    }
}

/**
 * Resolve effective reasoning effort for a generation request following priority order:
 * 1. Explicit request effort
 * 2. User's saved default for model
 * 3. User's saved global default
 * 4. Model defaultLevel
 * 5. undefined
 */
export function resolveEffectiveReasoningEffort(params: {
    explicitEffort?: ReasoningEffort;
    userDefaultEffort?: ReasoningEffort;
    globalDefaultEffort?: ReasoningEffort;
    capability: ReasoningCapability;
    transport?: ReasoningTransport;
    modelId?: string;
}): ReasoningEffort | undefined {
    const {
        explicitEffort,
        userDefaultEffort,
        globalDefaultEffort,
        capability,
        transport,
        modelId,
    } = params;

    const supportedLevels = transport
        ? getTransportSupportedLevels(transport, capability)
        : capability.levels;

    if (explicitEffort !== undefined) {
        validateReasoningEffort(explicitEffort, capability, modelId);
        if (transport && !supportedLevels.includes(explicitEffort)) {
            throw new ReasoningValidationError(
                `传输适配器 "${transport.type}" 无法映射指定的推理强度 "${explicitEffort}"`,
            );
        }
        return explicitEffort;
    }

    if (
        userDefaultEffort !== undefined &&
        capability.status === "supported" &&
        supportedLevels.includes(userDefaultEffort)
    ) {
        return userDefaultEffort;
    }

    if (
        globalDefaultEffort !== undefined &&
        capability.status === "supported" &&
        supportedLevels.includes(globalDefaultEffort)
    ) {
        return globalDefaultEffort;
    }

    if (
        capability.status === "supported" &&
        capability.defaultLevel !== undefined &&
        supportedLevels.includes(capability.defaultLevel)
    ) {
        return capability.defaultLevel;
    }

    return undefined;
}

/**
 * Normalize reasoning effort when switching active model.
 * Retains current choice if supported; falls back to user default -> global default -> model default -> undefined.
 */
export function normalizeReasoningEffortOnModelSwitch(
    currentEffort: ReasoningEffort | undefined,
    targetCapability: ReasoningCapability,
    userDefaultEffort?: ReasoningEffort,
    globalDefaultEffort?: ReasoningEffort,
    targetTransport?: ReasoningTransport,
): ReasoningEffort | undefined {
    if (targetCapability.status !== "supported") {
        return undefined;
    }

    const supportedLevels = targetTransport
        ? getTransportSupportedLevels(targetTransport, targetCapability)
        : targetCapability.levels;

    if (currentEffort && supportedLevels.includes(currentEffort)) {
        return currentEffort;
    }

    if (userDefaultEffort && supportedLevels.includes(userDefaultEffort)) {
        return userDefaultEffort;
    }

    if (globalDefaultEffort && supportedLevels.includes(globalDefaultEffort)) {
        return globalDefaultEffort;
    }

    if (
        targetCapability.defaultLevel &&
        supportedLevels.includes(targetCapability.defaultLevel)
    ) {
        return targetCapability.defaultLevel;
    }

    return undefined;
}

/**
 * Resolve full generation parameters adhering to strict precedence:
 * request param -> per-model user default -> global user default -> model default.
 * Strict reasoning models reject custom temperature/topP from request, and suppress them from defaults.
 */
export function resolveEffectiveGenerationConfig(params: {
    requestConfig: {
        reasoningEffort?: ReasoningEffort;
        temperature?: number;
        topP?: number;
        maxTokens?: number;
    };
    userDefaults?: AiGenerationDefaultsDto;
    modelId: string;
    modelDbId?: string;
    capability: ReasoningCapability;
    transport?: ReasoningTransport;
    isReasoningStrict?: boolean;
}): {
    reasoningEffort?: ReasoningEffort;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
} {
    const {
        requestConfig,
        userDefaults,
        modelId,
        modelDbId,
        capability,
        transport = { type: "openai_reasoning_effort" },
        isReasoningStrict = false,
    } = params;

    const modelUserDefault = userDefaults?.models?.[modelId] ??
        (modelDbId ? userDefaults?.models?.[modelDbId] : undefined);
    const globalUserDefault = userDefaults?.default;

    const effectiveEffort = resolveEffectiveReasoningEffort({
        explicitEffort: requestConfig.reasoningEffort,
        userDefaultEffort: modelUserDefault?.reasoningEffort,
        globalDefaultEffort: globalUserDefault?.reasoningEffort,
        capability,
        transport,
        modelId,
    });

    if (isReasoningStrict) {
        if (requestConfig.temperature !== undefined) {
            throw new ReasoningValidationError(
                "严格推理模型不允许自定义 temperature 参数",
            );
        }
        if (requestConfig.topP !== undefined) {
            throw new ReasoningValidationError(
                "严格推理模型不允许自定义 top_p 参数",
            );
        }
        const maxTokens = requestConfig.maxTokens ??
            modelUserDefault?.maxTokens ??
            globalUserDefault?.maxTokens;
        return {
            reasoningEffort: effectiveEffort,
            maxTokens,
        };
    }

    const temperature = requestConfig.temperature ??
        modelUserDefault?.temperature ??
        globalUserDefault?.temperature;
    const topP = requestConfig.topP ??
        modelUserDefault?.topP ??
        globalUserDefault?.topP;
    const maxTokens = requestConfig.maxTokens ??
        modelUserDefault?.maxTokens ??
        globalUserDefault?.maxTokens;

    return {
        reasoningEffort: effectiveEffort,
        temperature,
        topP,
        maxTokens,
    };
}

/**
 * Resolve generation configuration when switching models in UI:
 * Applies per-model user defaults if present, else global user defaults, else currentConfig.
 * Omit temperature/topP for strict reasoning models; filters reasoningEffort against targetModel.reasoningEfforts.
 */
export function resolveModelSwitchGenerationConfig(params: {
    currentConfig?: UserGenerationConfig;
    targetModel: AiModelDto;
    userDefaults?: AiGenerationDefaultsDto;
}): UserGenerationConfig {
    const { currentConfig, targetModel, userDefaults } = params;
    const modelDefault = userDefaults?.models?.[targetModel.modelId] ??
        userDefaults?.models?.[targetModel.id];
    const globalDefault = userDefaults?.default;

    const reasoningEffort = targetModel.supportsReasoning
        ? [
            currentConfig?.reasoningEffort,
            modelDefault?.reasoningEffort,
            globalDefault?.reasoningEffort,
            targetModel.defaultReasoningEffort ?? undefined,
        ]
            .find((effort) =>
                effort !== undefined &&
                targetModel.reasoningEfforts.includes(effort)
            )
        : undefined;

    if (targetModel.isReasoningStrict) {
        return {
            reasoningEffort,
            maxTokens: modelDefault?.maxTokens ??
                currentConfig?.maxTokens ??
                globalDefault?.maxTokens,
        };
    }

    return {
        reasoningEffort,
        temperature: modelDefault?.temperature ??
            currentConfig?.temperature ??
            globalDefault?.temperature,
        topP: modelDefault?.topP ??
            currentConfig?.topP ??
            globalDefault?.topP,
        maxTokens: modelDefault?.maxTokens ??
            currentConfig?.maxTokens ??
            globalDefault?.maxTokens,
    };
}

/**
 * Map canonical reasoning level to provider transport payload.
 * Rejects unmappable explicit values with ReasoningValidationError rather than silently dropping.
 */
export function mapReasoningTransport(
    effort: ReasoningEffort | undefined,
    transport: ReasoningTransport = { type: "openai_reasoning_effort" },
    capability?: ReasoningCapability,
): Record<string, unknown> {
    if (effort === undefined) return {};

    const supported = getTransportSupportedLevels(transport, capability);
    if (!supported.includes(effort)) {
        throw new ReasoningValidationError(
            `传输适配器 "${transport.type}" 无法映射指定的推理强度 "${effort}"`,
        );
    }

    switch (transport.type) {
        case "openai_reasoning_effort": {
            return { reasoning_effort: effort };
        }
        case "boolean": {
            return { [transport.parameter]: effort !== "none" };
        }
        case "custom": {
            const val = transport.valueMap[effort];
            if (val !== undefined) {
                return { [transport.parameter]: val };
            }
            throw new ReasoningValidationError(
                `自定义参数缺少针对推理强度 "${effort}" 的映射`,
            );
        }
        case "unsupported": {
            throw new ReasoningValidationError("该模型不支持推理强度传输");
        }
    }
}

/**
 * Build generation parameters for OpenAI-compatible providers,
 * validating bounds and rejecting incompatible sampling parameters for strict reasoning models.
 */
export function buildProviderGenerationParams(
    config: GenerationConfig,
    capability: ReasoningCapability,
    transport: ReasoningTransport = { type: "openai_reasoning_effort" },
    options?: { isReasoningStrict?: boolean },
): Record<string, unknown> {
    if (
        config.temperature !== undefined &&
        (config.temperature < 0 || config.temperature > 2)
    ) {
        throw new ReasoningValidationError("temperature 必须在 0 到 2 之间");
    }

    if (config.topP !== undefined && (config.topP < 0 || config.topP > 1)) {
        throw new ReasoningValidationError("topP 必须在 0 到 1 之间");
    }

    if (
        config.maxTokens !== undefined &&
        (!Number.isInteger(config.maxTokens) || config.maxTokens <= 0)
    ) {
        throw new ReasoningValidationError(
            "maxTokens 必须是大于 0 的正整数",
        );
    }

    validateReasoningEffort(config.reasoningEffort, capability);

    // Strict reasoning models (e.g. o1/o3) strictly forbid temperature/top_p.
    // Explicit values must throw 4xx rather than being silently stripped.
    if (options?.isReasoningStrict) {
        if (config.temperature !== undefined) {
            throw new ReasoningValidationError(
                "严格推理模型不允许自定义 temperature 参数",
            );
        }
        if (config.topP !== undefined) {
            throw new ReasoningValidationError(
                "严格推理模型不允许自定义 topP 参数",
            );
        }
    }

    const result: Record<string, unknown> = {};

    if (config.temperature !== undefined) {
        result.temperature = config.temperature;
    }
    if (config.topP !== undefined) {
        result.top_p = config.topP;
    }

    if (config.maxTokens !== undefined) {
        result.max_tokens = config.maxTokens;
    }

    const reasoningPayload = mapReasoningTransport(
        config.reasoningEffort,
        transport,
        capability,
    );
    return { ...result, ...reasoningPayload };
}
