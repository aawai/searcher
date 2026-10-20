import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { useEscapeLayerForOpenState } from "./escape-layer-stack.tsx";
import { cn } from "../../lib/utils.ts";

function Popover({
    open,
    defaultOpen,
    onOpenChange,
    ...props
}: PopoverPrimitive.Root.Props) {
    const handleOpenChange = useEscapeLayerForOpenState(
        open,
        defaultOpen,
        onOpenChange,
    );
    return (
        <PopoverPrimitive.Root
            data-slot="popover"
            {...props}
            open={open}
            defaultOpen={defaultOpen}
            onOpenChange={handleOpenChange}
        />
    );
}

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
    return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverPortal(props: PopoverPrimitive.Portal.Props) {
    return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />;
}

function PopoverPositioner(
    { className, ...props }: PopoverPrimitive.Positioner.Props,
) {
    return (
        <PopoverPrimitive.Positioner
            data-slot="popover-positioner"
            className={cn("z-[var(--elevation-popover)]", className)}
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
                "w-72 rounded-[var(--radius)] border border-border bg-surface-solid p-3 text-foreground shadow-[var(--shadow-l2)] outline-none",
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
