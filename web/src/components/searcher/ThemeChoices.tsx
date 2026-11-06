import { THEME_IDS, type ThemeId } from "@shared/contracts.ts";
import { THEME_LABELS } from "../../design-system/theme.ts";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group.tsx";

/**
 * The five theme choices as a radio grid: the three base themes on the first
 * row, the two high contrast themes below them. A segmented control only fits
 * two to four options; this keeps every label whole and every option a full
 * radio target at any width.
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
            {THEME_IDS.map((id) => (
                <RadioGroupItem key={id} value={id}>
                    {THEME_LABELS[id]}
                </RadioGroupItem>
            ))}
        </RadioGroup>
    );
}
