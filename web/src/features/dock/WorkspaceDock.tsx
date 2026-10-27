import {
    type CSSProperties,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    AlertCircle,
    type Home,
    LayoutGrid,
    MoreHorizontal,
} from "lucide-react";
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    horizontalListSortingStrategy,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    type DockBallSide,
    type DockEdge,
    type DockMode,
    type DockSystemId,
} from "@shared/dock.ts";
import { routes } from "../../app/routes.ts";
import { useAppState } from "../../app/state.tsx";
import { WebAppGlyph } from "../../components/searcher/WebAppIcon.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "../../components/ui/context-menu.tsx";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import { useEscapeLayerActive } from "../../components/ui/escape-layer-stack.tsx";
import { usePresence } from "../../components/ui/presence.ts";
import {
    RadioGroup,
    RadioGroupItem,
} from "../../components/ui/radio-group.tsx";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "../../components/ui/tooltip.tsx";
import { MEDIA_QUERIES } from "../../design-system/breakpoints.ts";
import type { ExtendedWebApp } from "../app-library/library-types.ts";
import {
    DOCK_SYSTEM_ITEMS,
    DockPinnedAppsList,
    DockSystemOrderList,
    moveDockItem,
} from "./DockOrderList.tsx";
import { useDock } from "./DockProvider.tsx";
import "./dock.css";
function SortableSystemItem({
    id,
    label,
    icon: Icon,
    isActive,
    aiDisabled,
    onClick,
}: {
    id: DockSystemId;
    label: string;
    icon: typeof Home;
    isActive: boolean;
    aiDisabled: boolean;
    onClick: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: `system:${id}` });

    const style: CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const tooltipText = id === "ai" && aiDisabled
        ? "AI 问答（暂无可用模型）"
        : label;

    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <button
                        ref={setNodeRef}
                        style={style}
                        {...attributes}
                        {...listeners}
                        type="button"
                        className={`dock-item dock-item--system${
                            isDragging ? " is-dragging" : ""
                        }`}
                        data-dock-id={id}
                        data-active={isActive ? "true" : undefined}
                        aria-current={isActive ? "page" : undefined}
                        aria-label={label}
                        onClick={onClick}
                    >
                        <Icon
                            size="1em"
                            className="icon-lg"
                            aria-hidden="true"
                        />
                        <span className="dock-item-label">{label}</span>
                        {id === "ai" && aiDisabled && (
                            <span
                                className="dock-error-badge"
                                title="暂无可用模型"
                                aria-hidden="true"
                            />
                        )}
                    </button>
                }
            />
            <TooltipContent>{tooltipText}</TooltipContent>
        </Tooltip>
    );
}

function SortableAppItem({
    app,
    index,
    totalCount,
    isMobile,
    isVertical,
    onOpen,
    onMove,
    onUnpin,
}: {
    app: ExtendedWebApp;
    index: number;
    totalCount: number;
    isMobile: boolean;
    isVertical: boolean;
    onOpen: (app: ExtendedWebApp, target?: "current" | "new_tab") => void;
    onMove: (index: number, delta: -1 | 1) => void;
    onUnpin: (appId: string) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: `app:${app.id}` });

    const style: CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const buttonEl = (
        <button
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            type="button"
            className={`dock-item dock-item--app${
                isDragging ? " is-dragging" : ""
            }`}
            data-dock-app-id={app.id}
            aria-label={app.name}
            onClick={() => onOpen(app)}
        >
            <WebAppGlyph app={app} className="dock-glyph" />
            <span className="dock-item-label">{app.name}</span>
        </button>
    );

    // On mobile touch devices, do not wrap in ContextMenu to avoid long-press conflict
    if (isMobile) {
        return (
            <Tooltip>
                <TooltipTrigger render={buttonEl} />
                <TooltipContent>{app.name}</TooltipContent>
            </Tooltip>
        );
    }

    return (
        <ContextMenu>
            <ContextMenuTrigger
                render={
                    <Tooltip>
                        <TooltipTrigger render={buttonEl} />
                        <TooltipContent>{app.name}</TooltipContent>
                    </Tooltip>
                }
            />
            <ContextMenuContent>
                <ContextMenuItem onClick={() => onOpen(app, "current")}>
                    在当前标签页打开
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onOpen(app, "new_tab")}>
                    在新标签页打开
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    disabled={index === 0}
                    onClick={() => onMove(index, -1)}
                >
                    {isVertical ? "向上移动" : "向前移动"}
                </ContextMenuItem>
                <ContextMenuItem
                    disabled={index === totalCount - 1}
                    onClick={() => onMove(index, 1)}
                >
                    {isVertical ? "向下移动" : "向后移动"}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    variant="destructive"
                    onClick={() => onUnpin(app.id)}
                >
                    取消任务栏固定
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

export function WorkspaceDock(
    { aiAvailable = true }: { aiAvailable?: boolean },
): ReactNode {
    const { user, appearance } = useAppState();
    const location = useLocation();
    const navigate = useNavigate();
    const {
        preferences,
        apps,
        ready,
        error,
        layout,
        setLayout,
        setSystemOrder,
        setSystemVisible,
        setAppOrder,
        setPinned,
        refreshApps,
        suppressed,
    } = useDock();

    const modalActive = useEscapeLayerActive("overlay");
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const [managementOpen, setManagementOpen] = useState(false);
    const [appsOverflowing, setAppsOverflowing] = useState(false);

    // Track mobile viewport using MEDIA_QUERIES.belowMedium
    const [isMobile, setIsMobile] = useState(() =>
        typeof globalThis.matchMedia !== "undefined"
            ? globalThis.matchMedia(MEDIA_QUERIES.belowMedium).matches
            : false
    );

    useEffect(() => {
        if (typeof globalThis.matchMedia === "undefined") return;
        const media = globalThis.matchMedia(MEDIA_QUERIES.belowMedium);
        const change = () => setIsMobile(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);

    // Mobile visualViewport keyboard detection
    useEffect(() => {
        if (typeof globalThis.window === "undefined") return;
        const vv = globalThis.visualViewport;
        if (!vv) return;

        const checkKeyboard = () => {
            if (!isMobile) {
                setKeyboardOpen(false);
                return;
            }
            setKeyboardOpen(
                vv ? vv.height < globalThis.innerHeight - 80 : false,
            );
        };

        checkKeyboard();
        vv?.addEventListener("resize", checkKeyboard);
        globalThis.addEventListener("resize", checkKeyboard);
        return () => {
            vv?.removeEventListener("resize", checkKeyboard);
            globalThis.removeEventListener("resize", checkKeyboard);
        };
    }, [isMobile]);

    const isHomePage = location.pathname === "/" ||
        location.pathname === routes.home;
    const isAiPage = location.pathname.startsWith(routes.ask);

    const isMounted = Boolean(user) &&
        (isHomePage || isAiPage) &&
        !suppressed &&
        !keyboardOpen &&
        ready;

    // Derived active system entry from pathname and search query
    const searchParams = useMemo(
        () => new URLSearchParams(location.search),
        [location.search],
    );
    const currentView = searchParams.get("view");

    const activeSystemId: DockSystemId | null = useMemo(() => {
        if (isAiPage) return "ai";
        if (isHomePage) {
            if (currentView === "apps") return "apps";
            if (currentView === "notes") return "notes";
            return "home";
        }
        return null;
    }, [isAiPage, isHomePage, currentView]);

    const effectiveEdge: DockEdge = isMobile ? "bottom" : layout.edge;
    const isCollapsed = layout.mode === "collapsible" && layout.collapsed;
    const barPresence = usePresence<HTMLElement>(isMounted && !isCollapsed);
    const ballPresence = usePresence<HTMLButtonElement>(
        isMounted && isCollapsed,
    );
    const appsGroupRef = useRef<HTMLDivElement | null>(null);

    // Visible system items in configured order
    const visibleSystemIds = useMemo(
        () =>
            preferences.systemOrder.filter(
                (id) => !preferences.hiddenSystemIds.includes(id),
            ),
        [preferences.systemOrder, preferences.hiddenSystemIds],
    );
    // Hydrate pinned apps
    const pinnedApps = useMemo(
        () =>
            preferences.appIds
                .map((id) => apps.find((a) => a.id === id))
                .filter((app): app is NonNullable<typeof app> => Boolean(app)),
        [preferences.appIds, apps],
    );

    useLayoutEffect(() => {
        const group = appsGroupRef.current;
        if (!barPresence.mounted || pinnedApps.length === 0 || !group) {
            setAppsOverflowing(false);
            return;
        }
        const isVertical = effectiveEdge === "left" ||
            effectiveEdge === "right";
        const markEdges = () => {
            if (isVertical) {
                const end = group.scrollHeight - group.clientHeight;
                const startOverflow = group.scrollTop > 1;
                const endOverflow = group.scrollTop < end - 1;
                group.toggleAttribute("data-overflow-start", startOverflow);
                group.toggleAttribute("data-overflow-end", endOverflow);
                setAppsOverflowing(startOverflow || endOverflow);
            } else {
                const end = group.scrollWidth - group.clientWidth;
                const startOverflow = group.scrollLeft > 1;
                const endOverflow = group.scrollLeft < end - 1;
                group.toggleAttribute("data-overflow-start", startOverflow);
                group.toggleAttribute("data-overflow-end", endOverflow);
                setAppsOverflowing(startOverflow || endOverflow);
            }
        };
        markEdges();
        const observer = new ResizeObserver(markEdges);
        observer.observe(group);
        for (const child of group.children) {
            observer.observe(child);
        }
        group.addEventListener("scroll", markEdges, { passive: true });
        return () => {
            observer.disconnect();
            group.removeEventListener("scroll", markEdges);
        };
    }, [barPresence.mounted, pinnedApps.length, effectiveEdge]);

    // Portalled mobile panels inherit geometry from :root, not AppShell.
    useEffect(() => {
        const shell = document.querySelector<HTMLElement>(".app-shell");
        const root = document.documentElement;
        const edges = ["top", "right", "bottom", "left"] as const;
        const clear = () => {
            for (const edge of edges) {
                root.style.removeProperty(`--dock-inset-${edge}`);
            }
            shell?.removeAttribute("data-dock-edge");
        };
        if (!isMounted || isCollapsed || !barPresence.mounted) {
            clear();
            return clear;
        }
        const container = document.querySelector<HTMLElement>(
            ".dock-container",
        );
        if (!container) return clear;
        const measure = () => {
            const rect = container.getBoundingClientRect();
            const insets = {
                top: rect.bottom,
                right: globalThis.innerWidth - rect.left,
                bottom: globalThis.innerHeight - rect.top,
                left: rect.right,
            };
            for (const edge of edges) {
                root.style.setProperty(
                    `--dock-inset-${edge}`,
                    `${
                        edge === effectiveEdge
                            ? Math.max(0, insets[edge])
                            : 0
                    }px`,
                );
            }
            shell?.setAttribute("data-dock-edge", effectiveEdge);
        };
        const observer = new ResizeObserver(measure);
        observer.observe(container);
        globalThis.addEventListener("resize", measure);
        measure();
        return () => {
            observer.disconnect();
            globalThis.removeEventListener("resize", measure);
            clear();
        };
    }, [isMounted, isCollapsed, barPresence.mounted, effectiveEdge]);

    // Mod+. global keyboard shortcut
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.isComposing) return;
            if (!((e.metaKey || e.ctrlKey) && e.key === ".")) return;

            // Guard: must be signed in on home/ai, not suppressed, not in modal
            if (!user || (!isHomePage && !isAiPage)) return;
            if (suppressed || modalActive) return;

            // Guard: not editing inside form controls or contenteditable
            const activeEl = document.activeElement as HTMLElement | null;
            if (activeEl && activeEl.id !== "search-query") {
                const tag = activeEl.tagName;
                if (
                    tag === "INPUT" ||
                    tag === "TEXTAREA" ||
                    activeEl.isContentEditable ||
                    activeEl.getAttribute("role") === "textbox"
                ) {
                    return;
                }
            }

            e.preventDefault();
            if (layout.collapsed) {
                setLayout({ collapsed: false });
            }
            requestAnimationFrame(() => {
                const dockNav = document.querySelector<HTMLElement>(
                    "nav[aria-label='工作区任务栏']",
                );
                if (dockNav) {
                    const target = dockNav.querySelector<HTMLElement>(
                        "[data-active='true']",
                    ) ??
                        dockNav.querySelector<HTMLElement>(
                            "button, [tabindex='0']",
                        );
                    target?.focus();
                }
            });
        };

        globalThis.addEventListener("keydown", handleKeyDown);
        return () => globalThis.removeEventListener("keydown", handleKeyDown);
    }, [
        user,
        isHomePage,
        isAiPage,
        suppressed,
        modalActive,
        layout.collapsed,
        setLayout,
    ]);

    // dnd-kit sensors configuration
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 250, tolerance: 8 },
        }),
        useSensor(KeyboardSensor, {
            // Enter stays a click so keyboard users can activate entries.
            keyboardCodes: {
                start: ["Space"],
                cancel: ["Escape"],
                end: ["Space"],
            },
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    // Navigation handler
    const handleSystemNavigate = useCallback((id: DockSystemId) => {
        if (id === "home") {
            if (location.pathname === "/" && !location.search) return;
            navigate("/", { viewTransition: !isHomePage });
        } else if (id === "apps") {
            if (location.pathname === "/" && currentView === "apps") return;
            navigate("/?view=apps", { viewTransition: !isHomePage });
        } else if (id === "notes") {
            if (location.pathname === "/" && currentView === "notes") return;
            navigate("/?view=notes", { viewTransition: !isHomePage });
        } else if (id === "ai") {
            if (location.pathname.startsWith("/ask")) return;
            navigate(routes.ask, { viewTransition: true });
        }
    }, [location.pathname, location.search, currentView, navigate, isHomePage]);

    // App open handler
    const handleOpenApp = useCallback(
        (app: ExtendedWebApp, explicitTarget?: "current" | "new_tab") => {
            const urlStr = /^https?:\/\//i.test(app.url)
                ? app.url
                : `https://${app.url}`;
            try {
                const url = new URL(urlStr);
                if (url.protocol !== "http:" && url.protocol !== "https:") {
                    return;
                }
                const target = explicitTarget ??
                    ((app.openMode ?? "global") === "global"
                        ? appearance.target
                        : app.openMode === "new_tab"
                        ? "new_tab"
                        : "current");
                if (target === "new_tab") {
                    globalThis.open(url.href, "_blank", "noopener,noreferrer");
                } else {
                    globalThis.location.assign(url.href);
                }
            } catch {
                // Ignore invalid URL
            }
        },
        [appearance.target],
    );

    // Reorder handlers
    const handleMoveApp = useCallback(
        (index: number, delta: -1 | 1) => {
            const reordered = moveDockItem(preferences.appIds, index, delta);
            if (reordered) {
                void setAppOrder(reordered);
            }
        },
        [preferences.appIds, setAppOrder],
    );

    const handleMoveSystem = useCallback(
        (index: number, delta: -1 | 1) => {
            const reordered = moveDockItem(
                preferences.systemOrder,
                index,
                delta,
            );
            if (reordered) {
                void setSystemOrder(reordered);
            }
        },
        [preferences.systemOrder, setSystemOrder],
    );

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const activeIdStr = String(active.id);
        const overIdStr = String(over.id);

        if (
            activeIdStr.startsWith("system:") &&
            overIdStr.startsWith("system:")
        ) {
            const activeSys = activeIdStr.replace(
                "system:",
                "",
            ) as DockSystemId;
            const overSys = overIdStr.replace("system:", "") as DockSystemId;
            const oldIdx = preferences.systemOrder.indexOf(activeSys);
            const newIdx = preferences.systemOrder.indexOf(overSys);
            if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
                const reordered = arrayMove(
                    preferences.systemOrder,
                    oldIdx,
                    newIdx,
                );
                void setSystemOrder(reordered);
            }
        } else if (
            activeIdStr.startsWith("app:") && overIdStr.startsWith("app:")
        ) {
            const activeAppId = activeIdStr.replace("app:", "");
            const overAppId = overIdStr.replace("app:", "");
            const oldIdx = preferences.appIds.indexOf(activeAppId);
            const newIdx = preferences.appIds.indexOf(overAppId);
            if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
                const reordered = arrayMove(preferences.appIds, oldIdx, newIdx);
                void setAppOrder(reordered);
            }
        }
    }, [
        preferences.systemOrder,
        preferences.appIds,
        setSystemOrder,
        setAppOrder,
    ]);

    // Collapsed floating ball real-time drag state
    const [ballDragState, setBallDragState] = useState<
        {
            isDragging: boolean;
            currentX: number;
            currentY: number;
        } | null
    >(null);

    const ballDragRef = useRef<
        {
            startX: number;
            startY: number;
            pointerId: number;
            dragged: boolean;
        } | null
    >(null);
    const ballJustDraggedRef = useRef(false);

    const handleBallPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        ballJustDraggedRef.current = false;
        ballDragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            pointerId: e.pointerId,
            dragged: false,
        };
    };

    const handleBallPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
        if (!ballDragRef.current) return;
        const dx = e.clientX - ballDragRef.current.startX;
        const dy = e.clientY - ballDragRef.current.startY;
        if (Math.hypot(dx, dy) > 5) {
            ballDragRef.current.dragged = true;
            setBallDragState({
                isDragging: true,
                currentX: e.clientX,
                currentY: e.clientY,
            });
        }
    };

    const handleBallPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
        if (!ballDragRef.current) return;
        try {
            e.currentTarget.releasePointerCapture(
                ballDragRef.current.pointerId,
            );
        } catch {
            // ignore if capture was lost
        }
        const wasDragging = ballDragRef.current.dragged;
        ballJustDraggedRef.current = wasDragging;
        ballDragRef.current = null;
        setBallDragState(null);
        if (!wasDragging) {
            setLayout({ collapsed: false });
            return;
        }

        const side: DockBallSide = e.clientX < globalThis.innerWidth / 2
            ? "left"
            : "right";
        const ballSize = e.currentTarget.offsetHeight || 44;
        const halfBall = ballSize / 2;
        const computed = globalThis.getComputedStyle(e.currentTarget);
        const insetTop = Number.parseFloat(
            computed.getPropertyValue("--dock-ball-inset-top"),
        ) || 60;
        const insetBottom = Number.parseFloat(
            computed.getPropertyValue("--dock-ball-inset-bottom"),
        ) || (ballSize + 12);
        const minTop = insetTop;
        const maxTop = Math.max(
            minTop + 1,
            globalThis.innerHeight - insetBottom,
        );
        const targetTop = Math.max(
            minTop,
            Math.min(maxTop, e.clientY - halfBall),
        );
        const normalizedY = (targetTop - minTop) / (maxTop - minTop);

        setLayout({
            ballSide: side,
            ballY: Math.max(0, Math.min(1, normalizedY)),
        });
    };

    const handleBallPointerCancel = () => {
        ballDragRef.current = null;
        setBallDragState(null);
    };

    if (!barPresence.mounted && !ballPresence.mounted) return null;

    const topRatio = Math.max(0, Math.min(1, layout.ballY ?? 0.5));
    const ballStyle: CSSProperties = ballDragState?.isDragging
        ? {
            left:
                `calc(${ballDragState.currentX}px - var(--dock-ball-size) / 2)`,
            top: `calc(${ballDragState.currentY}px - var(--dock-ball-size) / 2)`,
        }
        : {
            top: `calc(var(--dock-ball-inset-top) + (100dvh - var(--dock-ball-inset-top) - var(--dock-ball-inset-bottom)) * ${topRatio})`,
        };

    const sortableStrategy =
        effectiveEdge === "left" || effectiveEdge === "right"
            ? verticalListSortingStrategy
            : horizontalListSortingStrategy;

    return (
        <>
            {ballPresence.mounted && (
                <button
                    ref={ballPresence.ref}
                    type="button"
                    className="dock-ball"
                    data-dock-action="expand"
                    data-ball-side={layout.ballSide}
                    data-dragging={ballDragState?.isDragging
                        ? "true"
                        : undefined}
                    data-modal-active={modalActive ? "true" : undefined}
                    data-ending-style={ballPresence.ending ? "" : undefined}
                    inert={ballPresence.ending || undefined}
                    style={ballStyle}
                    aria-label="展开任务栏"
                    onPointerDown={handleBallPointerDown}
                    onPointerMove={handleBallPointerMove}
                    onPointerUp={handleBallPointerUp}
                    onPointerCancel={handleBallPointerCancel}
                    onClick={() => {
                        if (ballJustDraggedRef.current) {
                            ballJustDraggedRef.current = false;
                            return;
                        }
                        setLayout({ collapsed: false });
                    }}
                >
                    <LayoutGrid
                        size="1em"
                        className="icon-lg"
                        aria-hidden="true"
                    />
                </button>
            )}

            {barPresence.mounted && (
                <aside
                    className="dock-container"
                    data-edge={effectiveEdge}
                    data-modal-active={modalActive ? "true" : undefined}
                    aria-hidden={modalActive ? "true" : undefined}
                    inert={barPresence.ending || undefined}
                >
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <nav
                            ref={barPresence.ref}
                            className="dock-bar"
                            data-ending-style={barPresence.ending
                                ? ""
                                : undefined}
                            aria-label="工作区任务栏"
                        >
                            {/* System items group */}
                            {visibleSystemIds.length > 0 && (
                                <div className="dock-group dock-group--system">
                                    <SortableContext
                                        items={visibleSystemIds.map((id) =>
                                            `system:${id}`
                                        )}
                                        strategy={sortableStrategy}
                                    >
                                        {visibleSystemIds.map((id) => {
                                            const config =
                                                DOCK_SYSTEM_ITEMS[id];
                                            return (
                                                <SortableSystemItem
                                                    key={id}
                                                    id={id}
                                                    label={config.label}
                                                    icon={config.icon}
                                                    isActive={activeSystemId ===
                                                        id}
                                                    aiDisabled={id === "ai" &&
                                                        !aiAvailable}
                                                    onClick={() =>
                                                        handleSystemNavigate(
                                                            id,
                                                        )}
                                                />
                                            );
                                        })}
                                    </SortableContext>
                                </div>
                            )}

                            {/* Divider between system items and pinned apps */}
                            {visibleSystemIds.length > 0 &&
                                pinnedApps.length > 0 && (
                                <div className="dock-divider" />
                            )}

                            {/* Pinned apps group */}
                            {pinnedApps.length > 0 && (
                                <div
                                    ref={appsGroupRef}
                                    className="dock-group dock-group--apps"
                                >
                                    <SortableContext
                                        items={pinnedApps.map((a) =>
                                            `app:${a.id}`
                                        )}
                                        strategy={sortableStrategy}
                                    >
                                        {pinnedApps.map((app, index) => (
                                            <SortableAppItem
                                                key={app.id}
                                                app={app}
                                                index={index}
                                                totalCount={pinnedApps.length}
                                                isMobile={isMobile}
                                                isVertical={effectiveEdge ===
                                                        "left" ||
                                                    effectiveEdge === "right"}
                                                onOpen={handleOpenApp}
                                                onMove={handleMoveApp}
                                                onUnpin={(id) =>
                                                    void setPinned(id, false)}
                                            />
                                        ))}
                                    </SortableContext>
                                </div>
                            )}

                            {/* Divider before dock actions */}
                            {(visibleSystemIds.length > 0 ||
                                pinnedApps.length > 0) && (
                                <div className="dock-divider" />
                            )}

                            {/* Options / Management dropdown menu */}
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    render={
                                        <button
                                            type="button"
                                            className="dock-item dock-item--action"
                                            aria-label="任务栏选项"
                                            data-dock-action="menu"
                                        >
                                            <MoreHorizontal
                                                size="1em"
                                                className="icon-lg"
                                                aria-hidden="true"
                                            />
                                        </button>
                                    }
                                />
                                <DropdownMenuContent sideOffset={8}>
                                    <DropdownMenuItem
                                        onClick={() => setManagementOpen(true)}
                                    >
                                        管理任务栏
                                    </DropdownMenuItem>
                                    {layout.mode === "collapsible" && (
                                        <DropdownMenuItem
                                            data-dock-action="collapse"
                                            onClick={() =>
                                                setLayout({ collapsed: true })}
                                        >
                                            收起任务栏
                                        </DropdownMenuItem>
                                    )}
                                    {appsOverflowing &&
                                        pinnedApps.length > 0 && (
                                        <>
                                            <DropdownMenuSeparator />
                                            {pinnedApps.map((app) => (
                                                <DropdownMenuItem
                                                    key={app.id}
                                                    data-dock-overflow-app={app
                                                        .id}
                                                    onClick={() =>
                                                        handleOpenApp(app)}
                                                >
                                                    <WebAppGlyph
                                                        app={app}
                                                        className="dock-glyph"
                                                    />
                                                    <span>{app.name}</span>
                                                </DropdownMenuItem>
                                            ))}
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {/* Visible error indicator with retry on click */}
                            {error && (
                                <Tooltip>
                                    <TooltipTrigger
                                        render={
                                            <button
                                                type="button"
                                                className="dock-item dock-item--error"
                                                role="alert"
                                                aria-label={`任务栏同步错误：${error}，点击重试`}
                                                onClick={() =>
                                                    void refreshApps()}
                                            >
                                                <AlertCircle
                                                    size="1em"
                                                    className="icon-lg"
                                                    aria-hidden="true"
                                                />
                                            </button>
                                        }
                                    />
                                    <TooltipContent>
                                        同步提示：{error}（点击重试）
                                    </TooltipContent>
                                </Tooltip>
                            )}
                        </nav>
                    </DndContext>
                </aside>
            )}
            {/* Management Dialog */}
            <Dialog open={managementOpen} onOpenChange={setManagementOpen}>
                <DialogContent
                    aria-label="管理任务栏"
                    data-dock-modal="management"
                >
                    <DialogHeader>
                        <DialogTitle>管理任务栏</DialogTitle>
                    </DialogHeader>
                    <div className="dock-management-content">
                        <div className="dock-management-layout">
                            {!isMobile && (
                                <div className="dock-management-row">
                                    <span className="dock-management-label">
                                        位置
                                    </span>
                                    <RadioGroup
                                        variant="segmented"
                                        value={layout.edge}
                                        onValueChange={(val) =>
                                            setLayout({
                                                edge: val as DockEdge,
                                            })}
                                        aria-label="任务栏位置"
                                    >
                                        <RadioGroupItem value="bottom">
                                            底部
                                        </RadioGroupItem>
                                        <RadioGroupItem value="top">
                                            顶部
                                        </RadioGroupItem>
                                        <RadioGroupItem value="left">
                                            左侧
                                        </RadioGroupItem>
                                        <RadioGroupItem value="right">
                                            右侧
                                        </RadioGroupItem>
                                    </RadioGroup>
                                </div>
                            )}
                            <div className="dock-management-row">
                                <span className="dock-management-label">
                                    展示模式
                                </span>
                                <RadioGroup
                                    variant="segmented"
                                    value={layout.mode}
                                    onValueChange={(val) =>
                                        setLayout({ mode: val as DockMode })}
                                    aria-label="任务栏展示模式"
                                >
                                    <RadioGroupItem value="fixed">
                                        常驻
                                    </RadioGroupItem>
                                    <RadioGroupItem value="collapsible">
                                        可收起
                                    </RadioGroupItem>
                                </RadioGroup>
                            </div>
                        </div>

                        <div className="dock-management-section">
                            <h4 className="dock-management-heading">
                                系统入口
                            </h4>
                            <DockSystemOrderList
                                systemOrder={preferences.systemOrder}
                                hiddenSystemIds={preferences.hiddenSystemIds}
                                onMove={handleMoveSystem}
                                onReorder={(next) => void setSystemOrder(next)}
                                onToggleVisible={(id, visible) =>
                                    void setSystemVisible(id, visible)}
                            />
                        </div>

                        <div className="dock-management-section">
                            <h4 className="dock-management-heading">
                                固定应用（{pinnedApps.length}）
                            </h4>
                            <DockPinnedAppsList
                                pinnedApps={pinnedApps}
                                availableApps={apps}
                                onMove={handleMoveApp}
                                onReorder={(next) => void setAppOrder(next)}
                                onPin={(id) => void setPinned(id, true)}
                                onUnpin={(id) => void setPinned(id, false)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose
                            render={<Button type="button">完成</Button>}
                        />
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
