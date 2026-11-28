import { resolveBotanicalSpecies } from "../solar-terms.ts";
import type {
    BotanicalArchetype,
    BotanicalRuntimeState,
    BotanicalScene,
    BotanicalViewportMetrics,
    BranchData,
    BranchParentRef,
    BranchSample,
    ConcreteBotanicalSpecies,
    Drifter,
    Point2D,
    WorldSample,
} from "./types.ts";

export { resolveBotanicalSpecies };

const GUST_ENV_NORM_PEAK = Math.pow(0.27, 0.72) * Math.pow(0.73, 1.95);

export function createBotanicalRuntimeState(): BotanicalRuntimeState {
    return {
        breezeImpulseStartSec: -999,
        breezeImpulseStrength: 0,
        awakened: false,
        awakenStartSec: -999,
        haloPulseStartSec: -999,
        visitorMode: "perched",
        visitorStateStartSec: -999,
        visitorX: 0,
        visitorY: 0,
        visitorVx: 0,
        visitorVy: 0,
        dewState: "hanging",
        dewStateStartSec: -999,
        dewFallDist: 0,
        dewImpactX: 0,
        dewImpactY: 0,
        fireflyBoostStartSec: -999,
        gustStartSec: -999,
        gustDurationSec: 4.8,
        gustStrength: 0,
        gustCount: 0,
        nextGustSec: -999,
        lastInteractionSec: -999,
        windPos: 0,
        windVel: 0,
        fireflySimSec: 0,
    };
}

export function evalGustEnvelope(
    runtime: BotanicalRuntimeState | undefined,
    timeSec: number,
    windCalm: number,
    reducedMotion = false,
): number {
    if (!runtime || reducedMotion || runtime.gustDurationSec <= 0) return 0;
    if (
        timeSec < runtime.gustStartSec ||
        timeSec > runtime.gustStartSec + runtime.gustDurationSec
    ) {
        return 0;
    }
    const u = clamp(
        (timeSec - runtime.gustStartSec) /
            Math.max(0.1, runtime.gustDurationSec),
        0,
        1,
    );
    const raw = Math.pow(u, 0.72) * Math.pow(1 - u, 1.95);
    return Math.min(1, raw / GUST_ENV_NORM_PEAK) * runtime.gustStrength *
        windCalm;
}

export function stepBotanicalWindSpring(
    runtime: BotanicalRuntimeState,
    dt: number,
    reducedMotion: boolean,
): number {
    if (reducedMotion) {
        runtime.windPos = 0;
        runtime.windVel = 0;
        return 0;
    }
    const current = runtime.windPos;
    if (
        Math.abs(runtime.windPos) > 1e-4 || Math.abs(runtime.windVel) > 1e-4
    ) {
        const stiffness = 13.0;
        const damping = 3.0;
        const accel = -stiffness * runtime.windPos -
            damping * runtime.windVel;
        runtime.windVel = clamp(runtime.windVel + accel * dt, -6.5, 6.5);
        runtime.windPos = clamp(
            runtime.windPos + runtime.windVel * dt,
            -1.6,
            1.6,
        );
        if (
            Math.abs(runtime.windPos) < 0.0015 &&
            Math.abs(runtime.windVel) < 0.0015
        ) {
            runtime.windPos = 0;
            runtime.windVel = 0;
        }
    }
    return current;
}

export function getVisitorReturnShowSec(
    scene?: BotanicalScene | null,
): number {
    return scene?.visitorAnchor?.kind === "ladybug" ? 14.5 : 16.5;
}

export function triggerBotanicalGust(
    runtime: BotanicalRuntimeState,
    timeSec: number,
    strength?: number,
    durationSec?: number,
): void {
    runtime.gustCount += 1;
    const g = runtime.gustCount;
    const sJitter = 0.5 + 0.5 * Math.sin(g * 2.399963);
    const dJitter = (g * 0.6180339) % 1;
    const iJitter = (g * 1.3247179) % 1;
    const resolvedStrength = strength ?? (0.58 + sJitter * 0.44);
    const resolvedDuration = durationSec ?? (3.8 + dJitter * 1.9);
    const quietSec = 11.0 + iJitter * 12.5;
    runtime.gustStartSec = timeSec;
    runtime.gustDurationSec = resolvedDuration;
    runtime.gustStrength = resolvedStrength;
    runtime.nextGustSec = timeSec + resolvedDuration + quietSec;
}

export function isBotanicalSceneActive(params: {
    runtime?: BotanicalRuntimeState;
    rawProgress: number;
    timeSec: number;
    scene: BotanicalScene | null;
    drifters: readonly Drifter[];
    reducedMotion: boolean;
    embedded: boolean;
}): boolean {
    const {
        runtime,
        rawProgress,
        timeSec,
        scene,
        drifters,
        reducedMotion,
        embedded,
    } = params;
    if (embedded || reducedMotion) return false;
    if (rawProgress < 1) return true;
    if (drifters.length > 0) return true;
    if (
        scene &&
        scene.ornaments.some((o) =>
            Math.abs(o.push) > 0.0025 || Math.abs(o.vel) > 0.0025
        )
    ) {
        return true;
    }
    if (
        scene &&
        scene.branches.some((b) =>
            Math.abs(b.tipPush ?? 0) > 0.0025 ||
            Math.abs(b.tipVel ?? 0) > 0.0025
        )
    ) {
        return true;
    }
    if (!runtime) return false;
    if (
        Math.abs(runtime.windPos) > 0.002 || Math.abs(runtime.windVel) > 0.002
    ) {
        return true;
    }
    if (
        runtime.gustDurationSec > 0 &&
        timeSec >= runtime.gustStartSec &&
        timeSec <= runtime.gustStartSec + runtime.gustDurationSec
    ) {
        return true;
    }
    if (
        runtime.breezeImpulseStrength > 0 &&
        timeSec >= runtime.breezeImpulseStartSec &&
        timeSec <= runtime.breezeImpulseStartSec + 2.6
    ) {
        return true;
    }
    if (
        runtime.awakened &&
        timeSec >= runtime.awakenStartSec &&
        timeSec <= runtime.awakenStartSec + 1.9
    ) {
        return true;
    }
    if (
        timeSec >= runtime.haloPulseStartSec &&
        timeSec <= runtime.haloPulseStartSec + 1.45
    ) {
        return true;
    }
    if (
        timeSec >= runtime.fireflyBoostStartSec &&
        timeSec <= runtime.fireflyBoostStartSec + 1.85
    ) {
        return true;
    }
    if (
        timeSec >= runtime.lastInteractionSec &&
        timeSec <= runtime.lastInteractionSec + 2.2
    ) {
        return true;
    }
    if (runtime.visitorMode === "departing") return true;
    if (runtime.visitorMode === "returning") {
        const showAt = getVisitorReturnShowSec(scene);
        if (timeSec - runtime.visitorStateStartSec >= showAt) {
            return true;
        }
    }
    if (runtime.dewState !== "hanging") return true;
    return false;
}

export function nextBotanicalWakeDelayMs(
    runtime: BotanicalRuntimeState | undefined,
    timeSec: number,
    scene?: BotanicalScene | null,
): number {
    if (!runtime) return 14_000;
    const candidates: number[] = [];
    if (runtime.nextGustSec > timeSec) {
        candidates.push((runtime.nextGustSec - timeSec) * 1000);
    }
    if (runtime.visitorMode === "returning") {
        const wakeAt = runtime.visitorStateStartSec +
            getVisitorReturnShowSec(scene);
        if (wakeAt > timeSec) {
            candidates.push((wakeAt - timeSec) * 1000);
        }
    }
    if (runtime.dewState === "hanging" && runtime.dewStateStartSec > -100) {
        const dewDropAt = runtime.dewStateStartSec + 26.1;
        if (dewDropAt > timeSec) {
            candidates.push((dewDropAt - timeSec) * 1000);
        }
    }
    if (candidates.length === 0) return 12_000;
    return Math.round(clamp(Math.min(...candidates), 250, 24_000));
}

export const BOTANICAL_ARCHETYPE_NAMES: Readonly<
    Record<ConcreteBotanicalSpecies, readonly [string, string, string]>
> = {
    plum: ["横斜疏影", "昂霄双干", "临水倒挂"],
    ginkgo: ["斜柯金扇", "高枝垂荫", "交枝掩映"],
    maple: ["高崖横柯", "霜林双枝", "飞崖探秋"],
    eucalyptus: ["丛枝清露", "修枝独秀", "双株交映"],
    fern: ["兰竹三叠", "坡石双清", "临涧舒卷"],
};

export function resolveBotanicalArchetype(
    species: ConcreteBotanicalSpecies,
    dateKey: string,
    override?: BotanicalArchetype,
): BotanicalArchetype {
    if (override === 0 || override === 1 || override === 2) return override;
    return (hashString(`${dateKey}:${species}:archetype`) %
        3) as BotanicalArchetype;
}

/**
 * Resolves the virtual coordinate space for botanical scene generation.
 * Embedded previews render a full desktop-proportioned scene (1440px wide)
 * scaled down to fit the preview container without cropping or distortion.
 */
export function resolveBotanicalViewport(
    width: number,
    height: number,
    embedded: boolean,
): BotanicalViewportMetrics {
    if (!embedded || width <= 0 || height <= 0) {
        return { sceneWidth: width, sceneHeight: height, renderScale: 1 };
    }
    const sceneWidth = 1440;
    const sceneHeight = Math.max(1, Math.round(sceneWidth * (height / width)));
    return {
        sceneWidth,
        sceneHeight,
        renderScale: width / sceneWidth,
    };
}

export function hashString(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

export function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

export function easeOutQuart(t: number): number {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 4);
}

export function cubicPoint(
    p0: Point2D,
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    t: number,
): Point2D {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    return {
        x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x +
            tt * t * p3.x,
        y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y +
            tt * t * p3.y,
    };
}

export function cubicTangent(
    p0: Point2D,
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    t: number,
): number {
    const u = 1 - t;
    const dx = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) +
        3 * t * t * (p3.x - p2.x);
    const dy = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) +
        3 * t * t * (p3.y - p2.y);
    return Math.atan2(dy, dx);
}

export interface SampleBranchOpts {
    steps?: number;
    widthStart: number;
    widthEnd: number;
    t0: number;
    t1: number;
    flexSpan?: number;
    phase?: number;
    waveLag?: number;
    ghost?: boolean;
    midground?: boolean;
    brushStyle?: "standard" | "iron-plum";
    twistU?: number;
    snowCushions?: boolean;
    wobble?: number;
    parentRef?: BranchParentRef | null;
}

export function sampleBranch(
    p0: Point2D,
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    opts: SampleBranchOpts,
    rng: () => number,
): BranchData {
    const steps = opts.steps ?? 36;
    const points: BranchSample[] = [];
    const wobble = opts.wobble ?? 0;
    const phaseW = rng() * 6.28;
    for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const pt = cubicPoint(p0, p1, p2, p3, u);
        const ang = cubicTangent(p0, p1, p2, p3, u);
        const env = Math.sin(u * Math.PI);
        const ironKick = opts.brushStyle === "iron-plum"
            ? Math.sin(u * Math.PI * 3.6 + phaseW * 0.7) * 1.45 * env
            : 0;
        const off = wobble
            ? Math.sin(u * Math.PI * 2.8 + phaseW) * wobble * env + ironKick
            : ironKick;
        const rx = pt.x - Math.sin(ang) * off;
        const ry = pt.y + Math.cos(ang) * off;
        points.push({
            x: rx,
            y: ry,
            lx: rx - p0.x,
            ly: ry - p0.y,
            angle: ang,
            u,
            localFlex: Math.pow(u, 1.55) * (opts.flexSpan ?? 1.0),
        });
    }
    return {
        points,
        widthStart: opts.widthStart,
        widthEnd: opts.widthEnd,
        t0: opts.t0,
        t1: opts.t1,
        phase: opts.phase ?? 0,
        waveLag: opts.waveLag,
        ghost: Boolean(opts.ghost),
        midground: Boolean(opts.midground),
        brushStyle: opts.brushStyle ?? "standard",
        twistU: opts.twistU,
        snowCushions: opts.snowCushions,
        parentRef: opts.parentRef ?? null,
        frameId: -1,
        worldCache: null,
    };
}

export function mirrorSceneGeometryToLeft(
    scene: BotanicalScene,
    width: number,
): void {
    scene.side = "left";
    for (const b of scene.branches) {
        for (const pt of b.points) {
            pt.x = width - pt.x;
            pt.lx = -pt.lx;
            const rawA = Math.PI - pt.angle;
            pt.angle = Math.atan2(Math.sin(rawA), Math.cos(rawA));
        }
        b.frameId = -1;
        b.worldCache = null;
    }
    for (const r of scene.rocks) {
        for (const pt of r.points) {
            pt.x = width - pt.x;
        }
        for (const m of r.mossDots) {
            m.x = width - m.x;
            m.rot = -m.rot;
        }
    }
    for (const o of scene.ornaments) {
        o.angleOffset = -o.angleOffset;
        if (o.kind === "fernPinna") {
            o.side = o.side === 1 ? -1 : 1;
            o.curve = -o.curve;
            o.whip = -o.whip;
        } else if (
            o.kind === "plumBlossom" || o.kind === "plumBud" ||
            o.kind === "mapleLeaf"
        ) {
            o.rotation = -o.rotation;
        }
    }
    if (scene.visitorAnchor) {
        for (const ff of scene.visitorAnchor.fireflies) {
            (ff as { x: number }).x = width - ff.x;
        }
        if (scene.visitorAnchor.kind === "ladybug") {
            (scene.visitorAnchor as { angleOffset: number }).angleOffset =
                -scene.visitorAnchor.angleOffset;
        } else if (scene.visitorAnchor.kind === "dew-or-firefly") {
            (scene.visitorAnchor as { tipOffsetX: number }).tipOffsetX = -scene
                .visitorAnchor.tipOffsetX;
        }
    }
    if (scene.bounds) {
        scene.bounds = {
            minX: width - scene.bounds.maxX,
            minY: scene.bounds.minY,
            maxX: width - scene.bounds.minX,
            maxY: scene.bounds.maxY,
        };
    }
}

export function applyWorkspaceClearance(
    branches: BranchData[],
    w: number,
    h: number,
    scale: number,
): void {
    const searchCx = w * 0.50;
    const searchCy = h * 0.405;
    const searchRx = Math.max(356 * scale, Math.min(370, w * 0.255));
    const searchRy = 106 * scale;

    const plateCx = w * 0.50;
    const plateCy = h * 0.56;
    const plateRx = Math.min(340 * scale, w * 0.24);
    const plateRy = 128 * scale;

    const pushPointOut = (pt: BranchSample) => {
        const dxA = (pt.x - searchCx) / searchRx;
        const dyA = (pt.y - searchCy) / searchRy;
        const d2A = dxA * dxA + dyA * dyA;
        if (d2A < 1.0) {
            if (d2A > 1e-4) {
                const invA = 1 / Math.hypot(dxA, dyA);
                pt.x = searchCx + dxA * invA * searchRx +
                    dxA * invA * 18 * scale * (1 - d2A);
                pt.y = searchCy + dyA * invA * searchRy +
                    dyA * invA * 10 * scale * (1 - d2A);
            } else {
                pt.x = searchCx + searchRx + 18 * scale;
            }
        }
        const dxB = (pt.x - plateCx) / plateRx;
        const dyB = (pt.y - plateCy) / plateRy;
        const d2B = dxB * dxB + dyB * dyB;
        if (d2B < 1.0 && d2B > 1e-4) {
            const pushB = (1 - d2B) * 26 * scale;
            const invB = 1 / Math.hypot(dxB, dyB);
            pt.x += dxB * invB * pushB;
            pt.y += dyB * invB * pushB * 0.4;
        }
    };

    const refreshBranchMetrics = (b: BranchData) => {
        if (b.points.length < 2) return;
        const p0 = b.points[0];
        for (let i = 0; i < b.points.length; i++) {
            b.points[i].lx = b.points[i].x - p0.x;
            b.points[i].ly = b.points[i].y - p0.y;
            const prev = b.points[Math.max(0, i - 1)];
            const next = b.points[Math.min(b.points.length - 1, i + 1)];
            b.points[i].angle = Math.atan2(next.y - prev.y, next.x - prev.x);
        }
    };

    for (const b of branches) {
        if (b.parentRef || b.ghost) continue;
        for (const pt of b.points) {
            pushPointOut(pt);
        }
        refreshBranchMetrics(b);
    }

    for (const b of branches) {
        if (!b.parentRef || b.ghost) continue;
        const anchor = b.parentRef.branch.points[b.parentRef.idx];
        if (anchor && b.points.length > 0) {
            const dx = anchor.x - b.points[0].x;
            const dy = anchor.y - b.points[0].y;
            if (Math.abs(dx) > 1e-3 || Math.abs(dy) > 1e-3) {
                for (const pt of b.points) {
                    pt.x += dx;
                    pt.y += dy;
                }
            }
        }
        for (let i = 1; i < b.points.length; i++) {
            pushPointOut(b.points[i]);
        }
        refreshBranchMetrics(b);
    }
}

export function computeBranchWorldPoints(
    branch: BranchData,
    timeSec: number,
    reducedMotion: boolean,
    windCalm: number,
    scale: number,
    frameSeq: number,
    breezeImpulse = 0,
    runtime?: BotanicalRuntimeState,
): WorldSample[] {
    if (branch.frameId === frameSeq && branch.worldCache) {
        return branch.worldCache;
    }

    let baseDAngle = 0;
    let anchorX = branch.points[0].x;
    let anchorY = branch.points[0].y;

    if (branch.parentRef) {
        const pWorld = computeBranchWorldPoints(
            branch.parentRef.branch,
            timeSec,
            reducedMotion,
            windCalm,
            scale,
            frameSeq,
            breezeImpulse,
            runtime,
        );
        const pPt = pWorld[branch.parentRef.idx];
        baseDAngle = pPt.dAngle;
        anchorX = pPt.x;
        anchorY = pPt.y;
    }

    const cosA = Math.cos(baseDAngle);
    const sinA = Math.sin(baseDAngle);
    const waveLag = branch.waveLag ?? 0;

    const gustEnv = evalGustEnvelope(runtime, timeSec, windCalm, reducedMotion);
    const gustAge = gustEnv > 0 && runtime ? timeSec - runtime.gustStartSec : 0;
    const branchPush = reducedMotion ? 0 : (branch.tipPush ?? 0);

    let out = branch.worldCache;
    if (!out || out.length !== branch.points.length) {
        out = new Array(branch.points.length);
        for (let i = 0; i < branch.points.length; i++) {
            out[i] = { x: 0, y: 0, angle: 0, dAngle: 0 };
        }
        branch.worldCache = out;
    }

    for (let i = 0; i < branch.points.length; i++) {
        const pt = branch.points[i];
        const rx = anchorX + pt.lx * cosA - pt.ly * sinA;
        const ry = anchorY + pt.lx * sinA + pt.ly * cosA;
        let breeze = 0;
        if (!reducedMotion) {
            if (runtime) {
                const wavePhase = gustAge * 2.5 - rx * 0.0022 - pt.u * waveLag +
                    branch.phase;
                const gustWave = gustEnv > 0
                    ? (Math.sin(wavePhase) * 0.65 +
                        Math.sin(wavePhase * 1.68 + 0.9) * 0.35) * gustEnv
                    : 0;
                breeze = gustWave + breezeImpulse + branchPush;
            } else {
                breeze =
                    (Math.sin(timeSec * 0.66 + branch.phase - pt.u * waveLag) *
                                0.65 +
                            Math.sin(
                                    timeSec * 1.40 +
                                        (branch.phase - pt.u * waveLag) * 1.7 +
                                        1.1,
                                ) *
                                0.35) *
                        windCalm +
                    breezeImpulse +
                    branchPush;
            }
        }
        const worldAng = pt.angle + baseDAngle;
        const nx = -Math.sin(worldAng);
        const ny = Math.cos(worldAng);
        const tx = Math.cos(worldAng);
        const ty = Math.sin(worldAng);
        const amp = 7.5 * scale * pt.localFlex;
        const bend = breeze * amp;
        const arcRetract = Math.min(amp * 0.28, breeze * breeze * amp * 0.16);
        const ldx = (nx * 0.65 + 0.35) * bend - tx * arcRetract;
        const ldy = (ny * 0.65) * bend - ty * arcRetract;
        const ldAngle = breeze * 0.032 * pt.localFlex;
        const slot = out[i];
        slot.x = rx + ldx;
        slot.y = ry + ldy;
        slot.angle = worldAng + ldAngle;
        slot.dAngle = baseDAngle + ldAngle;
    }

    branch.frameId = frameSeq;
    return out;
}
