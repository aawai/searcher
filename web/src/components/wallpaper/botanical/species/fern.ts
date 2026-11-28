import {
    clamp,
    easeOutCubic,
    easeOutQuart,
    lerp,
    sampleBranch,
} from "../physics.ts";
import { strokeGongbiOutline } from "../strokes.ts";
import type {
    BotanicalOrnament,
    BotanicalPalette,
    BotanicalRewardAnchor,
    BotanicalScene,
    BotanicalSceneGenContext,
    BotanicalSpeciesModule,
    BotanicalVisitorAnchor,
    BranchData,
    FernPinnaOrnament,
    FireflySeed,
    Point2D,
    TintRole,
    WorldSample,
} from "../types.ts";

function drawFernPinna(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: FernPinnaOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const strokeP = easeOutQuart(clamp(p / 0.72, 0, 1));
    const veinP = easeOutCubic(clamp((p - 0.24) / 0.65, 0, 1));
    if (strokeP <= 0.02) return;

    const len = o.len * strokeP;
    const w = o.width * 0.92;
    const midPt = (t: number): Point2D => {
        const foldKick = o.profile && t > 0.44
            ? Math.sin((t - 0.44) * Math.PI * 1.1) * len * 0.04 * o.side
            : 0;
        return {
            x: t * len,
            y: o.curve * len * Math.pow(t, 1.55) +
                o.whip * len * Math.sin(t * Math.PI) * t +
                foldKick,
        };
    };

    const samples = 26;
    const upper: Point2D[] = [];
    const lower: Point2D[] = [];
    const spine: Point2D[] = [];
    const widths: number[] = [];

    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const mp = midPt(t);
        const mpNext = midPt(Math.min(1, t + 0.02));
        const tang = Math.atan2(mpNext.y - mp.y, mpNext.x - mp.x);
        const nx = -Math.sin(tang);
        const ny = Math.cos(tang);

        let hw: number;
        if (o.profile) {
            if (t < 0.45) {
                const lt = t / 0.45;
                hw = w * (0.18 + 0.88 * Math.sin(lt * Math.PI * 0.72)) *
                    lerp(1, 0.18, Math.pow(lt, 2.2));
            } else {
                const rt = (t - 0.45) / 0.55;
                hw = w *
                    (0.18 + 0.42 * Math.sin(rt * Math.PI * 0.88)) *
                    Math.pow(1 - rt, 0.78);
            }
        } else {
            const belly = t < 0.30
                ? lerp(0.20, 1.05, Math.sin((t / 0.30) * Math.PI * 0.5))
                : 1.05 * Math.pow(1 - (t - 0.30) / 0.70, 1.38);
            hw = w * belly;
        }
        hw = Math.max(0.18, hw);

        const asym = o.profile && t > 0.45 ? 0.85 : 1.08;
        upper.push({ x: mp.x - nx * hw * asym, y: mp.y - ny * hw * asym });
        lower.push({ x: mp.x + nx * hw, y: mp.y + ny * hw });
        spine.push(mp);
        widths.push(hw);
    }

    const tipPt = spine[spine.length - 1];

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const iw = o.inkWeight;
    const grad = ctx.createLinearGradient(0, 0, Math.max(1, tipPt.x), tipPt.y);
    if (o.tint === "ink") {
        grad.addColorStop(0, pal.wash("ink", 1.24 * iw * strokeP * layerA));
        grad.addColorStop(0.55, pal.fill("ink", 1.05 * iw * strokeP * layerA));
        grad.addColorStop(1, pal.fill("ink", 0.12 * strokeP * layerA));
    } else {
        grad.addColorStop(0, pal.wash(o.tint, 1.26 * iw * strokeP * layerA));
        grad.addColorStop(
            0.55,
            pal.fill(o.tint, 1.08 * iw * strokeP * layerA),
        );
        grad.addColorStop(1, pal.fill(o.tint, 0.14 * strokeP * layerA));
    }

    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 1; i < upper.length; i++) {
        ctx.lineTo(upper[i].x, upper[i].y);
    }
    for (let i = lower.length - 2; i >= 0; i--) {
        ctx.lineTo(lower[i].x, lower[i].y);
    }
    ctx.closePath();

    // True transparent dry-brush flying-white (feibai) bristle slits via evenodd
    const useFeibai = o.feibai && !o.ghost && !o.profile && len >= 62 &&
        strokeP > 0.72;
    if (useFeibai) {
        const slits = [
            { t0: 0.36, t1: 0.78, off: 0.24, r: 0.13 },
            { t0: 0.44, t1: 0.70, off: -0.22, r: 0.10 },
        ];
        for (const sl of slits) {
            const i0 = Math.round(sl.t0 * samples);
            const i1 = Math.round(sl.t1 * samples);
            if (i1 - i0 < 4) continue;
            const sUp: Point2D[] = [];
            const sLo: Point2D[] = [];
            for (let i = i0; i <= i1; i++) {
                const u = (i - i0) / (i1 - i0);
                const env = Math.sin(u * Math.PI);
                const mp = spine[i];
                const mpN = spine[Math.min(samples, i + 1)];
                const tang = Math.atan2(mpN.y - mp.y, mpN.x - mp.x);
                const nx = -Math.sin(tang);
                const ny = Math.cos(tang);
                const hw = widths[i];
                const cx = mp.x + nx * hw * sl.off;
                const cy = mp.y + ny * hw * sl.off;
                const sr = Math.max(0.28, hw * sl.r * env);
                sUp.push({ x: cx - nx * sr, y: cy - ny * sr });
                sLo.push({ x: cx + nx * sr, y: cy + ny * sr });
            }
            ctx.moveTo(sUp[0].x, sUp[0].y);
            for (let k = 1; k < sUp.length; k++) {
                ctx.lineTo(sUp[k].x, sUp[k].y);
            }
            for (let k = sLo.length - 1; k >= 0; k--) {
                ctx.lineTo(sLo[k].x, sLo[k].y);
            }
            ctx.closePath();
        }
    }

    ctx.fillStyle = grad;
    ctx.fill(useFeibai ? "evenodd" : "nonzero");
    if (!o.ghost && strokeP > 0.35) {
        strokeGongbiOutline(ctx, o.tint, pal, strokeP * layerA, 0.58);
    }

    // Half-length calligraphic midrib fading into the boneless whip tip
    if (veinP > 0.02) {
        const vEnd = midPt(0.54 * veinP);
        const vCtrl = midPt(0.27 * veinP);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(vCtrl.x, vCtrl.y, vEnd.x, vEnd.y);
        ctx.strokeStyle = pal.stroke("ink", 0.52 * veinP * layerA);
        ctx.lineWidth = o.ghost ? 0.42 : 0.66;
        ctx.lineCap = "round";
        ctx.stroke();
    }
    ctx.restore();
}

export const fernSpecies: BotanicalSpeciesModule = {
    species: "fern",

    populateEchoOrnaments(
        gen: BotanicalSceneGenContext,
        echo: BranchData,
        echoScale: number,
    ): void {
        const { S, ornaments } = gen;
        const echoPairs = 5;
        for (let i = 1; i <= echoPairs; i++) {
            const rawT = i / echoPairs;
            const easedT = 1 - Math.pow(1 - rawT, 1.15);
            const u = lerp(0.24, 0.88, easedT);
            const idx = Math.round(u * (echo.points.length - 1));
            const env = Math.sin(Math.pow(u, 0.70) * Math.PI);
            const pl = 66 * S * echoScale * (0.28 + env * 0.78);
            const ts = lerp(echo.t0, echo.t1, u) + 0.02;
            for (const side of [-1, 1] as const) {
                const jIdx = clamp(
                    idx + (side > 0 ? 0 : -1),
                    2,
                    echo.points.length - 2,
                );
                const actualLen = pl * (side > 0 ? 0.94 : 1.02);
                ornaments.push({
                    kind: "fernPinna",
                    ghost: true,
                    branch: echo,
                    idx: jIdx,
                    side,
                    angleOffset: side * lerp(0.84, 0.34, u),
                    len: actualLen,
                    width: actualLen * 0.105,
                    curve: side * -0.18,
                    inkWeight: i % 2 === 0 ? 0.76 : 0.96,
                    whip: side * 0.07,
                    feibai: false,
                    tint: i === echoPairs ? "sub" : "ink",
                    profile: i === 2 && side === 1,
                    t0: ts,
                    t1: ts + 0.24,
                    phase: u * 3.5 + side * 0.3,
                    push: 0,
                    vel: 0,
                });
            }
        }
        ornaments.push({
            kind: "fernPinna",
            ghost: true,
            branch: echo,
            idx: echo.points.length - 1,
            side: 1,
            angleOffset: 0.03,
            len: 42 * S * echoScale,
            width: 4.2 * S * echoScale,
            curve: -0.10,
            inkWeight: 0.92,
            whip: 0.06,
            feibai: false,
            tint: "sub",
            profile: false,
            t0: echo.t1 - 0.02,
            t1: echo.t1 + 0.22,
            phase: 4.2,
            push: 0,
            vel: 0,
        });
    },

    generateMain(gen: BotanicalSceneGenContext): void {
        const {
            w,
            h,
            S,
            isNarrow,
            archetype,
            rng,
            rand,
            rootX,
            rootY,
            branches,
            ornaments,
            rocks,
        } = gen;
        const fernScale = isNarrow ? 0.85 : 1;
        interface FernFrondConfig {
            ghost: boolean;
            role: "ghost" | "companion" | "hero";
            len: number;
            rx: number;
            tx: number;
            ty: number;
            pairs: number;
            pinnaBase: number;
            tipLen: number;
            t0: number;
            t1Span: number;
            c1x: number;
            c1y: number;
            c2x: number;
            c2y: number;
        }
        const configs: FernFrondConfig[] = isNarrow
            ? [
                {
                    ghost: true,
                    role: "ghost",
                    len: 265,
                    rx: 4,
                    tx: 118,
                    ty: 0.88,
                    pairs: 4,
                    pinnaBase: 54,
                    tipLen: 36,
                    t0: 0.10,
                    t1Span: 0.52,
                    c1x: 16,
                    c1y: 0.58,
                    c2x: 68,
                    c2y: 24,
                },
                {
                    ghost: false,
                    role: "hero",
                    len: 318,
                    rx: 18,
                    tx: 278,
                    ty: 0.66,
                    pairs: 6,
                    pinnaBase: 76,
                    tipLen: 54,
                    t0: 0.00,
                    t1Span: 0.54,
                    c1x: 24,
                    c1y: 0.56,
                    c2x: 96,
                    c2y: 34,
                },
            ]
            : [
                {
                    ghost: true,
                    role: "ghost",
                    len: 500,
                    rx: 8,
                    tx: 105,
                    ty: 0.93,
                    pairs: 4,
                    pinnaBase: 86,
                    tipLen: 56,
                    t0: 0.08,
                    t1Span: 0.52,
                    c1x: 16,
                    c1y: 0.60,
                    c2x: 78,
                    c2y: 32,
                },
                {
                    ghost: false,
                    role: "companion",
                    len: 555,
                    rx: 34,
                    tx: 190,
                    ty: 0.90,
                    pairs: 5,
                    pinnaBase: 102,
                    tipLen: 74,
                    t0: 0.10,
                    t1Span: 0.52,
                    c1x: 16,
                    c1y: 0.62,
                    c2x: 88,
                    c2y: 34,
                },
                {
                    ghost: false,
                    role: "hero",
                    len: archetype === 1 ? 670 : archetype === 2 ? 610 : 640,
                    rx: archetype === 1 ? 82 : archetype === 2 ? 112 : 96,
                    tx: archetype === 1 ? 445 : archetype === 2 ? 515 : 482,
                    ty: archetype === 1 ? 0.71 : archetype === 2 ? 0.61 : 0.66,
                    pairs: 6,
                    pinnaBase: 142,
                    tipLen: 94,
                    t0: 0.00,
                    t1Span: 0.54,
                    c1x: 42,
                    c1y: 0.58,
                    c2x: 182,
                    c2y: 62,
                },
            ];

        configs.forEach((cfg, ci) => {
            const len = cfg.len * S;
            const p0 = isNarrow
                ? {
                    x: rootX + 4 * S,
                    y: rootY + (ci === 0 ? -14 : 6) * S,
                }
                : {
                    x: rootX - cfg.rx * S,
                    y: rootY + 14 * S,
                };
            const p3 = {
                x: w - cfg.tx * S * rand(0.97, 1.03),
                y: (isNarrow ? rootY : h) - len * cfg.ty,
            };
            const p1 = {
                x: p0.x - cfg.c1x * S,
                y: p0.y - len * cfg.c1y,
            };
            const p2 = {
                x: p3.x + cfg.c2x * S,
                y: p3.y - cfg.c2y * S,
            };

            const frond = sampleBranch(
                p0,
                p1,
                p2,
                p3,
                {
                    steps: 46,
                    widthStart: (cfg.ghost ? 1.12 : 1.78) * S,
                    widthEnd: 0.40 * S,
                    t0: cfg.t0,
                    t1: cfg.t0 + cfg.t1Span,
                    flexSpan: 1.16,
                    phase: ci * 1.4,
                    waveLag: 1.9,
                    ghost: cfg.ghost,
                    wobble: 0.68 * S * fernScale,
                },
                rng,
            );
            branches.push(frond);

            const isHero = cfg.role === "hero";
            for (let i = 1; i <= cfg.pairs; i++) {
                const rawT = i / cfg.pairs;
                const easedT = 1 - Math.pow(1 - rawT, 1.15);
                const u = lerp(0.28, 0.90, easedT);
                const idx = Math.round(u * (frond.points.length - 1));
                const env = Math.sin(Math.pow(u, 0.68) * Math.PI);
                const pinnaLenBase = cfg.pinnaBase * S * (0.28 + env * 0.80);
                const ts = lerp(frond.t0, frond.t1, u) + 0.02;

                for (const side of [-1, 1] as const) {
                    const jIdx = clamp(
                        idx + (side > 0 ? 0 : -1),
                        2,
                        frond.points.length - 2,
                    );
                    const isUpperSide = side > 0;
                    const sideScale = isUpperSide ? 0.86 : 1.06;
                    const actualLen = pinnaLenBase * sideScale *
                        rand(0.94, 1.06);

                    // Five-shades-of-ink tonal contrast + restrained accent/sub highlights
                    const isFolded = !cfg.ghost &&
                        ((isHero && ((i === 2 && side === -1) ||
                            (i === 4 && side === 1) ||
                            (i === 5 && side === -1))) ||
                            (cfg.role === "companion" &&
                                ((i === 2 && side === 1) ||
                                    (i === 4 && side === -1))));
                    const isAccent = !cfg.ghost && isUpperSide &&
                        ((isHero && (i === 4 || i === 6)) ||
                            (cfg.role === "companion" && i === 4));
                    const isSub = !cfg.ghost && !isAccent &&
                        ((isHero && side === -1 && i === 5) ||
                            (cfg.role === "companion" && isUpperSide &&
                                i === 3));
                    const tint: TintRole = isAccent
                        ? "accent"
                        : isSub
                        ? "sub"
                        : "ink";

                    const inkWeight = cfg.role === "companion"
                        ? rand(0.68, 0.92)
                        : (i + (side > 0 ? 0 : 1)) % 2 === 0
                        ? rand(1.06, 1.24)
                        : rand(0.72, 0.88);

                    const angleSweep = lerp(0.84, 0.30, u) *
                        (isUpperSide ? 0.92 : 1.06);

                    ornaments.push({
                        kind: "fernPinna",
                        ghost: cfg.ghost,
                        branch: frond,
                        idx: jIdx,
                        side,
                        angleOffset: side * angleSweep,
                        len: actualLen,
                        width: actualLen * (isFolded ? 0.115 : 0.105),
                        curve: side * (-0.19 - (isUpperSide ? 0 : 0.05)),
                        inkWeight,
                        whip: side * (0.06 + (i % 2) * 0.04),
                        feibai: !cfg.ghost && !isFolded && actualLen >= 62 * S,
                        tint,
                        profile: isFolded,
                        t0: ts,
                        t1: ts + 0.26,
                        phase: u * 4.2 + side * 0.35 + ci * 0.7,
                        push: 0,
                        vel: 0,
                    });
                }
            }

            ornaments.push({
                kind: "fernPinna",
                ghost: cfg.ghost,
                branch: frond,
                idx: frond.points.length - 1,
                side: 1,
                angleOffset: 0.03,
                len: cfg.tipLen * S * fernScale,
                width: cfg.tipLen * 0.095 * S * fernScale,
                curve: -0.11,
                inkWeight: isHero ? 1.05 : 0.90,
                whip: 0.08,
                feibai: false,
                tint: cfg.ghost ? "sub" : "accent",
                profile: false,
                t0: frond.t1 - 0.04,
                t1: frond.t1 + 0.24,
                phase: ci + 2.4,
                push: 0,
                vel: 0,
            });
        });
        if (!isNarrow) {
            const fBaseX = rootX - 18 * S;
            const fBaseY = h + 8 * S;
            rocks.push(
                {
                    points: [
                        { x: fBaseX + 26 * S, y: fBaseY },
                        { x: fBaseX - 165 * S, y: fBaseY },
                        { x: fBaseX - 132 * S, y: fBaseY - 38 * S },
                        { x: fBaseX - 72 * S, y: fBaseY - 56 * S },
                        { x: fBaseX - 18 * S, y: fBaseY - 40 * S },
                        { x: fBaseX + 26 * S, y: fBaseY - 22 * S },
                    ],
                    mossDots: [
                        {
                            x: fBaseX - 122 * S,
                            y: fBaseY - 36 * S,
                            rx: 4.2 * S,
                            ry: 1.9 * S,
                            rot: -0.25,
                        },
                        {
                            x: fBaseX - 74 * S,
                            y: fBaseY - 54 * S,
                            rx: 3.6 * S,
                            ry: 1.6 * S,
                            rot: -0.1,
                        },
                        {
                            x: fBaseX - 62 * S,
                            y: fBaseY - 49 * S,
                            rx: 2.5 * S,
                            ry: 1.2 * S,
                            rot: 0.15,
                        },
                    ],
                    t0: 0.0,
                    t1: 0.28,
                },
            );
        }
    },

    buildAnchors(
        gen: BotanicalSceneGenContext,
        fgBranches: readonly BranchData[],
        fireflies: readonly FireflySeed[],
    ): {
        visitorAnchor: BotanicalVisitorAnchor | null;
        rewardAnchor: BotanicalRewardAnchor | null;
    } {
        const { S, branches, ornaments } = gen;
        let visitorAnchor: BotanicalVisitorAnchor | null = null;
        let rewardAnchor: BotanicalRewardAnchor | null = null;
        const heroOrn =
            ornaments.find((o): o is FernPinnaOrnament =>
                o.kind === "fernPinna" && !o.ghost && !o.profile &&
                o.len >= 50 * S
            ) ?? ornaments.find((o): o is FernPinnaOrnament =>
                o.kind === "fernPinna" && !o.ghost
            );
        const perchBranch = heroOrn?.branch ??
            fgBranches[fgBranches.length - 1] ??
            branches[0];
        const perchIdx = heroOrn?.idx ??
            Math.max(1, Math.round((perchBranch.points.length - 1) * 0.65));
        const ang = (perchBranch.points[perchIdx]?.angle ?? -1.2) +
            (heroOrn?.angleOffset ?? -0.5);
        let tipOffsetX: number;
        let tipOffsetY: number;
        if (heroOrn) {
            const t = 0.96;
            const foldKick = heroOrn.profile
                ? Math.sin((t - 0.44) * Math.PI * 1.1) * heroOrn.len * 0.04 *
                    heroOrn.side
                : 0;
            const lx = t * heroOrn.len;
            const ly = heroOrn.curve * heroOrn.len * Math.pow(t, 1.55) +
                heroOrn.whip * heroOrn.len * Math.sin(t * Math.PI) * t +
                foldKick;
            tipOffsetX = lx * Math.cos(ang) - ly * Math.sin(ang);
            tipOffsetY = lx * Math.sin(ang) + ly * Math.cos(ang);
        } else {
            tipOffsetX = Math.cos(ang) * 64 * S;
            tipOffsetY = Math.sin(ang) * 64 * S;
        }
        visitorAnchor = {
            kind: "dew-or-firefly",
            branch: perchBranch,
            idx: perchIdx,
            tipOffsetX,
            tipOffsetY,
            ornament: heroOrn,
            fireflies,
        };
        const heroBranch = fgBranches[fgBranches.length - 1] ?? branches[0];
        rewardAnchor = {
            kind: "fern",
            branch: heroBranch,
            idx: Math.max(1, heroBranch.points.length - 1),
            budIndices: [],
        };
        return { visitorAnchor, rewardAnchor };
    },

    drawOrnament(
        ctx: CanvasRenderingContext2D,
        o: BotanicalOrnament,
        wx: number,
        wy: number,
        angle: number,
        op: number,
        pal: BotanicalPalette,
        layerA: number,
    ): void {
        if (o.kind !== "fernPinna") return;
        drawFernPinna(ctx, wx, wy, angle, o, op, pal, layerA);
    },

    traceDrifterPath(ctx: CanvasRenderingContext2D, size: number): void {
        const s = size * 1.25;
        ctx.beginPath();
        ctx.moveTo(-s * 0.72, 0);
        ctx.bezierCurveTo(
            -s * 0.2,
            -s * 0.34,
            s * 0.38,
            -s * 0.22,
            s * 0.82,
            -s * 0.14,
        );
        ctx.bezierCurveTo(
            s * 0.36,
            s * 0.18,
            -s * 0.2,
            s * 0.28,
            -s * 0.72,
            0,
        );
        ctx.closePath();
    },

    drawReward(
        ctx: CanvasRenderingContext2D,
        scene: BotanicalScene,
        _reward: BotanicalRewardAnchor,
        tipPt: WorldSample,
        bloomP: number,
        pal: BotanicalPalette,
    ): void {
        const s = scene.scale;
        // Fern spiral fiddlehead crozier at hero tip
        ctx.save();
        ctx.translate(tipPt.x, tipPt.y);
        ctx.rotate(tipPt.angle);
        const r = 10 * s * bloomP;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(
            14 * s * bloomP,
            -2 * s * bloomP,
            18 * s * bloomP,
            -16 * s * bloomP,
            8 * s * bloomP,
            -16 * s * bloomP,
        );
        ctx.bezierCurveTo(
            2 * s * bloomP,
            -16 * s * bloomP,
            2 * s * bloomP,
            -8 * s * bloomP,
            8 * s * bloomP,
            -9 * s * bloomP,
        );
        ctx.strokeStyle = pal.stroke("accent", 0.88 * bloomP);
        ctx.lineWidth = Math.max(1.0, 1.65 * s);
        ctx.lineCap = "round";
        ctx.stroke();
        const glow = ctx.createRadialGradient(
            8 * s * bloomP,
            -11 * s * bloomP,
            0.5,
            8 * s * bloomP,
            -11 * s * bloomP,
            Math.max(2, r * 1.4),
        );
        glow.addColorStop(0, pal.wash("accent", 0.45 * bloomP));
        glow.addColorStop(1, pal.fill("accent", 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(
            8 * s * bloomP,
            -11 * s * bloomP,
            Math.max(2, r * 1.4),
            0,
            Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();
    },
};
