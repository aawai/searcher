import type * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "../../lib/utils.ts";

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
    size?: "default" | "sm";
};

function NativeSelect({
    className,
    size = "default",
    children,
    ...props
}: NativeSelectProps) {
    return (
        <div
            data-slot="native-select-wrapper"
            data-size={size}
            className={cn("relative w-full", className)}
        >
            <select
                data-slot="native-select"
                data-size={size}
                className="select-none"
                {...props}
            >
                {children}
            </select>
            <ChevronDownIcon
                data-slot="native-select-indicator"
                size="1em"
                className="native-select-indicator icon-md"
                aria-hidden="true"
            />
        </div>
    );
}

function NativeSelectOption({
    className,
    ...props
}: React.ComponentProps<"option">) {
    return (
        <option
            data-slot="native-select-option"
            className={cn(
                "bg-[var(--surface-solid)] text-[var(--foreground)]",
                className,
            )}
            {...props}
        />
    );
}

function NativeSelectOptGroup({
    className,
    ...props
}: React.ComponentProps<"optgroup">) {
    return (
        <optgroup
            data-slot="native-select-optgroup"
            className={cn(
                "bg-[var(--surface-solid)] text-[var(--foreground)] font-semibold",
                className,
            )}
            {...props}
        />
    );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
