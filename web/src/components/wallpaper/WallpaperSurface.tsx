import { type CSSProperties, type ReactNode, useState } from "react";
import { daypartOf } from "./canvas-daypart.ts";
import { cn } from "../../lib/utils.ts";
import { parseWallpaperSource } from "@shared/wallpaper.ts";
import {
    DEFAULT_WALLPAPER_PRESENTATION,
    WALLPAPER_READABILITY_MASKS,
    type WallpaperPresentation,
} from "@shared/wallpaper-presentation.ts";

export interface WallpaperSurfaceProps {
    source?: string | null;
    presentation?: WallpaperPresentation | null;
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

export function WallpaperSurface({
    source,
    presentation,
    className,
    style,
    embedded = false,
    testId,
    children,
}: WallpaperSurfaceProps) {
    const wallpaperCss = formatWallpaperCss(source);
    const substrate = wallpaperCss === "none"
        ? "canvas"
        : wallpaperCss.startsWith("url(")
        ? "image"
        : "gradient";
    const intent = presentation ?? DEFAULT_WALLPAPER_PRESENTATION;
    // Chosen once per mount; the canvas never shifts tone while shown.
    const [daypart] = useState(() => daypartOf(new Date()));
    const focal = substrate === "canvas"
        ? { focalX: 0.5, focalY: 0.5 }
        : intent.composition;
    const mask = substrate === "canvas"
        ? 0
        : WALLPAPER_READABILITY_MASKS[intent.readability];
    return (
        <div
            className={cn(
                "wallpaper-surface",
                embedded && "wallpaper-surface--embedded",
                className,
            )}
            data-substrate={substrate}
            data-daypart={substrate === "canvas" ? daypart : undefined}
            data-wallpaper-image={wallpaperCss.startsWith("url(")
                ? "true"
                : undefined}
            data-testid={testId}
            style={{
                ...style,
                "--wallpaper-image": wallpaperCss,
                "--wallpaper-mask": mask,
                "--wallpaper-position": `${focal.focalX * 100}% ${
                    focal.focalY * 100
                }%`,
            } as CSSProperties}
            aria-hidden={!children}
        >
            {wallpaperCss !== "none" && (
                <div
                    className="wallpaper-surface__image"
                    data-testid={testId ? `${testId}-image` : undefined}
                />
            )}
            <div className="wallpaper-surface__mask" />
            {children}
        </div>
    );
}
