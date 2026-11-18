import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useEscapeLayerForOpenState } from "./escape-layer-stack.tsx";
import { cn } from "../../lib/utils.ts";

function Dialog({
    open,
    defaultOpen,
    onOpenChange,
    ...props
}: DialogPrimitive.Root.Props) {
    const handleOpenChange = useEscapeLayerForOpenState(
        open,
        defaultOpen,
        onOpenChange,
    );
    return (
        <DialogPrimitive.Root
            data-slot="dialog"
            {...props}
            open={open}
            defaultOpen={defaultOpen}
            onOpenChange={handleOpenChange}
        />
    );
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
    return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
    return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogBackdrop({
    className,
    ...props
}: DialogPrimitive.Backdrop.Props) {
    return (
        <DialogPrimitive.Backdrop
            data-slot="dialog-backdrop"
            className={cn("dialog-backdrop", className)}
            {...props}
        />
    );
}

/** `surface="grouped"`: the panel is the grouped-list canvas for a grouped form. */
export type DialogSize = "sm" | "md" | "lg" | "wide";
export type DialogPlacement = "center" | "top" | "anchored";
export type DialogPopupProps = DialogPrimitive.Popup.Props & {
    surface?: "grouped";
    size?: DialogSize;
    placement?: DialogPlacement;
    scrollable?: boolean;
};

function DialogPopup({
    className,
    surface,
    size = "md",
    placement = "center",
    scrollable = false,
    ...props
}: DialogPopupProps) {
    return (
        <DialogPrimitive.Popup
            data-slot="dialog-content"
            data-surface={surface}
            data-size={size}
            data-placement={placement}
            data-scrollable={scrollable || undefined}
            className={cn("dialog-panel", className)}
            {...props}
        />
    );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
    return (
        <DialogPrimitive.Title
            data-slot="dialog-title"
            className={className}
            {...props}
        />
    );
}

function DialogDescription({
    className,
    ...props
}: DialogPrimitive.Description.Props) {
    return (
        <DialogPrimitive.Description
            data-slot="dialog-description"
            className={className}
            {...props}
        />
    );
}

function DialogClose({ className, ...props }: DialogPrimitive.Close.Props) {
    return (
        <DialogPrimitive.Close
            data-slot="dialog-close"
            className={className}
            {...props}
        />
    );
}

function DialogHeader({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            data-slot="dialog-header"
            className={className}
            {...props}
        />
    );
}

function DialogFooter({
    className,
    bordered = false,
    ...props
}: React.HTMLAttributes<HTMLDivElement> & { bordered?: boolean }) {
    return (
        <div
            data-slot="dialog-footer"
            data-bordered={bordered || undefined}
            className={className}
            {...props}
        />
    );
}

function DialogContent({
    className,
    children,
    ...props
}: DialogPopupProps) {
    return (
        <DialogPortal>
            <DialogBackdrop />
            <DialogPopup className={className} {...props}>
                {children}
            </DialogPopup>
        </DialogPortal>
    );
}

export {
    Dialog,
    DialogBackdrop,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogPopup,
    DialogPortal,
    DialogTitle,
    DialogTrigger,
};
