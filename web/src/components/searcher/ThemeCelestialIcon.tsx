import type { ThemeId } from "@shared/contracts.ts";
import { cn } from "../../lib/utils.ts";

/**
 * Dual-tone solid celestial glyph for the top-bar theme toggle.
 * Combines `var(--accent)` focal fill with `currentColor` secondary accents
 * so it holds visual weight on wallpapers without a square chip frame.
 */
export function ThemeCelestialIcon(
    { theme, className }: { theme: ThemeId; className?: string },
) {
    return (
        <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className={cn("theme-celestial-icon", className)}
        >
            {theme === "light" && (
                <>
                    <circle cx="10" cy="10" r="4.25" fill="var(--accent)" />
                    <g
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                    >
                        <line x1="10" y1="2.2" x2="10" y2="3.7" />
                        <line x1="10" y1="16.3" x2="10" y2="17.8" />
                        <line x1="2.2" y1="10" x2="3.7" y2="10" />
                        <line x1="16.3" y1="10" x2="17.8" y2="10" />
                        <line x1="4.48" y1="4.48" x2="5.55" y2="5.55" />
                        <line x1="14.45" y1="14.45" x2="15.52" y2="15.52" />
                        <line x1="15.52" y1="4.48" x2="14.45" y2="5.55" />
                        <line x1="5.55" y1="14.45" x2="4.48" y2="15.52" />
                    </g>
                </>
            )}
            {theme === "dark" && (
                <>
                    <path
                        d="M11.6 3.1a6.9 6.9 0 1 0 5.3 11.32 5.65 5.65 0 0 1-5.3-11.32Z"
                        fill="var(--accent)"
                    />
                    <path
                        d="M14.7 3.6l.45 1.15 1.15.45-1.15.45-.45 1.15-.45-1.15-1.15-.45 1.15-.45.45-1.15Z"
                        fill="currentColor"
                    />
                    <circle cx="16.5" cy="8.7" r="0.85" fill="currentColor" />
                </>
            )}
            {theme === "system" && (
                <>
                    <circle
                        cx="10"
                        cy="10"
                        r="7"
                        stroke="currentColor"
                        strokeWidth="1.6"
                    />
                    <path
                        d="M14.95 5.05A7 7 0 0 1 5.05 14.95Z"
                        fill="var(--accent)"
                    />
                    <circle cx="7.4" cy="7.4" r="1.35" fill="currentColor" />
                </>
            )}
            {theme === "high-contrast-light" && (
                <>
                    <circle
                        cx="10"
                        cy="10"
                        r="6.8"
                        stroke="currentColor"
                        strokeWidth="2"
                    />
                    <circle cx="10" cy="10" r="3.4" fill="var(--accent)" />
                </>
            )}
            {theme === "high-contrast-dark" && (
                <>
                    <circle
                        cx="10"
                        cy="10"
                        r="6.8"
                        stroke="currentColor"
                        strokeWidth="2"
                    />
                    <path
                        d="M11 6.1a3.9 3.9 0 1 0 2.9 6.5 3.25 3.25 0 0 1-2.9-6.5Z"
                        fill="var(--accent)"
                    />
                </>
            )}
        </svg>
    );
}
