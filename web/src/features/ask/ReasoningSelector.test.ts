import { assertEquals } from "@std/assert";
import { resolveEffectiveReasoningLevel } from "./ReasoningSelector.tsx";
import type { AiModelDto } from "../../../../src/features/ai/types.ts";

function makeModel(
    supportsReasoning: boolean,
    reasoningEfforts:
        ("none" | "auto" | "low" | "medium" | "high" | "xhigh" | "max")[] = [],
    defaultReasoningEffort:
        | "none"
        | "auto"
        | "low"
        | "medium"
        | "high"
        | "xhigh"
        | "max"
        | null = null,
): AiModelDto {
    return {
        id: "m-1",
        providerId: "p-1",
        modelId: "test-model",
        displayName: "Test Model",
        enabled: true,
        visibleToUsers: true,
        isDefault: false,
        supportsText: true,
        supportsVision: false,
        supportsTools: false,
        supportsStreaming: true,
        metadataJson: null,
        updatedAt: 1000,
        supportsReasoning,
        reasoningEfforts,
        defaultReasoningEffort,
        reasoningCapabilitySource: "provider",
    };
}

Deno.test("ReasoningSelector: returns undefined if model does not support reasoning", () => {
    const model = makeModel(false);
    const resolved = resolveEffectiveReasoningLevel(model, "high", "medium");
    assertEquals(resolved, undefined);
});

Deno.test("ReasoningSelector: preserves currentChoice if supported by new model", () => {
    const model = makeModel(true, ["low", "medium", "high"]);
    const resolved = resolveEffectiveReasoningLevel(model, "high", "low");
    assertEquals(resolved, "high");
});

Deno.test("ReasoningSelector: falls back to user preference if currentChoice is unsupported", () => {
    const model = makeModel(true, ["low", "medium"]);
    // Current choice was "xhigh", which is unsupported by this model
    const resolved = resolveEffectiveReasoningLevel(model, "xhigh", "medium");
    assertEquals(resolved, "medium");
});

Deno.test("ReasoningSelector: falls back to model default if user preference is unsupported", () => {
    const model = makeModel(true, ["low", "medium"], "low");
    const resolved = resolveEffectiveReasoningLevel(model, "xhigh", "high");
    assertEquals(resolved, "low");
});

Deno.test("ReasoningSelector: falls back to undefined if all fallbacks fail", () => {
    const model = makeModel(true, ["low"], null);
    const resolved = resolveEffectiveReasoningLevel(model, "xhigh", "high");
    assertEquals(resolved, undefined);
});
