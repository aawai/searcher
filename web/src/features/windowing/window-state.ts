import type { Location } from "react-router-dom";
import { askConversationId, routes, settingsTab } from "../../app/routes.ts";
import type { WindowId } from "./window-context.tsx";

export interface WindowRecord {
    id: WindowId;
    status: "visible" | "minimized";
    location: Location;
    /**
     * The apps window opens beside its Dock icon as a transient: it collapses
     * when focus moves elsewhere until the user moves, resizes, or maximizes it.
     */
    anchored: boolean;
}

export interface WindowState {
    /** Least recently used first; DOM order also determines stacking. */
    windows: WindowRecord[];
    activeId: WindowId | null;
}

/** A user minimize or close that has navigated and awaits its destination. */
export interface PendingWindowAction {
    kind: "minimize" | "close";
    id: WindowId;
    target: string;
    sourceKey: string;
}

/** The window an address shows; `/` shows none. */
export function windowForLocation(
    location: Pick<Location, "pathname" | "search">,
): WindowId | null {
    const { pathname, search } = location;
    if (pathname === routes.home) {
        const view = new URLSearchParams(search).get("view");
        return view === "apps" || view === "notes" ? view : null;
    }
    if (pathname === routes.account || settingsTab(pathname) !== null) {
        return "settings";
    }
    if (pathname === routes.ask || askConversationId(pathname) !== null) {
        return "ai";
    }
    return pathname === routes.trash ? "trash" : null;
}

export function windowUrl(id: WindowId): string {
    return id === "settings"
        ? routes.settings()
        : id === "trash"
        ? routes.trash
        : id === "ai"
        ? routes.ask
        : `${routes.home}?view=${id}`;
}

export function locationUrl(
    location: Pick<Location, "pathname" | "search" | "hash">,
): string {
    return `${location.pathname}${location.search}${location.hash}`;
}

/**
 * Window state after the address changed. The address decides the focused
 * window; a pending minimize or close completes once its destination commits.
 * With `wide`, an anchored window that loses focus is minimized.
 */
export function stateForLocation(
    state: WindowState,
    location: Location,
    action: PendingWindowAction | null,
    wide: boolean,
): WindowState {
    let windows = state.windows;
    if (
        action && action.sourceKey !== location.key &&
        action.target === locationUrl(location)
    ) {
        windows = action.kind === "close"
            ? windows.filter((window) => window.id !== action.id)
            : windows.map((window) =>
                window.id === action.id
                    ? { ...window, status: "minimized" as const }
                    : window
            );
    }
    const id = windowForLocation(location);
    if (id) {
        const previous = windows.find((window) => window.id === id);
        const current: WindowRecord = {
            id,
            status: "visible",
            location,
            anchored: previous?.anchored ?? id === "apps",
        };
        const others = windows.filter((window) => window !== previous).map((
            window,
        ) => wide && window.anchored && window.status === "visible" &&
                state.activeId === window.id
            ? { ...window, status: "minimized" as const }
            : window
        );
        return { windows: [...others, current], activeId: id };
    }
    if (location.pathname === routes.home) {
        return {
            windows: windows.map((window) => ({
                ...window,
                status: "minimized" as const,
            })),
            activeId: null,
        };
    }
    // Independent pages hide the desktop without destroying or minimizing it.
    return { windows, activeId: null };
}
