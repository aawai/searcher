import type { ThemeId } from "@shared/contracts.ts";

export type ColorScheme = "light" | "dark";

export const THEME_LABELS: Readonly<Record<ThemeId, string>> = {
    system: "跟随系统",
    light: "浅色",
    dark: "深色",
    "high-contrast-light": "高对比浅色",
    "high-contrast-dark": "高对比深色",
};

/**
 * The top-bar toggle flips light and dark in one click and keeps the contrast
 * level; 跟随系统 becomes the explicit opposite of what the system shows now.
 */
export function toggleThemeScheme(
    theme: ThemeId,
    prefersDark: boolean,
): ThemeId {
    switch (theme) {
        case "system":
            return prefersDark ? "light" : "dark";
        case "light":
            return "dark";
        case "dark":
            return "light";
        case "high-contrast-light":
            return "high-contrast-dark";
        case "high-contrast-dark":
            return "high-contrast-light";
    }
}

export function isHighContrastTheme(theme: ThemeId): boolean {
    return theme === "high-contrast-light" || theme === "high-contrast-dark";
}

/**
 * 主题偏好在 `<html>` 上的呈现：`data-theme` 只表示基础明暗，现有明暗消费者不受高对比影响；
 * 高对比另以 `data-contrast="more"` 叠加。“跟随系统”只按 `prefers-color-scheme` 解析。
 */
export interface ResolvedTheme {
    scheme: ColorScheme;
    highContrast: boolean;
}

export function resolveTheme(
    theme: ThemeId,
    prefersDark: boolean,
): ResolvedTheme {
    switch (theme) {
        case "system":
            return {
                scheme: prefersDark ? "dark" : "light",
                highContrast: false,
            };
        case "light":
        case "dark":
            return { scheme: theme, highContrast: false };
        case "high-contrast-light":
            return { scheme: "light", highContrast: true };
        case "high-contrast-dark":
            return { scheme: "dark", highContrast: true };
    }
}

export function applyResolvedTheme(
    root: HTMLElement,
    { scheme, highContrast }: ResolvedTheme,
): void {
    root.dataset.theme = scheme;
    if (highContrast) root.dataset.contrast = "more";
    else delete root.dataset.contrast;
}
