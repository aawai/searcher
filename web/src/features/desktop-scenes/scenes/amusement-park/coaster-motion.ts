/**
 * 过山车沿闭合轨道的运动模型（纯函数，不依赖 DOM）。
 *
 * 速度只取决于轨道上的位置：越高越慢、越低越快（类似能量守恒的艺术近似），
 * 因此位置、朝向与速度在周期首尾天然连续，不需要在某个点重置。
 */
export interface Point {
    x: number;
    y: number;
}

/** 轨道采样接口。DOM 实现见 `svgPathSampler`，测试使用解析曲线。 */
export interface PathSampler {
    readonly length: number;
    pointAt(distance: number): Point;
}

export interface CarPose {
    x: number;
    y: number;
    /** 角度（度），已规整到 (-90, 90]，车厢始终保持“头朝上”。 */
    angle: number;
}

export interface CoasterModel {
    readonly length: number;
    speedAt(distance: number): number;
    advance(distance: number, dtSeconds: number): number;
    poseAt(distance: number): CarPose;
    nearestDistance(target: Point): number;
}

/** 轨道坐标系下的速度范围（单位/秒）。 */
export const COASTER_SPEED = { min: 28, max: 120 } as const;
/** 单帧最大推进时间；标签恢复等长间隔不会让车厢瞬移。 */
export const MAX_FRAME_SECONDS = 0.05;

const PROFILE_SAMPLES = 256;
const NEAREST_SAMPLES = 400;
const HEADING_STEP = 1;

export function wrapDistance(distance: number, length: number): number {
    return ((distance % length) + length) % length;
}

function normalizeUpright(degrees: number): number {
    if (degrees > 90) return degrees - 180;
    if (degrees <= -90) return degrees + 180;
    return degrees;
}

export function createCoasterModel(sampler: PathSampler): CoasterModel {
    const length = sampler.length;
    if (!Number.isFinite(length) || length <= 0) {
        throw new RangeError("Coaster track length must be positive");
    }

    const heights: number[] = [];
    for (let i = 0; i < PROFILE_SAMPLES; i++) {
        heights.push(sampler.pointAt(i / PROFILE_SAMPLES * length).y);
    }
    const top = Math.min(...heights);
    const bottom = Math.max(...heights);
    const range = bottom - top;
    const profile = heights.map((y) => {
        const depth = range > 0 ? (y - top) / range : 0;
        const eased = depth * depth * (3 - 2 * depth);
        return COASTER_SPEED.min + (COASTER_SPEED.max - COASTER_SPEED.min) *
                eased;
    });

    const speedAt = (distance: number): number => {
        const position = wrapDistance(distance, length) / length *
            PROFILE_SAMPLES;
        const index = Math.floor(position);
        const fraction = position - index;
        const from = profile[index % PROFILE_SAMPLES];
        const to = profile[(index + 1) % PROFILE_SAMPLES];
        return from + (to - from) * fraction;
    };

    return {
        length,
        speedAt,
        advance(distance, dtSeconds) {
            const dt = Math.min(Math.max(dtSeconds, 0), MAX_FRAME_SECONDS);
            const midpoint = distance + speedAt(distance) * dt / 2;
            return wrapDistance(distance + speedAt(midpoint) * dt, length);
        },
        poseAt(distance) {
            const at = wrapDistance(distance, length);
            const point = sampler.pointAt(at);
            const behind = sampler.pointAt(
                wrapDistance(at - HEADING_STEP, length),
            );
            const ahead = sampler.pointAt(
                wrapDistance(at + HEADING_STEP, length),
            );
            const heading = Math.atan2(ahead.y - behind.y, ahead.x - behind.x) *
                180 / Math.PI;
            return {
                x: point.x,
                y: point.y,
                angle: normalizeUpright(heading),
            };
        },
        nearestDistance(target) {
            let best = 0;
            let bestSquared = Infinity;
            for (let i = 0; i < NEAREST_SAMPLES; i++) {
                const distance = i / NEAREST_SAMPLES * length;
                const point = sampler.pointAt(distance);
                const squared = (point.x - target.x) ** 2 +
                    (point.y - target.y) ** 2;
                if (squared < bestSquared) {
                    bestSquared = squared;
                    best = distance;
                }
            }
            return best;
        },
    };
}

/** 以 SVG 几何元素作为轨道采样源（仅浏览器环境）。 */
export function svgPathSampler(path: SVGGeometryElement): PathSampler {
    return {
        length: path.getTotalLength(),
        pointAt(distance) {
            const point = path.getPointAtLength(distance);
            return { x: point.x, y: point.y };
        },
    };
}
