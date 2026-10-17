/**
 * 园区细节：远景帐篷、步道、入口拱门、棉花糖推车、灌木与长椅。
 * 全部为静态装饰，只使用场景色板类名；灯泡在深色主题下通过 `sp-glow` 点亮。
 */

/** 远景山脊上的小帐篷与小塔，降低对比度，仅用于填充画面两端的空白。 */
export function FarSilhouettes() {
    return (
        <g>
            <g transform="translate(150 112)">
                <rect
                    className="sp-far-a"
                    x="-12"
                    y="-8"
                    width="24"
                    height="8"
                />
                <path className="sp-far-b" d="M-16 -8L0 -24L16 -8Z" />
                <path className="sp-far-a" d="M0 -24V-31" strokeWidth="1" />
                <path className="sp-far-b" d="M0 -31L7 -29L0 -27Z" />
            </g>
            <g transform="translate(236 114)">
                <rect
                    className="sp-far-b"
                    x="-6"
                    y="-8"
                    width="12"
                    height="8"
                />
                <path className="sp-far-a" d="M-8 -8L0 -17L8 -8Z" />
            </g>
            <g transform="translate(1340 114)">
                <rect
                    className="sp-far-a"
                    x="-9"
                    y="-10"
                    width="18"
                    height="10"
                />
                <path className="sp-far-b" d="M-12 -10L0 -26L12 -10Z" />
                <rect className="sp-far-b" x="-2" y="-4" width="4" height="4" />
            </g>
            <g transform="translate(1400 112)">
                <rect
                    className="sp-far-b"
                    x="-5"
                    y="-14"
                    width="10"
                    height="14"
                />
                <path className="sp-far-a" d="M-7 -14L0 -24L7 -14Z" />
            </g>
        </g>
    );
}

const MAIN_PATH = "M-20 184C240 178 480 186 720 181C960 176 1200 186 1460 180";

/** 各设施到主步道的入口小径：[设施 x, 起点 y, 主步道 y]，自上而下渐宽的梯形。 */
const PLAZAS: ReadonlyArray<readonly [number, number, number]> = [
    [337, 154, 181],
    [472, 153, 182],
    [588, 151, 182],
    [926, 153, 181],
    [1077, 153, 180],
];

const plazaPath = (x: number, top: number, bottom: number) =>
    `M${x - 3.5} ${top}L${x + 3.5} ${top}L${x + 9} ${bottom}L${
        x - 9
    } ${bottom}Z`;

/** 沙色步道：入口小径在下、主步道在上，画在草地之上、树与游客之下。 */
export function Paths() {
    return (
        <g>
            {PLAZAS.map(([x, top, bottom]) => (
                <path
                    key={x}
                    className="sp-path-fill"
                    d={plazaPath(x, top, bottom)}
                />
            ))}
            <path className="sp-path-edge" strokeWidth="13" d={MAIN_PATH} />
            <path className="sp-path" strokeWidth="11" d={MAIN_PATH} />
        </g>
    );
}

const BUNTING_COLORS = [
    "sp-fr",
    "sp-fg",
    "sp-ft",
    "sp-fg",
    "sp-fr",
    "sp-ft",
] as const;

/** 左侧入口拱门：两根立柱、招牌与一串彩旗，主步道从中穿过。 */
export function EntranceGate() {
    return (
        <g transform="translate(92 186)">
            <path
                className="sp-line"
                strokeWidth="3"
                d="M-28 0V-36M28 0V-36"
            />
            <rect
                className="sp-paper"
                x="-24"
                y="-47"
                width="48"
                height="11"
                rx="2"
            />
            <rect
                className="sp-fr"
                x="-24"
                y="-47"
                width="48"
                height="3"
                rx="1.5"
            />
            {[-12, 0, 12].map((x) => (
                <circle key={x} className="sp-fg" cx={x} cy="-39.5" r="2.4" />
            ))}
            <path
                className="sp-line"
                strokeWidth="0.8"
                d="M-28 -36Q0 -24 28 -36"
            />
            {BUNTING_COLORS.map((style, index) => {
                const t = (index + 1) / (BUNTING_COLORS.length + 1);
                const x = -28 + 56 * t;
                const y = -36 + 24 * t * (1 - t);
                return (
                    <path
                        key={index}
                        className={style}
                        d={`M${(x - 3).toFixed(1)} ${
                            (y - 0.5).toFixed(1)
                        }h6l-3 6z`}
                    />
                );
            })}
        </g>
    );
}

/** 棉花糖推车：条纹小伞、车身、车轮和几团棉花糖。 */
export function CandyCart() {
    return (
        <g transform="translate(1238 168)">
            <ellipse className="sp-shadow" cx="0" cy="1" rx="14" ry="2.2" />
            <path className="sp-line" strokeWidth="1.3" d="M0 -3V-26" />
            <path className="sp-fr" d="M-15 -17Q0 -32 15 -17Z" />
            <path className="sp-paper" d="M-5 -17Q-3 -28 0 -26Q3 -28 5 -17Z" />
            <rect
                className="sp-paper"
                x="-10"
                y="-13"
                width="20"
                height="10"
                rx="1.5"
            />
            <rect
                className="sp-fr"
                x="-10"
                y="-13"
                width="20"
                height="3"
                rx="1.5"
            />
            <circle className="sp-ft" cx="-6" cy="-1.5" r="2.4" />
            <circle className="sp-ft" cx="6" cy="-1.5" r="2.4" />
            <circle className="sp-fr" cx="13" cy="-9" r="3" />
            <circle className="sp-paper" cx="17" cy="-7" r="2.6" />
        </g>
    );
}

const BUSHES: ReadonlyArray<readonly [number, number, number]> = [
    [286, 168, 1],
    [556, 162, 0.9],
    [884, 164, 0.9],
    [1162, 172, 1],
    [1372, 178, 1.1],
    [40, 196, 0.9],
];

export function Bushes() {
    return (
        <g>
            {BUSHES.map(([x, y, scale]) => (
                <g key={x} transform={`translate(${x} ${y}) scale(${scale})`}>
                    <ellipse
                        className="sp-shadow"
                        cx="0"
                        cy="1"
                        rx="9"
                        ry="1.6"
                    />
                    <circle className="sp-pine-low" cx="-4.5" cy="-3" r="4.4" />
                    <circle className="sp-pine-low" cx="4.5" cy="-3" r="4.4" />
                    <circle className="sp-pine" cx="0" cy="-6" r="5.4" />
                    <circle className="sp-fr" cx="-1.6" cy="-6.6" r="0.9" />
                    <circle className="sp-fg" cx="2.4" cy="-4.2" r="0.9" />
                </g>
            ))}
        </g>
    );
}

const BENCHES: ReadonlyArray<readonly [number, number]> = [
    [660, 172],
    [1150, 174],
];

export function Benches() {
    return (
        <g>
            {BENCHES.map(([x, y]) => (
                <g key={x} transform={`translate(${x} ${y})`}>
                    <ellipse
                        className="sp-shadow"
                        cx="0"
                        cy="1"
                        rx="8"
                        ry="1.4"
                    />
                    <rect
                        className="sp-wood-dark"
                        x="-7"
                        y="-9"
                        width="14"
                        height="1.6"
                        rx="0.6"
                    />
                    <rect
                        className="sp-wood"
                        x="-7"
                        y="-5.5"
                        width="14"
                        height="2"
                        rx="0.6"
                    />
                    <path
                        className="sp-line"
                        strokeWidth="1"
                        d="M-5.5 -3.5V0M5.5 -3.5V0"
                    />
                </g>
            ))}
        </g>
    );
}
