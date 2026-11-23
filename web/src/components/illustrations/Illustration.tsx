import { cn } from "../../lib/utils.ts";
import { BotanicalIllustration } from "./botanical.tsx";
import type { IllustrationName } from "./types.ts";

export type { IllustrationName } from "./types.ts";
export {
    ILLUSTRATION_CATALOG,
    ILLUSTRATION_NAMES,
    isIllustrationName,
} from "./types.ts";

export interface IllustrationProps {
    name: IllustrationName;
    size?: "sm" | "md" | "lg";
    className?: string;
}

export function Illustration({
    name,
    size = "md",
    className,
}: IllustrationProps) {
    return (
        <BotanicalIllustration
            name={name}
            size={size}
            className={cn("system-illustration", className)}
        />
    );
}
