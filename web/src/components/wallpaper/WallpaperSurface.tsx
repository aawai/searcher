import {
    type CSSProperties,
    lazy,
    type ReactNode,
    Suspense,
} from "react";
import { cn } from "../../lib/utils.ts";
import { parseWallpaperSource } from "@shared/wallpaper.ts";
import {
    DEFAULT_WALLPAPER_PRESENTATION,
    WALLPAPER_READABILITY_MASKS,
    type WallpaperPresentation,
} from "@shared/wallpaper-presentation.ts";

const BotanicalSceneCanvas = lazy(() => import("./BotanicalSceneCanvas.tsx"));

export interface WallpaperSurfaceProps {
    source?: string | null;
    presentation?: WallpaperPresentation | null;
    className?: string;
    style?: CSSProperties;
    embedded?: boolean;
    derived?: boolean;
    disableScene?: boolean;
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
    if (!parsed || parsed.type === "scene") return "none";
    return `url(${JSON.stringify(parsed.value)})`;
}

export function WallpaperSurface({
    source,
    presentation,
    className,
    style,
    embedded = false,
    derived = false,
    disableScene = false,
    testId,
    children,
}: WallpaperSurfaceProps) {
    const parsed = typeof source === "string"
        ? parseWallpaperSource(source)
        : null;
    const botanicalSpecies = !disableScene && !derived &&
            parsed?.type === "scene"
        ? parsed.species
        : null;
    const wallpaperCss = formatWallpaperCss(source);
    const substrate = wallpaperCss === "none" ? "canvas" : "image";
    const intent = presentation ?? DEFAULT_WALLPAPER_PRESENTATION;
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
                derived && "wallpaper-surface--derived",
                className,
            )}
            data-substrate={substrate}
            data-wallpaper-image={wallpaperCss.startsWith("url(")
                ? "true"
                : undefined}
            data-wallpaper-scene={botanicalSpecies ?? undefined}
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
            {botanicalSpecies && typeof window !== "undefined" && (
                <Suspense fallback={null}>
                    <BotanicalSceneCanvas
                        species={botanicalSpecies}
                        embedded={embedded}
                        testId={testId}
                    />
                </Suspense>
            )}
            <div className="wallpaper-surface__mask" />
            {children}
        </div>
    );
}
