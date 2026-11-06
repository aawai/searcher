import { THEME_IDS, type ThemeId } from "@shared/contracts.ts";
import {
    isHighContrastTheme,
    THEME_LABELS,
} from "../../design-system/theme.ts";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group.tsx";

const BASE_THEMES = THEME_IDS.filter((id) => !isHighContrastTheme(id));
const HIGH_CONTRAST_THEMES = THEME_IDS.filter(isHighContrastTheme);

/**
 * The five theme choices as one radio group in two rows: the three base
 * themes, then the two high contrast themes. A segmented control only fits
 * two to four options; here every label stays whole and every option is a
 * full radio target, and a row wraps instead of scrolling on narrow hosts.
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
            onValueChange={(next) => onValueChange(next as ThemeId)}
            aria-label={label}
        >
            {[BASE_THEMES, HIGH_CONTRAST_THEMES].map((themes) => (
                <div key={themes[0]} className="theme-choices-row">
                    {themes.map((id) => (
                        <RadioGroupItem key={id} value={id}>
                            {THEME_LABELS[id]}
                        </RadioGroupItem>
                    ))}
                </div>
            ))}
        </RadioGroup>
    );
}
