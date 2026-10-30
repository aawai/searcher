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
    type BlockerFunction,
    NavigationType,
    useBlocker,
    useLocation,
    useNavigate,
    useNavigationType,
} from "react-router-dom";

/** A guard decides whether this particular navigation destroys its content. */
export type NavigationIntent = Parameters<BlockerFunction>[0];

/** The location key of the synthetic intent that stands for signing out. */
export const DESTRUCTIVE_ACTION_KEY = "destructive-action";

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
type Pending = {
    intent: NavigationIntent;
    owners: symbol[];
    index: number;
    approved: Array<() => void>;
    sourceIndex: number | null;
    targetIndex: number | null;
    historyLength: number;
    collided: boolean;
    action?: () => void;
};

type ContextValue = {
    register: (id: symbol, guard: GuardRef) => () => void;
    pending: Pending | null;
    proceed: () => void;
    reset: () => void;
    requestDestructiveAction: (action: () => void) => void;
};

const NavigationGuardContext = createContext<ContextValue | null>(null);
function historyIndex(): number | null {
    const state: unknown = globalThis.history?.state;
    if (!state || typeof state !== "object" || !("idx" in state)) return null;
    const index = state.idx;
    return typeof index === "number" && Number.isInteger(index) ? index : null;
}

function historyKey(): string | null {
    const state: unknown = globalThis.history?.state;
    if (!state || typeof state !== "object" || !("idx" in state)) return null;
    if (!("key" in state) || state.key === undefined) return "default";
    return typeof state.key === "string" ? state.key : null;
}

/** Owns the router's only blocker and serializes decisions from content owners. */
export function NavigationGuardProvider({ children }: { children: ReactNode }) {
    const guards = useRef(new Map<symbol, GuardRef>());
    const candidate = useRef<
        Pick<
            Pending,
            | "intent"
            | "owners"
            | "sourceIndex"
            | "targetIndex"
            | "historyLength"
            | "collided"
        > | null
    >(null);
    const source = useRef({ key: "", index: historyIndex() });
    const replay = useRef<Pending | null>(null);
    const current = useRef<Pending | null>(null);
    const actionInterrupted = useRef(false);
    const committed = useRef<
        {
            intent: NavigationIntent;
            callbacks: Array<() => void>;
        } | null
    >(null);
    const location = useLocation();
    const navigationType = useNavigationType();
    const navigate = useNavigate();
    const [pending, setPending] = useState<Pending | null>(null);

    const blocker = useBlocker((intent) => {
        if (current.current?.action) {
            actionInterrupted.current = true;
            return true;
        }
        const replaying = replay.current;
        if (replaying) {
            replay.current = null;
            const owners = [...guards.current].filter(([, guard]) =>
                guard.current.blocks(intent)
            ).map(([id]) => id);
            const target = replaying.intent.nextLocation;
            const matches =
                intent.historyAction === replaying.intent.historyAction &&
                intent.currentLocation.key ===
                    replaying.intent.currentLocation.key &&
                (intent.historyAction === "POP"
                    ? intent.nextLocation.key === target.key &&
                        historyKey() === target.key &&
                        historyIndex() === replaying.targetIndex &&
                        globalThis.history.length === replaying.historyLength
                    : intent.nextLocation.pathname === target.pathname &&
                        intent.nextLocation.search === target.search &&
                        intent.nextLocation.hash === target.hash) &&
                owners.length === replaying.owners.length &&
                owners.every((id, index) => id === replaying.owners[index]);
            if (matches) {
                committed.current = {
                    intent: replaying.intent,
                    callbacks: replaying.approved,
                };
                return false;
            }
            return true;
        }
        if (candidate.current) {
            candidate.current.collided = true;
            if (current.current) current.current.collided = true;
            return true;
        }
        const owners = [...guards.current].filter(([, guard]) =>
            guard.current.blocks(intent)
        ).map(([id]) => id);
        if (!owners.length) return false;
        candidate.current = {
            intent,
            owners,
            sourceIndex: source.current.key === intent.currentLocation.key
                ? source.current.index
                : null,
            targetIndex: intent.historyAction === "POP" ? historyIndex() : null,
            historyLength: globalThis.history?.length ?? 0,
            collided: false,
        };
        return true;
    });

    useLayoutEffect(() => {
        source.current = { key: location.key, index: historyIndex() };
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
            if (current.current?.action) {
                blocker.reset();
                actionInterrupted.current = false;
            } else if (!current.current && candidate.current) {
                const next = {
                    ...candidate.current,
                    index: 0,
                    approved: [],
                };
                current.current = next;
                setPending(next);
            } else if (
                !current.current && !candidate.current && !replay.current
            ) {
                blocker.reset();
            }
        } else if (current.current && !current.current.action) {
            current.current = null;
            candidate.current = null;
            setPending(null);
        }
    }, [blocker]);

    const blockerRef = useRef(blocker);
    blockerRef.current = blocker;

    const reset = useCallback(() => {
        const previous = current.current;
        if (!previous) return;
        current.current = null;
        candidate.current = null;
        actionInterrupted.current = false;
        setPending(null);
        if (blockerRef.current.state === "blocked") blockerRef.current.reset();
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
        const owners = [...guards.current].filter(([, guard]) =>
            guard.current.blocks(previous.intent)
        ).map(([id]) => id);
        const guardsMatch = owners.length === previous.owners.length &&
            owners.every((id, ownerIndex) =>
                id === previous.owners[ownerIndex]
            );
        const latest = blockerRef.current;
        const sameTarget = latest.state === "blocked" &&
            latest.location.key === previous.intent.nextLocation.key;
        current.current = null;
        candidate.current = null;
        setPending(null);
        if (previous.action) {
            if (
                !guardsMatch ||
                actionInterrupted.current ||
                source.current.key !== previous.intent.currentLocation.key ||
                (globalThis.history && (
                    previous.sourceIndex === null ||
                    historyIndex() !== previous.sourceIndex ||
                    historyKey() !== previous.intent.currentLocation.key ||
                    globalThis.history.length !== previous.historyLength
                ))
            ) {
                if (latest.state === "blocked") latest.reset();
                return;
            }
            if (latest.state === "blocked") latest.reset();
            for (const commit of approved) commit();
            previous.action();
            return;
        }
        if (!guardsMatch || latest.state !== "blocked") {
            if (latest.state === "blocked") latest.reset();
            return;
        }
        if (
            previous.intent.historyAction === "POP" && globalThis.history &&
            (previous.sourceIndex === null || previous.targetIndex === null ||
                historyIndex() !== previous.sourceIndex ||
                historyKey() !== previous.intent.currentLocation.key ||
                globalThis.history.length !== previous.historyLength)
        ) {
            latest.reset();
            return;
        }
        if (previous.collided || !sameTarget) {
            latest.reset();
            if (source.current.key !== previous.intent.currentLocation.key) {
                return;
            }
            if (previous.intent.historyAction === "POP") {
                if (
                    previous.sourceIndex === null ||
                    previous.targetIndex === null ||
                    previous.sourceIndex === previous.targetIndex ||
                    historyIndex() !== previous.sourceIndex ||
                    globalThis.history.length !== previous.historyLength
                ) return;
                replay.current = { ...previous, approved };
                navigate(previous.targetIndex - previous.sourceIndex);
            } else {
                replay.current = { ...previous, approved };
                const target = previous.intent.nextLocation;
                navigate(target.pathname + target.search + target.hash, {
                    replace: previous.intent.historyAction === "REPLACE",
                    state: target.state,
                });
            }
            return;
        }
        committed.current = { intent: previous.intent, callbacks: approved };
        latest.proceed();
    }, [navigate]);

    const register = useCallback((id: symbol, guard: GuardRef) => {
        guards.current.set(id, guard);
        return () => {
            guards.current.delete(id);
            // Losing an owner while it is deciding must not approve its intent.
            if (current.current?.owners[current.current.index] === id) reset();
        };
    }, [reset]);

    const requestDestructiveAction = useCallback((action: () => void) => {
        if (
            current.current || candidate.current || replay.current ||
            committed.current
        ) return;
        const intent: NavigationIntent = {
            currentLocation: location,
            nextLocation: {
                pathname: "/login",
                search: "",
                hash: "",
                state: null,
                key: DESTRUCTIVE_ACTION_KEY,
            },
            historyAction: NavigationType.Push,
        };
        const owners = [...guards.current].filter(([, guard]) =>
            guard.current.blocks(intent)
        ).map(([id]) => id);
        if (!owners.length) {
            action();
            return;
        }
        const next: Pending = {
            intent,
            owners,
            index: 0,
            approved: [],
            sourceIndex: source.current.index,
            targetIndex: null,
            historyLength: globalThis.history?.length ?? 0,
            collided: false,
            action,
        };
        actionInterrupted.current = false;
        current.current = next;
        setPending(next);
    }, [location]);

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
            value={{
                register,
                pending,
                proceed,
                reset,
                requestDestructiveAction,
            }}
        >
            {children}
        </NavigationGuardContext.Provider>
    );
}

/** True while a guarded navigation is awaiting an owner's decision. */
export function useNavigationPending(): boolean {
    const context = useContext(NavigationGuardContext);
    if (!context) throw new Error("NavigationGuardProvider is required");
    return context.pending !== null;
}

/** Run an identity-changing action after all destructive-content guards agree. */
export function useDestructiveAction(): (action: () => void) => void {
    const context = useContext(NavigationGuardContext);
    if (!context) throw new Error("NavigationGuardProvider is required");
    return context.requestDestructiveAction;
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
