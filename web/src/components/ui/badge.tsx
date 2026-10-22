import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";

type BadgeVariant =
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "ghost"
    | "link";

function Badge({
    className,
    variant = "default",
    render,
    ...props
}: useRender.ComponentProps<"span"> & { variant?: BadgeVariant }) {
    return useRender({
        defaultTagName: "span",
        props: mergeProps<"span">(
            {
                className,
                "data-slot": "badge",
                "data-variant": variant,
            } as React.ComponentProps<"span">,
            props,
        ),
        render,
    });
}

export { Badge };
