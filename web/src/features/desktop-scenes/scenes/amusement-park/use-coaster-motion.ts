import { type RefObject, useEffect, useRef } from "react";
import {
    type CoasterModel,
    createCoasterModel,
    svgPathSampler,
    wrapDistance,
} from "./coaster-motion.ts";
import { CAR_DISTANCES, STATIC_CAR_ANCHOR } from "./coaster-track.ts";

interface CoasterMotionOptions {
    running: boolean;
    track: RefObject<SVGPathElement | null>;
    cars: RefObject<Array<SVGGElement | null>>;
}

function placeCars(
    model: CoasterModel,
    leadDistance: number,
    cars: ReadonlyArray<SVGGElement | null>,
    transforms: string[],
) {
    // SVG geometry reads must finish before any car transform invalidates layout.
    for (let index = 0; index < cars.length; index++) {
        if (!cars[index]) continue;
        const pose = model.poseAt(
            wrapDistance(leadDistance - CAR_DISTANCES[index], model.length),
        );
        transforms[index] = `translate(${pose.x.toFixed(2)} ${
            pose.y.toFixed(2)
        }) rotate(${pose.angle.toFixed(2)})`;
    }
    for (let index = 0; index < cars.length; index++) {
        cars[index]?.setAttribute("transform", transforms[index]);
    }
}

/**
 * 小车运动：全部场景里唯一的 requestAnimationFrame。只有 `running` 时才
 * 调度帧；暂停时保留当前距离，恢复后从原位继续。每帧只改 SVG 属性，
 * 不触发 React 渲染。
 */
export function useCoasterMotion(
    { running, track, cars }: CoasterMotionOptions,
) {
    const modelRef = useRef<CoasterModel | null>(null);
    const distanceRef = useRef(0);
    const transformsRef = useRef<string[]>([]);

    useEffect(() => {
        const path = track.current;
        if (!path) return;
        const model = createCoasterModel(svgPathSampler(path));
        modelRef.current = model;
        distanceRef.current = model.nearestDistance(STATIC_CAR_ANCHOR);
        placeCars(
            model,
            distanceRef.current,
            cars.current,
            transformsRef.current,
        );
        return () => {
            modelRef.current = null;
        };
    }, [track, cars]);

    useEffect(() => {
        const model = modelRef.current;
        if (!running || !model) return;
        let frame = 0;
        let last = performance.now();
        const step = (now: number) => {
            const elapsedSeconds = (now - last) / 1000;
            last = now;
            distanceRef.current = model.advance(
                distanceRef.current,
                elapsedSeconds,
            );
            placeCars(
                model,
                distanceRef.current,
                cars.current,
                transformsRef.current,
            );
            frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [running, cars]);
}
