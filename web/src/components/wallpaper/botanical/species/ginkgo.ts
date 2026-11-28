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
    FireflySeed,
    GinkgoOrnament,
    TintRole,
    WorldSample,
} from "../types.ts";

function drawGinkgoLeaf(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: GinkgoOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const stemP = easeOutCubic(clamp(p / 0.24, 0, 1));
    const washP = easeOutCubic(clamp((p - 0.14) / 0.58, 0, 1));
    const detailP = easeOutCubic(clamp((p - 0.45) / 0.55, 0, 1));
    if (stemP <= 0.01) return;

    const s = o.size;
    const stem = o.stemLen * stemP;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Calligraphic stem
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(stem * 0.5, -stem * 0.14, stem, 0);
    ctx.strokeStyle = pal.stroke("ink", 0.78 * layerA);
    ctx.lineWidth = o.ghost ? 0.65 : 1.05;
    ctx.lineCap = "round";
    ctx.stroke();

    if (washP <= 0.01) {
        ctx.restore();
        return;
    }
    ctx.translate(o.stemLen, 0);

    const spreadL = o.profile ? -0.54 : -0.92;
    const spreadR = o.profile ? 0.78 : 0.92;
    const lx = Math.cos(spreadL) * s;
    const ly = Math.sin(spreadL) * s;
    const rx = Math.cos(spreadR) * s;
    const ry = Math.sin(spreadR) * s;
    const midX = s * (1 - o.notch);
    const midY = o.profile ? s * 0.08 : 0;

    // 银杏真叶双裂扇缘（两侧略带微波裂）
    const traceFan = () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(lx * 0.5, ly * 0.42, lx, ly);
        ctx.bezierCurveTo(
            s * 0.96,
            ly * 0.94,
            s * 1.09,
            ly * 0.52,
            s * 0.99,
            ly * 0.34,
        );
        ctx.bezierCurveTo(
            s * 1.07,
            ly * 0.22,
            s * 1.04,
            ly * 0.08,
            midX,
            midY,
        );
        ctx.bezierCurveTo(
            s * 1.04,
            ry * 0.08,
            s * 1.07,
            ry * 0.22,
            s * 0.99,
            ry * 0.34,
        );
        ctx.bezierCurveTo(
            s * 1.09,
            ry * 0.52,
            s * 0.96,
            ry * 0.94,
            rx,
            ry,
        );
        ctx.quadraticCurveTo(rx * 0.5, ry * 0.42, 0, 0);
        ctx.closePath();
    };

    // Mokuhanga off-register under-wash
    if (!o.ghost) {
        ctx.save();
        ctx.translate(1.1, 0.8);
        traceFan();
        ctx.fillStyle = pal.fill(o.tint, 0.42 * washP * layerA);
        ctx.fill();
        ctx.restore();
    }

    // 撞水撞色主晕染
    const rOuter = Math.max(2, s * 1.15);
    const grad = ctx.createRadialGradient(
        s * 0.14,
        0,
        Math.max(1, s * 0.08),
        s * 0.2,
        0,
        rOuter,
    );
    grad.addColorStop(0, pal.wash(o.tint, 1.30 * washP * layerA));
    grad.addColorStop(0.55, pal.fill(o.tint, 1.10 * washP * layerA));
    grad.addColorStop(1, pal.fill(o.tint, 0.36 * washP * layerA));
    traceFan();
    ctx.fillStyle = grad;
    ctx.fill();

    // 叶柄向扇心撞水伴色晕染（金叶透苍翠 / 墨叶边缘泛微金）
    if (!o.ghost) {
        const companionTint: TintRole = "sub";
        const chargeGrad = ctx.createRadialGradient(
            o.tint === "ink" ? s * 0.84 : s * 0.12,
            0,
            0.5,
            o.tint === "ink" ? s * 0.74 : s * 0.24,
            0,
            Math.max(2, s * 0.72),
        );
        chargeGrad.addColorStop(
            0,
            pal.wash(
                companionTint,
                (o.tint === "ink" ? 0.44 : 0.65) * washP * layerA,
            ),
        );
        chargeGrad.addColorStop(1, pal.fill(companionTint, 0));
        traceFan();
        ctx.fillStyle = chargeGrad;
        ctx.fill();
    }

    if (!o.ghost && washP > 0.35) {
        strokeWaterline(ctx, o.tint, pal, 1, 0.66 * washP * layerA, s);
        traceFan();
        strokeGongbiOutline(ctx, o.tint, pal, washP * layerA, 0.72);
    }

    // Boneless side-brush splash 2: slightly offset overlapping brushstroke
    if (!o.ghost) {
        ctx.save();
        ctx.rotate(0.065 * Math.sin(o.phase * 2.1 + 0.7));
        ctx.scale(0.92, 0.94);
        traceFan();
        ctx.fillStyle = pal.wash(o.tint, 0.56 * washP * layerA);
        ctx.fill();
        ctx.restore();
    }

    // 9–11 条极细二叉放射扇脉
    if (detailP > 0.02) {
        const veins = o.profile ? 6 : 10;
        ctx.strokeStyle = pal.stroke("ink", 0.46 * detailP * layerA);
        ctx.lineCap = "round";
        for (let i = 0; i < veins; i++) {
            const frac = i / (veins - 1);
            const va = lerp(spreadL * 0.80, spreadR * 0.80, frac);
            const rLen = s *
                (0.54 + 0.30 * Math.abs(Math.sin(o.phase + i * 1.1))) * detailP;
            const mx = Math.cos(va + 0.03) * rLen * 0.52;
            const my = Math.sin(va + 0.03) * rLen * 0.52;
            ctx.beginPath();
            ctx.moveTo(1.5, 0);
            ctx.quadraticCurveTo(
                mx,
                my,
                Math.cos(va) * rLen,
                Math.sin(va) * rLen,
            );
            ctx.lineWidth = i % 2 === 0 ? 0.50 : 0.36;
            ctx.stroke();

            if (!o.ghost && i % 2 === 0 && rLen > 14) {
                const forkA = va + (frac < 0.5 ? -0.14 : 0.14);
                ctx.beginPath();
                ctx.moveTo(mx, my);
                ctx.lineTo(
                    Math.cos(forkA) * rLen * 0.94,
                    Math.sin(forkA) * rLen * 0.94,
                );
                ctx.lineWidth = 0.34;
                ctx.stroke();
            }
        }
    }
    ctx.restore();
}

export const ginkgoSpecies: BotanicalSpeciesModule = {
    species: "ginkgo",

    populateEchoOrnaments(
        gen: BotanicalSceneGenContext,
        echo: BranchData,
        echoScale: number,
    ): void {
        const { S, rand, ornaments } = gen;
        const echoLeaves: ReadonlyArray<{
            u: number;
            ang: number;
            sz: number;
            tint: TintRole;
            profile: boolean;
        }> = [
            { u: 0.42, ang: 0.65, sz: 34, tint: "ink", profile: true },
            { u: 0.72, ang: -0.58, sz: 38, tint: "sub", profile: false },
            { u: 0.98, ang: 0.18, sz: 32, tint: "ink", profile: false },
        ];
        for (const lf of echoLeaves) {
            const idx = Math.round(lf.u * (echo.points.length - 1));
            ornaments.push({
                kind: "ginkgo",
                ghost: true,
                branch: echo,
                idx,
                angleOffset: lf.ang,
                size: lf.sz * S * echoScale,
                notch: 0.22,
                stemLen: 12 * S * echoScale,
                tint: lf.tint,
                profile: lf.profile,
                t0: lerp(echo.t0, echo.t1, lf.u) + 0.04,
                t1: lerp(echo.t0, echo.t1, lf.u) + 0.34,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        }
    },

    generateMain(gen: BotanicalSceneGenContext): void {
        const {
            w,
            h,
            S,
            isNarrow,
            archetype,
            solar,
            rng,
            rand,
            rootX,
            rootY,
            branches,
            ornaments,
        } = gen;
        const ginkgoLeafScale = isNarrow ? 0.84 : 1;
        const g0 = isNarrow
            ? { x: rootX - 6 * S, y: rootY - 26 * S }
            : { x: rootX - 10 * S, y: rootY - 70 * S };
        const g3 = isNarrow
            ? {
                x: w - rand(105, 138) * S,
                y: rootY - rand(195, 225) * S,
            }
            : {
                x: w - rand(160, 215) * S,
                y: h - rand(460, 525) * S,
            };
        const ghost = sampleBranch(
            g0,
            {
                x: g0.x - (isNarrow ? 28 : 45) * S,
                y: g0.y - (isNarrow ? 105 : 195) * S,
            },
            {
                x: g3.x + (isNarrow ? 42 : 68) * S,
                y: g3.y + (isNarrow ? 65 : 115) * S,
            },
            g3,
            {
                steps: 28,
                widthStart: (isNarrow ? 1.1 : 1.25) * S,
                widthEnd: 0.45 * S,
                t0: 0.08,
                t1: 0.52,
                flexSpan: 1.05,
                phase: 1.8,
                ghost: true,
                wobble: 1.3 * S * ginkgoLeafScale,
            },
            rng,
        );
        branches.push(ghost);
        [0.52, 0.78, 1.0].forEach((u, i) => {
            const idx = Math.round(u * (ghost.points.length - 1));
            ornaments.push({
                kind: "ginkgo",
                ghost: true,
                branch: ghost,
                idx,
                angleOffset: i % 2 === 0 ? -0.62 : 0.52,
                size: rand(35, 43) * S * ginkgoLeafScale,
                notch: rand(0.18, 0.28),
                stemLen: rand(12, 18) * S * ginkgoLeafScale,
                tint: i === 2 ? "sub" : "ink",
                profile: i === 1,
                t0: lerp(ghost.t0, ghost.t1, u) + 0.05,
                t1: lerp(ghost.t0, ghost.t1, u) + 0.34,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });

        const mainLen =
            (isNarrow
                ? 250
                : archetype === 1
                ? 635
                : archetype === 2
                ? 545
                : 590) * S;
        const p0 = isNarrow ? { x: rootX + 4 * S, y: rootY } : {
            x: rootX -
                rand(
                        archetype === 2 ? 78 : 52,
                        archetype === 2 ? 120 : 95,
                    ) * S,
            y: rootY,
        };
        const p3 = isNarrow
            ? {
                x: w - rand(225, 260) * S,
                y: rootY - rand(195, 225) * S,
            }
            : {
                x: w -
                    rand(
                            archetype === 1 ? 265 : 300,
                            archetype === 1 ? 335 : 375,
                        ) * S,
                y: h - mainLen * rand(0.75, 0.85),
            };
        const p1 = {
            x: p0.x - (isNarrow ? rand(24, 48) : rand(42, 84)) * S,
            y: p0.y - mainLen * 0.34,
        };
        const p2 = {
            x: p3.x + (isNarrow ? rand(48, 78) : rand(84, 136)) * S,
            y: p3.y + mainLen * 0.26,
        };

        const main = sampleBranch(
            p0,
            p1,
            p2,
            p3,
            {
                steps: 40,
                widthStart: (isNarrow ? 3.8 : 6.6) * S,
                widthEnd: 0.70 * S,
                t0: 0.0,
                t1: 0.46,
                flexSpan: 0.95,
                phase: 0,
                wobble: 1.4 * S * ginkgoLeafScale,
            },
            rng,
        );
        branches.push(main);

        const subs = isNarrow
            ? [
                { u: 0.28, dir: -1, len: 128 * S, lift: 68 * S },
                { u: 0.48, dir: 1, len: 106 * S, lift: 72 * S },
                { u: 0.66, dir: -1, len: 96 * S, lift: 52 * S },
                { u: 0.82, dir: 1, len: 72 * S, lift: 44 * S },
            ]
            : [
                { u: 0.28, dir: -1, len: 215 * S, lift: 115 * S },
                { u: 0.48, dir: 1, len: 180 * S, lift: 120 * S },
                { u: 0.66, dir: -1, len: 168 * S, lift: 85 * S },
                { u: 0.82, dir: 1, len: 118 * S, lift: 72 * S },
            ];
        const isLateAutumnGinkgo = solar.termIndex >= 18 ||
            solar.termIndex <= 1;
        const isEarlyAutumnGinkgo = solar.termIndex >= 14 &&
            solar.termIndex <= 17;
        const subTints:
            readonly (readonly [TintRole, TintRole, TintRole, TintRole])[] =
                isLateAutumnGinkgo
                    ? [
                        ["accent", "sub", "accent", "ink"],
                        ["sub", "accent", "accent", "sub"],
                        ["accent", "ink", "accent", "sub"],
                        ["sub", "accent", "ink", "accent"],
                    ]
                    : isEarlyAutumnGinkgo
                    ? [
                        ["accent", "ink", "sub", "ink"],
                        ["sub", "ink", "accent", "ink"],
                        ["ink", "sub", "accent", "ink"],
                        ["sub", "accent", "ink", "sub"],
                    ]
                    : [
                        ["ink", "ink", "sub", "ink"],
                        ["sub", "ink", "ink", "ink"],
                        ["ink", "ink", "accent", "ink"],
                        ["ink", "sub", "ink", "ink"],
                    ];

        subs.forEach((cfg, si) => {
            const bi = Math.round(cfg.u * (main.points.length - 1));
            const anc = main.points[bi];
            const ang = anc.angle + cfg.dir * rand(0.42, 0.66);
            const sp0 = { x: anc.x, y: anc.y };
            const sp3 = {
                x: anc.x + Math.cos(ang) * cfg.len,
                y: anc.y + Math.sin(ang) * cfg.len - cfg.lift * 0.25,
            };
            const sp1 = {
                x: lerp(sp0.x, sp3.x, 0.36) + cfg.dir * 13 * S,
                y: lerp(sp0.y, sp3.y, 0.36) - 18 * S,
            };
            const sp2 = {
                x: lerp(sp0.x, sp3.x, 0.72),
                y: lerp(sp0.y, sp3.y, 0.72) - 10 * S,
            };
            const ts = lerp(main.t0, main.t1, cfg.u);
            const sub = sampleBranch(
                sp0,
                sp1,
                sp2,
                sp3,
                {
                    steps: 24,
                    widthStart: (isNarrow ? 1.65 : 2.35) * S,
                    widthEnd: 0.52 * S,
                    t0: ts,
                    t1: ts + 0.24,
                    flexSpan: 0.55,
                    phase: 0.7 + si * 0.8,
                    wobble: 1.0 * S,
                    parentRef: { branch: main, idx: bi },
                },
                rng,
            );
            branches.push(sub);

            const tSet = subTints[si];
            const clusters = [
                {
                    u: 0.54,
                    leaves: [
                        {
                            ang: cfg.dir * 0.76,
                            sz: 42,
                            tint: tSet[0],
                            profile: false,
                        },
                        {
                            ang: cfg.dir * 0.34,
                            sz: 34,
                            tint: tSet[1],
                            profile: true,
                        },
                        ...(si === 1 || si === 2
                            ? [{
                                ang: cfg.dir * 0.12,
                                sz: 27,
                                tint: tSet[2],
                                profile: false,
                            }]
                            : []),
                    ],
                },
                {
                    u: 0.96,
                    leaves: [
                        { ang: -0.22, sz: 46, tint: tSet[2], profile: false },
                        {
                            ang: 0.42,
                            sz: 37,
                            tint: tSet[3],
                            profile: si % 2 === 0,
                        },
                        ...(si === 0 || si === 1
                            ? [{
                                ang: 0.08,
                                sz: 30,
                                tint: tSet[0],
                                profile: true,
                            }]
                            : []),
                    ],
                },
            ];
            for (const cl of clusters) {
                const lIdx = Math.round(cl.u * (sub.points.length - 1));
                const lt = lerp(sub.t0, sub.t1, cl.u) + 0.03;
                cl.leaves.forEach((lf, li) => {
                    ornaments.push({
                        kind: "ginkgo",
                        ghost: false,
                        branch: sub,
                        idx: lIdx,
                        angleOffset: lf.ang + rand(-0.08, 0.08),
                        size: lf.sz * rand(0.92, 1.08) * S * ginkgoLeafScale,
                        notch: rand(0.18, 0.28),
                        stemLen: rand(12, 19) * S * ginkgoLeafScale,
                        tint: lf.tint,
                        profile: lf.profile,
                        t0: lt + li * 0.05,
                        t1: lt + 0.36 + li * 0.05,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                });
            }
        });

        // 银杏短枝簇生（主干中段加厚画眼，桌面端向上抽一枝探空瘦梢）
        if (!isNarrow) {
            const spurIdx = Math.round(0.62 * (main.points.length - 1));
            const spurT = lerp(main.t0, main.t1, 0.62) + 0.05;
            const spurLeafTints: readonly TintRole[] = isLateAutumnGinkgo
                ? ["accent", "sub", "accent"]
                : isEarlyAutumnGinkgo
                ? ["sub", "accent", "ink"]
                : ["ink", "sub", "ink"];
            [-0.72, -0.34, 0.36].forEach((ang, li) => {
                ornaments.push({
                    kind: "ginkgo",
                    ghost: false,
                    branch: main,
                    idx: spurIdx,
                    angleOffset: ang,
                    size: (32 + li * 4) * S,
                    notch: 0.22,
                    stemLen: (13 + li * 2) * S,
                    tint: spurLeafTints[li],
                    profile: li === 1,
                    t0: spurT + li * 0.04,
                    t1: spurT + 0.34 + li * 0.04,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            });

            const skyIdx = Math.round(0.76 * (main.points.length - 1));
            const skyAnc = main.points[skyIdx];
            const skyEnd = {
                x: skyAnc.x - 95 * S,
                y: Math.max(54, skyAnc.y - 165 * S),
            };
            const skyTwig = sampleBranch(
                { x: skyAnc.x, y: skyAnc.y },
                {
                    x: lerp(skyAnc.x, skyEnd.x, 0.42) + 12 * S,
                    y: lerp(skyAnc.y, skyEnd.y, 0.42) - 18 * S,
                },
                {
                    x: lerp(skyAnc.x, skyEnd.x, 0.78) - 8 * S,
                    y: lerp(skyAnc.y, skyEnd.y, 0.78),
                },
                skyEnd,
                {
                    steps: 18,
                    widthStart: 1.25 * S,
                    widthEnd: 0.32 * S,
                    t0: lerp(main.t0, main.t1, 0.76),
                    t1: lerp(main.t0, main.t1, 0.76) + 0.22,
                    flexSpan: 0.65,
                    phase: 3.1,
                    wobble: 0.9 * S,
                    parentRef: { branch: main, idx: skyIdx },
                },
                rng,
            );
            branches.push(skyTwig);
            [
                {
                    u: 0.90,
                    ang: -0.38,
                    sz: 34,
                    tint: "sub" as TintRole,
                    p: true,
                },
                {
                    u: 1.0,
                    ang: 0.14,
                    sz: 40,
                    tint: isLateAutumnGinkgo
                        ? "accent" as TintRole
                        : "sub" as TintRole,
                    p: false,
                },
            ].forEach((sl, li) => {
                ornaments.push({
                    kind: "ginkgo",
                    ghost: false,
                    branch: skyTwig,
                    idx: Math.round(sl.u * (skyTwig.points.length - 1)),
                    angleOffset: sl.ang,
                    size: sl.sz * S,
                    notch: 0.22,
                    stemLen: 14 * S,
                    tint: sl.tint,
                    profile: sl.p,
                    t0: skyTwig.t1 - 0.02 + li * 0.04,
                    t1: skyTwig.t1 + 0.28 + li * 0.04,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            });
        }

        const topLeaves: ReadonlyArray<{
            u: number;
            ang: number;
            sz: number;
            tint: TintRole;
            profile: boolean;
        }> = [
            {
                u: 0.93,
                ang: -0.50,
                sz: 40,
                tint: isLateAutumnGinkgo ? "sub" : "ink",
                profile: true,
            },
            { u: 1.00, ang: 0.08, sz: 45, tint: "accent", profile: false },
        ];
        topLeaves.forEach((ls, li) => {
            const lIdx = Math.round(ls.u * (main.points.length - 1));
            ornaments.push({
                kind: "ginkgo",
                ghost: false,
                branch: main,
                idx: lIdx,
                angleOffset: ls.ang,
                size: ls.sz * S * ginkgoLeafScale,
                notch: rand(0.18, 0.28),
                stemLen: rand(13, 19) * S * ginkgoLeafScale,
                tint: ls.tint,
                profile: ls.profile,
                t0: main.t1 - 0.04 + li * 0.06,
                t1: main.t1 + 0.34 + li * 0.06,
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
        const leafOrn =
            ornaments.find((o) =>
                o.kind === "ginkgo" && !o.ghost && !o.profile
            ) ?? ornaments.find((o) => o.kind === "ginkgo" && !o.ghost);
        const perchBranch = leafOrn?.branch ?? fgBranches[0] ?? branches[0];
        const perchIdx = leafOrn?.idx ??
            Math.max(1, Math.round((perchBranch.points.length - 1) * 0.72));
        visitorAnchor = {
            kind: "ladybug",
            branch: perchBranch,
            idx: perchIdx,
            angleOffset: leafOrn?.angleOffset ?? 0.2,
            leafSize: leafOrn && leafOrn.kind === "ginkgo"
                ? leafOrn.size + leafOrn.stemLen
                : 46 * S,
            fireflies,
        };
        const mainBranch = fgBranches[0] ?? branches[0];
        rewardAnchor = {
            kind: "ginkgo",
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
        if (o.kind !== "ginkgo") return;
        drawGinkgoLeaf(ctx, wx, wy, angle, o, op, pal, layerA);
    },

    traceDrifterPath(ctx: CanvasRenderingContext2D, size: number): void {
        const s = size * 1.15;
        ctx.beginPath();
        ctx.moveTo(-s * 0.35, 0);
        ctx.lineTo(s * 0.6, -s * 0.52);
        ctx.quadraticCurveTo(s * 0.85, 0, s * 0.6, s * 0.52);
        ctx.closePath();
    },

    drawReward(
        ctx: CanvasRenderingContext2D,
        scene: BotanicalScene,
        reward: BotanicalRewardAnchor,
        tipPt: WorldSample,
        bloomP: number,
        pal: BotanicalPalette,
    ): void {
        const s = scene.scale;
        for (const angOff of [-0.42, 0.36]) {
            const shoot: GinkgoOrnament = {
                kind: "ginkgo",
                branch: reward.branch,
                idx: reward.idx,
                ghost: false,
                t0: 0,
                t1: 1,
                phase: 1.2,
                angleOffset: angOff,
                tint: "accent",
                profile: angOff > 0,
                push: 0,
                vel: 0,
                size: 26 * s * bloomP,
                notch: 0.22,
                stemLen: 10 * s,
            };
            drawGinkgoLeaf(
                ctx,
                tipPt.x,
                tipPt.y,
                tipPt.angle + angOff,
                shoot,
                bloomP,
                pal,
                1.0,
            );
        }
    },
};
