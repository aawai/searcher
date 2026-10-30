export type LibraryWindowId = "apps" | "notes";

/**
 * An open library window as seen by the desktop owner, which keeps the data,
 * editing sessions, and forms and renders the content into `node`.
 */
export interface LibraryWindowSlot {
    /** Content mount point inside the frame; null until the frame renders. */
    node: HTMLElement | null;
    /** Mount point in the title bar for the view's back control and actions. */
    toolbar: HTMLElement | null;
    minimized: boolean;
    /** The focused window: owns Escape and shortcut priority. */
    active: boolean;
    /** Host width is below the medium breakpoint. */
    narrow: boolean;
    /** Measured width of the window content host. */
    hostWidth: number;
    /** The notes sidebar can be presented persistently at this width. */
    persistentSidebar: boolean;
}

/** `null` means the window is closed, so its content is destroyed. */
export type LibraryWindows = Record<LibraryWindowId, LibraryWindowSlot | null>;

export const NO_LIBRARY_WINDOWS: LibraryWindows = { apps: null, notes: null };

export function isLibraryWindow(id: string): id is LibraryWindowId {
    return id === "apps" || id === "notes";
}
