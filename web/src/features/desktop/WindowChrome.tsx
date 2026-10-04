import {
    type Dispatch,
    type KeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type RefObject,
    useEffect,
    useRef,
    useState,
} from "react";
import { ArrowLeft, Maximize2, Minimize2, Minus, X } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import type { Frame, SafeRect } from "./desktop-geometry.ts";
import { clampFrame } from "./desktop-geometry.ts";
import type { DesktopAction, DesktopWindowState } from "./desktop-state.ts";

export interface WindowChromeProps {
    window: DesktopWindowState;
    title: string;
    rect: SafeRect;
    active: boolean;
    dispatch: Dispatch<DesktopAction>;
    windowRef: RefObject<HTMLDivElement | null>;
    className?: string;
    disableDrag?: boolean;
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
}

interface DragSession {
    startX: number;
    startY: number;
    startFrame: Frame;
    currentFrame: Frame;
    pointerId: number;
    chromeEl: HTMLElement;
}

export function WindowChrome({
    window: win,
    title,
    rect,
    active,
    dispatch,
    windowRef,
    className,
    disableDrag,
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
}: WindowChromeProps) {
    const dragSessionRef = useRef<DragSession | null>(null);
    const rafIdRef = useRef<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Cancel pending rAF and clean on unmount
    useEffect(() => {
        return () => {
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
        };
    }, []);

    // A safe-rect change cancels capture and commits the last transient frame.
    useEffect(() => {
        if (dragSessionRef.current) handlePointerCancel();
    }, [rect.width, rect.height, rect.x, rect.y]);

    const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        // Only primary mouse/pointer button
        if (e.button !== 0) return;

        // Only titlebar draggable excluding button/input/etc.
        const target = e.target as HTMLElement | null;
        if (
            target?.closest(
                "button, input, textarea, select, a, [role='button'], [data-no-drag]",
            )
        ) {
            return;
        }

        // Maximized or drag-disabled window titlebar does not drag
        if (disableDrag || win.mode === "maximized") return;

        // Focus on start allowed
        if (!active) {
            dispatch({ type: "FOCUS", id: win.id });
        }

        const chromeEl = e.currentTarget;
        const pointerId = e.pointerId;
        try {
            chromeEl.setPointerCapture(pointerId);
        } catch {
            // ignore
        }

        dragSessionRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startFrame: { ...win.frame },
            currentFrame: { ...win.frame },
            pointerId,
            chromeEl,
        };
        setIsDragging(true);
    };

    const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const session = dragSessionRef.current;
        if (!session) return;

        const dx = e.clientX - session.startX;
        const dy = e.clientY - session.startY;

        const candidate: Frame = {
            ...session.startFrame,
            x: session.startFrame.x + dx,
            y: session.startFrame.y + dy,
        };
        const clamped = clampFrame(candidate, rect, win.kind);
        session.currentFrame = clamped;

        // Transient transform via rAF
        if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
        }
        rafIdRef.current = requestAnimationFrame(() => {
            const winEl = windowRef.current ??
                (session.chromeEl.closest(".desktop-window") as
                    | HTMLElement
                    | null);
            if (winEl) {
                winEl.style.transform =
                    `translate3d(${clamped.x}px, ${clamped.y}px, 0)`;
            }
        });
    };

    const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        const session = dragSessionRef.current;
        if (!session) return;
        dragSessionRef.current = null;
        setIsDragging(false);

        try {
            if (session.chromeEl.hasPointerCapture(session.pointerId)) {
                session.chromeEl.releasePointerCapture(session.pointerId);
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
        const finalCandidate: Frame = {
            ...session.startFrame,
            x: session.startFrame.x + dx,
            y: session.startFrame.y + dy,
        };
        const finalClamped = clampFrame(finalCandidate, rect, win.kind);

        const winEl = windowRef.current ??
            (session.chromeEl.closest(".desktop-window") as HTMLElement | null);
        if (winEl) {
            winEl.style.transform =
                `translate3d(${finalClamped.x}px, ${finalClamped.y}px, 0)`;
        }

        dispatch({
            type: "MOVE",
            id: win.id,
            frame: finalClamped,
            rect,
        });
    };

    const handlePointerCancel = () => {
        const session = dragSessionRef.current;
        if (!session) return;
        dragSessionRef.current = null;
        setIsDragging(false);

        try {
            if (session.chromeEl.hasPointerCapture(session.pointerId)) {
                session.chromeEl.releasePointerCapture(session.pointerId);
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
            (session.chromeEl.closest(".desktop-window") as HTMLElement | null);
        if (winEl) {
            winEl.style.transform =
                `translate3d(${frameToCommit.x}px, ${frameToCommit.y}px, 0)`;
        }

        dispatch({
            type: "MOVE",
            id: win.id,
            frame: frameToCommit,
            rect,
        });
    };

    const handleDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement | null;
        if (
            target?.closest(
                "button, input, textarea, select, a, [role='button'], [data-no-drag]",
            )
        ) {
            return;
        }
        if (disableDrag || showMaximize === false) return;

        if (win.mode === "maximized") {
            dispatch({ type: "RESTORE", id: win.id, rect });
        } else {
            dispatch({ type: "MAXIMIZE", id: win.id, rect });
        }
    };

    // Keyboard geometry accessible
    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        // Only move if chrome itself or title has focus, not controls/inputs
        const target = e.target as HTMLElement | null;
        if (
            target?.closest("button, input, textarea, select, [role='button']")
        ) {
            return;
        }

        if (disableDrag) return;

        const step = e.shiftKey ? 40 : 10;
        let dx = 0;
        let dy = 0;

        switch (e.key) {
            case "ArrowLeft":
                dx = -step;
                break;
            case "ArrowRight":
                dx = step;
                break;
            case "ArrowUp":
                dy = -step;
                break;
            case "ArrowDown":
                dy = step;
                break;
            default:
                return;
        }

        e.preventDefault();
        if (!active) {
            dispatch({ type: "FOCUS", id: win.id });
        }

        const nextCandidate: Frame = {
            ...win.frame,
            x: win.frame.x + dx,
            y: win.frame.y + dy,
        };
        const clamped = clampFrame(nextCandidate, rect, win.kind);

        dispatch({
            type: "MOVE",
            id: win.id,
            frame: clamped,
            rect,
        });
    };

    const isDraggable = !disableDrag && win.mode !== "maximized";
    return (
        <header
            role="toolbar"
            tabIndex={0}
            aria-label={`窗口标题栏：${title}`}
            data-window-chrome
            className={[
                "desktop-window-chrome",
                isDraggable ? "desktop-window-chrome--draggable" : "",
                isDragging ? "desktop-window-chrome--dragging" : "",
                className ?? "",
            ].filter(Boolean).join(" ")}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handlePointerCancel}
            onDoubleClick={handleDoubleClick}
            onKeyDown={handleKeyDown}
        >
            <div className="desktop-window-chrome-leading">
                {onBack && (
                    <Button
                        ref={backBtnRef}
                        variant="ghost"
                        size="icon"
                        className="desktop-window-chrome-btn desktop-window-chrome-btn--back"
                        aria-label={backLabel ?? "返回上一级"}
                        title={backLabel ?? "返回上一级"}
                        onClick={(e) => {
                            e.stopPropagation();
                            onBack();
                        }}
                    >
                        <ArrowLeft className="desktop-window-chrome-icon" />
                    </Button>
                )}
                {leading}
            </div>

            <div className="desktop-window-chrome-title-wrap">
                <span className="desktop-window-chrome-title" title={title}>
                    {title}
                </span>
            </div>

            <div
                className="desktop-window-chrome-controls"
                data-no-drag
                onPointerDown={(e) => e.stopPropagation()}
            >
                {headerMenu}

                {showMinimize !== false && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="desktop-window-chrome-btn desktop-window-chrome-btn--minimize"
                        aria-label="最小化窗口"
                        title="最小化"
                        onClick={(e) => {
                            e.stopPropagation();
                            dispatch({ type: "MINIMIZE", id: win.id });
                        }}
                    >
                        <Minus className="desktop-window-chrome-icon" />
                    </Button>
                )}

                {showMaximize !== false && (
                    win.mode === "maximized"
                        ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="desktop-window-chrome-btn desktop-window-chrome-btn--restore"
                                aria-label="向下还原窗口"
                                title="向下还原"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    dispatch({
                                        type: "RESTORE",
                                        id: win.id,
                                        rect,
                                    });
                                }}
                            >
                                <Minimize2 className="desktop-window-chrome-icon" />
                            </Button>
                        )
                        : (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="desktop-window-chrome-btn desktop-window-chrome-btn--maximize"
                                aria-label="最大化窗口"
                                title="最大化"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    dispatch({
                                        type: "MAXIMIZE",
                                        id: win.id,
                                        rect,
                                    });
                                }}
                            >
                                <Maximize2 className="desktop-window-chrome-icon" />
                            </Button>
                        )
                )}

                <Button
                    ref={closeBtnRef}
                    variant="ghost"
                    size="icon"
                    className="desktop-window-chrome-btn desktop-window-chrome-btn--close"
                    aria-label={closeLabel ?? "关闭窗口"}
                    title={closeLabel ?? "关闭"}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onClose) {
                            onClose();
                        } else {
                            dispatch({ type: "CLOSE", id: win.id });
                        }
                    }}
                >
                    <X className="desktop-window-chrome-icon" />
                </Button>
            </div>
        </header>
    );
}
