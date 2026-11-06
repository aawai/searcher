/**
 * Focus recovery after the focused control disappears (A5, WCAG 2.4.3).
 *
 * Deleting, restoring, unpinning or moving an item removes the row that held
 * focus, often after its menu or confirmation dialog has already tried to
 * hand focus back to it. The browser then drops focus to <body>. This module
 * remembers where focus recently was and, once focus has been lost that way,
 * returns it to the trigger if it still exists, otherwise to the nearest
 * surviving container of the trigger: a collection marked with
 * `focusContainer` or the window frame around it.
 */

/** Spread onto a collection whose items can vanish while focused. */
export const focusContainer = {
    "data-focus-container": "",
    tabIndex: -1,
} as const;

const CONTAINER = "[data-focus-container], .window-frame";
/** Focus moves through a menu item and a dialog button before the removal. */
const HISTORY = 8;

interface Entry {
    element: HTMLElement;
    /** Containers of `element`, innermost first, captured while attached. */
    containers: HTMLElement[];
}

function usable(element: HTMLElement): boolean {
    return element.isConnected && element.getClientRects().length > 0 &&
        !element.closest("[inert], [data-background-layer]");
}

/** Installs the document-wide recovery; returns its uninstaller. */
export function installFocusRecovery(): () => void {
    const history: Entry[] = [];
    let frame = 0;

    const lost = () => {
        const active = document.activeElement;
        return (active === null || active === document.body) &&
            history.length > 0 && !history[0].element.isConnected;
    };
    const recover = () => {
        if (!lost()) return;
        for (const { element, containers } of history) {
            if (usable(element)) {
                element.focus();
                return;
            }
            const container = containers.find(usable);
            if (container) {
                container.focus();
                return;
            }
        }
    };

    const focusin = (event: FocusEvent) => {
        if (!(event.target instanceof HTMLElement)) return;
        const containers: HTMLElement[] = [];
        for (
            let node = event.target.parentElement;
            node;
            node = node.parentElement
        ) {
            if (node.matches(CONTAINER)) containers.push(node);
        }
        history.unshift({ element: event.target, containers });
        if (history.length > HISTORY) history.length = HISTORY;
    };
    // Removal does not fire focus events in every browser, so watch the DOM.
    // The check is constant-time; recovery waits two frames so a feature's
    // own focus handling (dialogs, windows) settles first and wins.
    const observer = new MutationObserver(() => {
        if (!lost()) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(recover);
        });
    });

    document.addEventListener("focusin", focusin, true);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
        document.removeEventListener("focusin", focusin, true);
        observer.disconnect();
        cancelAnimationFrame(frame);
    };
}
