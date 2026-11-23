import type { IllustrationName } from "./types.ts";

interface BotanicalSvgProps {
    name: IllustrationName;
    className?: string;
    size?: "sm" | "md" | "lg";
}

export function BotanicalIllustration(
    { name, className, size = "md" }: BotanicalSvgProps,
) {
    const commonProps = {
        viewBox: "0 0 180 120",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        className,
        "data-size": size,
        "data-illustration": name,
        "data-illustration-style": "botanical",
        "aria-hidden": true as const,
        focusable: false as const,
    };

    switch (name) {
        case "empty-documents":
            return (
                <svg {...commonProps}>
                    {/* Blueprint drafting grid */}
                    <g
                        stroke="var(--border)"
                        strokeOpacity="0.7"
                        strokeWidth="0.75"
                    >
                        <line x1="44" y1="34" x2="136" y2="34" />
                        <line x1="44" y1="60" x2="136" y2="60" />
                        <line x1="44" y1="86" x2="136" y2="86" />
                        <line x1="60" y1="16" x2="60" y2="104" />
                        <line x1="90" y1="16" x2="90" y2="104" />
                        <line x1="120" y1="16" x2="120" y2="104" />
                    </g>

                    {/* Document wireframe with folded corner */}
                    <path
                        d="M64 22H100L114 36V96H64V22Z"
                        fill="var(--surface-solid)"
                        fillOpacity="0.65"
                        stroke="var(--foreground)"
                        strokeOpacity="0.72"
                        strokeWidth="1.25"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M100 22V36H114"
                        stroke="var(--foreground)"
                        strokeOpacity="0.72"
                        strokeWidth="1.25"
                        strokeLinejoin="round"
                    />
                    {/* Crop marks */}
                    <path
                        d="M68 29H74M71 26V32"
                        stroke="var(--muted)"
                        strokeOpacity="0.55"
                        strokeWidth="1"
                    />
                    <path
                        d="M68 89H74M71 86V92"
                        stroke="var(--muted)"
                        strokeOpacity="0.55"
                        strokeWidth="1"
                    />
                    {/* Accent focal node */}
                    <circle cx="90" cy="60" r="2.75" fill="var(--accent)" />

                    {/* Ginkgo leaf silhouette & veins */}
                    <g strokeLinecap="round" strokeLinejoin="round">
                        <path
                            d="M106 98C110 89 113 83 115 79"
                            stroke="var(--foreground)"
                            strokeOpacity="0.78"
                            strokeWidth="1.35"
                        />
                        <path
                            d="M115 79C103 75 97 64 103 55C108 59 112 63 115 67C118 61 124 55 131 54C137 62 133 75 115 79Z"
                            fill="var(--accent-soft)"
                            stroke="var(--foreground)"
                            strokeOpacity="0.82"
                            strokeWidth="1.25"
                        />
                        <path
                            d="M115 78L108 62M115 78L115 69M115 78L124 61"
                            stroke="var(--muted)"
                            strokeOpacity="0.55"
                            strokeWidth="0.9"
                        />
                    </g>
                </svg>
            );

        case "empty-apps": {
            const cells = [
                [52, 24],
                [80, 24],
                [108, 24],
                [52, 52],
                [80, 52],
                [108, 52],
            ] as const;
            return (
                <svg {...commonProps}>
                    {/* Blueprint grid lines */}
                    <g
                        stroke="var(--border)"
                        strokeOpacity="0.7"
                        strokeWidth="0.75"
                    >
                        <line x1="40" y1="35" x2="140" y2="35" />
                        <line x1="40" y1="63" x2="140" y2="63" />
                        <line x1="63" y1="16" x2="63" y2="92" />
                        <line x1="91" y1="16" x2="91" y2="92" />
                        <line x1="119" y1="16" x2="119" y2="92" />
                    </g>

                    {cells.map(([x, y], i) => (
                        <rect
                            key={`${x}-${y}`}
                            x={x}
                            y={y}
                            width="22"
                            height="22"
                            rx="6"
                            fill={i === 0
                                ? "var(--accent-soft)"
                                : "var(--surface-solid)"}
                            fillOpacity={i === 0 ? 0.8 : 0.45}
                            stroke="var(--foreground)"
                            strokeOpacity={i === 2 || i === 5 ? 0.72 : 0.4}
                            strokeWidth="1.2"
                        />
                    ))}

                    {/* Drafting crosshair + accent anchor in top-left tile */}
                    <circle cx="63" cy="35" r="2.5" fill="var(--accent)" />

                    {/* Slender botanical sprig */}
                    <g
                        stroke="var(--foreground)"
                        strokeOpacity="0.8"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M90 98C92 78 90 48 94 18" />
                        <path
                            d="M91 74C83 70 79 64 81 59C86 61 90 66 91 74Z"
                            fill="var(--surface-solid)"
                        />
                        <path
                            d="M91 64C98 60 103 54 102 49C97 51 93 57 91 64Z"
                            fill="var(--accent-soft)"
                        />
                        <path
                            d="M91 50C85 45 81 39 83 34C88 36 91 42 91 50Z"
                            fill="var(--surface-solid)"
                        />
                        <path
                            d="M92 38C98 34 102 28 100 23C96 25 93 31 92 38Z"
                            fill="var(--surface-solid)"
                        />
                    </g>
                </svg>
            );
        }

        case "empty-ask":
            return (
                <svg {...commonProps}>
                    {/* Dialogue wireframe */}
                    <path
                        d="M52 28H124C126.2 28 128 29.8 128 32V74C128 76.2 126.2 78 124 78H84L74 87V78H52C49.8 78 48 76.2 48 74V32C48 29.8 49.8 28 52 28Z"
                        fill="var(--surface-solid)"
                        fillOpacity="0.55"
                        stroke="var(--foreground)"
                        strokeOpacity="0.72"
                        strokeWidth="1.25"
                        strokeLinejoin="round"
                    />
                    <line
                        x1="48"
                        y1="40"
                        x2="128"
                        y2="40"
                        stroke="var(--border)"
                        strokeWidth="1"
                    />

                    {/* Star compass */}
                    <g transform="translate(52 78)">
                        <path
                            d="M0 -14L3.2 -3.2L14 0L3.2 3.2L0 14L-3.2 3.2L-14 0L-3.2 -3.2Z"
                            fill="var(--accent-soft)"
                            stroke="var(--foreground)"
                            strokeOpacity="0.82"
                            strokeWidth="1.2"
                            strokeLinejoin="round"
                        />
                        <circle cx="0" cy="0" r="2.2" fill="var(--accent)" />
                    </g>

                    {/* Graceful fern sprig */}
                    <g
                        stroke="var(--foreground)"
                        strokeOpacity="0.8"
                        strokeWidth="1.15"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M114 96C123 76 130 56 134 32" />
                        <path
                            d="M120 82C115 79 112 76 112 73C116 74 119 77 120 82Z"
                            fill="var(--accent-soft)"
                        />
                        <path
                            d="M124 71C119 68 116 65 116 62C120 63 123 66 124 71Z"
                            fill="var(--surface-solid)"
                        />
                        <path
                            d="M128 59C123 56 120 53 121 50C125 51 127 54 128 59Z"
                            fill="var(--accent-soft)"
                        />
                        <path
                            d="M123 76C129 74 134 70 135 67C131 67 127 70 123 76Z"
                            fill="var(--surface-solid)"
                        />
                        <path
                            d="M127 65C133 63 137 59 138 56C134 56 130 59 127 65Z"
                            fill="var(--surface-solid)"
                        />
                    </g>
                </svg>
            );

        case "empty-trash":
            return (
                <svg {...commonProps}>
                    {/* Blueprint axis */}
                    <g
                        stroke="var(--border)"
                        strokeOpacity="0.7"
                        strokeWidth="0.75"
                    >
                        <line x1="48" y1="94" x2="132" y2="94" />
                        <line
                            x1="90"
                            y1="18"
                            x2="90"
                            y2="104"
                            strokeDasharray="3 3"
                        />
                    </g>

                    {/* Clean drafting bin wireframe */}
                    <path
                        d="M58 34H122M78 34V27C78 25.3 79.3 24 81 24H99C100.7 24 102 25.3 102 27V34"
                        stroke="var(--foreground)"
                        strokeOpacity="0.78"
                        strokeWidth="1.25"
                        strokeLinecap="round"
                    />
                    <path
                        d="M64 40H116L111 94H69L64 40Z"
                        fill="var(--surface-solid)"
                        fillOpacity="0.55"
                        stroke="var(--foreground)"
                        strokeOpacity="0.78"
                        strokeWidth="1.25"
                        strokeLinejoin="round"
                    />
                    <line
                        x1="78"
                        y1="52"
                        x2="80"
                        y2="84"
                        stroke="var(--muted)"
                        strokeOpacity="0.45"
                        strokeWidth="1.1"
                        strokeLinecap="round"
                    />
                    <line
                        x1="102"
                        y1="52"
                        x2="100"
                        y2="84"
                        stroke="var(--muted)"
                        strokeOpacity="0.45"
                        strokeWidth="1.1"
                        strokeLinecap="round"
                    />

                    {/* Small botanical leaf resting beside bin */}
                    <path
                        d="M116 94C121 82 128 73 136 68"
                        stroke="var(--foreground)"
                        strokeOpacity="0.78"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                    />
                    <path
                        d="M126 79C124 72 128 65 135 64C137 70 133 77 126 79Z"
                        fill="var(--accent-soft)"
                        stroke="var(--foreground)"
                        strokeOpacity="0.8"
                        strokeWidth="1.15"
                    />
                    <circle cx="90" cy="64" r="2.2" fill="var(--accent)" />
                </svg>
            );

        case "no-results":
            return (
                <svg {...commonProps}>
                    {/* Dashed blueprint search frame */}
                    <rect
                        x="46"
                        y="26"
                        width="78"
                        height="62"
                        rx="6"
                        fill="var(--surface-solid)"
                        fillOpacity="0.45"
                        stroke="var(--muted)"
                        strokeOpacity="0.55"
                        strokeWidth="1.1"
                        strokeDasharray="3.5 3.5"
                    />
                    {/* Lens wireframe with crosshair */}
                    <circle
                        cx="96"
                        cy="60"
                        r="20"
                        fill="var(--surface-solid)"
                        fillOpacity="0.7"
                        stroke="var(--foreground)"
                        strokeOpacity="0.82"
                        strokeWidth="1.25"
                    />
                    <line
                        x1="96"
                        y1="45"
                        x2="96"
                        y2="75"
                        stroke="var(--border)"
                        strokeWidth="1"
                    />
                    <line
                        x1="81"
                        y1="60"
                        x2="111"
                        y2="60"
                        stroke="var(--border)"
                        strokeWidth="1"
                    />
                    <circle cx="96" cy="60" r="2.5" fill="var(--accent)" />
                    <line
                        x1="110"
                        y1="74"
                        x2="124"
                        y2="88"
                        stroke="var(--foreground)"
                        strokeOpacity="0.82"
                        strokeWidth="2"
                        strokeLinecap="round"
                    />

                    {/* Delicate twig */}
                    <path
                        d="M44 92C52 78 58 68 62 56"
                        stroke="var(--foreground)"
                        strokeOpacity="0.75"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                    />
                    <path
                        d="M55 72C49 69 47 64 49 59C54 61 57 66 55 72Z"
                        fill="var(--accent-soft)"
                        stroke="var(--foreground)"
                        strokeOpacity="0.78"
                        strokeWidth="1.1"
                    />
                </svg>
            );

        case "auth-or-error":
            return (
                <svg {...commonProps}>
                    {/* Coordinate axes */}
                    <g
                        stroke="var(--border)"
                        strokeOpacity="0.75"
                        strokeWidth="0.75"
                    >
                        <line x1="36" y1="60" x2="144" y2="60" />
                        <line x1="90" y1="16" x2="90" y2="104" />
                    </g>

                    {/* Offset drafting window */}
                    <rect
                        x="52"
                        y="28"
                        width="76"
                        height="58"
                        rx="6"
                        fill="var(--surface-solid)"
                        fillOpacity="0.65"
                        stroke="var(--foreground)"
                        strokeOpacity="0.78"
                        strokeWidth="1.25"
                    />
                    <line
                        x1="52"
                        y1="40"
                        x2="128"
                        y2="40"
                        stroke="var(--foreground)"
                        strokeOpacity="0.4"
                        strokeWidth="1"
                    />
                    <circle cx="62" cy="34" r="1.5" fill="var(--muted)" />
                    <circle cx="68" cy="34" r="1.5" fill="var(--muted)" />

                    {/* Compass anchor */}
                    <circle
                        cx="90"
                        cy="60"
                        r="11"
                        fill="var(--accent-soft)"
                        stroke="var(--foreground)"
                        strokeOpacity="0.75"
                        strokeWidth="1.15"
                    />
                    <circle cx="90" cy="60" r="2.75" fill="var(--accent)" />

                    {/* Leaf sprig on bottom-right */}
                    <path
                        d="M116 96C124 84 130 74 134 62"
                        stroke="var(--foreground)"
                        strokeOpacity="0.8"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                    />
                    <path
                        d="M126 78C121 75 119 69 121 65C126 67 128 72 126 78Z"
                        fill="var(--accent-soft)"
                        stroke="var(--foreground)"
                        strokeOpacity="0.8"
                        strokeWidth="1.1"
                    />
                </svg>
            );
    }
}
