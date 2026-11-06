import type { ThemeId } from "@shared/contracts.ts";
import {
    Contrast,
    Eclipse,
    type LucideIcon,
    Moon,
    Sun,
    SunMoon,
} from "lucide-react";

/** One glyph per theme, shared by the top-bar toggle and the theme commands. */
export const THEME_ICONS: Readonly<Record<ThemeId, LucideIcon>> = {
    system: SunMoon,
    light: Sun,
    dark: Moon,
    "high-contrast-light": Contrast,
    "high-contrast-dark": Eclipse,
};
