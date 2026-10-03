import {
    type Dispatch,
    type ReactNode,
    useLayoutEffect,
    useState,
} from "react";
import type { DesktopAction } from "./desktop-state.ts";
import type { SafeRect } from "./desktop-geometry.ts";
import "./desktop.css";

/** Frames are always relative to this measured safe rect, never to the viewport. */
export function useDesktopSafeRect(
    bottomElement?: HTMLElement | null,
): SafeRect {
    const [rect, setRect] = useState<SafeRect>({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
    });
    useLayoutEffect(() => {
        let pending = 0;
        const measure = () => {
            const gap = Number.parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue(
                    "--space-window-gap",
                ),
            ) || 0;
            let top = 0;
            for (
                const element of document.querySelectorAll(
                    ".topbar, .connection-banner",
                )
            ) {
                const bounds = element.getBoundingClientRect();
                if (bounds.height && bounds.bottom > 0) {
                    top = Math.max(top, bounds.bottom);
                }
            }
            const bottom = bottomElement?.getBoundingClientRect().top ??
                innerHeight;
            const next = {
                x: gap,
                y: top + gap,
                width: Math.max(0, innerWidth - gap * 2),
                height: Math.max(0, bottom - top - gap * 2),
            };
            setRect((previous) =>
                Object.keys(next).every((key) =>
                        previous[key as keyof SafeRect] ===
                            next[key as keyof SafeRect]
                    )
                    ? previous
                    : next
            );
        };
        const schedule = () => {
            cancelAnimationFrame(pending);
            pending = requestAnimationFrame(measure);
        };
        const resize = new ResizeObserver(schedule);
        const observeChrome = () => {
            resize.disconnect();
            for (
                const element of document.querySelectorAll(
                    ".topbar, .connection-banner",
                )
            ) resize.observe(element);
            if (bottomElement) resize.observe(bottomElement);
            schedule();
        };
        const mutations = new MutationObserver(observeChrome);
        mutations.observe(document.body, { childList: true, subtree: true });
        observeChrome();
        measure();
        addEventListener("resize", schedule);
        addEventListener("scroll", schedule, true);
        return () => {
            cancelAnimationFrame(pending);
            resize.disconnect();
            mutations.disconnect();
            removeEventListener("resize", schedule);
            removeEventListener("scroll", schedule, true);
        };
    }, [bottomElement]);
    return rect;
}

export function DesktopCanvas(
    { rect, dispatch, children }: {
        rect: SafeRect;
        dispatch: Dispatch<DesktopAction>;
        children: ReactNode;
    },
) {
    useLayoutEffect(() => {
        dispatch({ type: "CLAMP", rect });
    }, [rect, dispatch]);
    return (
        <div
            className="desktop-canvas"
            data-desktop-safe-rect
            style={{
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
            }}
        >
            {rect.width > 0 && rect.height > 0 && children}
        </div>
    );
}
