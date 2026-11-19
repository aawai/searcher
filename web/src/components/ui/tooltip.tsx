import { Tooltip as Primitive } from "@base-ui/react/tooltip";
import { useEscapeLayerForOpenState } from "./escape-layer-stack.tsx";
import { cn } from "../../lib/utils.ts";

export function TooltipProvider({
    delay = 400,
    closeDelay = 0,
    timeout = 400,
    ...props
}: Primitive.Provider.Props) {
    return (
        <Primitive.Provider
            delay={delay}
            closeDelay={closeDelay}
            timeout={timeout}
            {...props}
        />
    );
}

export function Tooltip({
    open,
    defaultOpen,
    onOpenChange,
    ...props
}: Primitive.Root.Props) {
    const handleOpenChange = useEscapeLayerForOpenState(
        open,
        defaultOpen,
        onOpenChange,
        "tooltip",
        !props.disabled,
    );
    return (
        <Primitive.Root
            data-slot="tooltip"
            {...props}
            open={open}
            defaultOpen={defaultOpen}
            onOpenChange={handleOpenChange}
        />
    );
}

export const TooltipTrigger = Primitive.Trigger;

export interface TooltipContentProps extends Primitive.Popup.Props {
    side?: "top" | "bottom" | "left" | "right";
    sideOffset?: number;
    align?: "start" | "center" | "end";
    alignOffset?: number;
}

export function TooltipContent(
    {
        className,
        children,
        side,
        sideOffset = 4,
        align,
        alignOffset,
        ...props
    }: TooltipContentProps,
) {
    return (
        <Primitive.Portal>
            <Primitive.Positioner
                data-slot="tooltip-positioner"
                className="tooltip-positioner"
                side={side}
                sideOffset={sideOffset}
                align={align}
                alignOffset={alignOffset}
            >
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
