import { assertEquals, assertThrows } from "@std/assert";
import {
    buildProviderGenerationParams,
    CANONICAL_REASONING_EFFORTS,
    type GenerationConfig,
    getTransportSupportedLevels,
    mapReasoningTransport,
    normalizeReasoningEffortOnModelSwitch,
    type ReasoningEffort,
    type ReasoningTransport,
    ReasoningValidationError,
    resolveEffectiveGenerationConfig,
    resolveEffectiveReasoningEffort,
    resolveModelSwitchGenerationConfig,
    validateReasoningEffort,
} from "./reasoning.ts";
import type { ReasoningCapability } from "./model-capabilities.ts";
import type { AiModelDto } from "./types.ts";
import type { AiGenerationDefaultsDto } from "@shared/contracts.ts";

Deno.test("Reasoning: canonical levels match contract", () => {
    assertEquals(CANONICAL_REASONING_EFFORTS, [
        "none",
        "auto",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
    ]);
});

Deno.test("Reasoning: getTransportSupportedLevels exposes supported intersection", () => {
    // OpenAI transport supports full range minimal-max, and none/auto if capability declares
    const openAiTransport: ReasoningTransport = {
        type: "openai_reasoning_effort",
    };
    const capWithAutoNone: ReasoningCapability = {
        status: "supported",
        levels: ["none", "low", "medium", "high", "auto"],
        source: "provider",
    };
    const supported = getTransportSupportedLevels(
        openAiTransport,
        capWithAutoNone,
    );
    assertEquals(supported, ["none", "low", "medium", "high", "auto"]);

    // Boolean transport strictly excludes "auto"
    const boolTransport: ReasoningTransport = {
        type: "boolean",
        parameter: "enable_thinking",
    };
    const boolSupported = getTransportSupportedLevels(
        boolTransport,
        capWithAutoNone,
    );
    assertEquals(boolSupported, ["none", "low", "medium", "high"]);
    assertEquals(boolSupported.includes("auto"), false);
});

Deno.test("Reasoning: validateReasoningEffort permits undefined for any capability", () => {
    const unsupportedCap: ReasoningCapability = {
        status: "unsupported",
        levels: [],
        source: "preset",
    };
    const unknownCap: ReasoningCapability = {
        status: "unknown",
        levels: [],
        source: "unknown",
    };
    const supportedCap: ReasoningCapability = {
        status: "supported",
        levels: ["low", "medium", "high"],
        defaultLevel: "medium",
        source: "provider",
    };

    validateReasoningEffort(undefined, unsupportedCap);
    validateReasoningEffort(undefined, unknownCap);
    validateReasoningEffort(undefined, supportedCap);
});

Deno.test("Reasoning: validateReasoningEffort throws on unsupported models", () => {
    const unsupportedCap: ReasoningCapability = {
        status: "unsupported",
        levels: [],
        source: "preset",
    };
    const err = assertThrows(
        () => validateReasoningEffort("medium", unsupportedCap, "gpt-4o"),
        ReasoningValidationError,
    ) as ReasoningValidationError;
    assertEquals(err.statusCode, 400);
});

Deno.test("Reasoning: validateReasoningEffort throws on levels not in model capability", () => {
    const cap: ReasoningCapability = {
        status: "supported",
        levels: ["low", "medium", "high"],
        defaultLevel: "medium",
        source: "provider",
    };
    assertThrows(
        () => validateReasoningEffort("xhigh", cap, "o1-mini"),
        ReasoningValidationError,
    );
    assertThrows(
        () => validateReasoningEffort("auto", cap, "o1-mini"),
        ReasoningValidationError,
    );
    assertThrows(
        () => validateReasoningEffort("none", cap, "o1-mini"),
        ReasoningValidationError,
    );

    // Valid levels pass without error
    validateReasoningEffort("low", cap, "o1-mini");
    validateReasoningEffort("medium", cap, "o1-mini");
    validateReasoningEffort("high", cap, "o1-mini");
});

Deno.test("Reasoning: resolveEffectiveReasoningEffort priority order", () => {
    const cap: ReasoningCapability = {
        status: "supported",
        levels: ["low", "medium", "high"],
        defaultLevel: "medium",
        source: "provider",
    };

    // Priority 1: Explicit choice in request
    assertEquals(
        resolveEffectiveReasoningEffort({
            explicitEffort: "high",
            userDefaultEffort: "low",
            capability: cap,
        }),
        "high",
    );

    // Priority 2: User default for model
    assertEquals(
        resolveEffectiveReasoningEffort({
            explicitEffort: undefined,
            userDefaultEffort: "low",
            capability: cap,
        }),
        "low",
    );

    // Priority 3: Model defaultLevel
    assertEquals(
        resolveEffectiveReasoningEffort({
            explicitEffort: undefined,
            userDefaultEffort: undefined,
            capability: cap,
        }),
        "medium",
    );

    // Priority 4: undefined when capability has no defaultLevel
    const capNoDefault: ReasoningCapability = {
        status: "supported",
        levels: ["low", "high"],
        source: "provider",
    };
    assertEquals(
        resolveEffectiveReasoningEffort({
            explicitEffort: undefined,
            userDefaultEffort: undefined,
            capability: capNoDefault,
        }),
        undefined,
    );
});

Deno.test("Reasoning: normalizeReasoningEffortOnModelSwitch retains compatible levels or falls back", () => {
    const targetModelCap: ReasoningCapability = {
        status: "supported",
        levels: ["low", "medium", "high"],
        defaultLevel: "medium",
        source: "provider",
    };

    // Kept if valid on target model
    assertEquals(
        normalizeReasoningEffortOnModelSwitch("high", targetModelCap),
        "high",
    );

    // Falls back to user default if explicit is invalid (e.g. xhigh)
    assertEquals(
        normalizeReasoningEffortOnModelSwitch(
            "xhigh",
            targetModelCap,
            "low",
        ),
        "low",
    );

    // Falls back to model defaultLevel if user default is also invalid
    assertEquals(
        normalizeReasoningEffortOnModelSwitch(
            "xhigh",
            targetModelCap,
            "max" as ReasoningEffort,
        ),
        "medium",
    );

    // Falls back to undefined when target model does not support reasoning
    const unsupportedCap: ReasoningCapability = {
        status: "unsupported",
        levels: [],
        source: "preset",
    };
    assertEquals(
        normalizeReasoningEffortOnModelSwitch("high", unsupportedCap),
        undefined,
    );
});

Deno.test("Reasoning: mapReasoningTransport maps exactly and rejects unmappable values", () => {
    const capWithExtended: ReasoningCapability = {
        status: "supported",
        levels: ["minimal", "low", "medium", "high", "xhigh", "max"],
        source: "provider",
    };

    // OpenAI standard transport maps supported levels exactly
    assertEquals(
        mapReasoningTransport(
            "medium",
            { type: "openai_reasoning_effort" },
            capWithExtended,
        ),
        { reasoning_effort: "medium" },
    );
    assertEquals(
        mapReasoningTransport(
            "minimal",
            { type: "openai_reasoning_effort" },
            capWithExtended,
        ),
        { reasoning_effort: "minimal" },
    );
    assertEquals(
        mapReasoningTransport(
            "xhigh",
            { type: "openai_reasoning_effort" },
            capWithExtended,
        ),
        { reasoning_effort: "xhigh" },
    );

    // Unmappable explicit value throws rather than silently dropping
    assertThrows(
        () =>
            mapReasoningTransport(
                "auto",
                { type: "boolean", parameter: "thinking" },
                capWithExtended,
            ),
        ReasoningValidationError,
    );

    // Boolean transport maps none -> false and explicit levels -> true
    assertEquals(
        mapReasoningTransport(
            "high",
            { type: "boolean", parameter: "enable_thinking" },
            capWithExtended,
        ),
        { enable_thinking: true },
    );
    assertEquals(
        mapReasoningTransport(
            "none",
            { type: "boolean", parameter: "enable_thinking" },
            {
                status: "supported",
                levels: ["none", "high"],
                source: "provider",
            },
        ),
        { enable_thinking: false },
    );

    // Custom transport
    const custom: ReasoningTransport = {
        type: "custom",
        parameter: "thinking_budget",
        valueMap: {
            low: 1024,
            medium: 4096,
            high: 8192,
        },
    };
    assertEquals(
        mapReasoningTransport("medium", custom, {
            status: "supported",
            levels: ["low", "medium", "high"],
            source: "provider",
        }),
        { thinking_budget: 4096 },
    );
    // Value missing in custom map throws
    assertThrows(
        () =>
            mapReasoningTransport("xhigh", custom, {
                status: "supported",
                levels: ["xhigh"],
                source: "provider",
            }),
        ReasoningValidationError,
    );
});

Deno.test("Reasoning: buildProviderGenerationParams validates and rejects incompatible sampling", () => {
    const cap: ReasoningCapability = {
        status: "supported",
        levels: ["low", "medium", "high"],
        defaultLevel: "medium",
        source: "provider",
    };
    const config: GenerationConfig = {
        reasoningEffort: "high",
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 2000,
    };
    const params = buildProviderGenerationParams(config, cap, {
        type: "openai_reasoning_effort",
    });

    assertEquals(params.reasoning_effort, "high");
    assertEquals(params.max_tokens, 2000);
    assertEquals(params.temperature, 0.7);
    assertEquals(params.top_p, 0.9);

    // Strict reasoning model (o1/o3) throws 4xx on incompatible temperature/top_p (never silent drop)
    assertThrows(
        () =>
            buildProviderGenerationParams(
                config,
                cap,
                { type: "openai_reasoning_effort" },
                { isReasoningStrict: true },
            ),
        ReasoningValidationError,
    );

    // Strict reasoning model with only maxTokens and reasoningEffort succeeds
    const strictValid = buildProviderGenerationParams(
        { reasoningEffort: "high", maxTokens: 1000 },
        cap,
        { type: "openai_reasoning_effort" },
        { isReasoningStrict: true },
    );
    assertEquals(strictValid.reasoning_effort, "high");
    assertEquals(strictValid.max_tokens, 1000);

    // Out of range parameters throw ReasoningValidationError
    assertThrows(
        () =>
            buildProviderGenerationParams(
                { temperature: 2.5 },
                cap,
            ),
        ReasoningValidationError,
    );
    assertThrows(
        () =>
            buildProviderGenerationParams(
                { topP: -0.1 },
                cap,
            ),
        ReasoningValidationError,
    );
    assertThrows(
        () =>
            buildProviderGenerationParams(
                { maxTokens: -5 },
                cap,
            ),
        ReasoningValidationError,
    );
});

Deno.test("Reasoning: resolveEffectiveGenerationConfig follows strict precedence hierarchy", () => {
    const cap: ReasoningCapability = {
        status: "supported",
        levels: ["low", "medium", "high"],
        defaultLevel: "medium",
        source: "preset",
    };

    const userDefaults: AiGenerationDefaultsDto = {
        default: {
            temperature: 0.8,
            topP: 0.95,
            maxTokens: 2000,
            reasoningEffort: "low",
        },
        models: {
            "gpt-4o": {
                temperature: 0.5,
                maxTokens: 1500,
            },
            "o1": {
                reasoningEffort: "high",
                maxTokens: 4000,
            },
        },
    };

    // 1. Explicit request params take top priority
    const explicit = resolveEffectiveGenerationConfig({
        requestConfig: {
            temperature: 0.2,
            topP: 0.3,
            maxTokens: 500,
            reasoningEffort: "high",
        },
        userDefaults,
        modelId: "gpt-4o",
        capability: cap,
    });
    assertEquals(explicit.temperature, 0.2);
    assertEquals(explicit.topP, 0.3);
    assertEquals(explicit.maxTokens, 500);
    assertEquals(explicit.reasoningEffort, "high");

    // 2. Per-model user default takes priority when request param is undefined
    const modelDefault = resolveEffectiveGenerationConfig({
        requestConfig: {},
        userDefaults,
        modelId: "gpt-4o",
        capability: cap,
    });
    assertEquals(modelDefault.temperature, 0.5); // from models['gpt-4o']
    assertEquals(modelDefault.maxTokens, 1500); // from models['gpt-4o']
    assertEquals(modelDefault.topP, 0.95); // fallback to userDefaults.default.topP
    assertEquals(modelDefault.reasoningEffort, "low"); // fallback to userDefaults.default.reasoningEffort

    // 3. Fallback to userDefaults.default when model has no specific override
    const globalFallback = resolveEffectiveGenerationConfig({
        requestConfig: {},
        userDefaults,
        modelId: "other-model",
        capability: cap,
    });
    assertEquals(globalFallback.temperature, 0.8);
    assertEquals(globalFallback.topP, 0.95);
    assertEquals(globalFallback.maxTokens, 2000);
    assertEquals(globalFallback.reasoningEffort, "low");

    // 4. Strict reasoning model rejects custom temperature/topP from request
    assertThrows(
        () =>
            resolveEffectiveGenerationConfig({
                requestConfig: { temperature: 0.7 },
                userDefaults,
                modelId: "o1",
                capability: cap,
                isReasoningStrict: true,
            }),
        ReasoningValidationError,
    );
    assertThrows(
        () =>
            resolveEffectiveGenerationConfig({
                requestConfig: { topP: 0.5 },
                userDefaults,
                modelId: "o1",
                capability: cap,
                isReasoningStrict: true,
            }),
        ReasoningValidationError,
    );

    // 5. Strict reasoning model suppresses temperature/topP from defaults
    const strictConfig = resolveEffectiveGenerationConfig({
        requestConfig: {},
        userDefaults,
        modelId: "o1",
        capability: cap,
        isReasoningStrict: true,
    });
    assertEquals(strictConfig.temperature, undefined);
    assertEquals(strictConfig.topP, undefined);
    assertEquals(strictConfig.reasoningEffort, "high"); // from models['o1']
    assertEquals(strictConfig.maxTokens, 4000); // from models['o1']
});

Deno.test("Reasoning: resolveModelSwitchGenerationConfig resolves config cleanly on model switch", () => {
    const userDefaults: AiGenerationDefaultsDto = {
        default: {
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 2048,
            reasoningEffort: "medium",
        },
        models: {
            "o1": {
                reasoningEffort: "high",
                maxTokens: 4096,
            },
        },
    };

    const standardModel: AiModelDto = {
        id: "m-std",
        providerId: "p-1",
        modelId: "gpt-4o",
        displayName: "GPT-4o",
        enabled: true,
        visibleToUsers: true,
        isDefault: true,
        supportsText: true,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsReasoning: false,
        reasoningEfforts: [],
        defaultReasoningEffort: null,
        reasoningCapabilitySource: "preset",
        isReasoningStrict: false,
        updatedAt: 1,
    };

    const strictModel: AiModelDto = {
        id: "m-strict",
        providerId: "p-1",
        modelId: "o1",
        displayName: "o1",
        enabled: true,
        visibleToUsers: true,
        isDefault: false,
        supportsText: true,
        supportsVision: false,
        supportsTools: false,
        supportsStreaming: true,
        supportsReasoning: true,
        reasoningEfforts: ["low", "medium", "high"],
        defaultReasoningEffort: "medium",
        reasoningCapabilitySource: "preset",
        isReasoningStrict: true,
        updatedAt: 1,
    };

    // Switching to standard model uses global defaults and omits reasoningEffort (unsupported)
    const toStandard = resolveModelSwitchGenerationConfig({
        currentConfig: undefined,
        targetModel: standardModel,
        userDefaults,
    });
    assertEquals(toStandard.temperature, 0.7);
    assertEquals(toStandard.topP, 0.9);
    assertEquals(toStandard.maxTokens, 2048);
    assertEquals(toStandard.reasoningEffort, undefined);

    // Switching to strict model uses per-model defaults, strips temperature and topP
    const toStrict = resolveModelSwitchGenerationConfig({
        currentConfig: toStandard,
        targetModel: strictModel,
        userDefaults,
    });
    assertEquals(toStrict.temperature, undefined);
    assertEquals(toStrict.topP, undefined);
    assertEquals(toStrict.maxTokens, 4096);
    assertEquals(toStrict.reasoningEffort, "high");
    const keptChoice = resolveModelSwitchGenerationConfig({
        currentConfig: { reasoningEffort: "low" },
        targetModel: strictModel,
        userDefaults,
    });
    assertEquals(keptChoice.reasoningEffort, "low");
    const fallbackChoice = resolveModelSwitchGenerationConfig({
        currentConfig: { reasoningEffort: "xhigh" },
        targetModel: strictModel,
        userDefaults,
    });
    assertEquals(fallbackChoice.reasoningEffort, "high");
});
