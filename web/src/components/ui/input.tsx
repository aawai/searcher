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
            className={cn("cn-input", className)}
            {...props}
        />
    );
}

export { Input };
