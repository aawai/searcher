import { useRef } from "react";
import {
    CAR_DISTANCES,
    CAR_STYLES,
    TRACK_GROUND_Y,
    TRACK_PATH,
    TRACK_PILLARS,
} from "./coaster-track.ts";
import { useCoasterMotion } from "./use-coaster-motion.ts";

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
