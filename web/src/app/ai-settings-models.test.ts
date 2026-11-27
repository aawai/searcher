import { assertEquals, assertNotStrictEquals } from "@std/assert";
import type { AiModelDto } from "../../../src/features/ai/types.ts";
import { sortProviderModels } from "./ai-settings-models.ts";

function makeModel(
    id: string,
    overrides: Partial<AiModelDto> = {},
): AiModelDto {
    return {
        id,
        providerId: "prov-1",
        modelId: id,
        displayName: id,
        enabled: true,
        visibleToUsers: true,
        isDefault: false,
        providerEnabled: true,
        supportsText: true,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsReasoning: false,
        reasoningEfforts: [],
        defaultReasoningEffort: null,
        reasoningCapabilitySource: "unknown",
        metadataJson: null,
        updatedAt: 0,
        ...overrides,
    };
}

Deno.test("sortProviderModels (user): places active default, then enabled, then disabled in original relative order", () => {
    const input: AiModelDto[] = [
        makeModel("disabled-a", { enabled: false, visibleToUsers: false }),
        makeModel("enabled-1"),
        makeModel("disabled-b", { enabled: false, visibleToUsers: false }),
        makeModel("default-model", { isDefault: true }),
        makeModel("enabled-2"),
        makeModel("hidden-user", { enabled: true, visibleToUsers: false }),
    ];

    const sorted = sortProviderModels(input, "user");
    assertNotStrictEquals(sorted, input);
    assertEquals(
        sorted.map((m) => m.id),
        [
            "default-model",
            "enabled-1",
            "enabled-2",
            "disabled-a",
            "disabled-b",
            "hidden-user",
        ],
    );
    assertEquals(input[0].id, "disabled-a");
});

Deno.test("sortProviderModels (system): ranks active default, usable, admin-enabled hidden, then disabled", () => {
    const input: AiModelDto[] = [
        makeModel("sys-disabled-1", {
            enabled: false,
            visibleToUsers: false,
        }),
        makeModel("sys-hidden-1", {
            enabled: true,
            visibleToUsers: false,
        }),
        makeModel("sys-usable-1", {
            enabled: true,
            visibleToUsers: true,
        }),
        makeModel("sys-disabled-2", {
            enabled: false,
            visibleToUsers: true,
        }),
        makeModel("sys-default", {
            enabled: true,
            visibleToUsers: true,
            isDefault: true,
        }),
        makeModel("sys-usable-2", {
            enabled: true,
            visibleToUsers: true,
        }),
    ];

    const sorted = sortProviderModels(input, "system");
    assertEquals(
        sorted.map((m) => m.id),
        [
            "sys-default",
            "sys-usable-1",
            "sys-usable-2",
            "sys-hidden-1",
            "sys-disabled-1",
            "sys-disabled-2",
        ],
    );
});
