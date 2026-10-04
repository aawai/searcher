import {
    type Dispatch,
    type KeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type RefObject,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Maximize2, Minimize2, Minus, X } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import type { Frame, SafeRect, SnapMode } from "./desktop-geometry.ts";
import {
    clampFrame,
    defaultFrame,
    snapFrame,
    snapTarget,
} from "./desktop-geometry.ts";
import type { DesktopAction, DesktopWindowState } from "./desktop-state.ts";
import { WindowMenu } from "./WindowMenu.tsx";

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
    showWindowMenu?: boolean;
}

interface DragSession {
    startX: number;
    startY: number;
    startFrame: Frame;
    currentFrame: Frame;
    pointerId: number;
    chromeEl: HTMLElement;
    isInitialSnapped: boolean;
    hasMoved: boolean;
    restoreFrame: Frame | null;
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
    showWindowMenu,
}: WindowChromeProps) {
    const dragSessionRef = useRef<DragSession | null>(null);
    const rafIdRef = useRef<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [activeSnapMode, setActiveSnapMode] = useState<SnapMode | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);

    const [isDesktop, setIsDesktop] = useState(() => {
        if (typeof globalThis.window === "undefined") return true;
        return globalThis.innerWidth >= 1024;
    });

    useEffect(() => {
        if (typeof globalThis.matchMedia !== "function") return;
        const mq = globalThis.matchMedia("(min-width: 1024px)");
        const handler = (e: MediaQueryListEvent) => {
            setIsDesktop(e.matches);
        };
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);

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

    // Ensure DOM style stays synchronized with semantic win.frame whenever not dragging
    useLayoutEffect(() => {
        if (!isDragging && windowRef.current) {
            windowRef.current.style.transform =
                `translate3d(${win.frame.x}px, ${win.frame.y}px, 0)`;
            windowRef.current.style.width = `${win.frame.width}px`;
            windowRef.current.style.height = `${win.frame.height}px`;
        }
    }, [
        isDragging,
        win.frame.x,
        win.frame.y,
        win.frame.width,
        win.frame.height,
    ]);
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

        // Drag-disabled window titlebar does not drag; normal, snapped, and maximized are draggable
        if (disableDrag) return;

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
            isInitialSnapped: win.mode === "snapped" ||
                win.mode === "maximized",
            hasMoved: false,
            restoreFrame: win.restoreFrame ? { ...win.restoreFrame } : null,
        };
        setIsDragging(true);
    };

    const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const session = dragSessionRef.current;
        if (!session) return;

        const dx = e.clientX - session.startX;
        const dy = e.clientY - session.startY;

        // Threshold check to avoid changing state on click without move
        if (!session.hasMoved) {
            if (Math.hypot(dx, dy) < 4) {
                return;
            }
            session.hasMoved = true;
        }

        let clamped: Frame;
        if (session.isInitialSnapped) {
            // 拖拽 snapped 恢复原 frame 并正确保存 restoreFrame
            const fallbackFrame = defaultFrame(win.kind, rect);
            const restoredWidth = session.restoreFrame?.width ??
                fallbackFrame.width;
            const restoredHeight = session.restoreFrame?.height ??
                fallbackFrame.height;
            const grabOffsetX = session.startX -
                (session.startFrame.x + rect.x);
            const ratio = session.startFrame.width > 0
                ? grabOffsetX / session.startFrame.width
                : 0.5;

            const restoredGrabOffsetX = Math.min(
                Math.max(restoredWidth * ratio, 24),
                Math.max(24, restoredWidth - 24),
            );
            const restoredGrabOffsetY = Math.min(
                session.startY - (session.startFrame.y + rect.y),
                32,
            );

            const candidate: Frame = {
                x: (session.startX - rect.x) - restoredGrabOffsetX + dx,
                y: (session.startY - rect.y) - restoredGrabOffsetY + dy,
                width: restoredWidth,
                height: restoredHeight,
            };
            clamped = clampFrame(candidate, rect, win.kind);
        } else {
            const candidate: Frame = {
                ...session.startFrame,
                x: session.startFrame.x + dx,
                y: session.startFrame.y + dy,
            };
            clamped = clampFrame(candidate, rect, win.kind);
        }
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
                winEl.style.width = `${clamped.width}px`;
                winEl.style.height = `${clamped.height}px`;
            }
        });

        // Edge drag preview SNAP (tablet 禁用 desktop snap)
        const targetSnap = (isDesktop && !disableDrag)
            ? snapTarget(e.clientX, e.clientY, rect)
            : null;
        setActiveSnapMode(targetSnap);
    };

    const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        const session = dragSessionRef.current;
        if (!session) return;
        dragSessionRef.current = null;
        setIsDragging(false);
        setActiveSnapMode(null);

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

        const winEl = windowRef.current ??
            (session.chromeEl.closest(".desktop-window") as HTMLElement | null);

        // 避免点击未移动改状态，恢复原 semantic frame DOM
        if (!session.hasMoved) {
            if (winEl) {
                winEl.style.transform =
                    `translate3d(${win.frame.x}px, ${win.frame.y}px, 0)`;
                winEl.style.width = `${win.frame.width}px`;
                winEl.style.height = `${win.frame.height}px`;
            }
            return;
        }

        // Calculate snap target from final release coordinates e.clientX, e.clientY
        const snapModeToCommit = (isDesktop && !disableDrag)
            ? snapTarget(e.clientX, e.clientY, rect)
            : null;

        // Release SNAP if targeting a snap zone
        if (snapModeToCommit && isDesktop && !disableDrag) {
            const snapToCommitFrame = snapFrame(snapModeToCommit, rect);
            if (winEl) {
                winEl.style.transform =
                    `translate3d(${snapToCommitFrame.x}px, ${snapToCommitFrame.y}px, 0)`;
                winEl.style.width = `${snapToCommitFrame.width}px`;
                winEl.style.height = `${snapToCommitFrame.height}px`;
            }
            dispatch({
                type: "SNAP",
                id: win.id,
                snap: snapModeToCommit,
                rect,
            });
            return;
        }

        // Commit normal move with the final clamped frame
        const finalClamped = clampFrame(session.currentFrame, rect, win.kind);
        if (winEl) {
            winEl.style.transform =
                `translate3d(${finalClamped.x}px, ${finalClamped.y}px, 0)`;
            winEl.style.width = `${finalClamped.width}px`;
            winEl.style.height = `${finalClamped.height}px`;
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
        setActiveSnapMode(null);

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

        const winEl = windowRef.current ??
            (session.chromeEl.closest(".desktop-window") as HTMLElement | null);

        // 避免点击未移动改状态
        if (!session.hasMoved) {
            if (winEl) {
                winEl.style.transform =
                    `translate3d(${win.frame.x}px, ${win.frame.y}px, 0)`;
                winEl.style.width = `${win.frame.width}px`;
                winEl.style.height = `${win.frame.height}px`;
            }
            return;
        }

        // Cancel commits last frame
        const frameToCommit = clampFrame(session.currentFrame, rect, win.kind);
        if (winEl) {
            winEl.style.transform =
                `translate3d(${frameToCommit.x}px, ${frameToCommit.y}px, 0)`;
            winEl.style.width = `${frameToCommit.width}px`;
            winEl.style.height = `${frameToCommit.height}px`;
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
        } else if (win.mode === "snapped") {
            dispatch({ type: "MAXIMIZE", id: win.id, rect });
        } else {
            dispatch({ type: "MAXIMIZE", id: win.id, rect });
        }
    };

    // Keyboard geometry accessible & Alt+Space window menu
    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        // Alt+Space opens window system menu
        if (e.altKey && (e.code === "Space" || e.key === " ")) {
            e.preventDefault();
            e.stopPropagation();
            if (showWindowMenu !== false) {
                setMenuOpen((prev) => !prev);
            }
            return;
        }

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

    const isDraggable = !disableDrag;

    const portalTarget = windowRef.current?.closest(".desktop-canvas") ??
        windowRef.current?.parentElement ??
        (typeof document !== "undefined"
            ? document.querySelector(".desktop-canvas")
            : null);

    const snapPreviewFrame = activeSnapMode
        ? snapFrame(activeSnapMode, rect)
        : null;

    return (
        <>
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
                    {showWindowMenu !== false && (
                        <WindowMenu
                            window={win}
                            rect={rect}
                            dispatch={dispatch}
                            onClose={onClose}
                            showMinimize={showMinimize}
                            showMaximize={showMaximize}
                            disabled={disableDrag}
                            closeLabel={closeLabel}
                            open={menuOpen}
                            onOpenChange={setMenuOpen}
                        />
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
                        (win.mode === "maximized" || win.mode === "snapped")
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

            {/* Snap preview: portal to canvas or window sibling ensuring coordinates are relative to safeRect */}
            {isDragging && activeSnapMode && snapPreviewFrame && portalTarget &&
                createPortal(
                    <div
                        className={`desktop-snap-preview desktop-snap-preview--${activeSnapMode}`}
                        data-snap-preview
                        data-snap-mode={activeSnapMode}
                        aria-hidden="true"
                        style={{
                            transform:
                                `translate3d(${snapPreviewFrame.x}px, ${snapPreviewFrame.y}px, 0)`,
                            width: `${snapPreviewFrame.width}px`,
                            height: `${snapPreviewFrame.height}px`,
                        }}
                    />,
                    portalTarget,
                )}
        </>
    );
}
