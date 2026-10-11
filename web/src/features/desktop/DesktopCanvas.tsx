import {
    type Dispatch,
    type ReactNode,
    useLayoutEffect,
    useState,
} from "react";
import type { DesktopAction } from "./desktop-state.ts";
import { type DesktopGeometry, desktopGeometry } from "./desktop-geometry.ts";
import "./desktop.css";

function sameGeometry(a: DesktopGeometry, b: DesktopGeometry): boolean {
    const aViewport = a.viewportRect;
    const bViewport = b.viewportRect;
    const aWork = a.workRect;
    const bWork = b.workRect;
    const aSafe = a.safeRect;
    const bSafe = b.safeRect;
    return aViewport.width === bViewport.width &&
        aViewport.height === bViewport.height &&
        aWork.y === bWork.y && aWork.height === bWork.height &&
        aSafe.x === bSafe.x && aSafe.y === bSafe.y &&
        aSafe.width === bSafe.width && aSafe.height === bSafe.height &&
        a.chromeBottom === b.chromeBottom && a.dockTop === b.dockTop &&
        a.windowGap === b.windowGap && a.chromeHeight === b.chromeHeight &&
        a.usable === b.usable;
}

/** Measures all desktop bounds in the application viewport's global coordinate space. */
export function useDesktopGeometry(
    bottomElement?: HTMLElement | null,
): DesktopGeometry {
    const [geometry, setGeometry] = useState(() => desktopGeometry(0, 0));
    useLayoutEffect(() => {
        let pending = 0;
        let lastViewportWidth: number | null = null;
        let lastViewportHeight: number | null = null;

        const measure = () => {
            const width = Math.max(0, globalThis.innerWidth);
            const height = Math.max(0, globalThis.innerHeight);
            const root = document.documentElement;
            const immersive = root.dataset.documentImmersive !== undefined;
            if (
                immersive && lastViewportWidth === width &&
                lastViewportHeight === height
            ) {
                return;
            }
            lastViewportWidth = width;
            lastViewportHeight = height;

            const rootStyle = getComputedStyle(root);
            const parsedGap = Number.parseFloat(
                rootStyle.getPropertyValue("--space-window-gap"),
            );
            const gap = Number.isFinite(parsedGap) ? Math.max(0, parsedGap) : 0;

            let chromeBottom = 0;
            for (
                const element of document.querySelectorAll(
                    ".topbar, .connection-banner",
                )
            ) {
                const style = getComputedStyle(element);
                if (style.display === "none") continue;
                const bounds = element.getBoundingClientRect();
                if (
                    bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0
                ) {
                    chromeBottom = Math.max(chromeBottom, bounds.bottom);
                }
            }

            const dockStyle = bottomElement
                ? getComputedStyle(bottomElement)
                : null;
            const dockBounds = bottomElement?.getBoundingClientRect();
            const dockTop = bottomElement && dockBounds &&
                    dockStyle?.display !== "none" && dockBounds.width > 0 &&
                    dockBounds.height > 0
                ? dockBounds.top
                : height;

            let chromeHeight = Number.parseFloat(
                rootStyle.getPropertyValue("--window-chrome-height"),
            );
            for (
                const element of document.querySelectorAll(
                    ".desktop-window-chrome",
                )
            ) {
                const measuredHeight = element.getBoundingClientRect().height;
                if (measuredHeight > 0) chromeHeight = measuredHeight;
            }
            if (!Number.isFinite(chromeHeight) || chromeHeight <= 0) {
                chromeHeight = 48;
            }

            const next = desktopGeometry(
                width,
                height,
                chromeBottom,
                dockTop,
                gap,
                chromeHeight,
            );
            setGeometry((previous) =>
                sameGeometry(previous, next) ? previous : next
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
                    ".topbar, .connection-banner, .desktop-window-chrome",
                )
            ) resize.observe(element);
            if (bottomElement) resize.observe(bottomElement);
            schedule();
        };
        const mutations = new MutationObserver(observeChrome);
        mutations.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "hidden"],
        });
        const immersionChanges = new MutationObserver(schedule);
        immersionChanges.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-document-immersive"],
        });
        observeChrome();
        measure();
        addEventListener("resize", schedule);
        addEventListener("scroll", schedule, true);
        document.addEventListener("visibilitychange", schedule);
        return () => {
            cancelAnimationFrame(pending);
            resize.disconnect();
            mutations.disconnect();
            immersionChanges.disconnect();
            removeEventListener("resize", schedule);
            removeEventListener("scroll", schedule, true);
            document.removeEventListener("visibilitychange", schedule);
        };
    }, [bottomElement]);
    return geometry;
}

export function DesktopCanvas(
    { rect, dispatch, children }: {
        rect: DesktopGeometry;
        dispatch: Dispatch<DesktopAction>;
        children: ReactNode;
    },
) {
    useLayoutEffect(() => {
        if (
            rect.usable && rect.viewportRect.width > 0 &&
            rect.viewportRect.height > 0
        ) {
            dispatch({ type: "CLAMP", rect });
        }
    }, [rect, dispatch]);
    return (
        <div
            className="desktop-canvas"
            data-desktop-viewport
            style={{
                left: 0,
                top: 0,
                width: rect.viewportRect.width,
                height: rect.viewportRect.height,
            }}
        >
            {rect.viewportRect.width > 0 && rect.viewportRect.height > 0 &&
                children}
        </div>
    );
}
