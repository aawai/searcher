import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";
import "./semantic.css";

export type PageArchetype = "search" | "utility" | "workbench" | "management";
export function PageShell(
    { archetype, as: Element = "main", className, ...props }:
        & ComponentProps<"main">
        & {
            as?: "main" | "section";
            archetype: PageArchetype;
        },
) {
    return (
        <Element
            data-archetype={archetype}
            className={cn("page-shell", className)}
            {...props}
        />
    );
}
