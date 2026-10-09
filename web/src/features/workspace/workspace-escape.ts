import { useEffect } from "react";

// One active apps coordinator; presenters cancel their default apps dismiss.
export function useAppsEscape({
    enabled,
    hasDialog,
    onDialogEscape,
    onEscape,
}: {
    enabled: boolean;
    hasDialog: () => boolean;
    onDialogEscape: () => void;
    onEscape: () => void;
}) {
    useEffect(() => {
        if (!enabled) return;
        const escape = (event: KeyboardEvent) => {
            if (
                event.key !== "Escape" || event.isComposing ||
                event.defaultPrevented
            ) return;
            if (hasDialog()) {
                event.preventDefault();
                onDialogEscape();
                return;
            }
            // Owned popup state remains authoritative during its focus handoff.
            if (
                document.querySelector(
                    '.apps-workspace [aria-expanded="true"][aria-haspopup]',
                )
            ) return;
            const target = event.target;
            if (target instanceof Element) {
                if (target.closest("[data-workspace-escape-boundary]")) return;
                const overlay = target.closest(
                    '[role="menu"], [role="alertdialog"], [role="dialog"], [data-slot="popover-content"]',
                );
                if (overlay && !overlay.matches(".workspace-panel")) return;
            }
            event.preventDefault();
            onEscape();
        };
        globalThis.addEventListener("keydown", escape, true);
        return () => globalThis.removeEventListener("keydown", escape, true);
    }, [enabled, hasDialog, onDialogEscape, onEscape]);
}
