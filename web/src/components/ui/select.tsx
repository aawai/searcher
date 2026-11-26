import type { ComponentProps } from "react";
import { Check, ChevronDownIcon } from "lucide-react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { useEscapeLayerForOpenState } from "./escape-layer-stack.tsx";
import { cn } from "../../lib/utils.ts";

function Select<Value = string>({
    open,
    defaultOpen,
    onOpenChange,
    ...props
}: SelectPrimitive.Root.Props<Value>) {
    const handleOpenChange = useEscapeLayerForOpenState(
        open,
        defaultOpen,
        onOpenChange,
    );
    return (
        <SelectPrimitive.Root
            {...props}
            open={open}
            defaultOpen={defaultOpen}
            onOpenChange={handleOpenChange}
        />
    );
}

function SelectTrigger({
    className,
    size = "default",
    children,
    ...props
}: SelectPrimitive.Trigger.Props & { size?: "default" | "sm" }) {
    return (
        <SelectPrimitive.Trigger
            data-slot="select-trigger"
            data-size={size}
            className={cn("select-trigger", className)}
            {...props}
        >
            <span className="select-trigger-value">{children}</span>
            <SelectPrimitive.Icon
                data-slot="select-icon"
                className="select-trigger-indicator"
                aria-hidden="true"
            >
                <ChevronDownIcon size="1em" className="icon-md" />
            </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
    );
}

function SelectValue(props: SelectPrimitive.Value.Props) {
    return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectPortal(props: SelectPrimitive.Portal.Props) {
    return <SelectPrimitive.Portal data-slot="select-portal" {...props} />;
}

function SelectPositioner(props: SelectPrimitive.Positioner.Props) {
    return (
        <SelectPrimitive.Positioner
            data-slot="select-positioner"
            {...props}
        />
    );
}

const SELECT_POPUP_WIDTH_STYLE = {
    minWidth: "max(200px, var(--anchor-width, 200px))",
    maxWidth:
        "min(calc(100vw - var(--space-6)), max(320px, var(--anchor-width, 320px)))",
} as const;

function SelectPopup({
    className,
    style,
    ...props
}: SelectPrimitive.Popup.Props) {
    return (
        <SelectPrimitive.Popup
            data-slot="select-popup"
            className={cn("menu-popup select-popup", className)}
            style={typeof style === "function"
                ? (state) => ({
                    ...SELECT_POPUP_WIDTH_STYLE,
                    ...style(state),
                })
                : {
                    ...SELECT_POPUP_WIDTH_STYLE,
                    ...style,
                }}
            {...props}
        />
    );
}

function SelectList({
    className,
    ...props
}: SelectPrimitive.List.Props) {
    return (
        <SelectPrimitive.List
            data-slot="select-list"
            className={cn("select-list", className)}
            {...props}
        />
    );
}

function SelectContent({
    children,
    className,
    sideOffset = 6,
    align = "start",
    alignItemWithTrigger = false,
    ...props
}: SelectPrimitive.Popup.Props & {
    sideOffset?: number;
    align?: SelectPrimitive.Positioner.Props["align"];
    alignItemWithTrigger?: boolean;
}) {
    return (
        <SelectPortal>
            <SelectPositioner
                sideOffset={sideOffset}
                align={align}
                alignItemWithTrigger={alignItemWithTrigger}
            >
                <SelectPopup className={className} {...props}>
                    <SelectList>{children}</SelectList>
                </SelectPopup>
            </SelectPositioner>
        </SelectPortal>
    );
}

function SelectItem({
    className,
    children,
    ...props
}: SelectPrimitive.Item.Props) {
    return (
        <SelectPrimitive.Item
            data-slot="select-item"
            className={cn("menu-item", className)}
            {...props}
        >
            <SelectPrimitive.ItemText className="select-item-text">
                {children}
            </SelectPrimitive.ItemText>
            <SelectPrimitive.ItemIndicator
                keepMounted
                className="menu-item-indicator"
                aria-hidden="true"
            >
                <Check size="1em" className="icon-md" />
            </SelectPrimitive.ItemIndicator>
        </SelectPrimitive.Item>
    );
}

function SelectGroup(props: SelectPrimitive.Group.Props) {
    return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectGroupLabel({
    className,
    ...props
}: SelectPrimitive.GroupLabel.Props) {
    return (
        <SelectPrimitive.GroupLabel
            data-slot="select-group-label"
            className={cn("menu-label", className)}
            {...props}
        />
    );
}

function SelectSeparator({
    className,
    ...props
}: ComponentProps<typeof SelectPrimitive.Separator>) {
    return (
        <SelectPrimitive.Separator
            data-slot="select-separator"
            className={cn("menu-separator", className)}
            {...props}
        />
    );
}

export {
    Select,
    SelectContent,
    SelectGroup,
    SelectGroupLabel,
    SelectItem,
    SelectList,
    SelectPopup,
    SelectPortal,
    SelectPositioner,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
};
