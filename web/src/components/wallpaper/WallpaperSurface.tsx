import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";
import { cn } from "../../lib/utils.ts";
import {
    type AmbientMotionMode,
    DEFAULT_AMBIENT_MOTION_MODE,
    DEFAULT_AMBIENT_MOTION_STRENGTH,
    DEFAULT_WALLPAPER_GLOW_STRENGTH,
    DEFAULT_WALLPAPER_MASK,
} from "@shared/contracts.ts";
import {
    DEFAULT_WALLPAPER_COMPOSITION,
    parseWallpaperSource,
    type WallpaperComposition,
} from "@shared/wallpaper.ts";
export interface WallpaperSurfaceProps {
    source?: string | null;
    composition?: WallpaperComposition | null;
    blur?: number;
    grayscale?: number;
    mask?: number;
    glowStrength?: number;
    ambientMotionMode?: AmbientMotionMode;
    ambientMotionStrength?: number;
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

    // 1. Guest Data URL (strictly validated format and supported mime types)
    if (trimmed.startsWith("data:")) {
        if (
            /^data:image\/(?:png|jpeg|webp|avif);base64,[A-Za-z0-9+/=]+$/.test(
                trimmed,
            )
        ) {
            return `url(${JSON.stringify(trimmed)})`;
        }
        return "none";
    }

    // 2. Verified uploaded, remote HTTPS, or whitelisted CSS gradient
    const parsed = parseWallpaperSource(trimmed);
    if (!parsed) return "none";

    if (parsed.type === "uploaded" || parsed.type === "remote") {
        return `url(${JSON.stringify(parsed.value)})`;
    }
    if (parsed.type === "gradient") {
        return parsed.value;
    }
    return "none";
}

export function WallpaperSurface({
    source,
    composition,
    blur = 0,
    grayscale = 0,
    mask = DEFAULT_WALLPAPER_MASK,
    glowStrength = DEFAULT_WALLPAPER_GLOW_STRENGTH,
    ambientMotionMode = DEFAULT_AMBIENT_MOTION_MODE,
    ambientMotionStrength = DEFAULT_AMBIENT_MOTION_STRENGTH,
    className,
    style,
    embedded = false,
    testId,
    children,
}: WallpaperSurfaceProps) {
    const wallpaperCss = formatWallpaperCss(source);
    const focalX = composition?.focalX ?? DEFAULT_WALLPAPER_COMPOSITION.focalX;
    const focalY = composition?.focalY ?? DEFAULT_WALLPAPER_COMPOSITION.focalY;

    const S = ambientMotionMode === "off" ? 0 : ambientMotionStrength;
    const glowRestOpacity = 1 - 0.18 * S;
    const glowPeakScale = 1 + 0.05 * S;
    const ripplePeakOpacity = 0.18 * S;
    const ripplePeakScale = 1 + 0.20 * S;

    const focalXPercent = `${focalX * 100}%`;
    const focalYPercent = `${focalY * 100}%`;
    const positionCss = `${focalXPercent} ${focalYPercent}`;
    const rootRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        el.style.setProperty("--wallpaper-position", positionCss);
        el.style.setProperty("--wallpaper-focal-x", focalXPercent);
        el.style.setProperty("--wallpaper-focal-y", focalYPercent);
        el.style.setProperty(
            "--wallpaper-glow-strength",
            `${glowStrength * 100}%`,
        );
        el.style.setProperty("--wallpaper-glow-duration", "8s");
        el.style.setProperty(
            "--wallpaper-glow-rest-opacity",
            String(glowRestOpacity),
        );
        el.style.setProperty(
            "--wallpaper-glow-peak-scale",
            String(glowPeakScale),
        );
        el.style.setProperty(
            "--wallpaper-ripple-peak-opacity",
            String(ripplePeakOpacity),
        );
        el.style.setProperty(
            "--wallpaper-ripple-peak-scale",
            String(ripplePeakScale),
        );
    }, [
        positionCss,
        focalXPercent,
        focalYPercent,
        glowStrength,
        glowRestOpacity,
        glowPeakScale,
        ripplePeakOpacity,
        ripplePeakScale,
    ]);

    return (
        <div
            ref={rootRef}
            className={cn(
                "wallpaper",
                "wallpaper-surface",
                embedded && "wallpaper-surface--embedded",
                className,
            )}
            data-ambient-motion={ambientMotionMode}
            data-wallpaper-image={wallpaperCss.startsWith("url(")
                ? "true"
                : undefined}
            data-testid={testId}
            style={{
                "--wallpaper-image": wallpaperCss,
                "--wallpaper-blur": `${blur}px`,
                "--wallpaper-grayscale": grayscale,
                "--wallpaper-mask": mask,
                ...style,
            } as CSSProperties}
            aria-hidden={!children}
        >
            <div
                className="wallpaper__image wallpaper-surface__image"
                data-testid={testId ? `${testId}-image` : undefined}
            />
            <div className="wallpaper__ripple wallpaper-surface__ripple" />
            {children}
        </div>
    );
}
