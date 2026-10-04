export * from "./wallpaper.ts";
import type {
    CanvasMotion,
    WallpaperMotionLevel,
    WallpaperPresentation,
} from "./wallpaper-presentation.ts";
export type { CanvasMotion, WallpaperMotionLevel, WallpaperPresentation };
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
export const ACCENT_IDS = [
    "blue",
    "cyan",
    "teal",
    "violet",
    "orange",
    "mono",
    "rose",
    "emerald",
    "amber",
] as const;
export type AccentId = (typeof ACCENT_IDS)[number];

export interface AccentMeta {
    readonly id: AccentId;
    readonly label: string;
    readonly description: string;
    readonly light: string;
    readonly dark: string;
}

export const ACCENTS: readonly AccentMeta[] = [
    {
        id: "blue",
        label: "经典蓝",
        description: "纯正皇家数码蓝，轻快现代与专业克制",
        light: "#1d4ed8",
        dark: "#60a5fa",
    },
    {
        id: "cyan",
        label: "天青蓝",
        description: "通透澄澈海蓝天青，清爽空灵",
        light: "#0e7490",
        dark: "#22d3ee",
    },
    {
        id: "teal",
        label: "松石绿",
        description: "翡翠热带碧波，兼具沉稳与生命力",
        light: "#0f766e",
        dark: "#2dd4bf",
    },
    {
        id: "violet",
        label: "电光紫",
        description: "先锋科技电光鸢尾，神秘与未来感",
        light: "#6d28d9",
        dark: "#a78bfa",
    },
    {
        id: "orange",
        label: "暖晨橙",
        description: "晨曦破晓朝霞橙金，亲和有温度",
        light: "#c2410c",
        dark: "#fb923c",
    },
    {
        id: "rose",
        label: "绯红玫瑰",
        description: "精致现代杂志感，打破传统极客灰调",
        light: "#be123c",
        dark: "#fb7185",
    },
    {
        id: "emerald",
        label: "森林翡翠",
        description: "宁静舒缓草木绿，护眼与深度专注",
        light: "#15803d",
        dark: "#4ade80",
    },
    {
        id: "amber",
        label: "金珀破晓",
        description: "复古金珀暖阳，沉稳内敛有韵味",
        light: "#b45309",
        dark: "#fbbf24",
    },
    {
        id: "mono",
        label: "黑曜钛",
        description: "纯净黑曜石与金属钛白，极致极简",
        light: "#27272a",
        dark: "#e4e4e7",
    },
] as const;

export function normalizeAccent(raw: unknown): AccentId {
    if (
        typeof raw === "string" &&
        (ACCENT_IDS as readonly string[]).includes(raw)
    ) {
        return raw as AccentId;
    }
    return "blue";
}
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

export type ReasoningEffort =
    | "none"
    | "auto"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max";

export const CANONICAL_REASONING_EFFORTS = [
    "none",
    "auto",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
] as const;

export interface UserGenerationConfig {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    reasoningEffort?: ReasoningEffort;
}

export interface AiGenerationDefaultsDto {
    /** Global fallback generation defaults */
    default?: UserGenerationConfig;
    /** Per-model generation defaults keyed by modelId (e.g. "gpt-4o", "o1", or model DB ID) */
    models?: Record<string, UserGenerationConfig>;
}

export const DEFAULT_WALLPAPER_MASK = 0.36;
export const DEFAULT_WALLPAPER_GLOW_STRENGTH = 0.14;
export const AMBIENT_MOTION_MODES = [
    "off",
    "breathe",
    "breathe_ripple",
] as const;
export type AmbientMotionMode = typeof AMBIENT_MOTION_MODES[number];
export const DEFAULT_AMBIENT_MOTION_MODE: AmbientMotionMode = "breathe_ripple";
export const DEFAULT_AMBIENT_MOTION_STRENGTH = 0.35;

export interface PreferencesDto {
    defaultEngine: EngineId;
    theme: ThemeId;
    style: StylePreset;
    accent: AccentId;
    searchShape: SearchShape;
    /** 搜索框不透明度，取值范围 [0.1, 1.0] */
    searchOpacity: number;
    backgroundImage: string | null;
    wallpaperPresentations: Record<string, WallpaperPresentation>;
    canvasMotion: CanvasMotion;
    canvasMotionLevel: WallpaperMotionLevel;
    searchTarget: SearchTarget;
    searchHistoryEnabled?: boolean;
    webAppHomeLimit: 8 | 12 | 16 | "all";
    webAppIconSize: "compact" | "default" | "large";
    showAppLabels: boolean;
    aiGenerationDefaults?: AiGenerationDefaultsDto;
}
export type NoteColor = "paper" | "amber" | "rose" | "sage" | "sky";
export interface Envelope<T> {
    code: number;
    status: boolean;
    data?: T;
    message?: string;
}
