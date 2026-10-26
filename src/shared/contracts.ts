export * from "./wallpaper.ts";
import type { WallpaperPresentation } from "./wallpaper-presentation.ts";
export type { WallpaperPresentation };
import type { EngineId } from "./engines.ts";

export type ThemeId = "system" | "light" | "dark";

/** Shared registration and credential-change validation limits. */
export const AUTH_CREDENTIAL_RULES = {
    username: { minLength: 3, maxLength: 32 },
    password: { minLength: 12, maxLength: 128 },
} as const;
export const AUTH_USERNAME_PATTERN =
    `^\\s*[a-zA-Z0-9_]{${AUTH_CREDENTIAL_RULES.username.minLength},${AUTH_CREDENTIAL_RULES.username.maxLength}}\\s*$`;

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

/** 强调色偏好：跟随壁纸（默认）或手选的预设覆盖。 */
export const ACCENT_PREFERENCES = ["wallpaper", ...ACCENT_IDS] as const;
export type AccentPreference = (typeof ACCENT_PREFERENCES)[number];
export const DEFAULT_ACCENT: AccentPreference = "wallpaper";

/** 玻璃效果档位：驱动 Material 与 Floating 表面的 fill、blur、edge。 */
export const GLASS_INTENSITIES = ["off", "soft", "regular", "clear"] as const;
export type GlassIntensity = (typeof GLASS_INTENSITIES)[number];
export const DEFAULT_GLASS_INTENSITY: GlassIntensity = "regular";

export function normalizeGlassIntensity(raw: unknown): GlassIntensity {
    if (
        typeof raw === "string" &&
        (GLASS_INTENSITIES as readonly string[]).includes(raw)
    ) {
        return raw as GlassIntensity;
    }
    return DEFAULT_GLASS_INTENSITY;
}

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

export function normalizeAccent(raw: unknown): AccentPreference {
    if (
        typeof raw === "string" &&
        (ACCENT_PREFERENCES as readonly string[]).includes(raw)
    ) {
        return raw as AccentPreference;
    }
    return DEFAULT_ACCENT;
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

export interface PreferencesDto {
    defaultEngine: EngineId;
    theme: ThemeId;
    accent: AccentPreference;
    searchShape: SearchShape;
    glassIntensity: GlassIntensity;
    backgroundImage: string | null;
    wallpaperPresentations: Record<string, WallpaperPresentation>;
    searchTarget: SearchTarget;
    searchHistoryEnabled?: boolean;
    showAppLabels: boolean;
    showHomeApps: boolean;
    /** 登录用户的跨设备偏好：首页应用网格是否绘制底板。 */
    showHomeAppPlate: boolean;
    showHomeDate: boolean;
    showHomeTime: boolean;
    showHomeContinue: boolean;
    aiGenerationDefaults?: AiGenerationDefaultsDto;
}

export interface HomeContinueDto {
    /** 最近编辑的未删除笔记，与笔记列表采用相同的显示标题。 */
    document: { id: string; displayTitle: string; updatedAt: number } | null;
    /** 最近更新的未完成 AI 对话。 */
    conversation: { id: string; title: string; updatedAt: number } | null;
    /** 首页便签未勾选待办总数；documentId 指向首张包含未完成待办的便签。 */
    homeTasks: { open: number; documentId: string } | null;
}
export * from "./documents.ts";
export interface Envelope<T> {
    code: number;
    status: boolean;
    data?: T;
    message?: string;
}
