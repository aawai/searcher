import { Check } from "lucide-react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { useEscapeLayerForOpenState } from "./escape-layer-stack.tsx";
import { cn } from "../../lib/utils.ts";

function DropdownMenu({
    open,
    defaultOpen,
    onOpenChange,
    ...props
}: MenuPrimitive.Root.Props) {
    const handleOpenChange = useEscapeLayerForOpenState(
        open,
        defaultOpen,
        onOpenChange,
    );
    return (
        <MenuPrimitive.Root
            data-slot="dropdown-menu"
            {...props}
            open={open}
            defaultOpen={defaultOpen}
            onOpenChange={handleOpenChange}
        />
    );
}

function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props) {
    return (
        <MenuPrimitive.Trigger
            data-slot="dropdown-menu-trigger"
            {...props}
        />
    );
}

function DropdownMenuPortal(props: MenuPrimitive.Portal.Props) {
    return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuPositioner(props: MenuPrimitive.Positioner.Props) {
    return (
        <MenuPrimitive.Positioner
            data-slot="dropdown-menu-positioner"
            {...props}
        />
    );
}

function DropdownMenuPopup({
    className,
    ...props
}: MenuPrimitive.Popup.Props) {
    return (
        <MenuPrimitive.Popup
            data-slot="dropdown-menu-content"
            className={cn("menu-popup", className)}
            {...props}
        />
    );
}

function DropdownMenuItem({
    className,
    variant = "default",
    ...props
}: MenuPrimitive.Item.Props & { variant?: "default" | "destructive" }) {
    return (
        <MenuPrimitive.Item
            data-slot="dropdown-menu-item"
            data-variant={variant}
            className={cn("menu-item", className)}
            {...props}
        />
    );
}

function DropdownMenuSeparator(
    { className, ...props }: MenuPrimitive.Separator.Props,
) {
    return (
        <MenuPrimitive.Separator
            data-slot="dropdown-menu-separator"
            className={cn("menu-separator", className)}
            {...props}
        />
    );
}

function DropdownMenuContent({
    children,
    className,
    sideOffset = 8,
    ...props
}: MenuPrimitive.Popup.Props & { sideOffset?: number }) {
    return (
        <DropdownMenuPortal>
            <DropdownMenuPositioner sideOffset={sideOffset}>
                <DropdownMenuPopup className={className} {...props}>
                    {children}
                </DropdownMenuPopup>
            </DropdownMenuPositioner>
        </DropdownMenuPortal>
    );
}

function DropdownMenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) {
    return <MenuPrimitive.RadioGroup {...props} />;
}

function DropdownMenuRadioItem(
    { className, children, ...props }: MenuPrimitive.RadioItem.Props,
) {
    return (
        <MenuPrimitive.RadioItem
            className={cn("menu-item", className)}
            {...props}
        >
            {children}
            <MenuPrimitive.RadioItemIndicator
                keepMounted
                className="menu-item-indicator"
                aria-hidden="true"
            >
                <Check size="1em" className="icon-md" />
            </MenuPrimitive.RadioItemIndicator>
        </MenuPrimitive.RadioItem>
    );
}

export {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuPopup,
    DropdownMenuPortal,
    DropdownMenuPositioner,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
};
