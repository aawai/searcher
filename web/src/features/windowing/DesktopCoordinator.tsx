import {
    createContext,
    lazy,
    type ReactNode,
    Suspense,
    useCallback,
    useContext,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { Link, type Location } from "react-router-dom";
import { DesktopHost } from "../../app/SearchHome.tsx";
import type { AppOutletContext } from "../../app/outlet-context.ts";
import { useNavigationPending } from "../../app/navigation-guards.tsx";
import { type PageHost, usePagePresenter } from "../../app/page-host.tsx";
import {
    RouteErrorBoundary,
    RouteLoadingFallback,
} from "../../app/RouteErrorBoundary.tsx";
import { askConversationId, routes, settingsTab } from "../../app/routes.ts";
import { useAppState } from "../../app/state.tsx";
import { BREAKPOINTS } from "../../design-system/breakpoints.ts";
import { WindowFrame } from "./WindowFrame.tsx";
import {
    type WindowId,
    type WindowManager,
    WindowManagerContext,
} from "./window-context.tsx";

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

interface WindowRecord {
    id: WindowId;
    status: "visible" | "minimized";
    location: Location;
}

interface WindowState {
    /** Least recently used first; DOM order also determines stacking. */
    windows: WindowRecord[];
    activeId: WindowId | null;
}

interface PendingWindowAction {
    kind: "minimize" | "close";
    id: WindowId;
    target: string;
    sourceKey: string;
}

function windowForPath(pathname: string): WindowId | null {
    if (pathname === routes.account || settingsTab(pathname) !== null) {
        return "settings";
    }
    return pathname === routes.trash ? "trash" : null;
}

function isAsk(pathname: string): boolean {
    return pathname === routes.ask || askConversationId(pathname) !== null;
}

function url(location: Pick<Location, "pathname" | "search" | "hash">): string {
    return `${location.pathname}${location.search}${location.hash}`;
}

function stateForLocation(
    state: WindowState,
    location: Location,
    action: PendingWindowAction | null,
): WindowState {
    let windows = state.windows;
    if (
        action && action.sourceKey !== location.key &&
        action.target === url(location)
    ) {
        windows = action.kind === "close"
            ? windows.filter((window) => window.id !== action.id)
            : windows.map((window) =>
                window.id === action.id
                    ? { ...window, status: "minimized" }
                    : window
            );
    }
    const id = windowForPath(location.pathname);
    if (id) {
        const previous = windows.find((window) => window.id === id);
        const current: WindowRecord = {
            id,
            status: "visible",
            location,
        };
        return {
            windows: [
                ...windows.filter((window) => window !== previous),
                current,
            ],
            activeId: id,
        };
    }
    if (location.pathname === routes.home || isAsk(location.pathname)) {
        return {
            windows: windows.map((window) => ({
                ...window,
                status: "minimized",
            })),
            activeId: null,
        };
    }
    // Independent pages hide the desktop without destroying or minimizing it.
    return { windows, activeId: null };
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

/** A session owns one desktop and one instance of each C1 window. */
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
    const navigationPending = useNavigationPending();
    const [state, setState] = useState<WindowState>(() =>
        stateForLocation({ windows: [], activeId: null }, location, null)
    );
    const [windowListOpen, setWindowListOpen] = useState(false);
    const [widths, setWidths] = useState<Record<WindowId, number>>({
        settings: 840,
        trash: 880,
    });
    const stateRef = useRef(state);
    stateRef.current = state;
    const locationRef = useRef(location);
    locationRef.current = location;
    const pending = useRef<PendingWindowAction | null>(null);
    const focusDesktop = useRef(false);

    useLayoutEffect(() => {
        const action = pending.current;
        if (action && action.sourceKey !== location.key) pending.current = null;
        setState((previous) => stateForLocation(previous, location, action));
        if (
            location.pathname === routes.home && !location.search &&
            focusDesktop.current
        ) {
            focusDesktop.current = false;
            requestAnimationFrame(() =>
                document.getElementById("search-query")?.focus()
            );
        } else if (location.pathname !== routes.home) {
            focusDesktop.current = false;
        }
    }, [location]);

    const destination = useCallback((id: WindowId) => {
        const record = stateRef.current.windows.find((window) =>
            window.id === id
        );
        return record
            ? url(record.location)
            : id === "settings"
            ? routes.settings()
            : routes.trash;
    }, []);

    const activate = useCallback((id: WindowId) => {
        if (
            navigationPending ||
            windowForPath(locationRef.current.pathname) === id
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
        focusDesktop.current = true;
        navigate(routes.home);
    }, [navigate, navigationPending]);

    const leaveWindow = useCallback(
        (id: WindowId, kind: "minimize" | "close") => {
            if (navigationPending) return;
            const current = stateRef.current;
            if (!current.windows.some((window) => window.id === id)) return;
            if (windowForPath(locationRef.current.pathname) !== id) {
                setState((previous) => ({
                    ...previous,
                    windows: kind === "close"
                        ? previous.windows.filter((window) => window.id !== id)
                        : previous.windows.map((window) =>
                            window.id === id
                                ? { ...window, status: "minimized" }
                                : window
                        ),
                }));
                return;
            }
            const next = [...current.windows].reverse().find((window) =>
                window.id !== id && window.status === "visible"
            );
            const target = next ? url(next.location) : routes.home;
            pending.current = {
                kind,
                id,
                target,
                sourceKey: locationRef.current.key,
            };
            if (!next) focusDesktop.current = true;
            navigate(target);
        },
        [navigate, navigationPending],
    );

    const minimize = useCallback(
        (id: WindowId) => leaveWindow(id, "minimize"),
        [leaveWindow],
    );
    const close = useCallback((id: WindowId) => leaveWindow(id, "close"), [
        leaveWindow,
    ]);
    const setWidth = useCallback((id: WindowId, width: number) => {
        setWidths((previous) =>
            previous[id] === width ? previous : { ...previous, [id]: width }
        );
    }, []);
    const manager: WindowManager = {
        windows: state.windows.map(({ id, status }) => ({ id, status })),
        activeId: state.activeId,
        windowListOpen,
        setWindowListOpen,
        open: activate,
        activate,
        minimize,
        close,
        showDesktop,
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
    const currentId = windowForPath(location.pathname);
    const isHome = location.pathname === routes.home;
    const visible = isHome || currentId !== null;
    const desktopHost: PageHost = { ...host, active: isHome };
    const view = isHome
        ? new URLSearchParams(location.search).get("view")
        : null;
    const order: WindowId[] = ["settings", "trash"];
    order.sort((a, b) =>
        state.windows.findIndex((window) => window.id === a) -
        state.windows.findIndex((window) => window.id === b)
    );
    return (
        <>
            <div
                hidden={!visible}
                onPointerDownCapture={() => {
                    if (!isHome) manager.showDesktop();
                }}
            >
                <DesktopHost
                    host={desktopHost}
                    view={view}
                    aiModels={aiModels}
                    willDestroyContent={(intent) =>
                        intent.nextLocation.key === "destructive-action" ||
                        (intent.currentLocation.pathname === routes.home &&
                            (intent.currentLocation.pathname !==
                                    intent.nextLocation.pathname ||
                                intent.currentLocation.search !==
                                    intent.nextLocation.search))}
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
                            title={id === "settings" ? "设置" : "回收站"}
                            open={Boolean(record)}
                            minimized={record?.status === "minimized"}
                            active={Boolean(active)}
                            onActivate={() => manager.activate(id)}
                            onMinimize={() => manager.minimize(id)}
                            onClose={() => manager.close(id)}
                            onHostWidthChange={(width) => setWidth(id, width)}
                        >
                            <RouteErrorBoundary
                                locationKey={localHost.location.pathname}
                            >
                                <Suspense fallback={<RouteLoadingFallback />}>
                                    {id === "trash"
                                        ? <TrashContent host={localHost} />
                                        : localHost.location.pathname ===
                                                routes.account
                                        ? <AccountContent host={localHost} />
                                        : <SettingsContent host={localHost} />}
                                </Suspense>
                            </RouteErrorBoundary>
                        </WindowFrame>
                    );
                })}
            </div>
        </>
    );
}
