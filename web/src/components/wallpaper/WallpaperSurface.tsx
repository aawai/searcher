import {
    type CSSProperties,
    lazy,
    type ReactNode,
    Suspense,
} from "react";
import { cn } from "../../lib/utils.ts";
import {
    type BotanicalSpecies,
    normalizeBotanicalSpecies,
    parseBotanicalSceneSource,
    parseWallpaperSource,
} from "@shared/wallpaper.ts";
import {
    DEFAULT_WALLPAPER_PRESENTATION,
    type WallpaperPresentation,
} from "@shared/wallpaper-presentation.ts";

const BotanicalSceneCanvas = lazy(() => import("./BotanicalSceneCanvas.tsx"));

export interface WallpaperSurfaceProps {
    source?: string | null;
    botanicalScene?: BotanicalSpecies | null;
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
    const parsed = typeof source === "string"
        ? parseWallpaperSource(source)
        : null;
    if (!parsed) return "none";
    return `url(${JSON.stringify(parsed.value)})`;
}

export function WallpaperSurface({
    source,
    botanicalScene,
    presentation,
    className,
    style,
    embedded = false,
    derived = false,
    disableScene = false,
    testId,
    children,
}: WallpaperSurfaceProps) {
    const botanicalSpecies = !disableScene && !derived
        ? (normalizeBotanicalSpecies(botanicalScene) ??
            parseBotanicalSceneSource(source))
        : null;
    const wallpaperCss = formatWallpaperCss(source);
    const substrate = wallpaperCss === "none" ? "canvas" : "image";
    const intent = presentation ?? DEFAULT_WALLPAPER_PRESENTATION;
    const focal = substrate === "canvas"
        ? { focalX: 0.5, focalY: 0.5 }
        : intent.composition;
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
            {derived && <div className="wallpaper-surface__mask" />}
            {botanicalSpecies && typeof window !== "undefined" && (
                <Suspense fallback={null}>
                    <BotanicalSceneCanvas
                        species={botanicalSpecies}
                        embedded={embedded}
                        testId={testId}
                    />
                </Suspense>
            )}
            {children}
        </div>
    );
}
