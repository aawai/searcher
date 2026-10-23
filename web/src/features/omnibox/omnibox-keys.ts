export type OmniboxKeyInput = {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    /** isComposing, keyCode 229 or an open composition session. */
    composing: boolean;
    /** The suggestion list is showing. */
    open: boolean;
    optionCount: number;
    aiAvailable: boolean;
    /** Signed-in user: Shift+Enter can create a note. */
    canCapture: boolean;
    hasText: boolean;
};

export type OmniboxKeyAction =
    | { type: "ignore" }
    /** Consume the key (preventDefault) but do nothing: IME confirmation Enter. */
    | { type: "swallow" }
    | { type: "move"; step: 1 | -1 }
    | { type: "close" }
    /** Run the selected option, or the default-engine search when none is selected. */
    | { type: "submit"; newTab: boolean }
    | { type: "ask-ai" }
    | { type: "capture" };

const IGNORE: OmniboxKeyAction = { type: "ignore" };

/**
 * Keyboard contract of the unified input as a decision table. Tab is never
 * handled, and nothing responds while an IME is composing.
 */
export function decideOmniboxKey(input: OmniboxKeyInput): OmniboxKeyAction {
    const { key, altKey, shiftKey } = input;
    const mod = input.ctrlKey || input.metaKey;
    if (key === "Enter" && input.composing) return { type: "swallow" };
    if (input.composing || key === "Tab") return IGNORE;

    if (key === "Escape") return input.open ? { type: "close" } : IGNORE;

    if (key === "ArrowDown" || key === "ArrowUp") {
        if (mod || shiftKey || altKey) return IGNORE;
        if (!input.open || input.optionCount === 0) return IGNORE;
        return { type: "move", step: key === "ArrowDown" ? 1 : -1 };
    }

    if (key !== "Enter") return IGNORE;
    if (input.ctrlKey && input.metaKey) return IGNORE;
    if (altKey) {
        if (mod || shiftKey) return IGNORE;
        return input.aiAvailable && input.hasText ? { type: "ask-ai" } : IGNORE;
    }
    if (shiftKey) {
        if (mod) return IGNORE;
        return input.canCapture && input.hasText ? { type: "capture" } : IGNORE;
    }
    return { type: "submit", newTab: mod };
}
