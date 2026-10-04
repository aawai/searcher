import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { cn } from "../../lib/utils.ts";
import { parseWallpaperSource } from "@shared/wallpaper.ts";
import {
    DEFAULT_WALLPAPER_PRESENTATION,
    resolveWallpaperPresentation,
    type WallpaperMotion,
    type WallpaperPresentation,
} from "@shared/wallpaper-presentation.ts";

export interface WallpaperSurfaceProps {
    source?: string | null;
    presentation?: WallpaperPresentation | null;
    /** Freeze presentation in focal editors without changing persisted intent. */
    motionOverride?: WallpaperMotion;
    className?: string;
    style?: CSSProperties;
    embedded?: boolean;
    testId?: string;
    children?: ReactNode;
}

export function formatWallpaperCss(source: string | null | undefined): string {
    if (!source || typeof source !== "string") return "none";
    const trimmed = source.trim();
    if (!trimmed) return "none";
    if (trimmed.startsWith("data:")) {
        return /^data:image\/(?:png|jpeg|webp|avif);base64,[A-Za-z0-9+/=]+$/
                .test(trimmed)
            ? `url(${JSON.stringify(trimmed)})`
            : "none";
    }
    const parsed = parseWallpaperSource(trimmed);
    if (!parsed) return "none";
    return parsed.type === "gradient"
        ? parsed.value
        : `url(${JSON.stringify(parsed.value)})`;
}

function useWallpaperEnvironment() {
    const [theme, setTheme] = useState<"light" | "dark">(() =>
        typeof document !== "undefined" &&
            document.documentElement.dataset.theme === "dark"
            ? "dark"
            : "light"
    );
    const [reducedMotion, setReducedMotion] = useState(() =>
        typeof globalThis.matchMedia === "function"
            ? globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
            : false
    );
    useEffect(() => {
        const readTheme = () =>
            setTheme(
                document.documentElement.dataset.theme === "dark"
                    ? "dark"
                    : "light",
            );
        const observer = new MutationObserver(readTheme);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme"],
        });
        readTheme();
        const media = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
        const readMotion = () => setReducedMotion(media.matches);
        media.addEventListener("change", readMotion);
        readMotion();
        return () => {
            observer.disconnect();
            media.removeEventListener("change", readMotion);
        };
    }, []);
    return { theme, reducedMotion };
}

export function WallpaperSurface({
    source,
    presentation,
    motionOverride,
    className,
    style,
    embedded = false,
    testId,
    children,
}: WallpaperSurfaceProps) {
    const environment = useWallpaperEnvironment();
    const wallpaperCss = formatWallpaperCss(source);
    const intent = presentation ?? DEFAULT_WALLPAPER_PRESENTATION;
    const resolved = resolveWallpaperPresentation(
        motionOverride ? { ...intent, motion: motionOverride } : intent,
        { ...environment, hasWallpaper: wallpaperCss !== "none" },
    );
    const inset = (percentage: number, pixels: number) =>
        `calc(-${percentage}% - ${pixels}px)`;
    return (
        <div
            className={cn(
                "wallpaper-surface",
                embedded && "wallpaper-surface--embedded",
                className,
            )}
            data-motion={resolved.motion}
            data-tone={resolved.tone}
            data-motion-level={resolved.motionLevel}
            data-wallpaper-image={wallpaperCss.startsWith("url(")
                ? "true"
                : undefined}
            data-testid={testId}
            style={{
                ...style,
                "--wallpaper-image": wallpaperCss,
                "--wallpaper-filter": resolved.filter,
                "--wallpaper-mask": resolved.mask,
                "--wallpaper-position": `${
                    resolved.composition.focalX * 100
                }% ${resolved.composition.focalY * 100}%`,
                "--wallpaper-overscan-x": inset(
                    resolved.overscan.percentageX,
                    resolved.overscan.pixelsX,
                ),
                "--wallpaper-overscan-y": inset(
                    resolved.overscan.percentageY,
                    resolved.overscan.pixelsY,
                ),
                "--wallpaper-ambient-mix": `${resolved.ambient.fieldMix}%`,
                "--wallpaper-radius-a": resolved.timing.ambient.radiusA,
                "--wallpaper-radius-b": resolved.timing.ambient.radiusB,
                "--wallpaper-duration-a":
                    `${resolved.timing.ambient.durationA}s`,
                "--wallpaper-duration-b":
                    `${resolved.timing.ambient.durationB}s`,
                "--wallpaper-phase": `${-resolved.timing.ambient.phaseOffset}s`,
                "--wallpaper-drift-duration":
                    `${resolved.timing.drift.duration}s`,
                "--wallpaper-zoom-duration":
                    `${resolved.timing.zoom.duration}s`,
                "--wallpaper-easing": resolved.timing.ambient.easing,
                "--wallpaper-ambient-color": resolved.ambient.neutral
                    ? "var(--wallpaper-neutral-light)"
                    : "var(--accent)",
                "--wallpaper-ambient-travel": `${resolved.ambient.travel}vmax`,
                "--wallpaper-ambient-scale": resolved.ambient.scale,
                "--wallpaper-drift-x": `${resolved.drift.x}%`,
                "--wallpaper-drift-y": `${resolved.drift.y}%`,
                "--wallpaper-motion-scale": resolved.motion === "zoom"
                    ? resolved.zoom.scale
                    : resolved.drift.scale,
            } as CSSProperties}
            aria-hidden={!children}
        >
            {wallpaperCss !== "none" && (
                <div className="wallpaper-surface__overscan">
                    <div
                        className="wallpaper-surface__image"
                        data-testid={testId ? `${testId}-image` : undefined}
                    />
                </div>
            )}
            {resolved.motion === "ambient" && (
                <div className="wallpaper__ambient">
                    <div className="wallpaper__ambient-field-a" />
                    <div className="wallpaper__ambient-field-b" />
                </div>
            )}
            <div className="wallpaper-surface__mask" />
            {children}
        </div>
    );
}
