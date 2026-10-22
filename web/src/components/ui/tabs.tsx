import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "../../lib/utils.ts";

function Tabs({
    className,
    orientation = "horizontal",
    ...props
}: TabsPrimitive.Root.Props) {
    return (
        <TabsPrimitive.Root
            data-slot="tabs"
            data-orientation={orientation}
            className={cn(
                "flex gap-2 data-[orientation=horizontal]:flex-col data-[orientation=vertical]:flex-row",
                className,
            )}
            {...props}
        />
    );
}

function TabsList({
    className,
    variant = "default",
    ...props
}: TabsPrimitive.List.Props & { variant?: "default" | "line" }) {
    return (
        <TabsPrimitive.List
            data-slot="tabs-list"
            data-variant={variant}
            className={className}
            {...props}
        />
    );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
    return (
        <TabsPrimitive.Tab
            data-slot="tabs-trigger"
            className={className}
            {...props}
        />
    );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
    return (
        <TabsPrimitive.Panel
            data-slot="tabs-content"
            className={cn("flex-1 outline-none", className)}
            {...props}
        />
    );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
