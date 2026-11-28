import {
    type BotanicalSpecies,
    normalizeBotanicalSpecies,
} from "@shared/wallpaper.ts";
import {
    BOTANICAL_SCENE_CHOICES,
    BOTANICAL_SPECIES_NOTES,
} from "../wallpaper/wallpaper-choices.ts";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group.tsx";

export interface BotanicalSceneChoicesProps {
    value: BotanicalSpecies | null;
    onValueChange: (next: BotanicalSpecies) => void;
    onPreviewSpecies?: (species: BotanicalSpecies | null) => void;
    className?: string;
    label?: string;
    testId?: string;
    itemTestIdPrefix?: string;
}

/**
 * Miniature botanical specimen silhouette rendered as crisp inline SVG.
 * Uses only CSS custom properties (`--botanical-ink`, `--botanical-pigment`)
 * so it stays zero-cost on the initial bundle and adapts to light/dark/high-contrast.
 */
function BotanicalSpeciesGlyph({ species }: { species: BotanicalSpecies }) {
    switch (species) {
        case "auto":
            return (
                <svg
                    viewBox="0 0 48 36"
                    className="botanical-choice-glyph"
                    aria-hidden="true"
                    focusable="false"
                >
                    <circle
                        cx="14"
                        cy="12"
                        r="5.2"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.22"
                    />
                    <path
                        d="M14 5.2 A6.8 6.8 0 1 1 7.6 14.3"
                        fill="none"
                        stroke="var(--botanical-pigment)"
                        strokeWidth="1.25"
                        strokeLinecap="round"
                    />
                    <circle
                        cx="14"
                        cy="12"
                        r="1.7"
                        fill="var(--botanical-pigment)"
                    />
                    <path
                        d="M44 35 Q33 27 25 16"
                        fill="none"
                        stroke="var(--botanical-ink)"
                        strokeWidth="1.35"
                        strokeLinecap="round"
                    />
                    <path
                        d="M27 19 C22 15 22 10 27 9 C30 13 30 16 27 19 Z"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.62"
                    />
                    <path
                        d="M32 25 C34 19 39 18 41 21 C38 25 35 26 32 25 Z"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.45"
                    />
                </svg>
            );
        case "ginkgo":
            return (
                <svg
                    viewBox="0 0 48 36"
                    className="botanical-choice-glyph"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path
                        d="M44 35 Q35 25 25 14 M34 25 Q26 24 20 22"
                        fill="none"
                        stroke="var(--botanical-ink)"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                    />
                    <path
                        d="M25 14 L15 9 C14 5 18 3 22 5 L23.5 7.5 L25.5 4.8 C29.5 4 32 7 30 11 Z"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.68"
                    />
                    <path
                        d="M25 14 L19 7 M25 14 L23 6.5 M25 14 L27.5 7.5"
                        fill="none"
                        stroke="var(--botanical-ink)"
                        strokeWidth="0.65"
                        strokeOpacity="0.65"
                        strokeLinecap="round"
                    />
                    <path
                        d="M20 22 L11 21 C9 18 11 14 15 15 L17 17.5 L18 14.8 C21 15 23 18 21.5 21 Z"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.52"
                    />
                    <path
                        d="M20 22 L13.5 18 M20 22 L16.5 17"
                        fill="none"
                        stroke="var(--botanical-ink)"
                        strokeWidth="0.6"
                        strokeOpacity="0.55"
                        strokeLinecap="round"
                    />
                </svg>
            );
        case "maple":
            return (
                <svg
                    viewBox="0 0 48 36"
                    className="botanical-choice-glyph"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path
                        d="M46 4 Q35 11 23 18 M34 11 Q31 19 29 24"
                        fill="none"
                        stroke="var(--botanical-ink)"
                        strokeWidth="1.35"
                        strokeLinecap="round"
                    />
                    <path
                        d="M23 18 L19 10 L17 15 L9 12 L14.5 18.5 L8.5 24 L16 22.5 L18 29 L21.5 22.5 L27 25 L23 18 Z"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.72"
                    />
                    <path
                        d="M23 18 L18.5 13.5 M23 18 L13 15 M23 18 L12.5 22 M23 18 L18.5 25"
                        fill="none"
                        stroke="var(--botanical-ink)"
                        strokeWidth="0.6"
                        strokeOpacity="0.55"
                        strokeLinecap="round"
                    />
                    <path
                        d="M29 24 L27 20 L31 22 L35 20.5 L32 24.5 L34.5 28.5 L30.5 26.5 L28 30 L29 24 Z"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.46"
                    />
                </svg>
            );
        case "eucalyptus":
            return (
                <svg
                    viewBox="0 0 48 36"
                    className="botanical-choice-glyph"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path
                        d="M40 35 Q33 21 18 7"
                        fill="none"
                        stroke="var(--botanical-ink)"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                    />
                    <ellipse
                        cx="29"
                        cy="25"
                        rx="5.4"
                        ry="4.3"
                        transform="rotate(-18 29 25)"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.55"
                    />
                    <ellipse
                        cx="37"
                        cy="22"
                        rx="4.8"
                        ry="3.8"
                        transform="rotate(24 37 22)"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.44"
                    />
                    <ellipse
                        cx="22"
                        cy="18"
                        rx="4.9"
                        ry="3.8"
                        transform="rotate(-24 22 18)"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.66"
                    />
                    <ellipse
                        cx="31"
                        cy="14"
                        rx="4.4"
                        ry="3.4"
                        transform="rotate(20 31 14)"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.50"
                    />
                    <ellipse
                        cx="17"
                        cy="10"
                        rx="3.7"
                        ry="2.9"
                        transform="rotate(-28 17 10)"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.58"
                    />
                    <circle
                        cx="19"
                        cy="22.8"
                        r="1.1"
                        fill="var(--surface)"
                        stroke="var(--botanical-pigment)"
                        strokeWidth="0.7"
                    />
                </svg>
            );
        case "plum":
            return (
                <svg
                    viewBox="0 0 48 36"
                    className="botanical-choice-glyph"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path
                        d="M45 35 L34 23 L27 21 L12 13 M34 23 L33 10"
                        fill="none"
                        stroke="var(--botanical-ink)"
                        strokeWidth="1.45"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <g transform="translate(23 17)">
                        <circle
                            cx="0"
                            cy="-4.2"
                            r="3.1"
                            fill="var(--botanical-pigment)"
                            fillOpacity="0.74"
                        />
                        <circle
                            cx="4"
                            cy="-1.3"
                            r="3.1"
                            fill="var(--botanical-pigment)"
                            fillOpacity="0.66"
                        />
                        <circle
                            cx="2.5"
                            cy="3.4"
                            r="3.1"
                            fill="var(--botanical-pigment)"
                            fillOpacity="0.72"
                        />
                        <circle
                            cx="-2.5"
                            cy="3.4"
                            r="3.1"
                            fill="var(--botanical-pigment)"
                            fillOpacity="0.64"
                        />
                        <circle
                            cx="-4"
                            cy="-1.3"
                            r="3.1"
                            fill="var(--botanical-pigment)"
                            fillOpacity="0.76"
                        />
                        <circle
                            cx="0"
                            cy="0"
                            r="1.4"
                            fill="var(--botanical-ink)"
                        />
                    </g>
                    <circle
                        cx="12.5"
                        cy="12.5"
                        r="2.1"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.78"
                    />
                    <circle
                        cx="33"
                        cy="10"
                        r="2.4"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.66"
                    />
                </svg>
            );
        case "fern":
            return (
                <svg
                    viewBox="0 0 48 36"
                    className="botanical-choice-glyph"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path
                        d="M42 35 Q35 18 11 10"
                        fill="none"
                        stroke="var(--botanical-ink)"
                        strokeWidth="1.25"
                        strokeLinecap="round"
                    />
                    <path
                        d="M36 25 Q27 23 20 26 Q28 27 36 25 Z"
                        fill="var(--botanical-ink)"
                        fillOpacity="0.34"
                    />
                    <path
                        d="M32 20 Q23 16 15 19 Q23 21 32 20 Z"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.56"
                    />
                    <path
                        d="M27 16 Q21 10 13 12 Q20 15 27 16 Z"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.66"
                    />
                    <path
                        d="M34 21 Q38 14 41 10 Q36 14 34 21 Z"
                        fill="var(--botanical-ink)"
                        fillOpacity="0.30"
                    />
                    <path
                        d="M28 16 Q32 9 35 6 Q30 10 28 16 Z"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.50"
                    />
                    <path
                        d="M19 12 Q12 9 7 11 Q13 13 19 12 Z"
                        fill="var(--botanical-pigment)"
                        fillOpacity="0.74"
                    />
                </svg>
            );
    }
}

/**
 * Six botanical illustration choices as a single row of miniature specimen
 * preview tiles, sharing the same visual grammar as `ThemeChoices` and the
 * quick wallpaper strip.
 */
export function BotanicalSceneChoices({
    value,
    onValueChange,
    onPreviewSpecies,
    className,
    label = "插画枝型",
    testId,
    itemTestIdPrefix,
}: BotanicalSceneChoicesProps) {
    return (
        <RadioGroup
            className={className
                ? `botanical-choices ${className}`
                : "botanical-choices"}
            value={value ?? ""}
            onValueChange={(next) => {
                const species = normalizeBotanicalSpecies(next);
                if (!species) return;
                onValueChange(species);
            }}
            aria-label={label}
            data-testid={testId}
        >
            {BOTANICAL_SCENE_CHOICES.map(([id, caption]) => (
                <RadioGroupItem
                    key={id}
                    value={id}
                    className="botanical-choice"
                    data-species={id}
                    aria-label={`${caption}：${BOTANICAL_SPECIES_NOTES[id]}`}
                    title={BOTANICAL_SPECIES_NOTES[id]}
                    data-testid={itemTestIdPrefix
                        ? `${itemTestIdPrefix}-${id}`
                        : undefined}
                    onMouseEnter={() => onPreviewSpecies?.(id)}
                    onMouseLeave={() => onPreviewSpecies?.(null)}
                    onFocus={() => onPreviewSpecies?.(id)}
                    onBlur={() => onPreviewSpecies?.(null)}
                >
                    <span
                        className="botanical-choice-preview"
                        aria-hidden="true"
                    >
                        <BotanicalSpeciesGlyph species={id} />
                    </span>
                    <span
                        className="botanical-choice-caption"
                        aria-hidden="true"
                    >
                        {caption}
                    </span>
                </RadioGroupItem>
            ))}
        </RadioGroup>
    );
}
