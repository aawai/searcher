import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
    return (
        <CheckboxPrimitive.Root
            data-slot="checkbox"
            nativeButton
            render={<button type="button" />}
            className={className}
            {...props}
        >
            <CheckboxPrimitive.Indicator data-slot="checkbox-indicator">
                <Check size="1em" className="icon-sm" />
            </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
    );
}
export { Checkbox };
