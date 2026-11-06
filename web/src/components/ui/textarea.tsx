import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

/** `placeholder` is required for the same reason as on `Input`. */
type TextareaProps = Omit<ComponentProps<"textarea">, "placeholder"> & {
    placeholder: string;
};

function Textarea({ className, ...props }: TextareaProps) {
    return (
        <textarea
            data-slot="textarea"
            className={cn("cn-textarea", className)}
            {...props}
        />
    );
}

export { Textarea };
