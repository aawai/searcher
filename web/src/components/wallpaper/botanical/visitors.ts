import type { BotanicalResonanceKind } from "../botanical-resonance.ts";
import { clamp, computeBranchWorldPoints, easeOutCubic } from "./physics.ts";
import type {
    BotanicalOrnament,
    BotanicalPalette,
    BotanicalPointerState,
    BotanicalRewardAnchor,
    BotanicalRuntimeState,
    BotanicalScene,
    Drifter,
    FireflySeed,
} from "./types.ts";

export function spawnDrifter(
    scene: BotanicalScene,
    drifters: Drifter[],
    timeSec: number,
    windCalm: number,
    frameSeq: number,
    fromOrn: BotanicalOrnament | null = null,
): void {
    if (!scene.ornaments.length) return;
    let cand = fromOrn;
    if (!cand) {
        const fgOrns = scene.ornaments.filter((o) => !o.ghost);
        const pool = fgOrns.length ? fgOrns : scene.ornaments;
        cand = pool[Math.floor(Math.random() * pool.length)];
    }
    const wp = computeBranchWorldPoints(
        cand.branch,
        timeSec,
        false,
        windCalm,
        scene.scale,
        frameSeq,
    )[cand.idx];
    const driftDir = scene.side === "left" ? 1 : -1;
    drifters.push({
        species: scene.species,
        x: wp.x,
        y: wp.y,
        vx: driftDir * (14 + Math.random() * 14),
        vy: 15 + Math.random() * 11,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.8,
        phase: Math.random() * Math.PI * 2,
        size: (7 + Math.random() * 5) * scene.scale,
        tint: Math.random() < 0.55 ? "accent" : "sub",
        born: timeSec,
        life: 6.5 + Math.random() * 3,
    });
}

export function drawDrifters(
    ctx: CanvasRenderingContext2D,
    scene: BotanicalScene,
    drifters: Drifter[],
    height: number,
    timeSec: number,
    dt: number,
    pal: BotanicalPalette,
    windForce = 0,
): void {
    const driftDir = scene.side === "left" ? 1 : -1;
    for (let i = drifters.length - 1; i >= 0; i--) {
        const d = drifters[i];
        const age = timeSec - d.born;
        if (age >= d.life || d.y > height + 40) {
            drifters.splice(i, 1);
            continue;
        }
        if (d.species !== scene.species) continue;
        if (d.species === "ginkgo" || d.species === "maple") {
            const pend = Math.sin(age * 2.25 + d.phase);
            const pendCos = Math.cos(age * 2.25 + d.phase);
            d.x += (d.vx * 0.68 + pend * 26 + windForce * driftDir * 26) * dt;
            d.y += d.vy * (0.68 + 0.42 * Math.abs(pendCos)) * dt;
            d.rot += (d.vrot * 0.35 + pendCos * 1.15) * dt;
        } else {
            d.x += (d.vx + Math.sin(timeSec * 1.45 + d.phase) * 15 +
                windForce * driftDir * 28) * dt;
            d.y += d.vy * dt;
            d.rot += d.vrot * dt;
        }

        const fadeIn = clamp(age / 0.6, 0, 1);
        const fadeOut = clamp((d.life - age) / 1.4, 0, 1);
        const alpha = fadeIn * fadeOut * 0.8;
        const flipY = 0.38 + 0.62 * Math.abs(Math.cos(timeSec * 1.9 + d.phase));

        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        ctx.scale(1, flipY);

        scene.module.traceDrifterPath(ctx, d.size);

        const rGrad = Math.max(2, d.size);
        const grad = ctx.createRadialGradient(0, 0, 0.5, 0, 0, rGrad);
        grad.addColorStop(0, pal.wash(d.tint, alpha * 1.3));
        grad.addColorStop(0.65, pal.fill(d.tint, alpha * 0.9));
        grad.addColorStop(1, pal.fill(d.tint, 0));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
    }
}

export function triggerBotanicalResonance(
    runtime: BotanicalRuntimeState,
    kind: BotanicalResonanceKind,
    timeSec: number,
    scene: BotanicalScene | null,
    drifters: Drifter[],
    windCalm: number,
    frameSeq: number,
    options?: { isDark?: boolean; forceVisitor?: boolean },
): void {
    const canScareVisitor = Boolean(
        scene?.visitorAnchor &&
            scene.visitorAnchor.kind !== "dew-or-firefly" &&
            (options?.forceVisitor || scene.visitorPresent || runtime.awakened),
    );
    const canDropDew = Boolean(
        scene?.visitorAnchor?.kind === "dew-or-firefly" && !options?.isDark,
    );
    const scareVisitor = (speed: number, vy: number) => {
        if (!canScareVisitor || !scene?.visitorAnchor) return;
        if (runtime.visitorMode !== "perched") return;
        const flyDir = scene.side === "left" ? 1 : -1;
        runtime.visitorMode = "departing";
        runtime.visitorStateStartSec = timeSec;
        if (runtime.visitorX === 0 && runtime.visitorY === 0) {
            const pt = scene.visitorAnchor.branch.points[
                scene.visitorAnchor.idx
            ];
            if (pt) {
                runtime.visitorX = pt.x;
                runtime.visitorY = pt.y;
            }
        }
        runtime.visitorVx = speed * flyDir;
        runtime.visitorVy = vy;
    };
    const dropDew = () => {
        if (!canDropDew) return;
        if (runtime.dewState !== "hanging") return;
        runtime.dewState = "falling";
        runtime.dewStateStartSec = timeSec;
        runtime.dewFallDist = 0;
    };

    switch (kind) {
        case "quick-capture": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 1.15;
            runtime.windVel = clamp(runtime.windVel + 3.8, -6.5, 6.5);
            runtime.fireflyBoostStartSec = timeSec;
            if (scene && drifters.length < 4) {
                spawnDrifter(
                    scene,
                    drifters,
                    timeSec,
                    windCalm,
                    frameSeq,
                    null,
                );
            }
            scareVisitor(74, -62);
            dropDew();
            break;
        }
        case "task-completed": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 0.72;
            runtime.windVel = clamp(runtime.windVel + 2.4, -6.5, 6.5);
            runtime.fireflyBoostStartSec = timeSec;
            dropDew();
            break;
        }
        case "tasks-cleared": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 1.35;
            runtime.windVel = clamp(runtime.windVel + 4.4, -6.5, 6.5);
            runtime.awakened = true;
            runtime.awakenStartSec = timeSec;
            runtime.haloPulseStartSec = timeSec;
            runtime.fireflyBoostStartSec = timeSec;
            break;
        }
        case "theme-ripple": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 0.9;
            runtime.windVel = clamp(runtime.windVel + 3.0, -6.5, 6.5);
            break;
        }
        case "search-submit": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 0.8;
            runtime.windVel = clamp(runtime.windVel + 2.7, -6.5, 6.5);
            runtime.fireflyBoostStartSec = timeSec;
            scareVisitor(70, -58);
            dropDew();
            break;
        }
        case "ai-thinking": {
            runtime.gustDurationSec = 0;
            runtime.breezeImpulseStrength = 0;
            runtime.windVel *= 0.25;
            break;
        }
        case "ai-complete": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 0.42;
            runtime.windVel = clamp(runtime.windVel + 1.5, -6.5, 6.5);
            runtime.haloPulseStartSec = timeSec;
            runtime.fireflyBoostStartSec = timeSec;
            break;
        }
    }
}

export function drawSparrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    alpha: number,
    pal: BotanicalPalette,
    flapping: boolean,
    timeSec: number,
    reducedMotion: boolean,
    facingRight = false,
): void {
    if (alpha <= 0.02) return;
    const s = scale;
    // Occasional gentle head glance instead of perpetual mechanical bobbing
    const glancePhase = timeSec % 9.5;
    const headTilt = reducedMotion || flapping || glancePhase > 1.4
        ? 0
        : Math.sin((glancePhase / 1.4) * Math.PI) * 0.14;
    const tailAngle = reducedMotion || flapping ? -0.36 : -0.39;

    ctx.save();
    ctx.translate(x, y);
    if (facingRight) ctx.scale(-1, 1);

    if (!flapping) {
        ctx.strokeStyle = pal.inkGrade("jiao", 0.85 * alpha);
        ctx.lineWidth = Math.max(0.7, 0.9 * s);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-2 * s, -4 * s);
        ctx.lineTo(-3 * s, 0.5 * s);
        ctx.moveTo(2.5 * s, -4 * s);
        ctx.lineTo(2 * s, 0.5 * s);
        ctx.stroke();
    }

    // Stroke 1: Crisp upturned Xieyi tail brush
    ctx.save();
    ctx.translate(7 * s, -7 * s);
    ctx.rotate(tailAngle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(7 * s, -2.5 * s, 14 * s, -3.2 * s);
    ctx.lineTo(12 * s, 1.4 * s);
    ctx.closePath();
    ctx.fillStyle = pal.inkGrade("nong", 0.86 * alpha);
    ctx.fill();
    ctx.restore();

    // Stroke 2: Boneless pale-ink belly wash
    const bellyGrad = ctx.createRadialGradient(
        -2 * s,
        -9 * s,
        0.5,
        0,
        -8 * s,
        11 * s,
    );
    bellyGrad.addColorStop(0, pal.wash("ink", 1.15 * alpha));
    bellyGrad.addColorStop(0.7, pal.fill("ink", 0.9 * alpha));
    bellyGrad.addColorStop(1, pal.fill("ink", 0.25 * alpha));
    ctx.beginPath();
    ctx.ellipse(0, -8 * s, 8.8 * s, 6.2 * s, -0.22, 0, Math.PI * 2);
    ctx.fillStyle = bellyGrad;
    ctx.fill();

    // Warm ochre/accent throat dab
    ctx.beginPath();
    ctx.ellipse(-5 * s, -9.5 * s, 4.2 * s, 3.4 * s, -0.1, 0, Math.PI * 2);
    ctx.fillStyle = pal.wash("accent", 0.38 * alpha);
    ctx.fill();

    // Stroke 3: Head, beak & negative-space bright eye
    ctx.save();
    ctx.translate(-6.2 * s, -13.5 * s);
    ctx.rotate(headTilt);
    ctx.beginPath();
    ctx.arc(0, 0, 4.5 * s, 0, Math.PI * 2);
    ctx.fillStyle = pal.inkGrade("jiao", 0.88 * alpha);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(1.0 * s, 0.9 * s, 2.2 * s, 1.5 * s, 0.1, 0, Math.PI * 2);
    ctx.fillStyle = pal.highlight(0.75 * alpha);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-4.0 * s, -0.7 * s);
    ctx.lineTo(-8.0 * s, 0.4 * s);
    ctx.lineTo(-4.0 * s, 1.4 * s);
    ctx.closePath();
    ctx.fillStyle = pal.inkGrade("jiao", 0.92 * alpha);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-1.6 * s, -0.7 * s, Math.max(0.9, 1.05 * s), 0, Math.PI * 2);
    ctx.fillStyle = pal.highlight(0.95 * alpha);
    ctx.fill();
    ctx.restore();

    // Stroke 4: Folded or flapping Xieyi wings
    if (flapping) {
        const flap = Math.sin(timeSec * 34) * 0.65;
        for (const side of [-1, 1] as const) {
            ctx.save();
            ctx.translate(-1 * s, -11 * s);
            ctx.rotate(-0.4 + flap * side);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(6 * s, -14 * s, 14.5 * s, -8 * s);
            ctx.quadraticCurveTo(7 * s, -2 * s, 0, 0);
            ctx.fillStyle = pal.inkGrade("nong", 0.82 * alpha);
            ctx.fill();
            ctx.restore();
        }
    } else {
        ctx.beginPath();
        ctx.moveTo(-2 * s, -11.5 * s);
        ctx.quadraticCurveTo(5 * s, -12.8 * s, 10 * s, -6.5 * s);
        ctx.quadraticCurveTo(3 * s, -5.5 * s, -2 * s, -11.5 * s);
        ctx.fillStyle = pal.inkGrade("jiao", 0.86 * alpha);
        ctx.fill();
    }

    ctx.restore();
}

export function drawLadybug(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    scale: number,
    alpha: number,
    pal: BotanicalPalette,
    flying: boolean,
    timeSec: number,
    reducedMotion: boolean,
): void {
    if (alpha <= 0.02) return;
    const s = scale;
    const antTwitch = reducedMotion ? 0 : Math.sin(timeSec * 4.5) * 0.14;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Subtle open translucent wings when flying
    if (flying) {
        const wingFlap = Math.sin(timeSec * 42) * 0.25;
        for (const side of [-1, 1] as const) {
            ctx.save();
            ctx.rotate(side * (0.65 + wingFlap));
            ctx.beginPath();
            ctx.ellipse(3.5 * s, 0, 4.5 * s, 1.8 * s, 0, 0, Math.PI * 2);
            ctx.fillStyle = pal.luminous(0.45 * alpha);
            ctx.fill();
            ctx.restore();
        }
    }

    // Accent/vermilion shell
    const shellGrad = ctx.createRadialGradient(
        -0.5 * s,
        -0.5 * s,
        0.3,
        0,
        0,
        4.6 * s,
    );
    shellGrad.addColorStop(0, pal.wash("accent", 1.35 * alpha));
    shellGrad.addColorStop(1, pal.stroke("accent", 0.92 * alpha));
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.2 * s, 3.3 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = shellGrad;
    ctx.fill();
    ctx.strokeStyle = pal.stroke("ink", 0.72 * alpha);
    ctx.lineWidth = Math.max(0.55, 0.7 * s);
    ctx.stroke();

    // Pronotum (head cap) with white eye-spots & fine legs
    ctx.beginPath();
    ctx.arc(-3.5 * s, 0, 1.65 * s, 0, Math.PI * 2);
    ctx.fillStyle = pal.inkGrade("jiao", 0.92 * alpha);
    ctx.fill();
    ctx.fillStyle = pal.highlight(0.88 * alpha);
    ctx.beginPath();
    ctx.arc(-3.3 * s, -0.7 * s, Math.max(0.35, 0.48 * s), 0, Math.PI * 2);
    ctx.arc(-3.3 * s, 0.7 * s, Math.max(0.35, 0.48 * s), 0, Math.PI * 2);
    ctx.fill();

    // Fine gripping legs
    ctx.strokeStyle = pal.inkGrade("nong", 0.65 * alpha);
    ctx.lineWidth = Math.max(0.4, 0.5 * s);
    ctx.beginPath();
    ctx.moveTo(-1.2 * s, -2.8 * s);
    ctx.lineTo(-2.4 * s, -4.4 * s);
    ctx.moveTo(1.2 * s, -2.8 * s);
    ctx.lineTo(1.8 * s, -4.4 * s);
    ctx.moveTo(-1.2 * s, 2.8 * s);
    ctx.lineTo(-2.4 * s, 4.4 * s);
    ctx.moveTo(1.2 * s, 2.8 * s);
    ctx.lineTo(1.8 * s, 4.4 * s);
    ctx.stroke();

    // Antennae
    ctx.strokeStyle = pal.stroke("ink", 0.8 * alpha);
    ctx.lineWidth = Math.max(0.45, 0.55 * s);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-4.8 * s, -0.5 * s);
    ctx.lineTo(-6.8 * s, (-1.6 + antTwitch) * s);
    ctx.moveTo(-4.8 * s, 0.5 * s);
    ctx.lineTo(-6.8 * s, (1.6 - antTwitch) * s);
    ctx.stroke();

    // Center suture & spots
    ctx.beginPath();
    ctx.moveTo(-2.2 * s, 0);
    ctx.lineTo(4.0 * s, 0);
    ctx.stroke();

    ctx.fillStyle = pal.stroke("ink", 0.9 * alpha);
    const spots: readonly [number, number, number][] = [
        [-0.4, -1.4, 0.65],
        [1.6, -1.1, 0.55],
        [0.4, 1.3, 0.65],
        [2.1, 0.9, 0.5],
    ];
    for (const [sx, sy, sr] of spots) {
        ctx.beginPath();
        ctx.arc(sx * s, sy * s, Math.max(0.45, sr * s), 0, Math.PI * 2);
        ctx.fill();
    }

    // Specular highlight dot
    ctx.beginPath();
    ctx.arc(-0.8 * s, -1.1 * s, Math.max(0.4, 0.65 * s), 0, Math.PI * 2);
    ctx.fillStyle = pal.luminous(0.85 * alpha);
    ctx.fill();

    ctx.restore();
}

export function drawDewdropAndRipple(
    ctx: CanvasRenderingContext2D,
    tipX: number,
    tipY: number,
    runtime: BotanicalRuntimeState,
    timeSec: number,
    _dt: number,
    scale: number,
    pal: BotanicalPalette,
    reducedMotion: boolean,
): void {
    if (reducedMotion) {
        // Static crystal dewdrop at leaf tip
        ctx.save();
        ctx.translate(tipX, tipY + 2 * scale);
        ctx.beginPath();
        ctx.moveTo(0, -3.5 * scale);
        ctx.bezierCurveTo(
            2.5 * scale,
            -0.5 * scale,
            2.6 * scale,
            3.2 * scale,
            0,
            3.6 * scale,
        );
        ctx.bezierCurveTo(
            -2.6 * scale,
            3.2 * scale,
            -2.5 * scale,
            -0.5 * scale,
            0,
            -3.5 * scale,
        );
        ctx.fillStyle = pal.luminous(0.85);
        ctx.fill();
        ctx.strokeStyle = pal.stroke("accent", 0.65);
        ctx.lineWidth = Math.max(0.55, 0.75 * scale);
        ctx.stroke();
        ctx.restore();
        return;
    }

    if (runtime.dewState === "hanging") {
        if (runtime.dewStateStartSec < -100) {
            runtime.dewStateStartSec = timeSec;
        }
        if (timeSec - runtime.dewStateStartSec > 26) {
            runtime.dewState = "falling";
            runtime.dewStateStartSec = timeSec;
            runtime.dewFallDist = 0;
        }
    }

    if (runtime.dewState === "falling") {
        const fallAge = timeSec - runtime.dewStateStartSec;
        runtime.dewFallDist = 0.5 * 360 * scale * fallAge * fallAge;
        const dropY = tipY + 2 * scale + runtime.dewFallDist;
        const maxFall = 95 * scale;
        if (runtime.dewFallDist >= maxFall) {
            runtime.dewState = "ripple";
            runtime.dewStateStartSec = timeSec;
            runtime.dewImpactX = tipX;
            runtime.dewImpactY = tipY + maxFall;
        } else {
            ctx.save();
            ctx.translate(tipX, dropY);
            ctx.beginPath();
            ctx.ellipse(0, 0, 1.8 * scale, 2.8 * scale, 0, 0, Math.PI * 2);
            ctx.fillStyle = pal.luminous(0.88);
            ctx.fill();
            ctx.strokeStyle = pal.stroke("accent", 0.7);
            ctx.lineWidth = Math.max(0.55, 0.75 * scale);
            ctx.stroke();
            ctx.restore();
            return;
        }
    }

    if (runtime.dewState === "ripple") {
        const rAge = timeSec - runtime.dewStateStartSec;
        const dur = 1.6;
        if (rAge >= dur) {
            runtime.dewState = "regrowing";
            runtime.dewStateStartSec = timeSec;
        } else {
            const p = rAge / dur;
            for (let k = 0; k < 2; k++) {
                const kp = clamp((p - k * 0.22) / (1 - k * 0.22), 0, 1);
                if (kp <= 0) continue;
                const rx = (4 + easeOutCubic(kp) * 26) * scale;
                const ry = rx * 0.3;
                const a = (1 - kp) * 0.58;
                ctx.beginPath();
                ctx.ellipse(
                    runtime.dewImpactX,
                    runtime.dewImpactY,
                    rx,
                    ry,
                    0,
                    0,
                    Math.PI * 2,
                );
                ctx.strokeStyle = k === 0
                    ? pal.stroke("ink", a)
                    : pal.stroke("accent", a * 0.85);
                ctx.lineWidth = Math.max(0.5, (1.1 - kp * 0.6) * scale);
                ctx.stroke();
            }
            return;
        }
    }

    let growScale = 1;
    if (runtime.dewState === "regrowing") {
        const gAge = timeSec - runtime.dewStateStartSec;
        if (gAge >= 6.0) {
            runtime.dewState = "hanging";
            runtime.dewStateStartSec = timeSec;
            growScale = 1;
        } else {
            growScale = easeOutCubic(clamp(gAge / 6.0, 0.05, 1));
        }
    }

    const tremble = Math.sin(timeSec * 3.2) * 0.35 * scale * growScale;
    const ds = scale * growScale;
    ctx.save();
    ctx.translate(tipX + tremble, tipY + 2 * ds);
    ctx.beginPath();
    ctx.moveTo(0, -3.2 * ds);
    ctx.bezierCurveTo(2.4 * ds, -0.4 * ds, 2.5 * ds, 3.0 * ds, 0, 3.4 * ds);
    ctx.bezierCurveTo(-2.5 * ds, 3.0 * ds, -2.4 * ds, -0.4 * ds, 0, -3.2 * ds);
    ctx.fillStyle = pal.luminous(0.86 * growScale);
    ctx.fill();
    ctx.strokeStyle = pal.stroke("accent", 0.68 * growScale);
    ctx.lineWidth = Math.max(0.5, 0.72 * ds);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-0.7 * ds, 0.8 * ds, Math.max(0.35, 0.7 * ds), 0, Math.PI * 2);
    ctx.fillStyle = pal.luminous(0.95 * growScale);
    ctx.fill();
    ctx.restore();
}

export function drawFireflies(
    ctx: CanvasRenderingContext2D,
    seeds: readonly FireflySeed[],
    runtime: BotanicalRuntimeState,
    timeSec: number,
    scale: number,
    pal: BotanicalPalette,
    pointer: BotanicalPointerState,
    reducedMotion: boolean,
): void {
    const boostAge = timeSec - runtime.fireflyBoostStartSec;
    const boost = !reducedMotion && boostAge >= 0 && boostAge < 1.8
        ? 1 + Math.sin((boostAge / 1.8) * Math.PI) * 0.65
        : 1;

    const fTime = runtime.fireflySimSec;
    for (const f of seeds) {
        const driftX = reducedMotion
            ? 0
            : Math.sin(fTime * f.speed + f.phase) * 22 * scale;
        const driftY = reducedMotion
            ? 0
            : Math.cos(fTime * f.speed * 0.82 + f.phase * 1.3) * 16 * scale;
        let fx = f.x + driftX;
        let fy = f.y + driftY;

        if (!reducedMotion && pointer.x > -1000) {
            const dx = fx - pointer.x;
            const dy = fy - pointer.y;
            const dist = Math.hypot(dx, dy);
            const repulseR = 110 * scale;
            if (dist > 1 && dist < repulseR) {
                const push = ((repulseR - dist) / repulseR) * 28 * scale;
                fx += (dx / dist) * push;
                fy += (dy / dist) * push;
            }
        }

        const breath = reducedMotion ? 0.75 : 0.42 +
            0.58 *
                (0.5 +
                    0.5 *
                        Math.sin(
                            fTime * f.speed * Math.PI * 2 + f.phase,
                        ));
        const glowR = Math.max(4, 16 * scale * breath * boost);

        const glow = ctx.createRadialGradient(fx, fy, 0.5, fx, fy, glowR);
        glow.addColorStop(
            0,
            pal.wash("accent", clamp(0.85 * breath * boost, 0, 1)),
        );
        glow.addColorStop(
            0.4,
            pal.fill("accent", clamp(0.45 * breath * boost, 0, 1)),
        );
        glow.addColorStop(1, pal.fill("accent", 0));

        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(fx, fy, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(fx, fy, Math.max(0.8, 1.5 * scale), 0, Math.PI * 2);
        ctx.fillStyle = pal.luminous(clamp(0.96 * breath, 0.45, 1));
        ctx.fill();
    }
}

export function drawRewardBloom(
    ctx: CanvasRenderingContext2D,
    scene: BotanicalScene,
    reward: BotanicalRewardAnchor,
    runtime: BotanicalRuntimeState,
    timeSec: number,
    reducedMotion: boolean,
    windCalm: number,
    frameSeq: number,
    breezeImpulse: number,
    pal: BotanicalPalette,
): void {
    const bloomP = reducedMotion
        ? 1
        : easeOutCubic(clamp((timeSec - runtime.awakenStartSec) / 1.8, 0, 1));
    if (bloomP <= 0.02) return;

    const evalBranch = (branch: typeof reward.branch) =>
        computeBranchWorldPoints(
            branch,
            timeSec,
            reducedMotion,
            windCalm,
            scene.scale,
            frameSeq,
            breezeImpulse,
            runtime,
        );
    const tipPt = evalBranch(reward.branch)[reward.idx];
    const s = scene.scale;

    // Subtle expanding halo pulse when tasks are cleared
    const haloAge = timeSec - runtime.haloPulseStartSec;
    if (!reducedMotion && haloAge >= 0 && haloAge < 1.4) {
        const hp = haloAge / 1.4;
        const hr = (10 + easeOutCubic(hp) * 48) * s;
        ctx.beginPath();
        ctx.arc(tipPt.x, tipPt.y, hr, 0, Math.PI * 2);
        ctx.strokeStyle = pal.stroke("accent", (1 - hp) * 0.42);
        ctx.lineWidth = Math.max(0.6, (1.4 - hp) * s);
        ctx.stroke();
    }

    scene.module.drawReward(ctx, scene, reward, tipPt, bloomP, pal, evalBranch);
}
