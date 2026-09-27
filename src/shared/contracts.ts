import type { EngineId } from "./engines.ts";

export type ThemeId = "system" | "light" | "dark";
export type StylePreset = "zen" | "widgets";
export type LegacyStylePreset =
    | "command"
    | "quiet"
    | "minimal"
    | "glass"
    | "soft"
    | "classic";

export function normalizeStylePreset(raw: unknown): StylePreset {
    if (raw === "zen" || raw === "widgets") {
        return raw;
    }
    if (raw === "glass" || raw === "soft") return "widgets";
    return "zen";
}
export type AccentId = "blue" | "cyan" | "teal" | "violet" | "orange" | "mono";
export type SearchShape = "rounded" | "pill";
export type UserRole = "user" | "admin";
export interface UserDto {
    id: string;
    username: string;
    displayName: string;
    role: UserRole;
    email?: string | null;
    mustChangePassword?: boolean;
}
export interface AdminUserDto extends UserDto {
    disabled: boolean;
    createdAt: number;
}
export type SearchTarget = "same" | "new";
export interface PreferencesDto {
    defaultEngine: EngineId;
    theme: ThemeId;
    style: StylePreset;
    accent: AccentId;
    searchShape: SearchShape;
    /** 搜索框不透明度，取值范围 [0.1, 1.0] */
    searchOpacity: number;
    backgroundImage: string | null;
    wallpaperBlur: number;
    wallpaperGrayscale: number;
    wallpaperMask: number;
    searchTarget: SearchTarget;
    searchHistoryEnabled?: boolean;
    webAppHomeLimit: 8 | 12 | 16 | "all";
    webAppIconSize: "compact" | "default" | "large";
    showAppLabels: boolean;
}
export type NoteColor = "paper" | "amber" | "rose" | "sage" | "sky";
export interface Envelope<T> {
    code: number;
    status: boolean;
    data?: T;
    message?: string;
}
