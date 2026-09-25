import type { EngineId } from "./engines.ts";

export type ThemeId = "system" | "light" | "dark";
export type StylePreset = "quiet" | "minimal" | "glass" | "soft" | "classic";
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
    backgroundImage: string | null;
    wallpaperBlur: number;
    wallpaperGrayscale: number;
    wallpaperMask: number;
    searchTarget: SearchTarget;
    searchHistoryEnabled?: boolean;
    webAppHomeLimit: 8 | 12 | 16 | "all";
    webAppIconSize: "compact" | "default" | "large";
}
export type NoteColor = "paper" | "amber" | "rose" | "sage" | "sky";
export interface Envelope<T> {
    code: number;
    status: boolean;
    data?: T;
    message?: string;
}
