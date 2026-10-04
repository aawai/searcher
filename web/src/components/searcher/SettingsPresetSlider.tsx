import { useCallback, useMemo, useState } from "react";
import { Slider } from "../ui/slider.tsx";
import { cn } from "../../lib/utils.ts";

export interface PresetSliderStage<T extends string = string> {
    readonly id: T;
    readonly label: string;
    readonly detail?: string;
}

export interface SettingsPresetSliderProps<T extends string = string> {
    stages: readonly PresetSliderStage<T>[];
    value: T;
    onChange?: (id: T) => void;
    onCommit?: (id: T) => void;
    disabled?: boolean;
    "aria-label"?: string;
    "aria-labelledby"?: string;
    className?: string;
    testId?: string;
}

export function SettingsPresetSlider<T extends string = string>({
    stages,
    value,
    onChange,
    onCommit,
    disabled = false,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledby,
    className,
    testId,
}: SettingsPresetSliderProps<T>) {
    const [draftIndex, setDraftIndex] = useState<number | null>(null);

    const currentIndex = useMemo(() => {
        const idx = stages.findIndex((stage) => stage.id === value);
        return idx >= 0 ? idx : 0;
    }, [stages, value]);

    const activeIndex = draftIndex ?? currentIndex;

    const handleValueChange = useCallback(
        (next: number | readonly number[]) => {
            const nextIdx = typeof next === "number" ? next : next[0];
            if (typeof nextIdx !== "number" || isNaN(nextIdx)) return;
            const clamped = Math.max(
                0,
                Math.min(stages.length - 1, Math.round(nextIdx)),
            );
            setDraftIndex(clamped);
            const stage = stages[clamped];
            if (stage) {
                onChange?.(stage.id);
            }
        },
        [stages, onChange],
    );

    const handleValueCommitted = useCallback(
        (next: number | readonly number[]) => {
            setDraftIndex(null);
            const nextIdx = typeof next === "number" ? next : next[0];
            if (typeof nextIdx !== "number" || isNaN(nextIdx)) return;
            const clamped = Math.max(
                0,
                Math.min(stages.length - 1, Math.round(nextIdx)),
            );
            const stage = stages[clamped];
            if (stage) {
                if (onCommit) {
                    onCommit(stage.id);
                } else if (onChange) {
                    onChange(stage.id);
                }
            }
        },
        [stages, onChange, onCommit],
    );

    const handleMarkClick = useCallback(
        (stageId: T) => {
            if (disabled) return;
            setDraftIndex(null);
            onChange?.(stageId);
            if (onCommit) {
                onCommit(stageId);
            }
        },
        [disabled, onChange, onCommit],
    );

    const getAriaValueText = useCallback(
        (_fmt: string, val: number) => {
            const stage = stages[val];
            if (!stage) return "";
            return stage.detail
                ? `${stage.label} · ${stage.detail}`
                : stage.label;
        },
        [stages],
    );

    return (
        <div
            className={cn("settings-preset-slider", className)}
            data-disabled={disabled || undefined}
            data-testid={testId}
        >
            <Slider
                min={0}
                max={Math.max(0, stages.length - 1)}
                step={1}
                value={activeIndex}
                disabled={disabled}
                aria-label={ariaLabel}
                aria-labelledby={ariaLabelledby}
                getAriaValueText={getAriaValueText}
                onValueChange={handleValueChange}
                onValueCommitted={handleValueCommitted}
                className="settings-preset-slider__slider w-full"
            />
            <div className="settings-preset-slider__marks" aria-hidden="true">
                {stages.map((stage, idx) => (
                    <button
                        key={stage.id}
                        type="button"
                        tabIndex={-1}
                        disabled={disabled}
                        className={cn(
                            "settings-preset-slider__mark",
                            idx === activeIndex &&
                                "settings-preset-slider__mark--active",
                        )}
                        onClick={() => handleMarkClick(stage.id)}
                    >
                        <span className="settings-preset-slider__mark-tick" />
                        <span className="settings-preset-slider__mark-label">
                            {stage.label}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
