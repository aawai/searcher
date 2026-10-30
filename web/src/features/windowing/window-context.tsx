import { createContext, useContext } from "react";

export type WindowId = "apps" | "notes" | "ai" | "settings" | "trash";

export interface WindowItem {
    id: WindowId;
    status: "visible" | "minimized";
    /** The window is working in the background, for example generating an answer. */
    busy: boolean;
}

/** Returns true when it takes over closing (for example to ask first). */
export type CloseGuard = () => boolean;

export interface WindowManager {
    windows: WindowItem[];
    activeId: WindowId | null;
    windowListOpen: boolean;
    setWindowListOpen: (open: boolean) => void;
    /** Dock/command entry: an active anchored apps window collapses instead. */
    open: (id: WindowId) => void;
    activate: (id: WindowId) => void;
    minimize: (id: WindowId) => void;
    /** `confirmed` skips close guards after their owner has asked the user. */
    close: (id: WindowId, options?: { confirmed?: boolean }) => void;
    showDesktop: () => void;
    /** The apps window stops being an anchored transient once it is moved. */
    detach: (id: WindowId) => void;
    /** A guard may defer a user close; the latest registration wins. */
    registerCloseGuard: (id: WindowId, guard: CloseGuard) => () => void;
    /** The desktop owner picks where focus lands when a library window leaves. */
    registerDesktopFocus: (target: () => HTMLElement | null) => () => void;
    /** A window reports ongoing work so the window list can show it. */
    setBusy: (id: WindowId, busy: boolean) => void;
}

export const WindowManagerContext = createContext<WindowManager | null>(null);

export function useWindowManager(): WindowManager | null {
    return useContext(WindowManagerContext);
}
