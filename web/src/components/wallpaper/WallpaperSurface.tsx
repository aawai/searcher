import {
    type CSSProperties,
    type ReactNode,
    useEffect,
    useRef,
    useState,
} from "react";
import { cn } from "../../lib/utils.ts";
import { parseWallpaperSource } from "@shared/wallpaper.ts";
import {
    DEFAULT_WALLPAPER_PRESENTATION,
    resolveWallpaperPresentation,
    type WallpaperMotion,
    type WallpaperPresentation,
} from "@shared/wallpaper-presentation.ts";
import { WallpaperMotionController } from "./wallpaper-motion-controller.ts";

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

export function useWallpaperEnvironment() {
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
    const substrate = wallpaperCss === "none"
        ? "canvas"
        : wallpaperCss.startsWith("url(")
        ? "image"
        : "gradient";
    const intent = presentation ?? DEFAULT_WALLPAPER_PRESENTATION;
    const resolved = resolveWallpaperPresentation(
        motionOverride ? { ...intent, motion: motionOverride } : intent,
        { ...environment, substrate },
    );
    const surfaceRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLDivElement>(null);
    const fieldARef = useRef<HTMLDivElement>(null);
    const fieldBRef = useRef<HTMLDivElement>(null);
    const controllerRef = useRef<WallpaperMotionController | null>(null);

    if (!controllerRef.current && typeof document !== "undefined") {
        controllerRef.current = new WallpaperMotionController();
    }

    useEffect(() => {
        const controller = controllerRef.current;
        if (!controller) return;
        controller.setElements({
            image: imageRef.current,
            overscan: surfaceRef.current,
            fieldA: fieldARef.current,
            fieldB: fieldBRef.current,
        });
        controller.update({
            motion: resolved.motion,
            motionLevel: resolved.motionLevel,
            substrate,
            reducedMotion: environment.reducedMotion,
            blur: resolved.blur,
        });
    }, [
        resolved.motion,
        resolved.motionLevel,
        resolved.blur,
        substrate,
        environment.reducedMotion,
    ]);

    useEffect(() => {
        return () => {
            controllerRef.current?.destroy();
            controllerRef.current = null;
        };
    }, []);
    const inset = (percentage: number, pixels: number) =>
        `calc(-${percentage}% - ${pixels}px)`;
    return (
        <div
            ref={surfaceRef}
            className={cn(
                "wallpaper-surface",
                embedded && "wallpaper-surface--embedded",
                className,
            )}
            data-motion={resolved.motion}
            data-substrate={substrate}
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
                "--wallpaper-ambient-mix-a": `${resolved.ambient.fieldAMix}%`,
                "--wallpaper-ambient-mix-b": `${resolved.ambient.fieldBMix}%`,
                "--wallpaper-ambient-opacity-floor":
                    resolved.ambient.opacityFloor,
                "--wallpaper-radius-a": resolved.timing.ambient.radiusA,
                "--wallpaper-left-a": resolved.timing.ambient.leftA,
                "--wallpaper-top-a": resolved.timing.ambient.topA,
                "--wallpaper-right-b": resolved.timing.ambient.rightB,
                "--wallpaper-top-b": resolved.timing.ambient.topB,
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
                "--wallpaper-ambient-easing": resolved.timing.ambient.easing,
                "--wallpaper-drift-easing": resolved.timing.drift.easing,
                "--wallpaper-zoom-easing": resolved.timing.zoom.easing,
                "--wallpaper-ambient-color": resolved.ambient.neutral
                    ? "var(--wallpaper-neutral-light)"
                    : "var(--accent)",
                "--wallpaper-ambient-travel": `${resolved.ambient.travel}cqmax`,
                "--wallpaper-ambient-scale": resolved.ambient.scale,
                "--wallpaper-drift-x": `${resolved.drift.x}%`,
                "--wallpaper-drift-y": `${resolved.drift.y}%`,
                "--wallpaper-motion-scale": resolved.zoom.scale,
            } as CSSProperties}
            aria-hidden={!children}
        >
            {wallpaperCss !== "none" && (
                <div className="wallpaper-surface__overscan">
                    <div
                        className="wallpaper-surface__image"
                        data-testid={testId ? `${testId}-image` : undefined}
                        ref={imageRef}
                    />
                </div>
            )}
            {resolved.motion === "ambient" && (
                <div className="wallpaper__ambient">
                    <div
                        className="wallpaper__ambient-field-a"
                        ref={fieldARef}
                    />
                    <div
                        className="wallpaper__ambient-field-b"
                        ref={fieldBRef}
                    />
                </div>
            )}
            <div className="wallpaper-surface__mask" />
            {children}
        </div>
    );
}
