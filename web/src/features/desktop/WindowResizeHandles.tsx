import {
    type Dispatch,
    type KeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    type RefObject,
    useEffect,
    useRef,
    useState,
} from "react";
import type { Frame, ResizeDirection, SafeRect } from "./desktop-geometry.ts";
import { clampFrame, resizeFrame } from "./desktop-geometry.ts";
import type { DesktopAction, DesktopWindowState } from "./desktop-state.ts";

export interface WindowResizeHandlesProps {
    window: DesktopWindowState;
    rect: SafeRect;
    active: boolean;
    dispatch: Dispatch<DesktopAction>;
    windowRef: RefObject<HTMLDivElement | null>;
    disabled?: boolean;
}

const RESIZE_DIRECTIONS: readonly ResizeDirection[] = [
    "n",
    "ne",
    "e",
    "se",
    "s",
    "sw",
    "w",
    "nw",
];

const DIRECTION_LABELS: Record<ResizeDirection, string> = {
    n: "顶部边缘调整大小",
    ne: "右上角调整大小",
    e: "右侧边缘调整大小",
    se: "右下角调整大小",
    s: "底部边缘调整大小",
    sw: "左下角调整大小",
    w: "左侧边缘调整大小",
    nw: "左上角调整大小",
};

interface ResizeSession {
    direction: ResizeDirection;
    startX: number;
    startY: number;
    startFrame: Frame;
    currentFrame: Frame;
    pointerId: number;
    handleEl: HTMLElement;
}

function useIsDesktopViewport(): boolean {
    const [isDesktop, setIsDesktop] = useState(() => {
        if (typeof globalThis.window === "undefined") return true;
        return globalThis.innerWidth >= 1024;
    });

    useEffect(() => {
        if (typeof globalThis.matchMedia !== "function") return;
        const mediaQuery = globalThis.matchMedia("(min-width: 1024px)");
        const handler = (e: MediaQueryListEvent) => {
            setIsDesktop(e.matches);
        };
        setIsDesktop(mediaQuery.matches);
        mediaQuery.addEventListener("change", handler);
        return () => mediaQuery.removeEventListener("change", handler);
    }, []);

    return isDesktop;
}

export function WindowResizeHandles({
    window: win,
    rect,
    active,
    dispatch,
    windowRef,
    disabled,
}: WindowResizeHandlesProps) {
    const isDesktop = useIsDesktopViewport();
    const sessionRef = useRef<ResizeSession | null>(null);
    const rafIdRef = useRef<number | null>(null);

    // Cancel pending rAF and clean on unmount
    useEffect(() => {
        return () => {
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
        };
    }, []);

    // Safe-rect changes end this gesture in the same coordinate system.
    useEffect(() => {
        if (sessionRef.current) handlePointerCancel();
    }, [rect.width, rect.height, rect.x, rect.y]);

    const handlePointerDown = (
        direction: ResizeDirection,
        e: ReactPointerEvent<HTMLDivElement>,
    ) => {
        // Only primary pointer button
        if (e.button !== 0) return;
        if (win.mode === "maximized" || win.mode === "minimized") return;

        e.preventDefault();
        e.stopPropagation();

        // Focus on start allowed
        if (!active) {
            dispatch({ type: "FOCUS", id: win.id });
        }

        const handleEl = e.currentTarget;
        const pointerId = e.pointerId;
        try {
            handleEl.setPointerCapture(pointerId);
        } catch {
            // ignore
        }

        sessionRef.current = {
            direction,
            startX: e.clientX,
            startY: e.clientY,
            startFrame: { ...win.frame },
            currentFrame: { ...win.frame },
            pointerId,
            handleEl,
        };
    };

    const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const session = sessionRef.current;
        if (!session) return;

        const dx = e.clientX - session.startX;
        const dy = e.clientY - session.startY;

        const nextFrame = resizeFrame(
            session.startFrame,
            session.direction,
            dx,
            dy,
            rect,
            win.kind,
        );
        session.currentFrame = nextFrame;

        // Transient transform/width/height via rAF
        if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
        }
        rafIdRef.current = requestAnimationFrame(() => {
            const winEl = windowRef.current ??
                (session.handleEl.closest(".desktop-window") as
                    | HTMLElement
                    | null);
            if (winEl) {
                winEl.style.transform =
                    `translate3d(${nextFrame.x}px, ${nextFrame.y}px, 0)`;
                winEl.style.width = `${nextFrame.width}px`;
                winEl.style.height = `${nextFrame.height}px`;
            }
        });
    };

    const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        const session = sessionRef.current;
        if (!session) return;
        sessionRef.current = null;

        try {
            if (session.handleEl.hasPointerCapture(session.pointerId)) {
                session.handleEl.releasePointerCapture(session.pointerId);
            }
        } catch {
            // ignore
        }

        if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }

        // Handle final pointerup coordinates
        const dx = e.clientX - session.startX;
        const dy = e.clientY - session.startY;
        const finalFrame = resizeFrame(
            session.startFrame,
            session.direction,
            dx,
            dy,
            rect,
            win.kind,
        );

        const winEl = windowRef.current ??
            (session.handleEl.closest(".desktop-window") as HTMLElement | null);
        if (winEl) {
            winEl.style.transform =
                `translate3d(${finalFrame.x}px, ${finalFrame.y}px, 0)`;
            winEl.style.width = `${finalFrame.width}px`;
            winEl.style.height = `${finalFrame.height}px`;
        }

        dispatch({
            type: "RESIZE",
            id: win.id,
            frame: finalFrame,
            rect,
        });
    };

    const handlePointerCancel = () => {
        const session = sessionRef.current;
        if (!session) return;
        sessionRef.current = null;

        try {
            if (session.handleEl.hasPointerCapture(session.pointerId)) {
                session.handleEl.releasePointerCapture(session.pointerId);
            }
        } catch {
            // ignore
        }

        if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }

        // Cancel commits last frame
        const frameToCommit = clampFrame(session.currentFrame, rect, win.kind);

        const winEl = windowRef.current ??
            (session.handleEl.closest(".desktop-window") as HTMLElement | null);
        if (winEl) {
            winEl.style.transform =
                `translate3d(${frameToCommit.x}px, ${frameToCommit.y}px, 0)`;
            winEl.style.width = `${frameToCommit.width}px`;
            winEl.style.height = `${frameToCommit.height}px`;
        }

        dispatch({
            type: "RESIZE",
            id: win.id,
            frame: frameToCommit,
            rect,
        });
    };

    // Keyboard geometry accessible
    const handleKeyDown = (
        direction: ResizeDirection,
        e: KeyboardEvent<HTMLDivElement>,
    ) => {
        const step = e.shiftKey ? 40 : 10;
        let dx = 0;
        let dy = 0;

        switch (e.key) {
            case "ArrowLeft":
                if (direction.includes("w")) dx = -step;
                else if (direction.includes("e")) dx = -step;
                break;
            case "ArrowRight":
                if (direction.includes("e")) dx = step;
                else if (direction.includes("w")) dx = step;
                break;
            case "ArrowUp":
                if (direction.includes("n")) dy = -step;
                else if (direction.includes("s")) dy = -step;
                break;
            case "ArrowDown":
                if (direction.includes("s")) dy = step;
                else if (direction.includes("n")) dy = step;
                break;
            default:
                return;
        }

        e.preventDefault();
        e.stopPropagation();

        if (!active) {
            dispatch({ type: "FOCUS", id: win.id });
        }

        const nextFrame = resizeFrame(
            win.frame,
            direction,
            dx,
            dy,
            rect,
            win.kind,
        );

        dispatch({
            type: "RESIZE",
            id: win.id,
            frame: nextFrame,
            rect,
        });
    };

    // Only allow resize on viewports >= 1024px and non-maximized/non-minimized windows
    if (
        disabled || !isDesktop || win.mode === "maximized" ||
        win.mode === "minimized"
    ) {
        return null;
    }

    return (
        <div
            className="desktop-window-resize-handles"
            data-resize-handles
            aria-hidden={false}
        >
            {RESIZE_DIRECTIONS.map((dir) => (
                <div
                    key={dir}
                    data-direction={dir}
                    role="separator"
                    tabIndex={0}
                    aria-label={DIRECTION_LABELS[dir]}
                    aria-orientation={dir === "n" || dir === "s"
                        ? "horizontal"
                        : "vertical"}
                    className={`desktop-window-resize-handle desktop-window-resize-handle--${dir}`}
                    onPointerDown={(e) => handlePointerDown(dir, e)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onLostPointerCapture={handlePointerCancel}
                    onKeyDown={(e) => handleKeyDown(dir, e)}
                />
            ))}
        </div>
    );
}
