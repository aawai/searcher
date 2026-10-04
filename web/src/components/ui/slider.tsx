import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "../../lib/utils.ts";

export interface SliderProps extends SliderPrimitive.Root.Props {
    getAriaLabel?: (index: number) => string;
    getAriaValueText?: (
        formattedValue: string,
        value: number,
        index: number,
    ) => string;
}

function Slider(
    {
        className,
        defaultValue,
        value,
        min = 0,
        max = 100,
        getAriaLabel,
        getAriaValueText,
        ...props
    }: SliderProps,
) {
    const thumbCount = Array.isArray(value)
        ? value.length
        : value !== undefined
        ? 1
        : Array.isArray(defaultValue)
        ? defaultValue.length
        : 1;

    const ariaLabel = props["aria-label"];
    const ariaLabelledby = props["aria-labelledby"];

    return (
        <SliderPrimitive.Root
            data-slot="slider"
            defaultValue={defaultValue}
            value={value}
            min={min}
            max={max}
            className={cn("slider", className)}
            {...props}
        >
            <SliderPrimitive.Control className="slider-control">
                <SliderPrimitive.Track
                    data-slot="slider-track"
                    className="slider-track"
                >
                    <SliderPrimitive.Indicator
                        data-slot="slider-range"
                        className="slider-range"
                    />
                </SliderPrimitive.Track>
                {Array.from(
                    { length: thumbCount },
                    (_, index) => {
                        const thumbLabel = getAriaLabel
                            ? getAriaLabel(index)
                            : thumbCount > 1 && ariaLabel
                            ? `${ariaLabel} (${
                                index === 0
                                    ? "最小值"
                                    : index === 1
                                    ? "最大值"
                                    : index + 1
                            })`
                            : ariaLabel;
                        return (
                            <SliderPrimitive.Thumb
                                key={index}
                                index={index}
                                data-slot="slider-thumb"
                                className="slider-thumb"
                                aria-label={thumbLabel}
                                aria-labelledby={ariaLabelledby}
                                getAriaValueText={getAriaValueText}
                            />
                        );
                    },
                )}
            </SliderPrimitive.Control>
        </SliderPrimitive.Root>
    );
}

export { Slider };
