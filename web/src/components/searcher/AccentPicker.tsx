import { useState } from "react";
import { Link } from "react-router-dom";
import { ImageIcon } from "lucide-react";
import {
    ACCENT_PREFERENCES,
    type AccentPreference,
    ACCENTS,
} from "@shared/contracts.ts";
import { routes } from "../../app/routes.ts";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group.tsx";
import {
    Popover,
    PopoverContent,
    PopoverTitle,
    PopoverTrigger,
} from "../ui/popover.tsx";

function accentLabel(id: AccentPreference): string {
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

/**
 * Top-bar accent entry: a palette chip (accent, its pressed shade, foreground
 * and muted ink) that opens the swatches. The chip scopes the chosen palette
 * with `data-accent`, so its dots keep that colour when a high contrast theme
 * maps `--accent` to its highlight.
 */
export function AccentPicker(
    { value, onValueChange }: {
        value: AccentPreference;
        onValueChange: (next: AccentPreference) => void;
    },
) {
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                className="accent-picker-trigger"
                aria-label={`强调色：${accentLabel(value)}`}
                title={`强调色：${accentLabel(value)}`}
            >
                <span
                    className="accent-picker-chip"
                    data-accent={value}
                    aria-hidden="true"
                >
                    <span
                        className="accent-picker-chip-dot"
                        data-tone="accent"
                    />
                    <span
                        className="accent-picker-chip-dot"
                        data-tone="foreground"
                    />
                    <span
                        className="accent-picker-chip-dot"
                        data-tone="accent-active"
                    />
                    <span
                        className="accent-picker-chip-dot"
                        data-tone="muted"
                    />
                </span>
            </PopoverTrigger>
            <PopoverContent
                className="accent-picker"
                side="bottom"
                align="end"
            >
                <PopoverTitle className="accent-picker-title">
                    强调色
                </PopoverTitle>
                <AccentSwatches value={value} onValueChange={onValueChange} />
                <div className="accent-picker-footer">
                    <span>{accentLabel(value)}</span>
                    <Link
                        to={routes.settings("appearance")}
                        viewTransition
                        onClick={() => setOpen(false)}
                    >
                        更多外观设置
                    </Link>
                </div>
            </PopoverContent>
        </Popover>
    );
}
