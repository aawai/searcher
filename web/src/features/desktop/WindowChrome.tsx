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
import type { DesktopGeometry, Frame, SnapMode } from "./desktop-geometry.ts";
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
    presentationFrame: Frame;
    rect: DesktopGeometry;
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

type CollisionEdge = "left" | "right" | "top" | "bottom";
const COLLISION_DURATION_MS = 140;

interface DragSession {
    startX: number;
    startY: number;
    previousX: number;
    previousY: number;
    startFrame: Frame;
    currentFrame: Frame;
    pointerId: number;
    chromeEl: HTMLElement;
    isInitialSnapped: boolean;
    hasMoved: boolean;
    restoreFrame: Frame | null;
    blockedX: CollisionEdge | null;
    blockedY: CollisionEdge | null;
}

export function WindowChrome({
    window: win,
    title,
    presentationFrame,
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
    const [collision, setCollision] = useState<
        { edge: CollisionEdge; sequence: number } | null
    >(null);
    const collisionSequenceRef = useRef(0);
    const collisionTimerRef = useRef<number | null>(null);

    const clearCollision = (updateState = true) => {
        if (collisionTimerRef.current !== null) {
            clearTimeout(collisionTimerRef.current);
            collisionTimerRef.current = null;
        }
        if (updateState) setCollision(null);
    };

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

    const finishDrag = (updateState = true) => {
        const session = dragSessionRef.current;
        dragSessionRef.current = null;
        clearCollision(updateState);
        if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }
        if (session?.chromeEl.hasPointerCapture(session.pointerId)) {
            try {
                session.chromeEl.releasePointerCapture(session.pointerId);
            } catch {
                // The browser may already have ended this pointer.
            }
        }
        if (updateState) {
            setIsDragging(false);
            setActiveSnapMode(null);
        }
        return session;
    };

    useEffect(() => () => {
        finishDrag(false);
    }, []);

    // Safe/default placement changes do not invalidate normal drag bounds.
    const restoreFallback = !win.restoreFrame &&
            (win.mode === "snapped" || win.mode === "maximized")
        ? defaultFrame(win.kind, rect)
        : null;
    useEffect(() => {
        if (dragSessionRef.current) handlePointerCancel();
    }, [
        rect.viewportRect.width,
        rect.viewportRect.height,
        rect.chromeBottom,
        rect.dockTop,
        rect.chromeHeight,
        rect.usable,
        rect.workRect.x,
        rect.workRect.y,
        rect.workRect.width,
        rect.workRect.height,
        restoreFallback?.width,
        restoreFallback?.height,
    ]);

    useEffect(() => {
        if (disableDrag || win.mode === "minimized") finishDrag();
    }, [disableDrag, win.mode]);

    // Keep transient DOM geometry aligned with the rendered presentation frame.
    useLayoutEffect(() => {
        if (!isDragging && windowRef.current) {
            windowRef.current.style.transform =
                `translate3d(${presentationFrame.x}px, ${presentationFrame.y}px, 0)`;
            windowRef.current.style.width = `${presentationFrame.width}px`;
            windowRef.current.style.height = `${presentationFrame.height}px`;
        }
    }, [
        isDragging,
        presentationFrame.x,
        presentationFrame.y,
        presentationFrame.width,
        presentationFrame.height,
    ]);
    const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        // Portal events bubble through React ancestors, not the titlebar DOM.
        if (!e.currentTarget.contains(e.target as Node)) return;
        // Only primary mouse/pointer button
        if (e.button !== 0) return;
        if (dragSessionRef.current) return;

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
        if (disableDrag || !rect.usable) return;

        // Focus on start allowed
        if (!active) {
            dispatch({ type: "FOCUS", id: win.id });
        }

        const chromeEl = e.currentTarget;
        const pointerId = e.pointerId;
        try {
            chromeEl.setPointerCapture(pointerId);
            if (!chromeEl.hasPointerCapture(pointerId)) return;
        } catch {
            return;
        }

        dragSessionRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            previousX: e.clientX,
            previousY: e.clientY,
            startFrame: { ...presentationFrame },
            currentFrame: { ...presentationFrame },
            pointerId,
            chromeEl,
            isInitialSnapped: win.mode === "snapped" ||
                win.mode === "maximized",
            hasMoved: false,
            restoreFrame: win.restoreFrame ? { ...win.restoreFrame } : null,
            blockedX: null,
            blockedY: null,
        };
        setIsDragging(true);
    };

    const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const session = dragSessionRef.current;
        if (!session || e.pointerId !== session.pointerId) return;
        if (!rect.usable) {
            handlePointerCancel();
            return;
        }

        const wasMoving = session.hasMoved;
        const dx = e.clientX - (wasMoving ? session.previousX : session.startX);
        const dy = e.clientY - (wasMoving ? session.previousY : session.startY);

        // Activation uses the full initial displacement; subsequent events
        // integrate from the latest legal frame, discarding boundary overrun.
        if (!wasMoving) {
            if (Math.hypot(dx, dy) < 4) {
                return;
            }
            session.hasMoved = true;
        }

        let candidate: Frame;
        if (session.isInitialSnapped && !wasMoving) {
            // 拖拽 snapped 恢复原 frame 并正确保存 restoreFrame
            const restored = session.restoreFrame ??
                defaultFrame(win.kind, rect);
            const restorePresentation = clampFrame(restored, rect, win.kind);
            const restoredWidth = restorePresentation.width;
            const restoredHeight = restorePresentation.height;
            const grabOffsetX = session.startX - session.startFrame.x;
            const ratio = session.startFrame.width > 0
                ? grabOffsetX / session.startFrame.width
                : 0.5;

            const restoredGrabOffsetX = Math.min(
                Math.max(restoredWidth * ratio, 24),
                Math.max(24, restoredWidth - 24),
            );
            const restoredGrabOffsetY = Math.min(
                session.startY - session.startFrame.y,
                32,
            );

            candidate = {
                x: session.startX - restoredGrabOffsetX + dx,
                y: session.startY - restoredGrabOffsetY + dy,
                width: restoredWidth,
                height: restoredHeight,
            };
        } else {
            const base = wasMoving ? session.currentFrame : session.startFrame;
            candidate = {
                ...base,
                x: base.x + dx,
                y: base.y + dy,
            };
        }
        const clamped = clampFrame(candidate, rect, win.kind);
        session.currentFrame = clamped;
        session.previousX = e.clientX;
        session.previousY = e.clientY;

        // Transient transform via rAF
        if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
        }
        rafIdRef.current = requestAnimationFrame(() => {
            rafIdRef.current = null;
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
            ? snapTarget(e.clientX, e.clientY, rect.workRect)
            : null;
        setActiveSnapMode(targetSnap);

        let blockedX: CollisionEdge | null = null;
        let blockedY: CollisionEdge | null = null;
        if (candidate.x < clamped.x) blockedX = "left";
        else if (candidate.x > clamped.x) blockedX = "right";
        else if (dx === 0) blockedX = session.blockedX;
        if (candidate.y < clamped.y) blockedY = "top";
        else if (candidate.y > clamped.y) blockedY = "bottom";
        else if (dy === 0) blockedY = session.blockedY;

        // One pulse per newly contacted edge; X wins simultaneous collisions.
        let edge: CollisionEdge | null = null;
        if (blockedX && blockedX !== session.blockedX) edge = blockedX;
        else if (blockedY && blockedY !== session.blockedY) edge = blockedY;
        session.blockedX = blockedX;
        session.blockedY = blockedY;
        if (targetSnap) {
            clearCollision();
        } else if (edge) {
            clearCollision();
            setCollision({ edge, sequence: ++collisionSequenceRef.current });
            const view: Window = globalThis.window;
            collisionTimerRef.current = view.setTimeout(() => {
                collisionTimerRef.current = null;
                setCollision(null);
            }, COLLISION_DURATION_MS);
        }
    };

    const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        const pending = dragSessionRef.current;
        if (!pending || e.pointerId !== pending.pointerId) return;
        const session = finishDrag();
        if (!session) return;

        const winEl = windowRef.current ??
            (session.chromeEl.closest(".desktop-window") as HTMLElement | null);

        if (!rect.usable) {
            if (winEl) {
                winEl.style.transform =
                    `translate3d(${presentationFrame.x}px, ${presentationFrame.y}px, 0)`;
                winEl.style.width = `${presentationFrame.width}px`;
                winEl.style.height = `${presentationFrame.height}px`;
            }
            return;
        }

        // Avoid changing semantic frame on a click without dragging.
        if (!session.hasMoved) {
            if (winEl) {
                winEl.style.transform =
                    `translate3d(${presentationFrame.x}px, ${presentationFrame.y}px, 0)`;
                winEl.style.width = `${presentationFrame.width}px`;
                winEl.style.height = `${presentationFrame.height}px`;
            }
            return;
        }

        // Calculate snap target from final release coordinates e.clientX, e.clientY
        const snapModeToCommit = (isDesktop && !disableDrag)
            ? snapTarget(e.clientX, e.clientY, rect.workRect)
            : null;

        // Release SNAP if targeting a snap zone
        if (snapModeToCommit && isDesktop && !disableDrag) {
            const snapToCommitFrame = snapFrame(
                snapModeToCommit,
                rect.workRect,
            );
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

    const handlePointerCancel = (e?: ReactPointerEvent<HTMLDivElement>) => {
        const pending = dragSessionRef.current;
        if (!pending || (e && e.pointerId !== pending.pointerId)) return;
        const session = finishDrag();
        if (!session) return;

        const winEl = windowRef.current ??
            (session.chromeEl.closest(".desktop-window") as HTMLElement | null);

        if (!rect.usable) {
            if (winEl) {
                winEl.style.transform =
                    `translate3d(${presentationFrame.x}px, ${presentationFrame.y}px, 0)`;
                winEl.style.width = `${presentationFrame.width}px`;
                winEl.style.height = `${presentationFrame.height}px`;
            }
            return;
        }

        // Avoid changing semantic frame on a click without dragging.
        if (!session.hasMoved) {
            if (winEl) {
                winEl.style.transform =
                    `translate3d(${presentationFrame.x}px, ${presentationFrame.y}px, 0)`;
                winEl.style.width = `${presentationFrame.width}px`;
                winEl.style.height = `${presentationFrame.height}px`;
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
        if (!e.currentTarget.contains(e.target as Node)) return;
        const target = e.target as HTMLElement | null;
        if (
            target?.closest(
                "button, input, textarea, select, a, [role='button'], [data-no-drag]",
            )
        ) {
            return;
        }
        if (disableDrag || showMaximize === false || !rect.usable) return;

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
        if (!e.currentTarget.contains(e.target as Node)) return;
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
        if (!rect.usable) return;

        e.preventDefault();
        if (!active) {
            dispatch({ type: "FOCUS", id: win.id });
        }

        const nextCandidate: Frame = {
            ...presentationFrame,
            x: presentationFrame.x + dx,
            y: presentationFrame.y + dy,
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
        ? snapFrame(activeSnapMode, rect.workRect)
        : null;

    return (
        <>
            {collision && isDragging && !activeSnapMode && (
                <div
                    key={collision.sequence}
                    aria-hidden="true"
                    className="desktop-window-collision"
                    data-collision-edge={collision.edge}
                />
            )}
            <div
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
                    <h2 className="desktop-window-chrome-title" title={title}>
                        {title}
                    </h2>
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
                                    disabled={!rect.usable}
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
                                    disabled={!rect.usable}
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
            </div>

            {/* Snap preview coordinates are viewport-global and match the committed Work Rect frame. */}
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
