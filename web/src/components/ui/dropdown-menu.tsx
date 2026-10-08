import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "../../lib/utils.ts";

function DropdownMenu(props: MenuPrimitive.Root.Props) {
    return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
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
            style={{ zIndex: 1000, ...props.style }}
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
            className={cn("engine-menu", className)}
            {...props}
        />
    );
}

function DropdownMenuItem({
    className,
    ...props
}: MenuPrimitive.Item.Props) {
    return (
        <MenuPrimitive.Item
            data-slot="dropdown-menu-item"
            className={cn("engine-option", className)}
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
            className={cn("engine-option", className)}
            {...props}
        >
            <MenuPrimitive.RadioItemIndicator aria-hidden="true">
                ✓
            </MenuPrimitive.RadioItemIndicator>
            {children}
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
    DropdownMenuTrigger,
};
