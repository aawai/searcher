import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

export type PageArchetype = "search" | "utility" | "workbench" | "management";
export function PageShell(
    { archetype, as: Element = "main", className, id, tabIndex, ...props }:
        & ComponentProps<"main">
        & {
            as?: "main" | "section";
            archetype: PageArchetype;
        },
) {
    return (
        <Element
            data-archetype={archetype}
            id={id ?? (Element === "main" ? "main-content" : undefined)}
            tabIndex={tabIndex ?? (Element === "main" ? -1 : undefined)}
            className={cn("page-shell", className)}
            {...props}
        />
    );
}
