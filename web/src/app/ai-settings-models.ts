import type {
    AiModelDto,
    AiProviderDto,
} from "../../../src/features/ai/types.ts";

/**
 * Places enabled/usable models above disabled models within a provider list,
 * keeping the active default model first and preserving original order within
 * each tier.
 */
export function sortProviderModels(
    models: readonly AiModelDto[],
    scope: AiProviderDto["scope"],
): AiModelDto[] {
    const rank = (model: AiModelDto): number => {
        const usable = model.enabled && model.visibleToUsers;
        if (usable) return model.isDefault ? 0 : 1;
        if (scope === "system" && model.enabled) return 2;
        return 3;
    };
    return [...models].sort((a, b) => rank(a) - rank(b));
}
