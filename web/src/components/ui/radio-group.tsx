import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { cn } from "../../lib/utils.ts";

function RadioGroup(
    { className, ...props }: RadioGroupPrimitive.Props,
) {
    return (
        <RadioGroupPrimitive
            data-slot="radio-group"
            className={cn("radio-group", className)}
            {...props}
        />
    );
}

function RadioGroupItem(
    { className, children, ...props }: RadioPrimitive.Root.Props,
) {
    return (
        <RadioPrimitive.Root
            data-slot="radio-group-item"
            className={cn("radio-item", className)}
            {...props}
        >
            <span className="radio-circle" aria-hidden="true">
                <RadioPrimitive.Indicator
                    data-slot="radio-group-indicator"
                    className="radio-indicator"
                />
            </span>
            {children}
        </RadioPrimitive.Root>
    );
}

export { RadioGroup, RadioGroupItem };
