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
            className={cn(
                "group/native-select relative w-full has-[select:disabled]:opacity-50",
                className,
            )}
        >
            <select
                data-slot="native-select"
                data-size={size}
                className={cn(
                    "w-full min-w-0 appearance-none rounded-[var(--input-radius)] border border-[var(--border)] bg-[var(--surface-solid)] text-[var(--foreground)] transition-colors outline-none select-none",
                    "disabled:pointer-events-none disabled:cursor-not-allowed",
                    "focus-visible:border-[var(--ring)] focus-visible:ring-[2px] focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
                    "aria-invalid:border-[var(--danger)] aria-invalid:ring-[var(--danger)]",
                    size === "default" && "h-10 pl-3 pr-8 text-sm",
                    size === "sm" && "h-8 pl-2.5 pr-7 text-xs",
                )}
                {...props}
            >
                {children}
            </select>
            <ChevronDownIcon
                data-slot="native-select-indicator"
                className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-[var(--muted)] transition-transform group-focus-within/native-select:text-[var(--foreground)]"
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
