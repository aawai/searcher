import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "../../lib/utils.ts";

function Input({
    className,
    type,
    ...props
}: InputPrimitive.Props) {
    return (
        <InputPrimitive
            type={type}
            data-slot="input"
            className={cn(
                "cn-input flex h-10 w-full min-w-0 rounded-[var(--input-radius)] border border-[var(--border)] bg-[var(--surface-solid)] px-3 py-1 text-sm text-[var(--foreground)] shadow-xs transition-[color,box-shadow] outline-none",
                "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--foreground)]",
                "placeholder:text-[var(--muted)]",
                "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                "focus-visible:border-[var(--ring)] focus-visible:ring-[2px] focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
                "aria-invalid:border-[var(--danger)] aria-invalid:ring-[var(--danger)]",
                className,
            )}
            {...props}
        />
    );
}

export { Input };
