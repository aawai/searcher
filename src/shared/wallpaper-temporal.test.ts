import { assert, assertEquals } from "@std/assert";
import {
    analyzeAmbientRecurrence,
    resolveNormalizedAmbientOpacity,
    resolveNormalizedAmbientTransform,
    resolveNormalizedDrift,
    resolveNormalizedZoom,
    sampleAnalyticDrift,
    sampleAnalyticZoom,
    WALLPAPER_MOTION_PROFILES,
    WALLPAPER_TEMPORAL_BUDGET,
} from "./wallpaper-temporal.ts";

Deno.test("wallpaper-temporal: WALLPAPER_TEMPORAL_BUDGET contains frozen canonical gates", () => {
    assert(Object.isFrozen(WALLPAPER_TEMPORAL_BUDGET));
    assertEquals(WALLPAPER_TEMPORAL_BUDGET.driftKeyframeSamples, 64);
    assertEquals(WALLPAPER_TEMPORAL_BUDGET.zoomKeyframeSamples, 64);
    assertEquals(WALLPAPER_TEMPORAL_BUDGET.ambientKeyframeSamples, 64);
    assertEquals(
        WALLPAPER_TEMPORAL_BUDGET.maxDriftAdjacentHeadingDeltaDeg,
        30.0,
    );
    assertEquals(
        WALLPAPER_TEMPORAL_BUDGET.maxZoomPeakAdjacentVelocityRatio,
        0.20,
    );
    assertEquals(WALLPAPER_TEMPORAL_BUDGET.retargetPositionToleranceCssPx, 1.0);
    assertEquals(WALLPAPER_TEMPORAL_BUDGET.retargetVelocityDeltaMaxRatio, 0.25);
    assertEquals(
        WALLPAPER_TEMPORAL_BUDGET.ambientRecurrenceHorizonSeconds,
        1036,
    );
    assertEquals(
        WALLPAPER_TEMPORAL_BUDGET.maxSliderThumbMarkCenterOffsetCssPx,
        1.0,
    );
});

Deno.test("wallpaper-temporal: canonical profiles have monotonically non-decreasing offsets and closed seams", () => {
    for (const [name, profile] of Object.entries(WALLPAPER_MOTION_PROFILES)) {
        assert(
            profile.durationSeconds > 0,
            `${name} duration must be positive`,
        );
        assertEquals(
            profile.iterations,
            Infinity,
            `${name} must loop infinitely`,
        );
        assert(
            profile.keyframes.length >= 64,
            `${name} must have at least 64 keyframes`,
        );

        let prevOffset = -1;
        for (const kf of profile.keyframes) {
            assert(
                kf.offset >= 0 && kf.offset <= 1,
                `${name} offset out of bounds: ${kf.offset}`,
            );
            assert(
                kf.offset >= prevOffset,
                `${name} offset not monotonically increasing`,
            );
            prevOffset = kf.offset;
        }

        const first = profile.keyframes[0];
        const last = profile.keyframes[profile.keyframes.length - 1];
        assertEquals(first.offset, 0);
        assertEquals(last.offset, 1);
    }
});

Deno.test("wallpaper-temporal: Drift C1 source curve satisfies heading continuity, speed profile, and seam gates", () => {
    const N = WALLPAPER_TEMPORAL_BUDGET.driftKeyframeSamples;
    const duration = WALLPAPER_MOTION_PROFILES.drift.durationSeconds;
    const dt = 1 / N;
    const pts: { x: number; y: number }[] = [];

    for (let i = 0; i <= N; i++) {
        pts.push(sampleAnalyticDrift(i / N));
    }

    // Seam position
    const seamPosDelta = Math.hypot(pts[N].x - pts[0].x, pts[N].y - pts[0].y);
    assert(seamPosDelta <= WALLPAPER_TEMPORAL_BUDGET.maxDriftPositionSeamDelta);

    // Velocities and headings
    const vels: { vx: number; vy: number; speed: number; heading: number }[] =
        [];
    for (let i = 0; i < N; i++) {
        const vx = (pts[i + 1].x - pts[i].x) / (dt * duration);
        const vy = (pts[i + 1].y - pts[i].y) / (dt * duration);
        const speed = Math.hypot(vx, vy);
        const heading = (Math.atan2(vy, vx) * 180) / Math.PI;
        vels.push({ vx, vy, speed, heading });
    }

    // Seam velocity
    const v0 = vels[0];
    const vEnd = vels[N - 1];
    const seamVelDelta = Math.hypot(vEnd.vx - v0.vx, vEnd.vy - v0.vy);
    assert(seamVelDelta <= WALLPAPER_TEMPORAL_BUDGET.maxDriftVelocitySeamDelta);

    // Heading continuity
    let maxHeadingDelta = 0;
    for (let i = 0; i < N; i++) {
        let dh = Math.abs(vels[(i + 1) % N].heading - vels[i].heading);
        if (dh > 180) dh = 360 - dh;
        if (dh > maxHeadingDelta) maxHeadingDelta = dh;
    }
    assert(
        maxHeadingDelta <=
            WALLPAPER_TEMPORAL_BUDGET.maxDriftAdjacentHeadingDeltaDeg,
        `Max heading delta ${maxHeadingDelta}° must be <= ${WALLPAPER_TEMPORAL_BUDGET.maxDriftAdjacentHeadingDeltaDeg}°`,
    );

    // Speed profile
    const speeds = vels.map((v) => v.speed).sort((a, b) => a - b);
    const medianSpeed = speeds[Math.floor(speeds.length / 2)];
    const maxSpeed = speeds[speeds.length - 1];
    const speedRatio = maxSpeed / medianSpeed;
    assert(
        speedRatio <= WALLPAPER_TEMPORAL_BUDGET.maxDriftSpeedMedianRatio,
        `Speed ratio ${speedRatio} must be <= ${WALLPAPER_TEMPORAL_BUDGET.maxDriftSpeedMedianRatio}`,
    );

    // Onset deadline: at 3s / 46s
    const onsetPt = sampleAnalyticDrift(3 / duration);
    const onsetDisp = Math.hypot(onsetPt.x - pts[0].x, onsetPt.y - pts[0].y);
    assert(onsetDisp >= 0.10, "Onset progress must be >= 10%");
});

Deno.test("wallpaper-temporal: Zoom smooth turnaround satisfies peak velocity and seam gates", () => {
    const N = WALLPAPER_TEMPORAL_BUDGET.zoomKeyframeSamples;
    const duration = WALLPAPER_MOTION_PROFILES.zoom.durationSeconds;
    const dt = 1 / N;
    const scales: number[] = [];

    for (let i = 0; i <= N; i++) {
        scales.push(sampleAnalyticZoom(i / N));
    }

    // Seam scale
    assertEquals(scales[0], 0);
    assertEquals(scales[N], 0);

    const vels: number[] = [];
    for (let i = 0; i < N; i++) {
        const v = (scales[i + 1] - scales[i]) / (dt * duration);
        vels.push(v);
    }
    const maxV = Math.max(...vels.map((v) => Math.abs(v)));
    const peakIdx = Math.floor(N * 0.5);
    const vPeakAdj = Math.max(
        Math.abs(vels[peakIdx - 1]),
        Math.abs(vels[peakIdx]),
    );
    const vPeakRatio = maxV > 0 ? vPeakAdj / maxV : 0;

    assert(
        vPeakRatio <=
            WALLPAPER_TEMPORAL_BUDGET.maxZoomPeakAdjacentVelocityRatio,
        `Zoom peak adjacent velocity ratio ${vPeakRatio} must be <= ${WALLPAPER_TEMPORAL_BUDGET.maxZoomPeakAdjacentVelocityRatio}`,
    );

    // Onset at 3s / 44s
    const onsetScale = sampleAnalyticZoom(3 / duration);
    assert(onsetScale >= 0.10, "Zoom onset scale must achieve >= 10% progress");
});

Deno.test("wallpaper-temporal: normalized channel mapping maps exactly across all dimensions", () => {
    const driftResolved = resolveNormalizedDrift(
        { offset: 0.5, x: 0.8, y: -0.6 },
        { x: 1.6, y: 1.05 },
    );
    assertEquals(Number(driftResolved.translateXPercent.toFixed(4)), 1.28);
    assertEquals(Number(driftResolved.translateYPercent.toFixed(4)), -0.63);

    const zoomResolved = resolveNormalizedZoom(
        { offset: 0.5, scale: 0.5 },
        { scale: 1.06 },
    );
    assertEquals(Number(zoomResolved.scale.toFixed(4)), 1.03);

    const ambientTransResolved = resolveNormalizedAmbientTransform(
        { offset: 0.25, x: 0.5, y: -0.5, scale: 0.5 },
        {
            fieldAMix: 10,
            fieldBMix: 8,
            travel: 14,
            scale: 1.045,
            opacityFloor: 0.8,
        },
    );
    assertEquals(ambientTransResolved.translateXcqmax, 7);
    assertEquals(ambientTransResolved.translateYcqmax, -7);
    assertEquals(Number(ambientTransResolved.scale.toFixed(5)), 1.0225);

    const ambientOpacityResolved = resolveNormalizedAmbientOpacity(
        { offset: 0.25, opacity: 0.5 },
        {
            fieldAMix: 10,
            fieldBMix: 8,
            travel: 14,
            scale: 1.045,
            opacityFloor: 0.8,
        },
    );
    assertEquals(Number(ambientOpacityResolved.toFixed(3)), 0.9);
});

Deno.test("wallpaper-temporal: wall-clock ambient recurrence computes LCM 1036s and top overlap windows", () => {
    const analysis = analyzeAmbientRecurrence(28, 37, 7, 0.25);
    assertEquals(analysis.horizonSeconds, 1036);
    assertEquals(analysis.worstOverlapWindows.length, 6);

    for (const win of analysis.worstOverlapWindows) {
        assert(win.timeSeconds >= 0 && win.timeSeconds <= 1036);
        assert(win.overlapSeverity >= 0 && win.overlapSeverity <= 1);
    }
});

Deno.test("wallpaper-temporal: full wall-clock anti-breathing worst-case tests across entire 1036s horizon", () => {
    const { horizonSeconds, worstOverlapWindows } = analyzeAmbientRecurrence(
        28,
        37,
        7,
        0.25,
    );
    assertEquals(horizonSeconds, 1036);
    assertEquals(
        worstOverlapWindows.length,
        WALLPAPER_TEMPORAL_BUDGET.ambientWorstCaseAnalysisWindows,
    );

    for (const win of worstOverlapWindows) {
        // Anti-breathing invariant: at no timestamp in the 1036s horizon do both fields peak at 1.0 simultaneously
        assert(
            win.opacityA < 1.0 || win.opacityB < 1.0,
            `Simultaneous peak detected at t=${win.timeSeconds}s (opacityA=${win.opacityA}, opacityB=${win.opacityB})`,
        );
        const actOpacityA = 0.80 + win.opacityA * 0.20;
        const actOpacityB = 0.80 + win.opacityB * 0.20;
        const maxComposite = (actOpacityA * 12.0 + actOpacityB * 9.6) / 100;
        assert(
            maxComposite <= 0.22,
            `Composite contribution ${maxComposite} at worst timestamp t=${win.timeSeconds}s exceeds safe budget`,
        );
    }
});
