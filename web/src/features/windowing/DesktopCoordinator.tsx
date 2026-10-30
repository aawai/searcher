import {
    createContext,
    lazy,
    type ReactNode,
    Suspense,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Link, useNavigationType } from "react-router-dom";
import { DesktopHost } from "../../app/SearchHome.tsx";
import type { AppOutletContext } from "../../app/outlet-context.ts";
import { useNavigationPending } from "../../app/navigation-guards.tsx";
import { type PageHost, usePagePresenter } from "../../app/page-host.tsx";
import {
    RouteErrorBoundary,
    RouteLoadingFallback,
} from "../../app/RouteErrorBoundary.tsx";
import { routes } from "../../app/routes.ts";
import { useAppState } from "../../app/state.tsx";
import { useEscapeLayerStack } from "../../components/ui/escape-layer-stack.tsx";
import { BREAKPOINTS } from "../../design-system/breakpoints.ts";
import { WindowFrame } from "./WindowFrame.tsx";
import { isLibraryWindow, type LibraryWindows } from "./library-windows.ts";
import {
    type CloseGuard,
    type WindowId,
    type WindowManager,
    WindowManagerContext,
} from "./window-context.tsx";
import {
    locationUrl,
    type PendingWindowAction,
    stateForLocation,
    windowForLocation,
    type WindowState,
    windowUrl,
} from "./window-state.ts";

const SettingsContent = lazy(() =>
    import("../../app/SettingsPage.tsx").then((module) => ({
        default: module.SettingsContent,
    }))
);
const AccountContent = lazy(() =>
    import("../../app/AccountPage.tsx").then((module) => ({
        default: module.AccountContent,
    }))
);
const TrashContent = lazy(() =>
    import("../../app/TrashPage.tsx").then((module) => ({
        default: module.TrashContent,
    }))
);

const WINDOW_IDS: readonly WindowId[] = ["apps", "notes", "settings", "trash"];
const WINDOW_TITLES: Record<WindowId, string> = {
    apps: "应用",
    notes: "笔记",
    settings: "设置",
    trash: "回收站",
};
const DEFAULT_WIDTHS: Record<WindowId, number> = {
    apps: 640,
    notes: 960,
    settings: 840,
    trash: 880,
};

/** The history entry that opening the anchored apps window pushed. */
interface OpenEntry {
    key: string;
    index: number | null;
    fromUrl: string;
}

type DesktopFocus = "search" | "opener" | null;

function historyIndex(): number | null {
    const state: unknown = globalThis.history?.state;
    if (!state || typeof state !== "object" || !("idx" in state)) return null;
    return typeof state.idx === "number" ? state.idx : null;
}

/** Tablet and phone present one window at a time, so nothing is "outside". */
function isWideViewport(): boolean {
    return globalThis.innerWidth >= BREAKPOINTS.wide;
}

interface StageValue {
    host: PageHost;
    aiModels: AppOutletContext["aiModels"];
    state: WindowState;
    manager: WindowManager;
    widths: Record<WindowId, number>;
    setWidth: (id: WindowId, width: number) => void;
}

const StageContext = createContext<StageValue | null>(null);

/** A session owns one desktop and one instance of each window. */
export function DesktopCoordinator(
    { aiModels, children }: {
        aiModels: AppOutletContext["aiModels"];
        children: ReactNode;
    },
) {
    const { user, ready, authSession } = useAppState();
    const epoch = useRef({ session: authSession, value: 0 });
    if (epoch.current.session !== authSession) {
        epoch.current = {
            session: authSession,
            value: epoch.current.value + 1,
        };
    }
    if (!user || !ready) {
        return (
            <WindowManagerContext value={null}>
                <StageContext value={null}>{children}</StageContext>
            </WindowManagerContext>
        );
    }
    return (
        <WindowSession key={epoch.current.value} aiModels={aiModels}>
            {children}
        </WindowSession>
    );
}

function WindowSession(
    { aiModels, children }: {
        aiModels: AppOutletContext["aiModels"];
        children: ReactNode;
    },
) {
    const host = usePagePresenter();
    const { location, navigate } = host;
    const navigationType = useNavigationType();
    const navigationPending = useNavigationPending();
    const escapeStack = useEscapeLayerStack();
    const [state, setState] = useState<WindowState>(() =>
        stateForLocation(
            { windows: [], activeId: null },
            location,
            null,
            isWideViewport(),
        )
    );
    const [windowListOpen, setWindowListOpen] = useState(false);
    const [widths, setWidths] = useState<Record<WindowId, number>>(
        DEFAULT_WIDTHS,
    );
    const stateRef = useRef(state);
    stateRef.current = state;
    const locationRef = useRef(location);
    locationRef.current = location;
    const previousLocation = useRef(location);
    const pending = useRef<PendingWindowAction | null>(null);
    const focusDesktop = useRef<DesktopFocus>(null);
    const openEntry = useRef<OpenEntry | null>(null);
    /** A history move is in flight; later activations wait for it to land. */
    const moving = useRef(false);
    const afterNavigation = useRef<(() => void) | null>(null);
    const closeGuards = useRef(new Map<WindowId, CloseGuard>());
    const desktopFocus = useRef<(() => HTMLElement | null) | null>(null);
    const collapsing = useRef(false);

    useLayoutEffect(() => {
        const previous = previousLocation.current;
        previousLocation.current = location;
        const action = pending.current;
        if (action && action.sourceKey !== location.key) pending.current = null;
        if (
            navigationType === "PUSH" &&
            windowForLocation(location) === "apps" &&
            windowForLocation(previous) !== "apps"
        ) {
            openEntry.current = {
                key: location.key,
                index: historyIndex(),
                fromUrl: locationUrl(previous),
            };
        }
        setState((current) =>
            stateForLocation(current, location, action, isWideViewport())
        );
        const focus = focusDesktop.current;
        if (focus && location.pathname === routes.home && !location.search) {
            focusDesktop.current = null;
            requestAnimationFrame(() => {
                const target = focus === "opener"
                    ? desktopFocus.current?.()
                    : null;
                (target ?? document.getElementById("search-query"))?.focus();
            });
        } else if (location.pathname !== routes.home) {
            focusDesktop.current = null;
        }
        moving.current = false;
        const queued = afterNavigation.current;
        afterNavigation.current = null;
        queued?.();
    }, [location, navigationType]);

    /** Run `action` now, or once an in-flight history move has landed. */
    const whenIdle = useCallback((action: () => void) => {
        if (moving.current) afterNavigation.current = action;
        else action();
    }, []);

    const destination = useCallback((id: WindowId) => {
        const record = stateRef.current.windows.find((window) =>
            window.id === id
        );
        return record ? locationUrl(record.location) : windowUrl(id);
    }, []);

    const activate = useCallback((id: WindowId) => {
        if (
            navigationPending ||
            windowForLocation(locationRef.current) === id
        ) return;
        whenIdle(() => {
            pending.current = null;
            navigate(destination(id));
        });
    }, [destination, navigate, navigationPending, whenIdle]);

    const showDesktop = useCallback(() => {
        // A collapse in this same press already decided where to go.
        if (navigationPending || collapsing.current) return;
        const current = locationRef.current;
        if (
            current.pathname === routes.home && !current.search && !current.hash
        ) return;
        whenIdle(() => {
            pending.current = null;
            focusDesktop.current = "search";
            navigate(routes.home);
        });
    }, [navigate, navigationPending, whenIdle]);

    const leaveWindow = useCallback(
        (
            id: WindowId,
            kind: "minimize" | "close",
            focus: DesktopFocus = isLibraryWindow(id) ? "opener" : "search",
        ) => {
            if (navigationPending) return;
            const current = stateRef.current;
            const record = current.windows.find((window) => window.id === id);
            if (!record) return;
            if (windowForLocation(locationRef.current) !== id) {
                setState((previous) => ({
                    ...previous,
                    windows: kind === "close"
                        ? previous.windows.filter((window) => window.id !== id)
                        : previous.windows.map((window) =>
                            window.id === id
                                ? { ...window, status: "minimized" as const }
                                : window
                        ),
                }));
                return;
            }
            const next = [...current.windows].reverse().find((window) =>
                window.id !== id && window.status === "visible"
            );
            const target = next ? locationUrl(next.location) : routes.home;
            pending.current = {
                kind,
                id,
                target,
                sourceKey: locationRef.current.key,
            };
            focusDesktop.current = next ? null : focus;
            // An anchored transient adds no history of its own: collapsing it
            // undoes the entry that opened it when that entry is still on top,
            // and otherwise replaces it.
            if (record.anchored && id === "apps") {
                const entry = openEntry.current;
                openEntry.current = null;
                if (
                    entry && entry.key === locationRef.current.key &&
                    entry.index !== null && entry.index === historyIndex() &&
                    entry.fromUrl === target
                ) {
                    moving.current = true;
                    navigate(-1);
                    return;
                }
                navigate(target, { replace: true });
                return;
            }
            navigate(target);
        },
        [navigate, navigationPending],
    );

    const minimize = useCallback(
        (id: WindowId) => leaveWindow(id, "minimize"),
        [leaveWindow],
    );
    const close = useCallback(
        (id: WindowId, options?: { confirmed?: boolean }) => {
            if (!options?.confirmed && closeGuards.current.get(id)?.()) return;
            leaveWindow(id, "close");
        },
        [leaveWindow],
    );
    const open = useCallback((id: WindowId) => {
        const current = stateRef.current;
        const record = current.windows.find((window) => window.id === id);
        if (
            record?.anchored && record.status === "visible" &&
            current.activeId === id && isWideViewport()
        ) {
            minimize(id);
            return;
        }
        activate(id);
    }, [activate, minimize]);
    const detach = useCallback((id: WindowId) => {
        if (id === "apps") openEntry.current = null;
        setState((previous) =>
            previous.windows.some((window) =>
                    window.id === id && window.anchored
                )
                ? {
                    ...previous,
                    windows: previous.windows.map((window) =>
                        window.id === id
                            ? { ...window, anchored: false }
                            : window
                    ),
                }
                : previous
        );
    }, []);
    const registerCloseGuard = useCallback(
        (id: WindowId, guard: CloseGuard) => {
            closeGuards.current.set(id, guard);
            return () => {
                if (closeGuards.current.get(id) === guard) {
                    closeGuards.current.delete(id);
                }
            };
        },
        [],
    );
    const registerDesktopFocus = useCallback(
        (target: () => HTMLElement | null) => {
            desktopFocus.current = target;
            return () => {
                if (desktopFocus.current === target) {
                    desktopFocus.current = null;
                }
            };
        },
        [],
    );
    const setWidth = useCallback((id: WindowId, width: number) => {
        setWidths((previous) =>
            previous[id] === width ? previous : { ...previous, [id]: width }
        );
    }, []);

    // An anchored apps window behaves like a start menu: a press anywhere
    // outside it collapses it. Dock entries and other windows decide by their
    // own activation, and overlays opened from the window count as inside it.
    useEffect(() => {
        const collapse = (event: PointerEvent) => {
            if (event.button !== 0 || !(event.target instanceof Element)) {
                return;
            }
            const current = stateRef.current;
            const record = current.windows.find((window) =>
                window.id === "apps"
            );
            if (
                current.activeId !== "apps" || record?.status !== "visible" ||
                !record.anchored || !isWideViewport() ||
                windowForLocation(locationRef.current) !== "apps" ||
                escapeStack.hasLayer("overlay")
            ) return;
            if (
                event.target.closest(
                    ".window-frame, [data-dock-id], .undo-toast, .status-banner",
                )
            ) return;
            // The desktop's own press handler sees this event next and must not
            // also navigate: the collapse already decided where to go.
            collapsing.current = true;
            setTimeout(() => {
                collapsing.current = false;
            }, 0);
            leaveWindow("apps", "minimize", null);
        };
        document.addEventListener("pointerdown", collapse, true);
        return () =>
            document.removeEventListener("pointerdown", collapse, true);
    }, [escapeStack, leaveWindow]);

    const manager: WindowManager = {
        windows: state.windows.map(({ id, status }) => ({ id, status })),
        activeId: state.activeId,
        windowListOpen,
        setWindowListOpen,
        open,
        activate,
        minimize,
        close,
        showDesktop,
        detach,
        registerCloseGuard,
        registerDesktopFocus,
    };
    return (
        <WindowManagerContext value={manager}>
            <StageContext
                value={{ host, aiModels, state, manager, widths, setWidth }}
            >
                {children}
            </StageContext>
        </WindowManagerContext>
    );
}

/** Rendered once inside the application shell; independent routes hide, not unmount it. */
export function DesktopStage() {
    const stage = useContext(StageContext);
    if (!stage) return null;
    return <ActiveDesktopStage {...stage} />;
}

function ActiveDesktopStage(
    { host, aiModels, state, manager, widths, setWidth }: StageValue,
) {
    const { location } = host;
    const currentId = windowForLocation(location);
    const isHome = location.pathname === routes.home;
    const visible = isHome || currentId !== null;
    const desktopHost: PageHost = { ...host, active: isHome && !currentId };
    const [nodes, setNodes] = useState<Record<string, HTMLElement | null>>({});
    // Stable ref callbacks: a changing identity would re-run them every render.
    const mounts = useMemo(() => {
        const mount = (key: string) => (node: HTMLElement | null) =>
            setNodes((previous) =>
                previous[key] === node ? previous : { ...previous, [key]: node }
            );
        return {
            "apps:content": mount("apps:content"),
            "apps:toolbar": mount("apps:toolbar"),
            "notes:content": mount("notes:content"),
            "notes:toolbar": mount("notes:toolbar"),
        };
    }, []);
    const libraryWindows = Object.fromEntries(
        (["apps", "notes"] as const).map((id) => {
            const record = state.windows.find((window) => window.id === id);
            return [
                id,
                record
                    ? {
                        node: nodes[`${id}:content`] ?? null,
                        toolbar: nodes[`${id}:toolbar`] ?? null,
                        minimized: record.status === "minimized",
                        active: visible && currentId === id &&
                            record.status === "visible",
                        narrow: widths[id] < BREAKPOINTS.medium,
                    }
                    : null,
            ];
        }),
    ) as LibraryWindows;
    const order = [...WINDOW_IDS].sort((a, b) =>
        state.windows.findIndex((window) => window.id === a) -
        state.windows.findIndex((window) => window.id === b)
    );
    return (
        <>
            <div
                hidden={!visible}
                onPointerDownCapture={(event) => {
                    // Portaled window content and dialogs bubble through React
                    // to here; only a press on the desktop itself returns to it.
                    if (
                        currentId &&
                        event.currentTarget.contains(event.target as Node)
                    ) manager.showDesktop();
                }}
            >
                <DesktopHost
                    host={desktopHost}
                    libraryWindows={libraryWindows}
                    aiModels={aiModels}
                />
            </div>
            <div hidden={!visible}>
                {order.map((id) => {
                    const record = state.windows.find((window) =>
                        window.id === id
                    );
                    const active = visible && currentId === id &&
                        record?.status === "visible";
                    const localHost: PageHost = {
                        ...host,
                        inWindow: true,
                        location: record?.location ?? location,
                        Link,
                        narrow: widths[id] < BREAKPOINTS.medium,
                        active: Boolean(active),
                    };
                    return (
                        <WindowFrame
                            key={id}
                            id={id}
                            title={WINDOW_TITLES[id]}
                            open={Boolean(record)}
                            minimized={record?.status === "minimized"}
                            active={Boolean(active)}
                            anchorTo={id === "apps" && record?.anchored
                                ? "apps"
                                : undefined}
                            onActivate={() => manager.activate(id)}
                            onMinimize={() => manager.minimize(id)}
                            onClose={() => manager.close(id)}
                            onDetach={() => manager.detach(id)}
                            onHostWidthChange={(width) => setWidth(id, width)}
                            libraryView={isLibraryWindow(id) ? id : undefined}
                            toolbarRef={isLibraryWindow(id)
                                ? mounts[`${id}:toolbar`]
                                : undefined}
                        >
                            {isLibraryWindow(id)
                                ? (
                                    <div
                                        ref={mounts[`${id}:content`]}
                                        className="window-frame__slot"
                                    />
                                )
                                : (
                                    <RouteErrorBoundary
                                        locationKey={localHost.location
                                            .pathname}
                                    >
                                        <Suspense
                                            fallback={<RouteLoadingFallback />}
                                        >
                                            {id === "trash"
                                                ? (
                                                    <TrashContent
                                                        host={localHost}
                                                    />
                                                )
                                                : localHost.location
                                                        .pathname ===
                                                        routes.account
                                                ? (
                                                    <AccountContent
                                                        host={localHost}
                                                    />
                                                )
                                                : (
                                                    <SettingsContent
                                                        host={localHost}
                                                    />
                                                )}
                                        </Suspense>
                                    </RouteErrorBoundary>
                                )}
                        </WindowFrame>
                    );
                })}
            </div>
        </>
    );
}
