import { createContext, useContext } from "react";

export type WindowId = "apps" | "notes" | "ai" | "settings" | "trash";

export interface WindowItem {
    id: WindowId;
    status: "visible" | "minimized";
}

/** Returns true when it takes over closing (for example to ask first). */
export type CloseGuard = () => boolean;

export interface WindowManager {
    windows: WindowItem[];
    activeId: WindowId | null;
    /** Dock/command entry: the focused window collapses, any other is shown. */
    open: (id: WindowId) => void;
    activate: (id: WindowId) => void;
    minimize: (id: WindowId) => void;
    /** `confirmed` skips close guards after their owner has asked the user. */
    close: (id: WindowId, options?: { confirmed?: boolean }) => void;
    showDesktop: () => void;
    /** A guard may defer a user close; the latest registration wins. */
    registerCloseGuard: (id: WindowId, guard: CloseGuard) => () => void;
    /** The desktop owner picks where focus lands when a library window leaves. */
    registerDesktopFocus: (target: () => HTMLElement | null) => () => void;
}

export const WindowManagerContext = createContext<WindowManager | null>(null);

export function useWindowManager(): WindowManager | null {
    return useContext(WindowManagerContext);
}
