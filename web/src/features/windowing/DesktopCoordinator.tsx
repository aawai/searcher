import {
    createContext,
    lazy,
    type ReactNode,
    Suspense,
    useCallback,
    useContext,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Link,
    type Location,
    type NavigateFunction,
    type NavigateOptions,
    parsePath,
    type To,
    useNavigationType,
} from "react-router-dom";
import { DesktopHost } from "../../app/SearchHome.tsx";
import type { AppOutletContext } from "../../app/outlet-context.ts";
import { useNavigationPending } from "../../app/navigation-guards.tsx";
import { type PageHost, usePagePresenter } from "../../app/page-host.tsx";
import {
    RouteErrorBoundary,
    RouteLoadingFallback,
} from "../../app/RouteErrorBoundary.tsx";
import { askConversationId, routes } from "../../app/routes.ts";
import { useAppState } from "../../app/state.tsx";
import {
    BREAKPOINTS,
    hasPersistentNotesSidebar,
} from "../../design-system/breakpoints.ts";
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

const SettingsWindowContent = lazy(() =>
    import("../../app/SettingsWindowContent.tsx").then((module) => ({
        default: module.SettingsWindowContent,
    }))
);
const TrashContent = lazy(() =>
    import("../../app/TrashPage.tsx").then((module) => ({
        default: module.TrashContent,
    }))
);
const AskContent = lazy(() =>
    import("../../app/AskPage.tsx").then((module) => ({
        default: module.AskContent,
    }))
);

const WINDOW_IDS: readonly WindowId[] = [
    "apps",
    "notes",
    "ai",
    "settings",
    "trash",
];
const WINDOW_TITLES: Record<WindowId, string> = {
    apps: "应用",
    notes: "笔记",
    ai: "AI 问答",
    settings: "设置",
    trash: "回收站",
};
const DEFAULT_WIDTHS: Record<WindowId, number> = {
    apps: 640,
    notes: 960,
    ai: 960,
    settings: 840,
    trash: 880,
};

type DesktopFocus = "search" | "opener" | null;

interface StageValue {
    host: PageHost;
    aiModels: AppOutletContext["aiModels"];
    state: WindowState;
    manager: WindowManager;
    widths: Record<WindowId, number>;
    setWidth: (id: WindowId, width: number) => void;
    /** Navigation for a window's content; see `WindowSession.navigateWindow`. */
    navigateWindow: (id: WindowId) => NavigateFunction;
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
    const [state, setState] = useState<WindowState>(() =>
        stateForLocation(
            { windows: [], activeId: null },
            location,
            null,
        )
    );
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
    const closeGuards = useRef(new Map<WindowId, CloseGuard>());
    const desktopFocus = useRef<(() => HTMLElement | null) | null>(null);
    /**
     * A conversation that got its id while its window was in the background
     * has no history entry of its own: remember which entry was current, so
     * returning to it by Back or Forward lands on the conversation again.
     */
    const askEntries = useRef(new Map<string, { from: string; to: string }>());

    useLayoutEffect(() => {
        const previous = previousLocation.current;
        previousLocation.current = location;
        const action = pending.current;
        if (action && action.sourceKey !== location.key) pending.current = null;
        const askEntry = navigationType === "POP" &&
                windowForLocation(location) === "ai" &&
                stateRef.current.windows.some((window) => window.id === "ai")
            ? askEntries.current.get(location.key)
            : undefined;
        // Returning to the entry where a background conversation was named:
        // show that conversation at once, so the window never flashes a new one.
        const aligned = askEntry && askEntry.from === locationUrl(location)
            ? askEntry
            : undefined;
        if (aligned) navigate(aligned.to, { replace: true });
        const shown: Location = aligned
            ? { ...location, ...parsePath(aligned.to), state: null }
            : location;
        setState((current) => stateForLocation(current, shown, action));
        // Back from the AI window by history or a link also lands in the search box.
        if (
            !focusDesktop.current && windowForLocation(previous) === "ai" &&
            location.pathname === routes.home && !location.search
        ) focusDesktop.current = "search";
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
    }, [location, navigationType]);

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
        pending.current = null;
        navigate(destination(id));
    }, [destination, navigate, navigationPending]);

    const showDesktop = useCallback(() => {
        if (navigationPending) return;
        const current = locationRef.current;
        if (
            current.pathname === routes.home && !current.search && !current.hash
        ) return;
        pending.current = null;
        focusDesktop.current = "search";
        navigate(routes.home);
    }, [navigate, navigationPending]);

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
    /** Dock/command entry: the focused window collapses, any other is shown. */
    const open = useCallback((id: WindowId) => {
        const current = stateRef.current;
        const record = current.windows.find((window) => window.id === id);
        if (record?.status === "visible" && current.activeId === id) {
            minimize(id);
            return;
        }
        activate(id);
    }, [activate, minimize]);
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
    /**
     * A window's own navigation. A conversation that is named while the AI
     * window is in the background only updates that window's local address:
     * it must not change the page address or take the focus.
     */
    const windowNavigation = useMemo(() => {
        const make =
            (id: WindowId): NavigateFunction =>
            (to: To | number, options?: NavigateOptions) => {
                if (typeof to === "number") return navigate(to);
                const record = stateRef.current.windows.find((window) =>
                    window.id === id
                );
                if (
                    id !== "ai" || !record || !options?.replace ||
                    windowForLocation(locationRef.current) === id
                ) return navigate(to, options);
                const target = typeof to === "string" ? parsePath(to) : to;
                const next: Location = {
                    ...record.location,
                    pathname: target.pathname ?? record.location.pathname,
                    search: target.search ?? "",
                    hash: target.hash ?? "",
                    state: options.state ?? null,
                };
                if (windowForLocation(next) !== id) {
                    return navigate(to, options);
                }
                const key = record.location.key;
                askEntries.current.set(key, {
                    from: askEntries.current.get(key)?.from ??
                        locationUrl(record.location),
                    to: locationUrl(next),
                });
                setState((current) => ({
                    ...current,
                    windows: current.windows.map((window) =>
                        window.id === id
                            ? { ...window, location: next }
                            : window
                    ),
                }));
            };
        return {
            apps: make("apps"),
            notes: make("notes"),
            ai: make("ai"),
            settings: make("settings"),
            trash: make("trash"),
        } satisfies Record<WindowId, NavigateFunction>;
    }, [navigate]);
    const navigateWindow = useCallback(
        (id: WindowId) => windowNavigation[id],
        [windowNavigation],
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

    const manager: WindowManager = {
        windows: state.windows.map(({ id, status }) => ({ id, status })),
        activeId: state.activeId,
        open,
        activate,
        minimize,
        close,
        showDesktop,
        registerCloseGuard,
        registerDesktopFocus,
    };
    return (
        <WindowManagerContext value={manager}>
            <StageContext
                value={{
                    host,
                    aiModels,
                    state,
                    manager,
                    widths,
                    setWidth,
                    navigateWindow,
                }}
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
    {
        host,
        aiModels,
        state,
        manager,
        widths,
        setWidth,
        navigateWindow,
    }: StageValue,
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
                        hostWidth: widths[id],
                        persistentSidebar: hasPersistentNotesSidebar(
                            widths[id],
                        ),
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
                        navigate: navigateWindow(id),
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
                            anchorTo={id === "apps" ? "apps" : undefined}
                            onActivate={() => manager.activate(id)}
                            onMinimize={() => manager.minimize(id)}
                            onClose={() => manager.close(id)}
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
                                        locationKey={id === "ai"
                                            ? id
                                            : localHost.location.pathname}
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
                                                : id === "ai"
                                                ? (
                                                    <AskContent
                                                        host={localHost}
                                                        routeId={askConversationId(
                                                            localHost.location
                                                                .pathname,
                                                        ) ?? undefined}
                                                    />
                                                )
                                                : (
                                                    <SettingsWindowContent
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
