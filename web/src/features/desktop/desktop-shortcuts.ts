export const DESKTOP_SHORTCUTS = {
    menu: {
        key: "m",
        label: "Ctrl+Alt+Shift+M",
        aria: "Control+Alt+Shift+M",
    },
    snapLeft: {
        key: "ArrowLeft",
        label: "Ctrl+Alt+Shift+←",
        aria: "Control+Alt+Shift+ArrowLeft",
    },
    snapRight: {
        key: "ArrowRight",
        label: "Ctrl+Alt+Shift+→",
        aria: "Control+Alt+Shift+ArrowRight",
    },
    overview: {
        key: "o",
        label: "Ctrl+Alt+Shift+O",
        aria: "Control+Alt+Shift+O",
    },
} as const;

export function matchesDesktopShortcut(
    event: Pick<
        KeyboardEvent,
        "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
    >,
    shortcut: keyof typeof DESKTOP_SHORTCUTS,
): boolean {
    return event.ctrlKey && event.altKey && event.shiftKey &&
        !event.metaKey &&
        event.key.toLowerCase() ===
            DESKTOP_SHORTCUTS[shortcut].key.toLowerCase();
}
