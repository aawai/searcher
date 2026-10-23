import { useEffect, useState } from "react";
import type { AiModelDto } from "../../../../src/features/ai/types.ts";
import { api } from "../../lib/api.ts";

/** A model the signed-in user can actually ask: enabled and text-capable. */
function isUsableModel(model: AiModelDto): boolean {
    return model.enabled && model.supportsText;
}

export function usableModels(models: readonly AiModelDto[]): AiModelDto[] {
    return models.filter(isUsableModel);
}

export function hasUsableModel(models: readonly AiModelDto[]): boolean {
    return models.some(isUsableModel);
}

const NO_MODELS: AiModelDto[] = [];

/**
 * The models behind every AI entry point (问 AI row, Alt+Enter, /ai, the home
 * answer card, the top-bar link). Guests and accounts without a usable model
 * get none, so none of those entry points exist; a failed lookup hides them.
 * `refreshKey` re-reads the list, e.g. after the user configured a model.
 */
export function useAiModels(
    signedIn: boolean,
    refreshKey?: string,
): AiModelDto[] {
    const [models, setModels] = useState<AiModelDto[]>(NO_MODELS);
    useEffect(() => {
        if (!signedIn) {
            setModels(NO_MODELS);
            return;
        }
        let alive = true;
        api<AiModelDto[]>("/api/ai/models")
            .then((all) => {
                if (alive) setModels(usableModels(all));
            })
            .catch(() => {
                if (alive) setModels(NO_MODELS);
            });
        return () => {
            alive = false;
        };
    }, [signedIn, refreshKey]);
    return models;
}
