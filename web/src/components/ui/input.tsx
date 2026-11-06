import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "../../lib/utils.ts";

/**
 * `placeholder` is required: a text field is identified by its placeholder or
 * value, which is why its border need not reach 3:1 (VISUAL_LANGUAGE 1.4.11).
 * `search` is the soft-filled toolbar look for search and filter boxes.
 */
type InputProps = Omit<InputPrimitive.Props, "placeholder"> & {
    placeholder: string;
    variant?: "default" | "search";
};

function Input({
    className,
    type,
    variant = "default",
    ...props
}: InputProps) {
    return (
        <InputPrimitive
            type={type}
            data-slot="input"
            data-variant={variant === "search" ? "search" : undefined}
            className={cn("cn-input", className)}
            {...props}
        />
    );
}

export { Input };
