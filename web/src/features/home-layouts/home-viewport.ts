import { useLayoutEffect, useState } from "react";
import { HOME_GRID_VIEWPORT_INSET } from "../../design-system/home-grid.ts";

export type SafeRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type DockInsets = {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
};

export type HomeViewport = {
    viewportWidth: number;
    chromeBottom: number;
    availableRect: SafeRect;
};

function finite(value: number): number {
    return Number.isFinite(value) ? value : 0;
}

/**
 * Pure: non-finite inputs become 0 and every size is floored at 0. The free
 * rect starts one `inset` (the page margin) below the top chrome and keeps
 * `inset` from the left, right and bottom viewport edges.
 */
export function homeViewport(
    width: number,
    height: number,
    chromeBottom: number,
    inset: number,
    dockInsets: DockInsets = {},
): HomeViewport {
    const viewportWidth = Math.max(0, finite(width));
    const viewportHeight = Math.max(0, finite(height));
    const bottom = Math.min(viewportHeight, Math.max(0, finite(chromeBottom)));
    const margin = Math.max(0, finite(inset));
    const dockTop = Math.max(0, finite(dockInsets.top ?? 0));
    const dockRight = Math.max(0, finite(dockInsets.right ?? 0));
    const dockBottom = Math.max(0, finite(dockInsets.bottom ?? 0));
    const dockLeft = Math.max(0, finite(dockInsets.left ?? 0));

    const topEdge = Math.max(bottom, dockTop);
    const startX = Math.min(margin + dockLeft, viewportWidth);
    const availableWidth = Math.max(
        0,
        viewportWidth - 2 * margin - dockLeft - dockRight,
    );
    const availableHeight = Math.max(
        0,
        viewportHeight - topEdge - 2 * margin - dockBottom,
    );

    return {
        viewportWidth,
        chromeBottom: bottom,
        availableRect: {
            x: startX,
            y: topEdge + margin,
            width: availableWidth,
            height: availableHeight,
        },
    };
}

/** Measures the viewport and the free rect below the top chrome, in CSS px. */
export function useHomeViewport(): HomeViewport {
    const [viewport, setViewport] = useState(() => homeViewport(0, 0, 0, 0));
    useLayoutEffect(() => {
        let pending = 0;
        const measure = () => {
            let chromeBottom = 0;
            for (
                const element of document.querySelectorAll(
                    ".topbar, .connection-banner",
                )
            ) {
                if (getComputedStyle(element).display === "none") continue;
                const bounds = element.getBoundingClientRect();
                if (
                    bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0
                ) {
                    chromeBottom = Math.max(chromeBottom, bounds.bottom);
                }
            }
            const inset = parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue(
                    HOME_GRID_VIEWPORT_INSET,
                ),
            );
            const shell = document.querySelector(".app-shell");
            const style = shell
                ? getComputedStyle(shell)
                : getComputedStyle(document.documentElement);
            const dockTop =
                parseFloat(style.getPropertyValue("--dock-inset-top")) || 0;
            const dockRight =
                parseFloat(style.getPropertyValue("--dock-inset-right")) || 0;
            const dockBottom =
                parseFloat(style.getPropertyValue("--dock-inset-bottom")) || 0;
            const dockLeft =
                parseFloat(style.getPropertyValue("--dock-inset-left")) || 0;
            const next = homeViewport(
                globalThis.innerWidth,
                globalThis.innerHeight,
                chromeBottom,
                inset,
                {
                    top: dockTop,
                    right: dockRight,
                    bottom: dockBottom,
                    left: dockLeft,
                },
            );
            setViewport((previous) =>
                previous.viewportWidth === next.viewportWidth &&
                    previous.chromeBottom === next.chromeBottom &&
                    previous.availableRect.x === next.availableRect.x &&
                    previous.availableRect.y === next.availableRect.y &&
                    previous.availableRect.width === next.availableRect.width &&
                    previous.availableRect.height === next.availableRect.height
                    ? previous
                    : next
            );
        };
        const schedule = () => {
            cancelAnimationFrame(pending);
            pending = requestAnimationFrame(measure);
        };
        const resizeObserver = new ResizeObserver(schedule);
        const observeChrome = () => {
            resizeObserver.disconnect();
            for (
                const element of document.querySelectorAll(
                    ".topbar, .connection-banner, .dock-container",
                )
            ) {
                resizeObserver.observe(element);
            }
            schedule();
        };
        const mutationObserver = new MutationObserver(observeChrome);
        mutationObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "hidden", "style", "data-dock-edge"],
        });
        observeChrome();
        measure();
        addEventListener("resize", schedule);
        addEventListener("scroll", schedule, true);
        document.addEventListener("visibilitychange", schedule);
        return () => {
            cancelAnimationFrame(pending);
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            removeEventListener("resize", schedule);
            removeEventListener("scroll", schedule, true);
            document.removeEventListener("visibilitychange", schedule);
        };
    }, []);
    return viewport;
}
