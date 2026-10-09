import { Tooltip as Primitive } from "@base-ui/react/tooltip";
import { cn } from "../../lib/utils.ts";

export const Tooltip = Primitive.Root;
export const TooltipTrigger = Primitive.Trigger;

export function TooltipContent(
    { className, children, ...props }: Primitive.Popup.Props,
) {
    return (
        <Primitive.Portal>
            <Primitive.Positioner className="tooltip-positioner" sideOffset={4}>
                <Primitive.Popup
                    {...props}
                    data-slot="tooltip-content"
                    className={cn("tooltip-content", className)}
                >
                    {children}
                </Primitive.Popup>
            </Primitive.Positioner>
        </Primitive.Portal>
    );
}
