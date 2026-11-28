import { resolveSolarTerm } from "../solar-terms.ts";
import { drawAtmosphericStage } from "./atmosphere.ts";
import {
    drawCachedAtmosphere,
    drawCachedOrnament,
    drawCachedRocks,
    syncBotanicalCache,
} from "./cache.ts";
import {
    applyWorkspaceClearance,
    clamp,
    computeBranchWorldPoints,
    easeOutCubic,
    evalGustEnvelope,
    hashString,
    mirrorSceneGeometryToLeft,
    mulberry32,
    resolveBotanicalArchetype,
    sampleBranch,
    stepBotanicalWindSpring,
    triggerBotanicalGust,
} from "./physics.ts";
import { drawRockBase, drawTaperedBranch } from "./strokes.ts";
import type {
    BotanicalArchetype,
    BotanicalDockInsets,
    BotanicalOrnament,
    BotanicalPointerState,
    BotanicalRenderParams,
    BotanicalScene,
    BotanicalSceneBounds,
    BotanicalSceneGenContext,
    BotanicalSpeciesModule,
    BranchData,
    FireflySeed,
    GenerateBotanicalSceneOptions,
    RockStroke,
} from "./types.ts";
import {
    drawDewdropAndRipple,
    drawDrifters,
    drawFireflies,
    drawLadybug,
    drawRewardBloom,
    drawSparrow,
    spawnDrifter,
} from "./visitors.ts";

export function generateBotanicalScene(
    speciesModule: BotanicalSpeciesModule,
    w: number,
    h: number,
    dateKey: string,
    embedded = false,
    dockInsets?: BotanicalDockInsets,
    options?: GenerateBotanicalSceneOptions,
): BotanicalScene {
    const species = speciesModule.species;
    const isNarrow = !embedded && w < 720;
    const isWide = embedded || w >= 1024;
    const archetype: BotanicalArchetype = !isNarrow && !embedded
        ? resolveBotanicalArchetype(species, dateKey, options?.archetype)
        : 0;
    const targetSide: "left" | "right" =
        !embedded && options?.sceneSide === "left" && w >= 768
            ? "left"
            : "right";
    const rng = mulberry32(
        hashString(`${dateKey}:${species}:v7:a${archetype}`),
    );
    const rand = (lo: number, hi: number) => lo + rng() * (hi - lo);
    const solar = resolveSolarTerm(dateKey);
    const S = isNarrow
        ? clamp(Math.min(w / 500, h / 860), 0.62, 0.82)
        : clamp(Math.min(w / 1440, h / 900), 0.56, 1.18);

    const branches: BranchData[] = [];
    const ornaments: BotanicalOrnament[] = [];
    const rocks: RockStroke[] = [];
    const dockTop = dockInsets?.top ?? 0;
    const dockRight = targetSide === "left"
        ? (dockInsets?.left ?? 0)
        : (dockInsets?.right ?? 0);
    const dockBottom = dockInsets?.bottom ?? 0;
    const topShift = !embedded && !isNarrow ? dockTop * 0.75 : 0;
    const narrowRootY = h - Math.max(92, h * 0.115) - dockBottom;
    const rootX = isNarrow ? w + 10 * S : w + 16 * S - dockRight * 0.4;
    const rootY = isNarrow ? narrowRootY : h + 16 * S - dockBottom * 0.3;

    const genCtx: BotanicalSceneGenContext = {
        w,
        h,
        S,
        isNarrow,
        isWide,
        embedded,
        archetype,
        solar,
        rng,
        rand,
        rootX,
        rootY,
        dockTop,
        dockRight,
        dockBottom,
        topShift,
        narrowRootY,
        branches,
        ornaments,
        rocks,
    };

    if (isWide || isNarrow) {
        const echoScale = isNarrow ? 0.9 : 1;
        const isWideMaple = !isNarrow && species === "maple";
        const tr0 = isNarrow
            ? { x: w + 8, y: rand(215, 235) * S }
            : isWideMaple
            ? { x: w - 180 * S, y: Math.max(48, 52 * S) + topShift }
            : { x: w + 10, y: rand(96, 118) * S + topShift };
        const tr3 = isNarrow
            ? {
                x: w - rand(130, 158) * S,
                y: tr0.y + rand(72, 92) * S,
            }
            : isWideMaple
            ? {
                x: w - rand(345, 385) * S,
                y: tr0.y + rand(95, 120) * S,
            }
            : {
                x: w - rand(180, 225) * S,
                y: tr0.y + rand(112, 142) * S,
            };
        const echo = sampleBranch(
            tr0,
            {
                x: tr0.x - (isNarrow ? 50 : 75) * S,
                y: tr0.y + (isNarrow ? 6 : 8) * S,
            },
            {
                x: tr3.x + (isNarrow ? 42 : 65) * S,
                y: tr3.y - (isNarrow ? 30 : 46) * S,
            },
            tr3,
            {
                steps: 26,
                widthStart: (isNarrow ? 1.05 : 1.3) * S,
                widthEnd: 0.42 * S,
                t0: 0.22,
                t1: 0.62,
                flexSpan: 0.95,
                phase: 2.6,
                ghost: true,
                wobble: 0.9 * S * echoScale,
            },
            rng,
        );
        branches.push(echo);
        speciesModule.populateEchoOrnaments(genCtx, echo, echoScale);
    }

    speciesModule.generateMain(genCtx);

    // Dual-envelope workspace clearance around central search bar & inline AI / app plate on wide desktop
    if (!isNarrow && !embedded) {
        applyWorkspaceClearance(branches, w, h, S);
    }

    if (embedded) {
        return {
            species,
            module: speciesModule,
            side: "right",
            archetype,
            visitorPresent: false,
            branches,
            ornaments,
            rocks,
            scale: S,
            visitorAnchor: null,
            rewardAnchor: null,
        };
    }

    // Post-generation anchors for micro-ecology visitors & reward blooms
    // (sampled after all branch/ornament geometry to preserve deterministic layout).
    const fgBranches = branches.filter((b) => !b.ghost);
    const fireflies: FireflySeed[] = [
        {
            x: w - (isNarrow ? 105 : 220) * S,
            y: h - (isNarrow ? 150 : 280) * S,
            phase: rand(0, 6.28),
            speed: 0.42,
        },
        {
            x: w - (isNarrow ? 175 : 350) * S,
            y: h - (isNarrow ? 210 : 390) * S,
            phase: rand(0, 6.28),
            speed: 0.33,
        },
    ];

    const { visitorAnchor, rewardAnchor } = speciesModule.buildAnchors(
        genCtx,
        fgBranches,
        fireflies,
    );

    const fgSpeckBranches = branches.filter((b) =>
        !b.ghost && (species !== "fern" || b.points.length >= 40)
    );
    const dewOrnIndex = visitorAnchor?.kind === "dew-or-firefly" &&
            visitorAnchor.ornament
        ? ornaments.indexOf(visitorAnchor.ornament)
        : -1;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of branches) {
        if (b.ghost) continue;
        for (const pt of b.points) {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
        }
    }
    for (const r of rocks) {
        for (const pt of r.points) {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
        }
    }
    for (const ff of fireflies) {
        if (ff.x < minX) minX = ff.x;
        if (ff.x > maxX) maxX = ff.x;
        if (ff.y < minY) minY = ff.y;
        if (ff.y > maxY) maxY = ff.y;
    }
    const pad = 48 * S;
    const bounds: BotanicalSceneBounds | undefined = Number.isFinite(minX)
        ? {
            minX: minX - pad,
            minY: minY - pad,
            maxX: maxX + pad,
            maxY: maxY + pad,
        }
        : undefined;

    const visitorPresent =
        (hashString(`${dateKey}:${species}:serendipity`) % 100) < 45;
    const builtScene: BotanicalScene = {
        species,
        module: speciesModule,
        side: "right",
        archetype,
        visitorPresent,
        branches,
        ornaments,
        rocks,
        scale: S,
        visitorAnchor,
        rewardAnchor,
        bounds,
        fgSpeckBranches,
        dewOrnIndex,
    };
    if (targetSide === "left") {
        mirrorSceneGeometryToLeft(builtScene, w);
    }
    return builtScene;
}

export function renderBotanicalFrame(params: BotanicalRenderParams): number {
    const {
        ctx,
        scene,
        width,
        height,
        timeSec,
        dt,
        rawProgress,
        reducedMotion,
        windCalm,
        searchFocused,
        embedded,
        palette,
        pointer: rawPointer,
        drifters,
        frameSeq,
        runtime,
        sceneSide = "right",
        cache,
        dpr = 1,
    } = params;
    let nextDriftSpawn = params.lastDriftSpawn;

    const legacyMirrorLeft = !embedded && sceneSide === "left" &&
        width >= 768 && scene.side !== "left";
    const pointer: BotanicalPointerState = legacyMirrorLeft
        ? {
            ...rawPointer,
            x: rawPointer.x > -1000 ? width - rawPointer.x : rawPointer.x,
            vx: -rawPointer.vx,
        }
        : rawPointer;

    if (runtime && !reducedMotion && !embedded) {
        runtime.fireflySimSec += dt;
    }
    const breezeImpulse = runtime
        ? stepBotanicalWindSpring(runtime, dt, reducedMotion)
        : 0;

    if (runtime && !reducedMotion && !embedded && rawProgress >= 1) {
        if (runtime.nextGustSec < -100) {
            runtime.nextGustSec = timeSec + 4.5;
        } else if (timeSec >= runtime.nextGustSec) {
            triggerBotanicalGust(runtime, timeSec);
        }
    }

    const gustEnv = evalGustEnvelope(runtime, timeSec, windCalm, reducedMotion);
    const windEnergy = clamp(gustEnv + Math.abs(breezeImpulse) * 0.85, 0, 1.2);
    const activeCache = cache && !embedded ? cache : undefined;
    const effectiveAtmosphereSide = legacyMirrorLeft ? "right" : sceneSide;
    if (activeCache) {
        syncBotanicalCache(
            activeCache,
            scene,
            palette,
            width,
            height,
            dpr,
            effectiveAtmosphereSide,
        );
    }

    ctx.clearRect(0, 0, width, height);
    if (legacyMirrorLeft) {
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
    }

    if (
        !activeCache ||
        !drawCachedAtmosphere(
            activeCache,
            ctx,
            width,
            height,
            scene.scale,
            palette,
            rawProgress,
            embedded,
            effectiveAtmosphereSide,
        )
    ) {
        drawAtmosphericStage(
            ctx,
            width,
            height,
            scene.scale,
            palette,
            rawProgress,
            embedded,
            effectiveAtmosphereSide,
        );
    }

    // Precompute pointer twig-bend physics on foreground branches
    const pSpeed = embedded ? 0 : Math.hypot(pointer.vx, pointer.vy);
    if (!reducedMotion && !embedded) {
        const pushRadius = 110 * scene.scale;
        for (const b of scene.branches) {
            if (b.ghost || b.points.length < 4) continue;
            let vel = b.tipVel ?? 0;
            let push = b.tipPush ?? 0;
            if (pSpeed > 18) {
                const probeIdx = Math.floor((b.points.length - 1) * 0.72);
                const probePt = b.points[probeIdx];
                const dist = Math.hypot(
                    probePt.x - pointer.x,
                    probePt.y - pointer.y,
                );
                if (dist < pushRadius) {
                    const influence = (1 - dist / pushRadius) *
                        clamp(pointer.vx * 0.0005, -0.22, 0.22);
                    vel = clamp(vel + influence * 6.0 * dt, -2.5, 2.5);
                }
            }
            if (Math.abs(push) > 1e-4 || Math.abs(vel) > 1e-4) {
                const accel = -18.0 * push - 4.2 * vel;
                vel += accel * dt;
                push = clamp(push + vel * dt, -0.45, 0.45);
                if (Math.abs(push) < 0.0012 && Math.abs(vel) < 0.0012) {
                    push = 0;
                    vel = 0;
                }
            }
            b.tipPush = push;
            b.tipVel = vel;
        }
    } else {
        for (const b of scene.branches) {
            b.tipPush = 0;
            b.tipVel = 0;
        }
    }

    // Precompute ornament world transforms & interactive physics once per frame
    const activeOrns: Array<{
        o: BotanicalOrnament;
        wx: number;
        wy: number;
        angle: number;
        op: number;
    }> = [];
    let dewMatchedItem: {
        o: BotanicalOrnament;
        wx: number;
        wy: number;
        angle: number;
        op: number;
    } | null = null;
    const dewOrnIdx = scene.dewOrnIndex ?? -1;

    for (let oi = 0; oi < scene.ornaments.length; oi++) {
        const o = scene.ornaments[oi];
        const op = clamp((rawProgress - o.t0) / (o.t1 - o.t0), 0, 1);
        if (op <= 0.005) continue;

        const wp = computeBranchWorldPoints(
            o.branch,
            timeSec,
            reducedMotion,
            windCalm,
            scene.scale,
            frameSeq,
            breezeImpulse,
            runtime,
        )[o.idx];

        if (!reducedMotion && !o.ghost && !embedded) {
            if (pSpeed > 18) {
                const dist = Math.hypot(wp.x - pointer.x, wp.y - pointer.y);
                if (dist < 88) {
                    const influence = (1 - dist / 88) *
                        clamp(pointer.vx * 0.00055, -0.22, 0.22);
                    o.vel += influence * 14 * dt;
                    if (
                        rawProgress >= 1 &&
                        pSpeed > 260 &&
                        drifters.length < 3 &&
                        timeSec - pointer.lastRustleSpawn > 2.8
                    ) {
                        spawnDrifter(
                            scene,
                            drifters,
                            timeSec,
                            windCalm,
                            frameSeq,
                            o,
                        );
                        pointer.lastRustleSpawn = timeSec;
                    }
                }
            }
            o.vel += -o.push * 22 * dt;
            o.vel *= Math.pow(0.08, dt);
            o.push = clamp(o.push + o.vel * dt * 12, -0.32, 0.32);
            if (Math.abs(o.push) < 0.001 && Math.abs(o.vel) < 0.001) {
                o.push = 0;
                o.vel = 0;
            }
        } else {
            o.push = 0;
            o.vel = 0;
        }

        const sway = reducedMotion
            ? 0
            : (windEnergy > 0.002
                ? Math.sin(timeSec * 1.85 + o.phase) * 0.044 * windEnergy
                : 0) + o.push;
        const item = {
            o,
            wx: wp.x,
            wy: wp.y,
            angle: wp.angle + o.angleOffset + sway,
            op,
        };
        activeOrns.push(item);
        if (oi === dewOrnIdx) {
            dewMatchedItem = item;
        }
    }

    const drawOrnamentFast = (
        item: {
            o: BotanicalOrnament;
            wx: number;
            wy: number;
            angle: number;
            op: number;
        },
        layerA: number,
    ) => {
        if (
            activeCache &&
            drawCachedOrnament(
                activeCache,
                ctx,
                scene,
                item.o,
                item.wx,
                item.wy,
                item.angle,
                item.op,
                palette,
                layerA,
            )
        ) {
            return;
        }
        scene.module.drawOrnament(
            ctx,
            item.o,
            item.wx,
            item.wy,
            item.angle,
            item.op,
            palette,
            layerA,
        );
    };

    // Layer 1: Distant ghost & midground echo branches & ornaments
    for (const b of scene.branches) {
        if (b.ghost) {
            drawTaperedBranch(
                ctx,
                b,
                scene.species,
                rawProgress,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
                palette,
                breezeImpulse,
                runtime,
            );
        }
    }
    for (const item of activeOrns) {
        if (item.o.ghost) {
            drawOrnamentFast(item, 0.15);
        }
    }
    for (const b of scene.branches) {
        if (b.midground && !b.ghost) {
            drawTaperedBranch(
                ctx,
                b,
                scene.species,
                rawProgress,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
                palette,
                breezeImpulse,
                runtime,
            );
        }
    }
    for (const item of activeOrns) {
        if (item.o.midground && !item.o.ghost) {
            drawOrnamentFast(item, 0.45);
        }
    }

    // Slope rocks & moss base (for fern)
    if (
        scene.rocks.length > 0 &&
        (!activeCache ||
            !drawCachedRocks(activeCache, ctx, scene, rawProgress, palette))
    ) {
        for (const rock of scene.rocks) {
            drawRockBase(ctx, rock, rawProgress, scene.scale, palette);
        }
    }

    // Layer 2: Foreground calligraphic branches
    for (const b of scene.branches) {
        if (!b.ghost && !b.midground) {
            drawTaperedBranch(
                ctx,
                b,
                scene.species,
                rawProgress,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
                palette,
                breezeImpulse,
                runtime,
            );
        }
    }

    // Layer 3: Foreground botanical ornaments
    for (const item of activeOrns) {
        if (!item.o.ghost && !item.o.midground) {
            if (
                palette.isDark &&
                !embedded &&
                !palette.overPhoto &&
                !palette.solidSurface &&
                item.o.tint === "accent"
            ) {
                const isFernPinna = item.o.kind === "fernPinna";
                const haloRadius = item.o.kind === "fernPinna"
                    ? Math.min(Math.max(item.o.len * 0.24, 10), 22)
                    : ("size" in item.o ? item.o.size : 24) * 1.75;
                const haloX = item.o.kind === "fernPinna"
                    ? item.wx + Math.cos(item.angle) * item.o.len * 0.28
                    : item.wx;
                const haloY = item.o.kind === "fernPinna"
                    ? item.wy + Math.sin(item.angle) * item.o.len * 0.28
                    : item.wy;
                const peakAlpha = isFernPinna ? 0.08 : 0.24;
                const glow = ctx.createRadialGradient(
                    haloX,
                    haloY,
                    0,
                    haloX,
                    haloY,
                    haloRadius,
                );
                glow.addColorStop(
                    0,
                    palette.wash("accent", peakAlpha * item.op),
                );
                glow.addColorStop(
                    0.34,
                    palette.wash("accent", peakAlpha * 0.42 * item.op),
                );
                glow.addColorStop(
                    0.68,
                    palette.wash("accent", peakAlpha * 0.10 * item.op),
                );
                glow.addColorStop(1, palette.wash("accent", 0));
                ctx.save();
                ctx.globalCompositeOperation = "screen";
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(haloX, haloY, haloRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            drawOrnamentFast(item, 1.0);
        }
    }

    // Layer 4: 泥金砂子与飞墨微尘（点亮主景花簇周边空间；繁底双勾模式收敛防脏）
    if (rawProgress > 0.72 && palette.photoStyle !== "gongbi-line") {
        const speckFade = easeOutCubic(
            clamp((rawProgress - 0.72) / 0.28, 0, 1),
        );
        const fgBranches = scene.fgSpeckBranches ??
            scene.branches.filter((b) =>
                !b.ghost && (scene.species !== "fern" || b.points.length >= 40)
            );
        for (let bi = 0; bi < Math.min(2, fgBranches.length); bi++) {
            const b = fgBranches[bi];
            const pts = computeBranchWorldPoints(
                b,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
                breezeImpulse,
                runtime,
            );
            if (pts.length < 3) continue;
            const anchorIdx = Math.floor(pts.length * (bi === 0 ? 0.84 : 0.68));
            const anchor = pts[anchorIdx];
            const speckCount = bi === 0 ? 3 : 2;
            for (let k = 0; k < speckCount; k++) {
                const seedAngle = b.phase * 3.1 + k * 1.38 + bi * 1.4;
                const dist = (12 + k * 15) * scene.scale;
                const sx = anchor.x + Math.cos(seedAngle) * dist;
                const sy = anchor.y + Math.sin(seedAngle) * dist * 0.78;
                const sr = (scene.species === "fern"
                    ? (0.65 + ((k + bi) % 3) * 0.35)
                    : (0.60 + ((k + bi) % 4) * 0.28)) * scene.scale;
                ctx.beginPath();
                ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                if (palette.isDark) {
                    ctx.fillStyle = k % 3 === 1
                        ? palette.waterline("accent", 0.38 * speckFade)
                        : palette.goldDust(
                            (0.36 + (k % 3) * 0.16) * speckFade,
                        );
                } else {
                    ctx.fillStyle = k % 3 === 0
                        ? palette.goldDust(0.38 * speckFade)
                        : k % 3 === 1
                        ? palette.waterline("accent", 0.36 * speckFade)
                        : palette.inkGrade("nong", 0.28 * speckFade);
                }
                ctx.fill();
            }
        }
    }

    if (!embedded) {
        const pDecay = Math.exp(-12 * dt);
        pointer.vx *= pDecay;
        pointer.vy *= pDecay;
    }

    // Layer 5: 3D-tumbling drifters
    if (!reducedMotion && !embedded && rawProgress >= 1) {
        if (
            !searchFocused &&
            timeSec - nextDriftSpawn > 7.5 &&
            drifters.length < 2
        ) {
            spawnDrifter(scene, drifters, timeSec, windCalm, frameSeq);
            nextDriftSpawn = timeSec;
        }
        drawDrifters(
            ctx,
            scene,
            drifters,
            height,
            timeSec,
            dt,
            palette,
            gustEnv + breezeImpulse,
        );
    }

    // Layer 6: Micro-ecology visitors (serendipity ~45% or awakened) & tasks-cleared reward blooms
    if (!embedded && runtime) {
        const showVisitorNow = params.forceVisitor ??
            (scene.visitorPresent || Boolean(runtime.awakened));
        if (
            !scene.visitorAnchor ||
            scene.visitorAnchor.kind === "dew-or-firefly" ||
            !showVisitorNow
        ) {
            if (runtime.visitorMode !== "perched") {
                runtime.visitorMode = "perched";
            }
        }
        if (
            !scene.visitorAnchor ||
            scene.visitorAnchor.kind !== "dew-or-firefly" ||
            palette.isDark
        ) {
            if (runtime.dewState !== "hanging") {
                runtime.dewState = "hanging";
            }
        }
    }
    if (!embedded && runtime && rawProgress > 0.78) {
        const visFade = easeOutCubic(clamp((rawProgress - 0.78) / 0.22, 0, 1));
        const showVisitor = params.forceVisitor ??
            (scene.visitorPresent || Boolean(runtime.awakened));
        const facingRight = scene.side === "left" && !legacyMirrorLeft;
        const flyDir = facingRight ? 1 : -1;
        if (scene.visitorAnchor) {
            const va = scene.visitorAnchor;
            const anchorPt = computeBranchWorldPoints(
                va.branch,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
                breezeImpulse,
                runtime,
            )[va.idx];

            if (va.kind === "sparrow" && showVisitor) {
                if (runtime.visitorMode === "perched") {
                    if (
                        !reducedMotion &&
                        pSpeed > 30 &&
                        Math.hypot(
                                anchorPt.x - pointer.x,
                                anchorPt.y - pointer.y,
                            ) < 96 * scene.scale
                    ) {
                        runtime.visitorMode = "departing";
                        runtime.visitorStateStartSec = timeSec;
                        runtime.visitorX = anchorPt.x;
                        runtime.visitorY = anchorPt.y;
                        runtime.visitorVx = 74 * flyDir;
                        runtime.visitorVy = -62;
                    } else {
                        runtime.visitorX = anchorPt.x;
                        runtime.visitorY = anchorPt.y;
                        drawSparrow(
                            ctx,
                            anchorPt.x,
                            anchorPt.y,
                            scene.scale,
                            visFade,
                            palette,
                            false,
                            timeSec,
                            reducedMotion,
                            facingRight,
                        );
                    }
                } else if (runtime.visitorMode === "departing") {
                    const dAge = timeSec - runtime.visitorStateStartSec;
                    if (dAge > 2.4) {
                        runtime.visitorMode = "returning";
                        runtime.visitorStateStartSec = timeSec;
                    } else {
                        // Accelerating flap into upward parabolic glide arc
                        const lift = dAge < 0.45 ? -48 * dt : -14 * dt;
                        runtime.visitorVx += 18 * flyDir * dt;
                        runtime.visitorVy += lift;
                        runtime.visitorX += runtime.visitorVx * scene.scale *
                            dt;
                        runtime.visitorY += runtime.visitorVy * scene.scale *
                            dt;
                        const flyAlpha = clamp(1 - dAge / 2.2, 0, 1) * visFade;
                        drawSparrow(
                            ctx,
                            runtime.visitorX,
                            runtime.visitorY,
                            scene.scale,
                            flyAlpha,
                            palette,
                            dAge < 0.55 || Math.floor(dAge * 5) % 2 === 0,
                            timeSec,
                            reducedMotion,
                            facingRight,
                        );
                    }
                } else {
                    const rAge = timeSec - runtime.visitorStateStartSec;
                    if (rAge > 18) {
                        runtime.visitorMode = "perched";
                    } else if (rAge > 16.5) {
                        const retP = clamp((rAge - 16.5) / 1.5, 0, 1);
                        const ease = easeOutCubic(retP);
                        const arcX = anchorPt.x +
                            (1 - ease) * flyDir * 52 * scene.scale;
                        const arcY = anchorPt.y -
                            (1 - ease) * 34 * scene.scale -
                            Math.sin(retP * Math.PI) * 10 * scene.scale;
                        const retAlpha = clamp(retP * 1.6, 0, 1) * visFade;
                        drawSparrow(
                            ctx,
                            arcX,
                            arcY,
                            scene.scale,
                            retAlpha,
                            palette,
                            retP < 0.62,
                            timeSec,
                            reducedMotion,
                            facingRight,
                        );
                    }
                }
            } else if (va.kind === "ladybug" && showVisitor) {
                const lx = anchorPt.x +
                    Math.cos(anchorPt.angle + va.angleOffset) * va.leafSize *
                        0.72;
                const ly = anchorPt.y +
                    Math.sin(anchorPt.angle + va.angleOffset) * va.leafSize *
                        0.72;
                if (runtime.visitorMode === "perched") {
                    if (
                        !reducedMotion &&
                        pSpeed > 25 &&
                        Math.hypot(lx - pointer.x, ly - pointer.y) <
                            88 * scene.scale
                    ) {
                        runtime.visitorMode = "departing";
                        runtime.visitorStateStartSec = timeSec;
                        runtime.visitorX = lx;
                        runtime.visitorY = ly;
                        runtime.visitorVx = 52 * flyDir;
                        runtime.visitorVy = -46;
                    } else {
                        drawLadybug(
                            ctx,
                            lx,
                            ly,
                            anchorPt.angle + va.angleOffset,
                            scene.scale,
                            visFade,
                            palette,
                            false,
                            timeSec,
                            reducedMotion,
                        );
                    }
                } else if (runtime.visitorMode === "departing") {
                    const dAge = timeSec - runtime.visitorStateStartSec;
                    if (dAge > 2.2) {
                        runtime.visitorMode = "returning";
                        runtime.visitorStateStartSec = timeSec;
                    } else {
                        runtime.visitorVy -= 14 * dt;
                        runtime.visitorX += (runtime.visitorVx +
                            Math.sin(dAge * 5) * 28) * scene.scale * dt;
                        runtime.visitorY += runtime.visitorVy * scene.scale *
                            dt;
                        drawLadybug(
                            ctx,
                            runtime.visitorX,
                            runtime.visitorY,
                            -0.6,
                            scene.scale,
                            clamp(1 - dAge / 2.0, 0, 1) * visFade,
                            palette,
                            true,
                            timeSec,
                            reducedMotion,
                        );
                    }
                } else {
                    const rAge = timeSec - runtime.visitorStateStartSec;
                    if (rAge > 16) {
                        runtime.visitorMode = "perched";
                    } else if (rAge > 14.5) {
                        const retP = clamp((rAge - 14.5) / 1.5, 0, 1);
                        const ease = easeOutCubic(retP);
                        const arcX = lx +
                            (1 - ease) * flyDir * 28 * scene.scale;
                        const arcY = ly - (1 - ease) * 22 * scene.scale -
                            Math.sin(retP * Math.PI) * 6 * scene.scale;
                        drawLadybug(
                            ctx,
                            arcX,
                            arcY,
                            anchorPt.angle + va.angleOffset,
                            scene.scale,
                            clamp(retP * 1.5, 0, 1) * visFade,
                            palette,
                            retP < 0.7,
                            timeSec,
                            reducedMotion,
                        );
                    }
                }
            } else if (va.kind === "dew-or-firefly") {
                let tipX = anchorPt.x + va.tipOffsetX;
                let tipY = anchorPt.y + va.tipOffsetY;
                if (va.ornament) {
                    const matched = dewMatchedItem ??
                        activeOrns.find((item) => item.o === va.ornament);
                    if (matched) {
                        let lx: number;
                        let ly: number;
                        if (va.ornament.kind === "fernPinna") {
                            const o = va.ornament;
                            const t = 0.96;
                            const foldKick = o.profile
                                ? Math.sin((t - 0.44) * Math.PI * 1.1) * o.len *
                                    0.04 * o.side
                                : 0;
                            lx = t * o.len;
                            ly = o.curve * o.len * Math.pow(t, 1.55) +
                                o.whip * o.len * Math.sin(t * Math.PI) * t +
                                foldKick;
                        } else {
                            const o = va.ornament;
                            lx = o.stemLen + o.rx * 1.66;
                            ly = o.profile ? -o.ry * 0.18 : 0;
                        }
                        const cosA = Math.cos(matched.angle);
                        const sinA = Math.sin(matched.angle);
                        tipX = matched.wx + lx * cosA - ly * sinA;
                        tipY = matched.wy + lx * sinA + ly * cosA;
                    }
                }
                if (!palette.isDark) {
                    if (
                        !reducedMotion &&
                        runtime.dewState === "hanging" &&
                        pSpeed > 25 &&
                        Math.hypot(tipX - pointer.x, tipY - pointer.y) <
                            84 * scene.scale
                    ) {
                        runtime.dewState = "falling";
                        runtime.dewStateStartSec = timeSec;
                        runtime.dewFallDist = 0;
                    }
                    drawDewdropAndRipple(
                        ctx,
                        tipX,
                        tipY,
                        runtime,
                        timeSec,
                        dt,
                        scene.scale,
                        palette,
                        reducedMotion,
                    );
                }
            }

            if (palette.isDark) {
                drawFireflies(
                    ctx,
                    va.fireflies,
                    runtime,
                    timeSec,
                    scene.scale,
                    palette,
                    pointer,
                    reducedMotion,
                );
            }
        }

        if (runtime.awakened && scene.rewardAnchor) {
            drawRewardBloom(
                ctx,
                scene,
                scene.rewardAnchor,
                runtime,
                timeSec,
                reducedMotion,
                windCalm,
                frameSeq,
                breezeImpulse,
                palette,
            );
        }
    }

    if (legacyMirrorLeft) {
        ctx.restore();
    }

    return nextDriftSpawn;
}
