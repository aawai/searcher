import {
    type CSSProperties,
    type MouseEvent as ReactMouseEvent,
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
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    type Home,
    LayoutGrid,
    Minimize2,
    MoreHorizontal,
    PinOff,
    Settings2,
    X,
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
    type DockSystemId,
} from "@shared/dock.ts";
import { routes } from "../../app/routes.ts";
import { useAppState } from "../../app/state.tsx";
import { WebAppGlyph } from "../../components/searcher/WebAppIcon.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuPopup,
    DropdownMenuPortal,
    DropdownMenuPositioner,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import { useEscapeLayerActive } from "../../components/ui/escape-layer-stack.tsx";
import { usePresence } from "../../components/ui/presence.ts";
import {
    RadioGroup,
    RadioGroupItem,
} from "../../components/ui/radio-group.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "../../components/ui/tooltip.tsx";
import { MEDIA_QUERIES } from "../../design-system/breakpoints.ts";
import type { ExtendedWebApp } from "../app-library/library-types.ts";
import { useWindowManager } from "../windowing/window-context.tsx";
import { DOCK_SYSTEM_ITEMS } from "./DockOrderList.tsx";
import { useDock } from "./DockProvider.tsx";
import "./dock.css";

const TOUCH_HOLD_MS = 250;
const TOUCH_TOLERANCE = 8;
const COMPAT_MOUSE_WINDOW_MS = 500;

function mayComeFromTouch(event: MouseEvent): boolean {
    const capabilities = "sourceCapabilities" in event
        ? event.sourceCapabilities
        : null;
    return !capabilities || typeof capabilities !== "object" ||
        !("firesTouchEvents" in capabilities) ||
        capabilities.firesTouchEvents !== false;
}

type DockItem =
    | { kind: "system"; id: DockSystemId }
    | { kind: "app"; id: string };
type DockItemMenu = DockItem & { anchor: HTMLElement; touch: boolean };

function SortableSystemItem({
    id,
    label,
    icon: Icon,
    isActive,
    windowStatus,
    aiDisabled,
    onClick,
    onContextMenu,
}: {
    id: DockSystemId;
    label: string;
    icon: typeof Home;
    isActive: boolean;
    windowStatus?: "visible" | "minimized";
    aiDisabled: boolean;
    onClick: () => void;
    onContextMenu: (event: ReactMouseEvent<HTMLButtonElement>) => void;
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
        : windowStatus
        ? `${label}（${
            isActive
                ? "当前窗口"
                : windowStatus === "minimized"
                ? "已最小化"
                : "已打开"
        }）`
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
                        data-window-status={windowStatus}
                        aria-current={isActive ? "page" : undefined}
                        aria-label={windowStatus ? tooltipText : label}
                        onClick={onClick}
                        onContextMenu={onContextMenu}
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
    onOpen,
    onContextMenu,
}: {
    app: ExtendedWebApp;
    onOpen: (app: ExtendedWebApp) => void;
    onContextMenu: (event: ReactMouseEvent<HTMLButtonElement>) => void;
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
                        className={`dock-item dock-item--app${
                            isDragging ? " is-dragging" : ""
                        }`}
                        data-dock-app-id={app.id}
                        aria-label={app.name}
                        onClick={() => onOpen(app)}
                        onContextMenu={onContextMenu}
                    >
                        <WebAppGlyph app={app} className="dock-glyph" />
                        <span className="dock-item-label">{app.name}</span>
                    </button>
                }
            />
            <TooltipContent>{app.name}</TooltipContent>
        </Tooltip>
    );
}

export function WorkspaceDock(
    { aiAvailable = true }: { aiAvailable?: boolean },
): ReactNode {
    const { user, appearance } = useAppState();
    const location = useLocation();
    const navigate = useNavigate();
    const windowManager = useWindowManager();
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
    const windowListOpen = windowManager?.windowListOpen ?? false;
    const setWindowListOpen = (open: boolean) =>
        windowManager?.setWindowListOpen(open);
    const [appsOverflowing, setAppsOverflowing] = useState(false);
    const [itemMenu, setItemMenu] = useState<DockItemMenu | null>(null);
    const optionsRef = useRef<HTMLButtonElement | null>(null);
    const touchActiveRef = useRef(false);
    const multipleTouchRef = useRef(false);
    const touchContextDeadlineRef = useRef(0);
    const touchReleaseRef = useRef<{ x: number; y: number } | null>(null);
    const suppressTouchMouseRef = useRef(false);
    const touchMovedRef = useRef(false);

    // The browser may synthesize mouse events on the menu backdrop after a touch drag.
    useEffect(() => {
        const suppressCompatibilityMouse = (event: MouseEvent) => {
            const release = touchReleaseRef.current;
            if (
                !suppressTouchMouseRef.current || !release ||
                Date.now() >= touchContextDeadlineRef.current ||
                !mayComeFromTouch(event) ||
                Math.hypot(
                        event.clientX - release.x,
                        event.clientY - release.y,
                    ) >= TOUCH_TOLERANCE
            ) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.type === "click") suppressTouchMouseRef.current = false;
        };
        for (const type of ["mousedown", "mouseup", "click"] as const) {
            globalThis.addEventListener(type, suppressCompatibilityMouse, true);
        }
        return () => {
            for (const type of ["mousedown", "mouseup", "click"] as const) {
                globalThis.removeEventListener(
                    type,
                    suppressCompatibilityMouse,
                    true,
                );
            }
        };
    }, []);

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
    const isWindowPage = location.pathname === routes.account ||
        location.pathname === routes.trash ||
        location.pathname === routes.settings() ||
        location.pathname.startsWith(`${routes.settings()}/`);
    const isMounted = Boolean(user) &&
        (isHomePage || isAiPage || isWindowPage) &&
        !suppressed &&
        !keyboardOpen &&
        ready;

    // The focused window, else the page the pathname shows.
    const activeSystemId: DockSystemId | null = useMemo(() => {
        if (windowManager?.activeId) return windowManager.activeId;
        if (isAiPage) return "ai";
        return isHomePage ? "home" : null;
    }, [isAiPage, isHomePage, windowManager?.activeId]);

    const effectiveEdge: DockEdge = isMobile ? "bottom" : layout.edge;
    const isCollapsed = layout.collapsed;
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

    useEffect(() => {
        if (!itemMenu) return;
        const available = itemMenu.kind === "system"
            ? visibleSystemIds.includes(itemMenu.id)
            : pinnedApps.some((app) => app.id === itemMenu.id);
        if (!isMounted || isCollapsed || !available) {
            setItemMenu(null);
        }
    }, [itemMenu, isMounted, isCollapsed, pinnedApps, visibleSystemIds]);

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
            activationConstraint: {
                delay: TOUCH_HOLD_MS,
                tolerance: TOUCH_TOLERANCE,
            },
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
            windowManager?.showDesktop();
        } else if (id === "ai") {
            if (location.pathname.startsWith("/ask")) return;
            navigate(routes.ask, { viewTransition: true });
        } else {
            windowManager?.open(id);
        }
    }, [location.pathname, navigate, windowManager]);

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

    const openItemContextMenu = (
        event: ReactMouseEvent<HTMLButtonElement>,
        item: DockItem,
    ) => {
        event.preventDefault();
        const native = event.nativeEvent;
        if (
            touchActiveRef.current ||
            Date.now() < touchContextDeadlineRef.current ||
            ("pointerType" in native && native.pointerType === "touch")
        ) return;
        setItemMenu({ ...item, anchor: event.currentTarget, touch: false });
    };

    const closeItemMenu = () => {
        const anchor = itemMenu?.anchor;
        setItemMenu(null);
        requestAnimationFrame(() => {
            (anchor?.isConnected ? anchor : optionsRef.current)?.focus();
        });
    };

    const handleMoveApp = useCallback((id: string, delta: -1 | 1) => {
        const visibleIndex = pinnedApps.findIndex((app) => app.id === id);
        const neighbor = pinnedApps[visibleIndex + delta];
        if (visibleIndex < 0 || !neighbor) return;
        const from = preferences.appIds.indexOf(id);
        const to = preferences.appIds.indexOf(neighbor.id);
        if (from !== -1 && to !== -1) {
            void setAppOrder(arrayMove(preferences.appIds, from, to));
        }
    }, [pinnedApps, preferences.appIds, setAppOrder]);

    const handleMoveSystem = useCallback((id: DockSystemId, delta: -1 | 1) => {
        const visibleIndex = visibleSystemIds.indexOf(id);
        const neighbor = visibleSystemIds[visibleIndex + delta];
        if (visibleIndex < 0 || !neighbor) return;
        const from = preferences.systemOrder.indexOf(id);
        const to = preferences.systemOrder.indexOf(neighbor);
        if (from !== -1 && to !== -1) {
            void setSystemOrder(arrayMove(preferences.systemOrder, from, to));
        }
    }, [visibleSystemIds, preferences.systemOrder, setSystemOrder]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        const activeIdStr = String(active.id);
        if (event.activatorEvent.type === "touchstart") {
            suppressTouchMouseRef.current = true;
        }
        if (
            event.activatorEvent.type === "touchstart" &&
            !multipleTouchRef.current &&
            !touchMovedRef.current &&
            Math.hypot(event.delta.x, event.delta.y) < TOUCH_TOLERANCE
        ) {
            const target = event.activatorEvent.target;
            const anchor = target instanceof Element
                ? target.closest("button")
                : null;
            if (anchor && activeIdStr.startsWith("system:")) {
                setItemMenu({
                    kind: "system",
                    id: activeIdStr.slice("system:".length) as DockSystemId,
                    anchor,
                    touch: true,
                });
            } else if (anchor && activeIdStr.startsWith("app:")) {
                setItemMenu({
                    kind: "app",
                    id: activeIdStr.slice("app:".length),
                    anchor,
                    touch: true,
                });
            }
            return;
        }
        if (
            (event.activatorEvent.type === "touchstart" &&
                multipleTouchRef.current) ||
            !over || active.id === over.id
        ) return;
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
    const vertical = effectiveEdge === "left" || effectiveEdge === "right";
    const menuApp = itemMenu?.kind === "app"
        ? pinnedApps.find((app) => app.id === itemMenu.id)
        : undefined;
    const menuLabel = itemMenu?.kind === "system"
        ? DOCK_SYSTEM_ITEMS[itemMenu.id].label
        : menuApp?.name;
    const menuIndex = itemMenu?.kind === "system"
        ? visibleSystemIds.indexOf(itemMenu.id)
        : pinnedApps.findIndex((app) => app.id === itemMenu?.id);
    const menuCount = itemMenu?.kind === "system"
        ? visibleSystemIds.length
        : pinnedApps.length;
    const menuSide = effectiveEdge === "bottom"
        ? "top"
        : effectiveEdge === "top"
        ? "bottom"
        : effectiveEdge === "left"
        ? "right"
        : "left";
    const PreviousIcon = vertical ? ArrowUp : ArrowLeft;
    const NextIcon = vertical ? ArrowDown : ArrowRight;

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
                        onDragStart={() => {
                            touchMovedRef.current = false;
                        }}
                        onDragMove={(event) => {
                            if (
                                Math.hypot(event.delta.x, event.delta.y) >=
                                    TOUCH_TOLERANCE
                            ) {
                                touchMovedRef.current = true;
                            }
                        }}
                        onDragEnd={handleDragEnd}
                    >
                        <nav
                            ref={barPresence.ref}
                            className="dock-bar"
                            data-ending-style={barPresence.ending
                                ? ""
                                : undefined}
                            aria-label="工作区任务栏"
                            onTouchStartCapture={(event) => {
                                if (event.touches.length === 1) {
                                    suppressTouchMouseRef.current = false;
                                }
                                touchActiveRef.current = true;
                                if (
                                    event.touches.length === 1
                                ) multipleTouchRef.current = false;
                                else multipleTouchRef.current = true;
                            }}
                            onTouchEndCapture={(event) => {
                                touchActiveRef.current =
                                    event.touches.length > 0;
                                const touch = event.changedTouches[0];
                                touchReleaseRef.current = touch
                                    ? { x: touch.clientX, y: touch.clientY }
                                    : null;
                                touchContextDeadlineRef.current = Date.now() +
                                    COMPAT_MOUSE_WINDOW_MS;
                            }}
                            onTouchCancelCapture={() => {
                                touchActiveRef.current = false;
                                touchContextDeadlineRef.current = Date.now() +
                                    COMPAT_MOUSE_WINDOW_MS;
                            }}
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
                                                    windowStatus={id ===
                                                                "apps" ||
                                                            id === "notes" ||
                                                            id === "settings" ||
                                                            id === "trash"
                                                        ? windowManager?.windows
                                                            .find((item) =>
                                                                item.id === id
                                                            )
                                                            ?.status
                                                        : undefined}
                                                    aiDisabled={id === "ai" &&
                                                        !aiAvailable}
                                                    onClick={() =>
                                                        handleSystemNavigate(
                                                            id,
                                                        )}
                                                    onContextMenu={(event) =>
                                                        openItemContextMenu(
                                                            event,
                                                            {
                                                                kind: "system",
                                                                id,
                                                            },
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
                                        {pinnedApps.map((app) => (
                                            <SortableAppItem
                                                key={app.id}
                                                app={app}
                                                onOpen={handleOpenApp}
                                                onContextMenu={(event) =>
                                                    openItemContextMenu(event, {
                                                        kind: "app",
                                                        id: app.id,
                                                    })}
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
                                            ref={optionsRef}
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
                                <DropdownMenuContent
                                    sideOffset={8}
                                    className="dock-options-menu"
                                >
                                    <DropdownMenuItem
                                        aria-label="管理任务栏"
                                        onClick={() => setManagementOpen(true)}
                                    >
                                        <Settings2
                                            size="1em"
                                            className="icon-md"
                                            aria-hidden="true"
                                        />
                                        管理
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setWindowListOpen(true)}
                                    >
                                        窗口列表
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        aria-label="收起任务栏"
                                        data-dock-action="collapse"
                                        onClick={() =>
                                            setLayout({ collapsed: true })}
                                    >
                                        <Minimize2
                                            size="1em"
                                            className="icon-md"
                                            aria-hidden="true"
                                        />
                                        收起
                                    </DropdownMenuItem>
                                    {appsOverflowing &&
                                        pinnedApps.length > 0 && (
                                        <>
                                            <DropdownMenuSeparator />
                                            {pinnedApps.map((app) => (
                                                <div
                                                    className="dock-overflow-row"
                                                    role="none"
                                                    key={app.id}
                                                >
                                                    <DropdownMenuItem
                                                        data-dock-overflow-app={app
                                                            .id}
                                                        onClick={() =>
                                                            handleOpenApp(app)}
                                                    >
                                                        <WebAppGlyph
                                                            app={app}
                                                            className="dock-glyph"
                                                        />
                                                        <span className="dock-overflow-name">
                                                            {app.name}
                                                        </span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="dock-overflow-action"
                                                        aria-label={`${app.name} 的操作`}
                                                        onClick={() => {
                                                            const anchor =
                                                                optionsRef
                                                                    .current;
                                                            if (anchor) {
                                                                requestAnimationFrame(
                                                                    () =>
                                                                        setItemMenu(
                                                                            {
                                                                                kind:
                                                                                    "app",
                                                                                id: app
                                                                                    .id,
                                                                                anchor,
                                                                                touch:
                                                                                    true,
                                                                            },
                                                                        ),
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        <MoreHorizontal
                                                            size="1em"
                                                            className="icon-md"
                                                            aria-hidden="true"
                                                        />
                                                    </DropdownMenuItem>
                                                </div>
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
            {itemMenu && menuLabel && menuIndex >= 0 && (
                <DropdownMenu
                    open
                    onOpenChange={(open, details) => {
                        const event = details.event;
                        const release = touchReleaseRef.current;
                        const fromRelease = itemMenu.touch &&
                            event instanceof MouseEvent &&
                            Date.now() < touchContextDeadlineRef.current &&
                            mayComeFromTouch(event) &&
                            release !== null &&
                            Math.hypot(
                                    event.clientX - release.x,
                                    event.clientY - release.y,
                                ) < TOUCH_TOLERANCE;
                        if (!open && !fromRelease) closeItemMenu();
                    }}
                >
                    <DropdownMenuPortal>
                        <DropdownMenuPositioner
                            anchor={itemMenu.anchor}
                            side={menuSide}
                            sideOffset={8}
                        >
                            <DropdownMenuPopup
                                aria-label={`${menuLabel} 的操作`}
                                data-dock-item-menu
                            >
                                <div className="menu-label dock-item-menu-label">
                                    {menuApp && (
                                        <WebAppGlyph
                                            app={menuApp}
                                            className="dock-glyph"
                                        />
                                    )}
                                    <span>{menuLabel}</span>
                                </div>
                                {menuApp && !itemMenu.touch && (
                                    <>
                                        <DropdownMenuItem
                                            onClick={() =>
                                                handleOpenApp(
                                                    menuApp,
                                                    "current",
                                                )}
                                        >
                                            在当前标签页打开
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() =>
                                                handleOpenApp(
                                                    menuApp,
                                                    "new_tab",
                                                )}
                                        >
                                            在新标签页打开
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                    </>
                                )}
                                <DropdownMenuItem
                                    disabled={menuIndex === 0}
                                    onClick={() => {
                                        if (itemMenu.kind === "system") {
                                            handleMoveSystem(itemMenu.id, -1);
                                        } else handleMoveApp(itemMenu.id, -1);
                                    }}
                                >
                                    <PreviousIcon
                                        size="1em"
                                        className="icon-md"
                                        aria-hidden="true"
                                    />
                                    {vertical ? "向上移动" : "向左移动"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={menuIndex === menuCount - 1}
                                    onClick={() => {
                                        if (itemMenu.kind === "system") {
                                            handleMoveSystem(itemMenu.id, 1);
                                        } else handleMoveApp(itemMenu.id, 1);
                                    }}
                                >
                                    <NextIcon
                                        size="1em"
                                        className="icon-md"
                                        aria-hidden="true"
                                    />
                                    {vertical ? "向下移动" : "向右移动"}
                                </DropdownMenuItem>
                                {menuApp && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            aria-label="取消任务栏固定"
                                            onClick={() => {
                                                closeItemMenu();
                                                void setPinned(
                                                    menuApp.id,
                                                    false,
                                                );
                                            }}
                                        >
                                            <PinOff
                                                size="1em"
                                                className="icon-md"
                                                aria-hidden="true"
                                            />
                                            取消固定
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuPopup>
                        </DropdownMenuPositioner>
                    </DropdownMenuPortal>
                </DropdownMenu>
            )}
            <Dialog open={windowListOpen} onOpenChange={setWindowListOpen}>
                <DialogContent
                    aria-label="窗口列表"
                    className="dock-management"
                >
                    <DialogHeader className="dock-management-header">
                        <DialogTitle>窗口列表</DialogTitle>
                        <DialogClose
                            render={
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label="关闭窗口列表"
                                />
                            }
                        >
                            <X
                                size="1em"
                                className="icon-md"
                                aria-hidden="true"
                            />
                        </DialogClose>
                    </DialogHeader>
                    <div className="dock-management-content">
                        {windowManager?.windows.length
                            ? windowManager.windows.map((item) => {
                                const label = DOCK_SYSTEM_ITEMS[item.id].label;
                                const status =
                                    windowManager.activeId === item.id
                                        ? "当前窗口"
                                        : item.status === "minimized"
                                        ? "已最小化"
                                        : "已打开";
                                return (
                                    <div
                                        className="dock-window-row"
                                        key={item.id}
                                    >
                                        <span>{label}（{status}）</span>
                                        <div className="dock-window-actions">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                aria-label={`${
                                                    item.status === "minimized"
                                                        ? "恢复"
                                                        : "激活"
                                                } ${label}`}
                                                onClick={() => {
                                                    windowManager.activate(
                                                        item.id,
                                                    );
                                                    setWindowListOpen(false);
                                                }}
                                            >
                                                {item.status === "minimized"
                                                    ? "恢复"
                                                    : "激活"}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                aria-label={`关闭 ${label}`}
                                                onClick={() =>
                                                    windowManager.close(
                                                        item.id,
                                                    )}
                                            >
                                                关闭
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })
                            : <p>没有打开的窗口</p>}
                    </div>
                </DialogContent>
            </Dialog>
            {/* Management Dialog */}
            <Dialog open={managementOpen} onOpenChange={setManagementOpen}>
                <DialogContent
                    aria-label="管理任务栏"
                    className="dock-management"
                    data-dock-modal="management"
                >
                    <DialogHeader className="dock-management-header">
                        <DialogTitle>任务栏</DialogTitle>
                        <DialogClose
                            render={
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label="关闭"
                                />
                            }
                        >
                            <X
                                size="1em"
                                className="icon-md"
                                aria-hidden="true"
                            />
                        </DialogClose>
                    </DialogHeader>
                    <div className="dock-management-content">
                        {!isMobile && (
                            <div className="dock-management-layout">
                                <div className="dock-management-row">
                                    <span className="dock-management-label">
                                        位置
                                    </span>
                                    <RadioGroup
                                        variant="segmented"
                                        value={layout.edge}
                                        onValueChange={(value) =>
                                            setLayout({
                                                edge: value as DockEdge,
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
                            </div>
                        )}
                        <section className="dock-management-section">
                            <h4 className="dock-management-heading">
                                系统入口
                            </h4>
                            {preferences.systemOrder.map((id) => {
                                const { label, icon: Icon } =
                                    DOCK_SYSTEM_ITEMS[id];
                                return (
                                    <div
                                        className="dock-management-system-row"
                                        key={id}
                                    >
                                        <span className="dock-management-system-label">
                                            <Icon
                                                size="1em"
                                                className="icon-md"
                                                aria-hidden="true"
                                            />
                                            {label}
                                        </span>
                                        <Switch
                                            checked={!preferences
                                                .hiddenSystemIds.includes(id)}
                                            onCheckedChange={(visible) =>
                                                void setSystemVisible(
                                                    id,
                                                    visible,
                                                )}
                                            aria-label={`显示 ${label}`}
                                            data-dock-system-toggle={id}
                                        />
                                    </div>
                                );
                            })}
                        </section>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
