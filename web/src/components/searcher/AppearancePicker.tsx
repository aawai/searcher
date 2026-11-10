import { useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { AccentPreference, ThemeId } from "@shared/contracts.ts";
import { routes } from "../../app/routes.ts";
import { THEME_LABELS, toggleThemeScheme } from "../../design-system/theme.ts";
import { THEME_ICONS } from "./theme-icons.ts";
import { accentLabel, AccentSwatches } from "./AccentSwatches.tsx";
import { ThemeChoices } from "./ThemeChoices.tsx";
import {
    Popover,
    PopoverContent,
    PopoverTitle,
    PopoverTrigger,
} from "../ui/popover.tsx";

const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

/** The system light / dark preference, live; 跟随系统 resolves against it. */
function usePrefersDark(): boolean {
    return useSyncExternalStore(
        (onChange) => {
            const media = globalThis.matchMedia(PREFERS_DARK_QUERY);
            media.addEventListener("change", onChange);
            return () => media.removeEventListener("change", onChange);
        },
        () => globalThis.matchMedia(PREFERS_DARK_QUERY).matches,
    );
}

/**
 * Top-bar theme button: one click flips light and dark and keeps the contrast
 * level (`toggleThemeScheme`). The glyph shows the current theme; every
 * theme is two clicks away in the appearance popover beside it.
 */
export function ThemeToggle(
    { value, onValueChange }: {
        value: ThemeId;
        onValueChange: (next: ThemeId) => void;
    },
) {
    const next = toggleThemeScheme(value, usePrefersDark());
    const Icon = THEME_ICONS[value];
    const label = `切换到${THEME_LABELS[next]}`;
    return (
        <button
            type="button"
            onClick={() => onValueChange(next)}
            aria-label={label}
            title={label}
        >
            <Icon size="1em" className="icon-lg" />
        </button>
    );
}

/**
 * Top-bar appearance entry: a palette chip (accent, its pressed shade,
 * foreground and muted ink) that opens the theme tiles and accent swatches.
 * The chip scopes the chosen palette with `data-accent`, so its dots show
 * that palette's colour under every theme, high contrast included.
 */
export function AppearancePicker(
    { theme, accent, onThemeChange, onAccentChange }: {
        theme: ThemeId;
        accent: AccentPreference;
        onThemeChange: (next: ThemeId) => void;
        onAccentChange: (next: AccentPreference) => void;
    },
) {
    const [open, setOpen] = useState(false);
    const label = `外观：${THEME_LABELS[theme]}，${accentLabel(accent)}`;
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                className="appearance-picker-trigger"
                aria-label={label}
                title={label}
            >
                <span
                    className="appearance-picker-chip"
                    data-accent={accent}
                    aria-hidden="true"
                >
                    <span
                        className="appearance-picker-chip-dot"
                        data-tone="accent"
                    />
                    <span
                        className="appearance-picker-chip-dot"
                        data-tone="foreground"
                    />
                    <span
                        className="appearance-picker-chip-dot"
                        data-tone="accent-active"
                    />
                    <span
                        className="appearance-picker-chip-dot"
                        data-tone="muted"
                    />
                </span>
            </PopoverTrigger>
            <PopoverContent
                className="appearance-picker"
                side="bottom"
                align="end"
            >
                <PopoverTitle className="sr-only">外观</PopoverTitle>
                <section className="appearance-picker-section">
                    <p className="appearance-picker-heading" aria-hidden="true">
                        主题
                    </p>
                    <ThemeChoices value={theme} onValueChange={onThemeChange} />
                </section>
                <section className="appearance-picker-section">
                    <p className="appearance-picker-heading" aria-hidden="true">
                        强调色
                        <span>{accentLabel(accent)}</span>
                    </p>
                    <AccentSwatches
                        value={accent}
                        onValueChange={onAccentChange}
                    />
                </section>
                <section className="appearance-picker-section">
                    <Link
                        className="appearance-picker-more"
                        to={routes.settings("appearance")}
                        viewTransition
                        onClick={() => setOpen(false)}
                    >
                        更多外观设置
                        <ChevronRight aria-hidden="true" />
                    </Link>
                </section>
            </PopoverContent>
        </Popover>
    );
}
