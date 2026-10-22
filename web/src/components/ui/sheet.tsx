import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { useEscapeLayerForOpenState } from "./escape-layer-stack.tsx";
import { cn } from "../../lib/utils.ts";

function Sheet({
    open,
    defaultOpen,
    onOpenChange,
    escapeLayer = true,
    ...props
}: SheetPrimitive.Root.Props & { escapeLayer?: boolean }) {
    const handleOpenChange = useEscapeLayerForOpenState(
        open,
        defaultOpen,
        onOpenChange,
        "overlay",
        escapeLayer,
    );
    return (
        <SheetPrimitive.Root
            data-slot="sheet"
            {...props}
            open={open}
            defaultOpen={defaultOpen}
            onOpenChange={handleOpenChange}
        />
    );
}

function SheetTrigger(props: SheetPrimitive.Trigger.Props) {
    return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetPortal(props: SheetPrimitive.Portal.Props) {
    return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetBackdrop({
    className,
    ...props
}: SheetPrimitive.Backdrop.Props) {
    return (
        <SheetPrimitive.Backdrop
            data-slot="sheet-backdrop"
            className={cn("sheet-backdrop", className)}
            {...props}
        />
    );
}

function SheetPopup({ className, ...props }: SheetPrimitive.Popup.Props) {
    return (
        <SheetPrimitive.Popup
            data-slot="sheet-content"
            className={cn("sheet", className)}
            {...props}
        />
    );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
    return (
        <SheetPrimitive.Title
            data-slot="sheet-title"
            className={cn("sheet-title", className)}
            {...props}
        />
    );
}

function SheetDescription({
    className,
    ...props
}: SheetPrimitive.Description.Props) {
    return (
        <SheetPrimitive.Description
            data-slot="sheet-description"
            className={className}
            {...props}
        />
    );
}

function SheetClose({ className, ...props }: SheetPrimitive.Close.Props) {
    return (
        <SheetPrimitive.Close
            data-slot="sheet-close"
            className={cn("sheet-close", className)}
            {...props}
        />
    );
}

function SheetHeader({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            data-slot="sheet-header"
            className={cn("sheet-head", className)}
            {...props}
        />
    );
}

function SheetContent({
    className,
    children,
    ...props
}: SheetPrimitive.Popup.Props) {
    return (
        <SheetPortal>
            <SheetBackdrop />
            <SheetPopup className={className} {...props}>
                {children}
            </SheetPopup>
        </SheetPortal>
    );
}

export {
    Sheet,
    SheetBackdrop,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetPopup,
    SheetPortal,
    SheetTitle,
    SheetTrigger,
};
