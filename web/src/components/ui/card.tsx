import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

function Card({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            data-slot="card"
            className={cn("card", className)}
            {...props}
        />
    );
}

function CardHeader({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            data-slot="card-header"
            className={cn("card-header", className)}
            {...props}
        />
    );
}

function CardTitle({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            data-slot="card-title"
            className={cn("card-title", className)}
            {...props}
        />
    );
}

function CardDescription({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            data-slot="card-description"
            className={cn("card-description", className)}
            {...props}
        />
    );
}

function CardContent({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            data-slot="card-content"
            className={cn("card-content", className)}
            {...props}
        />
    );
}

function CardFooter({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            data-slot="card-footer"
            className={cn("card-footer", className)}
            {...props}
        />
    );
}

export {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
};
