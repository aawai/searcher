import {
    type Dispatch,
    type ReactNode,
    type RefObject,
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
import { DesktopOverview, type WindowPreview } from "./DesktopOverview.tsx";
import { DesktopWindow } from "./DesktopWindow.tsx";
import {
    computeConstrainedFrame,
    CONSTRAINED_PRESET_LABELS,
    CONSTRAINED_PRESETS,
    type ConstrainedPreset,
} from "./constrained-geometry.ts";
import type { DesktopGeometry, Frame } from "./desktop-geometry.ts";
import type { DesktopAction, DesktopState } from "./desktop-state.ts";
import { getTopmostVisibleWindowId } from "./desktop-state.ts";
import type {
    WorkspaceCoreState,
    WorkspaceKind,
    WorkspaceRoute,
} from "../workspace/workspace-state.ts";
import { NoteEditor } from "../../components/searcher/NoteEditor.tsx";
import {
    getNoteDisplayTitle,
    type NoteItem,
} from "../../components/searcher/NoteCard.tsx";
import "./desktop.css";
import type { DocumentDto } from "@shared/documents.ts";
import { DocumentEntityWindow } from "./DocumentEntityWindow.tsx";
import { useDocumentImmersion } from "./useDocumentImmersion.ts";

export interface DesktopWorkspacesProps {
    state: DesktopState;
    rect: DesktopGeometry;
    dispatch: Dispatch<DesktopAction>;
    models: WorkspaceCoreState;
    renderContent: (kind: WorkspaceKind) => ReactNode;
    onOpen: (kind: WorkspaceKind) => void;
    onClose: (kind: WorkspaceKind) => void;
    onBack: (kind: WorkspaceKind) => void;
    onCreate: (kind: "apps" | "notes") => void;
    onFinishArrange: () => void;
    onDockElement: (el: HTMLElement | null) => void;
    appsArranging: boolean;
    notes: NoteItem[];
    onSaveNote: (note: NoteItem) => void;
    userId: string;
    documents: Record<string, { title: string; summary: string }>;
    onOpenDocument: (id: string) => void;
    onDocumentChanged: (document: DocumentDto) => void;
    onDocumentsChanged: () => void;
}

export function isWorkspaceKind(kind: string): kind is WorkspaceKind {
    return kind === "apps" || kind === "notes" || kind === "documents";
}

export function getWorkspaceTitle(
    kind: WorkspaceKind,
    route: WorkspaceRoute,
): string {
    switch (route.view) {
        case "apps/create":
            return "添加应用";
        case "apps/edit":
            return "编辑应用";
        case "notes/edit":
            return "编辑便签";
        default:
            return kind === "apps"
                ? "应用"
                : kind === "notes"
                ? "便签"
                : "笔记";
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
    onFinishArrange,
    onDockElement,
    appsArranging,
    notes,
    onSaveNote,
    userId,
    documents,
    onOpenDocument,
    onDocumentChanged,
    onDocumentsChanged,
}: DesktopWorkspacesProps) {
    const dockNavRef = useRef<HTMLElement | null>(null);

    const chromeRefs = useRef<
        Record<
            WorkspaceKind,
            {
                close: RefObject<HTMLButtonElement | null>;
                back: RefObject<HTMLButtonElement | null>;
            }
        >
    >({
        apps: { close: { current: null }, back: { current: null } },
        notes: { close: { current: null }, back: { current: null } },
        documents: { close: { current: null }, back: { current: null } },
    }).current;

    const [preset, setPreset] = useState<ConstrainedPreset>("medium");
    const [presetChosen, setPresetChosen] = useState(false);
    const [overviewOpen, setOverviewOpen] = useState(false);
    const overviewSelection = useRef<string | null>(null);

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
    const immersion = useDocumentImmersion(
        state,
        userId,
        !isMobile && !isConstrained && rect.usable,
    );
    const immersiveId = immersion.immersiveDocumentId;

    // DesktopState.windows is the single source of truth for window visibility
    const openWindows = state.windows.filter((w) => {
        if (isWorkspaceKind(w.kind)) {
            return true;
        }
        if (w.kind === "note" || w.kind === "document") {
            return !isConstrained;
        }
        return false;
    });

    const previous = useRef<
        Record<WorkspaceKind, { open: boolean; view: string }>
    >({
        apps: { open: false, view: "apps/root" },
        notes: { open: false, view: "notes/root" },
        documents: { open: false, view: "documents/root" },
    });
    useLayoutEffect(() => {
        const frames: number[] = [];
        for (const kind of ["apps", "notes", "documents"] as const) {
            const open = state.windows.some((win) =>
                win.kind === kind && win.mode !== "minimized"
            );
            const view = models[kind].route.view;
            const before = previous.current[kind];
            if (before.open && !open) {
                frames.push(
                    requestAnimationFrame(() =>
                        dockNavRef.current?.querySelector<HTMLButtonElement>(
                            `[data-workspace="${kind}"]`,
                        )?.focus({ preventScroll: true })
                    ),
                );
            } else if (open && (!before.open || before.view !== view)) {
                frames.push(requestAnimationFrame(() => {
                    const control = view === `${kind}/root`
                        ? chromeRefs[kind].close
                        : chromeRefs[kind].back;
                    control.current?.focus({ preventScroll: true });
                }));
            }
            previous.current[kind] = { open, view };
        }
        return () => frames.forEach(cancelAnimationFrame);
        // Pointer activation must not steal focus from domain inputs.
    }, [
        state.windows,
        models.apps.route.view,
        models.notes.route.view,
        models.documents.route.view,
        chromeRefs,
    ]);
    // Active workspace kind determination for Escape key
    const activeWinId = state.activeId ??
        getTopmostVisibleWindowId(openWindows);
    const activeKind = activeWinId && isWorkspaceKind(activeWinId)
        ? activeWinId
        : null;

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (
                !isConstrained || activeKind === "apps" ||
                event.key !== "Escape" ||
                event.isComposing || event.defaultPrevented
            ) return;
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
    }, [
        activeKind,
        activeWinId,
        openWindows,
        onClose,
        dispatch,
        isConstrained,
    ]);
    useEffect(() => {
        if (isMobile || isConstrained) setOverviewOpen(false);
    }, [isMobile, isConstrained]);

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
        isConstrained && activeWinId?.startsWith("document:")
            ? "documents"
            : isConstrained && activeWinId?.startsWith("note:")
            ? "notes"
            : activeWinId;
    const activeWindow =
        openWindows.find((w) => w.id === effectiveActiveWinId) ??
            openWindows[0];
    const previews: WindowPreview[] = openWindows.map((win) => {
        const note = win.kind === "note"
            ? notes.find((n) => n.id === win.entityId)
            : undefined;
        const document = win.kind === "document" && win.entityId
            ? documents[win.entityId]
            : undefined;
        return {
            id: win.id,
            kind: win.kind,
            minimized: win.mode === "minimized",
            title: isWorkspaceKind(win.kind)
                ? getWorkspaceTitle(win.kind, models[win.kind].route)
                : win.kind === "document"
                ? document?.title ?? "笔记"
                : getNoteDisplayTitle(note?.title ?? "", note?.body ?? ""),
            summary: document?.summary ?? note?.body ??
                (win.kind === "apps"
                    ? "应用列表"
                    : win.kind === "notes"
                    ? "便签列表"
                    : "笔记列表"),
        };
    });
    const selectWindow = (id: string) => {
        const win = openWindows.find((w) => w.id === id);
        if (!win) return;
        if (id === immersiveId) {
            requestAnimationFrame(() =>
                document.getElementById(`desktop-window-${id}`)
                    ?.querySelector<HTMLElement>(".ProseMirror, textarea")
                    ?.focus({ preventScroll: true })
            );
            return;
        }
        immersion.exit(false);
        dispatch(
            win.mode === "minimized"
                ? { type: "RESTORE", id, rect }
                : { type: "FOCUS", id },
        );
        overviewSelection.current = id;
        setOverviewOpen(false);
        requestAnimationFrame(() =>
            document.getElementById(`desktop-window-${id}`)?.focus({
                preventScroll: true,
            })
        );
    };

    return (
        <>
            <DesktopCanvas rect={rect}>
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
                                background={Boolean(immersiveId)}
                                title={title}
                                disableDrag={isConstrained}
                                disableResize={isConstrained}
                                showMinimize={!isConstrained}
                                showMaximize={!isConstrained}
                                closeLabel="关闭便签"
                                onClose={() =>
                                    dispatch({ type: "CLOSE", id: win.id })}
                            >
                                <div
                                    className="notes-workspace-editor"
                                    data-workspace-editor
                                >
                                    <NoteEditor
                                        key={`${userId}:${note.id}`}
                                        note={note}
                                        onSaved={onSaveNote}
                                    />
                                </div>
                            </DesktopWindow>
                        );
                    }

                    if (win.kind === "document") {
                        return (
                            <DocumentEntityWindow
                                key={`${userId}:${win.id}`}
                                window={win}
                                rect={rect}
                                active={immersiveId
                                    ? immersiveId === win.id
                                    : state.activeId === win.id}
                                dispatch={dispatch}
                                immersive={immersiveId === win.id}
                                background={Boolean(
                                    immersiveId && immersiveId !== win.id,
                                )}
                                onEnterImmersive={() => immersion.enter(win.id)}
                                onExitImmersive={() => immersion.exit()}
                                userId={userId}
                                title={previews.find((p) => p.id === win.id)
                                    ?.title ?? "笔记"}
                                onOpenDocument={(id) => {
                                    if (
                                        `document:${id}` !== immersiveId
                                    ) immersion.exit(false);
                                    onOpenDocument(id);
                                }}
                                onDocumentChanged={onDocumentChanged}
                                onDocumentsChanged={onDocumentsChanged}
                            />
                        );
                    }
                    if (!isWorkspaceKind(win.kind)) return null;
                    const kind: WorkspaceKind = win.kind;
                    const model = models[kind];
                    if (!model) return null;

                    const isRoot = model.route.view === "apps/root" ||
                        model.route.view === "notes/root" ||
                        model.route.view === "documents/root";
                    const isNested = !isRoot;
                    const title = getWorkspaceTitle(kind, model.route);
                    const isActive = state.activeId === win.id;
                    const isConstrainedHidden = isConstrained &&
                        win.id !== activeWindow?.id;

                    const effectivePreset =
                        kind === "documents" && isNested && !presetChosen
                            ? "large"
                            : preset;
                    const presentationFrameOverride: Frame | undefined =
                        isConstrained
                            ? computeConstrainedFrame({
                                preset: effectivePreset,
                                rect: rect.safeRect,
                            })
                            : undefined;

                    const showCreate = isRoot && kind !== "documents";

                    return (
                        <DesktopWindow
                            key={win.id}
                            window={win}
                            rect={rect}
                            presentationFrameOverride={presentationFrameOverride}
                            active={isActive && !isConstrainedHidden}
                            dispatch={dispatch}
                            title={title}
                            background={Boolean(immersiveId)}
                            className={isConstrainedHidden
                                ? "desktop-window--constrained-hidden"
                                : undefined}
                            disableDrag={isConstrained}
                            disableResize={isConstrained}
                            showMinimize={!isConstrained}
                            showMaximize={!isConstrained}
                            closeLabel="收起工作区"
                            backLabel={model.route.view === "notes/edit"
                                ? "返回便签列表"
                                : "返回上一级"}
                            onClose={() => onClose(kind)}
                            onBack={isNested ? () => onBack(kind) : undefined}
                            headerMenu={isConstrained
                                ? (
                                    <ConstrainedSizeMenu
                                        preset={effectivePreset}
                                        onPresetChange={(value) => {
                                            setPresetChosen(true);
                                            setPreset(value);
                                        }}
                                    />
                                )
                                : undefined}
                            closeBtnRef={chromeRefs[kind].close}
                            backBtnRef={chromeRefs[kind].back}
                        >
                            <div
                                className="workspace-body"
                                data-layout={kind === "apps" && isNested
                                    ? "app-form"
                                    : undefined}
                            >
                                {renderContent(kind)}
                            </div>

                            {showCreate && (
                                <footer className="workspace-footer">
                                    <Button
                                        className="workspace-primary"
                                        variant="default"
                                        onClick={() =>
                                            kind === "apps" && appsArranging
                                                ? onFinishArrange()
                                                : onCreate(
                                                    kind === "apps"
                                                        ? "apps"
                                                        : "notes",
                                                )}
                                    >
                                        {kind === "apps"
                                            ? appsArranging
                                                ? "完成整理"
                                                : "添加应用"
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
                activeWindowId={immersiveId ?? state.activeId}
                onOpen={(kind) => {
                    immersion.exit(false);
                    onOpen(kind);
                }}
                runningEntities={isConstrained
                    ? []
                    : previews.filter((w) =>
                        w.kind === "note" || w.kind === "document"
                    )}
                onSelectWindow={selectWindow}
                overviewOpen={overviewOpen}
                className={immersiveId ? "desktop-dock--immersive" : undefined}
                suppressed={Boolean(immersiveId && !immersion.dockShown)}
                onPointerEnter={immersion.onDockEnter}
                onPointerLeave={immersion.onDockLeave}
                onFocus={immersion.showDock}
                onBlur={immersion.onDockBlur}
                onOverview={isConstrained ? undefined : () => {
                    immersion.exit(false);
                    overviewSelection.current = null;
                    setOverviewOpen(true);
                }}
            />
            {immersiveId && (
                <Button
                    variant="ghost"
                    className="desktop-immersive-dock-trigger"
                    data-immersive-dock-trigger
                    aria-label="显示 Dock"
                    onPointerEnter={immersion.onEdgeEnter}
                    onPointerLeave={immersion.onEdgeLeave}
                    onFocus={immersion.showDock}
                    onBlur={immersion.onDockBlur}
                    onClick={() => {
                        immersion.showDock();
                        requestAnimationFrame(() =>
                            dockNavRef.current?.querySelector<HTMLElement>(
                                "button",
                            )?.focus()
                        );
                    }}
                >
                    显示 Dock
                </Button>
            )}
            {!isConstrained && (
                <DesktopOverview
                    open={overviewOpen}
                    windows={previews}
                    onOpenChange={setOverviewOpen}
                    onSelect={selectWindow}
                    returnFocus={() =>
                        overviewSelection.current
                            ? false
                            : dockNavRef.current?.querySelector<HTMLElement>(
                                '[aria-label="窗口总览"]',
                            ) ?? null}
                />
            )}
        </>
    );
}
