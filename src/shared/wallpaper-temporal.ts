/**
 * Canonical Wallpaper Temporal Motion System
 * Owns deterministic motion budgets, temporal profiles, analytic source curves,
 * normalized channel resolvers, and ambient recurrence analysis.
 */

import {
    WALLPAPER_MOTION_TIMING,
    type WallpaperAmbientStageParams,
    type WallpaperDriftStageParams,
    type WallpaperZoomStageParams,
} from "./wallpaper-presentation.ts";

/**
 * Frozen canonical pass/fail thresholds and budgets for Phase 0C temporal quality.
 * Directly referenced by unit tests, runtime controller, and E2E verifications.
 */
export const WALLPAPER_TEMPORAL_BUDGET = Object.freeze({
    // Sampling
    driftKeyframeSamples: 64,
    zoomKeyframeSamples: 64,
    ambientKeyframeSamples: 64,

    // Drift Quality Gates
    maxDriftAdjacentHeadingDeltaDeg: 30.0,
    maxDriftSpeedMedianRatio: 1.6,
    maxDriftPositionSeamDelta: 0.001,
    maxDriftVelocitySeamDelta: 0.05,
    minDriftSpeed: 0.05,

    // Zoom Quality Gates
    maxZoomPeakAdjacentVelocityRatio: 0.20,
    maxZoomScaleSeamDelta: 0.001,
    maxZoomVelocitySeamDelta: 0.01,
    maxZoomAccelerationSpike: 0.05,

    // Retarget Gates
    retargetPositionToleranceCssPx: 1.0,
    retargetPhaseDriftTolerance: 0.005,
    retargetVelocityDeltaMaxRatio: 0.25,
    retargetWindowMs: 300,

    // Handoff Gates
    handoffDurationMs: 300,
    handoffTransformJumpCssPx: 1.0,

    // Perceptibility Gates
    perceptibilitySampleCount: 5,
    perceptibilityQuantizationTolerance: 0.2,

    // Ambient Recurrence Gates
    ambientRecurrenceHorizonSeconds: 1036, // LCM(28, 37)
    ambientWorstCaseAnalysisWindows: 6,
    maxAmbientLuminanceSwing: 3.0,

    // Geometry Gates
    maxSliderThumbMarkCenterOffsetCssPx: 1.0,
});

/**
 * Canonical normalized keyframe in 0..1 phase domain.
 */
export interface WallpaperTemporalKeyframe {
    readonly offset: number; // 0..1, strictly non-decreasing
    readonly x?: number; // -1..1
    readonly y?: number; // -1..1
    readonly scale?: number; // 0..1 normalized delta
    readonly opacity?: number; // 0..1 normalized envelope
    readonly easing?: string; // easing from this keyframe to the next
}

/**
 * Canonical temporal profile specifying loop duration, delay and keyframe sequence.
 */
export interface WallpaperTemporalProfile {
    readonly durationSeconds: number;
    readonly delaySeconds: number;
    readonly iterations: number;
    readonly keyframes: readonly WallpaperTemporalKeyframe[];
}

/**
 * Unified collection of canonical profiles for all semantic motion modes.
 */
export interface WallpaperMotionProfiles {
    readonly ambientA: WallpaperTemporalProfile;
    readonly ambientB: WallpaperTemporalProfile;
    readonly drift: WallpaperTemporalProfile;
    readonly zoom: WallpaperTemporalProfile;
}

/**
 * Deterministic periodic C1 analytic curve for Drift.
 * Pass through (0,0) at t=0 and t=1 with identical first derivatives.
 */
export function sampleAnalyticDrift(phase: number): { x: number; y: number } {
    const normT = ((phase % 1) + 1) % 1;
    const angle = 2 * Math.PI * normT;
    const x = Math.sin(angle);
    const y = 0.7 * Math.sin(2 * angle);
    return { x, y };
}

/**
 * Smooth turnaround normalized curve for Zoom.
 * Zero at t=0 and t=1, peak 1 at t=0.5, velocity = 0 at peak turnaround.
 */
export function sampleAnalyticZoom(phase: number): number {
    const normT = ((phase % 1) + 1) % 1;
    const base = Math.pow(Math.max(0, Math.sin(Math.PI * normT)), 1.45);
    const easeWidth = 0.02;
    let envelope = 1;
    if (normT < easeWidth) {
        const u = normT / easeWidth;
        envelope = u * u * (3 - 2 * u);
    } else if (normT > 1 - easeWidth) {
        const u = (1 - normT) / easeWidth;
        envelope = u * u * (3 - 2 * u);
    }
    return base * envelope;
}

/**
 * Canonical Ambient Field A temporal trajectory & envelope.
 */
export function sampleAmbientFieldA(phase: number): {
    x: number;
    y: number;
    scale: number;
    opacity: number;
} {
    const normT = ((phase % 1) + 1) % 1;
    // Envelope from keyframes: 0% floor, 35% peak 1, 70% floor+0.35*(1-floor), 100% floor
    let opacity = 0;
    let x = 0;
    let y = 0;
    let scale = 0;

    if (normT <= 0.35) {
        const p = normT / 0.35;
        opacity = p;
        x = p;
        y = -p;
        scale = p;
    } else if (normT <= 0.70) {
        const p = (normT - 0.35) / 0.35;
        opacity = 1 - p * 0.65;
        x = 1 - p * 1.5;
        y = -1 + p * 2.0;
        scale = 1 - p;
    } else {
        const p = (normT - 0.70) / 0.30;
        opacity = 0.35 * (1 - p);
        x = -0.5 * (1 - p);
        y = 1 - p;
        scale = 0;
    }

    return { x, y, scale, opacity };
}

/**
 * Canonical Ambient Field B temporal trajectory & envelope.
 */
export function sampleAmbientFieldB(phase: number): {
    x: number;
    y: number;
    scale: number;
    opacity: number;
} {
    const normT = ((phase % 1) + 1) % 1;
    // Envelope from keyframes: 0% floor, 55% peak 1, 85% floor+0.35*(1-floor), 100% floor
    let opacity = 0;
    let x = 0;
    let y = 0;
    let scale = 0;

    if (normT <= 0.55) {
        const p = normT / 0.55;
        opacity = p;
        x = -p;
        y = p;
        scale = p;
    } else if (normT <= 0.85) {
        const p = (normT - 0.55) / 0.30;
        opacity = 1 - p * 0.65;
        x = -1 + p * 2.0;
        y = 1 - p * 1.5;
        scale = 1 - p;
    } else {
        const p = (normT - 0.85) / 0.15;
        opacity = 0.35 * (1 - p);
        x = 1 - p;
        y = -0.5 * (1 - p);
        scale = 0;
    }

    return { x, y, scale, opacity };
}

/**
 * Generates N deterministic keyframes for a continuous profile.
 */
export function generateTemporalKeyframes(
    sampleCount: number,
    sampler: (phase: number) => Partial<WallpaperTemporalKeyframe>,
): readonly WallpaperTemporalKeyframe[] {
    const frames: WallpaperTemporalKeyframe[] = [];
    for (let i = 0; i <= sampleCount; i++) {
        const offset = Number((i / sampleCount).toFixed(6));
        const sample = sampler(i / sampleCount);
        frames.push(Object.freeze({
            offset,
            ...sample,
        }));
    }
    return Object.freeze(frames);
}

/**
 * Canonical compiled motion profiles.
 */
export const WALLPAPER_MOTION_PROFILES: WallpaperMotionProfiles = Object.freeze(
    {
        drift: Object.freeze({
            durationSeconds: WALLPAPER_MOTION_TIMING.drift.duration,
            delaySeconds: 0,
            iterations: Infinity,
            keyframes: generateTemporalKeyframes(
                WALLPAPER_TEMPORAL_BUDGET.driftKeyframeSamples,
                (phase) => {
                    const pt = sampleAnalyticDrift(phase);
                    return {
                        x: Number(pt.x.toFixed(5)),
                        y: Number(pt.y.toFixed(5)),
                    };
                },
            ),
        }),

        zoom: Object.freeze({
            durationSeconds: WALLPAPER_MOTION_TIMING.zoom.duration,
            delaySeconds: 0,
            iterations: Infinity,
            keyframes: generateTemporalKeyframes(
                WALLPAPER_TEMPORAL_BUDGET.zoomKeyframeSamples,
                (phase) => {
                    const s = sampleAnalyticZoom(phase);
                    return { scale: Number(s.toFixed(5)) };
                },
            ),
        }),

        ambientA: Object.freeze({
            durationSeconds: WALLPAPER_MOTION_TIMING.ambient.durationA,
            delaySeconds: 0,
            iterations: Infinity,
            keyframes: generateTemporalKeyframes(
                WALLPAPER_TEMPORAL_BUDGET.ambientKeyframeSamples,
                (phase) => {
                    const s = sampleAmbientFieldA(phase);
                    return {
                        x: Number(s.x.toFixed(5)),
                        y: Number(s.y.toFixed(5)),
                        scale: Number(s.scale.toFixed(5)),
                        opacity: Number(s.opacity.toFixed(5)),
                    };
                },
            ),
        }),

        ambientB: Object.freeze({
            durationSeconds: WALLPAPER_MOTION_TIMING.ambient.durationB,
            delaySeconds: -WALLPAPER_MOTION_TIMING.ambient.phaseOffset,
            iterations: Infinity,
            keyframes: generateTemporalKeyframes(
                WALLPAPER_TEMPORAL_BUDGET.ambientKeyframeSamples,
                (phase) => {
                    const s = sampleAmbientFieldB(phase);
                    return {
                        x: Number(s.x.toFixed(5)),
                        y: Number(s.y.toFixed(5)),
                        scale: Number(s.scale.toFixed(5)),
                        opacity: Number(s.opacity.toFixed(5)),
                    };
                },
            ),
        }),
    },
);

/* --------------------------------------------------------------------------
   Normalized Channel Resolvers (Spec Hardening v3 Section 3)
   -------------------------------------------------------------------------- */

export function resolveNormalizedDrift(
    frame: WallpaperTemporalKeyframe,
    stage: WallpaperDriftStageParams,
): { translateXPercent: number; translateYPercent: number } {
    return {
        translateXPercent: (frame.x ?? 0) * stage.x,
        translateYPercent: (frame.y ?? 0) * stage.y,
    };
}

export function resolveNormalizedZoom(
    frame: WallpaperTemporalKeyframe,
    stage: WallpaperZoomStageParams,
): { scale: number } {
    const zoomDelta = stage.scale - 1;
    return {
        scale: 1 + (frame.scale ?? 0) * zoomDelta,
    };
}

export function resolveNormalizedAmbientTransform(
    frame: WallpaperTemporalKeyframe,
    stage: WallpaperAmbientStageParams,
): { translateXcqmax: number; translateYcqmax: number; scale: number } {
    return {
        translateXcqmax: (frame.x ?? 0) * stage.travel,
        translateYcqmax: (frame.y ?? 0) * stage.travel,
        scale: 1 + (frame.scale ?? 0) * (stage.scale - 1),
    };
}

export function resolveNormalizedAmbientOpacity(
    frame: WallpaperTemporalKeyframe,
    stage: WallpaperAmbientStageParams,
): number {
    return stage.opacityFloor + (frame.opacity ?? 0) * (1 - stage.opacityFloor);
}

/* --------------------------------------------------------------------------
   Wall-clock Ambient Recurrence Analysis (Spec Hardening v3 Section 14)
   -------------------------------------------------------------------------- */

export interface AmbientRecurrenceWindow {
    timeSeconds: number;
    phaseA: number;
    phaseB: number;
    opacityA: number;
    opacityB: number;
    overlapSeverity: number;
}

export function analyzeAmbientRecurrence(
    durationA = 28,
    durationB = 37,
    phaseOffset = 7,
    stepSeconds = 0.25,
): {
    horizonSeconds: number;
    worstOverlapWindows: AmbientRecurrenceWindow[];
} {
    // GCD & LCM
    function gcd(a: number, b: number): number {
        return b === 0 ? a : gcd(b, a % b);
    }
    const horizonSeconds = (durationA * durationB) / gcd(durationA, durationB);

    const windows: AmbientRecurrenceWindow[] = [];
    for (let t = 0; t <= horizonSeconds; t += stepSeconds) {
        const phaseA = ((t % durationA) + durationA) % durationA / durationA;
        const phaseB =
            (((t - phaseOffset) % durationB) + durationB) % durationB /
            durationB;

        const sampA = sampleAmbientFieldA(phaseA);
        const sampB = sampleAmbientFieldB(phaseB);

        const overlapSeverity = sampA.opacity * sampB.opacity;
        windows.push({
            timeSeconds: t,
            phaseA,
            phaseB,
            opacityA: sampA.opacity,
            opacityB: sampB.opacity,
            overlapSeverity,
        });
    }

    // Sort to find top unique worst-case overlap windows separated by at least 10 seconds
    const sorted = [...windows].sort((a, b) =>
        b.overlapSeverity - a.overlapSeverity
    );
    const topUnique: AmbientRecurrenceWindow[] = [];
    for (const w of sorted) {
        if (
            !topUnique.some((u) => Math.abs(u.timeSeconds - w.timeSeconds) < 10)
        ) {
            topUnique.push(w);
            if (
                topUnique.length >=
                    WALLPAPER_TEMPORAL_BUDGET.ambientWorstCaseAnalysisWindows
            ) {
                break;
            }
        }
    }

    return {
        horizonSeconds,
        worstOverlapWindows: topUnique,
    };
}
