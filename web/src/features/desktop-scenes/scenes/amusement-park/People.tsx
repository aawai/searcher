/**
 * 园区游客：正面朝向的简化小人（头、身体、双腿），按位置分为排队、观望与
 * 漫步三类。人数刻意克制，分散在各设施旁，避免画面拥挤。
 * 仅使用场景色板类名；运动全部来自 amusement-park.css 的 CSS 动画。
 */
type Shirt = "sp-fr" | "sp-ft" | "sp-fg" | "sp-paper";
type Hair = "sp-hair-dark" | "sp-hair-warm";
type Motion =
    | "idle-a"
    | "idle-b"
    | "idle-c"
    | "stroll-a"
    | "stroll-b"
    | "stroll-c"
    | "stroll-d";

interface PersonSpec {
    /** 脚下位置 */
    x: number;
    y: number;
    shirt: Shirt;
    hair: Hair;
    motion: Motion;
    child?: boolean;
    /** 手持气球的颜色 */
    balloon?: Shirt;
}

const VISITOR_LIST: ReadonlyArray<PersonSpec> = [
    // 旋转木马旁
    { x: 298, y: 162, shirt: "sp-fg", hair: "sp-hair-dark", motion: "idle-a" },
    {
        x: 372,
        y: 164,
        shirt: "sp-ft",
        hair: "sp-hair-warm",
        motion: "idle-b",
        child: true,
    },
    // 售票亭排队
    { x: 496, y: 160, shirt: "sp-fr", hair: "sp-hair-dark", motion: "idle-b" },
    {
        x: 510,
        y: 161,
        shirt: "sp-paper",
        hair: "sp-hair-warm",
        motion: "idle-c",
    },
    {
        x: 523,
        y: 162,
        shirt: "sp-fg",
        hair: "sp-hair-dark",
        motion: "idle-a",
        child: true,
    },
    // 过山车入口与观景
    { x: 606, y: 164, shirt: "sp-ft", hair: "sp-hair-warm", motion: "idle-c" },
    { x: 619, y: 165, shirt: "sp-fr", hair: "sp-hair-dark", motion: "idle-a" },
    { x: 716, y: 172, shirt: "sp-fg", hair: "sp-hair-dark", motion: "idle-b" },
    {
        x: 729,
        y: 172,
        shirt: "sp-paper",
        hair: "sp-hair-warm",
        motion: "idle-c",
        balloon: "sp-fr",
    },
    // 海盗船旁
    { x: 898, y: 164, shirt: "sp-fr", hair: "sp-hair-warm", motion: "idle-a" },
    {
        x: 962,
        y: 166,
        shirt: "sp-ft",
        hair: "sp-hair-dark",
        motion: "idle-b",
        child: true,
    },
    // 摩天轮旁
    { x: 1030, y: 167, shirt: "sp-fg", hair: "sp-hair-dark", motion: "idle-c" },
    {
        x: 1124,
        y: 166,
        shirt: "sp-ft",
        hair: "sp-hair-warm",
        motion: "idle-a",
        balloon: "sp-fg",
    },
    { x: 1190, y: 172, shirt: "sp-fr", hair: "sp-hair-dark", motion: "idle-b" },
    // 前景步道漫步（往复慢走）
    {
        x: 440,
        y: 181,
        shirt: "sp-paper",
        hair: "sp-hair-warm",
        motion: "stroll-a",
    },
    {
        x: 780,
        y: 183,
        shirt: "sp-ft",
        hair: "sp-hair-dark",
        motion: "stroll-b",
    },
    {
        x: 1000,
        y: 181,
        shirt: "sp-fr",
        hair: "sp-hair-warm",
        motion: "stroll-c",
    },
    {
        x: 1250,
        y: 182,
        shirt: "sp-fg",
        hair: "sp-hair-dark",
        motion: "stroll-d",
    },
];

function Person(
    { x, y, shirt, hair, motion, child, balloon }: PersonSpec,
) {
    // 越靠前（y 越大）越大；儿童更矮
    const scale = (child ? 0.72 : 1) * (0.9 + (y - 150) / 130 * 0.35);
    const walking = motion.startsWith("stroll");
    return (
        <g transform={`translate(${x} ${y}) scale(${scale.toFixed(3)})`}>
            <ellipse className="sp-shadow" cx="0" cy="0.5" rx="4.2" ry="1" />
            <g className={`sp-person sp-${motion}`}>
                <g className={walking ? "sp-step" : undefined}>
                    <path
                        className="sp-line"
                        strokeWidth="1.6"
                        d="M-1.2 -4V-0.6M1.2 -4V-0.6"
                    />
                    <rect
                        className={shirt}
                        x="-2.5"
                        y="-10.6"
                        width="5"
                        height="7.2"
                        rx="2"
                    />
                    <circle className="sp-skin" cx="0" cy="-13.2" r="2.4" />
                    <path
                        className={hair}
                        d="M-2.5 -13.3A2.5 2.5 0 0 1 2.5 -13.3Q0 -14.4 -2.5 -13.3Z"
                    />
                </g>
                {balloon && (
                    <g className="sp-hold">
                        <path
                            className="sp-line"
                            strokeWidth="0.6"
                            d="M2.6 -8L4.5 -23"
                        />
                        <ellipse
                            className={balloon}
                            cx="4.5"
                            cy="-26"
                            rx="3"
                            ry="3.6"
                        />
                    </g>
                )}
            </g>
        </g>
    );
}

export function Visitors() {
    return (
        <g>
            {VISITOR_LIST.map((person) => (
                <Person key={`${person.x}-${person.y}`} {...person} />
            ))}
        </g>
    );
}
