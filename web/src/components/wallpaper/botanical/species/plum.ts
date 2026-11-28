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
    PlumOrnament,
    TintRole,
    WorldSample,
} from "../types.ts";

function drawPlumBlossom(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: PlumOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const washP = easeOutCubic(clamp(p / 0.65, 0, 1));
    const stP = easeOutCubic(clamp((p - 0.36) / 0.64, 0, 1));
    if (washP <= 0.01) return;

    const r = o.size;
    const pose = o.pose ?? (o.profile ? "side" : "frontal");
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(o.rotation + angle * 0.2);
    if (pose === "side") ctx.scale(1.0, 0.72);
    else if (pose === "upward") ctx.scale(0.86, 0.94);

    // 没骨撞粉倒卵微凹梅瓣（非椭圆）
    const petalCount = pose === "side" ? 4 : 5;
    for (let i = 0; i < petalCount; i++) {
        const baseA = pose === "side"
            ? -1.25 + (i / 3) * 2.5
            : (i / 5) * Math.PI * 2;
        const a = baseA + Math.sin(o.phase + i * 1.7) * 0.09;
        const pLen = r * (0.94 + (i % 3) * 0.06) * washP;
        const pW = pLen * (0.48 + (i % 2) * 0.05);

        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        // 基部狭楔，上缘圆润略带微凹
        ctx.bezierCurveTo(
            pLen * 0.28,
            -pW * 0.46,
            pLen * 0.72,
            -pW * 0.96,
            pLen * 0.96,
            -pW * 0.24,
        );
        ctx.quadraticCurveTo(pLen * 0.91, 0, pLen * 0.96, pW * 0.24);
        ctx.bezierCurveTo(
            pLen * 0.72,
            pW * 0.96,
            pLen * 0.28,
            pW * 0.46,
            0,
            0,
        );
        ctx.closePath();

        const grad = ctx.createRadialGradient(
            pLen * 0.16,
            0,
            Math.max(0.5, pLen * 0.04),
            pLen * 0.56,
            0,
            Math.max(2, pLen * 0.85),
        );
        grad.addColorStop(
            0,
            pal.luminous((pal.isDark ? 0.26 : 0.76) * washP * layerA),
        );
        grad.addColorStop(0.55, pal.wash(o.tint, 1.40 * washP * layerA));
        grad.addColorStop(1, pal.waterline(o.tint, 0.86 * washP * layerA));
        ctx.fillStyle = grad;
        ctx.fill();

        if (!o.ghost && (i === 0 || i === 2)) {
            ctx.fillStyle = pal.wash(
                o.tint === "accent" ? "sub" : "accent",
                0.24 * washP * layerA,
            );
            ctx.fill();
        }
        if (!o.ghost && washP > 0.45 && i % 2 === 0) {
            strokeWaterline(ctx, o.tint, pal, 1, 0.54 * washP * layerA, pLen);
        }
        if (!o.ghost && washP > 0.35) {
            strokeGongbiOutline(ctx, o.tint, pal, washP * layerA, 0.66);
        }
        ctx.restore();
    }

    if (stP > 0.04) {
        if (pose === "back") {
            // 背嫣：五出星芒状浓墨梅萼居中托起花蒂
            ctx.fillStyle = pal.inkGrade("jiao", 0.92 * stP * layerA);
            for (let k = 0; k < 5; k++) {
                const ka = (k / 5) * Math.PI * 2 + 0.3;
                ctx.beginPath();
                ctx.ellipse(
                    Math.cos(ka) * r * 0.19,
                    Math.sin(ka) * r * 0.19,
                    Math.max(1.2, r * 0.18 * stP),
                    Math.max(0.75, r * 0.08 * stP),
                    ka,
                    0,
                    Math.PI * 2,
                );
                ctx.fill();
            }
        } else {
            if (pose === "side" || pose === "upward") {
                // 侧/仰姿态：花托底部的 3 爪浓墨丁香梅萼
                ctx.fillStyle = pal.inkGrade("jiao", 0.90 * stP * layerA);
                for (let k = -1; k <= 1; k++) {
                    const ka = Math.PI * 0.5 + k * 0.42;
                    ctx.beginPath();
                    ctx.ellipse(
                        Math.cos(ka) * r * 0.14,
                        Math.sin(ka) * r * 0.14,
                        Math.max(1.0, r * 0.13 * stP),
                        Math.max(0.6, r * 0.07 * stP),
                        ka,
                        0,
                        Math.PI * 2,
                    );
                    ctx.fill();
                }
            }

            // 浓墨花心点与 11–15 根纤细攒簇游丝花蕊
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(1.1, r * 0.12 * stP), 0, Math.PI * 2);
            ctx.fillStyle = pal.inkGrade("jiao", 0.92 * stP * layerA);
            ctx.fill();

            const stamenCount = r >= 18 ? 15 : 11;
            const dotR = Math.max(0.6, (r >= 18 ? 1.15 : 0.92) * stP);
            const tipsX: number[] = new Array(stamenCount);
            const tipsY: number[] = new Array(stamenCount);

            ctx.beginPath();
            for (let i = 0; i < stamenCount; i++) {
                const a = (i / stamenCount) * Math.PI * 2 +
                    Math.sin(o.phase + i) * 0.12;
                const len = r * (0.32 + ((i * 7) % 5) * 0.075) * stP;
                const ex = Math.cos(a) * len;
                const ey = Math.sin(a) * len;
                const cx = Math.cos(a + 0.16) * len * 0.56;
                const cy = Math.sin(a + 0.16) * len * 0.56;
                tipsX[i] = ex;
                tipsY[i] = ey;
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(cx, cy, ex, ey);
            }
            ctx.strokeStyle = pal.inkGrade("nong", 0.84 * stP * layerA);
            ctx.lineWidth = Math.max(0.30, 0.38 * (r / 18));
            ctx.lineCap = "round";
            ctx.stroke();

            ctx.beginPath();
            for (let i = 0; i < stamenCount; i++) {
                const ex = tipsX[i];
                const ey = tipsY[i];
                ctx.moveTo(ex + dotR, ey);
                ctx.arc(ex, ey, dotR, 0, Math.PI * 2);
            }
            ctx.fillStyle = pal.goldDust(0.95 * stP * layerA);
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawPlumBud(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: PlumOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const washP = easeOutCubic(clamp(p / 0.72, 0, 1));
    if (washP <= 0.02) return;
    const r = o.size;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const grad = ctx.createRadialGradient(
        r * 0.6,
        0,
        Math.max(0.5, r * 0.12),
        r * 0.85,
        0,
        Math.max(2, r * 1.15),
    );
    grad.addColorStop(0, pal.wash(o.tint, 1.45 * washP * layerA));
    grad.addColorStop(0.65, pal.fill(o.tint, 1.15 * washP * layerA));
    grad.addColorStop(1, pal.fill(o.tint, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(r * 0.85, 0, r * 1.12, r * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();

    // Crisp sumi-ink calyx cup
    ctx.beginPath();
    ctx.arc(r * 0.15, 0, r * 0.56, -0.92, 0.92);
    ctx.strokeStyle = pal.stroke("ink", 0.92 * washP * layerA);
    ctx.lineWidth = 1.25;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
}

export const plumSpecies: BotanicalSpeciesModule = {
    species: "plum",

    populateEchoOrnaments(
        gen: BotanicalSceneGenContext,
        echo: BranchData,
        echoScale: number,
    ): void {
        const { S, rand, ornaments } = gen;
        const echoPlums: ReadonlyArray<{
            u: number;
            kind: "plumBlossom" | "plumBud";
            sz: number;
            ang: number;
            tint: TintRole;
        }> = [
            {
                u: 0.44,
                kind: "plumBlossom",
                sz: 16,
                ang: 0.65,
                tint: "sub",
            },
            {
                u: 0.74,
                kind: "plumBlossom",
                sz: 13,
                ang: -0.55,
                tint: "accent",
            },
            {
                u: 0.96,
                kind: "plumBud",
                sz: 4.8,
                ang: 0.15,
                tint: "accent",
            },
        ];
        for (const sp of echoPlums) {
            const idx = Math.round(sp.u * (echo.points.length - 1));
            ornaments.push({
                kind: sp.kind,
                ghost: true,
                branch: echo,
                idx,
                angleOffset: sp.ang,
                size: sp.sz * S * echoScale,
                rotation: rand(0, 6.28),
                tint: sp.tint,
                profile: false,
                t0: lerp(echo.t0, echo.t1, sp.u) + 0.06,
                t1: lerp(echo.t0, echo.t1, sp.u) + 0.34,
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
            topShift,
            branches,
            ornaments,
        } = gen;
        const plumScale = isNarrow ? 0.86 : 1;
        const isHanging = !isNarrow && archetype === 2;
        const g0 = isNarrow
            ? { x: rootX + 4 * S, y: rootY - 30 * S }
            : isHanging
            ? { x: w + 14 * S, y: Math.max(110 * S, h * 0.14) + topShift }
            : { x: rootX - 10 * S, y: rootY - 95 * S };
        const g3 = isNarrow
            ? {
                x: w - rand(120, 150) * S,
                y: rootY - rand(195, 225) * S,
            }
            : isHanging
            ? {
                x: w - rand(210, 260) * S,
                y: h * 0.44,
            }
            : {
                x: w - rand(195, 250) * S,
                y: h - rand(460, 525) * S,
            };
        const ghost = sampleBranch(
            g0,
            {
                x: lerp(g0.x, g3.x, 0.35) + 22 * S * plumScale,
                y: lerp(g0.y, g3.y, 0.35) - 28 * S * plumScale,
            },
            {
                x: lerp(g0.x, g3.x, 0.70) - 18 * S * plumScale,
                y: lerp(g0.y, g3.y, 0.70) + 16 * S * plumScale,
            },
            g3,
            {
                steps: 26,
                widthStart: 1.55 * S * plumScale,
                widthEnd: 0.45 * S,
                t0: 0.10,
                t1: 0.54,
                flexSpan: 0.85,
                phase: 2.0,
                ghost: true,
                wobble: 1.5 * S * plumScale,
            },
            rng,
        );
        branches.push(ghost);
        [0.60, 0.84, 0.98].forEach((u, i) => {
            const idx = Math.round(u * (ghost.points.length - 1));
            const isBud = i === 2;
            ornaments.push({
                kind: isBud ? "plumBud" : "plumBlossom",
                ghost: true,
                branch: ghost,
                idx,
                angleOffset: i % 2 === 0 ? -0.6 : 0.6,
                size: (isBud ? 4.8 : rand(14, 18)) * S * plumScale,
                rotation: rand(0, 6.28),
                tint: "accent",
                profile: false,
                t0: lerp(ghost.t0, ghost.t1, u) + 0.08,
                t1: lerp(ghost.t0, ghost.t1, u) + 0.36,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });

        const p0 = isNarrow ? { x: rootX + 4 * S, y: rootY } : isHanging
            ? {
                x: rootX + 18 * S,
                y: Math.max(150 * S, h * 0.20) + topShift,
            }
            : {
                x: rootX - rand(40, 72) * S,
                y: rootY - rand(6, 26) * S,
            };
        const mid1 = isNarrow
            ? {
                x: w - rand(110, 132) * S,
                y: rootY - rand(72, 92) * S,
            }
            : isHanging
            ? {
                x: w - rand(165, 200) * S,
                y: h * 0.31 + topShift,
            }
            : {
                x: w - rand(195, 232) * S,
                y: h -
                    rand(
                            archetype === 1 ? 195 : 165,
                            archetype === 1 ? 235 : 200,
                        ) * S,
            };
        const mid2 = isNarrow
            ? {
                x: w - rand(180, 208) * S,
                y: rootY - rand(148, 174) * S,
            }
            : isHanging
            ? {
                x: w - rand(275, 315) * S,
                y: h * 0.49,
            }
            : {
                x: w - rand(285, 332) * S,
                y: h -
                    rand(
                            archetype === 1 ? 355 : 320,
                            archetype === 1 ? 405 : 360,
                        ) * S,
            };
        const tip = isNarrow
            ? {
                x: w - rand(278, 312) * S,
                y: rootY - rand(182, 210) * S,
            }
            : isHanging
            ? {
                x: w - rand(475, 535) * S,
                y: h * 0.59,
            }
            : {
                x: w -
                    rand(
                            archetype === 1 ? 465 : 515,
                            archetype === 1 ? 525 : 575,
                        ) * S,
                y: h -
                    rand(
                            archetype === 1 ? 410 : 365,
                            archetype === 1 ? 455 : 405,
                        ) * S,
            };

        const seg1 = sampleBranch(
            p0,
            {
                x: lerp(p0.x, mid1.x, 0.4) + 14 * S,
                y: lerp(p0.y, mid1.y, 0.4) - 18 * S,
            },
            {
                x: lerp(p0.x, mid1.x, 0.8) - 8 * S,
                y: lerp(p0.y, mid1.y, 0.8) + 10 * S,
            },
            mid1,
            {
                steps: 20,
                widthStart: (isNarrow ? 5.4 : 8.8) * S,
                widthEnd: (isNarrow ? 3.2 : 5.0) * S,
                t0: 0.0,
                t1: 0.21,
                flexSpan: 0.18,
                phase: 0,
                brushStyle: "iron-plum",
                wobble: 1.2 * S,
            },
            rng,
        );
        const seg2 = sampleBranch(
            mid1,
            {
                x: lerp(mid1.x, mid2.x, 0.35) + 18 * S,
                y: lerp(mid1.y, mid2.y, 0.35) - 24 * S,
            },
            {
                x: lerp(mid1.x, mid2.x, 0.78) - 12 * S,
                y: lerp(mid1.y, mid2.y, 0.78) + 8 * S,
            },
            mid2,
            {
                steps: 22,
                widthStart: (isNarrow ? 3.2 : 5.0) * S,
                widthEnd: (isNarrow ? 1.75 : 2.5) * S,
                t0: 0.20,
                t1: 0.40,
                flexSpan: 0.35,
                phase: 0.3,
                brushStyle: "iron-plum",
                wobble: 1.4 * S,
                parentRef: { branch: seg1, idx: seg1.points.length - 1 },
            },
            rng,
        );
        const seg3 = sampleBranch(
            mid2,
            {
                x: lerp(mid2.x, tip.x, 0.35) - 12 * S,
                y: lerp(mid2.y, tip.y, 0.35) - 24 * S,
            },
            {
                x: lerp(mid2.x, tip.x, 0.76) + 18 * S,
                y: lerp(mid2.y, tip.y, 0.76) - 8 * S,
            },
            tip,
            {
                steps: 22,
                widthStart: (isNarrow ? 1.75 : 2.5) * S,
                widthEnd: (isNarrow ? 0.56 : 0.65) * S,
                t0: 0.39,
                t1: 0.56,
                flexSpan: 0.42,
                phase: 0.6,
                brushStyle: "iron-plum",
                wobble: 1.2 * S,
                parentRef: { branch: seg2, idx: seg2.points.length - 1 },
            },
            rng,
        );
        branches.push(seg1, seg2, seg3);

        [
            { parent: seg1, u: 0.94, ang: -0.75, len: 22 * S },
            { parent: seg2, u: 0.96, ang: -0.92, len: 18 * S },
            { parent: seg3, u: 0.36, ang: -2.95, len: 16 * S },
        ].forEach((sp, si) => {
            const pIdx = Math.round(sp.u * (sp.parent.points.length - 1));
            const anc = sp.parent.points[pIdx];
            const tp3 = {
                x: anc.x + Math.cos(sp.ang) * sp.len,
                y: anc.y + Math.sin(sp.ang) * sp.len,
            };
            const ts = lerp(sp.parent.t0, sp.parent.t1, sp.u);
            branches.push(sampleBranch(
                { x: anc.x, y: anc.y },
                { x: lerp(anc.x, tp3.x, 0.4), y: lerp(anc.y, tp3.y, 0.4) },
                { x: lerp(anc.x, tp3.x, 0.7), y: lerp(anc.y, tp3.y, 0.7) },
                tp3,
                {
                    steps: 8,
                    widthStart: 1.3 * S,
                    widthEnd: 0.32 * S,
                    t0: ts,
                    t1: ts + 0.12,
                    flexSpan: 0.1,
                    phase: 1.1 + si,
                    parentRef: { branch: sp.parent, idx: pIdx },
                },
                rng,
            ));
        });

        const twigs = isNarrow
            ? [
                { parent: seg1, u: 0.78, ang: -1.92, len: 112 * S },
                { parent: seg2, u: 0.52, ang: -1.36, len: 100 * S },
                { parent: seg2, u: 0.92, ang: -2.28, len: 82 * S },
                { parent: seg3, u: 0.58, ang: -1.58, len: 62 * S },
            ]
            : isHanging
            ? [
                { parent: seg1, u: 0.72, ang: 2.28, len: 155 * S },
                { parent: seg2, u: 0.52, ang: 1.86, len: 165 * S },
                { parent: seg2, u: 0.88, ang: 2.68, len: 130 * S },
                { parent: seg3, u: 0.52, ang: -2.52, len: 105 * S },
            ]
            : [
                { parent: seg1, u: 0.78, ang: -1.68, len: 195 * S },
                { parent: seg2, u: 0.52, ang: -1.26, len: 185 * S },
                { parent: seg2, u: 0.92, ang: -2.62, len: 135 * S },
                { parent: seg3, u: 0.52, ang: -2.74, len: 108 * S },
            ];
        twigs.forEach((tw, ti) => {
            const pIdx = Math.round(tw.u * (tw.parent.points.length - 1));
            const anc = tw.parent.points[pIdx];
            const ang = tw.ang + rand(-0.12, 0.12);
            const tp0 = { x: anc.x, y: anc.y };
            const rawEndY = anc.y + Math.sin(ang) * tw.len;
            const clampLower = !isNarrow && !isHanging && ti >= 2;
            const tp3 = {
                x: anc.x + Math.cos(ang) * tw.len,
                y: clampLower ? Math.max(435 * S, rawEndY) : rawEndY,
            };
            const rawCp1Y = lerp(tp0.y, tp3.y, 0.38) -
                (isHanging ? -1 : 1) * rand(10, 20) * S * plumScale;
            const rawCp2Y = lerp(tp0.y, tp3.y, 0.74) -
                (isHanging ? -1 : 1) * rand(6, 14) * S * plumScale;
            const tp1 = {
                x: lerp(tp0.x, tp3.x, 0.38) + rand(-14, 14) * S * plumScale,
                y: clampLower ? Math.max(435 * S, rawCp1Y) : rawCp1Y,
            };
            const tp2 = {
                x: lerp(tp0.x, tp3.x, 0.74) + rand(-10, 10) * S * plumScale,
                y: clampLower ? Math.max(435 * S, rawCp2Y) : rawCp2Y,
            };
            const ts = lerp(tw.parent.t0, tw.parent.t1, tw.u);
            const twig = sampleBranch(
                tp0,
                tp1,
                tp2,
                tp3,
                {
                    steps: 20,
                    widthStart: 1.4 * S,
                    widthEnd: 0.48 * S,
                    t0: ts,
                    t1: ts + 0.24,
                    flexSpan: 0.52,
                    phase: 0.7 + ti * 0.8,
                    wobble: 1.0 * S * plumScale,
                    parentRef: { branch: tw.parent, idx: pIdx },
                },
                rng,
            );
            branches.push(twig);

            const spots: ReadonlyArray<{
                u: number;
                kind: "plumBlossom" | "plumBud";
                sz: number;
                tint: TintRole;
                profile: boolean;
            }> = ti % 2 === 0
                ? [
                    {
                        u: 0.46,
                        kind: "plumBlossom",
                        sz: 22,
                        tint: "accent",
                        profile: false,
                    },
                    {
                        u: 0.74,
                        kind: "plumBlossom",
                        sz: 13.5,
                        tint: "sub",
                        profile: true,
                    },
                    {
                        u: 0.96,
                        kind: "plumBud",
                        sz: 5.0,
                        tint: "accent",
                        profile: false,
                    },
                ]
                : [
                    {
                        u: 0.38,
                        kind: "plumBud",
                        sz: 5.4,
                        tint: "accent",
                        profile: false,
                    },
                    {
                        u: 0.66,
                        kind: "plumBlossom",
                        sz: 16,
                        tint: "accent",
                        profile: false,
                    },
                    {
                        u: 0.86,
                        kind: "plumBud",
                        sz: 4.5,
                        tint: "sub",
                        profile: false,
                    },
                    {
                        u: 0.97,
                        kind: "plumBud",
                        sz: 3.8,
                        tint: "accent",
                        profile: false,
                    },
                ];

            spots.forEach((sp, si) => {
                const sIdx = Math.round(sp.u * (twig.points.length - 1));
                const tS = lerp(twig.t0, twig.t1, sp.u) + 0.06;
                const earlyWinterBud =
                    (solar.termIndex >= 21 || solar.termIndex === 0) &&
                    sp.kind === "plumBlossom" && (ti + si) % 3 === 0;
                const lateWinterBloom = solar.termIndex >= 1 &&
                    solar.termIndex <= 3 &&
                    sp.kind === "plumBud" && si === 0;
                const resolvedKind = earlyWinterBud
                    ? "plumBud"
                    : lateWinterBloom
                    ? "plumBlossom"
                    : sp.kind;
                const poses = ["frontal", "side", "upward", "back"] as const;
                ornaments.push({
                    kind: resolvedKind,
                    ghost: false,
                    branch: twig,
                    idx: sIdx,
                    angleOffset: (si % 2 === 0 ? -1 : 1) * rand(0.42, 0.90),
                    size: (resolvedKind === "plumBud"
                        ? 4.8
                        : Math.max(13, sp.sz)) *
                        rand(0.94, 1.06) * S * plumScale,
                    rotation: rand(0, 6.28),
                    tint: sp.tint,
                    profile: sp.profile,
                    pose: poses[(ti + si) % poses.length],
                    t0: tS,
                    t1: tS + 0.34,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            });
        });

        const mainPlums: ReadonlyArray<{
            branch: BranchData;
            u: number;
            kind: "plumBlossom" | "plumBud";
            sz: number;
            tint: TintRole;
            profile: boolean;
            pose?: PlumOrnament["pose"];
            midground?: boolean;
        }> = [
            // 主景画眼繁簇（密不透风）：在 seg2 折转处排布大小错落、正侧仰背俱全的重叠梅花
            {
                branch: seg2,
                u: 0.46,
                kind: "plumBlossom",
                sz: 15,
                tint: "sub",
                profile: true,
                pose: "side",
                midground: true,
            },
            {
                branch: seg2,
                u: 0.62,
                kind: "plumBlossom",
                sz: 26,
                tint: "accent",
                profile: false,
                pose: "frontal",
            },
            {
                branch: seg2,
                u: 0.72,
                kind: "plumBlossom",
                sz: 20,
                tint: "accent",
                profile: false,
                pose: "upward",
            },
            {
                branch: seg2,
                u: 0.80,
                kind: "plumBlossom",
                sz: 13.5,
                tint: "sub",
                profile: true,
                pose: "back",
                midground: true,
            },
            {
                branch: seg3,
                u: 0.40,
                kind: "plumBud",
                sz: 5.2,
                tint: "accent",
                profile: false,
            },
            {
                branch: seg3,
                u: 0.80,
                kind: "plumBlossom",
                sz: 15,
                tint: "sub",
                profile: true,
                pose: "side",
            },
            {
                branch: seg3,
                u: 0.98,
                kind: "plumBud",
                sz: 4.4,
                tint: "accent",
                profile: false,
            },
        ];
        mainPlums.forEach((sp, si) => {
            const sIdx = Math.round(sp.u * (sp.branch.points.length - 1));
            const tS = lerp(sp.branch.t0, sp.branch.t1, sp.u) + 0.06;
            const earlyWinterBud =
                (solar.termIndex >= 21 || solar.termIndex === 0) &&
                sp.kind === "plumBlossom" && si % 3 === 0;
            const lateWinterBloom = solar.termIndex >= 1 &&
                solar.termIndex <= 3 &&
                sp.kind === "plumBud" && si === 4;
            const resolvedKind = earlyWinterBud
                ? "plumBud"
                : lateWinterBloom
                ? "plumBlossom"
                : sp.kind;
            ornaments.push({
                kind: resolvedKind,
                ghost: false,
                midground: sp.midground,
                branch: sp.branch,
                idx: sIdx,
                angleOffset: si % 2 === 0 ? -0.55 : 0.65,
                size: (resolvedKind === "plumBud" ? 4.8 : Math.max(13, sp.sz)) *
                    S * plumScale,
                rotation: rand(0, 6.28),
                tint: sp.tint,
                profile: sp.profile,
                pose: sp.pose,
                t0: tS,
                t1: tS + 0.34,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });

        // 桌面端「疏可跑马」探空铁梢：分别沿搜索框右侧高空与搜索框下方留白横逸，100% 避让搜索框
        if (!isNarrow) {
            const skyPlums = isHanging
                ? [
                    {
                        parent: seg2,
                        u: 0.72,
                        endX: w - 310 * S,
                        endY: h * 0.72,
                        tSpan: 0.22,
                        minRightSide: true,
                    },
                    {
                        parent: seg3,
                        u: 0.78,
                        endX: tip.x - 130 * S,
                        endY: tip.y + 38 * S,
                        tSpan: 0.20,
                        minRightSide: false,
                    },
                ]
                : [
                    {
                        parent: seg2,
                        u: 0.78,
                        endX: w - 345 * S,
                        endY: Math.max(85, h - 605 * S),
                        tSpan: 0.22,
                        minRightSide: true,
                    },
                    {
                        parent: seg3,
                        u: 0.76,
                        endX: tip.x - 145 * S,
                        endY: Math.max(438 * S, tip.y - 38 * S),
                        tSpan: 0.20,
                        minRightSide: false,
                    },
                ];
            skyPlums.forEach((sp, si) => {
                const pIdx = Math.round(sp.u * (sp.parent.points.length - 1));
                const anc = sp.parent.points[pIdx];
                const endPt = { x: sp.endX, y: sp.endY };
                const ts = lerp(sp.parent.t0, sp.parent.t1, sp.u);
                const cp1X = sp.minRightSide
                    ? Math.max(w - 365 * S, lerp(anc.x, endPt.x, 0.38) + 8 * S)
                    : lerp(anc.x, endPt.x, 0.38) - 18 * S;
                const cp2X = sp.minRightSide
                    ? Math.max(w - 365 * S, lerp(anc.x, endPt.x, 0.72) - 4 * S)
                    : lerp(anc.x, endPt.x, 0.72) + 10 * S;
                const cp1Y = sp.minRightSide
                    ? lerp(anc.y, endPt.y, 0.38) - 18 * S
                    : Math.max(434 * S, lerp(anc.y, endPt.y, 0.38) - 14 * S);
                const cp2Y = sp.minRightSide
                    ? lerp(anc.y, endPt.y, 0.72) - 8 * S
                    : Math.max(434 * S, lerp(anc.y, endPt.y, 0.72) - 6 * S);
                const skyTwig = sampleBranch(
                    { x: anc.x, y: anc.y },
                    { x: cp1X, y: cp1Y },
                    { x: cp2X, y: cp2Y },
                    endPt,
                    {
                        steps: 18,
                        widthStart: 1.15 * S,
                        widthEnd: 0.26 * S,
                        t0: ts,
                        t1: ts + sp.tSpan,
                        flexSpan: 0.62,
                        phase: 1.8 + si,
                        wobble: 0.8 * S,
                        parentRef: { branch: sp.parent, idx: pIdx },
                    },
                    rng,
                );
                branches.push(skyTwig);
                [0.88, 0.99].forEach((bu, bi) => {
                    ornaments.push({
                        kind: "plumBud",
                        ghost: false,
                        branch: skyTwig,
                        idx: Math.round(bu * (skyTwig.points.length - 1)),
                        angleOffset: bi === 0 ? -0.45 : 0.12,
                        size: (4.6 - bi * 0.6) * S,
                        rotation: rand(0, 6.28),
                        tint: "accent",
                        profile: false,
                        t0: skyTwig.t1 - 0.02 + bi * 0.04,
                        t1: skyTwig.t1 + 0.26 + bi * 0.04,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                });
            });
        }
        if (solar.isSnowSeason) {
            for (const b of branches) {
                if (!b.ghost && b.widthStart >= 1.4 * S) {
                    b.snowCushions = true;
                }
            }
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
        const { branches, ornaments } = gen;
        let visitorAnchor: BotanicalVisitorAnchor | null = null;
        let rewardAnchor: BotanicalRewardAnchor | null = null;
        const perchBranch = fgBranches[1] ?? fgBranches[0] ?? branches[0];
        const perchIdx = Math.max(
            2,
            Math.round((perchBranch.points.length - 1) * 0.42),
        );
        visitorAnchor = {
            kind: "sparrow",
            branch: perchBranch,
            idx: perchIdx,
            fireflies,
        };
        const budIndices: number[] = [];
        for (let i = 0; i < ornaments.length && budIndices.length < 2; i++) {
            const orn = ornaments[i];
            if (!orn.ghost && orn.kind === "plumBud") {
                budIndices.push(i);
            }
        }
        const tipBranch = fgBranches[2] ?? fgBranches[0] ?? branches[0];
        rewardAnchor = {
            kind: "plum",
            branch: tipBranch,
            idx: Math.max(1, tipBranch.points.length - 1),
            budIndices,
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
        if (o.kind === "plumBlossom") {
            drawPlumBlossom(ctx, wx, wy, angle, o, op, pal, layerA);
        } else if (o.kind === "plumBud") {
            drawPlumBud(ctx, wx, wy, angle, o, op, pal, layerA);
        }
    },

    traceDrifterPath(ctx: CanvasRenderingContext2D, size: number): void {
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.62, size * 0.48, 0, 0, Math.PI * 2);
    },

    drawReward(
        ctx: CanvasRenderingContext2D,
        scene: BotanicalScene,
        reward: BotanicalRewardAnchor,
        _tipPt: WorldSample,
        bloomP: number,
        pal: BotanicalPalette,
        evalBranch: (branch: BranchData) => WorldSample[],
    ): void {
        const s = scene.scale;
        for (const budIdx of reward.budIndices) {
            const bud = scene.ornaments[budIdx];
            if (!bud || bud.kind !== "plumBud") continue;
            const wp = evalBranch(bud.branch)[bud.idx];
            const blossom: PlumOrnament = {
                ...bud,
                kind: "plumBlossom",
                size: Math.max(bud.size * 2.8, 14 * s) * bloomP,
                tint: "accent",
            };
            drawPlumBlossom(
                ctx,
                wp.x,
                wp.y,
                wp.angle + bud.angleOffset,
                blossom,
                bloomP,
                pal,
                1.0,
            );
        }
    },
};
