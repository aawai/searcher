import type { ComponentProps } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils.ts";

function Breadcrumb(props: ComponentProps<"nav">) {
    return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />;
}
function BreadcrumbList({ className, ...props }: ComponentProps<"ol">) {
    return (
        <ol
            data-slot="breadcrumb-list"
            className={cn(
                "flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)] sm:gap-2",
                className,
            )}
            {...props}
        />
    );
}
function BreadcrumbItem({ className, ...props }: ComponentProps<"li">) {
    return (
        <li
            data-slot="breadcrumb-item"
            className={cn(
                "inline-flex min-w-0 items-center gap-1.5",
                className,
            )}
            {...props}
        />
    );
}
function BreadcrumbPage({ className, ...props }: ComponentProps<"span">) {
    return (
        <span
            data-slot="breadcrumb-page"
            aria-current="page"
            className={cn(
                "break-words font-medium text-[var(--foreground)]",
                className,
            )}
            {...props}
        />
    );
}
function BreadcrumbSeparator(
    { children, className, ...props }: ComponentProps<"li">,
) {
    return (
        <li
            data-slot="breadcrumb-separator"
            role="presentation"
            aria-hidden="true"
            className={cn("shrink-0 [&>svg]:size-3.5", className)}
            {...props}
        >
            {children ?? <ChevronRight />}
        </li>
    );
}
export {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
};
