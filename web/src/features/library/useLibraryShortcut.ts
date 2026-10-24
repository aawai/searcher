import { useEffect, useRef } from "react";
import {
    isEditableShortcutTarget,
    matchesShortcut,
    SHORTCUTS,
} from "../shortcuts/shortcut-catalog.ts";

export function useLibraryShortcut(enabled: boolean, onToggle: () => void) {
    const toggle = useRef(onToggle);
    toggle.current = onToggle;
    useEffect(() => {
        if (!enabled) return;
        const onKey = (event: KeyboardEvent) => {
            if (!matchesShortcut(event, SHORTCUTS.toggleLibrary.binding)) {
                return;
            }
            const target = event.target;
            if (
                target instanceof Element && target.id !== "search-query" &&
                (isEditableShortcutTarget(target) ||
                    target.closest(
                        '[role="menu"], [role="alertdialog"], [role="listbox"], [role="dialog"]:not([data-library])',
                    ))
            ) return;
            event.preventDefault();
            toggle.current();
        };
        addEventListener("keydown", onKey);
        return () => removeEventListener("keydown", onKey);
    }, [enabled]);
}
