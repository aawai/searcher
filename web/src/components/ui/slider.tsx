import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "../../lib/utils.ts";

function Slider(
    { className, defaultValue, value, min = 0, max = 100, ...props }:
        SliderPrimitive.Root.Props,
) {
    const _values = Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
        ? defaultValue
        : [min, max];
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
                    { length: _values.length },
                    (_, index) => (
                        <SliderPrimitive.Thumb
                            key={index}
                            data-slot="slider-thumb"
                            className="slider-thumb"
                        />
                    ),
                )}
            </SliderPrimitive.Control>
        </SliderPrimitive.Root>
    );
}

export { Slider };
