export type BotanicalResonanceKind =
    | "quick-capture"
    | "task-completed"
    | "tasks-cleared"
    | "theme-ripple"
    | "search-submit"
    | "ai-thinking"
    | "ai-complete";

export interface BotanicalResonanceDetail {
    readonly kind: BotanicalResonanceKind;
}

export const BOTANICAL_RESONANCE_EVENT = "searcher:botanical-resonance";

/**
 * Dispatches a lightweight cross-layer resonance signal to the active
 * botanical wallpaper canvas without statically coupling callers to it.
 */
export function emitBotanicalResonance(kind: BotanicalResonanceKind): void {
    if (
        typeof globalThis.dispatchEvent !== "function" ||
        typeof CustomEvent !== "function"
    ) {
        return;
    }
    globalThis.dispatchEvent(
        new CustomEvent<BotanicalResonanceDetail>(BOTANICAL_RESONANCE_EVENT, {
            detail: { kind },
        }),
    );
}
