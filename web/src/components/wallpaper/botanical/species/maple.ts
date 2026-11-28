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
    MapleLeafOrnament,
    TintRole,
    WorldSample,
} from "../types.ts";

function drawMapleLeaf(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: MapleLeafOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const stemP = easeOutCubic(clamp(p / 0.25, 0, 1));
    const washP = easeOutCubic(clamp((p - 0.12) / 0.62, 0, 1));
    if (stemP <= 0.02) return;
    const stem = o.stemLen * stemP;
    const s = o.size * Math.max(0.15, washP);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(stem, 0);
    ctx.strokeStyle = pal.stroke("ink", 0.72 * layerA);
    ctx.lineWidth = o.ghost ? 0.55 : 0.85;
    ctx.lineCap = "round";
    ctx.stroke();

    if (washP <= 0.05) {
        ctx.restore();
        return;
    }

    ctx.translate(stem, 0);
    ctx.rotate(o.rotation);
    if (o.profile) ctx.scale(1, 0.72);

    // 经典七裂鸡爪槭（5 主裂 + 2 微小基裂，裂尖修长锐美）
    const lobes = [-2.02, -1.42, -0.72, 0, 0.72, 1.42, 2.02];
    const lobeLens = [0.34, 0.62, 0.88, 1.04, 0.88, 0.62, 0.34];
    const traceMaple = () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let i = 0; i < lobes.length; i++) {
            const la = lobes[i];
            const ll = s * lobeLens[i];
            const tipX = Math.cos(la) * ll;
            const tipY = Math.sin(la) * ll;
            const prevA = i === 0 ? -2.28 : (lobes[i - 1] + la) * 0.5;
            const notchR = s * (i === 0 || i === 1 ? 0.19 : 0.32);
            const nx = Math.cos(prevA) * notchR;
            const ny = Math.sin(prevA) * notchR;
            const ctrlA = (prevA + la) * 0.5;
            ctx.quadraticCurveTo(
                Math.cos(ctrlA) * ll * 0.54,
                Math.sin(ctrlA) * ll * 0.54,
                nx,
                ny,
            );
            ctx.quadraticCurveTo(
                nx * 0.52 + tipX * 0.48,
                ny * 0.52 + tipY * 0.48,
                tipX,
                tipY,
            );
        }
        ctx.quadraticCurveTo(
            Math.cos(2.22) * s * 0.24,
            Math.sin(2.22) * s * 0.24,
            0,
            0,
        );
        ctx.closePath();
    };

    // Off-register Mokuhanga base print
    if (!o.ghost) {
        ctx.save();
        ctx.translate(1.0, 0.75);
        traceMaple();
        ctx.fillStyle = pal.fill(o.tint, 0.38 * washP * layerA);
        ctx.fill();
        ctx.restore();
    }

    const grad = ctx.createRadialGradient(
        s * 0.25,
        0,
        Math.max(0.5, s * 0.08),
        s * 0.45,
        0,
        Math.max(2, s * 1.05),
    );
    grad.addColorStop(0, pal.wash(o.tint, 1.32 * washP * layerA));
    grad.addColorStop(0.65, pal.fill(o.tint, 1.12 * washP * layerA));
    grad.addColorStop(1, pal.fill(o.tint, 0.34 * washP * layerA));
    traceMaple();
    ctx.fillStyle = grad;
    ctx.fill();

    // 掌心暖金赭撞色晕染，自然向深绯裂尖过渡
    if (!o.ghost) {
        const coreGrad = ctx.createRadialGradient(
            s * 0.14,
            0,
            0.5,
            s * 0.22,
            0,
            Math.max(2, s * 0.62),
        );
        coreGrad.addColorStop(0, pal.wash("sub", 0.78 * washP * layerA));
        coreGrad.addColorStop(1, pal.fill("sub", 0));
        traceMaple();
        ctx.fillStyle = coreGrad;
        ctx.fill();
    }

    if (!o.ghost && washP > 0.4) {
        strokeWaterline(ctx, o.tint, pal, 1, 0.56 * washP * layerA, s);
        traceMaple();
        strokeGongbiOutline(ctx, o.tint, pal, washP * layerA, 0.72);
    }

    // 放射掌脉与细微侧脉
    ctx.strokeStyle = pal.vein("ink", 0.56 * washP * layerA);
    ctx.lineCap = "round";
    for (let i = 0; i < lobes.length; i++) {
        const la = lobes[i];
        const ll = s * lobeLens[i] * 0.76;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(la) * ll, Math.sin(la) * ll);
        ctx.lineWidth = i >= 1 && i <= 5 ? 0.52 : 0.36;
        ctx.stroke();
    }
    ctx.restore();
}

export const mapleSpecies: BotanicalSpeciesModule = {
    species: "maple",

    populateEchoOrnaments(
        gen: BotanicalSceneGenContext,
        echo: BranchData,
        echoScale: number,
    ): void {
        const { S, rand, ornaments } = gen;
        const echoMaples: ReadonlyArray<{
            u: number;
            ang: number;
            sz: number;
            tint: TintRole;
        }> = [
            { u: 0.45, ang: 0.55, sz: 20, tint: "ink" },
            { u: 0.78, ang: -0.42, sz: 24, tint: "sub" },
            { u: 0.98, ang: 0.15, sz: 18, tint: "accent" },
        ];
        for (const em of echoMaples) {
            const idx = Math.round(em.u * (echo.points.length - 1));
            ornaments.push({
                kind: "mapleLeaf",
                ghost: true,
                branch: echo,
                idx,
                angleOffset: em.ang,
                size: em.sz * S * echoScale,
                stemLen: 10 * S * echoScale,
                rotation: rand(-0.4, 0.4),
                tint: em.tint,
                profile: false,
                t0: lerp(echo.t0, echo.t1, em.u) + 0.05,
                t1: lerp(echo.t0, echo.t1, em.u) + 0.32,
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
            embedded,
            archetype,
            solar,
            rng,
            rand,
            rootX,
            rootY,
            topShift,
            branches,
            ornaments,
        } = gen;
        // Autumn maple: 桌面端高崖横柯零穿插避让搜索框 / 窄屏保持侧生古干
        const mapleScale = isNarrow ? 0.84 : 1;
        const mainP0 = isNarrow ? { x: rootX - 6 * S, y: rootY - 12 * S } : {
            x: rootX + 18 * S,
            y: (embedded ? Math.max(56, 92 * S) : Math.max(68 * S, h * 0.085)) +
                topShift,
        };
        const mainP3 = isNarrow ? { x: w - 265 * S, y: rootY - 195 * S } : {
            x: w -
                rand(archetype === 1 ? 335 : 380, archetype === 1 ? 380 : 425) *
                    S,
            y: embedded
                ? 275 * S
                : h * (archetype === 1 ? 0.27 : archetype === 2 ? 0.35 : 0.31),
        };
        const main = sampleBranch(
            mainP0,
            isNarrow
                ? { x: mainP0.x - 55 * S, y: mainP0.y - 95 * S }
                : { x: mainP0.x - 140 * S, y: mainP0.y + 24 * S },
            isNarrow
                ? { x: mainP3.x + 85 * S, y: mainP3.y + 24 * S }
                : { x: mainP3.x + 125 * S, y: mainP3.y - 36 * S },
            mainP3,
            {
                steps: 42,
                widthStart: (isNarrow ? 4.8 : 8.2) * S,
                widthEnd: 0.66 * S,
                t0: 0.0,
                t1: 0.48,
                flexSpan: 0.72,
                phase: 0.4,
                wobble: 1.8 * S,
            },
            rng,
        );
        branches.push(main);

        const subCfgs = isNarrow
            ? [
                { u: 0.34, ang: -1.95, len: 108 * S },
                { u: 0.62, ang: -1.42, len: 92 * S },
                { u: 0.82, ang: -2.45, len: 74 * S },
            ]
            : [
                { u: 0.26, ang: 2.02, len: 225 * S },
                { u: 0.56, ang: -2.82, len: 185 * S },
                { u: 0.84, ang: 1.72, len: 165 * S },
            ];
        subCfgs.forEach((sc, si) => {
            const pIdx = Math.round(sc.u * (main.points.length - 1));
            const anc = main.points[pIdx];
            const sp3 = {
                x: anc.x + Math.cos(sc.ang) * sc.len,
                y: isNarrow
                    ? anc.y + Math.sin(sc.ang) * sc.len
                    : Math.max(54, anc.y + Math.sin(sc.ang) * sc.len),
            };
            const ts = lerp(main.t0, main.t1, sc.u);
            const sub = sampleBranch(
                { x: anc.x, y: anc.y },
                {
                    x: lerp(anc.x, sp3.x, 0.38) - 10 * S,
                    y: Math.max(
                        54,
                        lerp(anc.y, sp3.y, 0.38) - (isNarrow ? 12 : 4) * S,
                    ),
                },
                {
                    x: lerp(anc.x, sp3.x, 0.72) + 8 * S,
                    y: Math.max(
                        54,
                        lerp(anc.y, sp3.y, 0.72) + 6 * S,
                    ),
                },
                sp3,
                {
                    steps: 20,
                    widthStart: (isNarrow ? 1.85 : 2.55) * S,
                    widthEnd: 0.5 * S,
                    t0: ts,
                    t1: ts + 0.22,
                    flexSpan: 0.54,
                    phase: si * 1.1,
                    wobble: 1.1 * S,
                    parentRef: { branch: main, idx: pIdx },
                },
                rng,
            );
            branches.push(sub);

            const leafOffsets = [
                { u: 0.36, ang: -0.62, sz: 24, rot: -0.25, profile: true },
                { u: 0.56, ang: 0.38, sz: 31, rot: 0.18, profile: false },
                { u: 0.84, ang: -0.42, sz: 28, rot: -0.14, profile: false },
                {
                    u: 0.97,
                    ang: 0.22,
                    sz: 35,
                    rot: 0.22,
                    profile: si % 2 === 1,
                },
            ];
            leafOffsets.forEach((lf, li) => {
                const lIdx = Math.round(lf.u * (sub.points.length - 1));
                const lt = lerp(sub.t0, sub.t1, lf.u) + 0.03;
                const mapleTint: TintRole = solar.phenologyStage === "frost"
                    ? ((si + li) % 4 === 0
                        ? "ink"
                        : (si + li) % 3 === 0
                        ? "sub"
                        : "accent")
                    : (si + li) % 3 === 0
                    ? "accent"
                    : (si + li) % 2 === 0
                    ? "sub"
                    : "ink";
                ornaments.push({
                    kind: "mapleLeaf",
                    ghost: false,
                    branch: sub,
                    idx: lIdx,
                    angleOffset: lf.ang + rand(-0.12, 0.12),
                    size: lf.sz * rand(0.90, 1.12) * S * mapleScale,
                    stemLen: rand(10, 14) * S * mapleScale,
                    rotation: lf.rot + rand(-0.2, 0.2),
                    tint: mapleTint,
                    profile: lf.profile,
                    t0: lt,
                    t1: lt + 0.32,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            });
        });

        [0.44, 0.68, 0.88, 1.0].forEach((u, mi) => {
            const mIdx = Math.round(u * (main.points.length - 1));
            ornaments.push({
                kind: "mapleLeaf",
                ghost: false,
                branch: main,
                idx: mIdx,
                angleOffset: mi % 2 === 0 ? -0.52 : 0.24,
                size: (mi === 3 ? 38 : mi === 1 ? 32 : 26) * S * mapleScale,
                stemLen: 12 * S * mapleScale,
                rotation: rand(-0.3, 0.3),
                tint: mi === 3 || mi === 0
                    ? "accent"
                    : mi === 1
                    ? "ink"
                    : "sub",
                profile: mi === 1,
                t0: main.t1 - 0.08 + mi * 0.04,
                t1: main.t1 + 0.26 + mi * 0.04,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });

        // Wide midground companion maple bough for layered canopy depth (kept clear of search zone)
        if (!isNarrow) {
            const midP0 = { x: rootX + 12 * S, y: mainP0.y + 135 * S };
            const midP3 = {
                x: w - rand(240, 280) * S,
                y: mainP0.y + 285 * S,
            };
            const midMaple = sampleBranch(
                midP0,
                { x: midP0.x - 105 * S, y: midP0.y + 36 * S },
                { x: midP3.x + 110 * S, y: midP3.y - 42 * S },
                midP3,
                {
                    steps: 28,
                    widthStart: 3.2 * S,
                    widthEnd: 0.55 * S,
                    t0: 0.14,
                    t1: 0.56,
                    flexSpan: 0.82,
                    phase: 1.7,
                    midground: true,
                    wobble: 1.2 * S,
                },
                rng,
            );
            branches.push(midMaple);
            [0.48, 0.74, 0.96].forEach((mu, mi) => {
                const mIdx = Math.round(mu * (midMaple.points.length - 1));
                ornaments.push({
                    kind: "mapleLeaf",
                    ghost: false,
                    midground: true,
                    branch: midMaple,
                    idx: mIdx,
                    angleOffset: mi === 1 ? 0.42 : -0.48,
                    size: rand(24, 32) * S,
                    stemLen: 10 * S,
                    rotation: rand(-0.3, 0.3),
                    tint: mi === 2 ? "accent" : "sub",
                    profile: mi === 0,
                    t0: lerp(midMaple.t0, midMaple.t1, mu) + 0.04,
                    t1: lerp(midMaple.t0, midMaple.t1, mu) + 0.32,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            });

            // 红枫主干中上段繁叶画眼簇（红黄墨三色层叠）+ 高空探空独叶细梢
            const focalIdx = Math.round(0.42 * (main.points.length - 1));
            const focalT = lerp(main.t0, main.t1, 0.42) + 0.04;
            [
                { ang: -0.78, sz: 34, tint: "accent" as TintRole, mid: false },
                { ang: -0.22, sz: 28, tint: "sub" as TintRole, mid: true },
                { ang: 0.52, sz: 30, tint: "ink" as TintRole, mid: false },
            ].forEach((fl, li) => {
                ornaments.push({
                    kind: "mapleLeaf",
                    ghost: false,
                    midground: fl.mid,
                    branch: main,
                    idx: focalIdx,
                    angleOffset: fl.ang,
                    size: fl.sz * S,
                    stemLen: 11 * S,
                    rotation: rand(-0.28, 0.28),
                    tint: fl.tint,
                    profile: li === 1,
                    t0: focalT + li * 0.04,
                    t1: focalT + 0.30 + li * 0.04,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            });

            const skyIdx = Math.round(0.88 * (main.points.length - 1));
            const skyAnc = main.points[skyIdx];
            const skyEnd = {
                x: skyAnc.x - 135 * S,
                y: Math.max(60, skyAnc.y - 52 * S),
            };
            const skyMaple = sampleBranch(
                { x: skyAnc.x, y: skyAnc.y },
                {
                    x: lerp(skyAnc.x, skyEnd.x, 0.4) - 10 * S,
                    y: Math.max(54, lerp(skyAnc.y, skyEnd.y, 0.4) - 14 * S),
                },
                {
                    x: lerp(skyAnc.x, skyEnd.x, 0.78) + 8 * S,
                    y: Math.max(54, lerp(skyAnc.y, skyEnd.y, 0.78)),
                },
                skyEnd,
                {
                    steps: 18,
                    widthStart: 1.15 * S,
                    widthEnd: 0.30 * S,
                    t0: lerp(main.t0, main.t1, 0.88),
                    t1: lerp(main.t0, main.t1, 0.88) + 0.22,
                    flexSpan: 0.72,
                    phase: 2.5,
                    wobble: 0.8 * S,
                    parentRef: { branch: main, idx: skyIdx },
                },
                rng,
            );
            branches.push(skyMaple);
            ornaments.push({
                kind: "mapleLeaf",
                ghost: false,
                branch: skyMaple,
                idx: skyMaple.points.length - 1,
                angleOffset: -0.18,
                size: 36 * S,
                stemLen: 13 * S,
                rotation: 0.24,
                tint: "accent",
                profile: false,
                t0: skyMaple.t1 - 0.02,
                t1: skyMaple.t1 + 0.28,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
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
        const { branches } = gen;
        let visitorAnchor: BotanicalVisitorAnchor | null = null;
        let rewardAnchor: BotanicalRewardAnchor | null = null;
        const perchBranch = fgBranches[0] ?? branches[0];
        const perchIdx = Math.max(
            2,
            Math.round((perchBranch.points.length - 1) * 0.45),
        );
        visitorAnchor = {
            kind: "sparrow",
            branch: perchBranch,
            idx: perchIdx,
            fireflies,
        };
        rewardAnchor = {
            kind: "maple",
            branch: perchBranch,
            idx: Math.max(1, perchBranch.points.length - 1),
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
        if (o.kind !== "mapleLeaf") return;
        drawMapleLeaf(ctx, wx, wy, angle, o, op, pal, layerA);
    },

    traceDrifterPath(ctx: CanvasRenderingContext2D, size: number): void {
        const s = size * 0.95;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.32, -s * 0.32);
        ctx.lineTo(s * 0.95, -s * 0.22);
        ctx.lineTo(s * 0.42, s * 0.24);
        ctx.lineTo(s * 0.56, s * 0.88);
        ctx.lineTo(0, s * 0.45);
        ctx.lineTo(-s * 0.56, s * 0.88);
        ctx.lineTo(-s * 0.42, s * 0.24);
        ctx.lineTo(-s * 0.95, -s * 0.22);
        ctx.lineTo(-s * 0.32, -s * 0.32);
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
        const leaf: MapleLeafOrnament = {
            kind: "mapleLeaf",
            branch: reward.branch,
            idx: reward.idx,
            ghost: false,
            t0: 0,
            t1: 1,
            phase: 0.5,
            angleOffset: 0.1,
            tint: "accent",
            profile: false,
            push: 0,
            vel: 0,
            size: 36 * s * bloomP,
            stemLen: 12 * s,
            rotation: 0.15,
        };
        drawMapleLeaf(
            ctx,
            tipPt.x,
            tipPt.y,
            tipPt.angle + 0.15,
            leaf,
            bloomP,
            pal,
            1.0,
        );
    },
};
