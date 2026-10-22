import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { useEscapeLayerForOpenState } from "./escape-layer-stack.tsx";
import { cn } from "../../lib/utils.ts";

function ContextMenu({
    open,
    defaultOpen,
    onOpenChange,
    ...props
}: ContextMenuPrimitive.Root.Props) {
    const handleOpenChange = useEscapeLayerForOpenState(
        open,
        defaultOpen,
        onOpenChange,
    );
    return (
        <ContextMenuPrimitive.Root
            data-slot="context-menu"
            {...props}
            open={open}
            defaultOpen={defaultOpen}
            onOpenChange={handleOpenChange}
        />
    );
}

function ContextMenuTrigger(
    { onTouchEnd, ...props }: ContextMenuPrimitive.Trigger.Props,
) {
    return (
        <ContextMenuPrimitive.Trigger
            data-slot="context-menu-trigger"
            {...props}
            onTouchEnd={(event) => {
                // Releasing a long press must not activate the underlying tile.
                if (event.currentTarget.hasAttribute("data-popup-open")) {
                    event.preventDefault();
                }
                onTouchEnd?.(event);
            }}
        />
    );
}

function ContextMenuContent({
    className,
    children,
    sideOffset = 4,
    ...props
}: ContextMenuPrimitive.Popup.Props & { sideOffset?: number }) {
    return (
        <ContextMenuPrimitive.Portal>
            <ContextMenuPrimitive.Positioner
                className="context-menu-positioner"
                sideOffset={sideOffset}
            >
                <ContextMenuPrimitive.Popup
                    data-slot="context-menu-content"
                    className={cn("menu-popup", className)}
                    {...props}
                >
                    {children}
                </ContextMenuPrimitive.Popup>
            </ContextMenuPrimitive.Positioner>
        </ContextMenuPrimitive.Portal>
    );
}

function ContextMenuItem({
    className,
    variant = "default",
    ...props
}: ContextMenuPrimitive.Item.Props & {
    variant?: "default" | "destructive";
}) {
    return (
        <ContextMenuPrimitive.Item
            data-slot="context-menu-item"
            data-variant={variant}
            className={cn("menu-item", className)}
            {...props}
        />
    );
}

function ContextMenuSeparator(
    { className, ...props }: ContextMenuPrimitive.Separator.Props,
) {
    return (
        <ContextMenuPrimitive.Separator
            data-slot="context-menu-separator"
            className={cn("menu-separator", className)}
            {...props}
        />
    );
}

export {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
};
