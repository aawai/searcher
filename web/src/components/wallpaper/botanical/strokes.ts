import {
    clamp,
    computeBranchWorldPoints,
    easeOutCubic,
    lerp,
} from "./physics.ts";
import type {
    BotanicalPalette,
    BotanicalRuntimeState,
    BranchData,
    ConcreteBotanicalSpecies,
    Point2D,
    RockStroke,
    TintRole,
} from "./types.ts";

export function drawRockBase(
    ctx: CanvasRenderingContext2D,
    rock: RockStroke,
    rawProgress: number,
    scale: number,
    pal: BotanicalPalette,
): void {
    const rp = easeOutCubic(
        clamp((rawProgress - rock.t0) / (rock.t1 - rock.t0), 0, 1),
    );
    if (rp <= 0.02 || rock.points.length < 3) return;
    const pts = rock.points;

    let minX = pts[0].x;
    let maxX = pts[0].x;
    let minY = pts[0].y;
    let maxY = pts[0].y;
    for (let i = 1; i < pts.length; i++) {
        if (pts[i].x < minX) minX = pts[i].x;
        if (pts[i].x > maxX) maxX = pts[i].x;
        if (pts[i].y < minY) minY = pts[i].y;
        if (pts[i].y > maxY) maxY = pts[i].y;
    }

    const traceSmoothRock = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            const prev = pts[i - 1];
            const curr = pts[i];
            ctx.quadraticCurveTo(
                prev.x,
                prev.y,
                (prev.x + curr.x) * 0.5,
                (prev.y + curr.y) * 0.5,
            );
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.closePath();
    };

    // 1. 浑厚没骨石体晕染（偏心径向渐变：有顶无脚，石根化入画布；复杂壁纸下大幅收敛防脏）
    ctx.save();
    if (pal.photoStyle !== "gongbi-line") {
        traceSmoothRock();
        const focalX = lerp(minX, maxX, 0.42);
        const focalY = lerp(minY, maxY, 0.22);
        const rockR = Math.max(8, (maxX - minX) * 0.85);
        const washGrad = ctx.createRadialGradient(
            focalX,
            focalY,
            Math.max(1, rockR * 0.08),
            focalX,
            lerp(minY, maxY, 0.48),
            rockR,
        );
        washGrad.addColorStop(
            0,
            pal.inkGrade("zhong", (pal.isDark ? 0.26 : 0.36) * rp),
        );
        washGrad.addColorStop(
            0.55,
            pal.wash("sub", (pal.isDark ? 0.16 : 0.24) * rp),
        );
        washGrad.addColorStop(1, pal.inkGrade("qing", 0));
        ctx.fillStyle = washGrad;
        ctx.fill();
    }

    // 2. 破墨内层石腹体量
    ctx.save();
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    ctx.translate(cx + 3.2 * scale, cy + 2.4 * scale);
    ctx.scale(0.84, 0.80);
    ctx.translate(-cx, -cy);
    traceSmoothRock();
    const innerGrad = ctx.createLinearGradient(
        cx,
        minY,
        cx,
        Math.max(minY + 4, maxY),
    );
    innerGrad.addColorStop(
        0,
        pal.inkGrade("nong", (pal.isDark ? 0.20 : 0.26) * rp),
    );
    innerGrad.addColorStop(1, pal.inkGrade("qing", 0));
    ctx.fillStyle = innerGrad;
    ctx.fill();
    ctx.restore();

    // 3. 圆融披麻/折带飞白弧皴（沿石脊平滑样条采样，两头鼠尾尖收，零几何硬折线）
    const ridgePtsRaw = pts.slice(1, Math.min(pts.length, 5));
    if (ridgePtsRaw.length >= 3) {
        const samples = 18;
        const spine: Point2D[] = [];
        for (let i = 0; i <= samples; i++) {
            const u = (i / samples) * rp;
            const segF = u * (ridgePtsRaw.length - 1);
            const idx = Math.min(ridgePtsRaw.length - 2, Math.floor(segF));
            const localT = segF - idx;
            const p0 = idx === 0 ? ridgePtsRaw[0] : {
                x: (ridgePtsRaw[idx - 1].x + ridgePtsRaw[idx].x) * 0.5,
                y: (ridgePtsRaw[idx - 1].y + ridgePtsRaw[idx].y) * 0.5,
            };
            const p1 = ridgePtsRaw[idx];
            const p2 = idx + 1 === ridgePtsRaw.length - 1
                ? ridgePtsRaw[idx + 1]
                : {
                    x: (ridgePtsRaw[idx].x + ridgePtsRaw[idx + 1].x) * 0.5,
                    y: (ridgePtsRaw[idx].y + ridgePtsRaw[idx + 1].y) * 0.5,
                };
            const omt = 1 - localT;
            spine.push({
                x: omt * omt * p0.x + 2 * omt * localT * p1.x +
                    localT * localT * p2.x,
                y: omt * omt * p0.y + 2 * omt * localT * p1.y +
                    localT * localT * p2.y,
            });
        }
        const upper: Point2D[] = [];
        const lower: Point2D[] = [];
        const slitUp: Point2D[] = [];
        const slitLo: Point2D[] = [];
        for (let i = 0; i < spine.length; i++) {
            const p = spine[i];
            const next = spine[Math.min(spine.length - 1, i + 1)];
            const prev = spine[Math.max(0, i - 1)];
            const tang = Math.atan2(next.y - prev.y, next.x - prev.x);
            const nx = -Math.sin(tang);
            const ny = Math.cos(tang);
            const env = Math.sin((i / (spine.length - 1)) * Math.PI);
            const hw = (0.28 + 2.15 * env) * scale;
            upper.push({ x: p.x + nx * hw * 0.45, y: p.y + ny * hw * 0.45 });
            lower.push({ x: p.x - nx * hw, y: p.y - ny * hw });
            if (i >= 4 && i <= 14) {
                const sEnv = Math.sin(((i - 4) / 10) * Math.PI);
                const sr = Math.max(0.18, 0.42 * sEnv * scale);
                slitUp.push({
                    x: p.x - nx * hw * 0.25 + nx * sr,
                    y: p.y - ny * hw * 0.25 + ny * sr,
                });
                slitLo.push({
                    x: p.x - nx * hw * 0.25 - nx * sr,
                    y: p.y - ny * hw * 0.25 - ny * sr,
                });
            }
        }
        ctx.beginPath();
        ctx.moveTo(upper[0].x, upper[0].y);
        for (let i = 1; i < upper.length; i++) {
            ctx.lineTo(upper[i].x, upper[i].y);
        }
        for (let i = lower.length - 1; i >= 0; i--) {
            ctx.lineTo(lower[i].x, lower[i].y);
        }
        ctx.closePath();
        if (slitUp.length >= 3) {
            ctx.moveTo(slitUp[0].x, slitUp[0].y);
            for (let i = 1; i < slitUp.length; i++) {
                ctx.lineTo(slitUp[i].x, slitUp[i].y);
            }
            for (let i = slitLo.length - 1; i >= 0; i--) {
                ctx.lineTo(slitLo[i].x, slitLo[i].y);
            }
            ctx.closePath();
        }
        ctx.fillStyle = pal.inkGrade("nong", (pal.isDark ? 0.38 : 0.62) * rp);
        ctx.fill("evenodd");
    }

    // 内部柔和弯曲的新月形淡墨石理弧影
    if (pts.length >= 5) {
        const c0 = {
            x: lerp(pts[2].x, pts[1].x, 0.35),
            y: lerp(pts[2].y, pts[1].y, 0.35) + 6 * scale,
        };
        const c1 = {
            x: lerp(pts[2].x, pts[0].x, 0.58),
            y: lerp(pts[2].y, pts[0].y, 0.52),
        };
        ctx.beginPath();
        ctx.moveTo(c0.x, c0.y);
        ctx.quadraticCurveTo(
            lerp(c0.x, c1.x, 0.5) - 5 * scale,
            lerp(c0.y, c1.y, 0.5) - 3 * scale,
            c1.x,
            c1.y,
        );
        ctx.quadraticCurveTo(
            lerp(c0.x, c1.x, 0.5) + 1.5 * scale,
            lerp(c0.y, c1.y, 0.5) + 2.5 * scale,
            c0.x,
            c0.y,
        );
        ctx.closePath();
        ctx.fillStyle = pal.inkGrade("zhong", (pal.isDark ? 0.22 : 0.34) * rp);
        ctx.fill();
    }

    // 4. 攒三聚五点苔：焦墨苔点与矿物赭绿点缀相生
    for (let mi = 0; mi < rock.mossDots.length; mi++) {
        const m = rock.mossDots[mi];
        ctx.beginPath();
        ctx.ellipse(m.x, m.y, m.rx, m.ry, m.rot, 0, Math.PI * 2);
        ctx.fillStyle = mi % 3 === 1
            ? pal.wash("sub", (pal.isDark ? 0.42 : 0.58) * rp)
            : pal.inkGrade("jiao", (pal.isDark ? 0.56 : 0.82) * rp);
        ctx.fill();
    }
    ctx.restore();
}

export function strokeGongbiOutline(
    ctx: CanvasRenderingContext2D,
    tint: TintRole,
    pal: BotanicalPalette,
    alpha: number,
    width = 0.72,
): void {
    if (pal.photoStyle !== "gongbi-line") return;
    ctx.save();
    ctx.strokeStyle = pal.isDark
        ? pal.goldDust(0.76 * alpha)
        : pal.stroke(tint === "ink" ? "ink" : tint, 0.72 * alpha);
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
}

export function strokeWaterline(
    ctx: CanvasRenderingContext2D,
    tint: TintRole,
    pal: BotanicalPalette,
    scale: number,
    alpha: number,
    span = 18,
): void {
    ctx.save();
    const gradSpan = Math.max(4, span * scale);
    const grad = ctx.createLinearGradient(
        0,
        0,
        gradSpan,
        gradSpan * 0.35,
    );
    grad.addColorStop(0, pal.waterline(tint, 0));
    grad.addColorStop(0.45, pal.waterline(tint, alpha * 0.45));
    grad.addColorStop(1, pal.waterline(tint, alpha));
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(0.36, 0.54 * scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
}

export function drawTaperedBranch(
    ctx: CanvasRenderingContext2D,
    branch: BranchData,
    species: ConcreteBotanicalSpecies,
    rawProgress: number,
    timeSec: number,
    reducedMotion: boolean,
    windCalm: number,
    scale: number,
    frameSeq: number,
    pal: BotanicalPalette,
    breezeImpulse = 0,
    runtime?: BotanicalRuntimeState,
): void {
    const bp = easeOutCubic(
        clamp((rawProgress - branch.t0) / (branch.t1 - branch.t0), 0, 1),
    );
    if (bp <= 0.005) return;

    const pts = branch.points;
    const worldPts = computeBranchWorldPoints(
        branch,
        timeSec,
        reducedMotion,
        windCalm,
        scale,
        frameSeq,
        breezeImpulse,
        runtime,
    );
    const totalSegs = pts.length - 1;
    const maxFloat = bp * totalSegs;
    const maxIdx = Math.floor(maxFloat);
    const frac = maxFloat - maxIdx;
    const layerA = branch.ghost ? 0.15 : branch.midground ? 0.45 : 1.0;
    const isFern = species === "fern";
    const isIronPlum = branch.brushStyle === "iron-plum";
    const widthBoost = isFern
        ? (branch.ghost ? 0.92 : branch.midground ? 1.05 : 1.18)
        : (branch.ghost
            ? 1.0
            : branch.midground
            ? 1.15
            : branch.parentRef
            ? 1.25
            : 1.48);

    const calcHalfWidth = (u: number): number => {
        const cadenceAmp = isFern ? 0.09 : isIronPlum ? 0.30 : 0.24;
        const cadence = 1 +
            cadenceAmp * Math.sin(u * Math.PI * 4.5 + branch.phase * 2.1) *
                Math.sin(u * Math.PI);
        const tipTaper = u > 0.78 ? lerp(1, 0.20, (u - 0.78) / 0.22) : 1;
        return Math.max(
            0.25,
            lerp(branch.widthStart, branch.widthEnd, u) * widthBoost * cadence *
                tipTaper * 0.5,
        );
    };

    const spine: Array<
        { x: number; y: number; angle: number; hw: number; u: number }
    > = [];
    for (let i = 0; i <= maxIdx; i++) {
        const wp = worldPts[i];
        const u = i / totalSegs;
        spine.push({
            x: wp.x,
            y: wp.y,
            angle: wp.angle,
            hw: calcHalfWidth(u),
            u,
        });
    }
    if (maxIdx < totalSegs && frac > 0.01) {
        const pA = worldPts[maxIdx];
        const pB = worldPts[maxIdx + 1];
        const u = (maxIdx + frac) / totalSegs;
        spine.push({
            x: lerp(pA.x, pB.x, frac),
            y: lerp(pA.y, pB.y, frac),
            angle: lerp(pA.angle, pB.angle, frac),
            hw: calcHalfWidth(u),
            u,
        });
    }
    if (spine.length < 2) return;

    // Layer A: Soft wet-ink bleed on Xuan paper (skip for ghost/midground/gongbi-line)
    if (
        !branch.ghost && !branch.midground &&
        pal.photoStyle !== "gongbi-line"
    ) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(spine[0].x, spine[0].y);
        for (let i = 1; i < spine.length; i++) {
            ctx.lineTo(spine[i].x, spine[i].y);
        }
        ctx.strokeStyle = pal.wash(
            "ink",
            isFern ? 0.14 : 0.30,
        );
        ctx.lineWidth = Math.max(
            1.2,
            (branch.widthStart + branch.widthEnd) *
                    (isFern ? 0.52 : 0.68) +
                (isFern ? 1.0 : 2.1) * scale,
        );
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();
    }

    const leftEdge: Point2D[] = [];
    const rightEdge: Point2D[] = [];
    for (const p of spine) {
        const nx = -Math.sin(p.angle);
        const ny = Math.cos(p.angle);
        leftEdge.push({ x: p.x + nx * p.hw, y: p.y + ny * p.hw });
        rightEdge.push({ x: p.x - nx * p.hw, y: p.y - ny * p.hw });
    }

    // Layer B: Expressive sumi-ink trunk body + evenodd dry-brush feibai slits
    ctx.beginPath();
    ctx.moveTo(leftEdge[0].x, leftEdge[0].y);
    for (let i = 1; i < leftEdge.length; i++) {
        ctx.lineTo(leftEdge[i].x, leftEdge[i].y);
    }
    const tip = spine[spine.length - 1];
    ctx.arc(
        tip.x,
        tip.y,
        tip.hw,
        tip.angle + Math.PI * 0.5,
        tip.angle - Math.PI * 0.5,
        true,
    );
    for (let i = rightEdge.length - 1; i >= 0; i--) {
        ctx.lineTo(rightEdge[i].x, rightEdge[i].y);
    }
    const start = spine[0];
    ctx.arc(
        start.x,
        start.y,
        start.hw,
        start.angle - Math.PI * 0.5,
        start.angle + Math.PI * 0.5,
        true,
    );
    ctx.closePath();

    // True non-destructive evenodd dry-brush flying-white (feibai) slits
    const allowFeibai = !isFern &&
        !branch.ghost &&
        !branch.midground &&
        spine.length > 8 &&
        branch.widthStart > 1.65 * scale;
    if (allowFeibai) {
        const slits = branch.widthStart >= 4.2 * scale
            ? [
                { u0: 0.14, u1: 0.39, off: -0.26 },
                { u0: 0.42, u1: 0.72, off: 0.22 },
                { u0: 0.64, u1: 0.88, off: -0.14 },
            ]
            : [
                { u0: 0.18, u1: 0.44, off: -0.24 },
                { u0: 0.50, u1: 0.78, off: 0.20 },
            ];
        for (const sl of slits) {
            const seg = spine.filter((p) => p.u >= sl.u0 && p.u <= sl.u1);
            if (seg.length < 4) continue;
            const sUp: Point2D[] = [];
            const sLo: Point2D[] = [];
            for (let i = 0; i < seg.length; i++) {
                const p = seg[i];
                const env = Math.sin((i / (seg.length - 1)) * Math.PI);
                const nx = -Math.sin(p.angle);
                const ny = Math.cos(p.angle);
                const cx = p.x + nx * p.hw * sl.off;
                const cy = p.y + ny * p.hw * sl.off;
                const sr = Math.max(0.22, p.hw * 0.17 * env);
                sUp.push({ x: cx - nx * sr, y: cy - ny * sr });
                sLo.push({ x: cx + nx * sr, y: cy + ny * sr });
            }
            ctx.moveTo(sUp[0].x, sUp[0].y);
            for (let i = 1; i < sUp.length; i++) {
                ctx.lineTo(sUp[i].x, sUp[i].y);
            }
            for (let i = sLo.length - 1; i >= 0; i--) {
                ctx.lineTo(sLo[i].x, sLo[i].y);
            }
            ctx.closePath();
        }
    }

    const isWoodyHero = !isFern &&
        !branch.ghost &&
        !branch.midground;
    ctx.fillStyle = isWoodyHero
        ? pal.inkGrade("nong", 0.86 * layerA)
        : pal.stroke("ink", layerA);
    ctx.fill(allowFeibai ? "evenodd" : "nonzero");

    // 老辣古木：轻染苍古赭石皮色 + 背光侧破墨焦墨重脊
    if (isWoodyHero && branch.widthStart >= 3.8 * scale && spine.length > 5) {
        ctx.fillStyle = pal.wash("sub", 0.22 * layerA);
        ctx.fill(allowFeibai ? "evenodd" : "nonzero");

        const spineL: Point2D[] = [];
        const spineR: Point2D[] = [];
        for (const p of spine) {
            const nx = -Math.sin(p.angle);
            const ny = Math.cos(p.angle);
            const cx = p.x - nx * p.hw * 0.30;
            const cy = p.y - ny * p.hw * 0.30;
            const rHw = Math.max(0.25, p.hw * 0.42);
            spineL.push({ x: cx + nx * rHw, y: cy + ny * rHw });
            spineR.push({ x: cx - nx * rHw, y: cy - ny * rHw });
        }
        ctx.beginPath();
        ctx.moveTo(spineL[0].x, spineL[0].y);
        for (let i = 1; i < spineL.length; i++) {
            ctx.lineTo(spineL[i].x, spineL[i].y);
        }
        for (let i = spineR.length - 1; i >= 0; i--) {
            ctx.lineTo(spineR[i].x, spineR[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = pal.inkGrade("jiao", 0.94 * layerA);
        ctx.fill();
    }

    // 木本分枝「岐出顿节（上掖下托）」与腋芽苔点，消除圆头直线拼接感
    if (
        branch.parentRef !== null &&
        !branch.ghost &&
        !isFern &&
        spine.length > 2
    ) {
        const s0 = spine[0];
        const nx = -Math.sin(s0.angle);
        const ny = Math.cos(s0.angle);
        const collarR = Math.max(1.2, s0.hw * 1.32);
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(
            s0.x,
            s0.y,
            collarR * 0.72,
            collarR * 1.05,
            s0.angle,
            0,
            Math.PI * 2,
        );
        ctx.fillStyle = pal.inkGrade("jiao", 0.78 * layerA);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(
            s0.x + nx * s0.hw * 1.15,
            s0.y + ny * s0.hw * 1.15,
            Math.max(0.75, 1.05 * scale),
            0,
            Math.PI * 2,
        );
        ctx.fillStyle = pal.inkGrade("jiao", 0.68 * layerA);
        ctx.fill();
        ctx.restore();
    }

    // Horizontal moss dots (taidian) along main branch turns
    if (
        !isFern &&
        !branch.ghost &&
        !branch.midground &&
        branch.widthStart > 1.8 * scale &&
        spine.length > 6
    ) {
        const knotTargets = [0.24, 0.46, 0.68, 0.82];
        ctx.fillStyle = pal.inkGrade("jiao", 0.86);
        for (let k = 0; k < knotTargets.length; k++) {
            const targetU = knotTargets[k];
            if (bp < targetU + 0.05) continue;
            const idx = Math.min(
                spine.length - 1,
                Math.floor(targetU * totalSegs),
            );
            const kp = spine[idx];
            const side = (k + Math.round(branch.phase * 2)) % 2 === 0 ? 1 : -1;
            const nx = -Math.sin(kp.angle) * side;
            const ny = Math.cos(kp.angle) * side;
            ctx.beginPath();
            ctx.ellipse(
                kp.x + nx * kp.hw * 0.92,
                kp.y + ny * kp.hw * 0.92,
                Math.max(1.1, kp.hw * 0.68),
                Math.max(0.65, kp.hw * 0.36),
                kp.angle + 0.35 * side,
                0,
                Math.PI * 2,
            );
            ctx.fill();
        }
    }

    // Sculpted winter snow cushions on upper edge of plum branches
    if (branch.snowCushions && !branch.ghost && spine.length > 8) {
        ctx.save();
        for (let i = 3; i < spine.length - 5; i += 6) {
            const p0 = spine[i];
            const p1 = spine[i + 2];
            const p2 = spine[i + 3];
            const nx = -Math.sin(p1.angle);
            const ny = Math.cos(p1.angle);
            const sign = ny < 0 ? 1 : -1;
            const lift = p1.hw + 2.2 * scale;
            const ax = p0.x + nx * sign * p0.hw * 0.82;
            const ay = p0.y + ny * sign * p0.hw * 0.82;
            const bx = p2.x + nx * sign * p2.hw * 0.82;
            const by = p2.y + ny * sign * p2.hw * 0.82;
            const cx = p1.x + nx * sign * lift;
            const cy = p1.y + ny * sign * lift - 1.2 * scale;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.quadraticCurveTo(cx, cy, bx, by);
            ctx.quadraticCurveTo(p1.x, p1.y, ax, ay);
            ctx.closePath();
            ctx.fillStyle = pal.luminous(pal.isDark ? 0.52 : 0.90);
            ctx.fill();
            ctx.strokeStyle = pal.inkGrade("dan", pal.isDark ? 0.22 : 0.35);
            ctx.lineWidth = Math.max(0.45, 0.55 * scale);
            ctx.stroke();
        }
        ctx.restore();
    }

    if (
        !reducedMotion && !branch.ghost && !branch.midground && bp > 0.02 &&
        bp < 0.98
    ) {
        const tipFade = Math.sin(bp * Math.PI);
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = pal.stroke("accent", 0.85 * tipFade);
        ctx.fill();
    }
}
