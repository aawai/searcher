import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "../../lib/utils.ts";

function Popover(props: PopoverPrimitive.Root.Props) {
    return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
    return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverPortal(props: PopoverPrimitive.Portal.Props) {
    return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />;
}

function PopoverPositioner(props: PopoverPrimitive.Positioner.Props) {
    return (
        <PopoverPrimitive.Positioner
            data-slot="popover-positioner"
            style={{ zIndex: 1000, ...props.style }}
            {...props}
        />
    );
}

function PopoverPopup({
    className,
    ...props
}: PopoverPrimitive.Popup.Props) {
    return (
        <PopoverPrimitive.Popup
            data-slot="popover-content"
            className={cn(
                "z-50 w-72 rounded-md border border-border bg-surface-solid p-3 text-foreground shadow-md outline-none",
                className,
            )}
            {...props}
        />
    );
}

function PopoverClose(props: PopoverPrimitive.Close.Props) {
    return <PopoverPrimitive.Close data-slot="popover-close" {...props} />;
}

function PopoverTitle(props: PopoverPrimitive.Title.Props) {
    return <PopoverPrimitive.Title data-slot="popover-title" {...props} />;
}

function PopoverDescription(props: PopoverPrimitive.Description.Props) {
    return (
        <PopoverPrimitive.Description
            data-slot="popover-description"
            {...props}
        />
    );
}

interface PopoverContentProps extends PopoverPrimitive.Popup.Props {
    side?: "top" | "bottom" | "left" | "right";
    sideOffset?: number;
    align?: "start" | "center" | "end";
    alignOffset?: number;
}

function PopoverContent({
    children,
    className,
    side = "top",
    sideOffset = 8,
    align = "start",
    alignOffset,
    ...props
}: PopoverContentProps) {
    return (
        <PopoverPortal>
            <PopoverPositioner
                side={side}
                sideOffset={sideOffset}
                align={align}
                alignOffset={alignOffset}
            >
                <PopoverPopup className={className} {...props}>
                    {children}
                </PopoverPopup>
            </PopoverPositioner>
        </PopoverPortal>
    );
}

export {
    Popover,
    PopoverClose,
    PopoverContent,
    PopoverDescription,
    PopoverPopup,
    PopoverPortal,
    PopoverPositioner,
    PopoverTitle,
    PopoverTrigger,
};
