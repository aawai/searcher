import { createContext, useContext } from "react";

export type WindowId = "settings" | "trash";

export interface WindowItem {
    id: WindowId;
    status: "visible" | "minimized";
}

export interface WindowManager {
    windows: WindowItem[];
    activeId: WindowId | null;
    windowListOpen: boolean;
    setWindowListOpen: (open: boolean) => void;
    open: (id: WindowId) => void;
    activate: (id: WindowId) => void;
    minimize: (id: WindowId) => void;
    close: (id: WindowId) => void;
    showDesktop: () => void;
}

export const WindowManagerContext = createContext<WindowManager | null>(null);

export function useWindowManager(): WindowManager | null {
    return useContext(WindowManagerContext);
}
