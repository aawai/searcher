import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { cn } from "../../lib/utils.ts";

function Separator(
    { className, orientation = "horizontal", ...props }:
        SeparatorPrimitive.Props,
) {
    return (
        <SeparatorPrimitive
            data-slot="separator"
            data-orientation={orientation}
            orientation={orientation}
            className={cn("separator", className)}
            {...props}
        />
    );
}

export { Separator };
