import { THEME_IDS, type ThemeId } from "@shared/contracts.ts";
import { THEME_LABELS } from "../../design-system/theme.ts";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group.tsx";

/** Visible tile captions; each is contained in the full accessible name (2.5.3). */
const THEME_CAPTIONS: Readonly<Record<ThemeId, string>> = {
    system: "系统",
    light: "浅色",
    dark: "深色",
    "high-contrast-light": "高对比浅",
    "high-contrast-dark": "高对比深",
};

type Scene = Exclude<ThemeId, "system">;

/** A miniature window on the theme's canvas, painted with its preview tokens. */
function ThemeScene({ scene }: { scene: Scene }) {
    return (
        <span className="theme-choice-scene" data-scene={scene}>
            <span className="theme-choice-window">
                <span className="theme-choice-line" />
                <span className="theme-choice-line" />
            </span>
        </span>
    );
}

/**
 * The five theme choices as one radio group of preview tiles: each tile is a
 * miniature of the theme itself (跟随系统 splits light and dark diagonally)
 * with a short caption. Tiles wrap whole on narrow hosts (1.4.10).
 */
export function ThemeChoices(
    { value, onValueChange, label = "主题" }: {
        value: ThemeId;
        onValueChange: (next: ThemeId) => void;
        label?: string;
    },
) {
    return (
        <RadioGroup
            className="theme-choices"
            value={value}
            onValueChange={(next) => {
                const id = THEME_IDS.find((item) => item === next);
                if (id) onValueChange(id);
            }}
            aria-label={label}
        >
            {THEME_IDS.map((id) => (
                <RadioGroupItem
                    key={id}
                    value={id}
                    className="theme-choice"
                    aria-label={THEME_LABELS[id]}
                    title={THEME_LABELS[id]}
                >
                    <span className="theme-choice-preview" aria-hidden="true">
                        {id === "system"
                            ? (
                                <>
                                    <ThemeScene scene="light" />
                                    <ThemeScene scene="dark" />
                                </>
                            )
                            : <ThemeScene scene={id} />}
                    </span>
                    <span className="theme-choice-caption" aria-hidden="true">
                        {THEME_CAPTIONS[id]}
                    </span>
                </RadioGroupItem>
            ))}
        </RadioGroup>
    );
}
