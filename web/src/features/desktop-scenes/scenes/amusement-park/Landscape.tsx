import { FarSilhouettes, Paths } from "./Details.tsx";

/** 地景：远处山脊、中景草地、前景草地、松树、路灯、游客与花。 */

const VIEW_WIDTH = 1440;

function ridgePath(): string {
    let d = "M0 108 Q40 92 80 108";
    for (let x = 160; x <= VIEW_WIDTH; x += 80) d += ` T${x} 108`;
    return `${d} V200 H0Z`;
}

const RIDGE = ridgePath();
const MEADOW =
    "M0 128 C240 118 480 132 720 124 C960 116 1200 132 1440 122 V200 H0Z";
const FRONT =
    "M0 168 C240 160 480 172 720 166 C960 160 1200 172 1440 164 V200 H0Z";

/** [x, 地面 y, 缩放] */
const PINES: ReadonlyArray<readonly [number, number, number]> = [
    [22, 174, 1.2],
    [196, 176, 1],
    [238, 170, 0.9],
    [530, 152, 0.7],
    [960, 156, 0.7],
    [1010, 172, 0.9],
    [1245, 158, 0.8],
    [1306, 150, 0.7],
    [1395, 170, 1.1],
];

/** [x, 灯头 y, 杆底 y] */
const LAMPS: ReadonlyArray<readonly [number, number, number]> = [
    [520, 152, 176],
    [830, 152, 176],
    [1010, 150, 174],
    [1260, 154, 178],
];

const FLOWERS: ReadonlyArray<readonly [number, number, string]> = [
    [130, 194, "sp-fr"],
    [470, 196, "sp-fg"],
    [620, 195, "sp-paper"],
    [980, 195, "sp-fr"],
    [1200, 194, "sp-fg"],
];

interface PatternProps {
    patternId: string;
}

export function LandscapeDefs({ patternId, pineId }: {
    patternId: string;
    pineId: string;
}) {
    return (
        <defs>
            <pattern
                id={patternId}
                width="14"
                height="10"
                patternUnits="userSpaceOnUse"
            >
                <path className="sp-tex" d="M7 0L14 5L7 10L0 5Z" />
            </pattern>
            <g id={pineId}>
                <rect
                    fill="var(--sp-wood-dark)"
                    x="-1.5"
                    y="0"
                    width="3"
                    height="7"
                />
                <path fill="var(--sp-pine-low)" d="M0 -14L11 3H-11Z" />
                <path fill="var(--sp-pine)" d="M0 -26L9 -8H-9Z" />
            </g>
        </defs>
    );
}

export function BackGround({ patternId }: PatternProps) {
    return (
        <g>
            <path className="sp-ridge" d={RIDGE} />
            <path fill={`url(#${patternId})`} d={RIDGE} />
            <FarSilhouettes />
            <path className="sp-meadow" d={MEADOW} />
            <path fill={`url(#${patternId})`} d={MEADOW} />
        </g>
    );
}

export function FrontGround(
    { patternId, pineId }: PatternProps & { pineId: string },
) {
    return (
        <g>
            <path className="sp-front" d={FRONT} />
            <path fill={`url(#${patternId})`} d={FRONT} />
            <Paths />
            {PINES.map(([x, y, scale]) => (
                <use
                    key={x}
                    href={`#${pineId}`}
                    transform={`translate(${x} ${y}) scale(${scale})`}
                />
            ))}
            {LAMPS.map(([x, top, bottom]) => (
                <g key={x}>
                    <path
                        className="sp-line"
                        strokeWidth="1.4"
                        d={`M${x} ${top}V${bottom}`}
                    />
                    <circle className="sp-lamp sp-glow" cx={x} cy={top} r="9" />
                    <circle className="sp-lamp" cx={x} cy={top} r="2.6" />
                </g>
            ))}
            {FLOWERS.map(([x, y, style]) => (
                <circle key={x} className={style} cx={x} cy={y} r="2" />
            ))}
        </g>
    );
}
