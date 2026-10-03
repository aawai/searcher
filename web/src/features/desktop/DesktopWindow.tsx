import {
    type Dispatch,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    useRef,
} from "react";
import type { SafeRect } from "./desktop-geometry.ts";
import type { DesktopAction, DesktopWindowState } from "./desktop-state.ts";
import { WindowChrome } from "./WindowChrome.tsx";
import { WindowResizeHandles } from "./WindowResizeHandles.tsx";
import "./desktop.css";

export interface DesktopWindowProps {
    window: DesktopWindowState;
    rect: SafeRect;
    active: boolean;
    dispatch: Dispatch<DesktopAction>;
    children: ReactNode;
    title: string;
    className?: string;
}

export function DesktopWindow({
    window: win,
    rect,
    active,
    dispatch,
    children,
    title,
    className,
}: DesktopWindowProps) {
    const windowRef = useRef<HTMLDivElement | null>(null);

    // Nonmodal window pointer-events auto, focus dispatch without swallowing child events.
    const handlePointerDownCapture = (
        _e: ReactPointerEvent<HTMLDivElement>,
    ) => {
        if (!active) {
            dispatch({ type: "FOCUS", id: win.id });
        }
    };

    const isMinimized = win.mode === "minimized";
    const isMaximized = win.mode === "maximized";

    const classNames = [
        "desktop-window",
        active ? "desktop-window--active" : "",
        isMaximized ? "desktop-window--maximized" : "",
        isMinimized ? "desktop-window--minimized" : "",
        className ?? "",
    ].filter(Boolean).join(" ");

    return (
        <div
            ref={windowRef}
            id={`desktop-window-${win.id}`}
            role="region"
            aria-label={title}
            data-window-id={win.id}
            data-window-kind={win.kind}
            data-window-active={active}
            data-window-mode={win.mode}
            className={classNames}
            style={{
                transform: `translate3d(${win.frame.x}px, ${win.frame.y}px, 0)`,
                width: `${win.frame.width}px`,
                height: `${win.frame.height}px`,
                zIndex: win.zOrder,
            }}
            tabIndex={-1}
            onPointerDownCapture={handlePointerDownCapture}
        >
            <WindowChrome
                window={win}
                title={title}
                rect={rect}
                active={active}
                dispatch={dispatch}
                windowRef={windowRef}
            />

            <div className="desktop-window-content">
                {children}
            </div>

            {!isMaximized && !isMinimized && (
                <WindowResizeHandles
                    window={win}
                    rect={rect}
                    active={active}
                    dispatch={dispatch}
                    windowRef={windowRef}
                />
            )}
        </div>
    );
}
