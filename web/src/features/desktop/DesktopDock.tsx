import { forwardRef, useEffect, useState } from "react";
import { Folder, LayoutGrid, StickyNote } from "lucide-react";
import type { WindowPreview } from "./DesktopOverview.tsx";
import { Button } from "../../components/ui/button.tsx";
import type { DesktopState } from "./desktop-state.ts";
import type { WorkspaceKind } from "../workspace/workspace-state.ts";
import "./desktop.css";

export interface DesktopDockProps {
    state: DesktopState;
    onOpen: (kind: WorkspaceKind) => void;
    className?: string;
    runningNotes?: WindowPreview[];
    onSelectWindow?: (id: string) => void;
    onOverview?: () => void;
    overviewOpen?: boolean;
}

const WORKSPACE_ITEMS: readonly {
    kind: WorkspaceKind;
    label: string;
    ariaLabel: string;
}[] = [
    { kind: "apps", label: "应用", ariaLabel: "应用工作区" },
    { kind: "notes", label: "便签", ariaLabel: "便签工作区" },
];

export const DesktopDock = forwardRef<HTMLElement, DesktopDockProps>(
    function DesktopDock(
        {
            state,
            onOpen,
            className,
            runningNotes = [],
            onSelectWindow,
            onOverview,
            overviewOpen,
        },
        ref,
    ) {
        const [isDesktopOrTablet, setIsDesktopOrTablet] = useState(() => {
            if (typeof globalThis.window === "undefined") return true;
            return globalThis.innerWidth >= 768;
        });

        useEffect(() => {
            if (typeof globalThis.window === "undefined") return;
            const handleResize = () => {
                setIsDesktopOrTablet(globalThis.innerWidth >= 768);
            };
            globalThis.addEventListener("resize", handleResize);
            return () => globalThis.removeEventListener("resize", handleResize);
        }, []);

        if (!isDesktopOrTablet) {
            return null;
        }

        return (
            <nav
                ref={ref}
                className={["desktop-dock", className ?? ""].filter(Boolean)
                    .join(" ")}
                aria-label="桌面工作区导航"
            >
                {WORKSPACE_ITEMS.map((item) => {
                    const win = state.windows.find(
                        (w) => w.kind === item.kind || w.id === item.kind,
                    );
                    const isOpen = Boolean(win);
                    const isMinimized = win?.mode === "minimized";
                    const isActive = Boolean(
                        win && state.activeId === win.id && !isMinimized,
                    );

                    const stateStr = isActive
                        ? "active"
                        : isMinimized
                        ? "minimized"
                        : isOpen
                        ? "open"
                        : "closed";

                    const itemClasses = [
                        "desktop-dock-item",
                        isActive ? "desktop-dock-item--active" : "",
                        isOpen ? "desktop-dock-item--open" : "",
                        isMinimized ? "desktop-dock-item--minimized" : "",
                    ].filter(Boolean).join(" ");

                    const indicatorClasses = [
                        "desktop-dock-indicator",
                        isActive ? "desktop-dock-indicator--active" : "",
                        isMinimized ? "desktop-dock-indicator--minimized" : "",
                    ].filter(Boolean).join(" ");

                    return (
                        <Button
                            key={item.kind}
                            variant="ghost"
                            className={itemClasses}
                            data-workspace={item.kind}
                            data-state={stateStr}
                            data-active={isActive ? "true" : "false"}
                            data-open={isOpen ? "true" : "false"}
                            data-minimized={isMinimized ? "true" : "false"}
                            aria-label={item.ariaLabel}
                            aria-pressed={isActive}
                            onClick={() => onOpen(item.kind)}
                        >
                            {item.kind === "apps"
                                ? <Folder size={18} />
                                : <StickyNote size={18} />}
                            <span>{item.label}</span>
                            {isOpen && (
                                <span
                                    className={indicatorClasses}
                                    aria-hidden="true"
                                />
                            )}
                        </Button>
                    );
                })}
                {onOverview && (
                    <Button
                        variant="ghost"
                        className="desktop-dock-item"
                        aria-label="窗口总览"
                        aria-pressed={overviewOpen}
                        onClick={onOverview}
                    >
                        <LayoutGrid size={18} />
                        <span>总览</span>
                    </Button>
                )}
                {runningNotes.length > 0 && (
                    <div
                        className="desktop-dock-running"
                        aria-label="打开的便签"
                    >
                        {runningNotes.map((note) => (
                            <Button
                                key={note.id}
                                variant="ghost"
                                className="desktop-dock-item desktop-dock-note"
                                data-running-note={note.id}
                                aria-label={`便签窗口：${note.title}`}
                                title={note.title}
                                aria-pressed={state.activeId === note.id &&
                                    !note.minimized}
                                onClick={() => onSelectWindow?.(note.id)}
                            >
                                <StickyNote size={18} />
                                <span className="desktop-dock-note-title">
                                    {note.title}
                                </span>
                                <span
                                    className="desktop-dock-indicator"
                                    aria-hidden="true"
                                />
                            </Button>
                        ))}
                    </div>
                )}
            </nav>
        );
    },
);
