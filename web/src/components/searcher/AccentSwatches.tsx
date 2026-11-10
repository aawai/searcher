import { ImageIcon } from "lucide-react";
import {
    ACCENT_PREFERENCES,
    type AccentPreference,
    ACCENTS,
} from "@shared/contracts.ts";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group.tsx";

export function accentLabel(id: AccentPreference): string {
    if (id === "wallpaper") return "跟随壁纸";
    return ACCENTS.find((accent) => accent.id === id)?.label ?? id;
}

/**
 * The accent choice: "跟随壁纸" first, then the nine presets, in two sets of
 * five so a narrow host wraps whole rows instead of leaving one dot alone.
 */
export function AccentSwatches(
    { value, onValueChange }: {
        value: AccentPreference;
        onValueChange: (next: AccentPreference) => void;
    },
) {
    return (
        <RadioGroup
            variant="swatch"
            value={value}
            onValueChange={(next) => {
                const id = ACCENT_PREFERENCES.find((item) => item === next);
                if (id) onValueChange(id);
            }}
            aria-label="强调色"
        >
            {[
                ACCENT_PREFERENCES.slice(0, 5),
                ACCENT_PREFERENCES.slice(5),
            ].map((group) => (
                <span className="accent-swatch-set" key={group[0]}>
                    {group.map((id) => (
                        <RadioGroupItem
                            key={id}
                            value={id}
                            aria-label={accentLabel(id)}
                            title={accentLabel(id)}
                        >
                            <span
                                className="accent-swatch-color"
                                data-accent={id}
                                aria-hidden="true"
                            >
                                {id === "wallpaper" && <ImageIcon />}
                            </span>
                        </RadioGroupItem>
                    ))}
                </span>
            ))}
        </RadioGroup>
    );
}
