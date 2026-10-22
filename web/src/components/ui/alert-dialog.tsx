import type * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { cn } from "../../lib/utils.ts";
import { Button, type ButtonProps, buttonVariants } from "./button.tsx";
import { useEscapeLayerForOpenState } from "./escape-layer-stack.tsx";

function AlertDialog({
    open,
    defaultOpen,
    onOpenChange,
    ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
    const handleOpenChange = useEscapeLayerForOpenState(
        open,
        defaultOpen,
        onOpenChange,
    );
    return (
        <AlertDialogPrimitive.Root
            data-slot="alert-dialog"
            {...props}
            open={open}
            defaultOpen={defaultOpen}
            onOpenChange={handleOpenChange}
        />
    );
}

function AlertDialogTrigger({
    ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
    return (
        <AlertDialogPrimitive.Trigger
            data-slot="alert-dialog-trigger"
            {...props}
        />
    );
}

function AlertDialogPortal({
    ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
    return (
        <AlertDialogPrimitive.Portal
            data-slot="alert-dialog-portal"
            {...props}
        />
    );
}

function AlertDialogOverlay({
    className,
    ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Backdrop>) {
    return (
        <AlertDialogPrimitive.Backdrop
            data-slot="alert-dialog-overlay"
            className={className}
            {...props}
        />
    );
}

function AlertDialogContent({
    className,
    children,
    ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Popup>) {
    return (
        <AlertDialogPortal>
            <AlertDialogOverlay />
            <AlertDialogPrimitive.Popup
                data-slot="alert-dialog-content"
                className={className}
                {...props}
            >
                {children}
            </AlertDialogPrimitive.Popup>
        </AlertDialogPortal>
    );
}

function AlertDialogHeader(
    { className, ...props }: React.ComponentProps<"div">,
) {
    return (
        <div
            data-slot="alert-dialog-header"
            className={className}
            {...props}
        />
    );
}

function AlertDialogFooter(
    { className, ...props }: React.ComponentProps<"div">,
) {
    return (
        <div
            data-slot="alert-dialog-footer"
            className={className}
            {...props}
        />
    );
}

function AlertDialogTitle({
    className,
    ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
    return (
        <AlertDialogPrimitive.Title
            data-slot="alert-dialog-title"
            className={className}
            {...props}
        />
    );
}

function AlertDialogDescription({
    className,
    ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
    return (
        <AlertDialogPrimitive.Description
            data-slot="alert-dialog-description"
            className={className}
            {...props}
        />
    );
}

function AlertDialogAction({
    className,
    variant = "destructive",
    ...props
}: ButtonProps) {
    return (
        <Button
            data-slot="alert-dialog-action"
            variant={variant}
            className={className}
            {...props}
        />
    );
}

function AlertDialogCancel({
    className,
    ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Close>) {
    return (
        <AlertDialogPrimitive.Close
            data-slot="alert-dialog-cancel"
            className={cn(buttonVariants({ variant: "outline" }), className)}
            {...props}
        />
    );
}

export {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogOverlay,
    AlertDialogPortal,
    AlertDialogTitle,
    AlertDialogTrigger,
};
