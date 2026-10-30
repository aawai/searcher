import { assertEquals } from "@std/assert";
import {
    applyManualOverride,
    mergeModelMetadata,
    normalizeRawModelCapabilities,
    populateModelDtoCapabilities,
    type ReasoningCapability,
    type ReasoningOverride,
    resolveEffectiveCapability,
    validateModelMetadata,
} from "./model-capabilities.ts";

Deno.test("ModelCapabilities: normalizeRawModelCapabilities extracts known fields without inventing levels", () => {
    // 1. Array in reasoning_efforts
    const raw1 = {
        id: "custom-reasoner",
        reasoning_efforts: ["low", "medium", "high"],
    };
    const cap1 = normalizeRawModelCapabilities(raw1, "custom-reasoner");
    assertEquals(cap1.status, "supported");
    assertEquals(cap1.levels, ["low", "medium", "high"]);
    assertEquals(cap1.defaultLevel, undefined);
    assertEquals(cap1.source, "provider");

    // 2. supported_reasoning_efforts
    const raw2 = {
        id: "another-model",
        supported_reasoning_efforts: [
            "minimal",
            "low",
            "medium",
            "high",
            "max",
        ],
    };
    const cap2 = normalizeRawModelCapabilities(raw2, "another-model");
    assertEquals(cap2.status, "supported");
    assertEquals(cap2.levels, ["minimal", "low", "medium", "high", "max"]);
    assertEquals(cap2.source, "provider");

    // 3. Nested capabilities.reasoning
    const raw3 = {
        id: "cli-model",
        capabilities: {
            reasoning: {
                status: "supported",
                levels: ["low", "high"],
                defaultLevel: "high",
            },
        },
    };
    const cap3 = normalizeRawModelCapabilities(raw3, "cli-model");
    assertEquals(cap3.status, "supported");
    assertEquals(cap3.levels, ["low", "high"]);
    assertEquals(cap3.defaultLevel, "high");
    assertEquals(cap3.source, "provider");

    // 4. Provider returning supported without explicit levels -> MUST NOT invent levels
    const rawSupportedWithoutLevels = {
        id: "generic-supported",
        reasoning: true,
    };
    const capNoLevels = normalizeRawModelCapabilities(
        rawSupportedWithoutLevels,
        "generic-supported",
    );
    assertEquals(capNoLevels.status, "supported");
    assertEquals(capNoLevels.levels, []);
    assertEquals(capNoLevels.defaultLevel, undefined);
    assertEquals(capNoLevels.source, "provider");

    // 5. Explicit unsupported
    const raw4 = {
        id: "non-reasoning",
        reasoning: false,
    };
    const cap4 = normalizeRawModelCapabilities(raw4, "non-reasoning");
    assertEquals(cap4.status, "unsupported");
    assertEquals(cap4.levels, []);
    assertEquals(cap4.source, "provider");

    // 6. Unknown: no reasoning keys -> must return unknown, NOT unsupported!
    const raw5 = {
        id: "standard-chat-model",
        created: 1234567,
        owned_by: "openai",
    };
    const cap5 = normalizeRawModelCapabilities(raw5, "standard-chat-model");
    assertEquals(cap5.status, "unknown");
    assertEquals(cap5.levels, []);
    assertEquals(cap5.source, "unknown");
});

Deno.test("ModelCapabilities: validateModelMetadata validates nested structures at runtime", () => {
    // Malformed input (array or non-object)
    assertEquals(validateModelMetadata(null), {});
    assertEquals(validateModelMetadata("string"), {});
    assertEquals(validateModelMetadata([1, 2, 3]), {});

    // Malformed levels and defaults
    const malformed = {
        discoveryMode: "invalid-mode",
        capabilities: {
            discovered: {
                reasoning: {
                    status: "invalid-status",
                    levels: ["invalid-level", "low", 123],
                    defaultLevel: "not-in-levels",
                },
            },
            overrides: {
                reasoning: {
                    enabled: "not-a-boolean",
                    levels: "not-an-array",
                },
            },
        },
    };
    const validated = validateModelMetadata(malformed);
    assertEquals(validated.discoveryMode, undefined);
    // Invalid level strings filtered out, status fell back to unknown
    assertEquals(
        validated.capabilities?.discovered?.reasoning?.status,
        "unknown",
    );
    assertEquals(validated.capabilities?.discovered?.reasoning?.levels, [
        "low",
    ]);
    assertEquals(
        validated.capabilities?.discovered?.reasoning?.defaultLevel,
        undefined,
    );
    // Overrides with non-boolean enabled omitted
    assertEquals(validated.capabilities?.overrides, undefined);
});

Deno.test("ModelCapabilities: resolveEffectiveCapability priority order", () => {
    // 1. Manual override takes highest priority
    const metaWithOverride = JSON.stringify({
        capabilities: {
            discovered: {
                reasoning: {
                    status: "supported",
                    levels: ["low", "medium"],
                    defaultLevel: "medium",
                    source: "provider",
                },
            },
            overrides: {
                reasoning: {
                    enabled: true,
                    levels: ["low", "medium", "high", "xhigh"],
                    defaultLevel: "xhigh",
                },
            },
        },
    });
    const cap1 = resolveEffectiveCapability(metaWithOverride, "any-model");
    assertEquals(cap1.status, "supported");
    assertEquals(cap1.levels, ["low", "medium", "high", "xhigh"]);
    assertEquals(cap1.defaultLevel, "xhigh");
    assertEquals(cap1.source, "manual");

    // Manual override with enabled: false turns off reasoning
    const metaOverrideDisabled = JSON.stringify({
        capabilities: {
            discovered: {
                reasoning: {
                    status: "supported",
                    levels: ["low", "medium"],
                    source: "provider",
                },
            },
            overrides: {
                reasoning: {
                    enabled: false,
                },
            },
        },
    });
    const capDisabled = resolveEffectiveCapability(
        metaOverrideDisabled,
        "any-model",
    );
    assertEquals(capDisabled.status, "unsupported");
    assertEquals(capDisabled.levels, []);
    assertEquals(capDisabled.source, "manual");

    // 2. Provider discovered metadata
    const metaDiscoveredOnly = JSON.stringify({
        capabilities: {
            discovered: {
                reasoning: {
                    status: "supported",
                    levels: ["low", "high"],
                    defaultLevel: "low",
                    source: "provider",
                },
            },
        },
    });
    const cap2 = resolveEffectiveCapability(metaDiscoveredOnly, "some-model");
    assertEquals(cap2.status, "supported");
    assertEquals(cap2.levels, ["low", "high"]);
    assertEquals(cap2.defaultLevel, "low");
    assertEquals(cap2.source, "provider");

    // 3. Preset fallback (e.g. o1-mini with no metadata)
    const cap3 = resolveEffectiveCapability(null, "o1-mini");
    assertEquals(cap3.status, "supported");
    assertEquals(cap3.source, "preset");

    // 4. Inferred fallback (e.g. o1-preview)
    const cap4 = resolveEffectiveCapability(null, "o1-2024-12-17");
    assertEquals(cap4.status, "supported");
    assertEquals(cap4.source, "inferred");

    // 5. Unknown fallback
    const cap5 = resolveEffectiveCapability(null, "unknown-custom-model");
    assertEquals(cap5.status, "unknown");
    assertEquals(cap5.source, "unknown");

    // Third-party reasoning models are not inferred from the name alone
    const r1Cap = resolveEffectiveCapability(null, "DeepSeek-R1");
    assertEquals(r1Cap.status, "unknown");
});

Deno.test("ModelCapabilities: mergeModelMetadata preserves manual overrides on refresh", () => {
    const existing = JSON.stringify({
        capabilities: {
            discovered: {
                reasoning: {
                    status: "supported",
                    levels: ["low"],
                    source: "provider",
                },
            },
            overrides: {
                reasoning: {
                    enabled: true,
                    levels: ["low", "medium", "high", "xhigh"],
                    defaultLevel: "high",
                },
            },
        },
        discoveryMode: "openai-compatible",
    });

    const newDiscovered: ReasoningCapability = {
        status: "supported",
        levels: ["low", "medium", "high"],
        defaultLevel: "medium",
        source: "provider",
    };

    const mergedStr = mergeModelMetadata(existing, newDiscovered);
    const parsed = JSON.parse(mergedStr);

    // Discovered is updated
    assertEquals(parsed.capabilities.discovered.reasoning.levels, [
        "low",
        "medium",
        "high",
    ]);
    // Override is completely preserved
    assertEquals(parsed.capabilities.overrides.reasoning.levels, [
        "low",
        "medium",
        "high",
        "xhigh",
    ]);
    assertEquals(parsed.capabilities.overrides.reasoning.defaultLevel, "high");
    // Discovery mode is preserved
    assertEquals(parsed.discoveryMode, "openai-compatible");
});

Deno.test("ModelCapabilities: applyManualOverride sets or clears override", () => {
    const base = JSON.stringify({
        capabilities: {
            discovered: {
                reasoning: {
                    status: "supported",
                    levels: ["low"],
                    source: "provider",
                },
            },
        },
    });

    // Set override
    const override: ReasoningOverride = {
        enabled: true,
        levels: ["medium", "high"],
        defaultLevel: "medium",
    };
    const updated = applyManualOverride(base, override);
    const parsedUpdated = JSON.parse(updated);
    assertEquals(
        parsedUpdated.capabilities.overrides.reasoning.levels,
        ["medium", "high"],
    );
    // Discovered capability still intact
    assertEquals(
        parsedUpdated.capabilities.discovered.reasoning.levels,
        ["low"],
    );

    // Clear override (revert to auto-discovered)
    const reverted = applyManualOverride(updated, null);
    const parsedReverted = JSON.parse(reverted);
    assertEquals(parsedReverted.capabilities.overrides?.reasoning, undefined);
    // Discovered capability still preserved
    assertEquals(
        parsedReverted.capabilities.discovered.reasoning.levels,
        ["low"],
    );
});

Deno.test("ModelCapabilities: discovery without an explicit default preserves Provider defaults", () => {
    for (
        const raw of [
            { reasoning_efforts: ["low", "high"] },
            { reasoning: { levels: ["low", "medium", "high"] } },
            { capabilities: { reasoning: { levels: ["low", "high"] } } },
        ]
    ) {
        const capability = normalizeRawModelCapabilities(raw, "custom");
        const metadataJson = mergeModelMetadata(null, capability);
        assertEquals(
            populateModelDtoCapabilities({
                id: "m",
                modelId: "custom",
                metadataJson,
            }).defaultReasoningEffort,
            null,
        );
    }
});

Deno.test("ModelCapabilities: populateModelDtoCapabilities filters reasoningEfforts strictly by transport", () => {
    // 1. Boolean transport strictly excludes "auto", even if declared by capability
    const boolMeta = JSON.stringify({
        capabilities: {
            discovered: {
                reasoning: {
                    status: "supported",
                    levels: ["none", "low", "high", "auto"],
                    defaultLevel: "high",
                    source: "provider",
                },
                transport: {
                    type: "boolean",
                    parameter: "enable_thinking",
                },
            },
        },
    });
    const boolDto = populateModelDtoCapabilities({
        id: "m-bool",
        modelId: "deepseek-r1",
        metadataJson: boolMeta,
    });
    assertEquals(boolDto.supportsReasoning, true);
    assertEquals(boolDto.reasoningEfforts, ["none", "low", "high"]);
    assertEquals(
        (boolDto.reasoningEfforts as readonly string[]).includes("auto"),
        false,
    );
    assertEquals(boolDto.defaultReasoningEffort, "high");
    assertEquals(boolDto.isReasoningStrict, false);

    // 2. Custom transport only offers mapped levels
    const customMeta = JSON.stringify({
        capabilities: {
            discovered: {
                reasoning: {
                    status: "supported",
                    levels: ["minimal", "low", "medium", "high"],
                    defaultLevel: "medium",
                    source: "provider",
                },
                transport: {
                    type: "custom",
                    parameter: "thinking_budget",
                    valueMap: { low: 1024, high: 4096 },
                },
            },
        },
    });
    const customDto = populateModelDtoCapabilities({
        id: "m-custom",
        modelId: "claude-3-7-sonnet",
        metadataJson: customMeta,
    });
    assertEquals(customDto.supportsReasoning, true);
    assertEquals(customDto.reasoningEfforts, ["low", "high"]);
    assertEquals(customDto.defaultReasoningEffort, null); // "medium" not in transport map!

    // 3. Unsupported transport yields supportsReasoning: false and empty levels
    const unsupportedMeta = JSON.stringify({
        capabilities: {
            discovered: {
                reasoning: {
                    status: "supported",
                    levels: ["low", "high"],
                    source: "provider",
                },
                transport: { type: "unsupported" },
            },
        },
    });
    const unsupportedDto = populateModelDtoCapabilities({
        id: "m-unsupported",
        modelId: "unknown-model",
        metadataJson: unsupportedMeta,
    });
    assertEquals(unsupportedDto.supportsReasoning, false);
    assertEquals(unsupportedDto.reasoningEfforts, []);

    // 4. Strict reasoning models (o1, o3) expose isReasoningStrict: true
    const o1Dto = populateModelDtoCapabilities({
        id: "m-o1",
        modelId: "o1",
        metadataJson: null,
    });
    assertEquals(o1Dto.isReasoningStrict, true);

    const o3MiniDto = populateModelDtoCapabilities({
        id: "m-o3",
        modelId: "o3-mini",
        metadataJson: null,
    });
    assertEquals(o3MiniDto.isReasoningStrict, true);

    // Non-strict model
    const gpt4oDto = populateModelDtoCapabilities({
        id: "m-4o",
        modelId: "gpt-4o",
        metadataJson: null,
    });
    assertEquals(gpt4oDto.isReasoningStrict, false);
});
