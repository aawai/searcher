import {
    createContext,
    type ReactNode,
    type RefObject,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import {
    type Blocker,
    type BlockerFunction,
    useBlocker,
    useLocation,
    useNavigationType,
} from "react-router-dom";

/** A guard decides whether this particular navigation destroys its content. */
export type NavigationIntent = Parameters<BlockerFunction>[0];

export interface NavigationGuard {
    blocks: (intent: NavigationIntent) => boolean;
    warnOnUnload: () => boolean;
    /** Discard approved content only after the destination has been reached. */
    onCommit?: () => void;
}

export interface BlockedNavigation {
    readonly location: NavigationIntent["nextLocation"];
    /** Approve the intent without mutating content; other owners may still cancel. */
    proceed: () => void;
    reset: () => void;
}

type GuardRef = RefObject<NavigationGuard>;
type BlockedRouterNavigation = Extract<Blocker, { state: "blocked" }>;
type Pending = {
    intent: NavigationIntent;
    owners: symbol[];
    index: number;
    approved: Array<() => void>;
    blocker: BlockedRouterNavigation;
};

type ContextValue = {
    register: (id: symbol, guard: GuardRef) => () => void;
    pending: Pending | null;
    proceed: () => void;
    reset: () => void;
};

const NavigationGuardContext = createContext<ContextValue | null>(null);

/** Owns the router's only blocker and serializes decisions from content owners. */
export function NavigationGuardProvider({ children }: { children: ReactNode }) {
    const guards = useRef(new Map<symbol, GuardRef>());
    const candidate = useRef<
        {
            intent: NavigationIntent;
            owners: symbol[];
        } | null
    >(null);
    const current = useRef<Pending | null>(null);
    const committed = useRef<
        {
            intent: NavigationIntent;
            callbacks: Array<() => void>;
        } | null
    >(null);
    const location = useLocation();
    const navigationType = useNavigationType();
    const [pending, setPending] = useState<Pending | null>(null);

    const blocker = useBlocker((intent) => {
        // A later navigation cannot replace an intent already awaiting approval.
        if (candidate.current) return true;
        const owners = [...guards.current].filter(([, guard]) =>
            guard.current.blocks(intent)
        ).map(([id]) => id);
        if (!owners.length) return false;
        candidate.current = { intent, owners };
        return true;
    });

    useLayoutEffect(() => {
        const next = committed.current;
        if (!next) return;
        committed.current = null;
        const target = next.intent.nextLocation;
        const reached = navigationType === next.intent.historyAction &&
            (navigationType === "POP"
                ? location.key === target.key
                : location.pathname === target.pathname &&
                    location.search === target.search &&
                    location.hash === target.hash);
        if (reached) {
            for (const callback of next.callbacks) callback();
        }
    }, [location, navigationType]);

    useEffect(() => {
        if (blocker.state === "blocked") {
            if (!current.current && candidate.current) {
                const next = {
                    ...candidate.current,
                    index: 0,
                    blocker,
                    approved: [],
                };
                current.current = next;
                setPending(next);
            }
        } else if (current.current) {
            current.current = null;
            candidate.current = null;
            setPending(null);
        }
    }, [blocker]);

    const reset = useCallback(() => {
        const previous = current.current;
        if (!previous) return;
        current.current = null;
        candidate.current = null;
        setPending(null);
        previous.blocker.reset();
    }, []);

    const proceed = useCallback(() => {
        const previous = current.current;
        if (!previous) return;
        const callback = guards.current.get(previous.owners[previous.index])
            ?.current.onCommit;
        const approved = callback
            ? [...previous.approved, callback]
            : previous.approved;
        let index = previous.index + 1;
        while (index < previous.owners.length) {
            const guard = guards.current.get(previous.owners[index]);
            if (guard?.current.blocks(previous.intent)) break;
            index++;
        }
        if (index < previous.owners.length) {
            const next = { ...previous, index, approved };
            current.current = next;
            setPending(next);
            return;
        }
        committed.current = {
            intent: previous.intent,
            callbacks: approved,
        };
        current.current = null;
        candidate.current = null;
        setPending(null);
        previous.blocker.proceed();
    }, []);

    const register = useCallback((id: symbol, guard: GuardRef) => {
        guards.current.set(id, guard);
        return () => {
            guards.current.delete(id);
            // Losing an owner while it is deciding must not approve its intent.
            if (current.current?.owners[current.current.index] === id) reset();
        };
    }, [reset]);

    useEffect(() => {
        function preventUnload(event: BeforeUnloadEvent) {
            for (const guard of guards.current.values()) {
                if (guard.current.warnOnUnload()) {
                    event.preventDefault();
                    event.returnValue = "";
                    return;
                }
            }
        }
        globalThis.addEventListener("beforeunload", preventUnload);
        return () =>
            globalThis.removeEventListener("beforeunload", preventUnload);
    }, []);

    return (
        <NavigationGuardContext.Provider
            value={{ register, pending, proceed, reset }}
        >
            {children}
        </NavigationGuardContext.Provider>
    );
}

/** Register one owner; the returned intent is present only while it decides. */
export function useNavigationGuard(
    guard: NavigationGuard,
): BlockedNavigation | null {
    const context = useContext(NavigationGuardContext);
    if (!context) throw new Error("NavigationGuardProvider is required");
    const id = useRef(Symbol("navigation-guard"));
    const latest = useRef(guard);
    latest.current = guard;
    const { register, pending, proceed, reset } = context;
    useLayoutEffect(() => register(id.current, latest), [register]);
    if (!pending || pending.owners[pending.index] !== id.current) return null;
    return { location: pending.intent.nextLocation, proceed, reset };
}
