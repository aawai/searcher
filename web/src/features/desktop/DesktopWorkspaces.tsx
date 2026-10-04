import {
    type Dispatch,
    type ReactNode,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import { DesktopCanvas } from "./DesktopCanvas.tsx";
import { DesktopDock } from "./DesktopDock.tsx";
import { DesktopWindow } from "./DesktopWindow.tsx";
import {
    computeConstrainedFrame,
    CONSTRAINED_PRESET_LABELS,
    CONSTRAINED_PRESETS,
    type ConstrainedPreset,
} from "./constrained-geometry.ts";
import type { SafeRect } from "./desktop-geometry.ts";
import type {
    DesktopAction,
    DesktopState,
    DesktopWindowState,
} from "./desktop-state.ts";
import { getTopmostVisibleWindowId } from "./desktop-state.ts";
import type {
    WorkspaceKind,
    WorkspaceModel,
    WorkspaceState,
} from "../workspace/workspace-state.ts";
import { NoteEditor } from "../../components/searcher/NoteEditor.tsx";
import {
    getNoteDisplayTitle,
    type NoteItem,
} from "../../components/searcher/NoteCard.tsx";
import "./desktop.css";

export interface DesktopWorkspacesProps {
    state: DesktopState;
    rect: SafeRect;
    dispatch: Dispatch<DesktopAction>;
    models: Record<WorkspaceKind, WorkspaceModel>;
    renderContent: (kind: WorkspaceKind) => ReactNode;
    onOpen: (kind: WorkspaceKind) => void;
    onClose: (kind: WorkspaceKind) => void;
    onBack: (kind: WorkspaceKind) => void;
    onCreate: (kind: WorkspaceKind) => void;
    onDockElement: (el: HTMLElement | null) => void;
    appsArranging: boolean;
    notes: NoteItem[];
    onSaveNote: (note: NoteItem) => void;
    userId: string;
}

export function isWorkspaceKind(kind: string): kind is WorkspaceKind {
    return kind === "apps" || kind === "notes";
}

export function getWorkspaceTitle(
    kind: WorkspaceKind,
    route: WorkspaceState,
): string {
    switch (route.view) {
        case "apps/create":
            return "添加应用";
        case "apps/edit":
            return "编辑应用";
        case "notes/edit":
            return "编辑便签";
        default:
            return kind === "apps" ? "应用" : "便签";
    }
}

function ConstrainedSizeMenu({
    preset,
    onPresetChange,
}: {
    preset: ConstrainedPreset;
    onPresetChange: (preset: ConstrainedPreset) => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="desktop-window-chrome-btn desktop-window-chrome-btn--menu"
                        aria-label="窗口尺寸"
                        title="窗口尺寸"
                    >
                        <Maximize2 className="desktop-window-chrome-icon" />
                    </Button>
                }
            />
            <DropdownMenuContent sideOffset={4}>
                {CONSTRAINED_PRESETS.map((p) => (
                    <DropdownMenuItem
                        key={p}
                        data-active={preset === p}
                        onClick={() => onPresetChange(p)}
                    >
                        {CONSTRAINED_PRESET_LABELS[p]}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function DesktopWorkspaces({
    state,
    rect,
    dispatch,
    models,
    renderContent,
    onOpen,
    onClose,
    onBack,
    onCreate,
    onDockElement,
    appsArranging,
    notes,
    onSaveNote,
    userId,
}: DesktopWorkspacesProps) {
    const dockNavRef = useRef<HTMLElement | null>(null);

    const appsCloseRef = useRef<HTMLButtonElement | null>(null);
    const appsBackRef = useRef<HTMLButtonElement | null>(null);
    const notesCloseRef = useRef<HTMLButtonElement | null>(null);
    const notesBackRef = useRef<HTMLButtonElement | null>(null);

    const [preset, setPreset] = useState<ConstrainedPreset>("medium");

    const [isMobile, setIsMobile] = useState(() => {
        if (typeof globalThis.window === "undefined") return false;
        return globalThis.innerWidth < 768;
    });

    const [isConstrained, setIsConstrained] = useState(() => {
        if (typeof globalThis.window === "undefined") return false;
        return globalThis.innerWidth >= 768 && globalThis.innerWidth < 1024;
    });

    useEffect(() => {
        if (typeof globalThis.window === "undefined") return;
        const handleResize = () => {
            const w = globalThis.innerWidth;
            setIsMobile(w < 768);
            setIsConstrained(w >= 768 && w < 1024);
        };
        globalThis.addEventListener("resize", handleResize);
        return () => globalThis.removeEventListener("resize", handleResize);
    }, []);

    // Filter to workspace windows that exist in state and whose model is not closed
    const openWindows = state.windows.filter((w) => {
        if (isWorkspaceKind(w.kind)) {
            return models[w.kind]?.route.view !== "closed";
        }
        if (w.kind === "note") {
            return !isConstrained;
        }
        return false;
    });

    const appsOpen = models.apps.route.view !== "closed" &&
        state.windows.some((w) => w.kind === "apps" || w.id === "apps");
    const notesOpen = models.notes.route.view !== "closed" &&
        state.windows.some((w) => w.kind === "notes" || w.id === "notes");

    // Focus restoration to Dock on close: update refs unconditionally to prevent stale restoration
    const wasAppsOpen = useRef(appsOpen);
    const wasNotesOpen = useRef(notesOpen);

    useLayoutEffect(() => {
        if (wasAppsOpen.current && !appsOpen) {
            const frame = requestAnimationFrame(() => {
                dockNavRef.current?.querySelector<HTMLButtonElement>(
                    '[data-workspace="apps"]',
                )?.focus({ preventScroll: true });
            });
            wasAppsOpen.current = appsOpen;
            return () => cancelAnimationFrame(frame);
        }
        wasAppsOpen.current = appsOpen;
    }, [appsOpen]);

    useLayoutEffect(() => {
        if (wasNotesOpen.current && !notesOpen) {
            const frame = requestAnimationFrame(() => {
                dockNavRef.current?.querySelector<HTMLButtonElement>(
                    '[data-workspace="notes"]',
                )?.focus({ preventScroll: true });
            });
            wasNotesOpen.current = notesOpen;
            return () => cancelAnimationFrame(frame);
        }
        wasNotesOpen.current = notesOpen;
    }, [notesOpen]);

    // Focus management on route change or initial open: root focuses close button, nested focuses back button.
    // Exclude state.activeId so pointer activation does not steal internal focus from inputs/textareas.
    const prevAppsRoute = useRef<WorkspaceState>(models.apps.route);
    const prevNotesRoute = useRef<WorkspaceState>(models.notes.route);
    const wasAppsOpenForFocus = useRef(appsOpen);
    const wasNotesOpenForFocus = useRef(notesOpen);

    useLayoutEffect(() => {
        const routeChanged =
            prevAppsRoute.current.view !== models.apps.route.view;
        const newlyOpened = !wasAppsOpenForFocus.current && appsOpen;

        if (appsOpen && (routeChanged || newlyOpened)) {
            const isNested = models.apps.route.view !== "apps/root";
            const frame = requestAnimationFrame(() => {
                (isNested ? appsBackRef.current : appsCloseRef.current)?.focus({
                    preventScroll: true,
                });
            });
            prevAppsRoute.current = models.apps.route;
            wasAppsOpenForFocus.current = appsOpen;
            return () => cancelAnimationFrame(frame);
        }
        prevAppsRoute.current = models.apps.route;
        wasAppsOpenForFocus.current = appsOpen;
    }, [appsOpen, models.apps.route.view]);

    useLayoutEffect(() => {
        const routeChanged =
            prevNotesRoute.current.view !== models.notes.route.view;
        const newlyOpened = !wasNotesOpenForFocus.current && notesOpen;

        if (notesOpen && (routeChanged || newlyOpened)) {
            const isNested = models.notes.route.view !== "notes/root";
            const frame = requestAnimationFrame(() => {
                (isNested ? notesBackRef.current : notesCloseRef.current)
                    ?.focus({
                        preventScroll: true,
                    });
            });
            prevNotesRoute.current = models.notes.route;
            wasNotesOpenForFocus.current = notesOpen;
            return () => cancelAnimationFrame(frame);
        }
        prevNotesRoute.current = models.notes.route;
        wasNotesOpenForFocus.current = notesOpen;
    }, [notesOpen, models.notes.route.view]);
    // Active workspace kind determination for Escape key
    const activeWinId = state.activeId ??
        getTopmostVisibleWindowId(openWindows);
    const activeKind = activeWinId === "apps" || activeWinId === "notes"
        ? activeWinId
        : null;

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            // Avoid closing window if any popup, menu, or dialog is currently open
            if (
                document.querySelector(
                    '[role="menu"], [data-slot="dropdown-menu-content"], [data-slot="context-menu-content"], [data-slot="popover-content"], [role="dialog"], [role="alertdialog"]',
                )
            ) {
                return;
            }
            if (activeKind) {
                event.preventDefault();
                onClose(activeKind);
            } else if (
                activeWinId &&
                openWindows.some((w) =>
                    w.id === activeWinId && w.kind === "note"
                )
            ) {
                event.preventDefault();
                dispatch({ type: "CLOSE", id: activeWinId });
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [activeKind, activeWinId, openWindows, onClose, dispatch]);

    if (isMobile) {
        return null;
    }

    const handleDockRef = (el: HTMLElement | null) => {
        dockNavRef.current = el;
        onDockElement(el);
    };

    // In constrained mode (768..1023), keep all open windows mounted so drafts/forms are preserved;
    // visually hide the inactive one using desktop-window--constrained-hidden.
    // If active window in state is a note window, fallback to notes workspace in constrained mode.
    const effectiveActiveWinId =
        isConstrained && activeWinId?.startsWith("note:")
            ? "notes"
            : activeWinId;
    const activeWindow =
        openWindows.find((w) => w.id === effectiveActiveWinId) ??
            openWindows[0];

    return (
        <>
            <DesktopCanvas rect={rect} dispatch={dispatch}>
                {openWindows.map((win) => {
                    if (win.kind === "note") {
                        if (isConstrained) {
                            return null;
                        }
                        const noteId = win.entityId ??
                            (win.id.startsWith("note:")
                                ? win.id.slice(5)
                                : win.id);
                        const note = noteId
                            ? notes.find((n) => n.id === noteId)
                            : undefined;
                        if (!note) {
                            return null;
                        }
                        const title = getNoteDisplayTitle(
                            note.title,
                            note.body,
                        );
                        const isActive = state.activeId === win.id;

                        return (
                            <DesktopWindow
                                key={win.id}
                                window={win}
                                rect={rect}
                                active={isActive}
                                dispatch={dispatch}
                                title={title}
                                disableDrag={isConstrained}
                                disableResize={isConstrained}
                                showMinimize={!isConstrained}
                                showMaximize={!isConstrained}
                                closeLabel="关闭便签"
                                onClose={() =>
                                    dispatch({ type: "CLOSE", id: win.id })}
                            >
                                <div className="notes-workspace-editor">
                                    <NoteEditor
                                        key={`${userId}:${note.id}`}
                                        note={note}
                                        onSaved={onSaveNote}
                                    />
                                </div>
                            </DesktopWindow>
                        );
                    }

                    if (!isWorkspaceKind(win.kind)) return null;
                    const kind: WorkspaceKind = win.kind;
                    const model = models[kind];
                    if (!model) return null;

                    const isRoot = model.route.view === "apps/root" ||
                        model.route.view === "notes/root";
                    const isNested = !isRoot;
                    const title = getWorkspaceTitle(kind, model.route);
                    const isActive = state.activeId === win.id;
                    const isConstrainedHidden = isConstrained &&
                        win.id !== activeWindow?.id;

                    const effectiveWindow: DesktopWindowState = isConstrained
                        ? {
                            ...win,
                            frame: computeConstrainedFrame({
                                preset,
                                rect,
                            }),
                        }
                        : win;

                    const showCreate = isRoot &&
                        !(kind === "apps" && appsArranging);

                    return (
                        <DesktopWindow
                            key={win.id}
                            window={effectiveWindow}
                            rect={rect}
                            active={isActive && !isConstrainedHidden}
                            dispatch={dispatch}
                            title={title}
                            className={isConstrainedHidden
                                ? "desktop-window--constrained-hidden"
                                : undefined}
                            disableDrag={isConstrained}
                            disableResize={isConstrained}
                            showMinimize={!isConstrained}
                            showMaximize={!isConstrained}
                            closeLabel="收起工作区"
                            backLabel="返回上一级"
                            onClose={() => onClose(kind)}
                            onBack={isNested ? () => onBack(kind) : undefined}
                            headerMenu={isConstrained
                                ? (
                                    <ConstrainedSizeMenu
                                        preset={preset}
                                        onPresetChange={setPreset}
                                    />
                                )
                                : undefined}
                            closeBtnRef={kind === "apps"
                                ? appsCloseRef
                                : notesCloseRef}
                            backBtnRef={kind === "apps"
                                ? appsBackRef
                                : notesBackRef}
                        >
                            <div className="workspace-body">
                                {renderContent(kind)}
                            </div>

                            {showCreate && (
                                <footer className="workspace-footer">
                                    <Button
                                        className="workspace-primary"
                                        variant="default"
                                        onClick={() => onCreate(kind)}
                                    >
                                        {kind === "apps"
                                            ? "添加应用"
                                            : "新建便签"}
                                    </Button>
                                </footer>
                            )}
                        </DesktopWindow>
                    );
                })}
            </DesktopCanvas>

            <DesktopDock
                ref={handleDockRef}
                state={state}
                onOpen={onOpen}
            />
        </>
    );
}
