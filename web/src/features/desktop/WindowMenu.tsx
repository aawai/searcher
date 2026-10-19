import { type Dispatch, useEffect, useState } from "react";
import {
    LayoutGrid,
    Maximize2,
    Minimize2,
    Minus,
    MoreHorizontal,
    PanelLeft,
    PanelRight,
    X,
} from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import type { DesktopGeometry, SnapMode } from "./desktop-geometry.ts";
import type { DesktopAction, DesktopWindowState } from "./desktop-state.ts";
import { DESKTOP_SHORTCUTS } from "./desktop-shortcuts.ts";

export interface WindowMenuProps {
    window: DesktopWindowState;
    rect: DesktopGeometry;
    dispatch: Dispatch<DesktopAction>;
    onClose?: () => void;
    onOverview?: () => void;
    showMinimize?: boolean;
    showMaximize?: boolean;
    disabled?: boolean;
    closeLabel?: string;
    className?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function WindowMenu({
    window: win,
    rect,
    dispatch,
    onClose,
    onOverview,
    showMinimize = true,
    showMaximize = true,
    disabled = false,
    closeLabel = "关闭",
    className,
    open,
    onOpenChange,
}: WindowMenuProps) {
    const [internalOpen, setInternalOpen] = useState(false);
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

    const isControlled = open !== undefined;
    const isOpen = isControlled ? open : internalOpen;

    const handleOpenChange = (nextOpen: boolean) => {
        if (!isControlled) {
            setInternalOpen(nextOpen);
        }
        onOpenChange?.(nextOpen);
    };

    const handleRestore = () => {
        handleOpenChange(false);
        if (!rect.usable) return;
        dispatch({ type: "RESTORE", id: win.id, rect });
    };

    const handleMinimize = () => {
        handleOpenChange(false);
        dispatch({ type: "MINIMIZE", id: win.id });
    };

    const handleMaximize = () => {
        handleOpenChange(false);
        if (!rect.usable) return;
        dispatch({ type: "MAXIMIZE", id: win.id, rect });
    };

    const handleSnap = (snap: SnapMode) => {
        handleOpenChange(false);
        if (!rect.usable) return;
        dispatch({ type: "SNAP", id: win.id, snap, rect });
    };

    const handleClose = () => {
        handleOpenChange(false);
        if (onClose) {
            onClose();
        } else {
            dispatch({ type: "CLOSE", id: win.id });
        }
    };
    const handleOverview = () => {
        handleOpenChange(false);
        onOverview?.();
    };

    const isMaximized = win.mode === "maximized";
    const isNormal = win.mode === "normal";

    return (
        <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
            <DropdownMenuTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled}
                        data-slot="window-menu-trigger"
                        data-testid="window-menu-trigger"
                        className={[
                            "desktop-window-chrome-btn",
                            "desktop-window-chrome-btn--window-menu",
                            "desktop-window-menu-trigger",
                            className ?? "",
                        ].filter(Boolean).join(" ")}
                        aria-label="窗口系统菜单"
                        aria-keyshortcuts={DESKTOP_SHORTCUTS.menu.aria}
                        title={`窗口系统菜单（${DESKTOP_SHORTCUTS.menu.label}）`}
                    >
                        <MoreHorizontal className="desktop-window-chrome-icon h-4 w-4" />
                    </Button>
                }
            />

            <DropdownMenuContent
                sideOffset={4}
                data-testid="window-menu-content"
                className="desktop-window-menu-content w-44"
            >
                {/* 还原 (Restore) */}
                <DropdownMenuItem
                    disabled={isNormal || disabled || !rect.usable}
                    onClick={handleRestore}
                    data-action="restore"
                    data-testid="window-menu-item-restore"
                    className="desktop-window-menu-item flex items-center gap-2 cursor-pointer"
                >
                    <Minimize2 className="desktop-window-menu-item-icon h-4 w-4 shrink-0 opacity-70" />
                    <span>还原</span>
                </DropdownMenuItem>

                {/* 最小化 (Minimize) */}
                {showMinimize && (
                    <DropdownMenuItem
                        disabled={disabled}
                        onClick={handleMinimize}
                        data-action="minimize"
                        data-testid="window-menu-item-minimize"
                        className="desktop-window-menu-item flex items-center gap-2 cursor-pointer"
                    >
                        <Minus className="desktop-window-menu-item-icon h-4 w-4 shrink-0 opacity-70" />
                        <span>最小化</span>
                    </DropdownMenuItem>
                )}

                {/* 最大化 (Maximize) */}
                {showMaximize && (
                    <DropdownMenuItem
                        disabled={isMaximized || disabled || !rect.usable}
                        onClick={handleMaximize}
                        data-action="maximize"
                        data-testid="window-menu-item-maximize"
                        className="desktop-window-menu-item flex items-center gap-2 cursor-pointer"
                    >
                        <Maximize2 className="desktop-window-menu-item-icon h-4 w-4 shrink-0 opacity-70" />
                        <span>最大化</span>
                    </DropdownMenuItem>
                )}

                {isDesktop && onOverview && (
                    <DropdownMenuItem
                        onClick={handleOverview}
                        data-action="overview"
                        data-testid="window-menu-item-overview"
                        aria-keyshortcuts={DESKTOP_SHORTCUTS.overview.aria}
                        className="desktop-window-menu-item flex items-center gap-2 cursor-pointer"
                    >
                        <LayoutGrid className="desktop-window-menu-item-icon h-4 w-4 shrink-0 opacity-70" />
                        <span>窗口总览</span>
                        <kbd className="ml-auto" aria-hidden="true">
                            {DESKTOP_SHORTCUTS.overview.label}
                        </kbd>
                    </DropdownMenuItem>
                )}
                {/* 桌面分屏 (Desktop Snap) - Tablet禁用或仅桌面展示 */}
                {isDesktop && !disabled && rect.usable && (
                    <>
                        <DropdownMenuItem
                            onClick={() => handleSnap("left")}
                            data-action="snap-left"
                            data-testid="window-menu-item-snap-left"
                            aria-keyshortcuts={DESKTOP_SHORTCUTS.snapLeft.aria}
                            className="desktop-window-menu-item flex items-center gap-2 cursor-pointer"
                        >
                            <PanelLeft className="desktop-window-menu-item-icon h-4 w-4 shrink-0 opacity-70" />
                            <span>靠左分屏</span>
                            <kbd className="ml-auto" aria-hidden="true">
                                {DESKTOP_SHORTCUTS.snapLeft.label}
                            </kbd>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                            onClick={() => handleSnap("right")}
                            data-action="snap-right"
                            data-testid="window-menu-item-snap-right"
                            aria-keyshortcuts={DESKTOP_SHORTCUTS.snapRight.aria}
                            className="desktop-window-menu-item flex items-center gap-2 cursor-pointer"
                        >
                            <PanelRight className="desktop-window-menu-item-icon h-4 w-4 shrink-0 opacity-70" />
                            <span>靠右分屏</span>
                            <kbd className="ml-auto" aria-hidden="true">
                                {DESKTOP_SHORTCUTS.snapRight.label}
                            </kbd>
                        </DropdownMenuItem>
                    </>
                )}

                {/* 关闭 (Close) - 复用 onClose 保护业务 dirty 状态 */}
                <DropdownMenuItem
                    onClick={handleClose}
                    data-action="close"
                    data-testid="window-menu-item-close"
                    className="desktop-window-menu-item flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                >
                    <X className="desktop-window-menu-item-icon h-4 w-4 shrink-0" />
                    <span>{closeLabel}</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
