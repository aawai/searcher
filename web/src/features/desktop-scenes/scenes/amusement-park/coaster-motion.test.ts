import {
    assert,
    assertAlmostEquals,
    assertEquals,
    assertGreater,
    assertLess,
} from "@std/assert";
import {
    COASTER_SPEED,
    createCoasterModel,
    MAX_FRAME_SECONDS,
    type PathSampler,
    wrapDistance,
} from "./coaster-motion.ts";

const LENGTH = 1000;
/**
 * 椭圆闭合轨道。相位偏移让接缝处的切线不是竖直方向（竖直切线的朝向本身
 * 在 +90°/-90° 之间不确定，真实轨道没有这种情况）。
 */
const PHASE_OFFSET = 0.3;
const ellipse: PathSampler = {
    length: LENGTH,
    pointAt(distance) {
        const phase = wrapDistance(distance, LENGTH) / LENGTH * Math.PI * 2 +
            PHASE_OFFSET;
        return { x: 200 * Math.cos(phase), y: 80 * Math.sin(phase) };
    },
};
const model = createCoasterModel(ellipse);

function extremeDistance(pick: "highest" | "lowest"): number {
    let best = 0;
    for (let s = 0; s < LENGTH; s += 0.5) {
        const y = ellipse.pointAt(s).y;
        const bestY = ellipse.pointAt(best).y;
        if (pick === "highest" ? y < bestY : y > bestY) best = s;
    }
    return best;
}

Deno.test("coaster: speed is slow at the crest, fast at the bottom, and always within range", () => {
    assertAlmostEquals(
        model.speedAt(extremeDistance("highest")),
        COASTER_SPEED.min,
        1.5,
    );
    assertAlmostEquals(
        model.speedAt(extremeDistance("lowest")),
        COASTER_SPEED.max,
        1.5,
    );
    for (let s = 0; s < LENGTH; s += 7) {
        const speed = model.speedAt(s);
        assert(speed >= COASTER_SPEED.min - 1e-9);
        assert(speed <= COASTER_SPEED.max + 1e-9);
    }
});

Deno.test("coaster: speed is periodic so a lap has no discontinuity at the loop seam", () => {
    assertAlmostEquals(model.speedAt(0), model.speedAt(LENGTH), 1e-9);
    assertAlmostEquals(model.speedAt(LENGTH + 37), model.speedAt(37), 1e-9);
    assertAlmostEquals(model.speedAt(LENGTH - 0.01), model.speedAt(0.01), 0.1);
});

Deno.test("coaster: position and heading are continuous across the loop seam", () => {
    const before = model.poseAt(LENGTH - 0.01);
    const after = model.poseAt(0.01);
    assertLess(Math.hypot(before.x - after.x, before.y - after.y), 0.5);
    assertAlmostEquals(before.angle, after.angle, 1);
});

Deno.test("coaster: cars stay upright for every heading", () => {
    for (let s = 0; s < LENGTH; s += 3) {
        const { angle } = model.poseAt(s);
        assertGreater(angle, -90);
        assert(angle <= 90);
    }
});

Deno.test("coaster: a long frame gap (hidden tab) advances at most one clamped step", () => {
    const start = 100;
    const moved = model.advance(start, 30) - start;
    assertGreater(moved, 0);
    assert(moved <= COASTER_SPEED.max * MAX_FRAME_SECONDS + 1e-9);
    assertEquals(model.advance(start, 0), start);
    assertEquals(model.advance(start, -1), start);
});

Deno.test("coaster: advancing wraps around the loop instead of running past the end", () => {
    const next = model.advance(LENGTH - 0.001, MAX_FRAME_SECONDS);
    assert(next >= 0 && next < LENGTH);
    assertLess(next, COASTER_SPEED.max * MAX_FRAME_SECONDS);
});

Deno.test("coaster: nearestDistance locates a point on the track", () => {
    const target = ellipse.pointAt(123);
    const found = model.nearestDistance(target);
    assertAlmostEquals(found, 123, LENGTH / 400);
});

Deno.test("coaster: a degenerate track is rejected", () => {
    let message = "";
    try {
        createCoasterModel({ length: 0, pointAt: () => ({ x: 0, y: 0 }) });
    } catch (error) {
        message = error instanceof Error ? error.message : String(error);
    }
    assertEquals(message, "Coaster track length must be positive");
});
