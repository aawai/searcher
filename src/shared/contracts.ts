import type { EngineId } from "./engines.ts";

export type ThemeId = "system" | "light" | "dark" | "forest";
export type UserRole = "user" | "admin";
export interface UserDto {
    id: string;
    username: string;
    displayName: string;
    role: UserRole;
}
export interface AdminUserDto extends UserDto {
    disabled: boolean;
    createdAt: number;
}
export interface PreferencesDto {
    defaultEngine: EngineId;
    theme: ThemeId;
}
export interface BookmarkDto {
    id: string;
    title: string;
    url: string;
    createdAt: number;
    updatedAt: number;
}
export interface NoteDto {
    id: string;
    content: string;
    version: number;
    createdAt: number;
    updatedAt: number;
}
export interface Envelope<T> {
    code: number;
    status: boolean;
    data?: T;
    message?: string;
}
