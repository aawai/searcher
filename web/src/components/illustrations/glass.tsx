import { useId } from "react";
import type { IllustrationName } from "./types.ts";

interface GlassSvgProps {
    name: IllustrationName;
    className?: string;
    size?: "sm" | "md" | "lg";
}

export function GlassIllustration(
    { name, className, size = "md" }: GlassSvgProps,
) {
    const rawId = useId();
    const uid = rawId.replace(/:/g, "");

    const commonProps = {
        viewBox: "0 0 180 120",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        className,
        "data-size": size,
        "data-illustration": name,
        "data-illustration-style": "glass",
        "aria-hidden": true as const,
        focusable: false as const,
    };

    switch (name) {
        case "empty-documents": {
            const glassSheet = `${uid}-sheet`;
            const backSheet = `${uid}-back`;
            const accentFold = `${uid}-fold`;
            const ambientGlow = `${uid}-glow`;
            return (
                <svg {...commonProps}>
                    <defs>
                        <linearGradient
                            id={glassSheet}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--surface-solid)"
                                stopOpacity="0.92"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--surface-soft)"
                                stopOpacity="0.62"
                            />
                        </linearGradient>
                        <linearGradient
                            id={backSheet}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--surface-soft)"
                                stopOpacity="0.72"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--surface-soft)"
                                stopOpacity="0.32"
                            />
                        </linearGradient>
                        <linearGradient
                            id={accentFold}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--accent)"
                                stopOpacity="0.9"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--accent)"
                                stopOpacity="0.45"
                            />
                        </linearGradient>
                        <radialGradient
                            id={ambientGlow}
                            cx="50%"
                            cy="50%"
                            r="50%"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--accent)"
                                stopOpacity="0.16"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--accent)"
                                stopOpacity="0"
                            />
                        </radialGradient>
                    </defs>

                    <ellipse
                        cx="90"
                        cy="66"
                        rx="58"
                        ry="42"
                        fill={`url(#${ambientGlow})`}
                    />

                    {/* Back left tilted frosted sheet */}
                    <g transform="rotate(-8 78 62)">
                        <rect
                            x="50"
                            y="24"
                            width="56"
                            height="72"
                            rx="9"
                            fill={`url(#${backSheet})`}
                            stroke="var(--border)"
                            strokeWidth="1"
                        />
                        <line
                            x1="60"
                            y1="42"
                            x2="90"
                            y2="42"
                            stroke="var(--muted)"
                            strokeOpacity="0.28"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                        />
                        <line
                            x1="60"
                            y1="52"
                            x2="94"
                            y2="52"
                            stroke="var(--muted)"
                            strokeOpacity="0.2"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                        />
                    </g>

                    {/* Back right tilted frosted sheet */}
                    <g transform="rotate(7 104 62)">
                        <rect
                            x="74"
                            y="24"
                            width="56"
                            height="72"
                            rx="9"
                            fill={`url(#${backSheet})`}
                            stroke="var(--border)"
                            strokeWidth="1"
                        />
                    </g>

                    {/* Front main frosted document */}
                    <path
                        d="M62 20H102L120 38V92C120 96.4183 116.418 100 112 100H62C57.5817 100 54 96.4183 54 92V28C54 23.5817 57.5817 20 62 20Z"
                        fill={`url(#${glassSheet})`}
                        stroke="var(--border)"
                        strokeWidth="1"
                    />
                    {/* 1px specular glass sheen along top edge */}
                    <path
                        d="M62 21H101.5"
                        stroke="var(--glass-edge-top)"
                        strokeOpacity="0.85"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                    />
                    {/* Folded corner with optical accent */}
                    <path
                        d="M102 20V32C102 35.3137 104.686 38 108 38H120L102 20Z"
                        fill={`url(#${accentFold})`}
                    />
                    {/* Content placeholders */}
                    <rect
                        x="66"
                        y="34"
                        width="22"
                        height="4"
                        rx="2"
                        fill="var(--accent)"
                        fillOpacity="0.5"
                    />
                    <rect
                        x="66"
                        y="48"
                        width="42"
                        height="3.5"
                        rx="1.75"
                        fill="var(--foreground)"
                        fillOpacity="0.22"
                    />
                    <rect
                        x="66"
                        y="58"
                        width="38"
                        height="3.5"
                        rx="1.75"
                        fill="var(--foreground)"
                        fillOpacity="0.16"
                    />
                    <rect
                        x="66"
                        y="68"
                        width="42"
                        height="3.5"
                        rx="1.75"
                        fill="var(--foreground)"
                        fillOpacity="0.16"
                    />
                    <rect
                        x="66"
                        y="78"
                        width="26"
                        height="3.5"
                        rx="1.75"
                        fill="var(--foreground)"
                        fillOpacity="0.12"
                    />
                </svg>
            );
        }

        case "empty-apps": {
            const tileGrad = `${uid}-tile`;
            const accentTile = `${uid}-atile`;
            const glow = `${uid}-glow`;
            const tiles = [
                [46, 22],
                [70, 22],
                [94, 22],
                [118, 22],
                [46, 46],
                [70, 46],
                [94, 46],
                [118, 46],
                [46, 70],
                [70, 70],
                [94, 70],
            ] as const;
            return (
                <svg {...commonProps}>
                    <defs>
                        <linearGradient
                            id={tileGrad}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--surface-solid)"
                                stopOpacity="0.88"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--surface-soft)"
                                stopOpacity="0.48"
                            />
                        </linearGradient>
                        <linearGradient
                            id={accentTile}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--accent)"
                                stopOpacity="0.72"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--accent)"
                                stopOpacity="0.34"
                            />
                        </linearGradient>
                        <radialGradient id={glow} cx="50%" cy="50%" r="50%">
                            <stop
                                offset="0%"
                                stopColor="var(--accent)"
                                stopOpacity="0.3"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--accent)"
                                stopOpacity="0"
                            />
                        </radialGradient>
                    </defs>

                    <circle cx="104" cy="56" r="34" fill={`url(#${glow})`} />

                    {tiles.map(([x, y], idx) => {
                        const isFocus = idx === 6; // row 2, col 3
                        return (
                            <g key={`${x}-${y}`}>
                                <rect
                                    x={x}
                                    y={y}
                                    width="18"
                                    height="18"
                                    rx="5"
                                    fill={isFocus
                                        ? `url(#${accentTile})`
                                        : `url(#${tileGrad})`}
                                    stroke={isFocus
                                        ? "var(--accent)"
                                        : "var(--border)"}
                                    strokeOpacity={isFocus ? 0.7 : 1}
                                    strokeWidth="1"
                                />
                                <line
                                    x1={x + 4}
                                    y1={y + 1}
                                    x2={x + 14}
                                    y2={y + 1}
                                    stroke="var(--glass-edge-top)"
                                    strokeOpacity={isFocus ? 0.75 : 0.65}
                                    strokeWidth="1"
                                    strokeLinecap="round"
                                />
                            </g>
                        );
                    })}

                    {/* Empty dashed slot */}
                    <rect
                        x="118"
                        y="70"
                        width="18"
                        height="18"
                        rx="5"
                        fill="var(--surface-soft)"
                        fillOpacity="0.24"
                        stroke="var(--muted)"
                        strokeOpacity="0.35"
                        strokeWidth="1"
                        strokeDasharray="2.5 2.5"
                    />
                </svg>
            );
        }

        case "empty-ask": {
            const prismLeft = `${uid}-pleft`;
            const prismRight = `${uid}-pright`;
            const beam = `${uid}-beam`;
            const lens = `${uid}-lens`;
            return (
                <svg {...commonProps}>
                    <defs>
                        <linearGradient
                            id={beam}
                            x1="0"
                            y1="0.7"
                            x2="1"
                            y2="0.2"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--accent)"
                                stopOpacity="0.06"
                            />
                            <stop
                                offset="45%"
                                stopColor="var(--accent)"
                                stopOpacity="0.28"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--accent)"
                                stopOpacity="0"
                            />
                        </linearGradient>
                        <linearGradient
                            id={prismLeft}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--surface-solid)"
                                stopOpacity="0.92"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--surface-soft)"
                                stopOpacity="0.52"
                            />
                        </linearGradient>
                        <linearGradient
                            id={prismRight}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--surface-soft)"
                                stopOpacity="0.75"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--surface-soft)"
                                stopOpacity="0.28"
                            />
                        </linearGradient>
                        <linearGradient id={lens} x1="0" y1="0" x2="1" y2="1">
                            <stop
                                offset="0%"
                                stopColor="var(--surface-solid)"
                                stopOpacity="0.72"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--accent)"
                                stopOpacity="0.22"
                            />
                        </linearGradient>
                    </defs>

                    {/* Optical beam */}
                    <polygon
                        points="34,76 80,58 148,26 148,54 84,68"
                        fill={`url(#${beam})`}
                    />

                    {/* Optical glass prism */}
                    <polygon
                        points="78,24 50,84 78,92"
                        fill={`url(#${prismLeft})`}
                        stroke="var(--border)"
                        strokeWidth="1"
                        strokeLinejoin="round"
                    />
                    <polygon
                        points="78,24 104,82 78,92"
                        fill={`url(#${prismRight})`}
                        stroke="var(--border)"
                        strokeWidth="1"
                        strokeLinejoin="round"
                    />
                    <line
                        x1="78"
                        y1="25"
                        x2="78"
                        y2="91"
                        stroke="var(--glass-edge-top)"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                    />

                    {/* Overlapping frosted optical lens */}
                    <circle
                        cx="112"
                        cy="64"
                        r="22"
                        fill={`url(#${lens})`}
                        stroke="var(--border)"
                        strokeWidth="1.2"
                    />
                    <path
                        d="M97 52 A 19 19 0 0 1 124 49"
                        stroke="var(--glass-edge-top)"
                        strokeOpacity="0.85"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                    />
                    <circle
                        cx="112"
                        cy="64"
                        r="4.5"
                        fill="var(--accent)"
                        fillOpacity="0.78"
                    />
                </svg>
            );
        }

        case "empty-trash": {
            const trayGrad = `${uid}-tray`;
            const glow = `${uid}-glow`;
            return (
                <svg {...commonProps}>
                    <defs>
                        <linearGradient
                            id={trayGrad}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--surface-solid)"
                                stopOpacity="0.9"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--surface-soft)"
                                stopOpacity="0.45"
                            />
                        </linearGradient>
                        <radialGradient id={glow} cx="50%" cy="50%" r="50%">
                            <stop
                                offset="0%"
                                stopColor="var(--accent)"
                                stopOpacity="0.16"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--accent)"
                                stopOpacity="0"
                            />
                        </radialGradient>
                    </defs>

                    <ellipse
                        cx="90"
                        cy="62"
                        rx="52"
                        ry="36"
                        fill={`url(#${glow})`}
                    />

                    {/* Frosted lid floating lightly */}
                    <rect
                        x="54"
                        y="26"
                        width="72"
                        height="10"
                        rx="5"
                        fill={`url(#${trayGrad})`}
                        stroke="var(--border)"
                        strokeWidth="1"
                    />
                    <rect
                        x="78"
                        y="21"
                        width="24"
                        height="5"
                        rx="2.5"
                        fill="var(--surface-soft)"
                        stroke="var(--border)"
                        strokeWidth="1"
                    />
                    <line
                        x1="60"
                        y1="27"
                        x2="120"
                        y2="27"
                        stroke="var(--glass-edge-top)"
                        strokeOpacity="0.8"
                        strokeWidth="1"
                        strokeLinecap="round"
                    />

                    {/* Frosted glass bin body */}
                    <path
                        d="M60 42H120L114 92C113.5 96.4 109.8 99.5 105.4 99.5H74.6C70.2 99.5 66.5 96.4 66 92L60 42Z"
                        fill={`url(#${trayGrad})`}
                        stroke="var(--border)"
                        strokeWidth="1"
                    />
                    <line
                        x1="78"
                        y1="54"
                        x2="80"
                        y2="86"
                        stroke="var(--muted)"
                        strokeOpacity="0.3"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                    />
                    <line
                        x1="90"
                        y1="54"
                        x2="90"
                        y2="86"
                        stroke="var(--muted)"
                        strokeOpacity="0.3"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                    />
                    <line
                        x1="102"
                        y1="54"
                        x2="100"
                        y2="86"
                        stroke="var(--muted)"
                        strokeOpacity="0.3"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                    />

                    {/* Sparkle */}
                    <path
                        d="M132 24L134 29L139 31L134 33L132 38L130 33L125 31L130 29Z"
                        fill="var(--accent)"
                        fillOpacity="0.72"
                    />
                </svg>
            );
        }

        case "no-results": {
            const cardGrad = `${uid}-card`;
            const lensGrad = `${uid}-lens`;
            return (
                <svg {...commonProps}>
                    <defs>
                        <linearGradient
                            id={cardGrad}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--surface-solid)"
                                stopOpacity="0.88"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--surface-soft)"
                                stopOpacity="0.48"
                            />
                        </linearGradient>
                        <linearGradient
                            id={lensGrad}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--surface-solid)"
                                stopOpacity="0.75"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--accent)"
                                stopOpacity="0.22"
                            />
                        </linearGradient>
                    </defs>

                    {/* Background blank search results card */}
                    <rect
                        x="42"
                        y="26"
                        width="82"
                        height="62"
                        rx="10"
                        fill={`url(#${cardGrad})`}
                        stroke="var(--border)"
                        strokeWidth="1"
                    />
                    <line
                        x1="50"
                        y1="27"
                        x2="116"
                        y2="27"
                        stroke="var(--glass-edge-top)"
                        strokeOpacity="0.8"
                        strokeWidth="1"
                        strokeLinecap="round"
                    />
                    <rect
                        x="54"
                        y="40"
                        width="46"
                        height="4"
                        rx="2"
                        fill="var(--foreground)"
                        fillOpacity="0.16"
                    />
                    <rect
                        x="54"
                        y="51"
                        width="32"
                        height="4"
                        rx="2"
                        fill="var(--foreground)"
                        fillOpacity="0.12"
                    />
                    <rect
                        x="54"
                        y="62"
                        width="38"
                        height="4"
                        rx="2"
                        fill="var(--foreground)"
                        fillOpacity="0.1"
                    />

                    {/* Optical magnifying glass */}
                    <circle
                        cx="108"
                        cy="66"
                        r="21"
                        fill={`url(#${lensGrad})`}
                        stroke="var(--accent)"
                        strokeOpacity="0.65"
                        strokeWidth="1.4"
                    />
                    <path
                        d="M95 55 A 16 16 0 0 1 118 53"
                        stroke="var(--glass-edge-top)"
                        strokeOpacity="0.88"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                    />
                    <line
                        x1="123"
                        y1="81"
                        x2="137"
                        y2="95"
                        stroke="var(--foreground)"
                        strokeOpacity="0.5"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                    />
                </svg>
            );
        }

        case "auth-or-error": {
            const winGrad = `${uid}-win`;
            const badgeGrad = `${uid}-badge`;
            return (
                <svg {...commonProps}>
                    <defs>
                        <linearGradient
                            id={winGrad}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--surface-solid)"
                                stopOpacity="0.9"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--surface-soft)"
                                stopOpacity="0.48"
                            />
                        </linearGradient>
                        <linearGradient
                            id={badgeGrad}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--accent)"
                                stopOpacity="0.72"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--accent)"
                                stopOpacity="0.34"
                            />
                        </linearGradient>
                    </defs>

                    {/* Back window layer */}
                    <rect
                        x="46"
                        y="22"
                        width="76"
                        height="56"
                        rx="9"
                        fill={`url(#${winGrad})`}
                        stroke="var(--border)"
                        strokeWidth="1"
                    />

                    {/* Front offset glass window */}
                    <rect
                        x="58"
                        y="36"
                        width="78"
                        height="58"
                        rx="10"
                        fill={`url(#${winGrad})`}
                        stroke="var(--border)"
                        strokeWidth="1"
                    />
                    <line
                        x1="66"
                        y1="37"
                        x2="128"
                        y2="37"
                        stroke="var(--glass-edge-top)"
                        strokeOpacity="0.85"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                    />

                    {/* Window dots */}
                    <circle
                        cx="70"
                        cy="46"
                        r="2"
                        fill="var(--muted)"
                        fillOpacity="0.45"
                    />
                    <circle
                        cx="77"
                        cy="46"
                        r="2"
                        fill="var(--muted)"
                        fillOpacity="0.35"
                    />
                    <circle
                        cx="84"
                        cy="46"
                        r="2"
                        fill="var(--muted)"
                        fillOpacity="0.25"
                    />

                    {/* Central optical status node */}
                    <circle
                        cx="97"
                        cy="68"
                        r="14"
                        fill={`url(#${badgeGrad})`}
                        stroke="var(--accent)"
                        strokeOpacity="0.6"
                        strokeWidth="1"
                    />
                    <circle cx="97" cy="68" r="4" fill="var(--surface-solid)" />
                </svg>
            );
        }
    }
}
