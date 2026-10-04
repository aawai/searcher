import {
    type Dispatch,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type RefObject,
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
    disableDrag?: boolean;
    disableResize?: boolean;
    showMinimize?: boolean;
    showMaximize?: boolean;
    closeLabel?: string;
    backLabel?: string;
    onClose?: () => void;
    onBack?: () => void;
    leading?: ReactNode;
    headerMenu?: ReactNode;
    closeBtnRef?: RefObject<HTMLButtonElement | null>;
    backBtnRef?: RefObject<HTMLButtonElement | null>;
    showWindowMenu?: boolean;
}
export function DesktopWindow({
    window: win,
    rect,
    active,
    dispatch,
    children,
    title,
    className,
    disableDrag,
    disableResize,
    showMinimize,
    showMaximize,
    closeLabel,
    backLabel,
    onClose,
    onBack,
    leading,
    headerMenu,
    closeBtnRef,
    backBtnRef,
    showWindowMenu,
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
    const isSnapped = win.mode === "snapped";

    const classNames = [
        "desktop-window",
        active ? "desktop-window--active" : "",
        isMaximized ? "desktop-window--maximized" : "",
        isMinimized ? "desktop-window--minimized" : "",
        isSnapped ? "desktop-window--snapped" : "",
        isSnapped && win.snap ? `desktop-window--snapped-${win.snap}` : "",
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
            data-window-snap={win.snap ?? undefined}
            data-presentation="window"
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
                disableDrag={disableDrag}
                showMinimize={showMinimize}
                showMaximize={showMaximize}
                closeLabel={closeLabel}
                backLabel={backLabel}
                onClose={onClose}
                onBack={onBack}
                leading={leading}
                headerMenu={headerMenu}
                closeBtnRef={closeBtnRef}
                backBtnRef={backBtnRef}
                showWindowMenu={showWindowMenu}
            />

            <div className="desktop-window-content">
                {children}
            </div>

            {!disableResize && !isMaximized && !isMinimized && !isSnapped && (
                <WindowResizeHandles
                    window={win}
                    rect={rect}
                    active={active}
                    dispatch={dispatch}
                    windowRef={windowRef}
                    disabled={disableResize}
                />
            )}
        </div>
    );
}
