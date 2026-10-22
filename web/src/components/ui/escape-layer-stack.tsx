import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";

export type EscapeLayerKind = "host" | "overlay";

type EscapeLayer = {
    kind: EscapeLayerKind;
    order: number;
    onEscape?: (event: KeyboardEvent) => void;
};

const LAYER_PRIORITY: Record<EscapeLayerKind, number> = {
    host: 0,
    overlay: 1,
};

/** Tracks active Escape owners; event snapshots keep closing overlays from falling through. */
export class EscapeLayerStack {
    private readonly layers = new Set<EscapeLayer>();
    private readonly eventLayers = new WeakMap<
        KeyboardEvent,
        EscapeLayer | null
    >();
    private readonly dispatchedEvents = new WeakSet<KeyboardEvent>();
    private readonly subscribers = new Set<() => void>();
    private nextOrder = 0;

    subscribe = (listener: () => void): () => void => {
        this.subscribers.add(listener);
        return () => this.subscribers.delete(listener);
    };

    register(
        kind: EscapeLayerKind,
        onEscape?: (event: KeyboardEvent) => void,
    ): () => void {
        const layer: EscapeLayer = { kind, order: this.nextOrder++, onEscape };
        this.layers.add(layer);
        this.notifySubscribers();
        return () => {
            if (this.layers.delete(layer)) this.notifySubscribers();
        };
    }

    capture(event: KeyboardEvent): void {
        if (event.key !== "Escape" || event.isComposing) return;
        this.eventLayers.set(event, this.topLayer());
    }

    dispatch(event: KeyboardEvent): boolean {
        if (
            event.key !== "Escape" || event.isComposing ||
            event.defaultPrevented || this.dispatchedEvents.has(event) ||
            !this.eventLayers.has(event)
        ) return false;

        this.dispatchedEvents.add(event);
        const layer = this.eventLayers.get(event);
        if (!layer) return false;

        event.preventDefault();
        if (layer.onEscape) layer.onEscape(event);
        return true;
    }

    hasLayer(kind?: EscapeLayerKind): boolean {
        if (!kind) return this.layers.size > 0;
        for (const layer of this.layers) {
            if (layer.kind === kind) return true;
        }
        return false;
    }

    private notifySubscribers(): void {
        for (const subscriber of this.subscribers) subscriber();
    }

    private topLayer(): EscapeLayer | null {
        let top: EscapeLayer | null = null;
        for (const layer of this.layers) {
            if (
                !top ||
                LAYER_PRIORITY[layer.kind] > LAYER_PRIORITY[top.kind] ||
                (layer.kind === top.kind && layer.order > top.order)
            ) {
                top = layer;
            }
        }
        return top;
    }
}

const EscapeLayerContext = createContext<EscapeLayerStack | null>(null);

export function EscapeLayerProvider({ children }: { children: ReactNode }) {
    const stackRef = useRef<EscapeLayerStack | null>(null);
    if (!stackRef.current) stackRef.current = new EscapeLayerStack();
    const stack = stackRef.current;

    useEffect(() => {
        const capture = (event: KeyboardEvent) => stack.capture(event);
        const dispatch = (event: KeyboardEvent) => stack.dispatch(event);
        globalThis.addEventListener("keydown", capture, true);
        globalThis.document.addEventListener("keydown", dispatch);
        return () => {
            globalThis.removeEventListener("keydown", capture, true);
            globalThis.document.removeEventListener("keydown", dispatch);
        };
    }, [stack]);

    return (
        <EscapeLayerContext.Provider value={stack}>
            {children}
        </EscapeLayerContext.Provider>
    );
}

export function useEscapeLayer(
    active: boolean,
    onEscape?: (event: KeyboardEvent) => void,
    kind: EscapeLayerKind = "host",
): void {
    const stack = useContext(EscapeLayerContext);
    const onEscapeRef = useRef(onEscape);
    onEscapeRef.current = onEscape;

    useLayoutEffect(() => {
        if (!active) return;
        if (!stack) {
            throw new Error(
                "EscapeLayerProvider is required for active Escape layers",
            );
        }
        return stack.register(kind, (event) => {
            const handler = onEscapeRef.current;
            if (handler) handler(event);
        });
    }, [active, kind, stack]);
}

/** Mirrors primitive state; Base UI owns Escape dismissal. */

export function useEscapeLayerForOpenState<Details>(
    open: boolean | undefined,
    defaultOpen: boolean | undefined,
    onOpenChange: ((open: boolean, details: Details) => void) | undefined,
    kind: EscapeLayerKind = "overlay",
    enabled = true,
): (open: boolean, details: Details) => void {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(
        defaultOpen ?? false,
    );
    useEscapeLayer(enabled && (open ?? uncontrolledOpen), undefined, kind);

    return (nextOpen, details) => {
        if (open === undefined) setUncontrolledOpen(nextOpen);
        onOpenChange?.(nextOpen, details);
    };
}

export function useEscapeLayerStack(): EscapeLayerStack {
    const stack = useContext(EscapeLayerContext);
    if (!stack) {
        throw new Error("EscapeLayerProvider is required to access the stack");
    }
    return stack;
}

export function useEscapeLayerActive(
    kind?: EscapeLayerKind,
): boolean {
    const stack = useEscapeLayerStack();
    const getSnapshot = useCallback(() => stack.hasLayer(kind), [kind, stack]);
    return useSyncExternalStore(
        stack.subscribe,
        getSnapshot,
        getSnapshot,
    );
}
