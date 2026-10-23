import { type RefObject, useLayoutEffect, useRef, useState } from "react";

export type Presence<T extends HTMLElement> = {
    /** Render the element while open or while its exit motion runs. */
    mounted: boolean;
    /** True while closing: set `data-ending-style` and `inert` on the element. */
    ending: boolean;
    ref: RefObject<T | null>;
};

/**
 * Keeps a self-managed element mounted until the CSS exit motion on the element
 * itself settles. CSS owns the motion through `[data-ending-style]`; without a
 * finite animation (no rule, reduced motion with no opacity change) the element
 * unmounts in the same commit. Re-opening during the exit cancels the unmount.
 */
export function usePresence<T extends HTMLElement>(
    open: boolean,
): Presence<T> {
    const ref = useRef<T | null>(null);
    const [mounted, setMounted] = useState(open);
    const ending = mounted && !open;
    if (open && !mounted) setMounted(true);
    useLayoutEffect(() => {
        if (!ending) return;
        const element = ref.current;
        // getAnimations() flushes style, so the ending transition is included.
        const animations = element?.getAnimations().filter((animation) =>
            Number.isFinite(animation.effect?.getComputedTiming().endTime)
        ) ?? [];
        if (animations.length === 0) {
            setMounted(false);
            return;
        }
        let active = true;
        void Promise.allSettled(animations.map((animation) =>
            animation.finished
        )).then(() => {
            if (active) {
                setMounted(false);
            }
        });
        return () => {
            active = false;
        };
    }, [ending]);
    return { mounted, ending, ref };
}
