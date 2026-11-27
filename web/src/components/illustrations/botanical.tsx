import { useEffect, useRef, useState } from "react";
import type { IllustrationName } from "./types.ts";

interface BotanicalSvgProps {
    name: IllustrationName;
    className?: string;
    size?: "sm" | "md" | "lg";
}

type CanonicalIllustration = Exclude<IllustrationName, "auth-or-error">;

function resolveCanonicalName(name: IllustrationName): CanonicalIllustration {
    return name === "auth-or-error" ? "load-error" : name;
}

/**
 * Shared registration crosshairs & archival corner ticks (Layer 0).
 */
function EtchingRegistration() {
    return (
        <g
            className="ill-registration"
            stroke="var(--border)"
            strokeOpacity="0.85"
            strokeWidth="0.75"
            strokeLinecap="round"
        >
            {/* Top-left & bottom-right specimen registration marks */}
            <path d="M31 18H37M34 15V21" />
            <path d="M143 99H149M146 96V102" />
            {/* Subtle corner ticks */}
            <path d="M30 96V102H36" strokeOpacity="0.55" />
            <path d="M144 16H150V22" strokeOpacity="0.55" />
        </g>
    );
}

export function BotanicalIllustration(
    { name, className, size = "md" }: BotanicalSvgProps,
) {
    const canonical = resolveCanonicalName(name);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [pulseActive, setPulseActive] = useState(false);
    const [docClicks, setDocClicks] = useState(0);
    const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isClickInteractive = canonical !== "no-results" &&
        canonical !== "not-found";

    useEffect(() => {
        return () => {
            if (pulseTimerRef.current !== null) {
                globalThis.clearTimeout(pulseTimerRef.current);
            }
        };
    }, []);

    const triggerPulse = () => {
        if (
            typeof globalThis !== "undefined" &&
            globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            return;
        }
        if (canonical === "empty-documents") {
            setDocClicks((c) => Math.min(c + 1, 9));
        }
        setPulseActive(false);
        requestAnimationFrame(() => {
            setPulseActive(true);
            if (pulseTimerRef.current !== null) {
                globalThis.clearTimeout(pulseTimerRef.current);
            }
            pulseTimerRef.current = globalThis.setTimeout(() => {
                setPulseActive(false);
                pulseTimerRef.current = null;
            }, 720);
        });
    };

    // Real-time homing compass for `not-found`
    useEffect(() => {
        if (canonical !== "not-found") return;
        const svg = svgRef.current;
        if (!svg) return;
        const reducedQuery = globalThis.matchMedia(
            "(prefers-reduced-motion: reduce)",
        );
        if (reducedQuery.matches) return;

        let rafId: number | null = null;
        let currentDeg = 165;
        let pointerX = -9999;
        let pointerY = -9999;

        const updateAngle = () => {
            rafId = null;
            const rect = svg.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            // Compass center in viewBox (24 10 132 100) is (78, 58)
            const cx = rect.left + ((78 - 24) / 132) * rect.width;
            const cy = rect.top + ((58 - 10) / 100) * rect.height;

            const host = svg.closest(
                ".narrow-form, .route-error-fallback, .design-lab-illustration-card, .empty-state, main",
            );
            const target = host?.querySelector<HTMLElement>(
                '[data-compass-target="home"], a[href="/"], button',
            ) ?? document.querySelector<HTMLElement>('main a[href="/"]');

            let targetDeg = 180;
            if (target) {
                const tRect = target.getBoundingClientRect();
                const tx = tRect.left + tRect.width / 2;
                const ty = tRect.top + tRect.height / 2;
                targetDeg = Math.atan2(ty - cy, tx - cx) * (180 / Math.PI) +
                    90;
            }

            // Subtle magnetic perturbation when pointer approaches within 110px
            const pDist = Math.hypot(pointerX - cx, pointerY - cy);
            if (pDist < 110 && pDist > 4) {
                const pDeg =
                    Math.atan2(pointerY - cy, pointerX - cx) * (180 / Math.PI) +
                    90;
                const blend = (1 - pDist / 110) * 0.18;
                const pDiff = ((pDeg - targetDeg + 540) % 360) - 180;
                targetDeg += pDiff * blend;
            }

            // Continuous shortest-angle delta to avoid 360deg wrap jumps
            const delta = ((targetDeg - currentDeg + 540) % 360) - 180;
            currentDeg += delta;
            svg.style.setProperty(
                "--illustration-compass-deg",
                `${currentDeg.toFixed(1)}deg`,
            );
        };

        const schedule = () => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(updateAngle);
        };

        const onPointerMove = (e: PointerEvent) => {
            pointerX = e.clientX;
            pointerY = e.clientY;
            schedule();
        };

        schedule();
        globalThis.addEventListener("resize", schedule, { passive: true });
        globalThis.addEventListener("scroll", schedule, { passive: true });
        globalThis.addEventListener("pointermove", onPointerMove, {
            passive: true,
        });

        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            globalThis.removeEventListener("resize", schedule);
            globalThis.removeEventListener("scroll", schedule);
            globalThis.removeEventListener("pointermove", onPointerMove);
        };
    }, [canonical]);

    // Parallax loupe + peeking critter for `no-results`
    useEffect(() => {
        if (canonical !== "no-results") return;
        const svg = svgRef.current;
        if (!svg) return;
        const reducedQuery = globalThis.matchMedia(
            "(prefers-reduced-motion: reduce)",
        );
        if (reducedQuery.matches) return;

        const stage = svg.closest<HTMLElement>(
            ".empty-state, [data-illustration-stage]",
        ) ?? svg;

        let rafId: number | null = null;
        let nextNx = 0;
        let nextNy = 0;

        const applyOffsets = () => {
            rafId = null;
            svg.style.setProperty(
                "--illustration-lens-x",
                `${(nextNx * 7.5).toFixed(2)}px`,
            );
            svg.style.setProperty(
                "--illustration-lens-y",
                `${(nextNy * 5.5).toFixed(2)}px`,
            );
            svg.style.setProperty(
                "--illustration-critter-x",
                `${(-nextNx * 2.8).toFixed(2)}px`,
            );
            svg.style.setProperty(
                "--illustration-critter-y",
                `${(-nextNy * 2.0).toFixed(2)}px`,
            );
        };

        const schedule = () => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(applyOffsets);
        };

        const onPointerMove = (e: Event) => {
            if (!(e instanceof PointerEvent)) return;
            const rect = stage.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const rx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const ry = ((e.clientY - rect.top) / rect.height) * 2 - 1;
            nextNx = Math.max(-1, Math.min(1, rx));
            nextNy = Math.max(-1, Math.min(1, ry));
            schedule();
        };

        const onPointerLeave = () => {
            nextNx = 0;
            nextNy = 0;
            schedule();
        };

        stage.addEventListener("pointermove", onPointerMove, { passive: true });
        stage.addEventListener("pointerleave", onPointerLeave);

        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            stage.removeEventListener("pointermove", onPointerMove);
            stage.removeEventListener("pointerleave", onPointerLeave);
        };
    }, [canonical]);

    const commonProps = {
        ref: svgRef,
        viewBox: "24 10 132 100",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        className,
        "data-size": size,
        "data-illustration": name,
        "data-illustration-style": "botanical",
        "data-interactive": isClickInteractive ? "click" : "pointer",
        "data-pulse": pulseActive ? "active" : undefined,
        "data-sealed": canonical === "empty-documents" && docClicks >= 3
            ? "true"
            : undefined,
        "aria-hidden": true as const,
        focusable: false as const,
        onClick: isClickInteractive ? triggerPulse : undefined,
    };

    switch (canonical) {
        case "empty-documents":
            return (
                <svg {...commonProps}>
                    <EtchingRegistration />

                    {/* Layer 1: Risograph overprint wash */}
                    <g className="ill-overprint" transform="translate(2.2 1.6)">
                        <path
                            d="M52 26H104L116 38V92H52V26Z"
                            fill="var(--accent-soft)"
                            fillOpacity="0.72"
                        />
                        {/* Ginkgo bookmark wash */}
                        <path
                            d="M111 73C100 69 94 59 101 51C106 55 110 60 112 64C115 58 121 52 128 52C133 60 128 71 111 73Z"
                            fill="var(--accent)"
                            fillOpacity="0.22"
                        />
                    </g>

                    {/* Paper substrate */}
                    <path
                        d="M50 24H101L114 37V91H50V24Z"
                        fill="var(--surface-solid)"
                        fillOpacity="0.88"
                    />

                    {/* Layer 2: Copperplate spine & shadow hatching */}
                    <g
                        className="ill-hatching"
                        stroke="var(--muted)"
                        strokeOpacity="0.52"
                        strokeWidth="0.6"
                        strokeLinecap="round"
                    >
                        <line x1="53" y1="30" x2="57" y2="30" />
                        <line x1="53" y1="34" x2="56.5" y2="34" />
                        <line x1="53" y1="38" x2="57" y2="38" />
                        <line x1="53" y1="42" x2="56.5" y2="42" />
                        <line x1="53" y1="46" x2="57" y2="46" />
                        <line x1="53" y1="74" x2="57" y2="74" />
                        <line x1="53" y1="78" x2="56.5" y2="78" />
                        <line x1="53" y1="82" x2="57" y2="82" />
                        {/* Ruled archival lines */}
                        <line
                            x1="64"
                            y1="44"
                            x2="96"
                            y2="44"
                            strokeOpacity="0.32"
                            strokeDasharray="2 2"
                        />
                        <line
                            x1="64"
                            y1="54"
                            x2="92"
                            y2="54"
                            strokeOpacity="0.32"
                            strokeDasharray="2 2"
                        />
                        <line
                            x1="64"
                            y1="64"
                            x2="86"
                            y2="64"
                            strokeOpacity="0.32"
                            strokeDasharray="2 2"
                        />
                    </g>

                    {/* Thread-bound ledger frame with line-weight hierarchy */}
                    <path
                        d="M50 24H101L114 37V91H50V24Z"
                        stroke="var(--foreground)"
                        strokeOpacity="0.88"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                    />
                    <line
                        x1="58"
                        y1="24"
                        x2="58"
                        y2="91"
                        stroke="var(--foreground)"
                        strokeOpacity="0.5"
                        strokeWidth="0.95"
                    />
                    {/* Thread-bound stitch knots */}
                    <g
                        stroke="var(--foreground)"
                        strokeOpacity="0.72"
                        strokeWidth="1.05"
                        strokeLinecap="round"
                    >
                        <path d="M48.5 34H52.5" />
                        <path d="M48.5 56H52.5" />
                        <path d="M48.5 78H52.5" />
                    </g>

                    {/* Folded corner curl */}
                    <g transform="translate(101 24)">
                        <g className="ill-page-curl">
                            <path
                                d="M0 0V13H13Z"
                                fill="var(--surface-solid)"
                                stroke="var(--foreground)"
                                strokeOpacity="0.86"
                                strokeWidth="1.25"
                                strokeLinejoin="round"
                            />
                        </g>
                    </g>

                    {/* Layer 3: Tapered calligraphic ginkgo bookmark & veins */}
                    <g className="ill-calligraphy">
                        <path
                            d="M100 94C104 86 107 79 110 73C111 73.5 111.6 74.2 111.2 75C108.5 81 105.2 88 101.2 94.6Z"
                            fill="var(--foreground)"
                            fillOpacity="0.88"
                        />
                        <path
                            d="M111 74C99 70 93 60 100 52C105 56 109 61 111 65C114 59 120 53 127 53C132 61 127 72 111 74Z"
                            fill="var(--accent-soft)"
                            fillOpacity="0.82"
                            stroke="var(--foreground)"
                            strokeOpacity="0.9"
                            strokeWidth="1.4"
                            strokeLinejoin="round"
                        />
                        <path
                            d="M111 73L104 58M111 73L111 66M111 73L120 58"
                            stroke="var(--muted)"
                            strokeOpacity="0.72"
                            strokeWidth="0.75"
                            strokeLinecap="round"
                        />
                    </g>

                    {/* Hovering calligraphy nib & ink ripple target */}
                    <g transform="translate(78 72)">
                        <circle
                            className="ill-ink-ripple"
                            cx="0"
                            cy="0"
                            r="11"
                            stroke="var(--accent)"
                            strokeWidth="1.2"
                            fill="var(--accent-soft)"
                            fillOpacity="0.45"
                        />
                        <g
                            className="ill-nib-group"
                            transform="translate(0 -12)"
                        >
                            <path
                                d="M7 -16L13 -10L2 5L-2 8L-1 3Z"
                                fill="var(--surface-solid)"
                                stroke="var(--foreground)"
                                strokeOpacity="0.9"
                                strokeWidth="1.3"
                                strokeLinejoin="round"
                            />
                            <line
                                x1="-1.5"
                                y1="7.5"
                                x2="4.5"
                                y2="-1.5"
                                stroke="var(--foreground)"
                                strokeWidth="0.85"
                            />
                            <circle
                                cx="-2.2"
                                cy="11.2"
                                r="2.2"
                                fill="var(--accent)"
                            />
                        </g>
                    </g>

                    {/* Hidden literati seal stamp (unlocked after 3 clicks) */}
                    <g transform="translate(94 82)">
                        <g className="ill-literati-seal">
                            <rect
                                x="-6.5"
                                y="-6.5"
                                width="13"
                                height="13"
                                rx="2"
                                fill="var(--accent)"
                                fillOpacity="0.9"
                            />
                            <path
                                d="M-3 -2.5H3M0 -2.5V3.2M-3.2 1H3.2"
                                stroke="var(--surface-solid)"
                                strokeWidth="1.1"
                                strokeLinecap="round"
                            />
                        </g>
                    </g>
                </svg>
            );

        case "empty-apps": {
            const cells = [
                [48, 25],
                [77, 25],
                [106, 25],
                [48, 54],
                [77, 54],
                [106, 54],
            ] as const;
            return (
                <svg {...commonProps}>
                    <EtchingRegistration />

                    {/* Layer 1: Risograph overprint for specimen cabinet */}
                    <g className="ill-overprint" transform="translate(2.4 1.8)">
                        <rect
                            x="44"
                            y="21"
                            width="90"
                            height="64"
                            rx="7"
                            fill="var(--accent-soft)"
                            fillOpacity="0.58"
                        />
                        <rect
                            x="48"
                            y="25"
                            width="24"
                            height="24"
                            rx="5.5"
                            fill="var(--accent)"
                            fillOpacity="0.2"
                        />
                    </g>

                    {/* Wooden specimen tray */}
                    <rect
                        x="43"
                        y="20"
                        width="90"
                        height="64"
                        rx="7"
                        fill="var(--surface-solid)"
                        fillOpacity="0.82"
                        stroke="var(--foreground)"
                        strokeOpacity="0.86"
                        strokeWidth="1.5"
                    />

                    {/* Layer 2: Copperplate wood-grain & inner tray hatching */}
                    <g
                        className="ill-hatching"
                        stroke="var(--muted)"
                        strokeOpacity="0.45"
                        strokeWidth="0.6"
                        strokeLinecap="round"
                    >
                        <line x1="74" y1="25" x2="74" y2="78" />
                        <line x1="103" y1="25" x2="103" y2="78" />
                        <line x1="48" y1="51.5" x2="128" y2="51.5" />
                        {/* Etched hatching in bottom-right specimen cells */}
                        <path d="M109 61L115 57M109 66L121 57M113 70L125 60" />
                    </g>

                    {/* Specimen slots */}
                    {cells.map(([x, y], i) => (
                        <rect
                            key={`${x}-${y}`}
                            x={x}
                            y={y}
                            width="23"
                            height="23"
                            rx="5"
                            fill={i === 0
                                ? "var(--accent-soft)"
                                : "var(--surface-solid)"}
                            fillOpacity={i === 0 ? 0.88 : 0.6}
                            stroke="var(--foreground)"
                            strokeOpacity={i === 0 ? 0.88 : 0.45}
                            strokeWidth={i === 0 ? "1.4" : "1.0"}
                            strokeDasharray={i === 0 || i === 4
                                ? undefined
                                : "2.8 2.2"}
                        />
                    ))}

                    {/* Pencil specimen sketch mark in center cell */}
                    <g
                        stroke="var(--muted)"
                        strokeOpacity="0.65"
                        strokeWidth="0.9"
                        strokeLinecap="round"
                    >
                        <circle
                            cx="88.5"
                            cy="65.5"
                            r="4.5"
                            strokeDasharray="1.8 1.8"
                        />
                        <path d="M88.5 62.5V68.5M85.5 65.5H91.5" />
                    </g>

                    {/* Layer 3: Interactive botanical sprout breaking out of top-left cell */}
                    <g
                        className="ill-calligraphy"
                        transform="translate(59.5 44)"
                    >
                        <g className="ill-sprout-group">
                            <path
                                d="M-0.8 0C-1.2 -8 0.2 -16 3.5 -22C4.2 -21.6 4.6 -20.8 4.2 -20C1.8 -14 0.8 -7.5 1.1 0Z"
                                fill="var(--foreground)"
                                fillOpacity="0.9"
                            />
                            <path
                                d="M1 -12C-6 -14 -9 -20 -6 -24C-1 -23 2 -18 1 -12Z"
                                fill="var(--accent-soft)"
                                stroke="var(--foreground)"
                                strokeOpacity="0.9"
                                strokeWidth="1.3"
                                strokeLinejoin="round"
                            />
                            <path
                                d="M2 -16C8 -20 13 -19 14 -14C10 -12 5 -13 2 -16Z"
                                fill="var(--surface-solid)"
                                stroke="var(--foreground)"
                                strokeOpacity="0.88"
                                strokeWidth="1.25"
                                strokeLinejoin="round"
                            />
                            <circle
                                cx="0"
                                cy="-1.5"
                                r="2.2"
                                fill="var(--accent)"
                            />
                        </g>
                    </g>

                    {/* Trailing botanical vine along lower right */}
                    <g className="ill-calligraphy">
                        <path
                            d="M114 93C124 89 133 81 138 71"
                            stroke="var(--foreground)"
                            strokeOpacity="0.82"
                            strokeWidth="1.35"
                            strokeLinecap="round"
                        />
                        <path
                            d="M126 83C124 77 128 72 134 72C134 78 131 82 126 83Z"
                            fill="var(--accent-soft)"
                            stroke="var(--foreground)"
                            strokeOpacity="0.86"
                            strokeWidth="1.2"
                        />
                    </g>
                </svg>
            );
        }

        case "empty-ask":
            return (
                <svg {...commonProps}>
                    <EtchingRegistration />

                    {/* Layer 1: Risograph prism glow & refracted wash */}
                    <g className="ill-overprint" transform="translate(2.2 1.6)">
                        <circle
                            cx="72"
                            cy="59"
                            r="21"
                            fill="var(--accent-soft)"
                            fillOpacity="0.7"
                        />
                        <path
                            d="M84 54L134 32L126 68Z"
                            fill="var(--accent)"
                            fillOpacity="0.14"
                        />
                    </g>

                    {/* Refracted light rays */}
                    <g
                        className="ill-prism-ray"
                        stroke="var(--accent)"
                        strokeOpacity="0.62"
                        strokeWidth="0.95"
                        strokeDasharray="3 2.5"
                        opacity="0.72"
                    >
                        <line x1="36" y1="74" x2="62" y2="62" />
                        <line x1="84" y1="53" x2="132" y2="33" />
                        <line x1="85" y1="60" x2="136" y2="54" />
                    </g>

                    {/* Brass astrolabe outer ring */}
                    <circle
                        cx="72"
                        cy="59"
                        r="22"
                        fill="var(--surface-solid)"
                        fillOpacity="0.82"
                        stroke="var(--foreground)"
                        strokeOpacity="0.88"
                        strokeWidth="1.5"
                    />

                    {/* Layer 2: Copperplate degree ticks & prism facet hatching */}
                    <g
                        className="ill-hatching"
                        stroke="var(--muted)"
                        strokeOpacity="0.58"
                        strokeWidth="0.65"
                        strokeLinecap="round"
                    >
                        <path d="M72 39V42M72 76V79M52 59H55M89 59H92" />
                        <path d="M58 45L60 47M84 71L86 73M86 45L84 47M60 71L58 73" />
                        {/* Prism base hatching */}
                        <path d="M64 67L70 67M66 70L74 70" />
                    </g>

                    {/* Rotating inner astrolabe star & optical prism */}
                    <g transform="translate(72 59)">
                        <g className="ill-astrolabe-ring">
                            <circle
                                cx="0"
                                cy="0"
                                r="15"
                                stroke="var(--foreground)"
                                strokeOpacity="0.55"
                                strokeWidth="0.9"
                                strokeDasharray="2.5 2.5"
                            />
                            <path
                                d="M0 -11L2.6 -2.6L11 0L2.6 2.6L0 11L-2.6 2.6L-11 0L-2.6 -2.6Z"
                                fill="var(--accent-soft)"
                                stroke="var(--foreground)"
                                strokeOpacity="0.9"
                                strokeWidth="1.25"
                                strokeLinejoin="round"
                            />
                            <circle
                                cx="0"
                                cy="0"
                                r="2.6"
                                fill="var(--accent)"
                            />
                        </g>
                    </g>

                    {/* Layer 3: Refracted calligraphic fern frond */}
                    <g className="ill-calligraphy">
                        <path
                            d="M99 90C112 76 122 57 130 33C131 33.4 131.6 34 131.2 35C124.2 59 114.6 78 100.8 91.5Z"
                            fill="var(--foreground)"
                            fillOpacity="0.88"
                        />
                        <path
                            d="M111 76C104 72 101 67 103 63C108 65 111 70 111 76Z"
                            fill="var(--accent-soft)"
                            stroke="var(--foreground)"
                            strokeOpacity="0.88"
                            strokeWidth="1.2"
                        />
                        <path
                            d="M118 64C111 60 109 55 111 51C116 53 118 58 118 64Z"
                            fill="var(--surface-solid)"
                            stroke="var(--foreground)"
                            strokeOpacity="0.86"
                            strokeWidth="1.2"
                        />
                        <path
                            d="M116 70C123 68 129 63 130 59C125 59 120 63 116 70Z"
                            fill="var(--surface-solid)"
                            stroke="var(--foreground)"
                            strokeOpacity="0.86"
                            strokeWidth="1.2"
                        />
                        <path
                            d="M123 54C129 51 134 46 135 42C130 42 126 47 123 54Z"
                            fill="var(--accent-soft)"
                            stroke="var(--foreground)"
                            strokeOpacity="0.88"
                            strokeWidth="1.2"
                        />
                    </g>
                </svg>
            );

        case "empty-trash":
            return (
                <svg {...commonProps}>
                    <EtchingRegistration />

                    {/* Table horizon line */}
                    <line
                        x1="40"
                        y1="89"
                        x2="140"
                        y2="89"
                        stroke="var(--border)"
                        strokeWidth="1.05"
                    />

                    {/* Layer 1: Risograph overprint for ceramic bowl */}
                    <g className="ill-overprint" transform="translate(2.4 1.6)">
                        <path
                            d="M57 52H115C114 73 103 87 86 87C69 87 58 73 57 52Z"
                            fill="var(--accent-soft)"
                            fillOpacity="0.72"
                        />
                    </g>

                    {/* Tumbler ceramic bowl anchored at bottom center (86, 87) */}
                    <g transform="translate(86 87)">
                        {/* Clean sparkle above rim on click */}
                        <g transform="translate(0 -48)">
                            <path
                                className="ill-sparkle"
                                d="M0 -6L1.5 -1.5L6 0L1.5 1.5L0 6L-1.5 1.5L-6 0L-1.5 -1.5Z"
                                fill="var(--accent)"
                            />
                        </g>

                        <g className="ill-bowl-group">
                            {/* Ceramic body */}
                            <path
                                d="M-29 -36H29C28 -15 17 -1 0 -1C-17 -1 -28 -15 -29 -36Z"
                                fill="var(--surface-solid)"
                                fillOpacity="0.9"
                                stroke="var(--foreground)"
                                strokeOpacity="0.9"
                                strokeWidth="1.55"
                                strokeLinejoin="round"
                            />
                            {/* Rim ellipse */}
                            <ellipse
                                cx="0"
                                cy="-36"
                                rx="29"
                                ry="5.5"
                                fill="var(--surface-solid)"
                                stroke="var(--foreground)"
                                strokeOpacity="0.88"
                                strokeWidth="1.35"
                            />
                            {/* Foot ring */}
                            <path
                                d="M-11 -1.5H11V2H-11Z"
                                fill="var(--surface-solid)"
                                stroke="var(--foreground)"
                                strokeOpacity="0.86"
                                strokeWidth="1.2"
                            />

                            {/* Layer 2: Copperplate ceramic shading */}
                            <g
                                className="ill-hatching"
                                stroke="var(--muted)"
                                strokeOpacity="0.56"
                                strokeWidth="0.6"
                                strokeLinecap="round"
                            >
                                <path d="M16 -28C15 -18 11 -10 5 -6" />
                                <path d="M20 -29C19 -17 14 -9 8 -5" />
                                <path d="M24 -30C22 -18 17 -10 11 -6" />
                                <ellipse
                                    cx="0"
                                    cy="-36"
                                    rx="22"
                                    ry="3"
                                    strokeOpacity="0.32"
                                />
                            </g>

                            {/* Layer 3: New leaf sprouting gently from rim */}
                            <g className="ill-calligraphy">
                                <path
                                    d="M17 -35C22 -44 29 -51 37 -54C37.5 -53.4 37.5 -52.5 36.8 -52C30 -48 23.6 -41.5 18.6 -34.2Z"
                                    fill="var(--foreground)"
                                    fillOpacity="0.88"
                                />
                                <path
                                    d="M27 -46C25 -52 29 -58 35 -58C36 -52 33 -47 27 -46Z"
                                    fill="var(--accent-soft)"
                                    stroke="var(--foreground)"
                                    strokeOpacity="0.9"
                                    strokeWidth="1.3"
                                />
                            </g>
                        </g>
                    </g>

                    {/* Fallen plum petal resting quietly beside the bowl */}
                    <g transform="translate(46 84) rotate(-14)">
                        <path
                            d="M0 0C3 -5 9 -5 11 0C9 4 3 4 0 0Z"
                            fill="var(--accent-soft)"
                            stroke="var(--foreground)"
                            strokeOpacity="0.85"
                            strokeWidth="1.15"
                        />
                        <circle cx="2" cy="0" r="1.4" fill="var(--accent)" />
                    </g>
                </svg>
            );

        case "no-results":
            return (
                <svg {...commonProps}>
                    <EtchingRegistration />

                    {/* Layer 1: Risograph dashed field wash */}
                    <g className="ill-overprint" transform="translate(2.2 1.6)">
                        <rect
                            x="44"
                            y="26"
                            width="74"
                            height="58"
                            rx="6"
                            fill="var(--accent-soft)"
                            fillOpacity="0.52"
                        />
                    </g>

                    {/* Archival specimen card */}
                    <rect
                        x="42"
                        y="24"
                        width="74"
                        height="58"
                        rx="6"
                        fill="var(--surface-solid)"
                        fillOpacity="0.72"
                        stroke="var(--muted)"
                        strokeOpacity="0.65"
                        strokeWidth="1.2"
                        strokeDasharray="3.5 3"
                    />

                    {/* Layer 2: Copperplate card corner hatching */}
                    <g
                        className="ill-hatching"
                        stroke="var(--muted)"
                        strokeOpacity="0.45"
                        strokeWidth="0.58"
                        strokeLinecap="round"
                    >
                        <path d="M47 33L54 28M47 38L59 28M47 43L64 28" />
                    </g>

                    {/* Counter-moving peeking critter & question-curl fern beneath the lens */}
                    <g transform="translate(94 56)">
                        <g className="ill-critter-group">
                            {/* Curled question-mark fern fiddlehead */}
                            <path
                                d="M-8 14C-8 4 -2 -4 5 -4C10 -4 12 0 9 4C6 7 2 5 3 1"
                                stroke="var(--foreground)"
                                strokeOpacity="0.78"
                                strokeWidth="1.3"
                                strokeLinecap="round"
                            />
                            {/* Tiny seven-spot ladybug */}
                            <ellipse
                                cx="-3"
                                cy="-3"
                                rx="4.5"
                                ry="3.5"
                                fill="var(--accent)"
                                fillOpacity="0.88"
                                stroke="var(--foreground)"
                                strokeWidth="1.05"
                            />
                            <circle
                                cx="-6.8"
                                cy="-3"
                                r="1.5"
                                fill="var(--foreground)"
                            />
                            <circle
                                cx="-3.5"
                                cy="-4.2"
                                r="0.65"
                                fill="var(--surface-solid)"
                            />
                            <circle
                                cx="-1.8"
                                cy="-2.2"
                                r="0.65"
                                fill="var(--surface-solid)"
                            />
                        </g>
                    </g>

                    {/* Parallax botanical loupe */}
                    <g transform="translate(94 56)">
                        <g className="ill-loupe-group">
                            <circle
                                cx="0"
                                cy="0"
                                r="19"
                                fill="var(--surface-solid)"
                                fillOpacity="0.62"
                                stroke="var(--foreground)"
                                strokeOpacity="0.92"
                                strokeWidth="1.65"
                            />
                            <circle
                                cx="0"
                                cy="0"
                                r="15.5"
                                stroke="var(--muted)"
                                strokeOpacity="0.48"
                                strokeWidth="0.75"
                            />
                            {/* Crosshair */}
                            <line
                                x1="0"
                                y1="-13"
                                x2="0"
                                y2="13"
                                stroke="var(--border)"
                                strokeWidth="0.9"
                            />
                            <line
                                x1="-13"
                                y1="0"
                                x2="13"
                                y2="0"
                                stroke="var(--border)"
                                strokeWidth="0.9"
                            />
                            <circle
                                cx="0"
                                cy="0"
                                r="2.1"
                                fill="var(--accent)"
                            />
                            {/* Brass handle */}
                            <path
                                d="M13.5 13.5L26 26"
                                stroke="var(--foreground)"
                                strokeOpacity="0.92"
                                strokeWidth="2.8"
                                strokeLinecap="round"
                            />
                            <path
                                d="M16.5 16.5L25 25"
                                stroke="var(--accent)"
                                strokeOpacity="0.75"
                                strokeWidth="1.1"
                                strokeLinecap="round"
                            />
                        </g>
                    </g>

                    {/* Layer 3: Delicate botanical sprig on lower left */}
                    <g className="ill-calligraphy">
                        <path
                            d="M40 90C48 77 54 66 58 53C58.8 53.3 59.3 54 59 55C55.2 68 49.4 79 41.5 91.2Z"
                            fill="var(--foreground)"
                            fillOpacity="0.86"
                        />
                        <path
                            d="M52 70C46 67 44 62 46 58C51 60 54 65 52 70Z"
                            fill="var(--accent-soft)"
                            stroke="var(--foreground)"
                            strokeOpacity="0.88"
                            strokeWidth="1.25"
                        />
                    </g>
                </svg>
            );

        case "not-found":
            return (
                <svg {...commonProps}>
                    <EtchingRegistration />

                    {/* Layer 1: Risograph overprint for compass & distant hill */}
                    <g className="ill-overprint" transform="translate(2.4 1.6)">
                        <circle
                            cx="78"
                            cy="58"
                            r="24"
                            fill="var(--accent-soft)"
                            fillOpacity="0.65"
                        />
                        <circle
                            cx="127"
                            cy="40"
                            r="8"
                            fill="var(--accent)"
                            fillOpacity="0.18"
                        />
                    </g>

                    {/* Winding dotted trail */}
                    <path
                        d="M34 90C52 88 58 79 72 78C92 77 104 86 138 78"
                        stroke="var(--muted)"
                        strokeOpacity="0.72"
                        strokeWidth="1.15"
                        strokeDasharray="3.2 3.2"
                        strokeLinecap="round"
                    />

                    {/* Brass compass casing at (78, 58) */}
                    <circle
                        cx="78"
                        cy="58"
                        r="24"
                        fill="var(--surface-solid)"
                        fillOpacity="0.9"
                        stroke="var(--foreground)"
                        strokeOpacity="0.9"
                        strokeWidth="1.6"
                    />
                    <circle
                        cx="78"
                        cy="58"
                        r="19.5"
                        stroke="var(--muted)"
                        strokeOpacity="0.55"
                        strokeWidth="0.85"
                    />

                    {/* Layer 2: Copperplate compass rose ticks */}
                    <g
                        className="ill-hatching"
                        stroke="var(--muted)"
                        strokeOpacity="0.6"
                        strokeWidth="0.65"
                        strokeLinecap="round"
                    >
                        <line x1="78" y1="35" x2="78" y2="39" />
                        <line x1="78" y1="77" x2="78" y2="81" />
                        <line x1="55" y1="58" x2="59" y2="58" />
                        <line x1="97" y1="58" x2="101" y2="58" />
                        <path d="M62 42L65 45M91 71L94 74M94 42L91 45M65 71L62 74" />
                    </g>

                    {/* Real-time homing compass needle centered at (78, 58) */}
                    <g transform="translate(78 58)">
                        <g className="ill-compass-needle">
                            {/* North pointer (accent) */}
                            <path
                                d="M0 -16L3.8 0H-3.8Z"
                                fill="var(--accent)"
                                stroke="var(--foreground)"
                                strokeOpacity="0.88"
                                strokeWidth="0.95"
                                strokeLinejoin="round"
                            />
                            {/* South counterweight */}
                            <path
                                d="M0 15L3.4 0H-3.4Z"
                                fill="var(--surface-solid)"
                                stroke="var(--foreground)"
                                strokeOpacity="0.85"
                                strokeWidth="0.95"
                                strokeLinejoin="round"
                            />
                            <circle
                                cx="0"
                                cy="0"
                                r="2.6"
                                fill="var(--foreground)"
                            />
                            <circle
                                cx="0"
                                cy="0"
                                r="1.1"
                                fill="var(--surface-solid)"
                            />
                        </g>
                    </g>

                    {/* Layer 3: Dandelion stem & drifting pappus seeds */}
                    <g className="ill-calligraphy">
                        <path
                            d="M114 91C118 75 122 59 127 42C127.8 42.3 128.3 43 128 44C123.5 60 119.5 76 115.6 91.6Z"
                            fill="var(--foreground)"
                            fillOpacity="0.88"
                        />
                        <circle
                            cx="127"
                            cy="41"
                            r="7.5"
                            stroke="var(--foreground)"
                            strokeOpacity="0.55"
                            strokeWidth="0.8"
                            strokeDasharray="1.8 2"
                        />
                        <circle
                            cx="127"
                            cy="41"
                            r="2.2"
                            fill="var(--foreground)"
                        />
                        {/* Drifting seeds */}
                        <g
                            stroke="var(--foreground)"
                            strokeOpacity="0.82"
                            strokeWidth="0.85"
                            strokeLinecap="round"
                        >
                            <path d="M136 28L140 24M138 24L142 26" />
                            <circle
                                cx="135.5"
                                cy="28.5"
                                r="1"
                                fill="var(--accent)"
                            />
                            <path d="M142 40L146 37M144 36L147 39" />
                            <circle
                                cx="141.5"
                                cy="40.5"
                                r="0.9"
                                fill="var(--foreground)"
                            />
                        </g>
                    </g>
                </svg>
            );

        case "auth-required":
            return (
                <svg {...commonProps}>
                    <EtchingRegistration />

                    {/* Layer 1: Risograph overprint behind arched gate */}
                    <g className="ill-overprint" transform="translate(2.4 1.6)">
                        <path
                            d="M64 88V50C64 35.6 75.6 24 90 24C104.4 24 116 35.6 116 50V88H64Z"
                            fill="var(--accent-soft)"
                            fillOpacity="0.68"
                        />
                    </g>

                    {/* Study arch plaque */}
                    <path
                        d="M62 87V49C62 34.6 73.6 23 88 23C102.4 23 114 34.6 114 49V87H62Z"
                        fill="var(--surface-solid)"
                        fillOpacity="0.88"
                        stroke="var(--foreground)"
                        strokeOpacity="0.88"
                        strokeWidth="1.55"
                        strokeLinejoin="round"
                    />

                    {/* Layer 2: Copperplate inner arch hatching */}
                    <g
                        className="ill-hatching"
                        stroke="var(--muted)"
                        strokeOpacity="0.48"
                        strokeWidth="0.6"
                        strokeLinecap="round"
                    >
                        <path d="M67 87V50C67 38.4 76.4 29 88 29C99.6 29 109 38.4 109 50V87" />
                        <line x1="67" y1="74" x2="73" y2="74" />
                        <line x1="67" y1="78" x2="72" y2="78" />
                        <line x1="67" y1="82" x2="73" y2="82" />
                    </g>

                    {/* Brass keyhole */}
                    <circle
                        cx="88"
                        cy="46"
                        r="4.2"
                        fill="var(--accent-soft)"
                        stroke="var(--foreground)"
                        strokeOpacity="0.9"
                        strokeWidth="1.3"
                    />
                    <path
                        d="M86.2 49.5L85 57.5H91L89.8 49.5"
                        fill="var(--accent-soft)"
                        stroke="var(--foreground)"
                        strokeOpacity="0.9"
                        strokeWidth="1.25"
                        strokeLinejoin="round"
                    />

                    {/* Hanging brass key pendulum anchored at (124, 34) */}
                    <g transform="translate(124 34)">
                        <circle
                            cx="0"
                            cy="0"
                            r="1.8"
                            fill="var(--foreground)"
                        />
                        <g className="ill-key-pendulum">
                            <line
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="14"
                                stroke="var(--muted)"
                                strokeWidth="1"
                            />
                            <circle
                                cx="0"
                                cy="18"
                                r="4.2"
                                fill="var(--accent-soft)"
                                stroke="var(--foreground)"
                                strokeWidth="1.3"
                            />
                            <circle
                                cx="0"
                                cy="18"
                                r="1.4"
                                fill="var(--accent)"
                            />
                            <path
                                d="M0 22.2V35M0 31H4M0 34.5H3"
                                stroke="var(--foreground)"
                                strokeWidth="1.35"
                                strokeLinecap="round"
                            />
                        </g>
                    </g>

                    {/* Layer 3: Ivy vine framing left arch */}
                    <g className="ill-calligraphy">
                        <path
                            d="M48 90C54 74 58 58 63 40C63.8 40.2 64.3 41 64 42C59.4 59.5 55.4 75 49.6 90.8Z"
                            fill="var(--foreground)"
                            fillOpacity="0.88"
                        />
                        <path
                            d="M56 72C49 69 47 63 50 59C55 61 57 66 56 72Z"
                            fill="var(--accent-soft)"
                            stroke="var(--foreground)"
                            strokeWidth="1.25"
                        />
                        <path
                            d="M60 55C54 51 53 45 56 42C60 44 62 49 60 55Z"
                            fill="var(--surface-solid)"
                            stroke="var(--foreground)"
                            strokeWidth="1.2"
                        />
                        <path
                            d="M63 41C68 37 74 37 76 41C72 44 66 44 63 41Z"
                            fill="var(--accent-soft)"
                            stroke="var(--foreground)"
                            strokeWidth="1.2"
                        />
                    </g>
                </svg>
            );

        case "load-error":
            return (
                <svg {...commonProps}>
                    <EtchingRegistration />

                    {/* Layer 1: Risograph overprint behind kintsugi fracture & bud */}
                    <g className="ill-overprint" transform="translate(2.2 1.6)">
                        <circle
                            cx="88"
                            cy="56"
                            r="22"
                            fill="var(--accent-soft)"
                            fillOpacity="0.65"
                        />
                        <circle
                            cx="114"
                            cy="40"
                            r="8"
                            fill="var(--accent)"
                            fillOpacity="0.2"
                        />
                    </g>

                    {/* Broken & mended botanical frame */}
                    <rect
                        x="48"
                        y="26"
                        width="76"
                        height="58"
                        rx="6"
                        fill="var(--surface-solid)"
                        fillOpacity="0.84"
                        stroke="var(--foreground)"
                        strokeOpacity="0.86"
                        strokeWidth="1.45"
                    />

                    {/* Layer 2: Copperplate fracture hatching */}
                    <g
                        className="ill-hatching"
                        stroke="var(--muted)"
                        strokeOpacity="0.52"
                        strokeWidth="0.6"
                        strokeLinecap="round"
                    >
                        <line x1="53" y1="36" x2="72" y2="36" />
                        <line x1="53" y1="41" x2="66" y2="41" />
                        <path d="M54 78L62 71M59 79L68 71" />
                    </g>

                    {/* Kintsugi gold-mended fracture line */}
                    <path
                        d="M78 26L74 42L84 52L77 67L85 84"
                        stroke="var(--accent)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <circle cx="84" cy="52" r="2.6" fill="var(--accent)" />

                    {/* Layer 3: Calligraphic branch mending across fracture with resilient sprout */}
                    <g className="ill-calligraphy">
                        <path
                            d="M44 91C58 78 70 66 84 52C95 45 107 40 120 38C120.5 38.8 120.2 39.6 119.3 39.8C107 42 96 47 85 54C71.5 67.5 59.5 79.5 45.5 92.2Z"
                            fill="var(--foreground)"
                            fillOpacity="0.9"
                        />
                        <g transform="translate(106 43)">
                            <g className="ill-kintsugi-sprout">
                                <path
                                    d="M0 0C3 -8 10 -12 16 -10C15 -3 9 1 0 0Z"
                                    fill="var(--accent-soft)"
                                    stroke="var(--foreground)"
                                    strokeOpacity="0.9"
                                    strokeWidth="1.3"
                                    strokeLinejoin="round"
                                />
                                <path
                                    d="M1.5 -0.8C5 -4.5 9 -6.5 13 -7"
                                    stroke="var(--muted)"
                                    strokeWidth="0.7"
                                    strokeLinecap="round"
                                />
                                <circle
                                    cx="15.5"
                                    cy="-10"
                                    r="1.7"
                                    fill="var(--accent)"
                                />
                            </g>
                        </g>
                    </g>
                </svg>
            );
    }
}
