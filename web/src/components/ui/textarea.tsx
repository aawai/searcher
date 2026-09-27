import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

function Textarea({ className, ...props }: ComponentProps<"textarea">) {
    return (
        <textarea
            data-slot="textarea"
            className={cn(
                "cn-textarea flex min-h-[80px] w-full rounded-[var(--control-radius)] border border-[var(--border)] bg-[var(--surface-solid)] px-3 py-2 text-sm text-[var(--foreground)] shadow-xs transition-[color,box-shadow] outline-none",
                "placeholder:text-[var(--muted)]",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "focus-visible:border-[var(--ring)] focus-visible:ring-[2px] focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
                "aria-invalid:border-[var(--danger)] aria-invalid:ring-[var(--danger)]",
                className,
            )}
            {...props}
        />
    );
}

export { Textarea };
