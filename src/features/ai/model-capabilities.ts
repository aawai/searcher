/**
 * Model reasoning capabilities, resolution hierarchy, discovery normalization,
 * and metadata JSON persistence.
 */

export type ReasoningEffort =
    | "none"
    | "auto"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max";

export const CANONICAL_REASONING_EFFORTS = [
    "none",
    "auto",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
] as const;

export type ReasoningCapabilityStatus = "supported" | "unsupported" | "unknown";
export type ReasoningCapabilitySource =
    | "manual"
    | "provider"
    | "preset"
    | "inferred"
    | "unknown";

export interface ReasoningCapability {
    status: ReasoningCapabilityStatus;
    levels: ReasoningEffort[];
    defaultLevel?: ReasoningEffort;
    source: ReasoningCapabilitySource;
}

export interface ReasoningOverride {
    enabled: boolean;
    levels?: ReasoningEffort[];
    defaultLevel?: ReasoningEffort;
}

export type DiscoveryMode = "auto" | "openai-compatible" | "cliproxyapi";

export type ReasoningTransport =
    | { type: "openai_reasoning_effort" }
    | { type: "boolean"; parameter: string }
    | {
        type: "custom";
        parameter: string;
        valueMap: Partial<Record<ReasoningEffort, string | number | boolean>>;
    }
    | { type: "unsupported" };

export interface ModelMetadata {
    capabilities?: {
        discovered?: {
            reasoning?: ReasoningCapability;
            transport?: ReasoningTransport;
        };
        overrides?: {
            reasoning?: ReasoningOverride;
            transport?: ReasoningTransport;
        };
        transport?: ReasoningTransport;
    };
    discoveryMode?: DiscoveryMode;
    transport?: ReasoningTransport;
    reasoningTransport?: ReasoningTransport;
    isReasoningStrict?: boolean;
    strictReasoning?: boolean;
    [key: string]: unknown;
}

export function isValidReasoningEffort(val: unknown): val is ReasoningEffort {
    return typeof val === "string" &&
        CANONICAL_REASONING_EFFORTS.includes(val as ReasoningEffort);
}

/**
 * Built-in presets for models with officially documented reasoning_effort support.
 * Third-party models (e.g. DeepSeek, Claude) do not assume OpenAI reasoning_effort
 * without explicit provider capability metadata or manual configuration.
 */
export const BUILTIN_MODEL_PRESETS: Record<string, {
    status: ReasoningCapabilityStatus;
    levels: ReasoningEffort[];
    defaultLevel?: ReasoningEffort;
}> = {
    "o1": {
        status: "supported",
        levels: ["low", "medium", "high"],
        defaultLevel: "medium",
    },
    "o1-preview": {
        status: "supported",
        levels: ["low", "medium", "high"],
        defaultLevel: "medium",
    },
    "o1-mini": {
        status: "supported",
        levels: ["low", "medium", "high"],
        defaultLevel: "medium",
    },
    "o3": {
        status: "supported",
        levels: ["low", "medium", "high"],
        defaultLevel: "medium",
    },
    "o3-mini": {
        status: "supported",
        levels: ["low", "medium", "high"],
        defaultLevel: "medium",
    },
    "gpt-4o": { status: "unsupported", levels: [] },
    "gpt-4o-mini": { status: "unsupported", levels: [] },
    "gpt-4-turbo": { status: "unsupported", levels: [] },
    "claude-3-5-sonnet": { status: "unsupported", levels: [] },
};

/**
 * Infer reasoning capability from model name as a low-confidence fallback.
 * Strictly limited to official OpenAI o-series models.
 */
export function inferReasoningCapabilityFromName(
    modelId: string,
): ReasoningCapability | null {
    const id = modelId.toLowerCase().trim();
    if (/^o[13](?:-(?:mini|preview))?(?:[-_.][a-z0-9]+)*$/i.test(id)) {
        return {
            status: "supported",
            levels: ["low", "medium", "high"],
            defaultLevel: "medium",
            source: "inferred",
        };
    }
    return null;
}

export function validateReasoningTransport(
    raw: unknown,
): ReasoningTransport | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const t = raw as Record<string, unknown>;
    if (t.type === "openai_reasoning_effort") {
        return { type: "openai_reasoning_effort" };
    }
    if (t.type === "boolean" && typeof t.parameter === "string") {
        return { type: "boolean", parameter: t.parameter };
    }
    if (
        t.type === "custom" &&
        typeof t.parameter === "string" &&
        t.valueMap &&
        typeof t.valueMap === "object" &&
        !Array.isArray(t.valueMap)
    ) {
        return {
            type: "custom",
            parameter: t.parameter,
            valueMap: t.valueMap as Partial<
                Record<ReasoningEffort, string | number | boolean>
            >,
        };
    }
    if (t.type === "unsupported") {
        return { type: "unsupported" };
    }
    return undefined;
}

/**
 * Validate and sanitize parsed JSON at runtime into a safe ModelMetadata structure.
 * Malformed arrays or fields cannot crash the resolver.
 */
export function validateModelMetadata(raw: unknown): ModelMetadata {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {};
    }

    const record = raw as Record<string, unknown>;
    const result: ModelMetadata = {};

    if (record.isReasoningStrict === true) {
        result.isReasoningStrict = true;
    }
    if (record.strictReasoning === true) {
        result.strictReasoning = true;
    }

    const topTransport = validateReasoningTransport(
        record.transport ?? record.reasoningTransport,
    );
    if (topTransport) {
        result.transport = topTransport;
    }

    // Validate discoveryMode
    if (
        record.discoveryMode === "auto" ||
        record.discoveryMode === "openai-compatible" ||
        record.discoveryMode === "cliproxyapi"
    ) {
        result.discoveryMode = record.discoveryMode;
    }

    // Validate capabilities
    if (
        record.capabilities &&
        typeof record.capabilities === "object" &&
        !Array.isArray(record.capabilities)
    ) {
        const capsRecord = record.capabilities as Record<string, unknown>;
        const capabilities: NonNullable<ModelMetadata["capabilities"]> = {};

        // 1. discovered.reasoning
        if (
            capsRecord.discovered &&
            typeof capsRecord.discovered === "object" &&
            !Array.isArray(capsRecord.discovered)
        ) {
            const discRecord = capsRecord.discovered as Record<string, unknown>;
            if (
                discRecord.reasoning &&
                typeof discRecord.reasoning === "object" &&
                !Array.isArray(discRecord.reasoning)
            ) {
                const r = discRecord.reasoning as Record<string, unknown>;
                const status = r.status === "supported" ||
                        r.status === "unsupported" ||
                        r.status === "unknown"
                    ? r.status
                    : "unknown";
                const source = r.source === "manual" ||
                        r.source === "provider" ||
                        r.source === "preset" ||
                        r.source === "inferred"
                    ? r.source
                    : "provider";
                const levels: ReasoningEffort[] = Array.isArray(r.levels)
                    ? r.levels.filter(isValidReasoningEffort)
                    : [];
                const defaultLevel = isValidReasoningEffort(r.defaultLevel) &&
                        levels.includes(r.defaultLevel)
                    ? r.defaultLevel
                    : undefined;

                capabilities.discovered = {
                    reasoning: {
                        status,
                        levels,
                        defaultLevel,
                        source,
                    },
                };
            }
            const discTransport = validateReasoningTransport(
                discRecord.transport,
            );
            if (discTransport) {
                capabilities.discovered = capabilities.discovered || {};
                capabilities.discovered.transport = discTransport;
            }
        }

        // 2. overrides.reasoning
        if (
            capsRecord.overrides &&
            typeof capsRecord.overrides === "object" &&
            !Array.isArray(capsRecord.overrides)
        ) {
            const overRecord = capsRecord.overrides as Record<string, unknown>;
            if (
                overRecord.reasoning &&
                typeof overRecord.reasoning === "object" &&
                !Array.isArray(overRecord.reasoning)
            ) {
                const o = overRecord.reasoning as Record<string, unknown>;
                if (typeof o.enabled === "boolean") {
                    const levels: ReasoningEffort[] = Array.isArray(o.levels)
                        ? o.levels.filter(isValidReasoningEffort)
                        : [];
                    const defaultLevel =
                        isValidReasoningEffort(o.defaultLevel) &&
                            levels.includes(o.defaultLevel)
                            ? o.defaultLevel
                            : undefined;

                    capabilities.overrides = {
                        reasoning: {
                            enabled: o.enabled,
                            levels,
                            defaultLevel,
                        },
                    };
                }
            }
            const overTransport = validateReasoningTransport(
                overRecord.transport,
            );
            if (overTransport) {
                capabilities.overrides = capabilities.overrides || {};
                capabilities.overrides.transport = overTransport;
            }
        }

        const capTransport = validateReasoningTransport(capsRecord.transport);
        if (capTransport) {
            capabilities.transport = capTransport;
        }

        if (
            capabilities.discovered || capabilities.overrides ||
            capabilities.transport
        ) {
            result.capabilities = capabilities;
        }
    }
    return result;
}

/**
 * Safely parse metadata JSON string into validated ModelMetadata.
 */
export function parseModelMetadata(
    metadataJson: string | null | undefined,
): ModelMetadata {
    if (!metadataJson || typeof metadataJson !== "string") return {};
    try {
        const parsed = JSON.parse(metadataJson);
        return validateModelMetadata(parsed);
    } catch {
        return {};
    }
}

/**
 * Normalize raw model object from provider /models response.
 * Strictly exposes only Provider-returned levels without inventing defaults.
 * Unknown capabilities return status "unknown" with source "unknown", NOT "unsupported".
 */
export function normalizeRawModelCapabilities(
    rawModel: Record<string, unknown>,
    _modelId: string,
): ReasoningCapability {
    if (!rawModel || typeof rawModel !== "object") {
        return { status: "unknown", levels: [], source: "unknown" };
    }

    // 1. Check capabilities.reasoning (e.g. from CLIProxyAPIHome or modern providers)
    if (rawModel.capabilities && typeof rawModel.capabilities === "object") {
        const capObj = (rawModel.capabilities as Record<string, unknown>)
            .reasoning;
        if (capObj && typeof capObj === "object") {
            const reasoning = capObj as Record<string, unknown>;
            if (
                reasoning.status === "unsupported" ||
                reasoning.supported === false
            ) {
                return {
                    status: "unsupported",
                    levels: [],
                    source: "provider",
                };
            }
            if (Array.isArray(reasoning.levels)) {
                const validLevels = reasoning.levels.filter(
                    isValidReasoningEffort,
                );
                const defaultLevel = isValidReasoningEffort(
                        reasoning.defaultLevel,
                    ) && validLevels.includes(reasoning.defaultLevel)
                    ? reasoning.defaultLevel
                    : undefined;
                return {
                    status: "supported",
                    levels: validLevels,
                    defaultLevel,
                    source: "provider",
                };
            }
            if (
                reasoning.status === "supported" || reasoning.supported === true
            ) {
                // Provider returned supported without explicit levels: DO NOT invent levels!
                return {
                    status: "supported",
                    levels: [],
                    defaultLevel: undefined,
                    source: "provider",
                };
            }
        }
    }

    // 2. Check reasoning_efforts or supported_reasoning_efforts array
    const effortsArray = rawModel.reasoning_efforts ??
        rawModel.supported_reasoning_efforts;
    if (Array.isArray(effortsArray)) {
        const validLevels = effortsArray.filter(isValidReasoningEffort);
        return {
            status: "supported",
            levels: validLevels,
            defaultLevel: undefined,
            source: "provider",
        };
    }

    // 3. Check reasoning field (boolean or object)
    if (typeof rawModel.reasoning === "boolean") {
        if (!rawModel.reasoning) {
            return { status: "unsupported", levels: [], source: "provider" };
        }
        // Provider returned boolean true: supported, but no levels returned.
        // DO NOT invent levels.
        return {
            status: "supported",
            levels: [],
            defaultLevel: undefined,
            source: "provider",
        };
    }

    if (rawModel.reasoning && typeof rawModel.reasoning === "object") {
        const rObj = rawModel.reasoning as Record<string, unknown>;
        if (rObj.status === "unsupported" || rObj.supported === false) {
            return { status: "unsupported", levels: [], source: "provider" };
        }
        if (Array.isArray(rObj.levels)) {
            const validLevels = rObj.levels.filter(isValidReasoningEffort);
            const defaultLevel = isValidReasoningEffort(rObj.defaultLevel) &&
                    validLevels.includes(rObj.defaultLevel)
                ? rObj.defaultLevel
                : undefined;
            return {
                status: "supported",
                levels: validLevels,
                defaultLevel,
                source: "provider",
            };
        }
        if (rObj.status === "supported" || rObj.supported === true) {
            return {
                status: "supported",
                levels: [],
                defaultLevel: undefined,
                source: "provider",
            };
        }
    }

    // 4. No recognized reasoning metadata: must be "unknown", never assume "unsupported"!
    return { status: "unknown", levels: [], source: "unknown" };
}

/**
 * Resolve effective reasoning capability following the strict precedence:
 * manual override -> discovered provider capability -> preset -> inference -> unknown
 */
export function resolveEffectiveCapability(
    metadataJson: string | null | undefined,
    modelId: string,
): ReasoningCapability {
    const metadata = parseModelMetadata(metadataJson);

    // 1. Manual override (highest priority)
    const override = metadata.capabilities?.overrides?.reasoning;
    if (override && typeof override === "object") {
        if (!override.enabled) {
            return { status: "unsupported", levels: [], source: "manual" };
        }
        const defaultLevels: ReasoningEffort[] = ["low", "medium", "high"];
        const levels: ReasoningEffort[] = Array.isArray(override.levels)
            ? override.levels.filter(isValidReasoningEffort)
            : defaultLevels;
        const defaultLevel: ReasoningEffort | undefined =
            override.defaultLevel &&
                isValidReasoningEffort(override.defaultLevel) &&
                levels.includes(override.defaultLevel)
                ? override.defaultLevel
                : levels.includes("medium")
                ? "medium"
                : levels[0];
        return {
            status: "supported",
            levels,
            defaultLevel,
            source: "manual",
        };
    }

    // 2. Discovered provider capability
    const discovered = metadata.capabilities?.discovered?.reasoning;
    if (discovered && typeof discovered === "object") {
        if (
            discovered.status === "supported" ||
            discovered.status === "unsupported"
        ) {
            return {
                status: discovered.status,
                levels: Array.isArray(discovered.levels)
                    ? discovered.levels.filter(isValidReasoningEffort)
                    : [],
                defaultLevel: discovered.defaultLevel &&
                        isValidReasoningEffort(discovered.defaultLevel)
                    ? discovered.defaultLevel
                    : undefined,
                source: "provider",
            };
        }
    }

    // 3. Searcher built-in model preset
    const preset = BUILTIN_MODEL_PRESETS[modelId.toLowerCase()];
    if (preset) {
        return {
            status: preset.status,
            levels: preset.levels,
            defaultLevel: preset.defaultLevel,
            source: "preset",
        };
    }

    // 4. Model-name inference
    const inferred = inferReasoningCapabilityFromName(modelId);
    if (inferred) {
        return inferred;
    }

    // 5. Unknown fallback
    return { status: "unknown", levels: [], source: "unknown" };
}

/**
 * Merge newly discovered capability into existing metadata JSON string.
 * Manual overrides are strictly preserved.
 */
export function mergeModelMetadata(
    existingMetadataJson: string | null | undefined,
    discoveredCapability: ReasoningCapability,
    options?: { discoveryMode?: DiscoveryMode },
): string {
    const metadata = parseModelMetadata(existingMetadataJson);
    metadata.capabilities = metadata.capabilities || {};
    metadata.capabilities.discovered = metadata.capabilities.discovered || {};
    metadata.capabilities.discovered.reasoning = discoveredCapability;

    if (options?.discoveryMode) {
        metadata.discoveryMode = options.discoveryMode;
    }

    return JSON.stringify(metadata);
}

/**
 * Apply or clear manual reasoning override in metadata JSON string.
 * If override is null, removes overrides.reasoning (reverting to auto-discovered).
 * Discovered capabilities are strictly preserved.
 */
export function applyManualOverride(
    existingMetadataJson: string | null | undefined,
    override: ReasoningOverride | null,
): string {
    const metadata = parseModelMetadata(existingMetadataJson);
    metadata.capabilities = metadata.capabilities || {};

    if (override === null) {
        if (metadata.capabilities.overrides) {
            delete metadata.capabilities.overrides.reasoning;
            if (Object.keys(metadata.capabilities.overrides).length === 0) {
                delete metadata.capabilities.overrides;
            }
        }
    } else {
        metadata.capabilities.overrides = metadata.capabilities.overrides || {};
        metadata.capabilities.overrides.reasoning = override;
    }

    return JSON.stringify(metadata);
}

/**
 * Determine if a model is a strict reasoning model (e.g. o1/o3) that disallows custom temperature/topP.
 */
export function isStrictReasoningModel(
    modelId: string,
    metadata?: ModelMetadata,
): boolean {
    if (
        metadata?.isReasoningStrict === true ||
        metadata?.strictReasoning === true
    ) {
        return true;
    }
    const id = modelId.toLowerCase().trim();
    return /^o[13](?:-(?:mini|preview))?(?:[-_.][a-z0-9]+)*$/i.test(id);
}

/**
 * Return the intersection of levels supported by both the transport and the model capability.
 * Never invents semantics (e.g. boolean transport strictly excludes "auto").
 */
export function getTransportSupportedLevels(
    transport: ReasoningTransport,
    capability?: ReasoningCapability,
): ReasoningEffort[] {
    let transportSupported: readonly ReasoningEffort[];

    switch (transport.type) {
        case "openai_reasoning_effort": {
            // Modern OpenAI-compatible transports support minimal through max.
            // "none" and "auto" are supported only if the provider/model capability explicitly declares them.
            const standard: ReasoningEffort[] = [
                "minimal",
                "low",
                "medium",
                "high",
                "xhigh",
                "max",
            ];
            if (capability?.levels.includes("none")) {
                standard.unshift("none");
            }
            if (capability?.levels.includes("auto")) {
                standard.push("auto");
            }
            transportSupported = standard;
            break;
        }
        case "boolean": {
            // Boolean transports map "none" -> false, and explicit intensities -> true.
            // "auto" has no boolean semantics and is strictly excluded.
            transportSupported = [
                "none",
                "minimal",
                "low",
                "medium",
                "high",
                "xhigh",
                "max",
            ];
            break;
        }
        case "custom": {
            transportSupported = (
                Object.keys(transport.valueMap) as ReasoningEffort[]
            ).filter((k) => CANONICAL_REASONING_EFFORTS.includes(k));
            break;
        }
        case "unsupported": {
            return [];
        }
    }

    if (!capability || capability.levels.length === 0) {
        return [...transportSupported];
    }

    // Intersect with model capability levels
    return transportSupported.filter((level) =>
        capability.levels.includes(level)
    );
}

/**
 * Resolve transport configuration from model metadata.
 * Defaults to standard "openai_reasoning_effort" if unspecified.
 */
export function resolveReasoningTransport(
    metadataJson?: string | null,
): ReasoningTransport {
    const metadata = parseModelMetadata(metadataJson);
    const rawTransport = metadata.capabilities?.overrides?.transport ??
        metadata.capabilities?.discovered?.transport ??
        metadata.capabilities?.transport ??
        metadata.reasoningTransport ??
        metadata.transport;
    return validateReasoningTransport(rawTransport) ??
        { type: "openai_reasoning_effort" };
}

/**
 * Helper to populate DTO convenience fields from model metadata and modelId.
 * Strictly filters reasoningEfforts by transport so unmappable levels are never offered.
 */
export function populateModelDtoCapabilities(
    model: {
        id: string;
        modelId: string;
        metadataJson?: string | null;
    },
    transport?: ReasoningTransport,
): {
    supportsReasoning: boolean;
    reasoningEfforts: ReasoningEffort[];
    defaultReasoningEffort: ReasoningEffort | null;
    reasoningCapabilitySource: ReasoningCapabilitySource;
    isReasoningStrict: boolean;
} {
    const metadata = parseModelMetadata(model.metadataJson);
    const cap = resolveEffectiveCapability(model.metadataJson, model.modelId);
    const actualTransport = transport ??
        resolveReasoningTransport(model.metadataJson);
    const isStrict = isStrictReasoningModel(model.modelId, metadata);

    if (cap.status !== "supported" || actualTransport.type === "unsupported") {
        return {
            supportsReasoning: false,
            reasoningEfforts: [],
            defaultReasoningEffort: null,
            reasoningCapabilitySource: cap.source,
            isReasoningStrict: isStrict,
        };
    }

    const effectiveLevels = getTransportSupportedLevels(actualTransport, cap);
    if (cap.levels.length > 0 && effectiveLevels.length === 0) {
        return {
            supportsReasoning: false,
            reasoningEfforts: [],
            defaultReasoningEffort: null,
            reasoningCapabilitySource: cap.source,
            isReasoningStrict: isStrict,
        };
    }

    const defaultReasoningEffort =
        cap.defaultLevel && effectiveLevels.includes(cap.defaultLevel)
            ? cap.defaultLevel
            : null;

    return {
        supportsReasoning: true,
        reasoningEfforts: effectiveLevels,
        defaultReasoningEffort,
        reasoningCapabilitySource: cap.source,
        isReasoningStrict: isStrict,
    };
}
