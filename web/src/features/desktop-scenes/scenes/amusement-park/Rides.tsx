/** 游乐场中除过山车以外的设施。所有形状围绕局部原点绘制，由外层 translate 定位。 */

const WHEEL_RADIUS = 44;
const GONDOLA_STYLES = ["sp-fr", "sp-ft", "sp-fg"] as const;

/** 木马：金色立杆随木马一起起伏，朝右的侧面剪影。 */
function Horse({ tone, coat }: { tone: string; coat: string }) {
    return (
        <g className={`sp-horse ${tone}`}>
            <g className="sp-horse__bob">
                <path
                    className="sp-pole"
                    strokeWidth="1"
                    d="M0 -26V-3"
                />
                <path className={coat} d="M-6 -9a6 3 0 0 1 12 0v2h-12z" />
                <path className={coat} d="M4 -10L8 -15L11 -14L10 -11L6 -8z" />
                <circle className="sp-paper" cx="9.6" cy="-13.2" r="0.6" />
                <path
                    className="sp-pole"
                    strokeWidth="1.4"
                    d="M-5 -7L-7 -2M-2 -6V-1M2 -6V-1M5 -7L6 -2"
                />
                <path
                    className="sp-pole"
                    strokeWidth="1.2"
                    d="M-6 -9Q-9 -8 -9 -4"
                />
            </g>
        </g>
    );
}

export function Carousel() {
    return (
        <g transform="translate(337 148)">
            <ellipse className="sp-shadow" cx="0" cy="4" rx="42" ry="4" />
            <path
                className="sp-wood-dark"
                d="M-36 0 v5 a36 6 0 0 0 72 0 v-5z"
            />
            <ellipse className="sp-wood" cx="0" cy="0" rx="36" ry="6" />
            <path
                className="sp-line"
                strokeWidth="1.5"
                d="M-21 0V-27M-5 2V-27M5 2V-27M21 0V-27"
            />
            <g transform="translate(0 -2)">
                <Horse tone="sp-horse--b" coat="sp-fr" />
            </g>
            <g transform="translate(-2 0)">
                <Horse tone="sp-horse--a" coat="sp-fg" />
            </g>
            <g transform="translate(2 0)">
                <Horse tone="sp-horse--c" coat="sp-ft" />
            </g>
            <path className="sp-ft" d="M-41 -27 L0 -49 L41 -27Z" />
            <path
                className="sp-paper"
                d="M0 -49 L-15 -27 L-5 -27Z M0 -49 L5 -27 L15 -27Z"
            />
            <path className="sp-line" strokeWidth="1.5" d="M0 -49V-58" />
            <g transform="translate(0 -58)">
                <path className="sp-fr sp-flag" d="M0 0 L9 3 L0 6Z" />
            </g>
        </g>
    );
}

export function TicketBooth() {
    return (
        <g transform="translate(472 150)">
            <ellipse className="sp-shadow" cx="0" cy="2" rx="20" ry="3" />
            <rect className="sp-paper" x="-12" y="-16" width="24" height="16" />
            <rect className="sp-fn" x="-6" y="-10" width="12" height="6" />
            <rect className="sp-fr" x="-15" y="-22" width="6" height="7" />
            <rect className="sp-paper" x="-9" y="-22" width="6" height="7" />
            <rect className="sp-fr" x="-3" y="-22" width="6" height="7" />
            <rect className="sp-paper" x="3" y="-22" width="6" height="7" />
            <rect className="sp-fr" x="9" y="-22" width="6" height="7" />
        </g>
    );
}

export function SwingShip() {
    return (
        <g transform="translate(926 108)">
            <ellipse className="sp-shadow" cx="0" cy="44" rx="24" ry="3" />
            <path
                className="sp-line"
                strokeWidth="2.5"
                d="M-18 44L0 0L18 44"
            />
            <path className="sp-line" strokeWidth="2" d="M-10 28H10" />
            <g className="sp-swing">
                <path
                    className="sp-rope"
                    strokeWidth="1.1"
                    d="M0 0L-10 28M0 0L10 28"
                />
                <path
                    className="sp-fr"
                    d="M-15 28Q0 42 15 28L12.5 24H-12.5Z"
                />
                <path className="sp-rope" strokeWidth="1" d="M-11 27H11" />
            </g>
            <circle className="sp-fg" cx="0" cy="0" r="3" />
        </g>
    );
}

export function FerrisWheel() {
    const gondolas = Array.from({ length: 8 }, (_, index) => {
        const angle = index * Math.PI / 4;
        return {
            index,
            x: WHEEL_RADIUS * Math.cos(angle),
            y: WHEEL_RADIUS * Math.sin(angle),
        };
    });
    return (
        <g transform="translate(1077 104)">
            <ellipse className="sp-shadow" cx="0" cy="48" rx="36" ry="3.5" />
            <path
                className="sp-line"
                strokeWidth="3"
                d="M-28 46L0 0L28 46"
            />
            <g className="sp-wheel">
                <circle
                    className="sp-line"
                    strokeWidth="2"
                    cx="0"
                    cy="0"
                    r={WHEEL_RADIUS}
                />
                <circle
                    className="sp-line"
                    strokeWidth="1"
                    cx="0"
                    cy="0"
                    r="28"
                />
                <path
                    className="sp-line"
                    strokeWidth="1.2"
                    d="M0 -44V44M-44 0H44M-31 -31L31 31M31 -31L-31 31"
                />
                {gondolas.map(({ index, x, y }) => (
                    <g key={index} transform={`translate(${x} ${y})`}>
                        <g className="sp-gondola">
                            <rect
                                className={GONDOLA_STYLES[index % 3]}
                                x="-4"
                                y="0"
                                width="8"
                                height="7"
                                rx="2"
                            />
                        </g>
                    </g>
                ))}
            </g>
            <circle className="sp-fg" cx="0" cy="0" r="4" />
        </g>
    );
}

export function MiniTrain() {
    return (
        <g className="sp-train">
            <g transform="translate(0 178)">
                <circle className="sp-cloud-fill" cx="12" cy="-8" r="4" />
                <rect
                    className="sp-ft"
                    x="0"
                    y="0"
                    width="16"
                    height="9"
                    rx="2"
                />
                <rect className="sp-fr" x="10" y="-5" width="4" height="5" />
                <rect
                    className="sp-fg"
                    x="19"
                    y="2"
                    width="13"
                    height="7"
                    rx="1.5"
                />
                <rect
                    className="sp-fr"
                    x="35"
                    y="2"
                    width="13"
                    height="7"
                    rx="1.5"
                />
                {[4, 12, 23, 30, 39, 46].map((x) => (
                    <circle key={x} className="sp-fn" cx={x} cy="10" r="2" />
                ))}
            </g>
        </g>
    );
}

export function Balloon() {
    return (
        <g transform="translate(420 46)">
            <g className="sp-balloon">
                <ellipse className="sp-fr" cx="0" cy="0" rx="11" ry="14" />
                <path
                    className="sp-ft"
                    d="M0 -14 C-6 -7 -6 7 0 14 C6 7 6 -7 0 -14Z"
                />
                <rect
                    className="sp-fg"
                    x="-4"
                    y="16"
                    width="8"
                    height="5"
                    rx="1"
                />
            </g>
        </g>
    );
}

const CLOUD_ROWS = [
    { id: "a", y: 26, width: 26 },
    { id: "b", y: 14, width: 18 },
    { id: "c", y: 30, width: 24 },
] as const;

export function Clouds() {
    return (
        <g>
            {CLOUD_ROWS.map(({ id, y, width }) => (
                <g key={id} transform={`translate(0 ${y})`}>
                    <g className={`sp-cloud sp-cloud--${id}`}>
                        <ellipse
                            className="sp-cloud-fill"
                            cx="0"
                            cy="0"
                            rx={width}
                            ry="6"
                        />
                        <ellipse
                            className="sp-cloud-fill"
                            cx={width * 0.6}
                            cy="-5"
                            rx={width * 0.55}
                            ry="6"
                        />
                    </g>
                </g>
            ))}
        </g>
    );
}

export function Flags() {
    return (
        <g>
            <path className="sp-line" strokeWidth="1.5" d="M254 150V80" />
            <g transform="translate(254 80)">
                <path className="sp-fr sp-flag" d="M0 0 L16 5 L0 11Z" />
            </g>
            <path className="sp-line" strokeWidth="1.5" d="M1185 150V78" />
            <g transform="translate(1185 78)">
                <path className="sp-ft sp-flag" d="M0 0 L16 5 L0 11Z" />
            </g>
        </g>
    );
}
