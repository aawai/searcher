import {
    DEFAULT_ILLUSTRATION_STYLE,
    type ResolvedIllustrationStyle,
    resolveIllustrationStyle,
} from "@shared/contracts.ts";
import { useOptionalAppState } from "../../app/state.tsx";
import { cn } from "../../lib/utils.ts";
import { BotanicalIllustration } from "./botanical.tsx";
import { GlassIllustration } from "./glass.tsx";
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
    styleOverride?: ResolvedIllustrationStyle;
    className?: string;
}

export function Illustration({
    name,
    size = "md",
    styleOverride,
    className,
}: IllustrationProps) {
    const appState = useOptionalAppState();
    const resolvedStyle: ResolvedIllustrationStyle = styleOverride ??
        resolveIllustrationStyle(
            appState?.appearance.illustrationStyle ??
                DEFAULT_ILLUSTRATION_STYLE,
            appState?.appearance.botanicalScene ?? null,
        );

    const classes = cn("system-illustration", className);
    if (resolvedStyle === "botanical") {
        return (
            <BotanicalIllustration
                name={name}
                size={size}
                className={classes}
            />
        );
    }
    return <GlassIllustration name={name} size={size} className={classes} />;
}
