/**
 * Wallpaper Motion Controller (WAAPI Runtime Renderer)
 *
 * Implements Phase 0C v2 temporal motion runtime:
 * - Single writer per property invariant (image transform count <= 1)
 * - State machine precedence: reduced > paused-hidden > handing-off > retargeting > running > idle
 * - Deterministic same-mode retarget with phase preservation
 * - Cross-mode handoff matrix
 * - Visibility lifecycle (pause on hidden, same-phase resume without catch-up)
 * - Reduced-motion toggle semantics
 */

import {
    calculateWallpaperOverscan,
    formatOverscanInset,
    maxWallpaperOverscan,
    WALLPAPER_DRIFT_PARAMS,
    WALLPAPER_ZOOM_PARAMS,
    type WallpaperMotion,
    type WallpaperMotionLevel,
    type WallpaperOverscan,
    type WallpaperSubstrate,
} from "@shared/wallpaper-presentation.ts";
import {
    resolveNormalizedDrift,
    resolveNormalizedZoom,
    WALLPAPER_MOTION_PROFILES,
    WALLPAPER_TEMPORAL_BUDGET,
    type WallpaperTemporalKeyframe,
} from "@shared/wallpaper-temporal.ts";

export type WallpaperMotionRuntimeState =
    | "idle"
    | "running"
    | "retargeting"
    | "handing-off"
    | "paused-hidden"
    | "reduced";

export interface WallpaperMotionControllerElements {
    image?: HTMLElement | null;
    overscan?: HTMLElement | null;
    fieldA?: HTMLElement | null;
    fieldB?: HTMLElement | null;
}

export interface WallpaperMotionIntent {
    motion: WallpaperMotion;
    motionLevel: WallpaperMotionLevel;
    substrate?: WallpaperSubstrate;
    reducedMotion?: boolean;
    blur?: number;
}

export class WallpaperMotionController {
    private imageEl: HTMLElement | null = null;
    private fieldAEl: HTMLElement | null = null;
    private fieldBEl: HTMLElement | null = null;

    private overscanEl: HTMLElement | null = null;
    private overscanShrinkTimer: number | null = null;
    private state: WallpaperMotionRuntimeState = "idle";
    private currentIntent: WallpaperMotionIntent = {
        motion: "off",
        motionLevel: "soft",
        substrate: "image",
        reducedMotion: false,
    };
    private desiredIntent: WallpaperMotionIntent = { ...this.currentIntent };

    private imageAnimation: Animation | null = null;
    private fieldAAnimation: Animation | null = null;
    private fieldBAnimation: Animation | null = null;

    private handoffAnimation: Animation | null = null;
    private isHidden = false;
    private visibilityListener: (() => void) | null = null;

    constructor(elements?: WallpaperMotionControllerElements) {
        if (elements) {
            this.setElements(elements);
        }
        if (typeof document !== "undefined") {
            this.isHidden = document.hidden;
            this.visibilityListener = () => this.handleVisibilityChange();
            document.addEventListener(
                "visibilitychange",
                this.visibilityListener,
            );
        }
    }

    public setElements(elements: WallpaperMotionControllerElements): void {
        this.imageEl = elements.image ?? null;
        this.overscanEl = elements.overscan ?? null;
        this.fieldAEl = elements.fieldA ?? null;
        this.fieldBEl = elements.fieldB ?? null;
    }

    public getState(): WallpaperMotionRuntimeState {
        return this.state;
    }

    public getIntent(): WallpaperMotionIntent {
        return { ...this.currentIntent };
    }

    public update(intent: WallpaperMotionIntent): void {
        this.desiredIntent = { ...intent };

        // 1. Reduced motion takes absolute precedence
        if (intent.reducedMotion) {
            this.applyReducedMotion();
            return;
        }

        // 2. Hidden tab: record desired intent without starting new animations
        if (this.isHidden) {
            this.state = "paused-hidden";
            return;
        }

        // 3. Normal transition
        this.applyIntent(intent);
    }

    private applyReducedMotion(): void {
        this.cancelActiveMotion();
        this.setNeutralTransforms();
        this.state = "reduced";
        this.currentIntent = { ...this.desiredIntent, reducedMotion: true };
    }

    private handleVisibilityChange(): void {
        if (typeof document === "undefined") return;
        const hidden = document.hidden;
        this.isHidden = hidden;

        if (this.desiredIntent.reducedMotion) {
            this.state = "reduced";
            return;
        }

        if (hidden) {
            // Pause active animation and record phase
            if (
                this.imageAnimation &&
                this.imageAnimation.playState === "running"
            ) {
                this.imageAnimation.pause();
            }
            if (
                this.fieldAAnimation &&
                this.fieldAAnimation.playState === "running"
            ) {
                this.fieldAAnimation.pause();
            }
            if (
                this.fieldBAnimation &&
                this.fieldBAnimation.playState === "running"
            ) {
                this.fieldBAnimation.pause();
            }
            this.state = "paused-hidden";
        } else {
            // Visible: apply latest desired intent
            if (
                this.currentIntent.motion === this.desiredIntent.motion &&
                this.currentIntent.motionLevel ===
                    this.desiredIntent.motionLevel
            ) {
                // Same intent: same-phase resume
                if (this.imageAnimation) this.imageAnimation.play();
                if (this.fieldAAnimation) this.fieldAAnimation.play();
                if (this.fieldBAnimation) this.fieldBAnimation.play();
                this.state = this.imageAnimation || this.fieldAAnimation
                    ? "running"
                    : "idle";
            } else {
                // Changed while hidden: apply latest intent from frozen state
                this.applyIntent(this.desiredIntent);
            }
        }
    }

    private applyIntent(intent: WallpaperMotionIntent): void {
        const prevMotion = this.currentIntent.motion;
        const nextMotion = intent.motion;
        const prevLevel = this.currentIntent.motionLevel;
        const nextLevel = intent.motionLevel;
        const prevBlur = this.currentIntent.blur ?? 0;
        const wasReduced = this.state === "reduced";

        const outgoingOverscan = calculateWallpaperOverscan({
            motion: prevMotion,
            motionLevel: prevLevel,
            blur: prevBlur,
        });

        this.currentIntent = { ...intent };

        if (wasReduced) {
            this.handoffMode(
                "off",
                nextMotion,
                nextLevel,
                intent.substrate ?? "image",
                outgoingOverscan,
            );
            return;
        }
        // Same mode retarget (level change)
        if (prevMotion === nextMotion && prevMotion !== "off") {
            if (prevLevel !== nextLevel) {
                this.retargetSameMode(
                    nextMotion,
                    nextLevel,
                    intent.substrate ?? "image",
                    outgoingOverscan,
                );
            }
            return;
        }

        // Cross mode handoff
        this.handoffMode(
            prevMotion,
            nextMotion,
            nextLevel,
            intent.substrate ?? "image",
            outgoingOverscan,
        );
    }

    private applyOverscan(overscan: WallpaperOverscan): void {
        if (!this.overscanEl) return;
        this.overscanEl.style.setProperty(
            "--wallpaper-overscan-x",
            formatOverscanInset(overscan.percentageX, overscan.pixelsX),
        );
        this.overscanEl.style.setProperty(
            "--wallpaper-overscan-y",
            formatOverscanInset(overscan.percentageY, overscan.pixelsY),
        );
    }

    private clearOverscanShrinkTimer(): void {
        if (this.overscanShrinkTimer !== null) {
            clearTimeout(this.overscanShrinkTimer);
            this.overscanShrinkTimer = null;
        }
    }

    private retargetSameMode(
        mode: WallpaperMotion,
        newLevel: WallpaperMotionLevel,
        substrate: WallpaperSubstrate,
        outgoingOverscan: WallpaperOverscan,
    ): void {
        this.state = "retargeting";
        this.clearOverscanShrinkTimer();

        const blur = this.currentIntent.blur ?? 0;
        const targetOverscan = calculateWallpaperOverscan({
            motion: mode,
            motionLevel: newLevel,
            blur,
        });

        const isAmplitudeIncrease =
            targetOverscan.percentageX > outgoingOverscan.percentageX ||
            targetOverscan.scale > outgoingOverscan.scale;

        if (isAmplitudeIncrease) {
            this.applyOverscan(targetOverscan);
        } else {
            this.applyOverscan(outgoingOverscan);
            this.overscanShrinkTimer = Number(setTimeout(() => {
                this.applyOverscan(targetOverscan);
                this.overscanShrinkTimer = null;
            }, WALLPAPER_TEMPORAL_BUDGET.retargetWindowMs));
        }

        if (mode === "drift" && this.imageEl) {
            const currentPhase = this.capturePhase(
                this.imageAnimation,
                WALLPAPER_MOTION_PROFILES.drift.durationSeconds,
            );
            this.cancelImageAnimation();
            this.startDrift(newLevel, currentPhase);
            this.state = "running";
        } else if (mode === "zoom" && this.imageEl) {
            const currentPhase = this.capturePhase(
                this.imageAnimation,
                WALLPAPER_MOTION_PROFILES.zoom.durationSeconds,
            );
            this.cancelImageAnimation();
            this.startZoom(newLevel, currentPhase);
            this.state = "running";
        } else if (mode === "ambient") {
            const phaseA = this.capturePhase(
                this.fieldAAnimation,
                WALLPAPER_MOTION_PROFILES.ambientA.durationSeconds,
            );
            const phaseB = this.capturePhase(
                this.fieldBAnimation,
                WALLPAPER_MOTION_PROFILES.ambientB.durationSeconds,
            );
            this.cancelAmbientAnimations();
            this.startAmbient(newLevel, substrate, phaseA, phaseB);
            this.state = "running";
        }
    }

    private handoffMode(
        prevMode: WallpaperMotion,
        nextMode: WallpaperMotion,
        level: WallpaperMotionLevel,
        substrate: WallpaperSubstrate,
        outgoingOverscan: WallpaperOverscan,
    ): void {
        this.cancelHandoffAnimation();
        this.clearOverscanShrinkTimer();

        const blur = this.currentIntent.blur ?? 0;
        const targetOverscan = calculateWallpaperOverscan({
            motion: nextMode,
            motionLevel: level,
            blur,
        });
        const handoffEnvelope = maxWallpaperOverscan(
            outgoingOverscan,
            targetOverscan,
        );
        this.applyOverscan(handoffEnvelope);

        const hasOutgoingTransform =
            (prevMode === "drift" || prevMode === "zoom") &&
            this.imageAnimation &&
            this.imageEl &&
            typeof this.imageEl.animate === "function";

        if (hasOutgoingTransform) {
            let currentTransform = "none";
            if (
                typeof globalThis !== "undefined" &&
                typeof globalThis.getComputedStyle === "function"
            ) {
                currentTransform =
                    globalThis.getComputedStyle(this.imageEl!).transform;
            }
            this.cancelImageAnimation();

            if (
                currentTransform &&
                currentTransform !== "none" &&
                currentTransform !== "matrix(1, 0, 0, 1, 0, 0)"
            ) {
                this.state = "handing-off";
                const handoffAnim = this.imageEl!.animate(
                    [
                        { transform: currentTransform },
                        { transform: "matrix(1, 0, 0, 1, 0, 0)" },
                    ],
                    {
                        duration: WALLPAPER_TEMPORAL_BUDGET.handoffDurationMs,
                        easing: "ease-out",
                    },
                );
                this.handoffAnimation = handoffAnim;

                handoffAnim.onfinish = () => {
                    if (this.handoffAnimation === handoffAnim) {
                        this.handoffAnimation = null;
                        this.finishHandoff(nextMode, level, substrate);
                    }
                };
                return;
            }
        }

        this.finishHandoff(nextMode, level, substrate);
    }

    private finishHandoff(
        nextMode: WallpaperMotion,
        level: WallpaperMotionLevel,
        substrate: WallpaperSubstrate,
    ): void {
        this.cancelActiveMotion();
        const blur = this.currentIntent.blur ?? 0;
        const targetOverscan = calculateWallpaperOverscan({
            motion: nextMode,
            motionLevel: level,
            blur,
        });
        this.applyOverscan(targetOverscan);
        if (nextMode === "off") {
            this.setNeutralTransforms();
            this.state = "idle";
            return;
        }

        if (nextMode === "ambient") {
            this.setNeutralImageTransform();
            this.startAmbient(level, substrate);
            this.state = "running";
            return;
        }

        if (nextMode === "drift") {
            this.cancelAmbientAnimations();
            this.startDrift(level, 0);
            this.state = "running";
            return;
        }

        if (nextMode === "zoom") {
            this.cancelAmbientAnimations();
            this.startZoom(level, 0);
            this.state = "running";
            return;
        }
    }

    private startDrift(level: WallpaperMotionLevel, initialPhase = 0): void {
        if (!this.imageEl || typeof this.imageEl.animate !== "function") return;

        const stage = WALLPAPER_DRIFT_PARAMS[level];
        const profile = WALLPAPER_MOTION_PROFILES.drift;

        const keyframes = profile.keyframes.map(
            (kf: WallpaperTemporalKeyframe) => {
                const resolved = resolveNormalizedDrift(kf, stage);
                return {
                    offset: kf.offset,
                    transform:
                        `translate(${resolved.translateXPercent}%, ${resolved.translateYPercent}%)`,
                };
            },
        );

        this.imageAnimation = this.imageEl.animate(keyframes, {
            duration: profile.durationSeconds * 1000,
            iterations: Infinity,
            easing: "linear",
        });

        if (initialPhase > 0) {
            this.imageAnimation.currentTime = initialPhase *
                profile.durationSeconds * 1000;
        }
    }

    private startZoom(level: WallpaperMotionLevel, initialPhase = 0): void {
        if (!this.imageEl || typeof this.imageEl.animate !== "function") return;

        const stage = WALLPAPER_ZOOM_PARAMS[level];
        const profile = WALLPAPER_MOTION_PROFILES.zoom;

        const keyframes = profile.keyframes.map(
            (kf: WallpaperTemporalKeyframe) => {
                const resolved = resolveNormalizedZoom(kf, stage);
                return {
                    offset: kf.offset,
                    transform: `scale(${resolved.scale})`,
                };
            },
        );

        this.imageAnimation = this.imageEl.animate(keyframes, {
            duration: profile.durationSeconds * 1000,
            iterations: Infinity,
            easing: "linear",
        });

        if (initialPhase > 0) {
            this.imageAnimation.currentTime = initialPhase *
                profile.durationSeconds * 1000;
        }
    }

    private startAmbient(
        _level: WallpaperMotionLevel,
        _substrate: WallpaperSubstrate,
        _phaseA = 0,
        _phaseB = 0,
    ): void {
        this.setNeutralImageTransform();
    }

    private capturePhase(
        animation: Animation | null,
        durationSeconds: number,
    ): number {
        if (
            !animation || typeof animation.currentTime !== "number" ||
            isNaN(animation.currentTime)
        ) {
            return 0;
        }
        const ms = durationSeconds * 1000;
        const norm = ((animation.currentTime % ms) + ms) % ms;
        return norm / ms;
    }

    private cancelImageAnimation(): void {
        if (this.imageAnimation) {
            try {
                this.imageAnimation.cancel();
            } catch {
                // Safe ignore
            }
            this.imageAnimation = null;
        }
    }

    private cancelAmbientAnimations(): void {
        if (this.fieldAAnimation) {
            try {
                this.fieldAAnimation.cancel();
            } catch {
                // Safe ignore
            }
            this.fieldAAnimation = null;
        }
        if (this.fieldBAnimation) {
            try {
                this.fieldBAnimation.cancel();
            } catch {
                // Safe ignore
            }
            this.fieldBAnimation = null;
        }
    }

    private cancelHandoffAnimation(): void {
        if (this.handoffAnimation) {
            try {
                this.handoffAnimation.cancel();
            } catch {
                // Safe ignore
            }
            this.handoffAnimation = null;
        }
    }

    public cancelActiveMotion(): void {
        this.cancelHandoffAnimation();
        this.cancelImageAnimation();
        this.cancelAmbientAnimations();
    }

    private setNeutralImageTransform(): void {
        if (this.imageEl) {
            this.imageEl.style.transform = "";
        }
    }

    private setNeutralTransforms(): void {
        this.setNeutralImageTransform();
        if (this.fieldAEl) {
            this.fieldAEl.style.transform = "";
            this.fieldAEl.style.opacity = "";
        }
        if (this.fieldBEl) {
            this.fieldBEl.style.transform = "";
            this.fieldBEl.style.opacity = "";
        }
    }

    public destroy(): void {
        this.cancelActiveMotion();
        if (this.visibilityListener && typeof document !== "undefined") {
            document.removeEventListener(
                "visibilitychange",
                this.visibilityListener,
            );
            this.visibilityListener = null;
        }
        this.state = "idle";
        this.imageEl = null;
        this.fieldAEl = null;
        this.fieldBEl = null;
    }
}
