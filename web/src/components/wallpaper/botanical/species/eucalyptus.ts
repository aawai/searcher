import { clamp, easeOutCubic, lerp, sampleBranch } from "../physics.ts";
import { strokeGongbiOutline, strokeWaterline } from "../strokes.ts";
import type {
    BotanicalOrnament,
    BotanicalPalette,
    BotanicalRewardAnchor,
    BotanicalScene,
    BotanicalSceneGenContext,
    BotanicalSpeciesModule,
    BotanicalVisitorAnchor,
    BranchData,
    EucalyptusOrnament,
    FireflySeed,
    TintRole,
    WorldSample,
} from "../types.ts";

function drawEucalyptusLeaf(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: EucalyptusOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const stemP = easeOutCubic(clamp(p / 0.22, 0, 1));
    const washP = easeOutCubic(clamp((p - 0.14) / 0.56, 0, 1));
    const detailP = easeOutCubic(clamp((p - 0.42) / 0.58, 0, 1));
    if (stemP <= 0.01) return;

    const rx = o.rx;
    const ry = o.ry;
    const stem = o.stemLen * stemP;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(stem, 0);
    ctx.strokeStyle = pal.stroke("ink", 0.72 * layerA);
    ctx.lineWidth = o.ghost ? 0.65 : 0.95;
    ctx.lineCap = "round";
    ctx.stroke();

    if (washP <= 0.01) {
        ctx.restore();
        return;
    }
    ctx.translate(o.stemLen, 0);

    const traceLeaf = () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        if (o.profile) {
            ctx.bezierCurveTo(
                rx * 0.28,
                -ry * 1.38,
                rx * 1.32,
                -ry * 0.86,
                rx * 1.66,
                -ry * 0.18,
            );
            ctx.bezierCurveTo(rx * 1.24, ry * 0.44, rx * 0.35, ry * 0.50, 0, 0);
        } else {
            ctx.bezierCurveTo(
                rx * 0.12,
                -ry * 1.08,
                rx * 1.38,
                -ry * 1.04,
                rx * 1.68,
                0,
            );
            ctx.bezierCurveTo(rx * 1.38, ry * 1.04, rx * 0.12, ry * 1.08, 0, 0);
        }
        ctx.closePath();
    };

    // Mokuhanga watercolor wash with translucent edge + capillary waterline
    const cx = rx * 0.66;
    const cy = o.profile ? -ry * 0.24 : -ry * 0.08;
    const grad = ctx.createRadialGradient(
        cx,
        cy,
        Math.max(1, ry * 0.12),
        rx * 0.84,
        0,
        Math.max(2, rx * 1.12),
    );
    grad.addColorStop(0, pal.wash(o.tint, 1.34 * washP * layerA));
    grad.addColorStop(0.58, pal.fill(o.tint, 1.10 * washP * layerA));
    grad.addColorStop(1, pal.fill(o.tint, 0.32 * washP * layerA));
    traceLeaf();
    ctx.fillStyle = grad;
    ctx.fill();
    if (!o.ghost && washP > 0.35) {
        strokeWaterline(ctx, o.tint, pal, 1, 0.56 * washP * layerA, rx * 1.4);
        traceLeaf();
        strokeGongbiOutline(ctx, o.tint, pal, washP * layerA, 0.68);
    }

    if (!o.ghost) {
        const coreGrad = ctx.createRadialGradient(
            rx * 0.56,
            cy * 1.2,
            0.5,
            rx * 0.68,
            cy * 0.5,
            Math.max(2, rx * 0.72),
        );
        coreGrad.addColorStop(0, pal.wash(o.tint, 0.85 * washP * layerA));
        coreGrad.addColorStop(0.6, pal.fill(o.tint, 0.45 * washP * layerA));
        coreGrad.addColorStop(1, pal.fill(o.tint, 0));
        traceLeaf();
        ctx.fillStyle = coreGrad;
        ctx.fill();

        // 尤加利银霜云母粉白微晕与伴色侧翼轻染
        const frostGrad = ctx.createRadialGradient(
            rx * 0.82,
            cy * 0.4,
            0.5,
            rx * 0.90,
            0,
            Math.max(2, rx * 0.85),
        );
        frostGrad.addColorStop(
            0,
            pal.luminous((pal.isDark ? 0.14 : 0.26) * washP * layerA),
        );
        frostGrad.addColorStop(
            0.65,
            pal.wash(
                o.tint === "sub" ? "accent" : "sub",
                0.20 * washP * layerA,
            ),
        );
        frostGrad.addColorStop(1, pal.luminous(0));
        traceLeaf();
        ctx.fillStyle = frostGrad;
        ctx.fill();
    }

    // Crisp calligraphic midrib only
    if (detailP > 0.02) {
        ctx.strokeStyle = pal.stroke("ink", 0.58 * detailP * layerA);
        ctx.lineWidth = o.ghost ? 0.45 : 0.78;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(1, 0);
        if (o.profile) {
            ctx.quadraticCurveTo(
                rx * 0.72,
                -ry * 0.28,
                rx * 1.44 * detailP,
                -ry * 0.16 * detailP,
            );
        } else {
            ctx.lineTo(rx * 1.42 * detailP, 0);
        }
        ctx.stroke();
    }
    ctx.restore();
}

export const eucalyptusSpecies: BotanicalSpeciesModule = {
    species: "eucalyptus",

    populateEchoOrnaments(
        gen: BotanicalSceneGenContext,
        echo: BranchData,
        echoScale: number,
    ): void {
        const { S, rand, ornaments } = gen;
        const us = [0.34, 0.56, 0.76, 0.95];
        us.forEach((u, i) => {
            const idx = Math.round(u * (echo.points.length - 1));
            const sz = lerp(23, 12, i / 3) * S * echoScale;
            for (const side of [-1, 1] as const) {
                if (i === 3 && side === -1) continue;
                ornaments.push({
                    kind: "eucalyptus",
                    ghost: true,
                    branch: echo,
                    idx,
                    angleOffset: i === 3 ? 0.08 : side * 0.85,
                    rx: sz,
                    ry: sz * (i === 1 ? 0.55 : 0.82),
                    stemLen: 5 * S * echoScale,
                    tint: i === 2 && side === 1 ? "sub" : "ink",
                    profile: i === 1 && side === -1,
                    t0: lerp(echo.t0, echo.t1, u) + 0.04,
                    t1: lerp(echo.t0, echo.t1, u) + 0.28,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            }
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
        } = gen;
        const eucLeafScale = isNarrow ? 0.86 : 1;
        const configs = isNarrow
            ? [
                {
                    ghost: true,
                    len: 255,
                    rx: 4,
                    tx: 135,
                    ty: 0.86,
                    count: 6,
                    t0: 0.12,
                },
                {
                    ghost: false,
                    len: 310,
                    rx: 14,
                    tx: 255,
                    ty: 0.72,
                    count: 8,
                    t0: 0.00,
                },
            ]
            : [
                {
                    ghost: true,
                    len: 460,
                    rx: 42,
                    tx: 130,
                    ty: 0.92,
                    count: 8,
                    t0: 0.10,
                },
                {
                    ghost: false,
                    len: archetype === 1 ? 680 : archetype === 2 ? 600 : 645,
                    rx: archetype === 1 ? 68 : archetype === 2 ? 124 : 98,
                    tx: archetype === 1 ? 410 : archetype === 2 ? 475 : 445,
                    ty: archetype === 1 ? 0.78 : archetype === 2 ? 0.66 : 0.72,
                    count: 10,
                    t0: 0.00,
                },
                {
                    ghost: false,
                    len: 500,
                    rx: 58,
                    tx: 225,
                    ty: 0.88,
                    count: 8,
                    t0: 0.14,
                },
            ];

        configs.forEach((cfg, ci) => {
            const len = cfg.len * S;
            const p0 = isNarrow
                ? {
                    x: rootX + 4 * S,
                    y: rootY + (ci === 0 ? -18 : 6) * S,
                }
                : {
                    x: rootX - cfg.rx * S,
                    y: rootY + 12 * S,
                };
            const p3 = {
                x: w - cfg.tx * S * rand(0.95, 1.05),
                y: (isNarrow ? rootY : h) - len * cfg.ty,
            };
            const p1 = {
                x: p0.x - (isNarrow ? rand(28, 48) : rand(45, 80)) * S,
                y: p0.y - len * 0.45,
            };
            const p2 = {
                x: p3.x + (isNarrow ? rand(75, 110) : rand(125, 180)) * S,
                y: p3.y - (isNarrow ? rand(10, 24) : rand(16, 42)) * S,
            };

            const stem = sampleBranch(
                p0,
                p1,
                p2,
                p3,
                {
                    steps: 44,
                    widthStart: (cfg.ghost ? 1.25 : isNarrow ? 2.15 : 2.75) * S,
                    widthEnd: 0.48 * S,
                    t0: cfg.t0,
                    t1: cfg.t0 + 0.52,
                    flexSpan: 1.12,
                    phase: ci * 1.4,
                    ghost: cfg.ghost,
                    wobble: 1.1 * S * eucLeafScale,
                },
                rng,
            );
            branches.push(stem);

            for (let i = 1; i <= cfg.count; i++) {
                const rawT = i / cfg.count;
                const easedT = 1 - Math.pow(1 - rawT, 1.32);
                const u = lerp(0.18, 0.94, easedT);
                const idx = Math.round(u * (stem.points.length - 1));
                const env = Math.sin(u * Math.PI * 0.82 + 0.25);
                const sz = lerp(29, 12.5, Math.pow(u, 1.15)) * S *
                    eucLeafScale *
                    (0.86 + env * 0.24);

                for (const side of [-1, 1] as const) {
                    if (i === 1 && side === 1) continue;
                    const jIdx = clamp(
                        idx + (side > 0 ? 0 : -2),
                        2,
                        stem.points.length - 1,
                    );
                    const ts = lerp(stem.t0, stem.t1, u) + 0.03;
                    const tint: TintRole =
                        (i === cfg.count - 1 && side === 1) ||
                            (ci === 1 && i === 4 && side === -1)
                            ? "accent"
                            : i % 3 === 0 && side === 1
                            ? "sub"
                            : "ink";
                    const isProfile = (i + (side > 0 ? 1 : 0)) % 3 === 0;
                    ornaments.push({
                        kind: "eucalyptus",
                        ghost: cfg.ghost,
                        branch: stem,
                        idx: jIdx,
                        angleOffset: side * rand(0.68, 1.08),
                        rx: sz * rand(0.90, 1.10),
                        ry: sz *
                            (isProfile ? rand(0.42, 0.54) : rand(0.78, 0.96)),
                        stemLen: rand(5, 9) * S * eucLeafScale,
                        tint,
                        profile: isProfile,
                        t0: ts,
                        t1: ts + 0.30,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                }
            }
            ornaments.push({
                kind: "eucalyptus",
                ghost: cfg.ghost,
                branch: stem,
                idx: stem.points.length - 1,
                angleOffset: rand(-0.1, 0.1),
                rx: 12 * S * eucLeafScale,
                ry: 9 * S * eucLeafScale,
                stemLen: 3 * S * eucLeafScale,
                tint: "accent",
                profile: false,
                t0: stem.t1,
                t1: stem.t1 + 0.28,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });
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
        const eucOrn =
            ornaments.find((o): o is EucalyptusOrnament =>
                o.kind === "eucalyptus" && !o.ghost && !o.profile
            ) ?? ornaments.find((o): o is EucalyptusOrnament =>
                o.kind === "eucalyptus" && !o.ghost
            );
        const perchBranch = eucOrn?.branch ?? fgBranches[0] ?? branches[0];
        const perchIdx = eucOrn?.idx ??
            Math.max(1, Math.round((perchBranch.points.length - 1) * 0.65));
        const ang = (perchBranch.points[perchIdx]?.angle ?? -1.4) +
            (eucOrn?.angleOffset ?? 0.7);
        const lx = eucOrn ? eucOrn.stemLen + eucOrn.rx * 1.66 : 32 * S;
        const ly = eucOrn && eucOrn.profile ? -eucOrn.ry * 0.18 : 0;
        visitorAnchor = {
            kind: "dew-or-firefly",
            branch: perchBranch,
            idx: perchIdx,
            tipOffsetX: lx * Math.cos(ang) - ly * Math.sin(ang),
            tipOffsetY: lx * Math.sin(ang) + ly * Math.cos(ang),
            ornament: eucOrn,
            fireflies,
        };
        const mainBranch = fgBranches[0] ?? branches[0];
        rewardAnchor = {
            kind: "eucalyptus",
            branch: mainBranch,
            idx: Math.max(1, mainBranch.points.length - 1),
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
        if (o.kind !== "eucalyptus") return;
        drawEucalyptusLeaf(ctx, wx, wy, angle, o, op, pal, layerA);
    },

    traceDrifterPath(ctx: CanvasRenderingContext2D, size: number): void {
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.88, size * 0.54, 0, 0, Math.PI * 2);
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
        const rays = 14;
        const rLen = 16 * s * bloomP;
        ctx.save();
        ctx.translate(tipPt.x, tipPt.y);
        for (let i = 0; i < rays; i++) {
            const a = (i / rays) * Math.PI * 2 + 0.2;
            const ex = Math.cos(a) * rLen;
            const ey = Math.sin(a) * rLen;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = pal.stroke("accent", 0.72 * bloomP);
            ctx.lineWidth = Math.max(0.55, 0.75 * s);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(ex, ey, Math.max(0.9, 1.4 * s * bloomP), 0, Math.PI * 2);
            ctx.fillStyle = pal.stroke("accent", 0.9 * bloomP);
            ctx.fill();
        }
        ctx.restore();
    },
};
