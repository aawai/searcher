import { useEffect, useRef } from "react";
import type { BotanicalSpecies } from "@shared/wallpaper.ts";
import type { BackdropPolarity } from "../../design-system/wallpaper-accent.ts";
import { THEME_SYNC_EVENT } from "../../design-system/theme-transition.ts";
import {
    type BotanicalPalette,
    type BotanicalPointerState,
    type BotanicalScene,
    buildBotanicalPalette,
    createBotanicalRuntimeState,
    formatLocalDateKey,
    generateBotanicalScene,
    renderBotanicalFrame,
    resolveBotanicalSpecies,
    resolveBotanicalViewport,
    resolveDiurnalWindScale,
    triggerBotanicalResonance,
} from "./botanical-engine.ts";
import {
    BOTANICAL_RESONANCE_EVENT,
    type BotanicalResonanceDetail,
} from "./botanical-resonance.ts";

export interface BotanicalSceneCanvasProps {
    species: BotanicalSpecies;
    embedded?: boolean;
    overPhoto?: boolean;
    backdropPolarity?: BackdropPolarity;
    sceneSide?: "left" | "right";
    testId?: string;
}

const PLAYED_STORAGE_KEY = "searcher:botanical-played";
const GROWTH_DURATION_SEC = 2.55;

function readPlayedKey(): string {
    try {
        return sessionStorage.getItem(PLAYED_STORAGE_KEY) ?? "";
    } catch {
        return "";
    }
}

function writePlayedKey(key: string): void {
    try {
        sessionStorage.setItem(PLAYED_STORAGE_KEY, key);
    } catch {
        // Ignore storage errors in restricted environments.
    }
}

function isEditableElement(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function readThemePalette(
    canvas: HTMLCanvasElement,
    overPhoto = false,
    backdropPolarity?: BackdropPolarity,
    localHour?: number,
): {
    hidden: boolean;
    palette: BotanicalPalette;
} {
    const root = document.documentElement;
    const forcedColors =
        globalThis.matchMedia("(forced-colors: active)").matches;
    const highContrast = root.dataset.contrast === "more";
    const isDark = backdropPolarity
        ? backdropPolarity === "dark"
        : root.dataset.theme === "dark";
    const computedRoot = getComputedStyle(root);
    const computedCanvasColor = getComputedStyle(canvas).color;
    const accent = computedCanvasColor ||
        computedRoot.getPropertyValue("--accent");
    const foreground = computedRoot.getPropertyValue("--foreground");
    return {
        hidden: forcedColors || highContrast,
        palette: buildBotanicalPalette(
            isDark,
            accent,
            foreground,
            overPhoto,
            localHour,
        ),
    };
}

export default function BotanicalSceneCanvas({
    species,
    embedded = false,
    overPhoto = false,
    backdropPolarity,
    sceneSide = "right",
    testId,
}: BotanicalSceneCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const overPhotoRef = useRef(overPhoto);
    overPhotoRef.current = overPhoto;
    const backdropPolarityRef = useRef(backdropPolarity);
    backdropPolarityRef.current = backdropPolarity;
    const sceneSideRef = useRef(sceneSide);
    sceneSideRef.current = sceneSide;
    const refreshThemeRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        refreshThemeRef.current?.();
    }, [overPhoto, backdropPolarity, sceneSide]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const reducedMotionQuery = globalThis.matchMedia(
            "(prefers-reduced-motion: reduce)",
        );
        const forcedColorsQuery = globalThis.matchMedia(
            "(forced-colors: active)",
        );

        let width = 0;
        let height = 0;
        let dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
        let viewport = resolveBotanicalViewport(0, 0, embedded);
        let scene: BotanicalScene | null = null;
        let paletteState = readThemePalette(
            canvas,
            overPhotoRef.current,
            backdropPolarityRef.current,
        );
        let reducedMotion = reducedMotionQuery.matches;
        let pageHidden = document.hidden;
        let searchFocused = !embedded &&
            isEditableElement(document.activeElement);
        let windCalm = searchFocused ? 0.14 : 1.0;
        let frameSeq = 0;
        let prevFrameSec = 0;
        let rafId: number | null = null;

        const nowDate = new Date();
        const dateKey = formatLocalDateKey(nowDate);
        const localHour = nowDate.getHours();
        const diurnalWind = resolveDiurnalWindScale(localHour);
        paletteState = readThemePalette(
            canvas,
            overPhotoRef.current,
            backdropPolarityRef.current,
            localHour,
        );
        const concreteSpecies = resolveBotanicalSpecies(species, dateKey);
        const playSignature = `${dateKey}:${species}`;
        const shouldAnimateGrowth = !embedded && !reducedMotion &&
            readPlayedKey() !== playSignature;
        if (shouldAnimateGrowth) {
            writePlayedKey(playSignature);
        }

        const startSec = performance.now() / 1000;
        const growthStartSec = shouldAnimateGrowth
            ? startSec
            : startSec - GROWTH_DURATION_SEC - 1;
        let lastDriftSpawn = growthStartSec + GROWTH_DURATION_SEC + 1.4;

        const drifters: Parameters<typeof renderBotanicalFrame>[0]["drifters"] =
            [];
        const runtime = createBotanicalRuntimeState();
        const pointer: BotanicalPointerState = {
            x: -9999,
            y: -9999,
            vx: 0,
            vy: 0,
            lastT: 0,
            lastRustleSpawn: 0,
        };

        const cancelLoop = () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        };

        const renderFrame = (nowMs: number) => {
            rafId = null;
            if (!scene || width <= 0 || height <= 0) return;
            if (paletteState.hidden) {
                ctx.clearRect(0, 0, viewport.sceneWidth, viewport.sceneHeight);
                return;
            }

            frameSeq++;
            const timeSec = nowMs / 1000;
            const dt = prevFrameSec > 0
                ? Math.min(timeSec - prevFrameSec, 0.05)
                : 0.016;
            prevFrameSec = timeSec;

            const targetCalm = (searchFocused ? 0.14 : 1.0) * diurnalWind;
            windCalm += (targetCalm - windCalm) * Math.min(1, dt * 4.5);

            const staticMode = embedded || reducedMotion;
            const rawProgress = staticMode ? 1 : Math.max(
                0,
                Math.min(1, (timeSec - growthStartSec) / GROWTH_DURATION_SEC),
            );

            lastDriftSpawn = renderBotanicalFrame({
                ctx,
                scene,
                width: viewport.sceneWidth,
                height: viewport.sceneHeight,
                timeSec,
                dt,
                rawProgress,
                reducedMotion: staticMode,
                windCalm,
                searchFocused,
                embedded,
                palette: paletteState.palette,
                pointer,
                drifters,
                lastDriftSpawn,
                frameSeq,
                runtime,
                sceneSide: sceneSideRef.current,
                dateKey,
                localHour,
            });

            if (!staticMode && !pageHidden) {
                rafId = requestAnimationFrame(renderFrame);
            }
        };

        const scheduleRender = () => {
            cancelLoop();
            prevFrameSec = 0;
            rafId = requestAnimationFrame(renderFrame);
        };

        const measureAndRebuild = () => {
            const host = canvas.parentElement;
            const nextW = Math.round(
                embedded && host ? host.clientWidth : globalThis.innerWidth,
            );
            const nextH = Math.round(
                embedded && host ? host.clientHeight : globalThis.innerHeight,
            );
            if (nextW <= 0 || nextH <= 0) return;
            const nextDpr = Math.min(globalThis.devicePixelRatio || 1, 2);
            if (
                scene && nextW === width && nextH === height && nextDpr === dpr
            ) {
                return;
            }
            width = nextW;
            height = nextH;
            dpr = nextDpr;
            viewport = resolveBotanicalViewport(width, height, embedded);
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            ctx.setTransform(
                dpr * viewport.renderScale,
                0,
                0,
                dpr * viewport.renderScale,
                0,
                0,
            );
            scene = generateBotanicalScene(
                concreteSpecies,
                viewport.sceneWidth,
                viewport.sceneHeight,
                dateKey,
                embedded,
            );
            drifters.length = 0;
            scheduleRender();
        };

        const refreshTheme = () => {
            paletteState = readThemePalette(
                canvas,
                overPhotoRef.current,
                backdropPolarityRef.current,
            );
            if (paletteState.hidden) {
                cancelLoop();
                ctx.clearRect(0, 0, viewport.sceneWidth, viewport.sceneHeight);
            } else {
                scheduleRender();
            }
        };
        refreshThemeRef.current = refreshTheme;

        const onThemeSync = () => {
            paletteState = readThemePalette(
                canvas,
                overPhotoRef.current,
                backdropPolarityRef.current,
            );
            cancelLoop();
            if (paletteState.hidden) {
                ctx.clearRect(0, 0, viewport.sceneWidth, viewport.sceneHeight);
            } else {
                if (!embedded && !reducedMotion) {
                    triggerBotanicalResonance(
                        runtime,
                        "theme-ripple",
                        performance.now() / 1000,
                        scene,
                        drifters,
                        windCalm,
                        frameSeq,
                    );
                }
                renderFrame(performance.now());
            }
        };

        const onResonance = (e: Event) => {
            if (embedded || reducedMotion || paletteState.hidden) return;
            const detail = (e as CustomEvent<BotanicalResonanceDetail>).detail;
            if (!detail?.kind) return;
            triggerBotanicalResonance(
                runtime,
                detail.kind,
                performance.now() / 1000,
                scene,
                drifters,
                windCalm,
                frameSeq,
            );
            if (!pageHidden && rafId === null) {
                scheduleRender();
            }
        };

        const onReducedMotionChange = (e: MediaQueryListEvent) => {
            reducedMotion = e.matches;
            drifters.length = 0;
            scheduleRender();
        };

        const onForcedColorsChange = () => {
            refreshTheme();
        };

        const onVisibilityChange = () => {
            pageHidden = document.hidden;
            if (pageHidden) {
                cancelLoop();
            } else if (!embedded && !reducedMotion && !paletteState.hidden) {
                scheduleRender();
            }
        };

        const onFocusIn = (e: FocusEvent) => {
            if (isEditableElement(e.target)) searchFocused = true;
        };

        const onFocusOut = () => {
            searchFocused = isEditableElement(document.activeElement);
        };

        const onPointerMove = (e: PointerEvent) => {
            const now = performance.now();
            const dt = Math.max(8, now - pointer.lastT) / 1000;
            if (pointer.lastT > 0) {
                pointer.vx = (e.clientX - pointer.x) / dt;
                pointer.vy = (e.clientY - pointer.y) / dt;
            }
            pointer.x = e.clientX;
            pointer.y = e.clientY;
            pointer.lastT = now;
        };

        const themeObserver = new MutationObserver(refreshTheme);
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: [
                "data-theme",
                "data-contrast",
                "data-accent",
                "style",
            ],
        });

        let resizeObserver: ResizeObserver | null = null;
        if (
            embedded && canvas.parentElement &&
            typeof ResizeObserver !== "undefined"
        ) {
            resizeObserver = new ResizeObserver(measureAndRebuild);
            resizeObserver.observe(canvas.parentElement);
        } else {
            globalThis.addEventListener("resize", measureAndRebuild);
        }

        reducedMotionQuery.addEventListener("change", onReducedMotionChange);
        forcedColorsQuery.addEventListener("change", onForcedColorsChange);
        document.addEventListener("visibilitychange", onVisibilityChange);
        globalThis.addEventListener(THEME_SYNC_EVENT, onThemeSync);
        if (!embedded) {
            globalThis.addEventListener(
                BOTANICAL_RESONANCE_EVENT,
                onResonance,
            );
            document.addEventListener("focusin", onFocusIn);
            document.addEventListener("focusout", onFocusOut);
            globalThis.addEventListener("pointermove", onPointerMove, {
                passive: true,
            });
        }

        measureAndRebuild();

        return () => {
            cancelLoop();
            refreshThemeRef.current = null;
            themeObserver.disconnect();
            resizeObserver?.disconnect();
            globalThis.removeEventListener("resize", measureAndRebuild);
            reducedMotionQuery.removeEventListener(
                "change",
                onReducedMotionChange,
            );
            forcedColorsQuery.removeEventListener(
                "change",
                onForcedColorsChange,
            );
            document.removeEventListener(
                "visibilitychange",
                onVisibilityChange,
            );
            globalThis.removeEventListener(THEME_SYNC_EVENT, onThemeSync);
            if (!embedded) {
                globalThis.removeEventListener(
                    BOTANICAL_RESONANCE_EVENT,
                    onResonance,
                );
                document.removeEventListener("focusin", onFocusIn);
                document.removeEventListener("focusout", onFocusOut);
                globalThis.removeEventListener("pointermove", onPointerMove);
            }
        };
    }, [species, embedded]);

    return (
        <canvas
            ref={canvasRef}
            className="wallpaper-surface__scene"
            data-testid={testId ? `${testId}-scene` : undefined}
            data-botanical-species={species}
            data-scene-side={sceneSide}
            data-ink-polarity={backdropPolarity}
            aria-hidden="true"
        />
    );
}
