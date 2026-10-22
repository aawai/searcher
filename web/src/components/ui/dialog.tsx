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

function DialogPopup({ className, ...props }: DialogPrimitive.Popup.Props) {
    return (
        <DialogPrimitive.Popup
            data-slot="dialog-content"
            className={cn("dialog-panel", className)}
            {...props}
        />
    );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
    return (
        <DialogPrimitive.Title
            data-slot="dialog-title"
            className={cn("sheet-title", className)}
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
            className={cn("dialog-close", className)}
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
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            data-slot="dialog-footer"
            className={className}
            {...props}
        />
    );
}

function DialogContent({
    className,
    children,
    ...props
}: DialogPrimitive.Popup.Props) {
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
