export interface DevicePreferenceStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export const SIDEBAR_WIDTH = { min: 180, max: 400, default: 240 } as const;
export const OUTLINE_WIDTH = { min: 180, max: 400, default: 260 } as const;

type WidthLimits = { min: number; max: number; default: number };

export function effectivePaneWidth(
    savedWidth: number,
    hostWidth: number,
    contentMinWidth: number,
    limits: WidthLimits,
): number {
    if (hostWidth <= 0) return savedWidth;
    return Math.min(
        savedWidth,
        Math.max(limits.min, hostWidth - contentMinWidth),
    );
}

function readWidth(
    storage: DevicePreferenceStorage | null,
    userId: string,
    name: string,
    limits: WidthLimits,
): number {
    try {
        const raw = storage?.getItem(preferenceKey(userId, name));
        if (raw == null || raw.trim() === "") return limits.default;
        const value = Number(raw);
        return Number.isFinite(value)
            ? Math.max(limits.min, Math.min(limits.max, value))
            : limits.default;
    } catch {
        return limits.default;
    }
}

function writeWidth(
    storage: DevicePreferenceStorage | null,
    userId: string,
    name: string,
    value: number,
    limits: WidthLimits,
): void {
    if (!Number.isFinite(value)) return;
    try {
        storage?.setItem(
            preferenceKey(userId, name),
            String(Math.max(limits.min, Math.min(limits.max, value))),
        );
    } catch {
        // Preferences remain usable in memory if storage is unavailable.
    }
}

export function readSidebarWidth(
    storage: DevicePreferenceStorage | null,
    userId: string,
): number {
    return readWidth(storage, userId, "sidebarWidth", SIDEBAR_WIDTH);
}

export function writeSidebarWidth(
    storage: DevicePreferenceStorage | null,
    userId: string,
    value: number,
): void {
    writeWidth(storage, userId, "sidebarWidth", value, SIDEBAR_WIDTH);
}

export function readOutlineWidth(
    storage: DevicePreferenceStorage | null,
    userId: string,
): number {
    return readWidth(storage, userId, "outlineWidth", OUTLINE_WIDTH);
}

export function writeOutlineWidth(
    storage: DevicePreferenceStorage | null,
    userId: string,
    value: number,
): void {
    writeWidth(storage, userId, "outlineWidth", value, OUTLINE_WIDTH);
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
        toolbarCollapsed: readBoolean(
            storage,
            preferenceKey(userId, "toolbar"),
        ),
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
