export interface DevicePreferenceStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface DevicePreferences {
    toolbarCollapsed: boolean | null;
    outlineOpen: boolean;
}

function preferenceKey(userId: string, preference: string): string {
    return `document:device:${encodeURIComponent(userId)}:${preference}`;
}

function readBoolean(
    storage: DevicePreferenceStorage | null,
    key: string,
): boolean | null {
    try {
        const value = storage?.getItem(key);
        if (value === "true") return true;
        if (value === "false") return false;
        return null;
    } catch {
        return null;
    }
}

function writeBoolean(
    storage: DevicePreferenceStorage | null,
    key: string,
    value: boolean,
): void {
    try {
        storage?.setItem(key, String(value));
    } catch {
        // Preferences remain usable in memory if storage is unavailable.
    }
}

export function readDevicePreferences(
    storage: DevicePreferenceStorage | null,
    userId: string,
): DevicePreferences {
    return {
        toolbarCollapsed: readBoolean(storage, preferenceKey(userId, "toolbar")),
        outlineOpen: readBoolean(storage, preferenceKey(userId, "outline")) ??
            false,
    };
}

export function writeToolbarCollapsed(
    storage: DevicePreferenceStorage | null,
    userId: string,
    collapsed: boolean,
): void {
    writeBoolean(storage, preferenceKey(userId, "toolbar"), collapsed);
}

export function writeOutlineOpen(
    storage: DevicePreferenceStorage | null,
    userId: string,
    open: boolean,
): void {
    writeBoolean(storage, preferenceKey(userId, "outline"), open);
}

export function readSidebarCollapsed(
    storage: DevicePreferenceStorage | null,
    userId: string,
): boolean {
    return readBoolean(storage, preferenceKey(userId, "sidebar")) ?? false;
}

export function writeSidebarCollapsed(
    storage: DevicePreferenceStorage | null,
    userId: string,
    collapsed: boolean,
): void {
    writeBoolean(storage, preferenceKey(userId, "sidebar"), collapsed);
}

export function resolveToolbarCollapsed(
    preference: boolean | null,
    width: number,
    coarsePointer: boolean,
): boolean {
    return preference ?? (width < 768 || coarsePointer);
}
