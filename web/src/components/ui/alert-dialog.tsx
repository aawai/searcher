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
            className={cn(
                "fixed inset-0 z-[var(--elevation-modal-backdrop)] bg-[var(--surface-scrim)] transition-all duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
                className,
            )}
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
                className={cn(
                    "fixed left-[50%] top-[50%] z-[var(--elevation-modal)] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-[var(--border)] bg-[var(--surface-l3)] p-6 shadow-[var(--shadow-l3)] duration-200 rounded-[var(--radius)] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
                    className,
                )}
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
            className={cn(
                "flex flex-col gap-2 text-center sm:text-left",
                className,
            )}
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
            className={cn(
                "flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2",
                className,
            )}
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
            className={cn(
                "text-[length:var(--font-component-title-size)] font-bold text-[var(--foreground)]",
                className,
            )}
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
            className={cn("text-sm text-[var(--muted)]", className)}
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
