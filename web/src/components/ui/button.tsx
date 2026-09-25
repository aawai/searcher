import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils.ts";

const buttonVariants = cva(
    "button group/button inline-flex shrink-0 items-center justify-center transition-all outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 cursor-pointer",
    {
        variants: {
            variant: {
                default: "button--primary",
                outline: "button--subtle",
                destructive: "button--danger",
                ghost: "button--ghost",
                link: "button--link",
            },
            size: {
                default: "",
                sm: "button--sm",
                icon: "button--icon",
            },
        },
        defaultVariants: {
            variant: "outline",
            size: "default",
        },
    },
);

export type ButtonProps =
    & ButtonPrimitive.Props
    & VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, ...props }: ButtonProps) {
    return (
        <ButtonPrimitive
            data-slot="button"
            className={cn(buttonVariants({ variant, size, className }))}
            {...props}
        />
    );
}

export { Button, buttonVariants };
