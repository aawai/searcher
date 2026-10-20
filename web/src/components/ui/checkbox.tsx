import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils.ts";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
    return (
        <CheckboxPrimitive.Root
            data-slot="checkbox"
            className={cn(
                "peer relative flex size-4 shrink-0 items-center justify-center rounded-(--control-radius) border border-(--border-control) outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-(--ring) disabled:opacity-50 data-checked:border-(--accent) data-checked:bg-(--accent) data-checked:text-(--accent-foreground)",
                className,
            )}
            {...props}
        >
            <CheckboxPrimitive.Indicator
                data-slot="checkbox-indicator"
                className="flex items-center justify-center"
            >
                <Check className="size-[var(--icon-sm)]" />
            </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
    );
}
export { Checkbox };
