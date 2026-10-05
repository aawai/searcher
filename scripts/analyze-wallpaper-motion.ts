/**
 * Wallpaper Motion Quality & Temporal Trajectory Analyzer
 * Generates baseline and calibrated metrics and visual plots in artifacts/wallpaper-motion/
 */

import { join } from "node:path";
import {
    sampleAnalyticDrift,
    sampleAnalyticZoom,
    WALLPAPER_MOTION_PROFILES,
} from "../src/shared/wallpaper-temporal.ts";

export interface MotionSamplePoint {
    phase: number;
    timeSeconds: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    speed: number;
    headingDeg: number;
    curvatureProxy: number;
}

export interface ZoomSamplePoint {
    phase: number;
    timeSeconds: number;
    scale: number;
    velocity: number;
    accelerationProxy: number;
}

export interface DriftAnalysisResult {
    samples: MotionSamplePoint[];
    maxSpeed: number;
    minSpeed: number;
    medianSpeed: number;
    maxMedianSpeedRatio: number;
    maxAdjacentHeadingDeltaDeg: number;
    positionSeamDelta: number;
    velocitySeamDelta: number;
    headingSeamDeltaDeg: number;
}

export interface ZoomAnalysisResult {
    samples: ZoomSamplePoint[];
    maxVelocity: number;
    minVelocity: number;
    peakAdjacentVelocity: number;
    peakAdjacentVelocityRatio: number;
    scaleSeamDelta: number;
    velocitySeamDelta: number;
    maxAccelerationProxy: number;
}

export function sampleBaselineDrift(
    sampleCount = 64,
    durationSeconds = 46,
    xAmplitude = 1.6,
    yAmplitude = 1.05,
): DriftAnalysisResult {
    const keyframes = [
        { t: 0.0, x: -xAmplitude, y: yAmplitude },
        { t: 0.33, x: xAmplitude, y: 0.0 },
        { t: 0.66, x: 0.0, y: -yAmplitude },
        { t: 1.0, x: -xAmplitude, y: yAmplitude },
    ];

    function interp(t: number): { x: number; y: number } {
        const normT = ((t % 1) + 1) % 1;
        for (let i = 0; i < keyframes.length - 1; i++) {
            const k1 = keyframes[i];
            const k2 = keyframes[i + 1];
            if (normT >= k1.t && normT <= k2.t) {
                const fraction = (normT - k1.t) / (k2.t - k1.t);
                return {
                    x: k1.x + fraction * (k2.x - k1.x),
                    y: k1.y + fraction * (k2.y - k1.y),
                };
            }
        }
        return { x: keyframes[0].x, y: keyframes[0].y };
    }

    return analyzeDriftPoints(interp, sampleCount, durationSeconds);
}

export function sampleCalibratedDrift(
    sampleCount = 64,
    durationSeconds = 46,
    xAmplitude = 1.6,
    yAmplitude = 1.05,
): DriftAnalysisResult {
    function interp(t: number): { x: number; y: number } {
        const pt = sampleAnalyticDrift(t);
        return {
            x: pt.x * xAmplitude,
            y: pt.y * yAmplitude,
        };
    }

    return analyzeDriftPoints(interp, sampleCount, durationSeconds);
}

function analyzeDriftPoints(
    interp: (t: number) => { x: number; y: number },
    sampleCount: number,
    durationSeconds: number,
): DriftAnalysisResult {
    const samples: MotionSamplePoint[] = [];
    const eps = 1e-4;

    for (let i = 0; i < sampleCount; i++) {
        const phase = i / sampleCount;
        const timeSeconds = phase * durationSeconds;
        const pos = interp(phase);

        const posNext = interp(phase + eps);
        const posPrev = interp(phase - eps);
        const vx = (posNext.x - posPrev.x) / (2 * eps * durationSeconds);
        const vy = (posNext.y - posPrev.y) / (2 * eps * durationSeconds);
        const speed = Math.hypot(vx, vy);
        const headingDeg = (Math.atan2(vy, vx) * 180) / Math.PI;

        samples.push({
            phase,
            timeSeconds,
            x: pos.x,
            y: pos.y,
            vx,
            vy,
            speed,
            headingDeg,
            curvatureProxy: 0,
        });
    }

    const speeds = samples.map((s) => s.speed).sort((a, b) => a - b);
    const medianSpeed = speeds[Math.floor(speeds.length / 2)];
    const maxSpeed = speeds[speeds.length - 1];
    const minSpeed = speeds[0];
    const maxMedianSpeedRatio = medianSpeed > 0 ? maxSpeed / medianSpeed : 0;

    let maxAdjacentHeadingDeltaDeg = 0;
    for (let i = 0; i < sampleCount; i++) {
        const next = samples[(i + 1) % sampleCount];
        let diff = Math.abs(next.headingDeg - samples[i].headingDeg);
        if (diff > 180) diff = 360 - diff;
        if (diff > maxAdjacentHeadingDeltaDeg) {
            maxAdjacentHeadingDeltaDeg = diff;
        }
    }

    const p0 = interp(0);
    const p1 = interp(1 - 1e-6);
    const positionSeamDelta = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const v0 = samples[0];
    const vEnd = samples[samples.length - 1];
    const velocitySeamDelta = Math.hypot(vEnd.vx - v0.vx, vEnd.vy - v0.vy);
    let headingSeamDeltaDeg = Math.abs(vEnd.headingDeg - v0.headingDeg);
    if (headingSeamDeltaDeg > 180) {
        headingSeamDeltaDeg = 360 - headingSeamDeltaDeg;
    }

    return {
        samples,
        maxSpeed,
        minSpeed,
        medianSpeed,
        maxMedianSpeedRatio,
        maxAdjacentHeadingDeltaDeg,
        positionSeamDelta,
        velocitySeamDelta,
        headingSeamDeltaDeg,
    };
}

export function sampleBaselineZoom(
    sampleCount = 64,
    durationSeconds = 44,
    peakScale = 1.06,
): ZoomAnalysisResult {
    function interpScale(t: number): number {
        const normT = ((t % 1) + 1) % 1;
        if (normT <= 0.5) {
            return 1 + (normT / 0.5) * (peakScale - 1);
        }
        return peakScale - ((normT - 0.5) / 0.5) * (peakScale - 1);
    }
    return analyzeZoomPoints(interpScale, sampleCount, durationSeconds);
}

export function sampleCalibratedZoom(
    sampleCount = 64,
    durationSeconds = 44,
    peakScale = 1.06,
): ZoomAnalysisResult {
    function interpScale(t: number): number {
        return 1 + sampleAnalyticZoom(t) * (peakScale - 1);
    }
    return analyzeZoomPoints(interpScale, sampleCount, durationSeconds);
}

function analyzeZoomPoints(
    interpScale: (t: number) => number,
    sampleCount: number,
    durationSeconds: number,
): ZoomAnalysisResult {
    const samples: ZoomSamplePoint[] = [];
    const eps = 1e-4;

    for (let i = 0; i < sampleCount; i++) {
        const phase = i / sampleCount;
        const timeSeconds = phase * durationSeconds;
        const scale = interpScale(phase);
        const scaleNext = interpScale(phase + eps);
        const scalePrev = interpScale(phase - eps);
        const velocity = (scaleNext - scalePrev) / (2 * eps * durationSeconds);

        const vNext = (interpScale(phase + 2 * eps) - interpScale(phase)) /
            (2 * eps * durationSeconds);
        const vPrev = (interpScale(phase) - interpScale(phase - 2 * eps)) /
            (2 * eps * durationSeconds);
        const accelerationProxy = (vNext - vPrev) / (2 * eps * durationSeconds);

        samples.push({
            phase,
            timeSeconds,
            scale,
            velocity,
            accelerationProxy,
        });
    }

    const velocities = samples.map((s) => Math.abs(s.velocity)).sort((a, b) =>
        a - b
    );
    const maxVelocity = velocities[velocities.length - 1];
    const minVelocity = velocities[0];

    const peakIndex = Math.floor(sampleCount * 0.5);
    const beforePeak = samples[(peakIndex - 1 + sampleCount) % sampleCount];
    const afterPeak = samples[(peakIndex + 1) % sampleCount];
    const peakAdjacentVelocity = Math.max(
        Math.abs(beforePeak.velocity),
        Math.abs(afterPeak.velocity),
    );
    const peakAdjacentVelocityRatio = maxVelocity > 0
        ? peakAdjacentVelocity / maxVelocity
        : 0;

    const s0 = interpScale(0);
    const sEnd = interpScale(1 - 1e-6);
    const scaleSeamDelta = Math.abs(sEnd - s0);
    const velocitySeamDelta = Math.abs(
        samples[samples.length - 1].velocity - samples[0].velocity,
    );
    const maxAccelerationProxy = Math.max(
        ...samples.map((s) => Math.abs(s.accelerationProxy)),
    );

    return {
        samples,
        maxVelocity,
        minVelocity,
        peakAdjacentVelocity,
        peakAdjacentVelocityRatio,
        scaleSeamDelta,
        velocitySeamDelta,
        maxAccelerationProxy,
    };
}

export function generateDriftTrajectorySvg(
    samples: MotionSamplePoint[],
    title = "Drift Trajectory",
): string {
    const width = 600;
    const height = 450;
    const padding = 50;
    const plotWidth = width - 2 * padding;
    const plotHeight = height - 2 * padding;

    const xs = samples.map((s) => s.x);
    const ys = samples.map((s) => s.y);
    const minX = Math.min(-2, ...xs);
    const maxX = Math.max(2, ...xs);
    const minY = Math.min(-1.5, ...ys);
    const maxY = Math.max(1.5, ...ys);

    function mapX(x: number): number {
        return padding + ((x - minX) / (maxX - minX)) * plotWidth;
    }
    function mapY(y: number): number {
        return height - padding - ((y - minY) / (maxY - minY)) * plotHeight;
    }

    const pointsStr = samples.map((s) =>
        `${mapX(s.x).toFixed(1)},${mapY(s.y).toFixed(1)}`
    ).join(" ");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#0f172a"/>
  <text x="${
        width / 2
    }" y="30" text-anchor="middle" fill="#f8fafc" font-size="16" font-family="system-ui">${title}</text>
  <line x1="${mapX(0)}" y1="${padding}" x2="${mapX(0)}" y2="${
        height - padding
    }" stroke="#334155" stroke-dasharray="4"/>
  <line x1="${padding}" y1="${mapY(0)}" x2="${width - padding}" y2="${
        mapY(0)
    }" stroke="#334155" stroke-dasharray="4"/>
  <polygon points="${pointsStr}" fill="none" stroke="#38bdf8" stroke-width="2.5"/>
  ${
        samples.map((s, i) =>
            i % 4 === 0
                ? `<circle cx="${mapX(s.x).toFixed(1)}" cy="${
                    mapY(s.y).toFixed(1)
                }" r="3" fill="#f43f5e"/>`
                : ""
        ).join("")
    }
</svg>`;
}

export function generateDriftSpeedSvg(
    samples: MotionSamplePoint[],
    title = "Drift Speed Profile",
): string {
    const width = 600;
    const height = 300;
    const padding = 45;
    const plotWidth = width - 2 * padding;
    const plotHeight = height - 2 * padding;

    const speeds = samples.map((s) => s.speed);
    const maxSpeed = Math.max(0.1, ...speeds) * 1.15;

    function mapX(i: number): number {
        return padding + (i / (samples.length - 1)) * plotWidth;
    }
    function mapY(val: number): number {
        return height - padding - (val / maxSpeed) * plotHeight;
    }

    const pathData = samples
        .map((s, i) =>
            `${i === 0 ? "M" : "L"} ${mapX(i).toFixed(1)} ${
                mapY(s.speed).toFixed(1)
            }`
        )
        .join(" ");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#0f172a"/>
  <text x="${
        width / 2
    }" y="25" text-anchor="middle" fill="#f8fafc" font-size="14" font-family="system-ui">${title}</text>
  <path d="${pathData}" fill="none" stroke="#10b981" stroke-width="2"/>
</svg>`;
}

export function generateZoomScaleSvg(
    samples: ZoomSamplePoint[],
    title = "Zoom Scale Curve",
): string {
    const width = 600;
    const height = 300;
    const padding = 45;
    const plotWidth = width - 2 * padding;
    const plotHeight = height - 2 * padding;

    const scales = samples.map((s) => s.scale);
    const minScale = Math.min(1.0, ...scales);
    const maxScale = Math.max(1.06, ...scales) * 1.005;

    function mapX(i: number): number {
        return padding + (i / (samples.length - 1)) * plotWidth;
    }
    function mapY(val: number): number {
        return height - padding -
            ((val - minScale) / (maxScale - minScale)) * plotHeight;
    }

    const pathData = samples
        .map((s, i) =>
            `${i === 0 ? "M" : "L"} ${mapX(i).toFixed(1)} ${
                mapY(s.scale).toFixed(1)
            }`
        )
        .join(" ");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#0f172a"/>
  <text x="${
        width / 2
    }" y="25" text-anchor="middle" fill="#f8fafc" font-size="14" font-family="system-ui">${title}</text>
  <path d="${pathData}" fill="none" stroke="#a855f7" stroke-width="2"/>
</svg>`;
}

export function generateZoomVelocitySvg(
    samples: ZoomSamplePoint[],
    title = "Zoom Velocity Profile",
): string {
    const width = 600;
    const height = 300;
    const padding = 45;
    const plotWidth = width - 2 * padding;
    const plotHeight = height - 2 * padding;

    const velocities = samples.map((s) => s.velocity);
    const maxAbsV = Math.max(0.001, ...velocities.map((v) => Math.abs(v))) *
        1.2;

    function mapX(i: number): number {
        return padding + (i / (samples.length - 1)) * plotWidth;
    }
    function mapY(val: number): number {
        return height - padding -
            ((val + maxAbsV) / (2 * maxAbsV)) * plotHeight;
    }

    const pathData = samples
        .map((s, i) =>
            `${i === 0 ? "M" : "L"} ${mapX(i).toFixed(1)} ${
                mapY(s.velocity).toFixed(1)
            }`
        )
        .join(" ");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#0f172a"/>
  <text x="${
        width / 2
    }" y="25" text-anchor="middle" fill="#f8fafc" font-size="14" font-family="system-ui">${title}</text>
  <line x1="${padding}" y1="${mapY(0)}" x2="${width - padding}" y2="${
        mapY(0)
    }" stroke="#475569" stroke-dasharray="4"/>
  <path d="${pathData}" fill="none" stroke="#f59e0b" stroke-width="2"/>
</svg>`;
}

// Execute analysis when run directly
if (import.meta.main) {
    const outDir = join(Deno.cwd(), "artifacts/wallpaper-motion");
    await Deno.mkdir(outDir, { recursive: true });

    const baselineDrift = sampleBaselineDrift();
    const calibratedDrift = sampleCalibratedDrift();
    const baselineZoom = sampleBaselineZoom();
    const calibratedZoom = sampleCalibratedZoom();

    const metrics = {
        timestamp: new Date().toISOString(),
        version: "phase-0c-v2-calibrated",
        calibrated: {
            drift: {
                durationSeconds:
                    WALLPAPER_MOTION_PROFILES.drift.durationSeconds,
                samplesCount: calibratedDrift.samples.length,
                maxSpeed: calibratedDrift.maxSpeed,
                minSpeed: calibratedDrift.minSpeed,
                medianSpeed: calibratedDrift.medianSpeed,
                maxMedianSpeedRatio: calibratedDrift.maxMedianSpeedRatio,
                maxAdjacentHeadingDeltaDeg:
                    calibratedDrift.maxAdjacentHeadingDeltaDeg,
                positionSeamDelta: calibratedDrift.positionSeamDelta,
                velocitySeamDelta: calibratedDrift.velocitySeamDelta,
                headingSeamDeltaDeg: calibratedDrift.headingSeamDeltaDeg,
            },
            zoom: {
                durationSeconds: WALLPAPER_MOTION_PROFILES.zoom.durationSeconds,
                samplesCount: calibratedZoom.samples.length,
                maxVelocity: calibratedZoom.maxVelocity,
                minVelocity: calibratedZoom.minVelocity,
                peakAdjacentVelocity: calibratedZoom.peakAdjacentVelocity,
                peakAdjacentVelocityRatio:
                    calibratedZoom.peakAdjacentVelocityRatio,
                scaleSeamDelta: calibratedZoom.scaleSeamDelta,
                velocitySeamDelta: calibratedZoom.velocitySeamDelta,
                maxAccelerationProxy: calibratedZoom.maxAccelerationProxy,
            },
        },
        baseline115: {
            drift: {
                maxSpeed: baselineDrift.maxSpeed,
                medianSpeed: baselineDrift.medianSpeed,
                maxAdjacentHeadingDeltaDeg:
                    baselineDrift.maxAdjacentHeadingDeltaDeg,
                velocitySeamDelta: baselineDrift.velocitySeamDelta,
            },
            zoom: {
                maxVelocity: baselineZoom.maxVelocity,
                peakAdjacentVelocityRatio:
                    baselineZoom.peakAdjacentVelocityRatio,
            },
        },
    };

    await Deno.writeTextFile(
        join(outDir, "motion-metrics.json"),
        JSON.stringify(metrics, null, 2),
    );
    await Deno.writeTextFile(
        join(outDir, "drift-trajectory.svg"),
        generateDriftTrajectorySvg(
            calibratedDrift.samples,
            "Phase 0C Calibrated Drift Trajectory",
        ),
    );
    await Deno.writeTextFile(
        join(outDir, "drift-speed.svg"),
        generateDriftSpeedSvg(
            calibratedDrift.samples,
            "Phase 0C Calibrated Drift Speed Profile",
        ),
    );
    await Deno.writeTextFile(
        join(outDir, "zoom-scale.svg"),
        generateZoomScaleSvg(
            calibratedZoom.samples,
            "Phase 0C Calibrated Zoom Scale Curve",
        ),
    );
    await Deno.writeTextFile(
        join(outDir, "zoom-velocity.svg"),
        generateZoomVelocitySvg(
            calibratedZoom.samples,
            "Phase 0C Calibrated Zoom Velocity Profile",
        ),
    );

    console.log(`Saved calibrated evidence to ${outDir}`);
}
