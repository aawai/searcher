import { useRef } from "react";
import {
    CAR_DISTANCES,
    CAR_STYLES,
    TRACK_GROUND_Y,
    TRACK_PATH,
    TRACK_PILLARS,
} from "./coaster-track.ts";
import { useCoasterMotion } from "./use-coaster-motion.ts";

/** 高立柱之间的交叉拉筋 [左 x, 右 x]。 */
const BRACE_SPANS: ReadonlyArray<readonly [number, number]> = [
    [656, 688],
    [688, 720],
    [720, 750],
    [750, 772],
];

interface CoasterProps {
    running: boolean;
}

export function Coaster({ running }: CoasterProps) {
    const track = useRef<SVGPathElement>(null);
    const cars = useRef<Array<SVGGElement | null>>([]);
    useCoasterMotion({ running, track, cars });

    return (
        <g>
            <ellipse className="sp-shadow" cx="715" cy="152" rx="150" ry="4" />
            <g>
                <path className="sp-pillar-brace" d="M548 138h26v12h-26z" />
                <path className="sp-fr" d="M545 138L561 126L577 138Z" />
                <rect className="sp-fn" x="556" y="142" width="8" height="8" />
            </g>
            {BRACE_SPANS.map(([left, right]) => (
                <path
                    key={left}
                    className="sp-line sp-brace"
                    strokeWidth="1"
                    d={`M${left} 104L${right} 140M${right} 104L${left} 140`}
                />
            ))}
            {TRACK_PILLARS.map(([x, top]) => (
                <path
                    key={x}
                    className="sp-line sp-pillar"
                    strokeWidth="3.5"
                    d={`M${x} ${top}V${TRACK_GROUND_Y}`}
                />
            ))}
            <path
                ref={track}
                className="sp-track"
                strokeWidth="5.5"
                d={TRACK_PATH}
            />
            <path className="sp-ties" strokeWidth="1.8" d={TRACK_PATH} />
            {CAR_DISTANCES.map((distance, index) => (
                <g
                    key={distance}
                    data-scene-car={index}
                    ref={(element) => {
                        cars.current[index] = element;
                    }}
                    transform={`translate(${676 - distance * 0.8} ${
                        80 + distance * 0.58
                    }) rotate(-36)`}
                >
                    <rect
                        className={CAR_STYLES[index]}
                        x="-7"
                        y="-9"
                        width="14"
                        height="6"
                        rx="2"
                    />
                    <circle className="sp-paper" cx="0" cy="-11" r="2.6" />
                </g>
            ))}
        </g>
    );
}
