import { useEffect, useState } from "react";
import type { AiModelDto } from "../../../../src/features/ai/types.ts";
import { api } from "../../lib/api.ts";

/** A model the signed-in user can actually ask: enabled and text-capable. */
export function hasUsableModel(models: readonly AiModelDto[]): boolean {
    return models.some((model) => model.enabled && model.supportsText);
}

/**
 * Whether AI entry points (问 AI row, Alt+Enter, /ai) exist at all. Guests and
 * accounts without a usable model never see them; a failed lookup hides them.
 */
export function useAiAvailability(signedIn: boolean): boolean {
    const [available, setAvailable] = useState(false);
    useEffect(() => {
        if (!signedIn) {
            setAvailable(false);
            return;
        }
        let alive = true;
        api<AiModelDto[]>("/api/ai/models")
            .then((models) => {
                if (alive) setAvailable(hasUsableModel(models));
            })
            .catch(() => {
                if (alive) setAvailable(false);
            });
        return () => {
            alive = false;
        };
    }, [signedIn]);
    return available;
}
